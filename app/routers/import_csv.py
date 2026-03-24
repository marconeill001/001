import io
import json
import re

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Company, Contact, OwnershipType

router = APIRouter(prefix="/api/import", tags=["import"])

# ─── Column alias mapping ─────────────────────────────────────────────────────

COLUMN_ALIASES: dict[str, list[str]] = {
    "name": [
        "name", "company name", "company", "organization", "organisation",
        "business name", "firm", "entity", "target", "target name",
        "account name", "account", "corp name", "legal name",
        "contact name", "contact company", "contact organization",
        "contact organisation", "contact account", "contact firm",
        "issuer name", "issuer", "portfolio company", "investee",
        "deal target", "co. name", "co name", "company / organization",
        "company/organization", "company or organization",
    ],
    "industry": [
        "industry", "sector", "industry sector", "business type",
        "vertical", "market", "sub-industry", "sub industry",
        "naics", "sic", "primary industry",
    ],
    "sub_industry": [
        "sub industry", "sub-industry", "sub_industry", "subsector",
        "niche", "category", "secondary industry",
    ],
    "revenue_range": [
        "revenue", "revenue range", "annual revenue", "revenues",
        "turnover", "sales", "annual sales", "rev", "revenue ($m)",
        "revenue (m)", "rev range", "revenue size", "ltm revenue", "ltr",
        # Specific formats from export tools
        "revenue (musd) (if estimate, max 1b)", "revenue (musd)",
        "revenue (usd)", "revenue usd", "revenue ($)", "arr", "mrr",
        "annual recurring revenue", "total revenue",
    ],
    "ebitda_range": [
        "ebitda", "ebitda range", "ebitda ($m)", "ebitda (m)",
        "earnings", "operating income", "profit", "ebitda (musd)",
    ],
    "employee_count": [
        "employees", "employee count", "headcount", "staff", "# employees",
        "no. employees", "num employees", "workforce", "fte",
        "number of employees", "employees (#)",
        # LinkedIn-style exports
        "headcount range (linkedin)", "employees count (linkedin)",
        "linkedin headcount", "linkedin employees", "company size",
        "employee range", "headcount range", "employees count",
        "number of employees (linkedin)",
    ],
    "ownership_type": [
        "ownership", "ownership type", "type", "ownership structure",
        "shareholder", "owner type", "company type", "company type/stage",
    ],
    # geography is handled specially (City + Region + Country combined)
    "geography": [
        "geography", "location", "hq", "headquarters", "hq location",
        "office location", "domicile", "market geography",
        "country", "country/region", "hq country",
    ],
    # sub-geography fields — combined at import time
    "_city": ["city", "hq city", "office city"],
    "_region": ["region", "state", "province", "hq region", "hq state"],
    "_country": ["country", "hq country", "country/region", "nation"],
    "website": [
        "website", "url", "web", "domain", "homepage", "site",
        "web address", "company url", "company website",
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
        "origination source", "channel", "list status", "status",
        "list name",
    ],
}

# Contact column patterns for numbered contact exports (e.g. "1. Contact Full Name")
CONTACT_FIELD_PATTERNS: dict[str, list[str]] = {
    "full_name": ["contact full name", "contact name"],
    "first_name": ["contact first name"],
    "last_name": ["contact last name"],
    "title": ["contact title", "contact job title", "contact position"],
    "email": ["contact primary e-mail address", "contact email", "contact e-mail",
               "contact primary email", "contact email address"],
    "phone": ["contact primary phone number", "contact phone", "contact mobile",
              "contact direct phone", "contact phone number"],
    "linkedin_url": ["contact linkedin", "contact linkedin url", "contact linkedin profile"],
}

# ─── Sector auto-classification ───────────────────────────────────────────────

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


# ─── Column detection ─────────────────────────────────────────────────────────

def normalise(s: str) -> str:
    return re.sub(r"[\s_\-]+", " ", str(s).strip().lower())


def detect_mapping(columns: list[str]) -> dict[str, str | None]:
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


