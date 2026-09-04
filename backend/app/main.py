from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.init_db import init_db
from app.utils.seed import create_test_users

from app.api.auth import router as auth_router
from app.api.events import router as events_router
from app.routers.challenges import router as challenges_router
from app.routers.submissions import router as submissions_router


app = FastAPI(
    title="CTF Platform",
    version="1.0.0"
)


# -------------------------
# Database
# -------------------------

init_db()
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
# API Routers
# -------------------------

app.include_router(auth_router)
app.include_router(events_router)

app.include_router(
    challenges_router,
    prefix="/admin/challenges",
    tags=["Admin Challenges"]
)

app.include_router(
    submissions_router,
    prefix="/users/submissions",
    tags=["User Submissions"]
)


# -------------------------
# Root
# -------------------------

@app.get("/")
def root():
    return {
        "success": True,
        "message": "CTF Platform Backend Running"
    }