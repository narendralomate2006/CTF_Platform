from pydantic import BaseModel
from datetime import datetime


class ChallengeCreate(BaseModel):
    title: str
    description: str
    category: str
    difficulty: str
    points: int
    flag: str
    hint: str | None = None
    writeup: str | None = None
    event_id: int
    is_active: bool = True


class ChallengeUpdate(BaseModel):
    title: str
    description: str
    category: str
    difficulty: str
    points: int
    flag: str
    hint: str | None = None
    writeup: str | None = None
    event_id: int
    is_active: bool


class ChallengeResponse(BaseModel):
    id: int
    title: str
    description: str
    category: str
    difficulty: str
    points: int
    hint: str | None
    writeup: str | None
    event_id: int
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


class ChallengePublicResponse(BaseModel):
    id: int
    title: str
    description: str
    category: str
    difficulty: str
    points: int
    hint: str | None
    event_id: int
    created_at: datetime

    class Config:
        from_attributes = True