def detect_contact_columns(columns: list[str]) -> list[dict[str, str | None]]:
    """
    Detect numbered contact column blocks, e.g. "1. Contact Full Name",
    "2. Contact Full Name", etc. Returns one dict per contact number found.
    """
    norm_cols = {normalise(c): c for c in columns}

    # Find all contact block numbers present
    numbers: set[str] = set()
    for nc in norm_cols:
        m = re.match(r"^(\d+)\.\s*contact\s+", nc)
        if m:
            numbers.add(m.group(1))

    if not numbers:
        return []

    result = []
    for num in sorted(numbers, key=int):
        block: dict[str, str | None] = {"_num": num}
        for field, aliases in CONTACT_FIELD_PATTERNS.items():
            matched = None
            for alias in aliases:
                # Normalise the full candidate so hyphens/spacing are consistent
                candidate = normalise(f"{num}. {alias}")
                if candidate in norm_cols:
                    matched = norm_cols[candidate]
                    break
            block[field] = matched
        # Only include blocks that have at least a name or email
        if block.get("full_name") or block.get("email"):
            result.append(block)
    return result


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/preview")
async def preview_import(file: UploadFile = File(...)):
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
    contact_blocks = detect_contact_columns(columns)

    sample = df.head(5).to_dict(orient="records")

    ind_col = mapping.get("industry")
    if ind_col:
        for row in sample:
            row["_sector"] = classify_sector(row.get(ind_col))

    warnings = []
    if not mapping.get("name"):
        warnings.append(
            '"Name" column not found — this is required to import companies. '
            f'Available columns: {", ".join(columns[:15])}'
            + ("..." if len(columns) > 15 else "")
        )

    # Summary of what will be imported
    mapped_fields = [f for f, col in mapping.items()
                     if col and not f.startswith("_")]
    # Also count geography sub-fields
    geo_parts = [f for f in ("_city", "_region", "_country") if mapping.get(f)]

    return {
        "filename": filename,
        "total_rows": len(df),
        "columns": columns,
        "mapping": mapping,
        "contact_blocks": contact_blocks,
        "sample": sample,
        "warnings": warnings,
        "mapped_fields": mapped_fields,
        "geo_parts": geo_parts,
    }


@router.post("/confirm")
async def confirm_import(
    file: UploadFile = File(...),
    mapping_json: str = Form(default=""),
    db: Session = Depends(get_db),
):
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
        mapping: dict[str, str | None] = json.loads(mapping_json) if mapping_json else {}
    except Exception:
        mapping = {}

    if not mapping:
        mapping = detect_mapping(list(df.columns))

    if not mapping.get("name"):
        raise HTTPException(
            status_code=422,
            detail='"Name" column is required. Please map a column to the company name field.',
        )

    contact_blocks = detect_contact_columns(list(df.columns))

    def get_val(row: dict, field: str) -> str | None:
        col = mapping.get(field)
        if not col:
            return None
        val = row.get(col)
        return str(val).strip() if val and str(val).strip() not in ("nan", "None", "") else None

    def build_geography(row: dict) -> str | None:
        # Prefer explicit geography column; otherwise combine city/region/country
        geo = get_val(row, "geography")
        if geo:
            return geo
        parts = []
        for sub in ("_city", "_region", "_country"):
            col = mapping.get(sub)
            if col:
                val = row.get(col)
                if val and str(val).strip() not in ("nan", "None", ""):
                    parts.append(str(val).strip())
        # De-duplicate while preserving order
        seen: set[str] = set()
        unique_parts = []
        for p in parts:
            if p.lower() not in seen:
                seen.add(p.lower())
                unique_parts.append(p)
        return ", ".join(unique_parts) if unique_parts else None

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
    contacts_created = 0
    skipped = 0
    errors: list[str] = []

    for i, row in enumerate(df.to_dict(orient="records")):
        name = get_val(row, "name")
        if not name:
            skipped += 1
            continue
        try:
            company = Company(
                name=name,
                industry=get_val(row, "industry"),
                sub_industry=get_val(row, "sub_industry"),
                revenue_range=get_val(row, "revenue_range"),
                ebitda_range=get_val(row, "ebitda_range"),
                employee_count=get_val(row, "employee_count"),
                ownership_type=map_ownership(get_val(row, "ownership_type")),
                geography=build_geography(row),
                website=get_val(row, "website"),
                description=get_val(row, "description"),
                deal_rationale=get_val(row, "deal_rationale"),
                source=get_val(row, "source"),
            )
            db.add(company)
            db.flush()  # get company.id before contacts

            # Import contacts from numbered blocks (e.g. "1. Contact Full Name")
            for block in contact_blocks:
                def bval(field: str) -> str | None:
                    col = block.get(field)
                    if not col:
                        return None
                    val = row.get(col)
                    return str(val).strip() if val and str(val).strip() not in ("nan", "None", "") else None

                # Build contact name: prefer full name, else first+last
                contact_name = bval("full_name")
                if not contact_name:
                    first = bval("first_name") or ""
                    last = bval("last_name") or ""
                    contact_name = f"{first} {last}".strip() or None

                if not contact_name:
                    continue

                contact = Contact(
                    company_id=company.id,
                    name=contact_name,
                    title=bval("title"),
                    email=bval("email"),
                    phone=bval("phone"),
                    linkedin_url=bval("linkedin_url"),
                    is_primary=1 if block["_num"] == "1" else 0,
                )
                db.add(contact)
                contacts_created += 1

            created += 1
        except Exception as e:
            errors.append(f"Row {i + 2}: {e}")

    db.commit()

    return {
        "created": created,
        "contacts_created": contacts_created,
        "skipped": skipped,
        "errors": errors[:20],
    }
