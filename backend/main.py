from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Event, User


app = FastAPI(title="CTF Platform")


# Create database tables
Base.metadata.create_all(bind=engine)
def create_test_users():
    db = next(get_db())

    # Create test user
    user = db.query(User).filter(
        User.email == "user@ctf.com"
    ).first()

    if not user:
        user = User(
            name="Test User",
            email="user@ctf.com",
            password_hash="user123",
            role="user",
            college="PCCOE",
            bio="Cybersecurity enthusiast"
        )

        db.add(user)

    # Create test admin
    admin = db.query(User).filter(
        User.email == "admin@ctf.com"
    ).first()

    if not admin:
        admin = User(
            name="Test Admin",
            email="admin@ctf.com",
            password_hash="admin123",
            role="admin",
            college="PCCOE",
            bio="CTF Administrator"
        )

        db.add(admin)

    db.commit()
    db.close()


create_test_users()

# -------------------------
# CORS
# -------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------
# LOGIN SCHEMA
# -------------------------

class LoginRequest(BaseModel):
    email: str
    password: str
    role: str


# -------------------------
# SIGN IN
# -------------------------

@app.post("/signin")
def signin(
    data: LoginRequest,
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(
        User.email == data.email,
        User.role == data.role
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # Temporary testing
    # Currently compares the entered password
    # with the value stored in password_hash.
    if user.password_hash != data.password:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    return {
        "success": True,
        "message": "Login successful",
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role
    }


# =========================================================
# ADMIN EVENT MANAGEMENT
# =========================================================


# -------------------------
# Event Schema
# -------------------------
class EventCreate(BaseModel):
    name: str
    description: str
    start_date: datetime
    end_date: datetime


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