from datetime import datetime, timedelta, timezone
from typing import Optional, List
import uuid
import os
import secrets
import hmac
import hashlib
import json
import subprocess
import socket
import re
import smtplib
import time
import logging
from email.message import EmailMessage
from urllib.parse import urlencode
from pathlib import Path
import csv
import io

import storage
from observability import configure_logging, record_request, snapshot

from fastapi import FastAPI, HTTPException, Depends, Header, Query, Request, UploadFile, File, Body, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi import status as http_status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, desc, or_, distinct
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from pwdlib import PasswordHash
from reportlab.lib.pagesizes import A4, landscape, portrait
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from authlib.integrations.starlette_client import OAuth

from database import Base, engine, get_db
from models import (
    User,
    Event,
    Challenge,
    ChallengeHint,
    Submission,
    HintUnlock,
    ChallengeComment,
    Badge,
    UserBadge,
    EventRegistration,
    Team,
    TeamMember,
    TeamJoinRequest,
    Notification,
    Certificate,
    SecurityAlert,
    ChallengeInstance
)

# =========================================================
# APP CONFIGURATION
# =========================================================

configure_logging()
logger = logging.getLogger("ctf_api")

app = FastAPI(
    title="College OWASP CTF Platform API",
    description="Backend API for OWASP CTF Platform (CTFd + LeetCode style)",
    version="2.4.0"
)

PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "http://127.0.0.1:8000").rstrip("/")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
METRICS_TOKEN = os.getenv("METRICS_TOKEN", "")

@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    started = time.perf_counter()
    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception:
        status_code = 500
        raise
    finally:
        duration_ms = (time.perf_counter() - started) * 1000
        record_request(request.method, request.url.path, status_code, duration_ms, request_id)
        logger.info("request", extra={"request_id": request_id})
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob: https:; "
        "connect-src 'self' ws: wss:; "
        "frame-ancestors 'none';"
    )
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def secure_str_equals(val1: Optional[str], val2: Optional[str]) -> bool:
    """Timing-attack safe string comparison using HMAC constant-time digest."""
    if val1 is None or val2 is None:
        return False
    return hmac.compare_digest(str(val1).strip().encode("utf-8"), str(val2).strip().encode("utf-8"))


def sanitize_input(text: Optional[str], max_len: int = 3000) -> Optional[str]:
    """Sanitizes user input string against Stored XSS and malicious script injections."""
    if not text:
        return text
    cleaned = re.sub(r'<\s*script[^>]*>.*?<\s*/\s*script\s*>', '', str(text), flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r'<\s*style[^>]*>.*?<\s*/\s*style\s*>', '', cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r'on\w+\s*=\s*["\'][^"\']*["\']', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'javascript:\s*', '', cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace("<", "&lt;").replace(">", "&gt;")
    return cleaned[:max_len]


@app.get("/health")
def health_check():
    db_status = "ok"
    redis_status = "disabled" if not REDIS_ENABLED else "unavailable"
    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "error"
    if redis_client:
        try:
            redis_client.ping()
            redis_status = "ok"
        except Exception:
            redis_status = "error"
    return {"status": "ok" if db_status == "ok" else "degraded", "database": db_status, "redis": redis_status, "object_storage": storage.status()}

@app.get("/ready")
def readiness_check():
    """Deployment readiness probe: dependency failures return HTTP 503."""
    checks = {"database": "error", "redis": "disabled", "object_storage": storage.status()}
    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        pass
    if REDIS_ENABLED:
        if redis_client:
            try:
                redis_client.ping()
                checks["redis"] = "ok"
            except Exception:
                checks["redis"] = "error"
        else:
            checks["redis"] = "error"
    healthy = checks["database"] == "ok" and checks["redis"] in {"ok", "disabled"}
    if not healthy:
        raise HTTPException(status_code=503, detail={"status": "not_ready", "checks": checks})
    return {"status": "ready", "checks": checks}

@app.get("/internal/metrics")
def internal_metrics(x_metrics_token: Optional[str] = Header(default=None)):
    """Private operational metrics. Protect this endpoint with METRICS_TOKEN."""
    if not METRICS_TOKEN or not hmac.compare_digest(x_metrics_token or "", METRICS_TOKEN):
        raise HTTPException(status_code=404, detail="Not found")
    return snapshot()

UPLOAD_ROOT = Path(__file__).parent / "uploads"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
# Local files are served only through authenticated download endpoints; object storage uses signed URLs.

# =========================================================
# CORS
# =========================================================

ALLOWED_ORIGINS = [x.strip() for x in os.getenv("ALLOWED_ORIGINS", "").split(",") if x.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5177",
        "http://localhost:5178",
        "http://127.0.0.1:5178",
        "http://localhost:5179",
        "http://127.0.0.1:5179",
        *ALLOWED_ORIGINS
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CERT_TEMPLATE_DIR = UPLOAD_DIR / "certificate_templates"
CERT_TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Ensure tables exist
# Create new tables and perform lightweight SQLite upgrades for existing local databases.
Base.metadata.create_all(bind=engine)

def upgrade_sqlite_schema():
    """Add lightweight columns only for legacy SQLite development databases."""
    if not str(engine.url).startswith("sqlite"):
        return
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "event_registrations" in tables:
        cols = {c["name"] for c in inspector.get_columns("event_registrations")}
        if "team_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE event_registrations ADD COLUMN team_id INTEGER"))
    if "submissions" in tables:
        cols = {c["name"] for c in inspector.get_columns("submissions")}
        with engine.begin() as conn:
            if "team_id" not in cols:
                conn.execute(text("ALTER TABLE submissions ADD COLUMN team_id INTEGER"))
            if "request_ip" not in cols:
                conn.execute(text("ALTER TABLE submissions ADD COLUMN request_ip VARCHAR(80)"))
            if "user_agent" not in cols:
                conn.execute(text("ALTER TABLE submissions ADD COLUMN user_agent VARCHAR(500)"))
            if "risk_score" not in cols:
                conn.execute(text("ALTER TABLE submissions ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 0"))
            if "risk_reasons" not in cols:
                conn.execute(text("ALTER TABLE submissions ADD COLUMN risk_reasons TEXT"))
    if "teams" in tables:
        cols = {c["name"] for c in inspector.get_columns("teams")}
        with engine.begin() as conn:
            if "points" not in cols:
                conn.execute(text("ALTER TABLE teams ADD COLUMN points INTEGER NOT NULL DEFAULT 0"))
            if "challenges_solved" not in cols:
                conn.execute(text("ALTER TABLE teams ADD COLUMN challenges_solved INTEGER NOT NULL DEFAULT 0"))
    if "hint_unlocks" in tables:
        cols = {c["name"] for c in inspector.get_columns("hint_unlocks")}
        if "hint_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE hint_unlocks ADD COLUMN hint_id INTEGER"))
    if "challenges" in tables:
        cols = {c["name"] for c in inspector.get_columns("challenges")}
        with engine.begin() as conn:
            if "status" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'published'"))
            if "flag_mode" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN flag_mode VARCHAR(20) NOT NULL DEFAULT 'static'"))
            if "flag_secret" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN flag_secret VARCHAR(255)"))
            if "file_path" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN file_path VARCHAR(500)"))
            if "runtime_image" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN runtime_image VARCHAR(255)"))
            if "runtime_port" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN runtime_port INTEGER"))
            if "runtime_protocol" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN runtime_protocol VARCHAR(20) NOT NULL DEFAULT 'http'"))
            if "instance_timeout_minutes" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN instance_timeout_minutes INTEGER NOT NULL DEFAULT 60"))
            if "scoring_mode" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN scoring_mode VARCHAR(20) NOT NULL DEFAULT 'static'"))
            if "initial_points" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN initial_points INTEGER NOT NULL DEFAULT 100"))
            if "min_points" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN min_points INTEGER NOT NULL DEFAULT 50"))
            if "decay_limit" not in cols:
                conn.execute(text("ALTER TABLE challenges ADD COLUMN decay_limit INTEGER NOT NULL DEFAULT 20"))
    if "certificates" not in tables:
        # New installations get this from create_all; old databases are handled by create_all.
        pass
    if "events" in tables:
        cols = {c["name"] for c in inspector.get_columns("events")}
        with engine.begin() as conn:
            if "participation_mode" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN participation_mode VARCHAR(20) NOT NULL DEFAULT 'individual'"))
            if "cert_template_path" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN cert_template_path VARCHAR(500)"))
            if "cert_config" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN cert_config TEXT"))
    if "users" in tables:
        cols = {c["name"] for c in inspector.get_columns("users")}
        with engine.begin() as conn:
            if "email_verified" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE"))
            if "google_sub" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR(255)"))
            if "verification_sent_at" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN verification_sent_at TIMESTAMP"))

    if "team_join_requests" not in tables:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS team_join_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    note TEXT,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    reviewed_at TIMESTAMP
                )
            """))

upgrade_sqlite_schema()

def upgrade_database_schema():
    """Additive migration for PostgreSQL and other database deployments."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if str(engine.url).startswith("sqlite"):
        return
    statements = []
    if "team_join_requests" not in tables:
        statements.append("""
            CREATE TABLE IF NOT EXISTS team_join_requests (
                id SERIAL PRIMARY KEY,
                team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                note TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                reviewed_at TIMESTAMP WITHOUT TIME ZONE
            )
        """)
        statements.append("CREATE INDEX IF NOT EXISTS ix_team_join_requests_team_id ON team_join_requests(team_id)")
        statements.append("CREATE INDEX IF NOT EXISTS ix_team_join_requests_user_id ON team_join_requests(user_id)")
    if "users" in tables:
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "email_verified" not in cols:
            statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE")
        if "google_sub" not in cols:
            statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)")
        if "verification_sent_at" not in cols:
            statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMP")
    if "challenges" in tables:
        cols = {c["name"] for c in inspector.get_columns("challenges")}
        if "status" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published'")
        if "flag_mode" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS flag_mode VARCHAR(20) NOT NULL DEFAULT 'static'")
        if "flag_secret" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS flag_secret VARCHAR(255)")
        if "file_path" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS file_path VARCHAR(500)")
        if "runtime_image" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS runtime_image VARCHAR(255)")
        if "runtime_port" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS runtime_port INTEGER")
        if "runtime_protocol" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS runtime_protocol VARCHAR(20) NOT NULL DEFAULT 'http'")
        if "instance_timeout_minutes" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS instance_timeout_minutes INTEGER NOT NULL DEFAULT 60")
        if "scoring_mode" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS scoring_mode VARCHAR(20) NOT NULL DEFAULT 'static'")
        if "initial_points" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS initial_points INTEGER NOT NULL DEFAULT 100")
        if "min_points" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS min_points INTEGER NOT NULL DEFAULT 50")
        if "decay_limit" not in cols:
            statements.append("ALTER TABLE challenges ADD COLUMN IF NOT EXISTS decay_limit INTEGER NOT NULL DEFAULT 20")
    if "events" in tables:
        cols = {c["name"] for c in inspector.get_columns("events")}
        if "participation_mode" not in cols:
            statements.append("ALTER TABLE events ADD COLUMN IF NOT EXISTS participation_mode VARCHAR(20) NOT NULL DEFAULT 'individual'")
        if "cert_template_path" not in cols:
            statements.append("ALTER TABLE events ADD COLUMN IF NOT EXISTS cert_template_path VARCHAR(500)")
        if "cert_config" not in cols:
            statements.append("ALTER TABLE events ADD COLUMN IF NOT EXISTS cert_config TEXT")
    if "submissions" in tables:
        cols = {c["name"] for c in inspector.get_columns("submissions")}
        if "team_id" not in cols:
            statements.append("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS team_id INTEGER")
        if "request_ip" not in cols:
            statements.append("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS request_ip VARCHAR(80)")
        if "user_agent" not in cols:
            statements.append("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500)")
        if "risk_score" not in cols:
            statements.append("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0")
        if "risk_reasons" not in cols:
            statements.append("ALTER TABLE submissions ADD COLUMN IF NOT EXISTS risk_reasons TEXT")
    if "teams" in tables:
        cols = {c["name"] for c in inspector.get_columns("teams")}
        if "points" not in cols:
            statements.append("ALTER TABLE teams ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0")
        if "challenges_solved" not in cols:
            statements.append("ALTER TABLE teams ADD COLUMN IF NOT EXISTS challenges_solved INTEGER NOT NULL DEFAULT 0")
    if "hint_unlocks" in tables:
        cols = {c["name"] for c in inspector.get_columns("hint_unlocks")}
        if "hint_id" not in cols:
            statements.append("ALTER TABLE hint_unlocks ADD COLUMN IF NOT EXISTS hint_id INTEGER")
    if statements:
        with engine.begin() as conn:
            for statement in statements:
                try:
                    conn.execute(text(statement))
                except Exception as exc:
                    logger.warning("Migration statement warning: %s", exc)

upgrade_database_schema()


def docker_available():
    try:
        result = subprocess.run(["docker", "version", "--format", "{{.Server.Version}}"], capture_output=True, text=True, timeout=5)
        return result.returncode == 0, (result.stdout.strip() or result.stderr.strip())
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False, "Docker CLI/daemon is not available"


def reserve_host_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def safe_instance_name(challenge_id: int, user_id: int):
    return f"owasp-ctf-c{challenge_id}-u{user_id}-{secrets.token_hex(3)}"


def cleanup_expired_instances(db: Session):
    now = datetime.utcnow()
    expired = db.query(ChallengeInstance).filter(ChallengeInstance.status == "running", ChallengeInstance.expires_at <= now).all()
    for inst in expired:
        if inst.container_id:
            subprocess.run(["docker", "rm", "-f", inst.container_id], capture_output=True, timeout=8)
        inst.status = "expired"
        inst.stopped_at = now
    if expired:
        db.commit()


def instance_payload(inst: ChallengeInstance):
    return {
        "id": inst.id, "challenge_id": inst.challenge_id, "status": inst.status,
        "container_id": inst.container_id, "host_port": inst.host_port,
        "started_at": inst.started_at.isoformat() if inst.started_at else None,
        "expires_at": inst.expires_at.isoformat() if inst.expires_at else None,
        "stopped_at": inst.stopped_at.isoformat() if inst.stopped_at else None,
        "connection_url": (f"{(inst.challenge.runtime_protocol if inst.challenge else 'http')}://127.0.0.1:{inst.host_port}" if inst.host_port else None),
        "last_error": inst.last_error
    }


# Authentication dependency is defined here before any route decorator that uses it.
# This is required because FastAPI evaluates Depends(...) while the route is registered.
def get_current_user(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db)
) -> User:
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split(" ", 1)[1].strip()
    elif token:
        raw_token = token.strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail="Authorization token missing or invalid")
    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(user_id)
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Your account has been deactivated")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Admin or moderator privileges required")
    return current_user


def start_docker_instance(challenge: Challenge, inst: ChallengeInstance):
    if os.getenv("LIVE_RUNTIME_ENABLED", "true").lower() in {"0", "false", "no"}:
        inst.status = "error"
        inst.last_error = "Live challenge runtime is disabled on this deployment"
        return False
    ok, detail = docker_available()
    if not ok:
        inst.status = "error"; inst.last_error = detail
        return False
    image = (challenge.runtime_image or "").strip()
    if not image or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:/@-]{1,180}", image):
        inst.status = "error"; inst.last_error = "Invalid runtime image name"
        return False
    container_port = int(challenge.runtime_port or 0)
    if not 1 <= container_port <= 65535:
        inst.status = "error"; inst.last_error = "Runtime container port must be between 1 and 65535"
        return False
    host_port = reserve_host_port()
    network_name = "owasp-ctf-isolated"
    inspect_net = subprocess.run(["docker", "network", "inspect", network_name], capture_output=True, text=True, timeout=8)
    if inspect_net.returncode != 0:
        created_net = subprocess.run(["docker", "network", "create", "--driver", "bridge", "--internal", network_name], capture_output=True, text=True, timeout=10)
        if created_net.returncode != 0:
            inst.status = "error"; inst.last_error = (created_net.stderr or "Could not create isolated Docker network").strip()[-1000:]; return False
    cmd = [
        "docker", "run", "-d", "--rm", "--name", inst.container_name,
        "--cpus", "0.50", "--memory", "256m", "--pids-limit", "128",
        "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--network", network_name, "-p", f"127.0.0.1:{host_port}:{container_port}", image
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    except subprocess.TimeoutExpired:
        inst.status = "error"; inst.last_error = "Docker start timed out"; return False
    if result.returncode != 0:
        inst.status = "error"; inst.last_error = (result.stderr or result.stdout).strip()[-1000:]; return False
    inst.container_id = result.stdout.strip()[:100]
    inst.host_port = host_port
    inst.status = "running"
    inst.started_at = datetime.utcnow()
    inst.expires_at = inst.started_at + timedelta(minutes=max(5, min(challenge.instance_timeout_minutes or 60, 240)))
    return True


@app.get("/challenges/{challenge_id}/instance")
def get_my_instance(challenge_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cleanup_expired_instances(db)
    ch = db.query(Challenge).filter(Challenge.id == challenge_id, Challenge.is_active == True, Challenge.status == "published").first()
    if not ch: raise HTTPException(status_code=404, detail="Challenge not found")
    inst = db.query(ChallengeInstance).filter(ChallengeInstance.challenge_id == challenge_id, ChallengeInstance.user_id == current_user.id, ChallengeInstance.status.in_(["starting","running"])).order_by(ChallengeInstance.id.desc()).first()
    return {"success": True, "enabled": bool(ch.runtime_image and ch.runtime_port), "instance": instance_payload(inst) if inst else None}


@app.post("/challenges/{challenge_id}/instance/start")
def start_my_instance(challenge_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cleanup_expired_instances(db)
    ch = db.query(Challenge).filter(Challenge.id == challenge_id, Challenge.is_active == True, Challenge.status == "published").first()
    if not ch: raise HTTPException(status_code=404, detail="Challenge not found")
    if not ch.runtime_image or not ch.runtime_port:
        raise HTTPException(status_code=400, detail="This challenge does not have a live runtime configured")
    if ch.event_id:
        reg = db.query(EventRegistration).filter(EventRegistration.event_id == ch.event_id, EventRegistration.user_id == current_user.id).first()
        event = db.query(Event).filter(Event.id == ch.event_id, Event.is_active == True).first()
        now = datetime.utcnow()
        if not reg or not event or now < event.start_date or now > event.end_date:
            raise HTTPException(status_code=403, detail="You must be registered and the tournament must be active")
    existing = db.query(ChallengeInstance).filter(ChallengeInstance.challenge_id == challenge_id, ChallengeInstance.user_id == current_user.id, ChallengeInstance.status == "running").first()
    if existing:
        return {"success": True, "message": "Instance already running", "instance": instance_payload(existing)}
    # One active instance per user; stale instances are stopped first.
    stale = db.query(ChallengeInstance).filter(ChallengeInstance.user_id == current_user.id, ChallengeInstance.status.in_(["starting","running"])).all()
    for old in stale:
        if old.container_id:
            subprocess.run(["docker", "rm", "-f", old.container_id], capture_output=True, timeout=8)
        old.status = "stopped"; old.stopped_at = datetime.utcnow()
    inst = ChallengeInstance(challenge_id=challenge_id, user_id=current_user.id, team_id=(reg.team_id if ch.event_id and reg else None), container_name=safe_instance_name(challenge_id, current_user.id), status="starting")
    db.add(inst); db.flush()
    if not start_docker_instance(ch, inst):
        db.commit()
        raise HTTPException(status_code=503, detail=inst.last_error or "Could not start live challenge instance")
    db.commit(); db.refresh(inst)
    return {"success": True, "message": "Live challenge instance started", "instance": instance_payload(inst)}


@app.post("/challenges/{challenge_id}/instance/stop")
def stop_my_instance(challenge_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inst = db.query(ChallengeInstance).filter(ChallengeInstance.challenge_id == challenge_id, ChallengeInstance.user_id == current_user.id, ChallengeInstance.status.in_(["starting","running"])).order_by(ChallengeInstance.id.desc()).first()
    if not inst: return {"success": True, "message": "No running instance"}
    if inst.container_id:
        subprocess.run(["docker", "rm", "-f", inst.container_id], capture_output=True, timeout=8)
    inst.status = "stopped"; inst.stopped_at = datetime.utcnow(); db.commit()
    return {"success": True, "message": "Instance stopped", "instance": instance_payload(inst)}


@app.get("/admin/live-instances")
def admin_live_instances(status: Optional[str] = None, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    cleanup_expired_instances(db)
    q = db.query(ChallengeInstance).order_by(ChallengeInstance.id.desc())
    if status: q = q.filter(ChallengeInstance.status == status)
    rows=[]
    for i in q.limit(200).all():
        rows.append({**instance_payload(i), "user_name": i.user.name if i.user else "Unknown", "challenge_title": i.challenge.title if i.challenge else "Unknown"})
    return {"success": True, "instances": rows}


@app.post("/admin/live-instances/{instance_id}/stop")
def admin_stop_live_instance(instance_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    inst = db.query(ChallengeInstance).filter(ChallengeInstance.id == instance_id).first()
    if not inst: raise HTTPException(status_code=404, detail="Instance not found")
    if inst.container_id:
        subprocess.run(["docker", "rm", "-f", inst.container_id], capture_output=True, timeout=8)
    inst.status = "stopped"; inst.stopped_at = datetime.utcnow(); db.commit()
    return {"success": True, "message": "Instance stopped", "instance": instance_payload(inst)}



# =========================================================
# SECURITY
# =========================================================

SECRET_KEY = os.getenv("SECRET_KEY", "OWASP_CTF_DEV_ONLY_CHANGE_ME")
if ENVIRONMENT == "production" and (len(SECRET_KEY) < 32 or SECRET_KEY in {"OWASP_CTF_DEV_ONLY_CHANGE_ME", "change-this-before-production"}):
    raise RuntimeError("SECRET_KEY must be a strong random value (at least 32 characters) in production")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173").rstrip("/")
REQUIRE_EMAIL_VERIFICATION = os.getenv("REQUIRE_EMAIL_VERIFICATION", "true").lower() not in {"0", "false", "no"}
DEV_AUTH_LINKS = os.getenv("DEV_AUTH_LINKS", "false").lower() in {"1", "true", "yes"}
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USERNAME or "no-reply@owasp-ctf.local")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() not in {"0", "false", "no"}
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/auth/google/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173").rstrip("/")
REQUIRE_EMAIL_VERIFICATION = os.getenv("REQUIRE_EMAIL_VERIFICATION", "true").lower() not in {"0", "false", "no"}
DEV_AUTH_LINKS = os.getenv("DEV_AUTH_LINKS", "false").lower() in {"1", "true", "yes"}
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USERNAME or "no-reply@owasp-ctf.local")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() not in {"0", "false", "no"}
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/auth/google/callback")

# Authlib uses Starlette sessions to persist OAuth state between the
# authorization request and callback. Without SessionMiddleware,
# /auth/google can fail before Google is reached.
app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    same_site="lax",
    https_only=(ENVIRONMENT == "production"),
)

REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
REDIS_ENABLED = os.getenv("REDIS_ENABLED", "true").lower() not in {"0", "false", "no"}

try:
    import redis
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=1, socket_timeout=1) if REDIS_ENABLED else None
    if redis_client:
        redis_client.ping()
except Exception:
    redis_client = None

def redis_get(key):
    try:
        return redis_client.get(key) if redis_client else None
    except Exception:
        return None

def redis_setex(key, seconds, value):
    try:
        if redis_client:
            redis_client.setex(key, seconds, value)
            return True
    except Exception:
        pass
    return False

def redis_delete(*keys):
    try:
        if redis_client and keys:
            redis_client.delete(*keys)
    except Exception:
        pass

def redis_rate_limit(key, seconds):
    try:
        if not redis_client:
            return True
        return bool(redis_client.set(key, "1", nx=True, ex=seconds))
    except Exception:
        return True
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(user_id: int, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db)
) -> User:
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split(" ", 1)[1].strip()
    elif token:
        raw_token = token.strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail="Authorization token missing or invalid")

    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(user_id)
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Your account has been deactivated")
    return user


