from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from .models import OwnershipType, DealStage, Priority, NoteType


# --- Note ---

class NoteCreate(BaseModel):
    content: str
    note_type: NoteType = NoteType.general
    author: Optional[str] = None


class NoteOut(BaseModel):
    id: int
    deal_id: int
    content: str
    note_type: NoteType
    author: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Contact ---

class ContactCreate(BaseModel):
    company_id: int
    name: str
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: bool = False


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    is_primary: Optional[bool] = None


class ContactOut(BaseModel):
    id: int
    company_id: int
    name: str
    title: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    linkedin_url: Optional[str]
    notes: Optional[str]
    is_primary: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Deal ---

class DealCreate(BaseModel):
    company_id: int
    stage: DealStage = DealStage.identified
    priority: Priority = Priority.medium
    assigned_to: Optional[str] = None
    next_action: Optional[str] = None
    next_action_date: Optional[str] = None
    target_close_date: Optional[str] = None
    estimated_ev: Optional[str] = None


class DealUpdate(BaseModel):
    stage: Optional[DealStage] = None
    priority: Optional[Priority] = None
    assigned_to: Optional[str] = None
    next_action: Optional[str] = None
    next_action_date: Optional[str] = None
    target_close_date: Optional[str] = None
    estimated_ev: Optional[str] = None


class DealOut(BaseModel):
    id: int
    company_id: int
    stage: DealStage
    priority: Priority
    assigned_to: Optional[str]
    next_action: Optional[str]
    next_action_date: Optional[str]
    target_close_date: Optional[str]
    estimated_ev: Optional[str]
    created_at: datetime
    updated_at: datetime
    notes: list[NoteOut] = []

    model_config = {"from_attributes": True}


# --- Company ---

class CompanyCreate(BaseModel):
    name: str
    industry: Optional[str] = None
    sub_industry: Optional[str] = None
    revenue_range: Optional[str] = None
    ebitda_range: Optional[str] = None
    employee_count: Optional[str] = None
    ownership_type: OwnershipType = OwnershipType.private
    geography: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    deal_rationale: Optional[str] = None
    source: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    sub_industry: Optional[str] = None
    revenue_range: Optional[str] = None
    ebitda_range: Optional[str] = None
    employee_count: Optional[str] = None
    ownership_type: Optional[OwnershipType] = None
    geography: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    deal_rationale: Optional[str] = None
    source: Optional[str] = None


class CompanyOut(BaseModel):
    id: int
    name: str
    industry: Optional[str]
    sub_industry: Optional[str]
    revenue_range: Optional[str]
    ebitda_range: Optional[str]
    employee_count: Optional[str]
    ownership_type: OwnershipType
    geography: Optional[str]
    website: Optional[str]
    description: Optional[str]
    deal_rationale: Optional[str]
    source: Optional[str]
    created_at: datetime
    updated_at: datetime
    contacts: list[ContactOut] = []
    deals: list[DealOut] = []

    model_config = {"from_attributes": True}


class CompanySummary(BaseModel):
    id: int
    name: str
    industry: Optional[str]
    ownership_type: OwnershipType
    geography: Optional[str]
    revenue_range: Optional[str]
    created_at: datetime
    deals: list[DealOut] = []

    model_config = {"from_attributes": True}


# --- Dashboard ---

class DashboardStats(BaseModel):
    total_companies: int
    total_contacts: int
    deals_by_stage: dict[str, int]
    high_priority_deals: int
    recent_activity: list[dict]
