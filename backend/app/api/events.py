from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.event import Event
from app.schemas.event import EventCreate


router = APIRouter(
    prefix="/admin/events",
    tags=["Admin Events"]
)


@router.post("/")
def create_event(
    event: EventCreate,
    db: Session = Depends(get_db)
):

    new_event = Event(
        name=event.name,
        description=event.description,
        start_date=event.start_date,
        end_date=event.end_date
    )

    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    return {
        "success": True,
        "message": "Event created successfully",
        "event": {
            "id": new_event.id,
            "name": new_event.name,
            "description": new_event.description,
            "start_date": new_event.start_date,
            "end_date": new_event.end_date
        }
    }


@router.get("/")
def get_events(
    db: Session = Depends(get_db)
):

    events = db.query(Event).all()

    return {
        "success": True,
        "events": events
    }


@router.put("/{event_id}")
def edit_event(
    event_id: int,
    event: EventCreate,
    db: Session = Depends(get_db)
):

    existing_event = db.query(Event).filter(
        Event.id == event_id
    ).first()

    if existing_event is None:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    existing_event.name = event.name
    existing_event.description = event.description
    existing_event.start_date = event.start_date
    existing_event.end_date = event.end_date

    db.commit()
    db.refresh(existing_event)

    return {
        "success": True,
        "message": "Event updated successfully",
        "event": {
            "id": existing_event.id,
            "name": existing_event.name,
            "description": existing_event.description,
            "start_date": existing_event.start_date,
            "end_date": existing_event.end_date
        }
    }


@router.delete("/{event_id}")
def delete_event(
    event_id: int,
    db: Session = Depends(get_db)
):

    existing_event = db.query(Event).filter(
        Event.id == event_id
    ).first()

    if existing_event is None:
        raise HTTPException(
            status_code=404,
            detail="Event not found"
        )

    db.delete(existing_event)
    db.commit()

    return {
        "success": True,
        "message": "Event deleted successfully"
    }


@router.get("/history")
def event_history(
    db: Session = Depends(get_db)
):

    events = db.query(Event).all()

    return {
        "success": True,
        "total_events": len(events),
        "events": events
    }