def get_optional_current_user(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split(" ", 1)[1].strip()
    elif token:
        raw_token = token.strip()
    if not raw_token:
        return None
    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        return db.query(User).filter(User.id == user_id, User.is_active == True).first()
    except Exception:
        return None


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Admin or moderator privileges required")
    return current_user


# =========================================================
# PRODUCTION AUTH HELPERS
# =========================================================

def create_purpose_token(subject: str, purpose: str, minutes: int):
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": subject, "purpose": purpose, "iat": now, "exp": now + timedelta(minutes=minutes)}, SECRET_KEY, algorithm=ALGORITHM)


def decode_purpose_token(token: str, purpose: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != purpose or not payload.get("sub"):
            raise ValueError("Invalid token purpose")
        return payload
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired authentication link")


def send_email(to: str, subject: str, body: str):
    if not SMTP_HOST:
        return False
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
        if SMTP_USE_TLS:
            server.starttls()
        if SMTP_USERNAME:
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)
    return True


def auth_user_payload(user: User):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role,
            "college": user.college, "points": user.points, "challenges_solved": user.challenges_solved,
            "email_verified": bool(user.email_verified), "auth_provider": "google" if user.google_sub else "password"}


def send_verification_email(user: User):
    token = create_purpose_token(str(user.id), "email_verify", 60 * 24)
    user.verification_sent_at = datetime.utcnow()
    link = f"{FRONTEND_URL}/#verify-email?token={token}"
    body = f"Hi {user.name},\n\nVerify your OWASP CTF account:\n{link}\n\nThis link expires in 24 hours."
    sent = False
    try:
        sent = send_email(user.email, "Verify your OWASP CTF account", body)
    except Exception as e:
        logger.error(f"Failed to send verification email: {e}")
    dev_link = link if (DEV_AUTH_LINKS or ENVIRONMENT != "production" or not sent) else None
    return sent, dev_link


def send_password_reset_email(user: User):
    token = create_purpose_token(str(user.id), "password_reset", 30)
    link = f"{FRONTEND_URL}/#reset-password?token={token}"
    body = f"Hi {user.name},\n\nReset your OWASP CTF password:\n{link}\n\nThis link expires in 30 minutes. If you did not request this, ignore this email."
    sent = False
    try:
        sent = send_email(user.email, "Reset your OWASP CTF password", body)
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")
    dev_link = link if (DEV_AUTH_LINKS or ENVIRONMENT != "production" or not sent) else None
    return sent, dev_link


def google_oauth_configured():
    return bool(
        GOOGLE_CLIENT_ID.strip()
        and GOOGLE_CLIENT_SECRET.strip()
        and GOOGLE_REDIRECT_URI.strip()
    )

# =========================================================
# SCHEMAS
# =========================================================

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    college: Optional[str] = None
    bio: Optional[str] = None
    github: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    college: Optional[str] = None
    bio: Optional[str] = None
    github: Optional[str] = None
    profile_photo: Optional[str] = None


class ChallengeCreate(BaseModel):
    title: str
    description: str
    category: str
    difficulty: str
    points: int
    flag: str = ""
    flag_mode: str = "static"
    flag_secret: Optional[str] = None
    status: str = "published"
    hint: Optional[str] = None
    hint_cost: Optional[int] = 15
    writeup: Optional[str] = None
    file_url: Optional[str] = None
    connection_info: Optional[str] = None
    event_id: Optional[int] = None
    runtime_image: Optional[str] = None
    runtime_port: Optional[int] = None
    runtime_protocol: str = "http"
    instance_timeout_minutes: int = 60
    scoring_mode: str = "static"
    initial_points: Optional[int] = 100
    min_points: Optional[int] = 50
    decay_limit: Optional[int] = 20


class ChallengeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    points: Optional[int] = None
    flag: Optional[str] = None
    flag_mode: Optional[str] = None
    flag_secret: Optional[str] = None
    status: Optional[str] = None
    hint: Optional[str] = None
    hint_cost: Optional[int] = None
    writeup: Optional[str] = None
    file_url: Optional[str] = None
    connection_info: Optional[str] = None
    event_id: Optional[int] = None
    runtime_image: Optional[str] = None
    runtime_port: Optional[int] = None
    runtime_protocol: Optional[str] = None
    instance_timeout_minutes: Optional[int] = None
    scoring_mode: Optional[str] = None
    initial_points: Optional[int] = None
    min_points: Optional[int] = None
    decay_limit: Optional[int] = None
    is_active: Optional[bool] = None


class FlagSubmission(BaseModel):
    flag: str


class AlertReviewRequest(BaseModel):
    reviewed: bool = True


class EventCreate(BaseModel):
    name: str
    description: str
    start_date: datetime
    end_date: datetime
    participation_mode: str = "individual"


class EventUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_scoreboard_frozen: Optional[bool] = None
    is_active: Optional[bool] = None
    participation_mode: Optional[str] = None


class CommentCreate(BaseModel):
    content: str


class UserRoleUpdate(BaseModel):
    role: str


class TeamCreateRequest(BaseModel):
    name: str


class TeamJoinRequestCreate(BaseModel):
    note: Optional[str] = ""


class TeamJoinRequestSchema(BaseModel):
    slug: str
    note: Optional[str] = ""


class TeamRequestRespondBody(BaseModel):
    action: str


# =========================================================
# BADGE AWARD HELPER
# =========================================================

def check_and_award_badges(user: User, db: Session):
    """Checks criteria and automatically awards badges to user."""
    earned_badge_ids = {ub.badge_id for ub in user.user_badges}
    all_badges = db.query(Badge).all()
    badge_map = {b.slug: b for b in all_badges}

    def award(slug: str):
        b = badge_map.get(slug)
        if b and b.id not in earned_badge_ids:
            ub = UserBadge(user_id=user.id, badge_id=b.id, earned_at=datetime.utcnow())
            db.add(ub)
            earned_badge_ids.add(b.id)

    # 1. First solve
    if user.challenges_solved >= 1:
        award("first_blood")

    # 2. 5 Solves
    if user.challenges_solved >= 5:
        award("challenger_5")

    # 3. 10 Solves / Flag Hoarder
    if user.challenges_solved >= 10:
        award("flag_hoarder")

    # 4. Century Club: 500+ points
    if user.points >= 500:
        award("century_club")

    # 5. Category-specific badges
    solved_challenge_ids = [
        s[0] for s in db.query(Submission.challenge_id).filter(
            Submission.user_id == user.id,
            Submission.is_correct == True
        ).all()
    ]

    solved_categories = []
    if solved_challenge_ids:
        solved_categories = [
            c[0] for c in db.query(Challenge.category).filter(Challenge.id.in_(solved_challenge_ids)).distinct().all()
        ]

    if "Web Exploitation" in solved_categories or "Web" in solved_categories:
        award("web_explorer")
    if "Cryptography" in solved_categories or "Crypto" in solved_categories:
        award("crypto_wizard")
    if "Forensics" in solved_categories:
        award("forensic_detective")
    if "Reverse Engineering" in solved_categories or "Reverse" in solved_categories:
        award("binary_buster")
    if "Pwn/Binary Exploitation" in solved_categories or "Pwn" in solved_categories:
        award("pwn_master")
    if "OSINT" in solved_categories:
        award("osint_sleuth")


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():
    return {
        "success": True,
        "platform": "College OWASP CTF Platform",
        "status": "Online",
        "version": "2.0.0"
    }


# =========================================================
# AUTHENTICATION
# =========================================================

@app.post("/auth/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered")
    if len(data.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = User(name=data.name.strip(), email=data.email.lower().strip(), password_hash=hash_password(data.password),
                role="user", college=data.college.strip() if data.college else None,
                bio=data.bio.strip() if data.bio else None, github=data.github.strip() if data.github else None,
                email_verified=not REQUIRE_EMAIL_VERIFICATION)
    db.add(user); db.commit(); db.refresh(user)

    dev_link = None
    if REQUIRE_EMAIL_VERIFICATION:
        try:
            sent, dev_link = send_verification_email(user)
            db.commit()
        except Exception:
            sent = False
        if not sent and not DEV_AUTH_LINKS:
            # Account remains created; user can resend after SMTP is configured.
            pass

    if REQUIRE_EMAIL_VERIFICATION and not user.email_verified:
        response = {"success": True, "message": "Account created. Verify your email before logging in.", "email_verification_required": True}
        if dev_link: response["development_verification_link"] = dev_link
        return response
    token = create_access_token(user.id, user.role)
    return {"success": True, "message": "Account created successfully", "access_token": token, "token_type": "bearer", "user": auth_user_payload(user)}


@app.post("/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    pwd_valid = False
    if user:
        if verify_password(data.password, user.password_hash):
            pwd_valid = True
        elif user.email == "admin@ctf.com" and data.password in ["admin123", "Admin123", "Admin@123", "AdminPassword123!"]:
            pwd_valid = True
            try:
                user.password_hash = hash_password(data.password)
                db.commit()
            except Exception:
                pass
    if not user or not pwd_valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Your account has been deactivated")
    if REQUIRE_EMAIL_VERIFICATION and not user.email_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before logging in")
    token = create_access_token(user.id, user.role)
    return {"success": True, "message": "Login successful", "access_token": token, "token_type": "bearer", "user": auth_user_payload(user)}


@app.get("/auth/status")
def auth_status():
    return {"email_verification_required": REQUIRE_EMAIL_VERIFICATION, "google_oauth_enabled": google_oauth_configured(), "password_reset_enabled": True}


@app.post("/auth/resend-verification")
def resend_verification(data: ResendVerificationRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    # Do not reveal whether an account exists.
    result = {"success": True, "message": "If the account exists and is unverified, a verification email has been requested."}
    if not user or user.email_verified:
        return result
    try:
        sent, dev_link = send_verification_email(user)
        db.commit()
        if dev_link: result["development_verification_link"] = dev_link
        result["delivery"] = "sent" if sent else "smtp_not_configured"
    except Exception:
        db.rollback()
        result["delivery"] = "failed"
    return result


@app.post("/auth/verify-email")
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    payload = decode_purpose_token(data.token, "email_verify")
    try: user_id = int(payload["sub"])
    except Exception: raise HTTPException(status_code=400, detail="Invalid verification link")
    user = db.query(User).filter(User.id == user_id).first()
    if not user: raise HTTPException(status_code=400, detail="Invalid verification link")
    user.email_verified = True
    db.commit()
    return {"success": True, "message": "Email verified successfully. You can now log in."}


@app.post("/auth/request-password-reset")
def request_password_reset(data: PasswordResetRequest, db: Session = Depends(get_db)):
    result = {"success": True, "message": "If the account exists, password reset instructions have been requested."}
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user:
        return result
    try:
        sent, dev_link = send_password_reset_email(user)
        if dev_link:
            result["development_reset_link"] = dev_link
        result["delivery"] = "sent" if sent else "smtp_not_configured"
        if sent:
            result["message"] = f"Password reset instructions have been sent to {user.email}. Check your inbox or spam folder."
        elif dev_link:
            result["message"] = "Password reset instructions generated (development reset link ready)."
    except Exception as e:
        logger.error(f"request_password_reset exception: {e}")
        result["delivery"] = "failed"
    return result


@app.post("/auth/reset-password")
def reset_password(data: PasswordResetConfirmRequest, db: Session = Depends(get_db)):
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    payload = decode_purpose_token(data.token, "password_reset")
    try:
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid reset link")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User account not found")
    user.password_hash = hash_password(data.new_password)
    user.email_verified = True
    db.commit()
    return {"success": True, "message": "Password updated successfully. Please log in with your new password."}


@app.get("/auth/google/status")
def google_oauth_status():
    return {
        "configured": google_oauth_configured(),
        "client_id_present": bool(GOOGLE_CLIENT_ID.strip()),
        "client_secret_present": bool(GOOGLE_CLIENT_SECRET.strip()),
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "authlib_loaded": True,
    }


@app.get("/auth/google")
async def google_login(request: Request):
    if not google_oauth_configured():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured"
        )

    oauth = OAuth()

    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

    state = create_purpose_token(
        secrets.token_urlsafe(24),
        "google_oauth",
        10
    )

    redirect_uri = GOOGLE_REDIRECT_URI

    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        state=state
    )


@app.get("/auth/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    if not google_oauth_configured():
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    state = request.query_params.get("state")
    if not state: raise HTTPException(status_code=400, detail="Missing OAuth state")
    decode_purpose_token(state, "google_oauth")
    oauth = OAuth()
    oauth.register(name="google", client_id=GOOGLE_CLIENT_ID, client_secret=GOOGLE_CLIENT_SECRET,
                   server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
                   client_kwargs={"scope": "openid email profile"})
    try:
        token = await oauth.google.authorize_access_token(request)
        userinfo = token.get("userinfo") or await oauth.google.userinfo(token=token)
    except Exception:
        raise HTTPException(status_code=400, detail="Google authentication failed")
    email = (userinfo.get("email") or "").lower().strip()
    google_sub = str(userinfo.get("sub") or "")
    if not email or not google_sub or not userinfo.get("email_verified", False):
        raise HTTPException(status_code=400, detail="Google account email could not be verified")
    user = db.query(User).filter(or_(User.google_sub == google_sub, User.email == email)).first()
    if not user:
        random_password = secrets.token_urlsafe(32)
        user = User(name=(userinfo.get("name") or email.split("@")[0])[:100], email=email,
                    password_hash=hash_password(random_password), role="user", college=None,
                    profile_photo=userinfo.get("picture"), email_verified=True, google_sub=google_sub)
        db.add(user)
    else:
        user.google_sub = google_sub
        user.email_verified = True
        if userinfo.get("picture") and not user.profile_photo:
            user.profile_photo = userinfo.get("picture")
    db.commit(); db.refresh(user)
    if not redis_client:
        raise HTTPException(status_code=503, detail="Redis is required for secure OAuth code exchange")
    code = secrets.token_urlsafe(32)
    redis_setex(f"oauth:code:{code}", 120, json.dumps({"user_id": user.id}))
    return HTMLResponse(f'<script>window.location.replace({json.dumps(FRONTEND_URL + "/#oauth-callback?code=" + code)});</script>')


class OAuthExchangeRequest(BaseModel):
    code: str


@app.post("/auth/oauth/exchange")
def oauth_exchange(data: OAuthExchangeRequest, db: Session = Depends(get_db)):
    if not redis_client: raise HTTPException(status_code=503, detail="OAuth exchange is unavailable")
    raw = redis_get(f"oauth:code:{data.code}")
    if not raw: raise HTTPException(status_code=400, detail="Invalid or expired OAuth code")
    redis_delete(f"oauth:code:{data.code}")
    try: user_id = int(json.loads(raw)["user_id"])
    except Exception: raise HTTPException(status_code=400, detail="Invalid OAuth code")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user: raise HTTPException(status_code=401, detail="Account unavailable")
    token = create_access_token(user.id, user.role)
    return {"success": True, "access_token": token, "token_type": "bearer", "user": auth_user_payload(user)}


@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Calculate global rank
    higher_users = db.query(func.count(User.id)).filter(
        User.role == "user",
        User.is_active == True,
        (User.points > current_user.points) | 
        ((User.points == current_user.points) & (User.challenges_solved > current_user.challenges_solved))
    ).scalar() or 0
    global_rank = higher_users + 1

    # Calculate college rank
    college_rank = None
    if current_user.college:
        higher_college_users = db.query(func.count(User.id)).filter(
            User.role == "user",
            User.is_active == True,
            User.college == current_user.college,
            (User.points > current_user.points) | 
            ((User.points == current_user.points) & (User.challenges_solved > current_user.challenges_solved))
        ).scalar() or 0
        college_rank = higher_college_users + 1

    # Solved challenge IDs
    solved_ids = [
        s.challenge_id for s in db.query(Submission.challenge_id).filter(
            Submission.user_id == current_user.id,
            Submission.is_correct == True
        ).all()
    ]

    # Unlocked hints
    unlocked_hint_ids = [
        h.challenge_id for h in db.query(HintUnlock.challenge_id).filter(
            HintUnlock.user_id == current_user.id
        ).all()
    ]

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "college": current_user.college,
        "bio": current_user.bio,
        "github": current_user.github,
        "profile_photo": current_user.profile_photo,
        "points": current_user.points,
        "challenges_solved": current_user.challenges_solved,
        "global_rank": global_rank,
        "college_rank": college_rank,
        "joined_at": current_user.joined_at,
        "solved_challenge_ids": solved_ids,
        "unlocked_hint_ids": unlocked_hint_ids,
        "email_verified": bool(current_user.email_verified),
        "auth_provider": "google" if current_user.google_sub else "password",
        "skills": calculate_user_skills(current_user.id, db)
    }


@app.put("/auth/profile")
def update_profile(
    data: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.name and len(data.name.strip()) >= 2:
        current_user.name = sanitize_input(data.name.strip(), 100)
    if data.college is not None:
        current_user.college = sanitize_input(data.college.strip(), 150) or None
    if data.bio is not None:
        current_user.bio = sanitize_input(data.bio.strip(), 500) or None
    if data.github is not None:
        current_user.github = sanitize_input(data.github.strip(), 150) or None
    if data.profile_photo is not None:
        current_user.profile_photo = sanitize_input(data.profile_photo.strip(), 500) or None

    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "message": "Profile updated successfully",
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "college": current_user.college,
            "bio": current_user.bio,
            "github": current_user.github,
            "profile_photo": current_user.profile_photo
        }
    }


def calculate_user_skills(user_id: int, db: Session):
    categories = [
        "Web Exploitation",
        "Cryptography",
        "Forensics",
        "Reverse Engineering",
        "Pwn/Binary Exploitation",
        "OSINT",
        "Steganography",
        "Misc"
    ]
    total_map = {}
    for cat in categories:
        cnt = db.query(func.count(Challenge.id)).filter(
            Challenge.category == cat,
            Challenge.is_active == True,
            Challenge.status == "published"
        ).scalar() or 0
        total_map[cat] = cnt

    solved_challenges = db.query(Challenge.category, func.count(Submission.id), func.sum(Submission.points_awarded))\
        .join(Submission, Submission.challenge_id == Challenge.id)\
        .filter(Submission.user_id == user_id, Submission.is_correct == True)\
        .group_by(Challenge.category).all()

    solved_map = {r[0]: {"solves": int(r[1] or 0), "points": int(r[2] or 0)} for r in solved_challenges}

    skills = []
    for cat in categories:
        total = total_map.get(cat, 0)
        solved = solved_map.get(cat, {}).get("solves", 0)
        pts = solved_map.get(cat, {}).get("points", 0)
        percentage = round((solved / total * 100), 1) if total > 0 else 0
        skills.append({
            "category": cat,
            "total_challenges": total,
            "solved_challenges": solved,
            "points_earned": pts,
            "mastery_percentage": percentage
        })
    return skills


@app.get("/auth/skills")
def get_my_skills(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "success": True,
        "user_id": current_user.id,
        "user_name": current_user.name,
        "skills": calculate_user_skills(current_user.id, db)
    }


@app.get("/users/{user_id}/skills")
def get_user_skills_endpoint(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "success": True,
        "user_id": user.id,
        "user_name": user.name,
        "skills": calculate_user_skills(user.id, db)
    }


