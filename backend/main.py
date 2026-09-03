from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Event


app = FastAPI(title="CTF Platform")


# Create database tables
Base.metadata.create_all(bind=engine)


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------
# Login
# -------------------------

USER = {
    "email": "user@ctf.com",
    "password": "user123"
}

ADMIN = {
    "email": "admin@ctf.com",
    "password": "admin123"
}


class LoginRequest(BaseModel):
    email: str
    password: str
    role: str


@app.post("/signin")
def signin(data: LoginRequest):

    if data.role == "user":

        if (
            data.email == USER["email"]
            and data.password == USER["password"]
        ):
            return {
                "success": True,
                "message": "User login successful",
                "role": "user"
            }

        raise HTTPException(
            status_code=401,
            detail="Invalid user email or password"
        )

    elif data.role == "admin":

        if (
            data.email == ADMIN["email"]
            and data.password == ADMIN["password"]
        ):
            return {
                "success": True,
                "message": "Admin login successful",
                "role": "admin"
            }

        raise HTTPException(
            status_code=401,
            detail="Invalid admin email or password"
        )

    raise HTTPException(
        status_code=400,
        detail="Invalid role"
    )


# -------------------------
# Event Schema
# -------------------------

class EventCreate(BaseModel):
    name: str
    description: str
    start_date: str
    end_date: str


# -------------------------
# CREATE EVENT
# -------------------------

@app.post("/admin/events")
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


# -------------------------
# GET EVENTS
# -------------------------

@app.get("/admin/events")
def get_events(
    db: Session = Depends(get_db)
):

    events = db.query(Event).all()

    return {
        "success": True,
        "events": events
    }


# -------------------------
# EDIT EVENT
# -------------------------

@app.put("/admin/events/{event_id}")
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
        "event": existing_event
    }


# -------------------------
# DELETE EVENT
# -------------------------

@app.delete("/admin/events/{event_id}")
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


# -------------------------
# EVENT HISTORY
# -------------------------

@app.get("/admin/events/history")
def event_history(
    db: Session = Depends(get_db)
):

    events = db.query(Event).all()

    return {
        "success": True,
        "total_events": len(events),
        "events": events
    }