from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from .database import engine, get_db
from . import models
from .models import Company, Contact, Deal, Note, DealStage, Priority
from .routers import companies, contacts, deals

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="M&A Deal Origination CRM", version="1.0.0")

app.include_router(companies.router)
app.include_router(contacts.router)
app.include_router(deals.router)


@app.get("/api/dashboard")
def dashboard():
    db: Session = next(get_db())
    try:
        total_companies = db.query(func.count(Company.id)).scalar()
        total_contacts = db.query(func.count(Contact.id)).scalar()

        stage_counts = {}
        for stage in DealStage:
            count = db.query(func.count(Deal.id)).filter(Deal.stage == stage).scalar()
            stage_counts[stage.value] = count

        high_priority = (
            db.query(func.count(Deal.id))
            .filter(Deal.priority == Priority.high)
            .scalar()
        )

        recent_notes = (
            db.query(Note, Deal, Company)
            .join(Deal, Note.deal_id == Deal.id)
            .join(Company, Deal.company_id == Company.id)
            .order_by(Note.created_at.desc())
            .limit(5)
            .all()
        )
        recent_activity = [
            {
                "company": company.name,
                "note_type": note.note_type.value,
                "content": note.content[:100],
                "author": note.author,
                "created_at": note.created_at.isoformat(),
            }
            for note, deal, company in recent_notes
        ]

        return {
            "total_companies": total_companies,
            "total_contacts": total_contacts,
            "deals_by_stage": stage_counts,
            "high_priority_deals": high_priority,
            "recent_activity": recent_activity,
        }
    finally:
        db.close()


@app.get("/api/enums")
def get_enums():
    return {
        "deal_stages": [s.value for s in DealStage],
        "priorities": [p.value for p in Priority],
        "ownership_types": [o.value for o in models.OwnershipType],
        "note_types": [n.value for n in models.NoteType],
    }


app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def serve_frontend():
    return FileResponse("static/index.html")