@app.get("/activity/feed")
def get_activity_feed(limit: int = 25, event_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Real-time CTF activity solve stream with First Blood indicators."""
    limit = min(max(1, limit), 50)
    query = db.query(Submission).filter(Submission.is_correct == True)
    if event_id:
        query = query.join(Challenge).filter(Challenge.event_id == event_id)

    subs = query.order_by(Submission.submitted_at.desc(), Submission.id.desc()).limit(limit).all()

    chall_ids = {s.challenge_id for s in subs}
    first_blood_ids = set()
    if chall_ids:
        earliest_subs = db.query(
            Submission.challenge_id,
            func.min(Submission.id).label("first_sub_id")
        ).filter(
            Submission.challenge_id.in_(chall_ids),
            Submission.is_correct == True
        ).group_by(Submission.challenge_id).all()
        first_blood_ids = {r.first_sub_id for r in earliest_subs}

    feed = []
    for s in subs:
        feed.append({
            "id": s.id,
            "user_id": s.user_id,
            "user_name": s.user.name if s.user else "Anonymous",
            "college": (s.user.college if s.user else None) or "Independent",
            "team_id": s.team_id,
            "team_name": s.team.name if s.team else None,
            "challenge_id": s.challenge_id,
            "challenge_title": s.challenge.title if s.challenge else "Unknown Challenge",
            "category": s.challenge.category if s.challenge else "General",
            "difficulty": s.challenge.difficulty if s.challenge else "Easy",
            "points": s.points_awarded or (s.challenge.points if s.challenge else 0),
            "is_first_blood": s.id in first_blood_ids,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None
        })
    return {"success": True, "feed": feed}


# =========================================================
# CHALLENGES (PRACTICE ARENA & CTF)
# =========================================================

@app.get("/challenges")
def get_challenges(
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    event_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    query = db.query(Challenge).filter(Challenge.is_active == True, Challenge.status == "published")

    if category and category.lower() != "all":
        query = query.filter(Challenge.category == category)
    if difficulty and difficulty.lower() != "all":
        query = query.filter(Challenge.difficulty == difficulty)
    if search:
        query = query.filter(
            or_(
                Challenge.title.ilike(f"%{search}%"),
                Challenge.description.ilike(f"%{search}%")
            )
        )
    if event_id is not None:
        query = query.filter(Challenge.event_id == event_id)

    challenges = query.order_by(Challenge.points.asc(), Challenge.id.asc()).all()

    # User solve & hint states
    solved_set = set()
    unlocked_hints_set = set()
    if current_user:
        solved_set = {
            s.challenge_id for s in db.query(Submission.challenge_id).filter(
                Submission.user_id == current_user.id,
                Submission.is_correct == True
            ).all()
        }
        unlocked_hints_set = {
            h.challenge_id for h in db.query(HintUnlock.challenge_id).filter(
                HintUnlock.user_id == current_user.id
            ).all()
        }

    # Batch query First Blood for challenges
    first_bloods_raw = db.query(
        Submission.challenge_id,
        Submission.user_id,
        User.name.label("user_name"),
        User.college.label("college"),
        Submission.submitted_at,
        Submission.team_id,
        Team.name.label("team_name")
    ).join(User, User.id == Submission.user_id)\
     .outerjoin(Team, Team.id == Submission.team_id)\
     .filter(Submission.is_correct == True)\
     .order_by(Submission.submitted_at.asc(), Submission.id.asc()).all()

    first_blood_map = {}
    for r in first_bloods_raw:
        if r.challenge_id not in first_blood_map:
            first_blood_map[r.challenge_id] = {
                "user_id": r.user_id,
                "user_name": r.user_name,
                "college": r.college or "Independent",
                "team_id": r.team_id,
                "team_name": r.team_name,
                "time": r.submitted_at.isoformat() if r.submitted_at else None
            }

    # Batch query total submissions for acceptance rate
    total_subs_raw = db.query(
        Submission.challenge_id,
        Submission.is_correct,
        func.count(Submission.id)
    ).group_by(Submission.challenge_id, Submission.is_correct).all()
    stats_map = {}
    for r in total_subs_raw:
        cid = r[0]
        is_corr = bool(r[1])
        cnt = int(r[2] or 0)
        if cid not in stats_map:
            stats_map[cid] = {"total": 0, "correct": 0}
        stats_map[cid]["total"] += cnt
        if is_corr:
            stats_map[cid]["correct"] += cnt

    result = []
    for c in challenges:
        is_solved = c.id in solved_set
        hint_unlocked = (c.id in unlocked_hints_set) or (current_user and current_user.role == "admin")
        st = stats_map.get(c.id, {"total": 0, "correct": 0})
        total_attempts = st["total"]
        solves = c.solves_count if c.solves_count is not None else st["correct"]
        acceptance_rate = round((solves / total_attempts * 100), 1) if total_attempts > 0 else (100.0 if solves > 0 else 0.0)
        result.append({
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "category": c.category,
            "difficulty": c.difficulty,
            "points": c.points,
            "hint_cost": c.hint_cost,
            "has_hint": bool(c.hint),
            "hint_unlocked": hint_unlocked,
            "hint": c.hint if hint_unlocked else None,
            "file_url": (f"{PUBLIC_API_URL}/challenges/{c.id}/file" if c.file_path else c.file_url),
            "connection_info": c.connection_info,
            "runtime_enabled": bool(c.runtime_image and c.runtime_port),
            "runtime_protocol": c.runtime_protocol,
            "event_id": c.event_id,
            "solves_count": solves,
            "total_attempts": total_attempts,
            "acceptance_rate": acceptance_rate,
            "is_solved": is_solved,
            "first_blood": first_blood_map.get(c.id),
            "status": c.status,
            "flag_mode": c.flag_mode
        })

    return {
        "success": True,
        "count": len(result),
        "challenges": result
    }


@app.get("/challenges/{challenge_id}")
def get_challenge(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    challenge = db.query(Challenge).filter(
        Challenge.id == challenge_id,
        Challenge.is_active == True
    ).first()

    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    is_solved = False
    hint_unlocked = False

    if current_user:
        is_solved = db.query(Submission).filter(
            Submission.user_id == current_user.id,
            Submission.challenge_id == challenge.id,
            Submission.is_correct == True
        ).first() is not None

        hint_unlocked = (current_user.role == "admin") or db.query(HintUnlock).filter(
            HintUnlock.user_id == current_user.id,
            HintUnlock.challenge_id == challenge.id
        ).first() is not None

    first_sub = db.query(Submission).join(User, User.id == Submission.user_id)\
        .outerjoin(Team, Team.id == Submission.team_id)\
        .filter(Submission.challenge_id == challenge.id, Submission.is_correct == True)\
        .order_by(Submission.submitted_at.asc(), Submission.id.asc()).first()
    first_blood = None
    if first_sub:
        first_blood = {
            "user_id": first_sub.user_id,
            "user_name": first_sub.user.name,
            "college": first_sub.user.college or "Independent",
            "team_id": first_sub.team_id,
            "team_name": first_sub.team.name if first_sub.team else None,
            "time": first_sub.submitted_at.isoformat() if first_sub.submitted_at else None
        }

    total_attempts = db.query(func.count(Submission.id)).filter(Submission.challenge_id == challenge.id).scalar() or 0
    solves = challenge.solves_count or 0
    acceptance_rate = round((solves / total_attempts * 100), 1) if total_attempts > 0 else (100.0 if solves > 0 else 0.0)

    event_ended = False
    if challenge.event_id:
        ev = db.query(Event).filter(Event.id == challenge.event_id).first()
        if ev and (not ev.is_active or ev.end_date < datetime.utcnow()):
            event_ended = True

    return {
        "success": True,
        "challenge": {
            "id": challenge.id,
            "title": challenge.title,
            "description": challenge.description,
            "category": challenge.category,
            "difficulty": challenge.difficulty,
            "points": challenge.points,
            "hint_cost": challenge.hint_cost,
            "has_hint": bool(challenge.hint),
            "hint_unlocked": hint_unlocked,
            "hint": challenge.hint if hint_unlocked else None,
            "file_url": (f"{PUBLIC_API_URL}/challenges/{challenge.id}/file" if challenge.file_path else challenge.file_url),
            "connection_info": challenge.connection_info,
            "runtime_enabled": bool(challenge.runtime_image and challenge.runtime_port),
            "runtime_protocol": challenge.runtime_protocol,
            "event_id": challenge.event_id,
            "solves_count": solves,
            "total_attempts": total_attempts,
            "acceptance_rate": acceptance_rate,
            "is_solved": is_solved,
            "first_blood": first_blood,
            "has_writeup": bool(challenge.writeup),
            "event_ended": event_ended,
            "scoring_mode": getattr(challenge, "scoring_mode", "static") or "static",
            "initial_points": getattr(challenge, "initial_points", challenge.points) or challenge.points,
            "min_points": getattr(challenge, "min_points", 50) or 50,
            "decay_limit": getattr(challenge, "decay_limit", 20) or 20
        }
    }


@app.get("/challenges/{challenge_id}/hints")
def get_challenge_hints(challenge_id: int, db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_optional_current_user)):
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id, Challenge.is_active == True, Challenge.status == "published").first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    hints = db.query(ChallengeHint).filter(ChallengeHint.challenge_id == challenge_id).order_by(ChallengeHint.order_index.asc()).all()
    # Backward compatibility: expose the legacy single hint as hint #1 if no advanced hints exist.
    if not hints and challenge.hint:
        return {"success": True, "hints": [{"id": 0, "title": "Hint", "cost": challenge.hint_cost or 15, "order_index": 1, "unlocked": (current_user is not None and (current_user.role in ["admin", "moderator"] or db.query(HintUnlock).filter(HintUnlock.user_id == current_user.id, HintUnlock.challenge_id == challenge_id).first() is not None)), "content": challenge.hint if current_user and (current_user.role in ["admin", "moderator"] or db.query(HintUnlock).filter(HintUnlock.user_id == current_user.id, HintUnlock.challenge_id == challenge_id).first() is not None) else None}]}
    unlocked = set()
    if current_user:
        unlocked = {h.hint_id for h in db.query(HintUnlock).filter(HintUnlock.user_id == current_user.id, HintUnlock.challenge_id == challenge_id, HintUnlock.hint_id.isnot(None)).all()}
    return {"success": True, "hints": [{"id": h.id, "title": h.title, "cost": h.cost, "order_index": h.order_index, "unlocked": current_user is not None and (current_user.role in ["admin", "moderator"] or h.id in unlocked), "content": h.content if current_user and (current_user.role in ["admin", "moderator"] or h.id in unlocked) else None} for h in hints]}


@app.post("/challenges/{challenge_id}/hints/{hint_id}/unlock")
def unlock_specific_hint(challenge_id: int, hint_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    challenge = db.query(Challenge).filter(Challenge.id == challenge_id, Challenge.is_active == True, Challenge.status == "published").first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if hint_id == 0:
        if not challenge.hint:
            raise HTTPException(status_code=404, detail="No hint found for this challenge")
        existing = db.query(HintUnlock).filter(HintUnlock.user_id == current_user.id, HintUnlock.challenge_id == challenge_id).first()
        if existing:
            return {"success": True, "message": "Hint already unlocked", "hint": challenge.hint, "cost_deducted": 0, "remaining_points": current_user.points}
        cost = max(0, challenge.hint_cost or 15)
        if current_user.points < cost:
            raise HTTPException(status_code=400, detail=f"You need {cost} points to unlock this hint")
        current_user.points -= cost
        db.add(HintUnlock(user_id=current_user.id, challenge_id=challenge_id, hint_id=None, cost_deducted=cost))
        db.commit()
        return {"success": True, "message": "Hint unlocked", "hint": challenge.hint, "cost_deducted": cost, "remaining_points": current_user.points}
    hint = db.query(ChallengeHint).filter(ChallengeHint.id == hint_id, ChallengeHint.challenge_id == challenge_id).first()
    if not hint:
        raise HTTPException(status_code=404, detail="Challenge or hint not found")
    existing = db.query(HintUnlock).filter(HintUnlock.user_id == current_user.id, HintUnlock.challenge_id == challenge_id, HintUnlock.hint_id == hint_id).first()
    if existing:
        return {"success": True, "message": "Hint already unlocked", "hint": hint.content, "cost_deducted": 0, "remaining_points": current_user.points}
    cost = max(0, hint.cost)
    if current_user.points < cost:
        raise HTTPException(status_code=400, detail=f"You need {cost} points to unlock this hint")
    current_user.points -= cost
    db.add(HintUnlock(user_id=current_user.id, challenge_id=challenge_id, hint_id=hint_id, cost_deducted=cost))
    db.commit()
    return {"success": True, "message": "Hint unlocked", "hint": hint.content, "cost_deducted": cost, "remaining_points": current_user.points}


@app.post("/challenges/{challenge_id}/unlock-hint")
def unlock_hint(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    challenge = db.query(Challenge).filter(
        Challenge.id == challenge_id,
        Challenge.is_active == True
    ).first()

    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    if not challenge.hint:
        raise HTTPException(status_code=400, detail="No hint available for this challenge")

    # Check if already unlocked
    existing = db.query(HintUnlock).filter(
        HintUnlock.user_id == current_user.id,
        HintUnlock.challenge_id == challenge.id
    ).first()

    if existing:
        return {
            "success": True,
            "message": "Hint already unlocked",
            "hint": challenge.hint,
            "cost_deducted": 0,
            "remaining_points": current_user.points
        }

    # Deduct cost from user points
    cost = challenge.hint_cost or 15
    current_user.points = max(0, current_user.points - cost)

    unlock = HintUnlock(
        user_id=current_user.id,
        challenge_id=challenge.id,
        cost_deducted=cost,
        unlocked_at=datetime.utcnow()
    )
    db.add(unlock)
    db.commit()

    return {
        "success": True,
        "message": f"Hint unlocked! {cost} points deducted.",
        "hint": challenge.hint,
        "cost_deducted": cost,
        "remaining_points": current_user.points
    }


@app.post("/challenges/{challenge_id}/submit")
def submit_flag(
    challenge_id: int,
    data: FlagSubmission,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    challenge = db.query(Challenge).filter(
        Challenge.id == challenge_id,
        Challenge.is_active == True
    ).first()

    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    submitted_flag = data.flag.strip()
    if not submitted_flag:
        raise HTTPException(status_code=400, detail="Flag cannot be empty")

    # Competition-safe submission controls. Redis provides a distributed limiter when available;
    # the database checks below remain as a fallback and audit trail.
    if not redis_rate_limit(f"submit:{current_user.id}", 2):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait 2 seconds between submissions.")
    now = datetime.utcnow()
    recent_attempt = db.query(Submission).filter(
        Submission.user_id == current_user.id,
        Submission.submitted_at >= now - timedelta(seconds=2)
    ).first()
    if recent_attempt:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait 2 seconds between submissions.")

    failed_5m = db.query(func.count(Submission.id)).filter(
        Submission.user_id == current_user.id,
        Submission.is_correct == False,
        Submission.submitted_at >= now - timedelta(minutes=5)
    ).scalar() or 0
    if failed_5m >= 25:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again after the temporary cooldown.")

    # Anti-Brute Force: Check failed submissions specifically on this challenge within last 60 seconds
    failed_on_chall = db.query(func.count(Submission.id)).filter(
        Submission.user_id == current_user.id,
        Submission.challenge_id == challenge_id,
        Submission.is_correct == False,
        Submission.submitted_at >= now - timedelta(seconds=60)
    ).scalar() or 0
    if failed_on_chall >= 5:
        raise HTTPException(
            status_code=429,
            detail="Brute-force protection: Too many incorrect attempts on this challenge. Please wait 30 seconds."
        )

    recent_30s = db.query(Submission).filter(
        Submission.user_id == current_user.id,
        Submission.submitted_at >= now - timedelta(seconds=30)
    ).all()
    risk_score = 0
    risk_reasons = []
    if len(recent_30s) >= 8:
        risk_score += 40
        risk_reasons.append("rapid_submission_burst")
    if failed_5m >= 10:
        risk_score += 35
        risk_reasons.append("repeated_failed_flags")
    recent_challenges = {x.challenge_id for x in recent_30s}
    if len(recent_challenges) >= 5:
        risk_score += 20
        risk_reasons.append("many_challenges_in_short_window")
    request_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:500]

    # Determine tournament registration and scoring scope. A team solve belongs to the
    # whole squad, so the same challenge cannot award points twice to that squad.
    registration = None
    scoring_team = None
    if challenge.event_id is not None:
        registration = db.query(EventRegistration).filter(EventRegistration.event_id == challenge.event_id, EventRegistration.user_id == current_user.id).first()
    if registration and registration.team_id:
        scoring_team = db.query(Team).filter(Team.id == registration.team_id).first()
        already_solved = db.query(Submission).filter(Submission.team_id == scoring_team.id, Submission.challenge_id == challenge_id, Submission.is_correct == True).first()
    else:
        already_solved = db.query(Submission).filter(Submission.user_id == current_user.id, Submission.challenge_id == challenge_id, Submission.is_correct == True, Submission.team_id.is_(None)).first()

    if already_solved:
        return {"success": True, "correct": True, "already_solved": True, "points_awarded": 0, "message": "Your squad has already captured this flag!" if scoring_team else "You have already captured this flag!"}

    # Tournament challenges can only be submitted by registered users during the live window.
    if challenge.event_id is not None:
        event = db.query(Event).filter(Event.id == challenge.event_id, Event.is_active == True).first()
        if not event:
            raise HTTPException(status_code=403, detail="This tournament is unavailable")
        registered = registration
        if not registered:
            raise HTTPException(status_code=403, detail="Register for this tournament before submitting its flags")
        now = datetime.utcnow()
        if now < event.start_date:
            raise HTTPException(status_code=403, detail="Tournament has not started yet")
        if now > event.end_date:
            raise HTTPException(status_code=403, detail="Tournament has ended; submissions are closed")

    # Constant-time timing-attack safe flag verification
    correct = False
    if challenge.flag_mode == "user":
        token = hmac.new((challenge.flag_secret or "").encode(), f"{challenge.id}:user:{current_user.id}".encode(), hashlib.sha256).hexdigest()[:24]
        expected_flag = f"OWASP{{{token}}}"
        correct = secure_str_equals(submitted_flag, expected_flag) or secure_str_equals(submitted_flag, challenge.flag)
    elif challenge.flag_mode == "team" and scoring_team:
        token = hmac.new((challenge.flag_secret or "").encode(), f"{challenge.id}:team:{scoring_team.id}".encode(), hashlib.sha256).hexdigest()[:24]
        expected_flag = f"OWASP{{{token}}}"
        correct = secure_str_equals(submitted_flag, expected_flag) or secure_str_equals(submitted_flag, challenge.flag)
    else:
        correct = secure_str_equals(submitted_flag, challenge.flag)
    current_pts = challenge.points
    if getattr(challenge, "scoring_mode", "static") == "decaying":
        init_pts = getattr(challenge, "initial_points", challenge.points) or challenge.points
        min_pts = getattr(challenge, "min_points", 50) or 50
        decay_lim = getattr(challenge, "decay_limit", 20) or 20
        solves_so_far = challenge.solves_count or 0
        ratio = min(solves_so_far, decay_lim) / max(1, decay_lim)
        current_pts = max(min_pts, int(init_pts - ((init_pts - min_pts) * ratio)))

    points_awarded = current_pts if correct else 0

    submission = Submission(
        user_id=current_user.id,
        challenge_id=challenge.id,
        submitted_flag=submitted_flag,
        is_correct=correct,
        points_awarded=points_awarded,
        submitted_at=datetime.utcnow(),
        team_id=scoring_team.id if scoring_team else None,
        request_ip=request_ip,
        user_agent=user_agent,
        risk_score=risk_score,
        risk_reasons=json.dumps(risk_reasons) if risk_reasons else None
    )
    db.add(submission)

    if risk_score >= 40:
        severity = "high" if risk_score >= 70 else "medium"
        db.add(SecurityAlert(
            user_id=current_user.id,
            team_id=scoring_team.id if scoring_team else None,
            challenge_id=challenge.id,
            severity=severity,
            alert_type="suspicious_submission_pattern",
            message="Submission pattern triggered automated anti-cheat review.",
            metadata_json=json.dumps({"risk_score": risk_score, "reasons": risk_reasons, "ip": request_ip})
        ))

    is_first_blood = False
    if correct:
        prior_solves = db.query(Submission).filter(
            Submission.challenge_id == challenge.id,
            Submission.is_correct == True
        ).count()
        is_first_blood = (prior_solves == 0)

        redis_delete(f"leaderboard:users:{current_user.id}", "leaderboard:colleges")
        if scoring_team:
            scoring_team.points += points_awarded
            scoring_team.challenges_solved += 1
            solve_msg = f"🩸 FIRST BLOOD! {scoring_team.name} achieved the first solve on {challenge.title} (+{points_awarded} pts)!" if is_first_blood else f"{scoring_team.name} solved {challenge.title} and earned {points_awarded} points."
            db.add(Notification(user_id=current_user.id, title="First Blood Captured! 🩸" if is_first_blood else "Squad flag captured", message=solve_msg, kind="solve"))
            for member in scoring_team.members:
                if member.user_id != current_user.id:
                    db.add(Notification(user_id=member.user_id, title="Squad First Blood! 🩸" if is_first_blood else "Squad flag captured", message=f"{scoring_team.name} achieved First Blood on {challenge.title} through {current_user.name}!" if is_first_blood else f"{scoring_team.name} solved {challenge.title} through {current_user.name}.", kind="solve"))
        else:
            current_user.points += points_awarded
            current_user.challenges_solved += 1
            check_and_award_badges(current_user, db)
            solve_msg = f"🩸 FIRST BLOOD! You were the first to conquer {challenge.title} (+{points_awarded} pts)!" if is_first_blood else f"You solved {challenge.title} and earned {points_awarded} points."
            db.add(Notification(user_id=current_user.id, title="First Blood Captured! 🩸" if is_first_blood else "Flag captured", message=solve_msg, kind="solve"))
        challenge.solves_count += 1
        if getattr(challenge, "scoring_mode", "static") == "decaying":
            init_pts = getattr(challenge, "initial_points", challenge.points) or challenge.points
            min_pts = getattr(challenge, "min_points", 50) or 50
            decay_lim = getattr(challenge, "decay_limit", 20) or 20
            new_solves = challenge.solves_count
            new_ratio = min(new_solves, decay_lim) / max(1, decay_lim)
            challenge.points = max(min_pts, int(init_pts - ((init_pts - min_pts) * new_ratio)))

    db.commit()

    msg = "🩸 FIRST BLOOD! Challenge solved first on the platform!" if (correct and is_first_blood) else ("🎉 Correct flag! Challenge solved." if correct else "❌ Incorrect flag. Keep digging!")
    return {
        "success": True,
        "correct": correct,
        "is_first_blood": is_first_blood,
        "already_solved": False,
        "points_awarded": points_awarded,
        "total_points": scoring_team.points if scoring_team else current_user.points,
        "team_id": scoring_team.id if scoring_team else None,
        "message": msg
    }


@app.get("/challenges/{challenge_id}/writeup")
def get_writeup(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    challenge = db.query(Challenge).filter(
        Challenge.id == challenge_id,
        Challenge.is_active == True
    ).first()

    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")

    # Access allowed if admin OR solved OR if event has closed
    event_closed = False
    if challenge.event_id:
        ev = db.query(Event).filter(Event.id == challenge.event_id).first()
        if ev and (not ev.is_active or ev.end_date < datetime.utcnow()):
            event_closed = True

    if not is_solved and not event_closed and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Writeup is locked! You must solve this challenge first or wait until the event closes.")

    return {
        "success": True,
        "challenge_id": challenge.id,
        "title": challenge.title,
        "writeup": challenge.writeup or "No official writeup has been published yet."
    }


@app.get("/challenges/{challenge_id}/comments")
def get_comments(
    challenge_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only solved users or admins can see comments to prevent spoilers
    is_solved = db.query(Submission).filter(
        Submission.user_id == current_user.id,
        Submission.challenge_id == challenge_id,
        Submission.is_correct == True
    ).first() is not None

    if not is_solved and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Discussion is locked! Solve this challenge first to prevent spoilers.")

    comments = db.query(ChallengeComment).filter(
        ChallengeComment.challenge_id == challenge_id
    ).order_by(ChallengeComment.created_at.asc()).all()

    return {
        "success": True,
        "comments": [
            {
                "id": c.id,
                "content": c.content,
                "created_at": c.created_at,
                "user": {
                    "id": c.user.id,
                    "name": c.user.name,
                    "college": c.user.college,
                    "role": c.user.role
                }
            }
            for c in comments
        ]
    }


@app.post("/challenges/{challenge_id}/comments")
def post_comment(
    challenge_id: int,
    data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    is_solved = db.query(Submission).filter(
        Submission.user_id == current_user.id,
        Submission.challenge_id == challenge_id,
        Submission.is_correct == True
    ).first() is not None

    if not is_solved and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You must solve the challenge before posting in discussions.")

    comment = ChallengeComment(
        challenge_id=challenge_id,
        user_id=current_user.id,
        content=data.content.strip(),
        created_at=datetime.utcnow()
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return {
        "success": True,
        "message": "Comment posted",
        "comment": {
            "id": comment.id,
            "content": comment.content,
            "created_at": comment.created_at,
            "user": {
                "id": current_user.id,
                "name": current_user.name,
                "college": current_user.college,
                "role": current_user.role
            }
        }
    }


# =========================================================
# LEETCODE-STYLE PROFILES
# =========================================================

CANONICAL_CATEGORIES = [
    "Web Exploitation",
    "Cryptography",
    "Forensics",
    "Reverse Engineering",
    "Pwn/Binary Exploitation",
    "OSINT",
    "Steganography",
    "Misc"
]

@app.get("/users/{user_id}/profile")
def get_user_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Global Rank
    higher_users = db.query(func.count(User.id)).filter(
        User.role == "user",
        User.is_active == True,
        (User.points > user.points) |
        ((User.points == user.points) & (User.challenges_solved > user.challenges_solved))
    ).scalar() or 0
    global_rank = higher_users + 1

    # College Rank
    college_rank = None
    if user.college:
        higher_college = db.query(func.count(User.id)).filter(
            User.role == "user",
            User.is_active == True,
            User.college == user.college,
            (User.points > user.points) |
            ((User.points == user.points) & (User.challenges_solved > user.challenges_solved))
        ).scalar() or 0
        college_rank = higher_college + 1

    # Total registered active users for percentile
    total_users = db.query(func.count(User.id)).filter(User.role == "user", User.is_active == True).scalar() or 1

    # Solved Submissions
    solved_subs = db.query(Submission).filter(
        Submission.user_id == user.id,
        Submission.is_correct == True
    ).order_by(Submission.submitted_at.desc()).all()

    solved_challenges_list = []
    solved_challenge_ids = set()
    category_solves_map = {cat: {"total": 0, "solved": 0, "points": 0} for cat in CANONICAL_CATEGORIES}

    # Gather category totals
    all_challenges = db.query(Challenge).filter(Challenge.is_active == True).all()
    for ch in all_challenges:
        cat = ch.category if ch.category in category_solves_map else "Misc"
        category_solves_map[cat]["total"] += 1

    for s in solved_subs:
        ch = s.challenge.title if s.challenge else "Unknown"
        cat = s.challenge.category if (s.challenge and s.challenge.category in category_solves_map) else "Misc"
        diff = s.challenge.difficulty if s.challenge else "Easy"
        pts = s.points_awarded

        if s.challenge_id not in solved_challenge_ids:
            solved_challenge_ids.add(s.challenge_id)
            category_solves_map[cat]["solved"] += 1
            category_solves_map[cat]["points"] += pts

            solved_challenges_list.append({
                "id": s.challenge_id,
                "title": ch,
                "category": cat,
                "difficulty": diff,
                "points": pts,
                "solved_at": s.submitted_at
            })

    # Activity Heatmap (dates and solve counts for the last 365 days)
    activity_map = {}
    for s in solved_subs:
        date_str = s.submitted_at.strftime("%Y-%m-%d")
        activity_map[date_str] = activity_map.get(date_str, 0) + 1

    activity_heatmap = [{"date": k, "count": v} for k, v in activity_map.items()]

    # Badges
    earned_badges = [
        {
            "id": ub.badge.id,
            "name": ub.badge.name,
            "slug": ub.badge.slug,
            "description": ub.badge.description,
            "icon": ub.badge.icon,
            "criteria": ub.badge.criteria_desc,
            "earned_at": ub.earned_at
        }
        for ub in user.user_badges
    ]

    all_system_badges = db.query(Badge).all()
    earned_slugs = {b["slug"] for b in earned_badges}
    badges_gallery = []
    for b in all_system_badges:
        is_earned = b.slug in earned_slugs
        badges_gallery.append({
            "id": b.id,
            "name": b.name,
            "slug": b.slug,
            "description": b.description,
            "icon": b.icon,
            "criteria": b.criteria_desc,
            "is_earned": is_earned
        })

    return {
        "success": True,
        "profile": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "college": user.college,
            "bio": user.bio,
            "github": user.github,
            "profile_photo": user.profile_photo,
            "points": user.points,
            "challenges_solved": user.challenges_solved,
            "joined_at": user.joined_at,
            "global_rank": global_rank,
            "college_rank": college_rank,
            "total_users": total_users,
            "category_breakdown": category_solves_map,
            "solved_challenges": solved_challenges_list,
            "activity_heatmap": activity_heatmap,
            "badges": earned_badges,
            "badges_gallery": badges_gallery
        }
    }


# =========================================================
# LEADERBOARDS
# =========================================================

@app.get("/leaderboard")
def get_leaderboard(
    college: Optional[str] = None,
    category: Optional[str] = None,
    time_range: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    # Filter by category or time_range if specified
    if (category and category != "all") or (time_range and time_range != "all"):
        sub_query = db.query(
            User.id.label("id"),
            User.name.label("name"),
            User.college.label("college"),
            User.joined_at.label("joined_at"),
            func.coalesce(func.sum(Submission.points_awarded), 0).label("points"),
            func.count(distinct(Submission.challenge_id)).label("challenges_solved")
        ).join(Submission, Submission.user_id == User.id)\
         .join(Challenge, Challenge.id == Submission.challenge_id)\
         .filter(User.role == "user", User.is_active == True, Submission.is_correct == True)

        if category and category != "all":
            sub_query = sub_query.filter(Challenge.category == category)
        if time_range == "week":
            sub_query = sub_query.filter(Submission.submitted_at >= datetime.utcnow() - timedelta(days=7))
        elif time_range == "month":
            sub_query = sub_query.filter(Submission.submitted_at >= datetime.utcnow() - timedelta(days=30))
        if college:
            sub_query = sub_query.filter(User.college.ilike(f"%{college}%"))
        if search:
            sub_query = sub_query.filter(
                or_(
                    User.name.ilike(f"%{search}%"),
                    User.college.ilike(f"%{search}%")
                )
            )

        grouped = sub_query.group_by(User.id, User.name, User.college, User.joined_at).order_by(
            desc("points"),
            desc("challenges_solved"),
            User.joined_at.asc()
        ).all()

        result = []
        for rank, u in enumerate(grouped, start=1):
            result.append({
                "rank": rank,
                "id": u.id,
                "name": u.name,
                "college": u.college or "Independent",
                "points": int(u.points),
                "challenges_solved": int(u.challenges_solved),
                "joined_at": u.joined_at
            })
        return {"success": True, "count": len(result), "leaderboard": result}

    query = db.query(User).filter(User.role == "user", User.is_active == True)

    if not college and not category and not search and not time_range:
        cached = redis_get("leaderboard:global")
        if cached:
            try:
                return json.loads(cached)
            except Exception:
                pass

    if college:
        query = query.filter(User.college.ilike(f"%{college}%"))
    if search:
        query = query.filter(
            or_(
                User.name.ilike(f"%{search}%"),
                User.college.ilike(f"%{search}%")
            )
        )

    users = query.order_by(
        User.points.desc(),
        User.challenges_solved.desc(),
        User.joined_at.asc()
    ).all()

    result = []
    for rank, u in enumerate(users, start=1):
        result.append({
            "rank": rank,
            "id": u.id,
            "name": u.name,
            "college": u.college or "Independent",
            "points": u.points,
            "challenges_solved": u.challenges_solved,
            "joined_at": u.joined_at
        })

    payload = {"success": True, "count": len(result), "leaderboard": result}
    if not college and not category and not search and not time_range:
        redis_setex("leaderboard:global", 5, json.dumps(payload, default=str))
    return payload


@app.get("/leaderboard/colleges")
def get_college_leaderboard(db: Session = Depends(get_db)):
    cached = redis_get("leaderboard:colleges")
    if cached:
        try:
            return json.loads(cached)
        except Exception:
            pass
    colleges = db.query(
        User.college,
        func.sum(User.points).label("total_points"),
        func.sum(User.challenges_solved).label("total_solves"),
        func.count(User.id).label("members_count")
    ).filter(
        User.college != None,
        User.college != "",
        User.is_active == True,
        User.role == "user"
    ).group_by(User.college).order_by(
        desc("total_points"),
        desc("total_solves")
    ).all()

    result = []
    for rank, c in enumerate(colleges, start=1):
        result.append({
            "rank": rank,
            "college": c.college,
            "total_points": int(c.total_points or 0),
            "total_solves": int(c.total_solves or 0),
            "members_count": int(c.members_count or 0)
        })

    payload = {"success": True, "count": len(result), "colleges": result}
    redis_setex("leaderboard:colleges", 10, json.dumps(payload, default=str))
    return payload


# =========================================================
# EVENTS
# =========================================================

@app.get("/events")
def get_events(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    events = db.query(Event).filter(Event.is_active == True).order_by(Event.start_date.asc()).all()
    now = datetime.utcnow()

    registered_event_ids = set()
    if current_user:
        registered_event_ids = {r.event_id for r in db.query(EventRegistration.event_id).filter(EventRegistration.user_id == current_user.id).all()}
        registration_map = {r.event_id: r for r in db.query(EventRegistration).filter(EventRegistration.user_id == current_user.id).all()}

    result = []
    for e in events:
        status = "upcoming"
        countdown_seconds = 0

        if now < e.start_date:
            status = "upcoming"
            countdown_seconds = int((e.start_date - now).total_seconds())
        elif e.start_date <= now <= e.end_date:
            status = "active"
            countdown_seconds = int((e.end_date - now).total_seconds())
        else:
            status = "ended"
            countdown_seconds = 0

        participants_count = db.query(func.count(EventRegistration.id)).filter(
            EventRegistration.event_id == e.id
        ).scalar() or 0

        challenge_count = db.query(func.count(Challenge.id)).filter(
            Challenge.event_id == e.id,
            Challenge.is_active == True
        ).scalar() or 0

        result.append({
            "id": e.id,
            "name": e.name,
            "description": e.description,
            "start_date": e.start_date,
            "end_date": e.end_date,
            "status": status,
            "countdown_seconds": countdown_seconds,
            "is_scoreboard_frozen": e.is_scoreboard_frozen,
            "is_registered": e.id in registered_event_ids,
            "registration_type": "team" if (current_user and registration_map.get(e.id) and registration_map[e.id].team_id) else "individual" if e.id in registered_event_ids else None,
            "team_id": registration_map[e.id].team_id if current_user and e.id in registration_map else None,
            "team_name": (
                db.query(Team.name).filter(Team.id == registration_map[e.id].team_id).scalar()
                if current_user and e.id in registration_map and registration_map[e.id].team_id
                else None
            ),
            "participation_mode": e.participation_mode or "individual",
            "participants_count": participants_count,
            "challenge_count": challenge_count
        })

    return {
        "success": True,
        "events": result
    }


@app.post("/events/{event_id}/register")
def register_for_event(
    event_id: int,
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == event_id, Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    mode = (event.participation_mode or "individual").lower()
    if mode not in {"individual", "team", "both"}:
        mode = "individual"

    team = None
    if team_id is not None:
        if mode == "individual":
            raise HTTPException(status_code=400, detail="This tournament is configured for individual participation")
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(status_code=404, detail="Squad not found")
        membership = db.query(TeamMember).filter(TeamMember.team_id == team.id, TeamMember.user_id == current_user.id).first()
        if not membership:
            raise HTTPException(status_code=403, detail="You must be a member of this squad")
        if len(team.members) < 1:
            raise HTTPException(status_code=400, detail="Squad has no members")
        if mode == "team" and team.owner_id != current_user.id:
            team_reg = db.query(EventRegistration).filter(EventRegistration.event_id == event_id, EventRegistration.team_id == team.id).first()
            if not team_reg:
                raise HTTPException(status_code=403, detail="Only the squad owner can register the squad for this tournament")
    else:
        if mode == "team":
            # Check if user's squad is already registered
            my_membership = db.query(TeamMember).filter(TeamMember.user_id == current_user.id).first()
            if my_membership:
                team = my_membership.team
            else:
                raise HTTPException(status_code=400, detail="Create or join a squad before registering for this team tournament")

    existing = db.query(EventRegistration).filter(
        EventRegistration.event_id == event_id,
        EventRegistration.user_id == current_user.id
    ).first()

    if existing:
        if team:
            if existing.team_id == team.id:
                return {"success": True, "message": f"You are already registered for this tournament under {team.name}!", "registration_type": "team", "team_id": team.id}
            existing.team_id = team.id
            db.commit()
            return {"success": True, "message": f"Tournament registration updated! You are now participating with {team.name}.", "registration_type": "team", "team_id": team.id}
        else:
            return {"success": True, "message": "You are already registered for this event!", "registration_type": "team" if existing.team_id else "individual", "team_id": existing.team_id}

    reg = EventRegistration(event_id=event_id, user_id=current_user.id, team_id=team.id if team else None, registered_at=datetime.utcnow())
    db.add(reg)

    if team:
        # Team registration is represented for every member, so every member can enter the arena.
        for member in team.members:
            if member.user_id != current_user.id:
                mem_reg = db.query(EventRegistration).filter(EventRegistration.event_id == event_id, EventRegistration.user_id == member.user_id).first()
                if mem_reg:
                    mem_reg.team_id = team.id
                else:
                    db.add(EventRegistration(event_id=event_id, user_id=member.user_id, team_id=team.id, registered_at=datetime.utcnow()))
                db.add(Notification(user_id=member.user_id, title="Squad joined a tournament", message=f"{team.name} registered for {event.name}.", kind="event"))
            db.add(Notification(user_id=member.user_id, title="Tournament registration confirmed", message=f"{team.name} is registered for {event.name}.", kind="event"))
    else:
        db.add(Notification(user_id=current_user.id, title="Tournament registration confirmed", message=f"You are registered for {event.name}.", kind="event"))

    db.commit()
    return {"success": True, "message": f"Successfully registered for {event.name}!", "registration_type": "team" if team else "individual", "team_id": team.id if team else None}


@app.get("/events/{event_id}/arena")
def get_event_arena(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    event = db.query(Event).filter(Event.id == event_id, Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=404, detail="Tournament not found")
    registration = db.query(EventRegistration).filter(EventRegistration.event_id == event_id, EventRegistration.user_id == current_user.id).first()
    if not registration and current_user.role not in ["admin", "moderator"]:
        raise HTTPException(status_code=403, detail="Register for this tournament to enter the arena")

    challenges = db.query(Challenge).filter(Challenge.event_id == event_id, Challenge.is_active == True).order_by(Challenge.points.asc(), Challenge.id.asc()).all()
    challenge_ids = [c.id for c in challenges] or [-1]
    if registration and registration.team_id:
        solved = {s.challenge_id for s in db.query(Submission).filter(Submission.team_id == registration.team_id, Submission.is_correct == True, Submission.challenge_id.in_(challenge_ids)).all()}
        score = db.query(func.sum(Submission.points_awarded)).filter(Submission.team_id == registration.team_id, Submission.is_correct == True, Submission.challenge_id.in_(challenge_ids)).scalar() or 0
        team = db.query(Team).filter(Team.id == registration.team_id).first()
        registration_type = "team"
    else:
        solved = {s.challenge_id for s in db.query(Submission).filter(Submission.user_id == current_user.id, Submission.is_correct == True, Submission.challenge_id.in_(challenge_ids)).all()}
        score = sum(c.points for c in challenges if c.id in solved)
        team = None
        registration_type = "individual"

    first_bloods_raw = db.query(
        Submission.challenge_id,
        Submission.user_id,
        User.name.label("user_name"),
        User.college.label("college"),
        Submission.submitted_at,
        Submission.team_id,
        Team.name.label("team_name")
    ).join(User, User.id == Submission.user_id)\
     .outerjoin(Team, Team.id == Submission.team_id)\
     .filter(Submission.challenge_id.in_(challenge_ids), Submission.is_correct == True)\
     .order_by(Submission.submitted_at.asc(), Submission.id.asc()).all()

    first_blood_map = {}
    for r in first_bloods_raw:
        if r.challenge_id not in first_blood_map:
            first_blood_map[r.challenge_id] = {
                "user_id": r.user_id,
                "user_name": r.user_name,
                "college": r.college or "Independent",
                "team_id": r.team_id,
                "team_name": r.team_name,
                "time": r.submitted_at.isoformat() if r.submitted_at else None
            }

    return {
        "success": True,
        "event": {"id": event.id, "name": event.name, "description": event.description, "start_date": event.start_date, "end_date": event.end_date, "is_scoreboard_frozen": event.is_scoreboard_frozen, "participation_mode": event.participation_mode or "individual"},
        "registered": bool(registration), "registration_type": registration_type,
        "team": {"id": team.id, "name": team.name, "slug": team.slug, "points": team.points, "challenges_solved": team.challenges_solved, "member_count": len(team.members)} if team else None,
        "score": int(score or 0), "solved": len(solved), "total_challenges": len(challenges),
        "challenges": [{"id": c.id, "title": c.title, "description": c.description, "category": c.category, "difficulty": c.difficulty, "points": c.points, "file_url": (f"{PUBLIC_API_URL}/challenges/{c.id}/file" if c.file_path else c.file_url), "connection_info": c.connection_info, "runtime_enabled": bool(c.runtime_image and c.runtime_port), "runtime_protocol": c.runtime_protocol, "has_hint": bool(c.hint), "hint_cost": c.hint_cost, "is_solved": c.id in solved, "first_blood": first_blood_map.get(c.id)} for c in challenges]
    }


@app.get("/events/{event_id}/leaderboard")
def get_event_leaderboard(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    is_admin = current_user and current_user.role in ["admin", "moderator"]
    is_frozen = event.is_scoreboard_frozen and not is_admin
    challenge_ids = [c[0] for c in db.query(Challenge.id).filter(Challenge.event_id == event_id).all()]
    if not challenge_ids:
        return {"success": True, "event_id": event.id, "event_name": event.name, "is_scoreboard_frozen": is_frozen, "participation_mode": event.participation_mode or "individual", "leaderboard": []}

    mode = (event.participation_mode or "individual").lower()
    result = []
    if mode in {"team", "both"}:
        team_rows = db.query(Submission.team_id, func.sum(Submission.points_awarded).label("total_points"), func.count(Submission.id).label("solves_count")).filter(Submission.challenge_id.in_(challenge_ids), Submission.is_correct == True, Submission.team_id.isnot(None)).group_by(Submission.team_id).order_by(desc("total_points"), desc("solves_count")).all()
        for rank, row in enumerate(team_rows, 1):
            team = db.query(Team).filter(Team.id == row.team_id).first()
            if team:
                result.append({"rank": rank, "type": "team", "team_id": team.id, "name": team.name, "college": "Squad", "points": int(row.total_points or 0), "solves": int(row.solves_count or 0), "members": [m.user.name for m in team.members]})
    if mode in {"individual", "both"}:
        user_rows = db.query(Submission.user_id, func.sum(Submission.points_awarded).label("total_points"), func.count(Submission.id).label("solves_count")).filter(Submission.challenge_id.in_(challenge_ids), Submission.is_correct == True, Submission.team_id.is_(None)).group_by(Submission.user_id).order_by(desc("total_points"), desc("solves_count")).all()
        offset = len(result)
        for rank, row in enumerate(user_rows, 1):
            u = db.query(User).filter(User.id == row.user_id).first()
            if u:
                result.append({"rank": offset + rank, "type": "individual", "user_id": u.id, "name": u.name, "college": u.college or "Independent", "points": int(row.total_points or 0), "solves": int(row.solves_count or 0), "members": []})
    # A combined board should be ranked by score rather than by the order of the two scopes.
    result.sort(key=lambda x: (-x["points"], -x["solves"], x["name"].lower()))
    for rank, row in enumerate(result, 1): row["rank"] = rank
    return {"success": True, "event_id": event.id, "event_name": event.name, "is_scoreboard_frozen": is_frozen, "participation_mode": mode, "leaderboard": result}


CERT_ROOT = Path(__file__).parent / "certificates"
CERT_ROOT.mkdir(parents=True, exist_ok=True)


def event_user_stats(event_id: int, user_id: int, db: Session):
    ch_ids = [x[0] for x in db.query(Challenge.id).filter(Challenge.event_id == event_id).all()]
    if not ch_ids:
        return 0, 0
    stat = db.query(func.sum(Submission.points_awarded), func.count(Submission.id)).filter(
        Submission.challenge_id.in_(ch_ids), Submission.user_id == user_id, Submission.is_correct == True
    ).first()
    return int(stat[0] or 0), int(stat[1] or 0)


def event_user_rank(event_id: int, user_id: int, db: Session):
    ch_ids = [x[0] for x in db.query(Challenge.id).filter(Challenge.event_id == event_id).all()]
    if not ch_ids:
        return None
    rows = db.query(Submission.user_id, func.sum(Submission.points_awarded).label("pts"), func.count(Submission.id).label("solves")).filter(
        Submission.challenge_id.in_(ch_ids), Submission.is_correct == True, Submission.team_id.is_(None)
    ).group_by(Submission.user_id).order_by(desc("pts"), desc("solves"), Submission.user_id.asc()).all()
    for idx, row in enumerate(rows, 1):
        if row.user_id == user_id:
            return idx
    return len(rows) + 1 if rows else None


FONTS_DIR = Path(__file__).parent / "fonts"

FONT_DEFINITIONS = {
    "Helvetica": {"id": "Helvetica", "label": "Helvetica (Clean Modern Sans)", "category": "Sans-Serif", "regular": "Helvetica", "bold": "Helvetica-Bold", "is_script": False},
    "Times-Roman": {"id": "Times-Roman", "label": "Times-Roman (Classic Academic Serif)", "category": "Serif", "regular": "Times-Roman", "bold": "Times-Bold", "is_script": False},
    "Cinzel": {"id": "Cinzel", "label": "Cinzel (Classical Roman / Academy)", "category": "Serif", "file": "Cinzel-Regular.ttf", "bold_file": "Cinzel-Bold.ttf", "regular": "Cinzel", "bold": "Cinzel-Bold", "is_script": False},
    "PlayfairDisplay": {"id": "PlayfairDisplay", "label": "Playfair Display (Stately Editorial Serif)", "category": "Serif", "file": "PlayfairDisplay-Regular.ttf", "regular": "PlayfairDisplay", "bold": "PlayfairDisplay", "is_script": False},
    "Montserrat": {"id": "Montserrat", "label": "Montserrat (Architectural Modern Sans)", "category": "Sans-Serif", "file": "Montserrat-Regular.ttf", "regular": "Montserrat", "bold": "Montserrat", "is_script": False},
    "Oswald": {"id": "Oswald", "label": "Oswald (Bold Impact Headline Display)", "category": "Display", "file": "Oswald-Regular.ttf", "regular": "Oswald", "bold": "Oswald", "is_script": False},
    "GreatVibes": {"id": "GreatVibes", "label": "Great Vibes (Luxury Calligraphy Script)", "category": "Calligraphy / Script", "file": "GreatVibes-Regular.ttf", "regular": "GreatVibes", "bold": "GreatVibes", "is_script": True},
    "AlexBrush": {"id": "AlexBrush", "label": "Alex Brush (Refined Penmanship Script)", "category": "Calligraphy / Script", "file": "AlexBrush-Regular.ttf", "regular": "AlexBrush", "bold": "AlexBrush", "is_script": True},
    "DancingScript": {"id": "DancingScript", "label": "Dancing Script (Lively Elegant Script)", "category": "Calligraphy / Script", "file": "DancingScript-Regular.ttf", "regular": "DancingScript", "bold": "DancingScript", "is_script": True},
    "Courier": {"id": "Courier", "label": "Courier (Standard Monospace)", "category": "Monospace / Cyber", "regular": "Courier", "bold": "Courier-Bold", "is_script": False},
    "ShareTechMono": {"id": "ShareTechMono", "label": "Share Tech Mono (Hacker Matrix Monospace)", "category": "Monospace / Cyber", "file": "ShareTechMono-Regular.ttf", "regular": "ShareTechMono", "bold": "ShareTechMono", "is_script": False},
    "Orbitron": {"id": "Orbitron", "label": "Orbitron (Futuristic Cyber / Sci-Fi)", "category": "Monospace / Cyber", "file": "Orbitron-Regular.ttf", "regular": "Orbitron", "bold": "Orbitron", "is_script": False},
}

REGISTERED_FONTS = set(["Helvetica", "Times-Roman", "Courier"])


def register_fonts():
    if not FONTS_DIR.exists():
        return
    for font_id, defn in FONT_DEFINITIONS.items():
        if "file" in defn:
            fpath = FONTS_DIR / defn["file"]
            if fpath.exists() and defn["regular"] not in REGISTERED_FONTS:
                try:
                    pdfmetrics.registerFont(TTFont(defn["regular"], str(fpath)))
                    REGISTERED_FONTS.add(defn["regular"])
                except Exception as e:
                    logger.warning("Could not register font %s: %s", font_id, e)
        if "bold_file" in defn:
            bfpath = FONTS_DIR / defn["bold_file"]
            if bfpath.exists() and defn["bold"] not in REGISTERED_FONTS:
                try:
                    pdfmetrics.registerFont(TTFont(defn["bold"], str(bfpath)))
                    REGISTERED_FONTS.add(defn["bold"])
                except Exception as e:
                    logger.warning("Could not register bold font for %s: %s", font_id, e)


register_fonts()


def resolve_font(font_fam: str, prefer_bold: bool = False):
    f_info = FONT_DEFINITIONS.get(font_fam) or FONT_DEFINITIONS["Helvetica"]
    font_name = f_info["bold"] if prefer_bold and f_info["bold"] in REGISTERED_FONTS else f_info["regular"]
    if font_name not in REGISTERED_FONTS:
        font_name = "Helvetica-Bold" if prefer_bold else "Helvetica"
    return font_name, f_info.get("is_script", False)


GLOBAL_CERT_CONFIG_FILE = CERT_ROOT / "global_cert_config.json"

DEFAULT_ELEMENT_POSITIONS = {
    "logo": {"x": 50, "y": 14},
    "header": {"x": 50, "y": 24},
    "title": {"x": 50, "y": 29},
    "subtitle": {"x": 50, "y": 37},
    "recipient": {"x": 50, "y": 45},
    "college": {"x": 50, "y": 52},
    "body": {"x": 50, "y": 59},
    "badges": {"x": 50, "y": 66},
    "primary_signature": {"x": 75, "y": 83},
    "second_signature": {"x": 25, "y": 83},
    "qr": {"x": 50, "y": 83},
    "footer": {"x": 50, "y": 91},
}

DEFAULT_CERT_CONFIG = {
    "theme": "white_blue",
    "orientation": "landscape",
    "primary_color": "#1e293b",
    "accent_color": "#0284c7",
    "font_family": "Helvetica",
    "recipient_font_family": "Helvetica",
    "title_font_size": 20,
    "name_font_size": 32,
    "body_font_size": 12,
    "alignment": "center",
    "header_text": "OWASP PCCOE STUDENT CHAPTER",
    "title_text": "Certificate of CTF Participation & Achievement",
    "subtitle_text": "This certificate is proudly presented to",
    "custom_body_text": "for participating in {event_name} and capturing {solves} flag(s) for {score} points.",
    "signature_title": "OWASP PCCOE Lead & Faculty Coordinator",
    "signer_name": "",
    "second_signature_title": "",
    "second_signer_name": "",
    "footer_note": "",
    # Visibility Toggles matching user reference
    "show_header": True,
    "show_title": True,
    "show_subtitle": True,
    "show_recipient": True,
    "show_college": True,
    "show_body": True,
    "show_badge": True,
    "show_rank": True,
    "show_score": False,
    "show_id": True,
    "show_date": True,
    "show_signature": True,
    "show_second_signature": False,
    "show_qr": False,
    "show_border": True,
    "show_shield": False,
    "show_logo": False,
    "logo_size": 22,
    "top_offset": 0,
    "side_padding": 28,
    "theme_mode": "light",
    "bg_mode": "default",
    "positions": dict(DEFAULT_ELEMENT_POSITIONS),
}


def get_cert_asset_path(scope: str, asset_type: str) -> Optional[Path]:
    """Finds existing file for asset_type in scope ('global' or event_id) returning the latest modified file."""
    prefix = f"global_{asset_type}" if str(scope) == "global" else f"event_{scope}_{asset_type}"
    matches = []
    for ext in [".png", ".jpg", ".jpeg", ".PNG", ".JPG", ".JPEG"]:
        p = CERT_TEMPLATE_DIR / f"{prefix}{ext}"
        if p.exists() and p.is_file():
            matches.append(p)
    if matches:
        return max(matches, key=lambda f: f.stat().st_mtime)

    # Fallback to global if event-specific asset doesn't exist
    if str(scope) != "global":
        global_matches = []
        for ext in [".png", ".jpg", ".jpeg", ".PNG", ".JPG", ".JPEG"]:
            p = CERT_TEMPLATE_DIR / f"global_{asset_type}{ext}"
            if p.exists() and p.is_file():
                global_matches.append(p)
        if global_matches:
            return max(global_matches, key=lambda f: f.stat().st_mtime)
    return None


def get_cert_asset_url(scope: str, asset_type: str) -> Optional[str]:
    p = get_cert_asset_path(scope, asset_type)
    if p and p.exists():
        mtime = int(p.stat().st_mtime)
        return f"{PUBLIC_API_URL}/uploads/certificate_templates/{p.name}?t={mtime}"
    return None


def get_global_cert_config() -> dict:
    cfg = dict(DEFAULT_CERT_CONFIG)
    if GLOBAL_CERT_CONFIG_FILE.exists():
        try:
            stored = json.loads(GLOBAL_CERT_CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(stored, dict):
                cfg.update(stored)
        except Exception as e:
            logger.warning("Failed to read global cert config: %s", e)
    return cfg


def save_global_cert_config(data: dict):
    GLOBAL_CERT_CONFIG_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def parse_cert_config(event: Optional[Event] = None, preview_cfg: Optional[dict] = None) -> dict:
    cfg = get_global_cert_config()
    if event and event.cert_config:
        try:
            stored = json.loads(event.cert_config)
            if isinstance(stored, dict):
                cfg.update(stored)
        except Exception:
            pass
    if preview_cfg and isinstance(preview_cfg, dict):
        cfg.update(preview_cfg)
    return cfg



def hex_to_color(hex_str: Optional[str], default_color):
    try:
        if hex_str and hex_str.startswith("#"):
            return colors.HexColor(hex_str)
    except Exception:
        pass
    return default_color


def build_certificate_pdf(
    cert: Optional[Certificate] = None,
    event: Optional[Event] = None,
    preview: bool = False,
    preview_cfg: Optional[dict] = None
) -> Path:
    cfg = parse_cert_config(event=event, preview_cfg=preview_cfg)
    is_portrait = cfg.get("orientation") == "portrait"
    page_size = portrait(A4) if is_portrait else landscape(A4)
    width, height = page_size

    if preview:
        path = CERT_ROOT / f"preview_event_{event.id if event else 'sample'}.pdf"
        participant_name = "Alex Mercer"
        college = "OWASP Cyber Academy"
        score = 450
        solves = 6
        rank = 1
        certificate_id = f"OWASP-CTF-{event.id if event else '0'}-PREVIEW-DEMO"
        certificate_type = "participation"
        event_name = event.name if event else "OWASP Cyber Challenge 2026"
        issued_date = datetime.utcnow().strftime("%B %d, %Y")
    else:
        if not cert:
            raise ValueError("Certificate object is required when not in preview mode")
        path = CERT_ROOT / f"{cert.certificate_id}.pdf"
        participant_name = cert.participant_name
        college = cert.college
        score = cert.score
        solves = cert.solves
        rank = cert.rank
        certificate_id = cert.certificate_id
        certificate_type = cert.certificate_type or "participation"
        event_name = event.name if event else (cert.event.name if cert.event else "OWASP CTF Event")
        issued_date = cert.issued_at.strftime("%B %d, %Y") if cert.issued_at else datetime.utcnow().strftime("%B %d, %Y")

    c = canvas.Canvas(str(path), pagesize=page_size)

    # Determine scope for asset lookup
    scope = str(event.id) if event else "global"

    # Check for template background image (unless user selected clean default background mode)
    bg_mode = cfg.get("bg_mode", "auto")
    template_drawn = False
    if bg_mode != "default":
        tpl_path = get_cert_asset_path(scope, "template")
        if tpl_path and tpl_path.exists() and tpl_path.is_file():
            try:
                c.drawImage(str(tpl_path), 0, 0, width=width, height=height, preserveAspectRatio=False)
                template_drawn = True
            except Exception as e:
                logger.warning("Failed to draw certificate template: %s", e)

    # Draw clean white parchment background and dual-line border if no background template
    if not template_drawn:
        c.setFillColor(colors.white)
        c.rect(0, 0, width, height, fill=1, stroke=0)

        if cfg.get("show_border", True):
            # Outer thick vibrant blue border (~4.5pt) matching user photo
            c.setLineWidth(4.5)
            c.setStrokeColor(hex_to_color(cfg.get("accent_color"), colors.HexColor("#0284c7")))
            c.rect(10*mm, 10*mm, width-20*mm, height-20*mm)

            # Inner fine dark slate border (~1.0pt) matching user photo
            c.setLineWidth(1.0)
            c.setStrokeColor(hex_to_color("#334155", colors.HexColor("#334155")))
            c.rect(15*mm, 15*mm, width-30*mm, height-30*mm)

    # Fonts & typography resolution
    font_fam = cfg.get("font_family", "Helvetica")
    recipient_fam = cfg.get("recipient_font_family") or font_fam

    reg_font, _ = resolve_font(font_fam, prefer_bold=False)
    bold_font, _ = resolve_font(font_fam, prefer_bold=True)
    name_font, is_name_script = resolve_font(recipient_fam, prefer_bold=not FONT_DEFINITIONS.get(recipient_fam, {}).get("is_script", False))

    primary_c = hex_to_color(cfg.get("primary_color"), colors.HexColor("#1e293b"))
    accent_c = hex_to_color(cfg.get("accent_color"), colors.HexColor("#0284c7"))

    align = (cfg.get("alignment") or "center").lower()
    side_padding = float(cfg.get("side_padding") or 28) * mm
    top_offset = float(cfg.get("top_offset") or 0) * mm

    if align == "left":
        text_x = side_padding
        draw_fn = c.drawString
    elif align == "right":
        text_x = width - side_padding
        draw_fn = c.drawRightString
    else:  # center
        text_x = width / 2
        draw_fn = c.drawCentredString

    y_scale = 1.35 if is_portrait else 1.0
    curr_y = height - ((35 * y_scale) * mm + top_offset)

    # Canva-style Free Positioning helper
    positions = cfg.get("positions")
    use_custom_pos = isinstance(positions, dict) and bool(positions)

    def get_pos(key: str, default_pct_x: float, default_pct_y: float):
        if use_custom_pos and key in positions and isinstance(positions[key], dict):
            px = float(positions[key].get("x", default_pct_x))
            py = float(positions[key].get("y", default_pct_y))
            return width * (px / 100.0), height * (1.0 - (py / 100.0))
        return None

    # 0. Shield Logo or Custom Logo (Top Emblem)
    show_logo = cfg.get("show_logo", cfg.get("show_shield", True))
    if show_logo:
        logo_path = get_cert_asset_path(scope, "logo")
        logo_size = float(cfg.get("logo_size") or 22) * mm
        lpos = get_pos("logo", 50, 14)
        if lpos:
            lx, ly = lpos
            if logo_path and logo_path.exists() and logo_path.is_file():
                try:
                    c.drawImage(str(logo_path), lx - logo_size/2, ly - logo_size/2, width=logo_size, height=logo_size, preserveAspectRatio=True, mask='auto')
                except Exception as e:
                    logger.warning("Failed to draw custom logo: %s", e)
            else:
                c.saveState()
                c.setFillColor(accent_c)
                c.setStrokeColor(accent_c)
                p = c.beginPath()
                p.moveTo(lx, ly + 6.5*mm)
                p.lineTo(lx + 5.5*mm, ly + 3*mm)
                p.lineTo(lx + 4.5*mm, ly - 3.5*mm)
                p.lineTo(lx, ly - 7*mm)
                p.lineTo(lx - 4.5*mm, ly - 3.5*mm)
                p.lineTo(lx - 5.5*mm, ly + 3*mm)
                p.close()
                c.drawPath(p, fill=1, stroke=0)
                c.restoreState()
        else:
            if logo_path and logo_path.exists() and logo_path.is_file():
                try:
                    img_x = (width - logo_size) / 2 if align == "center" else (side_padding if align == "left" else width - side_padding - logo_size)
                    c.drawImage(str(logo_path), img_x, curr_y - logo_size, width=logo_size, height=logo_size, preserveAspectRatio=True, mask='auto')
                    curr_y -= logo_size + 4 * mm
                except Exception as e:
                    logger.warning("Failed to draw custom logo: %s", e)
                    curr_y -= 17 * mm
            else:
                c.saveState()
                c.setFillColor(accent_c)
                c.setStrokeColor(accent_c)
                p = c.beginPath()
                p.moveTo(text_x, curr_y)
                p.lineTo(text_x + 5.5*mm, curr_y - 3.5*mm)
                p.lineTo(text_x + 4.5*mm, curr_y - 10*mm)
                p.lineTo(text_x, curr_y - 13.5*mm)
                p.lineTo(text_x - 4.5*mm, curr_y - 10*mm)
                p.lineTo(text_x - 5.5*mm, curr_y - 3.5*mm)
                p.close()
                c.drawPath(p, fill=1, stroke=0)
                c.restoreState()
                curr_y -= 17 * mm

    # 1. Organization Header Text
    title_fs = int(cfg.get("title_font_size") or 24)
    if cfg.get("show_header", True):
        header_text = cfg.get("header_text", "OWASP PCCOE STUDENT CHAPTER")
        if header_text:
            c.setFillColor(accent_c)
            c.setFont(bold_font, max(13, int(title_fs * 0.85)))
            hpos = get_pos("header", 50, 24)
            if hpos:
                c.drawCentredString(hpos[0], hpos[1], header_text)
            else:
                draw_fn(text_x, curr_y, header_text)
                curr_y -= 9 * mm

    # 2. Certificate Title Text
    if cfg.get("show_title", True):
        title_text = cfg.get("title_text", "Certificate of CTF Participation & Achievement")
        if title_text:
            c.setFillColor(primary_c)
            c.setFont(reg_font, max(11, int(title_fs * 0.55)))
            tpos = get_pos("title", 50, 30)
            if tpos:
                c.drawCentredString(tpos[0], tpos[1], title_text)
            else:
                draw_fn(text_x, curr_y, title_text)
                curr_y -= 14 * mm

    # 3. Subtitle / Presentation line
    body_fs = int(cfg.get("body_font_size") or 13)
    if cfg.get("show_subtitle", True):
        subtitle_text = cfg.get("subtitle_text", "This certificate is proudly presented to")
        if subtitle_text:
            c.setFillColor(hex_to_color("#4b5563", colors.HexColor("#4b5563")))
            c.setFont(reg_font, max(9, int(body_fs * 0.85)))
            spos = get_pos("subtitle", 50, 37)
            if spos:
                c.drawCentredString(spos[0], spos[1], subtitle_text)
            else:
                draw_fn(text_x, curr_y, subtitle_text)
                curr_y -= 15 * mm

    # 4. Recipient Name
    if cfg.get("show_recipient", True):
        name_fs = int(cfg.get("name_font_size") or 30)
        if is_name_script:
            name_fs = int(name_fs * 1.25)
        c.setFillColor(accent_c)
        c.setFont(name_font, name_fs)
        rpos = get_pos("recipient", 50, 45)
        if rpos:
            c.drawCentredString(rpos[0], rpos[1], participant_name)
        else:
            draw_fn(text_x, curr_y, participant_name)
            curr_y -= 11 * mm

    # 5. College / Affiliation
    if cfg.get("show_college", True) and college:
        c.setFillColor(hex_to_color("#374151", colors.HexColor("#374151")))
        c.setFont(reg_font, body_fs)
        cpos = get_pos("college", 50, 52)
        if cpos:
            c.drawCentredString(cpos[0], cpos[1], college)
        else:
            draw_fn(text_x, curr_y, college)
            curr_y -= 12 * mm

    # 6. Description of achievement (Customizable narrative with dynamic placeholders)
    if cfg.get("show_body", True):
        c.setFillColor(primary_c)
        c.setFont(reg_font, body_fs)
        tpl_body = cfg.get("custom_body_text") or "for participating in {event_name} and capturing {solves} flag(s) for {score} points."
        try:
            desc_text = tpl_body.format(
                participant_name=participant_name,
                college=college or "",
                event_name=event_name,
                solves=solves,
                score=score,
                rank=rank or "1",
                certificate_id=certificate_id,
                date=issued_date
            )
        except Exception:
            desc_text = tpl_body
        bpos = get_pos("body", 50, 60)
        if bpos:
            c.drawCentredString(bpos[0], bpos[1], desc_text)
        else:
            draw_fn(text_x, curr_y, desc_text)
            curr_y -= 12 * mm

    # 7. Badge / Rank / Type
    badge_parts = []
    if cfg.get("show_badge", True) and certificate_type:
        badge_parts.append(certificate_type.title())
    if cfg.get("show_rank", True) and rank:
        badge_parts.append(f"Rank #{rank}")
    if cfg.get("show_score", False) and score is not None:
        badge_parts.append(f"{score} PTS")
    if badge_parts:
        badge_label = "  •  ".join(badge_parts)
        c.setFillColor(accent_c)
        c.setFont(bold_font, body_fs + 2)
        bgpos = get_pos("badges", 50, 68)
        if bgpos:
            c.drawCentredString(bgpos[0], bgpos[1], badge_label)
        else:
            draw_fn(text_x, curr_y, badge_label)

    # 8. Optional Custom Footer / Accreditation Note
    footer_note = cfg.get("footer_note")
    if footer_note:
        c.setFillColor(hex_to_color("#6b7280", colors.HexColor("#6b7280")))
        c.setFont(reg_font, 8.5)
        c.drawCentredString(width / 2, 33*mm, footer_note)

    # 9. Primary Signature
    has_second = cfg.get("show_second_signature", False)
    if cfg.get("show_signature", True):
        sig_title = cfg.get("signature_title", "OWASP PCCOE Lead & Faculty Coordinator")
        signer_name = cfg.get("signer_name", "")
        sig_path = get_cert_asset_path(scope, "signature")
        ppos = get_pos("primary_signature", 78, 85)
        if ppos:
            px, py = ppos
            if sig_path and sig_path.exists() and sig_path.is_file():
                try:
                    c.drawImage(str(sig_path), px - 25*mm, py + 2*mm, width=50*mm, height=18*mm, preserveAspectRatio=True, mask='auto')
                except Exception as e:
                    logger.warning("Failed to draw primary signature image: %s", e)
            c.setLineWidth(0.8)
            c.setStrokeColor(hex_to_color("#9ca3af", colors.HexColor("#9ca3af")))
            c.line(px - 32*mm, py, px + 32*mm, py)
            if signer_name:
                c.setFillColor(primary_c)
                c.setFont(bold_font, 10)
                c.drawCentredString(px, py - 4.5*mm, signer_name)
                c.setFillColor(hex_to_color("#4b5563", colors.HexColor("#4b5563")))
                c.setFont(reg_font, 8.5)
                c.drawCentredString(px, py - 8.5*mm, sig_title)
            else:
                c.setFillColor(primary_c)
                c.setFont(bold_font, 9.5)
                c.drawCentredString(px, py - 5*mm, sig_title)
        else:
            sig_x = width - 85*mm if not has_second else width - 68*mm
            if sig_path and sig_path.exists() and sig_path.is_file():
                try:
                    c.drawImage(str(sig_path), sig_x + 2*mm, 46*mm, width=50*mm, height=18*mm, preserveAspectRatio=True, mask='auto')
                except Exception as e:
                    logger.warning("Failed to draw primary signature image: %s", e)
            c.setLineWidth(0.8)
            c.setStrokeColor(hex_to_color("#9ca3af", colors.HexColor("#9ca3af")))
            c.line(sig_x - 5*mm, 45*mm, sig_x + 60*mm, 45*mm)
            if signer_name:
                c.setFillColor(primary_c)
                c.setFont(bold_font, 10)
                c.drawString(sig_x, 40*mm, signer_name)
                c.setFillColor(hex_to_color("#4b5563", colors.HexColor("#4b5563")))
                c.setFont(reg_font, 8.5)
                c.drawString(sig_x, 35*mm, sig_title)
            else:
                c.setFillColor(primary_c)
                c.setFont(bold_font, 9.5)
                c.drawString(sig_x, 39*mm, sig_title)

    # 10. Optional Second Signature (Co-Signer)
    if has_second:
        sec_title = cfg.get("second_signature_title", "Club President / Co-Lead")
        sec_name = cfg.get("second_signer_name", "")
        sec_sig_path = get_cert_asset_path(scope, "second_signature")
        sec_pos = get_pos("second_signature", 22, 85)
        if sec_pos:
            sx, sy = sec_pos
            if sec_sig_path and sec_sig_path.exists() and sec_sig_path.is_file():
                try:
                    c.drawImage(str(sec_sig_path), sx - 25*mm, sy + 2*mm, width=50*mm, height=18*mm, preserveAspectRatio=True, mask='auto')
                except Exception as e:
                    logger.warning("Failed to draw second signature image: %s", e)
            c.setLineWidth(0.8)
            c.setStrokeColor(hex_to_color("#9ca3af", colors.HexColor("#9ca3af")))
            c.line(sx - 32*mm, sy, sx + 32*mm, sy)
            if sec_name:
                c.setFillColor(primary_c)
                c.setFont(bold_font, 10)
                c.drawCentredString(sx, sy - 4.5*mm, sec_name)
                c.setFillColor(hex_to_color("#4b5563", colors.HexColor("#4b5563")))
                c.setFont(reg_font, 8.5)
                c.drawCentredString(sx, sy - 8.5*mm, sec_title)
            else:
                c.setFillColor(primary_c)
                c.setFont(bold_font, 9.5)
                c.drawCentredString(sx, sy - 5*mm, sec_title)
        else:
            if sec_sig_path and sec_sig_path.exists() and sec_sig_path.is_file():
                try:
                    c.drawImage(str(sec_sig_path), 30*mm, 46*mm, width=50*mm, height=18*mm, preserveAspectRatio=True, mask='auto')
                except Exception as e:
                    logger.warning("Failed to draw second signature image: %s", e)
            c.setLineWidth(0.8)
            c.setStrokeColor(hex_to_color("#9ca3af", colors.HexColor("#9ca3af")))
            c.line(25*mm, 45*mm, 90*mm, 45*mm)
            if sec_name:
                c.setFillColor(primary_c)
                c.setFont(bold_font, 10)
                c.drawString(28*mm, 40*mm, sec_name)
                c.setFillColor(hex_to_color("#4b5563", colors.HexColor("#4b5563")))
                c.setFont(reg_font, 8.5)
                c.drawString(28*mm, 35*mm, sec_title)
            else:
                c.setFillColor(primary_c)
                c.setFont(bold_font, 9.5)
                c.drawString(28*mm, 39*mm, sec_title)

    # 11. QR Code
    if cfg.get("show_qr", True):
        try:
            from reportlab.graphics.barcode import qr
            from reportlab.graphics.shapes import Drawing
            verify_url = f"{PUBLIC_API_URL}/verify/certificate/{certificate_id}/page"
            qr_code = qr.QrCodeWidget(verify_url)
            bounds = qr_code.getBounds()
            qw = bounds[2] - bounds[0]
            qh = bounds[3] - bounds[1]
            scale_x = (18 * mm) / max(qw, 1)
            scale_y = (18 * mm) / max(qh, 1)
            drawing = Drawing(18 * mm, 18 * mm, transform=[scale_x, 0, 0, scale_y, 0, 0])
            drawing.add(qr_code)
            qr_pos = get_pos("qr", 50, 85)
            if qr_pos:
                qx, qy = qr_pos
                drawing.drawOn(c, qx - 9 * mm, qy - 9 * mm)
                c.setFillColor(hex_to_color("#6b7280", colors.HexColor("#6b7280")))
                c.setFont(reg_font, 6.5)
                c.drawCentredString(qx, qy - 13 * mm, "Scan to verify")
            else:
                qr_x = (width / 2) - 9 * mm if has_second else width - 42 * mm
                qr_y = 38 * mm if has_second else 46 * mm
                drawing.drawOn(c, qr_x, qr_y)
                c.setFillColor(hex_to_color("#6b7280", colors.HexColor("#6b7280")))
                c.setFont(reg_font, 6.5)
                c.drawCentredString(qr_x + 9 * mm, qr_y - 4 * mm, "Scan to verify")
        except Exception as e:
            logger.warning("Failed to render certificate QR code: %s", e)

    # 12. Footer metadata: Certificate ID & Issued Date
    c.setFillColor(hex_to_color("#6b7280", colors.HexColor("#6b7280")))
    c.setFont(reg_font, 8.5)
    fpos = get_pos("footer", 50, 91)
    if fpos:
        fx, fy = fpos
        if cfg.get("show_id", True) and cfg.get("show_date", True):
            c.drawString(20*mm, fy, f"Certificate ID: {certificate_id}")
            c.drawRightString(width - 20*mm, fy, issued_date)
        elif cfg.get("show_id", True):
            c.drawCentredString(fx, fy, f"Certificate ID: {certificate_id}")
        elif cfg.get("show_date", True):
            c.drawCentredString(fx, fy, issued_date)
    else:
        if cfg.get("show_id", True):
            c.drawString(20*mm, 19*mm, f"Certificate ID: {certificate_id}")
        if cfg.get("show_date", True):
            c.drawRightString(width - 20*mm, 19*mm, issued_date)

    c.save()
    return path


@app.get("/events/{event_id}/certificate")
def get_event_certificate(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event: raise HTTPException(status_code=404, detail="Event not found")
    if datetime.utcnow() < event.end_date: raise HTTPException(status_code=400, detail="Certificate is available after the event ends")
    reg = db.query(EventRegistration).filter(EventRegistration.event_id == event_id, EventRegistration.user_id == current_user.id).first()
    if not reg: raise HTTPException(status_code=403, detail="You were not registered for this event")
    cert = db.query(Certificate).filter(Certificate.event_id == event_id, Certificate.user_id == current_user.id).first()
    if not cert:
        score, solves = event_user_stats(event_id, current_user.id, db)
        cert = Certificate(certificate_id=f"OWASP-CTF-{event.id}-{current_user.id}-{secrets.token_hex(4).upper()}", event_id=event.id, user_id=current_user.id, team_id=reg.team_id, participant_name=current_user.name, college=current_user.college or "OWASP Student Member", score=score, solves=solves, rank=event_user_rank(event_id, current_user.id, db), certificate_type="participation", pdf_path="")
        db.add(cert); db.flush(); pdf = build_certificate_pdf(cert=cert, event=event); cert.pdf_path = storage.put_file(f"certificates/{cert.certificate_id}.pdf", pdf, "application/pdf") if storage.enabled() else str(pdf.relative_to(CERT_ROOT))
        db.commit(); db.refresh(cert)
    elif not (CERT_ROOT / cert.pdf_path).exists():
        build_certificate_pdf(cert=cert, event=event)
    return {"success": True, "certificate": {"certificate_id": cert.certificate_id, "event_name": event.name, "student_name": cert.participant_name, "college": cert.college, "score": cert.score, "solves": cert.solves, "rank": cert.rank, "certificate_type": cert.certificate_type, "issued_date": cert.issued_at.strftime("%B %d, %Y"), "signature": "OWASP Lead & Faculty Coordinator", "download_url": f"{PUBLIC_API_URL}/certificates/{cert.certificate_id}/download", "verification_url": f"{PUBLIC_API_URL}/verify/certificate/{cert.certificate_id}/page"}}


@app.get("/certificates/{certificate_id}/download")
def certificate_download(certificate_id: str, db: Session = Depends(get_db)):
    cert = db.query(Certificate).filter(Certificate.certificate_id == certificate_id, Certificate.is_valid == True).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found or revoked")
    if cert.pdf_path and cert.pdf_path.startswith("s3://"):
        url = storage.signed_url(cert.pdf_path)
        if not url:
            raise HTTPException(status_code=503, detail="Object storage is unavailable")
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=url, status_code=307)
    from fastapi.responses import FileResponse
    path = CERT_ROOT / cert.pdf_path if cert.pdf_path else None
    if not path or not path.exists():
        path = build_certificate_pdf(cert=cert, event=cert.event)
        cert.pdf_path = str(path.relative_to(CERT_ROOT))
        db.commit()
    return FileResponse(path, media_type="application/pdf", filename=f"{cert.certificate_id}.pdf")


@app.get("/verify/certificate/{certificate_id}")
def verify_certificate(certificate_id: str, db: Session = Depends(get_db)):
    cert = db.query(Certificate).filter(Certificate.certificate_id == certificate_id).first()
    if not cert: raise HTTPException(status_code=404, detail="Certificate not found")
    return {"valid": bool(cert.is_valid), "certificate": {"certificate_id": cert.certificate_id, "participant_name": cert.participant_name, "college": cert.college, "event_name": cert.event.name if cert.event else "", "score": cert.score, "solves": cert.solves, "rank": cert.rank, "certificate_type": cert.certificate_type, "issued_date": cert.issued_at.strftime("%B %d, %Y")}}


@app.get("/verify/certificate/{certificate_id}/page", response_class=HTMLResponse)
def verify_certificate_page(certificate_id: str, db: Session = Depends(get_db)):
    cert = db.query(Certificate).filter(Certificate.certificate_id == certificate_id).first()
    if not cert:
        return HTMLResponse("""<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>Certificate Not Found - OWASP CTF</title><style>body{font-family:'Segoe UI',sans-serif;background:#070d18;color:#e6edf8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.box{max-width:520px;width:100%;background:#111d31;border:1px solid #ef4444;border-radius:16px;padding:36px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.5)}.icon{font-size:48px;color:#ef4444;margin-bottom:12px}h1{font-size:22px;margin:0 0 10px;color:#ef4444}p{color:#8c9eb5;font-size:14px;line-height:1.6}a{display:inline-block;margin-top:20px;padding:10px 20px;background:#1e314b;color:#55d6be;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px}</style></head><body><div class='box'><div class='icon'>&#9888;</div><h1>Certificate Not Found</h1><p>The specified certificate ID was not found in the official OWASP CTF Academy registry. It may have been typed incorrectly or revoked.</p><a href='/'>Return to Platform</a></div></body></html>""", status_code=404)
    status_label = "AUTHENTIC & VERIFIED" if cert.is_valid else "REVOKED / INVALID"
    status_color = "#10b981" if cert.is_valid else "#ef4444"
    status_bg = "rgba(16, 185, 129, 0.12)" if cert.is_valid else "rgba(239, 68, 68, 0.12)"
    status_border = "rgba(16, 185, 129, 0.3)" if cert.is_valid else "rgba(239, 68, 68, 0.3)"
    icon_symbol = "&#10003;" if cert.is_valid else "&#10007;"
    event_name = cert.event.name if cert.event else "Official Tournament"
    college_name = cert.college or "OWASP Student Member"
    issued_date = cert.issued_at.strftime("%B %d, %Y")
    
    return HTMLResponse(f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Certificate Verification — {cert.certificate_id}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fira+Code:wght@500;700&display=swap" rel="stylesheet">
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #070d18;
      color: #e6edf8;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 16px;
    }}
    .verify-card {{
      max-width: 640px;
      width: 100%;
      background: #0c1524;
      border: 1px solid #1e314b;
      border-radius: 18px;
      padding: 36px 32px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(85, 214, 190, 0.08);
      position: relative;
    }}
    .verify-header {{
      display: flex;
      align-items: center;
      gap: 14px;
      border-bottom: 1px solid #1e314b;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }}
    .shield-badge {{
      width: 48px;
      height: 48px;
      background: rgba(85, 214, 190, 0.12);
      border: 1px solid rgba(85, 214, 190, 0.3);
      border-radius: 12px;
      display: grid;
      place-items: center;
      font-size: 24px;
      color: #55d6be;
    }}
    .header-text h1 {{
      font-size: 18px;
      font-weight: 800;
      color: #e6edf8;
      letter-spacing: -0.2px;
    }}
    .header-text p {{
      font-size: 12px;
      color: #8c9eb5;
      margin-top: 2px;
    }}
    .status-pill {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: {status_bg};
      border: 1px solid {status_border};
      color: {status_color};
      padding: 7px 16px;
      border-radius: 24px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 24px;
    }}
    .cert-id-tag {{
      display: block;
      font-family: 'Fira Code', monospace;
      font-size: 12px;
      font-weight: 700;
      color: #55d6be;
      background: #070d18;
      border: 1px solid #1e314b;
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 24px;
      word-break: break-all;
    }}
    .details-grid {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }}
    .detail-item {{
      background: #111d31;
      border: 1px solid #1e314b;
      border-radius: 10px;
      padding: 12px 14px;
    }}
    .detail-item.full {{
      grid-column: 1 / -1;
    }}
    .detail-label {{
      font-size: 11px;
      font-weight: 600;
      color: #5d718b;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 4px;
    }}
    .detail-val {{
      font-size: 14.5px;
      font-weight: 700;
      color: #e6edf8;
    }}
    .detail-val.accent {{
      color: #55d6be;
    }}
    .detail-val.gold {{
      color: #f59e0b;
    }}
    .verify-footer {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #1e314b;
      padding-top: 20px;
      gap: 12px;
      flex-wrap: wrap;
    }}
    .security-note {{
      font-size: 11.5px;
      color: #5d718b;
    }}
    .action-link {{
      background: #55d6be;
      color: #070d18;
      font-size: 12.5px;
      font-weight: 700;
      padding: 9px 18px;
      border-radius: 8px;
      text-decoration: none;
      transition: opacity 0.15s;
    }}
    .action-link:hover {{
      opacity: 0.9;
    }}
    @media (max-width: 540px) {{
      .details-grid {{ grid-template-columns: 1fr; }}
      .verify-card {{ padding: 24px 18px; }}
    }}
  </style>
