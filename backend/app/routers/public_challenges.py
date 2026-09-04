from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.challenges import Challenge
from app.schemas.challenges import ChallengePublicResponse


router = APIRouter()


# =========================================================
# USER - GET ACTIVE CHALLENGES
# =========================================================

@router.get(
    "/",
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
# USER - GET SINGLE ACTIVE CHALLENGE
# =========================================================

@router.get(
    "/{challenge_id}",
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