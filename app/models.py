from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
import enum

from .database import Base


class OwnershipType(str, enum.Enum):
    private = "Private"
    public = "Public"
    pe_backed = "PE-Backed"
    family_owned = "Family-Owned"
    other = "Other"


class DealStage(str, enum.Enum):
    identified = "Identified"
    research = "Research"
    outreach = "Outreach"
    engaged = "Engaged"
    nda = "NDA"
    loi = "LOI"
    diligence = "Diligence"
    closed_won = "Closed Won"
    passed = "Passed"
    on_hold = "On Hold"


class Priority(str, enum.Enum):
    high = "High"
    medium = "Medium"
    low = "Low"


class NoteType(str, enum.Enum):
    general = "General"
    call = "Call"
    email = "Email"
    meeting = "Meeting"
    internal = "Internal"


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    industry = Column(String(100))
    sub_industry = Column(String(100))
    revenue_range = Column(String(50))
    ebitda_range = Column(String(50))
    employee_count = Column(String(50))
    ownership_type = Column(Enum(OwnershipType), default=OwnershipType.private)
    geography = Column(String(100))
    website = Column(String(255))
    description = Column(Text)
    deal_rationale = Column(Text)
    source = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    contacts = relationship("Contact", back_populates="company", cascade="all, delete-orphan")
    deals = relationship("Deal", back_populates="company", cascade="all, delete-orphan")


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String(255), nullable=False)
    title = Column(String(255))
    email = Column(String(255))
    phone = Column(String(50))
    linkedin_url = Column(String(500))
    notes = Column(Text)
    is_primary = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="contacts")


class Deal(Base):
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    stage = Column(Enum(DealStage), default=DealStage.identified)
    priority = Column(Enum(Priority), default=Priority.medium)
    assigned_to = Column(String(255))
    next_action = Column(String(500))
    next_action_date = Column(String(20))
    target_close_date = Column(String(20))
    estimated_ev = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="deals")
    notes = relationship("Note", back_populates="deal", cascade="all, delete-orphan")


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False)
    content = Column(Text, nullable=False)
    note_type = Column(Enum(NoteType), default=NoteType.general)
    author = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)

    deal = relationship("Deal", back_populates="notes")
