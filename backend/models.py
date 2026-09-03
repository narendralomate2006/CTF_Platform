from sqlalchemy import Column, Integer, String, Text

from database import Base


class Event(Base):

    __tablename__ = "events"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
        String(100),
        nullable=False
    )

    description = Column(
        Text,
        nullable=False
    )

    start_date = Column(
        String(50),
        nullable=False
    )

    end_date = Column(
        String(50),
        nullable=False
    )