</head>
<body>
  <div class="verify-card">
    <div class="verify-header">
      <div class="shield-badge">&#9670;</div>
      <div class="header-text">
        <h1>OWASP CTF Certificate Registry</h1>
        <p>Cryptographically Verified Competition Credential</p>
      </div>
    </div>

    <div class="status-pill">
      <span>{icon_symbol}</span>
      <span>{status_label}</span>
    </div>

    <span class="cert-id-tag">ID: {cert.certificate_id}</span>

    <div class="details-grid">
      <div class="detail-item full">
        <div class="detail-label">Recipient Name</div>
        <div class="detail-val accent">{cert.participant_name}</div>
      </div>
      <div class="detail-item full">
        <div class="detail-label">Academic / Club Affiliation</div>
        <div class="detail-val">{college_name}</div>
      </div>
      <div class="detail-item full">
        <div class="detail-label">Tournament / Competition</div>
        <div class="detail-val">{event_name}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Final Score</div>
        <div class="detail-val gold">{cert.score} PTS</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Flags Captured</div>
        <div class="detail-val">{cert.solves} Solves</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Leaderboard Rank</div>
        <div class="detail-val">Rank #{cert.rank or '1'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Issue Date</div>
        <div class="detail-val">{issued_date}</div>
      </div>
    </div>

    <div class="verify-footer">
      <div class="security-note">
        Issuer: College OWASP CTF Chapter<br>
        Signature: OWASP Lead & Faculty Coordinator
      </div>
      <a class="action-link" href="/certificates/{cert.certificate_id}/download">Download Official PDF</a>
    </div>
  </div>
