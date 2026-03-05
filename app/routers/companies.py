from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Company
from ..schemas import CompanyCreate, CompanyUpdate, CompanyOut, CompanySummary

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("/", response_model=list[CompanySummary])
def list_companies(
    industry: str | None = None,
    geography: str | None = None,
    ownership_type: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Company)
    if industry:
        query = query.filter(Company.industry.ilike(f"%{industry}%"))
    if geography:
        query = query.filter(Company.geography.ilike(f"%{geography}%"))
    if ownership_type:
        query = query.filter(Company.ownership_type == ownership_type)
    if search:
        query = query.filter(Company.name.ilike(f"%{search}%"))
    return query.order_by(Company.created_at.desc()).all()


@router.post("/", response_model=CompanyOut, status_code=201)
def create_company(data: CompanyCreate, db: Session = Depends(get_db)):
    company = Company(**data.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(company_id: int, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.put("/{company_id}", response_model=CompanyOut)
def update_company(company_id: int, data: CompanyUpdate, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


@router.delete("/{company_id}", status_code=204)
def delete_company(company_id: int, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    db.delete(company)
    db.commit()
