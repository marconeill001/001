import io
import re
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Company, OwnershipType

router = APIRouter(prefix="/api/import", tags=["import"])

# ─── Column alias mapping ─────────────────────────────────────────────────────
# Maps our internal field names to lists of accepted CSV column header variants
# (all compared lowercase, stripped)

COLUMN_ALIASES: dict[str, list[str]] = {
    "name": [
        "name", "company name", "company", "organization", "organisation",
        "business name", "firm", "entity", "target", "target name",
        "account name", "account", "corp name", "legal name",
        # contact-centric exports (Salesforce, HubSpot, LinkedIn, etc.)
        "contact name", "contact company", "contact organization",
        "contact organisation", "contact account", "contact firm",
        # database / research tool exports
        "issuer name", "issuer", "portfolio company", "investee",
        "deal target", "co. name", "co name", "company / organization",
        "company/organization", "company or organization",
    ],
    "industry": [
        "industry", "sector", "industry sector", "business type",
        "vertical", "market", "sub-industry", "sub industry",
    ],
    "sub_industry": [
        "sub industry", "sub-industry", "sub_industry", "subsector",
        "niche", "category",
    ],
    "revenue_range": [
        "revenue", "revenue range", "annual revenue", "revenues",
        "turnover", "sales", "annual sales", "rev", "revenue ($m)",
        "revenue (m)", "rev range", "revenue size", "ltr", "ltm revenue",
    ],
    "ebitda_range": [
        "ebitda", "ebitda range", "ebitda ($m)", "ebitda (m)",
        "earnings", "operating income", "profit",
    ],
    "employee_count": [
        "employees", "employee count", "headcount", "staff", "# employees",
        "no. employees", "num employees", "workforce", "fte",
        "number of employees", "employees (#)",
    ],
    "ownership_type": [
        "ownership", "ownership type", "type", "ownership structure",
        "shareholder", "owner type", "company type",
    ],
    "geography": [
        "geography", "location", "region", "country", "state",
        "city", "hq", "headquarters", "hq location", "office location",
        "domicile", "market geography",
    ],
    "website": [
        "website", "url", "web", "domain", "homepage", "site",
        "web address", "company url",
    ],
    "description": [
        "description", "notes", "about", "overview", "summary",
        "company description", "business description", "comments",
        "profile", "bio", "company overview",
    ],
    "deal_rationale": [
        "deal rationale", "rationale", "thesis", "investment thesis",
        "deal thesis", "acquisition rationale", "why", "reason",
        "strategic rationale",
    ],
    "source": [
        "source", "lead source", "origin", "referral", "sourced from",
        "origination source", "channel",
    ],
}

# ─── Sector auto-classification ────────────────────────────────────────────────

SECTOR_RULES: list[tuple[str, list[str]]] = [
    ("Financial", [
        "bank", "financ", "insurance", "invest", "asset management",
        "wealth", "credit", "lending", "mortgage", "capital", "fund",
        "equity", "hedge", "brokerage", "fintech", "payment",
    ]),
    ("B&P Services", [
        "consult", "legal", "law", "accounting", "audit", "hr",
        "staffing", "recruiting", "marketing", "advertising", "pr ",
        "public relations", "it service", "managed service", "outsourc",
        "facilities", "real estate", "property", "administration",
        "business service", "professional service",
    ]),
    ("Industry", [
        "manufactur", "industrial", "aerospace", "defense", "chemical",
        "material", "metal", "mining", "energy", "oil", "gas",
        "utility", "construction", "engineering", "automotive", "transport",
        "logistics", "warehouse", "distribution", "agriculture", "food",
        "beverage", "packaging", "paper", "wood", "plastic",
    ]),
    ("Technology", [
        "software", "saas", "tech", "data", "cloud", "cyber", "ai ",
        "artificial intelligence", "iot", "telecom", "semiconductor",
        "hardware", "digital", "platform", "app ", "analytics",
    ]),
    ("Healthcare", [
        "health", "medic", "pharma", "biotech", "hospital", "clinic",
        "dental", "life science", "diagnostic", "device", "wellness",
    ]),
    ("Consumer", [
        "retail", "consumer", "e-commerce", "ecommerce", "fashion",
        "apparel", "beauty", "cosmetic", "luxury", "brand", "restaurant",
        "hospitality", "hotel", "travel", "leisure", "media", "entertainment",
        "sport", "fitness",
    ]),
]


def classify_sector(industry_text: str | None) -> str | None:
    if not industry_text:
        return None
    text = industry_text.lower()
    for sector, keywords in SECTOR_RULES:
        if any(kw in text for kw in keywords):
            return sector
    return None


