from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from datetime import datetime

from app.database.database import Base
from sqlalchemy.orm import relationship

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
        String(100),
        nullable=False
    )

    email = Column(
        String(150),
        unique=True,
        nullable=False,
        index=True
    )

    password_hash = Column(
        String(255),
        nullable=False
    )

    role = Column(
        String(20),
        nullable=False,
        default="user"
    )

    profile_photo = Column(
        String(500),
        nullable=True
    )

    bio = Column(
        Text,
        nullable=True
    )

    college = Column(
        String(150),
        nullable=True
    )

    points = Column(
        Integer,
        default=0,
        nullable=False
    )

    challenges_solved = Column(
        Integer,
        default=0,
        nullable=False
    )

    joined_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False
    )
    submissions = relationship(
    "Submission",
    back_populates="user",
    cascade="all, delete-orphan"
)