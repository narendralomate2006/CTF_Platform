from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey
)

from sqlalchemy.orm import relationship

from app.database.database import Base


class Submission(Base):

    __tablename__ = "submissions"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    challenge_id = Column(
        Integer,
        ForeignKey("challenges.id"),
        nullable=False
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False
    )

    submitted_flag = Column(
        String(500),
        nullable=False
    )

    is_correct = Column(
        Boolean,
        default=False,
        nullable=False
    )

    points_awarded = Column(
        Integer,
        default=0,
        nullable=False
    )

    submitted_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    challenge = relationship(
        "Challenge",
        back_populates="submissions"
    )

    user = relationship(
        "User",
        back_populates="submissions"
    )
submissions = relationship(
    "Submission",
    back_populates="challenge",
    cascade="all, delete-orphan"
)