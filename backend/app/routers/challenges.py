from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.challenges import Challenge
from app.models.event import Event

from app.schemas.challenges import (
    ChallengeCreate,
    ChallengeUpdate,
    ChallengeResponse,
    ChallengePublicResponse
)


router = APIRouter()


# =========================================================
# ADMIN - CREATE CHALLENGE
# =========================================================

@router.post(
    "/",
    response_model=ChallengeResponse
)
def create_challenge(
    challenge: ChallengeCreate,
    db: Session = Depends(get_db)
):

    event = db.query(Event).filter(
        Event.id == challenge.event_id
    ).first()

    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    new_challenge = Challenge(
        title=challenge.title,
        description=challenge.description,
        category=challenge.category,
        difficulty=challenge.difficulty,
        points=challenge.points,
        flag=challenge.flag,
        hint=challenge.hint,
        writeup=challenge.writeup,
        event_id=challenge.event_id,
        is_active=challenge.is_active
    )

    db.add(new_challenge)
    db.commit()
    db.refresh(new_challenge)

    return new_challenge


# =========================================================
# ADMIN - GET ALL CHALLENGES
# =========================================================

@router.get(
    "/",
    response_model=list[ChallengeResponse]
)
def get_all_challenges(
    db: Session = Depends(get_db)
):

    challenges = db.query(Challenge).all()

    return challenges


# =========================================================
# ADMIN - GET SINGLE CHALLENGE
# =========================================================

@router.get(
    "/{challenge_id}",
    response_model=ChallengeResponse
)
def get_challenge(
    challenge_id: int,
    db: Session = Depends(get_db)
):

    challenge = db.query(Challenge).filter(
        Challenge.id == challenge_id
    ).first()

    if not challenge:
        raise HTTPException(
            status_code=404,
            detail="Challenge not found"
        )

    return challenge


# =========================================================
# ADMIN - UPDATE CHALLENGE
# =========================================================

@router.put(
    "/{challenge_id}",
    response_model=ChallengeResponse
)
def update_challenge(
    challenge_id: int,
    data: ChallengeUpdate,
    db: Session = Depends(get_db)
):

    challenge = db.query(Challenge).filter(
        Challenge.id == challenge_id
    ).first()

    if not challenge:
        raise HTTPException(
            status_code=404,
            detail="Challenge not found"
        )

    event = db.query(Event).filter(
        Event.id == data.event_id
    ).first()

    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    challenge.title = data.title
    challenge.description = data.description
    challenge.category = data.category
    challenge.difficulty = data.difficulty
    challenge.points = data.points
    challenge.flag = data.flag
    challenge.hint = data.hint
    challenge.writeup = data.writeup
    challenge.event_id = data.event_id
    challenge.is_active = data.is_active

    db.commit()
    db.refresh(challenge)

    return challenge


# =========================================================
# ADMIN - DELETE CHALLENGE
# =========================================================

@router.delete("/{challenge_id}")
def delete_challenge(
    challenge_id: int,
    db: Session = Depends(get_db)
):

    challenge = db.query(Challenge).filter(
        Challenge.id == challenge_id
    ).first()

    if not challenge:
        raise HTTPException(
            status_code=404,
            detail="Challenge not found"
        )

    db.delete(challenge)
    db.commit()

    return {
        "success": True,
        "message": "Challenge deleted successfully"
    }


# =========================================================
# USER - GET ACTIVE CHALLENGES
# =========================================================

@router.get(
    "/public/list",
    response_model=list[ChallengePublicResponse]
)
def get_public_challenges(
    db: Session = Depends(get_db)
):

    challenges = db.query(Challenge).filter(
        Challenge.is_active == True
    ).all()

    return challenges


# =========================================================
# USER - GET ACTIVE CHALLENGE
# =========================================================

@router.get(
    "/public/{challenge_id}",
    response_model=ChallengePublicResponse
)
def get_public_challenge(
    challenge_id: int,
    db: Session = Depends(get_db)
):

    challenge = db.query(Challenge).filter(
        Challenge.id == challenge_id,
        Challenge.is_active == True
    ).first()

    if not challenge:
        raise HTTPException(
            status_code=404,
            detail="Challenge not found"
        )

    return challenge