# ─── Column detection ──────────────────────────────────────────────────────────

def normalise(s: str) -> str:
    return re.sub(r"[\s_\-]+", " ", str(s).strip().lower())


def detect_mapping(columns: list[str]) -> dict[str, str | None]:
    """Return {internal_field: csv_column | None} for each field we care about."""
    norm_to_original = {normalise(c): c for c in columns}
    mapping: dict[str, str | None] = {}
    for field, aliases in COLUMN_ALIASES.items():
        matched = None
        for alias in aliases:
            if alias in norm_to_original:
                matched = norm_to_original[alias]
                break
        mapping[field] = matched
    return mapping


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/preview")
async def preview_import(file: UploadFile = File(...)):
    """Parse the uploaded CSV/Excel and return column mapping + sample rows."""
    content = await file.read()
    filename = file.filename or ""

    try:
        if filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content), dtype=str)
        else:
            df = pd.read_csv(io.BytesIO(content), dtype=str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    df.columns = [str(c).strip() for c in df.columns]
    df = df.where(pd.notna(df), None)

    columns = list(df.columns)
    mapping = detect_mapping(columns)

    # Build sample rows (first 5)
    sample = df.head(5).to_dict(orient="records")

    # Classify sectors for preview if we have an industry column
    ind_col = mapping.get("industry")
    if ind_col:
        for row in sample:
            row["_sector"] = classify_sector(row.get(ind_col))

    # Warnings
    warnings = []
    if not mapping.get("name"):
        warnings.append(
            '"Name" column not found — this is required to import companies. '
            f'Check the CSV has a column called exactly Name. '
            f'Available columns: {", ".join(columns[:10])}'
        )

    return {
        "filename": filename,
        "total_rows": len(df),
        "columns": columns,
        "mapping": mapping,
        "sample": sample,
        "warnings": warnings,
    }


@router.post("/confirm")
async def confirm_import(
    file: UploadFile = File(...),
    mapping_json: str = "",
    db: Session = Depends(get_db),
):
    """Actually import companies using the provided column mapping."""
    import json

    content = await file.read()
    filename = file.filename or ""

    try:
        if filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content), dtype=str)
        else:
            df = pd.read_csv(io.BytesIO(content), dtype=str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    df.columns = [str(c).strip() for c in df.columns]
    df = df.where(pd.notna(df), None)

    try:
        mapping: dict[str, str | None] = json.loads(mapping_json)
    except Exception:
        mapping = detect_mapping(list(df.columns))

    if not mapping.get("name"):
        raise HTTPException(
            status_code=422,
            detail='"Name" column is required. Please map a column to the company name field.',
        )

    def get_val(row: dict, field: str) -> str | None:
        col = mapping.get(field)
        if not col:
            return None
        val = row.get(col)
        return str(val).strip() if val else None

    def map_ownership(raw: str | None) -> OwnershipType:
        if not raw:
            return OwnershipType.private
        r = raw.lower()
        if "public" in r or "listed" in r:
            return OwnershipType.public
        if "pe" in r or "private equity" in r or "sponsor" in r or "backed" in r:
            return OwnershipType.pe_backed
        if "family" in r or "founder" in r:
            return OwnershipType.family_owned
        return OwnershipType.private

    created = 0
    skipped = 0
    errors: list[str] = []

    for i, row in enumerate(df.to_dict(orient="records")):
        name = get_val(row, "name")
        if not name:
            skipped += 1
            continue
        try:
            industry = get_val(row, "industry")
            # Auto-classify sector if industry is unmapped and we have raw industry data
            if not mapping.get("industry"):
                # Try to find any column that looks like sector/industry
                for col in df.columns:
                    n = normalise(col)
                    if any(kw in n for kw in ["industry", "sector", "vertical"]):
                        industry = str(row.get(col, "")).strip() or None
                        break

            ownership_raw = get_val(row, "ownership_type")
            ownership = map_ownership(ownership_raw)

            company = Company(
                name=name,
                industry=industry,
                sub_industry=get_val(row, "sub_industry"),
                revenue_range=get_val(row, "revenue_range"),
                ebitda_range=get_val(row, "ebitda_range"),
                employee_count=get_val(row, "employee_count"),
                ownership_type=ownership,
                geography=get_val(row, "geography"),
                website=get_val(row, "website"),
                description=get_val(row, "description"),
                deal_rationale=get_val(row, "deal_rationale"),
                source=get_val(row, "source"),
            )
            db.add(company)
            created += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")

    db.commit()

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors[:20],
    }
