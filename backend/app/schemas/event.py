from pydantic import BaseModel
from datetime import datetime


class EventCreate(BaseModel):
    name: str
    description: str
    start_date: datetime
    end_date: datetime