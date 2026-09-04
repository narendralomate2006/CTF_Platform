from app.database.database import Base, engine

from app.models import (
    User,
    Event,
    Challenge,
    Submission
)


def init_db():
    Base.metadata.create_all(bind=engine)