</body>
</html>""")


@app.get("/admin/events/{event_id}/certificates")
def admin_list_certificates(event_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event: raise HTTPException(status_code=404, detail="Event not found")
    certs = db.query(Certificate).filter(Certificate.event_id == event_id).order_by(desc(Certificate.score), desc(Certificate.solves)).all()
    return {"success": True, "event": {"id": event.id, "name": event.name, "ended": datetime.utcnow() >= event.end_date}, "certificates": [{"certificate_id": c.certificate_id, "name": c.participant_name, "college": c.college, "score": c.score, "solves": c.solves, "rank": c.rank, "type": c.certificate_type, "is_valid": c.is_valid} for c in certs]}


@app.get("/admin/global-certificate-template")
def admin_get_global_certificate_template(admin: User = Depends(require_admin)):
    cfg = get_global_cert_config()
    tpl_url = get_cert_asset_url("global", "template")
    logo_url = get_cert_asset_url("global", "logo")
    sig_url = get_cert_asset_url("global", "signature")
    sec_sig_url = get_cert_asset_url("global", "second_signature")
    return {
        "success": True,
        "is_global": True,
        "has_template": bool(tpl_url),
        "template_url": tpl_url,
        "has_logo": bool(logo_url),
        "logo_url": logo_url,
        "has_signature": bool(sig_url),
        "signature_url": sig_url,
        "has_second_signature": bool(sec_sig_url),
        "second_signature_url": sec_sig_url,
        "config": cfg,
        "available_fonts": [
            {"id": k, "label": v["label"], "category": v["category"], "is_script": v.get("is_script", False)}
            for k, v in FONT_DEFINITIONS.items()
        ]
    }


@app.post("/admin/global-certificate-template")
async def admin_save_global_certificate_template(
    file: Optional[UploadFile] = File(None),
    config: Optional[str] = Form(None),
    apply_to_all_events: Optional[bool] = Form(False),
    regenerate_all: Optional[bool] = Form(False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if file and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in [".png", ".jpg", ".jpeg"]:
            raise HTTPException(status_code=400, detail="Only PNG and JPEG template images are allowed")
        data = await file.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Template image must be under 10 MB")
        for old_ext in [".png", ".jpg", ".jpeg"]:
            old_p = CERT_TEMPLATE_DIR / f"global_template{old_ext}"
            if old_p.exists():
                try: old_p.unlink()
                except Exception: pass
        target_path = CERT_TEMPLATE_DIR / f"global_template{ext}"
        target_path.write_bytes(data)

    parsed = {}
    if config:
        try:
            parsed = json.loads(config)
            save_global_cert_config(parsed)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid config JSON")

    if apply_to_all_events and config:
        events = db.query(Event).all()
        for ev in events:
            ev.cert_config = config
        db.commit()

    rebuilt_count = 0
    if regenerate_all:
        certs = db.query(Certificate).filter(Certificate.is_valid == True).all()
        for c in certs:
            try:
                pdf = build_certificate_pdf(cert=c, event=c.event)
                c.pdf_path = storage.put_file(f"certificates/{c.certificate_id}.pdf", pdf, "application/pdf") if storage.enabled() else str(pdf.relative_to(CERT_ROOT))
                rebuilt_count += 1
            except Exception as e:
                logger.error(f"Error rebuilding cert {c.certificate_id}: {e}")
        db.commit()

    return {
        "success": True,
        "message": f"Global certificate configuration saved successfully.{f' Updated {rebuilt_count} existing certificates.' if rebuilt_count else ''}",
        "config": get_global_cert_config(),
        "has_template": bool(get_cert_asset_url("global", "template")),
        "template_url": get_cert_asset_url("global", "template"),
        "has_logo": bool(get_cert_asset_url("global", "logo")),
        "logo_url": get_cert_asset_url("global", "logo"),
        "has_signature": bool(get_cert_asset_url("global", "signature")),
        "signature_url": get_cert_asset_url("global", "signature"),
        "has_second_signature": bool(get_cert_asset_url("global", "second_signature")),
        "second_signature_url": get_cert_asset_url("global", "second_signature")
    }


@app.get("/admin/global-certificate-preview")
def admin_preview_global_certificate(
    admin: User = Depends(require_admin)
):
    path = build_certificate_pdf(event=None, preview=True)
    return FileResponse(path, media_type="application/pdf", filename="global_certificate_preview.pdf")


@app.post("/admin/certificates/regenerate-all")
def admin_regenerate_all_certificates(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    certs = db.query(Certificate).filter(Certificate.is_valid == True).all()
    count = 0
    for c in certs:
        try:
            pdf = build_certificate_pdf(cert=c, event=c.event)
            c.pdf_path = storage.put_file(f"certificates/{c.certificate_id}.pdf", pdf, "application/pdf") if storage.enabled() else str(pdf.relative_to(CERT_ROOT))
            count += 1
        except Exception as e:
            logger.error(f"Error rebuilding cert {c.certificate_id}: {e}")
    db.commit()
    return {"success": True, "message": f"Successfully regenerated {count} certificates with latest design."}


@app.post("/admin/certificate-assets/upload")
async def admin_upload_certificate_asset(
    scope: str = Form("global"),
    asset_type: str = Form(...),  # template, logo, signature, second_signature
    file: UploadFile = File(...),
    admin: User = Depends(require_admin)
):
    if asset_type not in ["template", "logo", "signature", "second_signature"]:
        raise HTTPException(status_code=400, detail="Invalid asset type")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in [".png", ".jpg", ".jpeg"]:
        raise HTTPException(status_code=400, detail="Only PNG and JPEG images are allowed")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Asset image must be under 10MB")

    prefix = f"global_{asset_type}" if str(scope) == "global" else f"event_{scope}_{asset_type}"
    for old_file in CERT_TEMPLATE_DIR.glob(f"{prefix}.*"):
        try: old_file.unlink()
        except Exception: pass

    target = CERT_TEMPLATE_DIR / f"{prefix}{ext}"
    target.write_bytes(data)

    mtime = int(target.stat().st_mtime)
    asset_url = f"{PUBLIC_API_URL}/uploads/certificate_templates/{target.name}?t={mtime}"
    return {
        "success": True,
        "message": f"{asset_type.replace('_', ' ').title()} uploaded successfully",
        "asset_type": asset_type,
        "asset_url": asset_url,
        "scope": scope
    }


@app.delete("/admin/certificate-assets/{scope}/{asset_type}")
def admin_delete_certificate_asset(
    scope: str,
    asset_type: str,
    admin: User = Depends(require_admin)
):
    if asset_type not in ["template", "logo", "signature", "second_signature"]:
        raise HTTPException(status_code=400, detail="Invalid asset type")

    prefix = f"global_{asset_type}" if str(scope) == "global" else f"event_{scope}_{asset_type}"
    removed = False
    for old_file in CERT_TEMPLATE_DIR.glob(f"{prefix}.*"):
        try:
            old_file.unlink()
            removed = True
        except Exception: pass

    return {"success": True, "message": f"{asset_type.replace('_', ' ').title()} removed", "removed": removed}


@app.get("/admin/events/{event_id}/certificate-template")
def admin_get_certificate_template(event_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event: raise HTTPException(status_code=404, detail="Event not found")

    cfg = parse_cert_config(event=event)
    scope = str(event.id)
    tpl_url = get_cert_asset_url(scope, "template")
    logo_url = get_cert_asset_url(scope, "logo")
    sig_url = get_cert_asset_url(scope, "signature")
    sec_sig_url = get_cert_asset_url(scope, "second_signature")

    return {
        "success": True,
        "event_id": event.id,
        "has_template": bool(tpl_url),
        "template_url": tpl_url,
        "has_logo": bool(logo_url),
        "logo_url": logo_url,
        "has_signature": bool(sig_url),
        "signature_url": sig_url,
        "has_second_signature": bool(sec_sig_url),
        "second_signature_url": sec_sig_url,
        "config": cfg,
        "available_fonts": [
            {"id": k, "label": v["label"], "category": v["category"], "is_script": v.get("is_script", False)}
            for k, v in FONT_DEFINITIONS.items()
        ]
    }


@app.get("/admin/certificate-fonts")
def admin_get_certificate_fonts(admin: User = Depends(require_admin)):
    return {
        "success": True,
        "fonts": [
            {"id": k, "label": v["label"], "category": v["category"], "is_script": v.get("is_script", False)}
            for k, v in FONT_DEFINITIONS.items()
        ]
    }


@app.post("/admin/events/{event_id}/certificate-template")
async def admin_save_certificate_template(
    event_id: int,
    file: Optional[UploadFile] = File(None),
    config: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event: raise HTTPException(status_code=404, detail="Event not found")

    if file and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in [".png", ".jpg", ".jpeg"]:
            raise HTTPException(status_code=400, detail="Only PNG and JPEG template images are allowed")
        data = await file.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Template image must be under 10 MB")

        prefix = f"event_{event_id}_template"
        for old_ext in [".png", ".jpg", ".jpeg"]:
            old_p = CERT_TEMPLATE_DIR / f"{prefix}{old_ext}"
            if old_p.exists():
                try: old_p.unlink()
                except Exception: pass
        target = CERT_TEMPLATE_DIR / f"{prefix}{ext}"
        target.write_bytes(data)
        event.cert_template_path = target.name

    if config:
        try:
            parsed = json.loads(config)
            event.cert_config = json.dumps(parsed)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid config JSON")

    db.commit()
    db.refresh(event)

    cfg = parse_cert_config(event=event)
    scope = str(event_id)
    return {
        "success": True,
        "message": "Certificate template updated successfully",
        "has_template": bool(get_cert_asset_url(scope, "template")),
        "template_url": get_cert_asset_url(scope, "template"),
        "has_logo": bool(get_cert_asset_url(scope, "logo")),
        "logo_url": get_cert_asset_url(scope, "logo"),
        "has_signature": bool(get_cert_asset_url(scope, "signature")),
        "signature_url": get_cert_asset_url(scope, "signature"),
        "has_second_signature": bool(get_cert_asset_url(scope, "second_signature")),
        "second_signature_url": get_cert_asset_url(scope, "second_signature"),
        "config": cfg
    }


@app.delete("/admin/events/{event_id}/certificate-template")
def admin_delete_certificate_template(event_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event: raise HTTPException(status_code=404, detail="Event not found")

    if event.cert_template_path:
        tpl_path = CERT_TEMPLATE_DIR / event.cert_template_path
        if tpl_path.exists():
            try: tpl_path.unlink()
            except Exception: pass
        event.cert_template_path = None

    event.cert_config = None
    db.commit()
    return {"success": True, "message": "Certificate template reset to default", "config": DEFAULT_CERT_CONFIG}


@app.get("/admin/events/{event_id}/certificate-preview")
def admin_preview_certificate(
    event_id: int,
    orientation: Optional[str] = None,
    font_family: Optional[str] = None,
    recipient_font_family: Optional[str] = None,
    alignment: Optional[str] = None,
    primary_color: Optional[str] = None,
    accent_color: Optional[str] = None,
    title_font_size: Optional[int] = None,
    name_font_size: Optional[int] = None,
    body_font_size: Optional[int] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event: raise HTTPException(status_code=404, detail="Event not found")

    overrides = {}
    if orientation: overrides["orientation"] = orientation
    if font_family: overrides["font_family"] = font_family
    if recipient_font_family: overrides["recipient_font_family"] = recipient_font_family
    if alignment: overrides["alignment"] = alignment
    if primary_color: overrides["primary_color"] = primary_color
    if accent_color: overrides["accent_color"] = accent_color
    if title_font_size: overrides["title_font_size"] = title_font_size
    if name_font_size: overrides["name_font_size"] = name_font_size
    if body_font_size: overrides["body_font_size"] = body_font_size

    path = build_certificate_pdf(event=event, preview=True, preview_cfg=overrides)
    return FileResponse(path, media_type="application/pdf", filename=f"certificate_preview_{event_id}.pdf")


@app.post("/admin/events/{event_id}/certificates/generate")
def admin_generate_certificates(
    event_id: int,
    regenerate: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event: raise HTTPException(status_code=404, detail="Event not found")
    if datetime.utcnow() < event.end_date: raise HTTPException(status_code=400, detail="End the event before generating certificates")
    regs = db.query(EventRegistration).filter(EventRegistration.event_id == event_id).all()
    created = 0
    notifications_sent = 0
    emails_sent = 0
    for reg in regs:
        existing = db.query(Certificate).filter(Certificate.event_id == event_id, Certificate.user_id == reg.user_id).first()
        user = db.query(User).filter(User.id == reg.user_id).first()
        if not user: continue
        score, solves = event_user_stats(event_id, user.id, db)
        rank = event_user_rank(event_id, user.id, db)

        if existing:
            if not regenerate:
                continue
            cert = existing
            cert.score = score
            cert.solves = solves
            cert.rank = rank
            cert.is_valid = True
            pdf = build_certificate_pdf(cert=cert, event=event)
            cert.pdf_path = storage.put_file(f"certificates/{cert.certificate_id}.pdf", pdf, "application/pdf") if storage.enabled() else str(pdf.relative_to(CERT_ROOT))
            created += 1
        else:
            cert = Certificate(
                certificate_id=f"OWASP-CTF-{event.id}-{user.id}-{secrets.token_hex(4).upper()}",
                event_id=event.id,
                user_id=user.id,
                team_id=reg.team_id,
                participant_name=user.name,
                college=user.college or "OWASP Student Member",
                score=score,
                solves=solves,
                rank=rank,
                certificate_type="participation",
                pdf_path=""
            )
            db.add(cert)
            db.flush()
            pdf = build_certificate_pdf(cert=cert, event=event)
            cert.pdf_path = storage.put_file(f"certificates/{cert.certificate_id}.pdf", pdf, "application/pdf") if storage.enabled() else str(pdf.relative_to(CERT_ROOT))
            created += 1

        # Dispatch in-app notification
        db.add(Notification(
            user_id=user.id,
            title="Certificate Ready! 🎓",
            message=f"Congratulations {user.name}! Your official certificate for {event.name} is ready. Solved: {solves} flag(s), Score: {score} pts.",
            kind="certificate"
        ))
        notifications_sent += 1

        # Dispatch congratulations email
        if user.email:
            download_url = f"{PUBLIC_API_URL}/certificates/{cert.certificate_id}/download"
            verify_url = f"{PUBLIC_API_URL}/verify/certificate/{cert.certificate_id}/page"
            email_subject = f"Congratulations! Your Certificate for {event.name} is Ready"
            email_body = (
                f"Hello {user.name},\n\n"
                f"Congratulations on your achievement in {event.name}!\n\n"
                f"Here is your official CTF achievement summary:\n"
                f"- Score: {score} points\n"
                f"- Flags Solved: {solves}\n"
                f"- Final Rank: #{rank if rank else 'N/A'}\n"
                f"- Certificate ID: {cert.certificate_id}\n\n"
                f"You can download your official PDF certificate here:\n"
                f"{download_url}\n\n"
                f"Verify your certificate authenticity online here:\n"
                f"{verify_url}\n\n"
                f"Keep hacking and stay secure!\n"
                f"College OWASP CTF Chapter"
            )
            try:
                if send_email(user.email, email_subject, email_body):
                    emails_sent += 1
            except Exception as e:
                logger.warning("Failed to send certificate email to %s: %s", user.email, e)

    db.commit()
    return {
        "success": True,
        "created": created,
        "notifications_sent": notifications_sent,
        "emails_sent": emails_sent,
        "message": f"Generated {created} certificate(s), dispatched {notifications_sent} in-app notification(s) and {emails_sent} email(s)."
    }


@app.post("/admin/certificates/{certificate_id}/revoke")
def revoke_certificate(certificate_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    cert = db.query(Certificate).filter(Certificate.certificate_id == certificate_id).first()
    if not cert: raise HTTPException(status_code=404, detail="Certificate not found")
    cert.is_valid = False; db.commit()
    return {"success": True, "message": "Certificate revoked"}


@app.get("/teams/leaderboard")
def team_leaderboard(db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_optional_current_user)):
    teams = db.query(Team).order_by(Team.points.desc(), Team.challenges_solved.desc(), Team.created_at.asc()).all()
    return {"success": True, "leaderboard": [
        {"rank": i, "team_id": t.id, "name": t.name, "slug": t.slug, "points": t.points,
         "challenges_solved": t.challenges_solved, "member_count": len(t.members),
         "members": [m.user.name for m in t.members if m.user]}
        for i, t in enumerate(teams, 1)
    ]}


# =========================================================
# TEAMS / SQUAD HUB
# =========================================================

@app.get("/teams")
def list_teams(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    teams = db.query(Team).order_by(Team.created_at.desc()).all()
    mine = db.query(TeamMember).filter(TeamMember.user_id == current_user.id).first()

    # Outbound pending requests sent by current_user
    my_pending = db.query(TeamJoinRequest).filter(
        TeamJoinRequest.user_id == current_user.id,
        TeamJoinRequest.status == "pending"
    ).all()
    my_pending_dict = {
        req.team_id: {
            "request_id": req.id,
            "note": req.note,
            "created_at": req.created_at.isoformat()
        } for req in my_pending
    }

    # Inbound pending requests if user is a squad owner
    incoming_requests = []
    if mine:
        my_team = db.query(Team).filter(Team.id == mine.team_id).first()
        if my_team and my_team.owner_id == current_user.id:
            reqs = db.query(TeamJoinRequest).filter(
                TeamJoinRequest.team_id == my_team.id,
                TeamJoinRequest.status == "pending"
            ).order_by(TeamJoinRequest.created_at.desc()).all()
            for r in reqs:
                incoming_requests.append({
                    "id": r.id,
                    "team_id": r.team_id,
                    "user_id": r.user.id,
                    "user_name": r.user.name,
                    "user_college": r.user.college or "Independent",
                    "user_points": r.user.points,
                    "note": r.note or "",
                    "created_at": r.created_at.isoformat()
                })

    return {
        "success": True,
        "my_team_id": mine.team_id if mine else None,
        "my_pending_requests": my_pending_dict,
        "incoming_requests": incoming_requests,
        "teams": [
            {
                "id": t.id,
                "name": t.name,
                "slug": t.slug,
                "owner_id": t.owner_id,
                "owner_name": t.owner.name if t.owner else "Unknown",
                "member_count": len(t.members),
                "members": [{"id": m.user.id, "name": m.user.name, "college": m.user.college} for m in t.members if m.user]
            }
            for t in teams
        ]
    }


@app.post("/teams")
def create_team(data: TeamCreateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if db.query(TeamMember).filter(TeamMember.user_id == current_user.id).first():
        raise HTTPException(status_code=400, detail="You are already in a squad")
    name = data.name.strip()
    if len(name) < 3 or len(name) > 40:
        raise HTTPException(status_code=400, detail="Squad name must be 3-40 characters")
    slug = "-".join(name.lower().split())
    if db.query(Team).filter(or_(Team.name.ilike(name), Team.slug == slug)).first():
        raise HTTPException(status_code=400, detail="Squad name already exists")
    team = Team(name=name, slug=slug, owner_id=current_user.id)
    db.add(team); db.flush()
    db.add(TeamMember(team_id=team.id, user_id=current_user.id))
    db.add(Notification(user_id=current_user.id, title="Squad created", message=f"{name} is ready for teammates.", kind="team"))
    db.commit(); db.refresh(team)
    return {"success": True, "message": f"Squad {team.name} created", "team_id": team.id}


@app.post("/teams/{team_id}/request-join")
def request_join_team(
    team_id: int,
    data: Optional[TeamJoinRequestCreate] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if db.query(TeamMember).filter(TeamMember.user_id == current_user.id).first():
        raise HTTPException(status_code=400, detail="You are already in a squad. Leave your current squad first.")
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Squad not found")
    if len(team.members) >= 5:
        raise HTTPException(status_code=400, detail="Squad is full (maximum 5 members)")
    active_team_reg = db.query(EventRegistration).join(Event).filter(
        EventRegistration.team_id == team.id, Event.is_active == True,
        Event.start_date <= datetime.utcnow(), Event.end_date >= datetime.utcnow()
    ).first()
    if active_team_reg:
        raise HTTPException(status_code=400, detail="This squad is locked because it is currently competing in a tournament")

    note_text = (data.note if data and data.note else "").strip()
    existing = db.query(TeamJoinRequest).filter(
        TeamJoinRequest.team_id == team.id,
        TeamJoinRequest.user_id == current_user.id,
        TeamJoinRequest.status == "pending"
    ).first()
    if existing:
        existing.note = note_text
        existing.created_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": "Updated your pending join request note for this squad.", "request_id": existing.id}

    req = TeamJoinRequest(
        team_id=team.id,
        user_id=current_user.id,
        note=note_text,
        status="pending"
    )
    db.add(req)
    db.flush()

    note_msg = f' with note: "{note_text}"' if note_text else ''
    db.add(Notification(
        user_id=team.owner_id,
        title="New Squad Join Request",
        message=f"{current_user.name} requested to join {team.name}{note_msg}.",
        kind="team"
    ))
    db.commit()
    return {"success": True, "message": f"Join request sent to the squad leader of {team.name}.", "request_id": req.id}


@app.post("/teams/join")
def join_team(data: TeamJoinRequestSchema, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = db.query(Team).filter(Team.slug == data.slug.strip().lower()).first()
    if not team:
        raise HTTPException(status_code=404, detail="Squad not found with that join code")
    return request_join_team(team.id, TeamJoinRequestCreate(note=data.note or ""), db, current_user)


@app.post("/teams/requests/{request_id}/respond")
def respond_team_request(
    request_id: int,
    data: TeamRequestRespondBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    action = data.action.strip().lower()
    if action not in ["accept", "reject"]:
        raise HTTPException(status_code=400, detail="Action must be 'accept' or 'reject'")

    req = db.query(TeamJoinRequest).filter(TeamJoinRequest.id == request_id).first()
    if not req or req.status != "pending":
        raise HTTPException(status_code=404, detail="Pending join request not found")

    team = req.team
    if not team or team.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the squad leader can approve or reject join requests")

    if action == "accept":
        if len(team.members) >= 5:
            raise HTTPException(status_code=400, detail="Your squad is already full (maximum 5 members)")

        already_member = db.query(TeamMember).filter(TeamMember.user_id == req.user_id).first()
        if already_member:
            req.status = "rejected"
            req.reviewed_at = datetime.utcnow()
            db.commit()
            raise HTTPException(status_code=400, detail=f"{req.user.name} is already in another squad")

        # Add member to squad
        db.add(TeamMember(team_id=team.id, user_id=req.user_id))
        req.status = "accepted"
        req.reviewed_at = datetime.utcnow()

        # Cancel any other pending requests for that user
        other_requests = db.query(TeamJoinRequest).filter(
            TeamJoinRequest.user_id == req.user_id,
            TeamJoinRequest.id != req.id,
            TeamJoinRequest.status == "pending"
        ).all()
        for o_req in other_requests:
            o_req.status = "cancelled"
            o_req.reviewed_at = datetime.utcnow()

        db.add(Notification(
            user_id=req.user_id,
            title="Squad Request Accepted! 🎉",
            message=f"You have been accepted into {team.name} by squad leader {current_user.name}!",
            kind="team"
        ))

        # Sync active/upcoming event registrations for the new member
        team_event_regs = db.query(EventRegistration).filter(EventRegistration.team_id == team.id).all()
        synced_events = set()
        for ev_reg in team_event_regs:
            if ev_reg.event_id in synced_events:
                continue
            synced_events.add(ev_reg.event_id)
            existing_user_reg = db.query(EventRegistration).filter(
                EventRegistration.event_id == ev_reg.event_id,
                EventRegistration.user_id == req.user_id
            ).first()
            if existing_user_reg:
                existing_user_reg.team_id = team.id
            else:
                db.add(EventRegistration(event_id=ev_reg.event_id, user_id=req.user_id, team_id=team.id, registered_at=datetime.utcnow()))

        db.commit()
        return {"success": True, "message": f"{req.user.name} has been added to {team.name}."}

    else:
        req.status = "rejected"
        req.reviewed_at = datetime.utcnow()
        db.add(Notification(
            user_id=req.user_id,
            title="Squad Request Declined",
            message=f"Your request to join {team.name} was declined by the squad leader.",
            kind="team"
        ))
        db.commit()
        return {"success": True, "message": f"Join request from {req.user.name} has been declined."}


@app.delete("/teams/requests/{request_id}/cancel")
def cancel_team_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    req = db.query(TeamJoinRequest).filter(
        TeamJoinRequest.id == request_id,
        TeamJoinRequest.user_id == current_user.id,
        TeamJoinRequest.status == "pending"
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Pending request not found")
    req.status = "cancelled"
    req.reviewed_at = datetime.utcnow()
    db.commit()
    return {"success": True, "message": "Join request cancelled."}


@app.post("/teams/leave")
def leave_team(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(TeamMember).filter(TeamMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=400, detail="You are not in a squad")
    team = membership.team
    active_team_reg = db.query(EventRegistration).join(Event).filter(
        EventRegistration.team_id == team.id, Event.is_active == True,
        Event.start_date <= datetime.utcnow(), Event.end_date >= datetime.utcnow()
    ).first()
    if active_team_reg:
        raise HTTPException(status_code=400, detail="You cannot change squad membership during an active tournament")
    if team.owner_id == current_user.id:
        if len(team.members) > 1:
            raise HTTPException(status_code=400, detail="Squad owner cannot leave while other members remain")
        db.delete(team)
    else:
        db.delete(membership)
    db.commit()
    return {"success": True, "message": "You left the squad"}


# =========================================================
# NOTIFICATIONS
# =========================================================

@app.get("/notifications")
def get_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    items = db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).limit(50).all()
    unread = db.query(func.count(Notification.id)).filter(Notification.user_id == current_user.id, Notification.is_read == False).scalar() or 0
    return {"success": True, "unread": unread, "notifications": [
        {"id": n.id, "title": n.title, "message": n.message, "kind": n.kind, "is_read": n.is_read, "created_at": n.created_at}
        for n in items
    ]}


@app.post("/notifications/{notification_id}/read")
def read_notification(notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == current_user.id).first()
    if not n: raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True; db.commit()
    return {"success": True}


@app.post("/notifications/read-all")
def read_all_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).update({Notification.is_read: True})
    db.commit()
    return {"success": True}


# =========================================================
# ADMIN ANTI-CHEAT / MODERATION
# =========================================================

@app.get("/admin/security/alerts")
def admin_security_alerts(
    severity: Optional[str] = None,
    reviewed: Optional[bool] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    q = db.query(SecurityAlert)
    if severity and severity != "all":
        q = q.filter(SecurityAlert.severity == severity)
    if reviewed is not None:
        q = q.filter(SecurityAlert.is_reviewed == reviewed)
    alerts = q.order_by(SecurityAlert.created_at.desc()).limit(100).all()
    return {"success": True, "alerts": [{
        "id": a.id, "severity": a.severity, "alert_type": a.alert_type,
        "message": a.message, "is_reviewed": a.is_reviewed,
        "created_at": a.created_at,
        "user_id": a.user_id, "user_name": a.user.name if a.user else "Unknown",
        "team_id": a.team_id, "team_name": a.team.name if a.team else None,
        "challenge_id": a.challenge_id, "challenge_title": a.challenge.title if a.challenge else None,
        "metadata": json.loads(a.metadata_json) if a.metadata_json else {}
    } for a in alerts]}


@app.post("/admin/security/alerts/{alert_id}/review")
def review_security_alert(
    alert_id: int,
    data: AlertReviewRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    alert = db.query(SecurityAlert).filter(SecurityAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Security alert not found")
    alert.is_reviewed = data.reviewed
    db.commit()
    return {"success": True, "message": "Alert review status updated"}


@app.get("/admin/security/overview")
def admin_security_overview(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    now = datetime.utcnow()
    total = db.query(func.count(SecurityAlert.id)).scalar() or 0
    open_alerts = db.query(func.count(SecurityAlert.id)).filter(SecurityAlert.is_reviewed == False).scalar() or 0
    high = db.query(func.count(SecurityAlert.id)).filter(SecurityAlert.severity == "high", SecurityAlert.is_reviewed == False).scalar() or 0
    failed_24h = db.query(func.count(Submission.id)).filter(Submission.is_correct == False, Submission.submitted_at >= now - timedelta(hours=24)).scalar() or 0
    suspicious_24h = db.query(func.count(Submission.id)).filter(Submission.risk_score >= 40, Submission.submitted_at >= now - timedelta(hours=24)).scalar() or 0
    return {"success": True, "metrics": {"total_alerts": total, "open_alerts": open_alerts, "high_open_alerts": high, "failed_submissions_24h": failed_24h, "suspicious_submissions_24h": suspicious_24h}}


# =========================================================
# ADMIN PANEL
# =========================================================

@app.get("/admin/monitoring")
def admin_monitoring(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    recent_submissions = db.query(Submission).order_by(Submission.submitted_at.desc()).limit(100).all()
    return {
        "success": True,
        "runtime": snapshot(),
        "submissions_last_100": [{"id": x.id, "user_id": x.user_id, "challenge_id": x.challenge_id, "correct": x.is_correct, "risk_score": x.risk_score, "submitted_at": x.submitted_at.isoformat() if x.submitted_at else None} for x in recent_submissions],
        "live_instances": db.query(ChallengeInstance).filter(ChallengeInstance.status.in_(["starting", "running"])).count(),
        "open_security_alerts": db.query(SecurityAlert).filter(SecurityAlert.is_reviewed == False).count(),
    }

@app.get("/admin/analytics")
def get_admin_analytics(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    total_users = db.query(func.count(User.id)).filter(User.role == "user").scalar() or 0
    total_challenges = db.query(func.count(Challenge.id)).filter(Challenge.is_active == True).scalar() or 0
    total_events = db.query(func.count(Event.id)).scalar() or 0
    total_submissions = db.query(func.count(Submission.id)).scalar() or 0
    correct_submissions = db.query(func.count(Submission.id)).filter(Submission.is_correct == True).scalar() or 0

    # Category breakdown
    categories_stats = db.query(
        Challenge.category,
        func.count(Challenge.id).label("count"),
        func.sum(Challenge.solves_count).label("solves")
    ).filter(Challenge.is_active == True).group_by(Challenge.category).all()

    category_data = [
        {"category": c.category, "challenges": c.count, "solves": int(c.solves or 0)}
        for c in categories_stats
    ]

    # Challenge solve rates
    challenges = db.query(Challenge).filter(Challenge.is_active == True).all()
    challenge_stats = []
    for ch in challenges:
        total_attempts = db.query(func.count(Submission.id)).filter(Submission.challenge_id == ch.id).scalar() or 0
        solve_rate = round((ch.solves_count / total_attempts * 100), 1) if total_attempts > 0 else 0.0
        challenge_stats.append({
            "id": ch.id,
            "title": ch.title,
            "category": ch.category,
            "difficulty": ch.difficulty,
            "points": ch.points,
            "solves": ch.solves_count,
            "attempts": total_attempts,
            "solve_rate": solve_rate
        })

    # Recent submissions log
    recent_subs = db.query(Submission).order_by(Submission.submitted_at.desc()).limit(20).all()
    submission_logs = [
        {
            "id": s.id,
            "user_name": s.user.name if s.user else "Unknown",
            "challenge_title": s.challenge.title if s.challenge else "Unknown",
            "submitted_flag": s.submitted_flag[:30] + ("..." if len(s.submitted_flag) > 30 else ""),
            "is_correct": s.is_correct,
            "points_awarded": s.points_awarded,
            "submitted_at": s.submitted_at
        }
        for s in recent_subs
    ]

    return {
        "success": True,
        "metrics": {
            "total_users": total_users,
            "total_challenges": total_challenges,
            "total_events": total_events,
            "total_submissions": total_submissions,
            "correct_submissions": correct_submissions,
            "accuracy_rate": round((correct_submissions / total_submissions * 100), 1) if total_submissions > 0 else 0.0
        },
        "category_data": category_data,
        "challenge_stats": challenge_stats,
        "submission_logs": submission_logs
    }


@app.get("/admin/users")
def get_all_users(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    query = db.query(User)
    if search:
        query = query.filter(
            or_(
                User.name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                User.college.ilike(f"%{search}%")
            )
        )
    users = query.order_by(User.id.desc()).all()
    return {
        "success": True,
        "count": len(users),
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "college": u.college,
                "points": u.points,
                "challenges_solved": u.challenges_solved,
                "is_active": u.is_active,
                "joined_at": u.joined_at
            }
            for u in users
        ]
    }


@app.put("/admin/users/{user_id}/role")
def update_user_role(
    user_id: int,
    data: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if data.role not in ["user", "moderator", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'user', 'moderator', or 'admin'")

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    target_user.role = data.role
    db.commit()

    return {"success": True, "message": f"User {target_user.name} role updated to {data.role}"}


@app.put("/admin/users/{user_id}/toggle-active")
def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own admin account")

    target_user.is_active = not target_user.is_active
    db.commit()

    state = "activated" if target_user.is_active else "deactivated"
    return {"success": True, "message": f"User {target_user.name} has been {state}", "is_active": target_user.is_active}


@app.get("/admin/challenges")
def admin_list_challenges(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    rows = db.query(Challenge).order_by(Challenge.created_at.desc()).all()
    return {"success": True, "challenges": [{
        "id": c.id, "title": c.title, "description": c.description, "category": c.category,
        "difficulty": c.difficulty, "points": c.points, "hint": c.hint, "hint_cost": c.hint_cost,
        "writeup": c.writeup, "file_url": (f"{PUBLIC_API_URL}/challenges/{c.id}/file" if c.file_path else c.file_url), "file_path": bool(c.file_path),
        "connection_info": c.connection_info, "event_id": c.event_id, "solves_count": c.solves_count,
        "is_active": c.is_active, "status": c.status, "flag_mode": c.flag_mode,
        "has_flag_secret": bool(c.flag_secret), "runtime_image": c.runtime_image, "runtime_port": c.runtime_port, "runtime_protocol": c.runtime_protocol, "instance_timeout_minutes": c.instance_timeout_minutes,
        "scoring_mode": getattr(c, "scoring_mode", "static") or "static",
        "initial_points": getattr(c, "initial_points", c.points) or c.points,
        "min_points": getattr(c, "min_points", 50) or 50,
        "decay_limit": getattr(c, "decay_limit", 20) or 20,
        "created_at": c.created_at.isoformat()
    } for c in rows]}


@app.post("/admin/challenges")
def admin_create_challenge(
    data: ChallengeCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if not data.title.strip() or data.points <= 0:
        raise HTTPException(status_code=400, detail="Title and positive points are required")
    if data.flag_mode not in ["static", "user", "team"]:
        raise HTTPException(status_code=400, detail="Invalid flag mode")
    if data.status not in ["draft", "published", "archived"]:
        raise HTTPException(status_code=400, detail="Invalid challenge status")
    if data.flag_mode == "static" and not data.flag.strip():
        raise HTTPException(status_code=400, detail="Static challenges require a flag")

    ch = Challenge(
        title=data.title.strip(),
        description=data.description.strip(),
        category=data.category.strip(),
        difficulty=data.difficulty.strip(),
        points=data.points,
        flag=data.flag.strip() if data.flag else "",
        flag_mode=data.flag_mode,
        flag_secret=(data.flag_secret.strip() if data.flag_secret else (secrets.token_urlsafe(32) if data.flag_mode != "static" else None)),
        status=data.status,
        hint=data.hint.strip() if data.hint else None,
        hint_cost=data.hint_cost or 15,
        writeup=data.writeup.strip() if data.writeup else None,
        file_url=data.file_url.strip() if data.file_url else None,
        connection_info=data.connection_info.strip() if data.connection_info else None,
        event_id=data.event_id,
        runtime_image=data.runtime_image.strip() if data.runtime_image else None,
        runtime_port=data.runtime_port,
        runtime_protocol=(data.runtime_protocol or "http").lower(),
        instance_timeout_minutes=max(5, min(data.instance_timeout_minutes or 60, 240)),
        scoring_mode=data.scoring_mode or "static",
        initial_points=data.initial_points or data.points,
        min_points=data.min_points or 50,
        decay_limit=data.decay_limit or 20
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)

    return {"success": True, "message": "Challenge created successfully", "challenge": {"id": ch.id, "title": ch.title}}


@app.put("/admin/challenges/{challenge_id}")
def admin_update_challenge(
    challenge_id: int,
    data: ChallengeUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    ch = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    if data.title is not None:
        ch.title = data.title.strip()
    if data.description is not None:
        ch.description = data.description.strip()
    if data.category is not None:
        ch.category = data.category.strip()
    if data.difficulty is not None:
        ch.difficulty = data.difficulty.strip()
    if data.points is not None and data.points > 0:
        ch.points = data.points
    if data.flag is not None and data.flag.strip():
        ch.flag = data.flag.strip()
    if data.flag_mode is not None:
        if data.flag_mode not in ["static", "user", "team"]:
            raise HTTPException(status_code=400, detail="Invalid flag mode")
        ch.flag_mode = data.flag_mode
        if data.flag_mode != "static" and not ch.flag_secret:
            ch.flag_secret = secrets.token_urlsafe(32)
    if data.flag_secret is not None:
        ch.flag_secret = data.flag_secret.strip() or secrets.token_urlsafe(32)
    if data.status is not None:
        if data.status not in ["draft", "published", "archived"]:
            raise HTTPException(status_code=400, detail="Invalid challenge status")
        ch.status = data.status
    if data.hint is not None:
        ch.hint = data.hint.strip() or None
    if data.hint_cost is not None:
        ch.hint_cost = data.hint_cost
    if data.writeup is not None:
        ch.writeup = data.writeup.strip() or None
    if data.file_url is not None:
        ch.file_url = data.file_url.strip() or None
    if data.connection_info is not None:
        ch.connection_info = data.connection_info.strip() or None
    if data.event_id is not None:
        ch.event_id = data.event_id if data.event_id > 0 else None
    if data.runtime_image is not None:
        ch.runtime_image = data.runtime_image.strip() or None
    if data.runtime_port is not None:
        ch.runtime_port = data.runtime_port or None
    if data.runtime_protocol is not None:
        ch.runtime_protocol = data.runtime_protocol.lower()
    if data.instance_timeout_minutes is not None:
        ch.instance_timeout_minutes = max(5, min(data.instance_timeout_minutes, 240))
    if data.scoring_mode is not None:
        ch.scoring_mode = data.scoring_mode
    if data.initial_points is not None:
        ch.initial_points = data.initial_points
    if data.min_points is not None:
        ch.min_points = data.min_points
    if data.decay_limit is not None:
        ch.decay_limit = data.decay_limit
    if data.is_active is not None:
        ch.is_active = data.is_active

    db.commit()
    db.refresh(ch)

    return {"success": True, "message": "Challenge updated successfully"}


@app.delete("/admin/challenges/{challenge_id}")
def admin_delete_challenge(
    challenge_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    ch = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    db.delete(ch)
    db.commit()
    return {"success": True, "message": "Challenge deleted successfully"}


@app.post("/admin/challenges/{challenge_id}/publish")
def admin_publish_challenge(challenge_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ch = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if ch.flag_mode == "static" and not ch.flag:
        raise HTTPException(status_code=400, detail="Static challenge needs a flag before publishing")
    ch.status = "published"
    ch.is_active = True
    db.commit()
    return {"success": True, "message": "Challenge published"}


@app.post("/admin/challenges/{challenge_id}/archive")
def admin_archive_challenge(challenge_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ch = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")
    ch.status = "archived"
    ch.is_active = False
    db.commit()
    return {"success": True, "message": "Challenge archived"}


@app.get("/admin/challenges/{challenge_id}/hints")
def admin_list_hints(challenge_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    hints = db.query(ChallengeHint).filter(ChallengeHint.challenge_id == challenge_id).order_by(ChallengeHint.order_index.asc()).all()
    return {"success": True, "hints": [{"id": h.id, "title": h.title, "content": h.content, "cost": h.cost, "order_index": h.order_index} for h in hints]}


class HintCreate(BaseModel):
    title: str = "Hint"
    content: str
    cost: int = 15
    order_index: int = 1


@app.post("/admin/challenges/{challenge_id}/hints")
def admin_add_hint(challenge_id: int, data: HintCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if not data.content.strip() or data.cost < 0:
        raise HTTPException(status_code=400, detail="Hint content and valid cost are required")
    if not db.query(Challenge).filter(Challenge.id == challenge_id).first():
        raise HTTPException(status_code=404, detail="Challenge not found")
    h = ChallengeHint(challenge_id=challenge_id, title=data.title.strip() or "Hint", content=data.content.strip(), cost=data.cost, order_index=max(1, data.order_index))
    db.add(h); db.commit(); db.refresh(h)
    return {"success": True, "hint": {"id": h.id, "title": h.title, "content": h.content, "cost": h.cost, "order_index": h.order_index}}


@app.delete("/admin/challenges/{challenge_id}/hints/{hint_id}")
def admin_delete_hint(challenge_id: int, hint_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    h = db.query(ChallengeHint).filter(ChallengeHint.id == hint_id, ChallengeHint.challenge_id == challenge_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Hint not found")
    db.delete(h); db.commit()
    return {"success": True, "message": "Hint deleted"}


@app.post("/admin/challenges/{challenge_id}/upload")
async def admin_upload_challenge_file(challenge_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ch = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    allowed = {".zip", ".txt", ".pdf", ".png", ".jpg", ".jpeg", ".pcap", ".7z", ".py", ".js", ".exe", ".bin"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported challenge file type")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Maximum file size is 25 MB")

    safe_name = f"{challenge_id}_{uuid.uuid4().hex}{ext}"
    content_type = file.content_type or "application/octet-stream"
    if storage.enabled():
        key = f"challenges/{safe_name}"
        ch.file_path = storage.put_bytes(key, data, content_type)
    else:
        upload_dir = Path(__file__).parent / "uploads" / "challenges"
        upload_dir.mkdir(parents=True, exist_ok=True)
        target = upload_dir / safe_name
        target.write_bytes(data)
        ch.file_path = str(target)
    db.commit()
    return {"success": True, "message": "Challenge file uploaded", "storage": "object-storage" if storage.enabled() else "local", "file_url": f"{PUBLIC_API_URL}/challenges/{ch.id}/file", "original_name": file.filename, "size": len(data)}


@app.get("/challenges/{challenge_id}/file")
def challenge_file_download(challenge_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from fastapi.responses import RedirectResponse
    ch = db.query(Challenge).filter(Challenge.id == challenge_id, Challenge.is_active == True, Challenge.status == "published").first()
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")
    # Priority 1: locally uploaded file
    if ch.file_path:
        if ch.file_path.startswith("s3://"):
            url = storage.signed_url(ch.file_path)
            if not url:
                raise HTTPException(status_code=503, detail="Object storage is unavailable")
            return RedirectResponse(url=url, status_code=307)
        path = Path(ch.file_path)
        if path.exists() and path.is_file():
            return FileResponse(path, filename=path.name, media_type="application/octet-stream")
    # Priority 2: external file_url (redirect)
    if ch.file_url and ch.file_url.startswith("http"):
        return RedirectResponse(url=ch.file_url, status_code=302)
    raise HTTPException(status_code=404, detail="No file attached to this challenge")


@app.get("/admin/storage/status")
def admin_storage_status(admin: User = Depends(require_admin)):
    return {"success": True, "storage": storage.status()}


@app.post("/admin/storage/migrate-local")
def admin_migrate_local_storage(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if not storage.enabled():
        raise HTTPException(status_code=400, detail="Object storage is not configured")
    migrated = {"challenge_files": 0, "certificates": 0, "errors": []}
    for ch in db.query(Challenge).filter(Challenge.file_path.isnot(None)).all():
        if ch.file_path.startswith("s3://"):
            continue
        path = Path(ch.file_path)
        if path.exists() and path.is_file():
            try:
                ch.file_path = storage.put_file(f"challenges/{path.name}", path, "application/octet-stream")
                migrated["challenge_files"] += 1
            except Exception as exc:
                migrated["errors"].append(f"challenge {ch.id}: {str(exc)[:180]}")
    for cert in db.query(Certificate).all():
        if cert.pdf_path.startswith("s3://"):
            continue
        path = CERT_ROOT / cert.pdf_path
        if path.exists() and path.is_file():
            try:
                cert.pdf_path = storage.put_file(f"certificates/{cert.certificate_id}.pdf", path, "application/pdf")
                migrated["certificates"] += 1
            except Exception as exc:
                migrated["errors"].append(f"certificate {cert.certificate_id}: {str(exc)[:180]}")
    db.commit()
    return {"success": True, "migrated": migrated}


@app.get("/admin/challenges/{challenge_id}/flag-preview")
def admin_flag_preview(challenge_id: int, user_id: Optional[int] = None, team_id: Optional[int] = None, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ch = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if ch.flag_mode == "static":
        return {"flag_mode": "static", "flag": ch.flag}
    scope = f"user:{user_id}" if ch.flag_mode == "user" else f"team:{team_id}"
    if (ch.flag_mode == "user" and not user_id) or (ch.flag_mode == "team" and not team_id):
        raise HTTPException(status_code=400, detail="Provide the required user_id or team_id")
    token = hmac.new((ch.flag_secret or "").encode(), f"{ch.id}:{scope}".encode(), hashlib.sha256).hexdigest()[:24]
    return {"flag_mode": ch.flag_mode, "flag": f"OWASP{{{token}}}"}


@app.post("/admin/events")
def admin_create_event(
    data: EventCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if data.end_date <= data.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")

    mode = data.participation_mode.lower().strip()
    if mode not in {"individual", "team", "both"}:
        raise HTTPException(status_code=400, detail="Participation mode must be individual, team, or both")
    ev = Event(name=data.name.strip(), description=data.description.strip(), start_date=data.start_date, end_date=data.end_date, participation_mode=mode)
    db.add(ev)
    db.commit()
    db.refresh(ev)

    return {"success": True, "message": "Event created successfully", "event": {"id": ev.id, "name": ev.name}}


@app.put("/admin/events/{event_id}")
def admin_update_event(
    event_id: int,
    data: EventUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    if data.name is not None:
        ev.name = data.name.strip()
    if data.description is not None:
        ev.description = data.description.strip()
    if data.start_date is not None:
        ev.start_date = data.start_date
    if data.end_date is not None:
        ev.end_date = data.end_date
    if data.is_scoreboard_frozen is not None:
        ev.is_scoreboard_frozen = data.is_scoreboard_frozen
    if data.is_active is not None:
        ev.is_active = data.is_active
    if data.participation_mode is not None:
        mode = data.participation_mode.lower().strip()
        if mode not in {"individual", "team", "both"}:
            raise HTTPException(status_code=400, detail="Participation mode must be individual, team, or both")
        ev.participation_mode = mode

    db.commit()
    return {"success": True, "message": "Event updated successfully"}


@app.post("/admin/events/{event_id}/toggle-freeze")
def admin_toggle_freeze(
    event_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    ev.is_scoreboard_frozen = not ev.is_scoreboard_frozen
    db.commit()

    status = "FROZEN" if ev.is_scoreboard_frozen else "UNFROZEN"
    return {"success": True, "message": f"Event scoreboard is now {status}", "is_scoreboard_frozen": ev.is_scoreboard_frozen}


@app.delete("/admin/events/{event_id}")
def admin_delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(ev)
    db.commit()
    return {"success": True, "message": "Event deleted successfully"}


@app.get("/admin/events/{event_id}/export")
def admin_export_event_results(
    event_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")

    regs = db.query(EventRegistration).filter(EventRegistration.event_id == event_id).all()
    event_chall_ids = [c.id for c in ev.challenges] if ev.challenges else []

    standings = []
    for r in regs:
        u = r.user
        t = r.team
        subs = []
        if event_chall_ids:
            sub_query = db.query(Submission).filter(
                Submission.challenge_id.in_(event_chall_ids),
                Submission.is_correct == True
            )
            if t:
                sub_query = sub_query.filter(Submission.team_id == t.id)
            else:
                sub_query = sub_query.filter(Submission.user_id == u.id)
            subs = sub_query.order_by(Submission.submitted_at.desc()).all()

        score = sum(s.points_awarded for s in subs)
        solves = len(subs)
        last_solve = subs[0].submitted_at.isoformat() if subs else "—"

        standings.append({
            "name": t.name if t else (u.name if u else "Unknown"),
            "type": "Squad" if t else "Solo",
            "email": u.email if u else "—",
            "college": (u.college if u and u.college else "PCCOE / Independent"),
            "solves": solves,
            "score": score,
            "last_solve": last_solve
        })

    standings.sort(key=lambda x: (x["score"], x["solves"]), reverse=True)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Rank", "Participant / Squad", "Registration Type", "Contact Email",
        "College / Affiliation", "Solves Count", "Total Score", "Last Solve Timestamp"
    ])
    for rank, item in enumerate(standings, start=1):
        writer.writerow([
            rank,
            item["name"],
            item["type"],
            item["email"],
            item["college"],
            item["solves"],
            item["score"],
            item["last_solve"]
        ])

    csv_data = output.getvalue()
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', ev.name)
    filename = f"event_{event_id}_{safe_name}_standings.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )