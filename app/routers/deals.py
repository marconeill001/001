from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Deal, Company, Note
from ..schemas import DealCreate, DealUpdate, DealOut, NoteCreate, NoteOut

router = APIRouter(prefix="/api/deals", tags=["deals"])


@router.get("/", response_model=list[DealOut])
def list_deals(
    stage: str | None = None,
    priority: str | None = None,
    assigned_to: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Deal)
    if stage:
        query = query.filter(Deal.stage == stage)
    if priority:
        query = query.filter(Deal.priority == priority)
    if assigned_to:
        query = query.filter(Deal.assigned_to.ilike(f"%{assigned_to}%"))
    return query.order_by(Deal.updated_at.desc()).all()


@router.post("/", response_model=DealOut, status_code=201)
def create_deal(data: DealCreate, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == data.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    deal = Deal(**data.model_dump())
    db.add(deal)
    db.commit()
    db.refresh(deal)
    return deal


@router.get("/{deal_id}", response_model=DealOut)
def get_deal(deal_id: int, db: Session = Depends(get_db)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.put("/{deal_id}", response_model=DealOut)
def update_deal(deal_id: int, data: DealUpdate, db: Session = Depends(get_db)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(deal, field, value)
    db.commit()
    db.refresh(deal)
    return deal


@router.delete("/{deal_id}", status_code=204)
def delete_deal(deal_id: int, db: Session = Depends(get_db)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    db.delete(deal)
    db.commit()


@router.post("/{deal_id}/notes", response_model=NoteOut, status_code=201)
def add_note(deal_id: int, data: NoteCreate, db: Session = Depends(get_db)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    note = Note(deal_id=deal_id, **data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{deal_id}/notes/{note_id}", status_code=204)
def delete_note(deal_id: int, note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id, Note.deal_id == deal_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
