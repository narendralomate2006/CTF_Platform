from pydantic import BaseModel
from datetime import datetime


class SubmissionCreate(BaseModel):
    submitted_flag: str


class SubmissionResponse(BaseModel):
    id: int
    challenge_id: int
    user_id: int
    submitted_flag: str
    is_correct: bool
    points_awarded: int
    submitted_at: datetime

    class Config:
        from_attributes = True