from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database.database import Base


class Challenge(Base):
    __tablename__ = "challenges"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)

    category = Column(String(100), nullable=False)
    difficulty = Column(String(50), nullable=False)

    points = Column(Integer, nullable=False)

    flag = Column(String(500), nullable=False)

    hint = Column(Text, nullable=True)
    writeup = Column(Text, nullable=True)

    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)

    event = relationship("Event", back_populates="challenges")

    submissions = relationship(
        "Submission",
        back_populates="challenge",
        cascade="all, delete-orphan"
    )