from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.challenges import Challenge
from app.models.submissions import Submission
from app.models.user import User

from app.schemas.submissions import (
    SubmissionCreate,
    SubmissionResponse
)


router = APIRouter()


# =========================================================
# USER - SUBMIT FLAG
# =========================================================

@router.post(
    "/{challenge_id}",
    response_model=SubmissionResponse
)
def submit_flag(
    challenge_id: int,
    user_id: int,
    data: SubmissionCreate,
    db: Session = Depends(get_db)
):

    # -----------------------------------------------------
    # Find user
    # -----------------------------------------------------

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # -----------------------------------------------------
    # Find challenge
    # -----------------------------------------------------

    challenge = db.query(Challenge).filter(
        Challenge.id == challenge_id,
        Challenge.is_active == True
    ).first()

    if not challenge:
        raise HTTPException(
            status_code=404,
            detail="Challenge not found"
        )

    # -----------------------------------------------------
    # Check if already solved
    # -----------------------------------------------------

    already_solved = db.query(Submission).filter(
        Submission.challenge_id == challenge_id,
        Submission.user_id == user_id,
        Submission.is_correct == True
    ).first()

    # -----------------------------------------------------
    # Check submitted flag
    # -----------------------------------------------------

    is_correct = data.submitted_flag == challenge.flag

    points_awarded = 0

    # -----------------------------------------------------
    # Award points only once
    # -----------------------------------------------------

    if is_correct and not already_solved:

        points_awarded = challenge.points

        user.points += challenge.points
        user.challenges_solved += 1

    # -----------------------------------------------------
    # Save submission
    # -----------------------------------------------------

    submission = Submission(
        challenge_id=challenge_id,
        user_id=user_id,
        submitted_flag=data.submitted_flag,
        is_correct=is_correct,
        points_awarded=points_awarded
    )

    db.add(submission)

    db.commit()
    db.refresh(submission)

    return submission


# =========================================================
# USER - VIEW OWN SUBMISSIONS
# =========================================================

@router.get(
    "/",
    response_model=list[SubmissionResponse]
)
def get_user_submissions(
    user_id: int,
    db: Session = Depends(get_db)
):

    submissions = db.query(Submission).filter(
        Submission.user_id == user_id
    ).all()

    return submissions