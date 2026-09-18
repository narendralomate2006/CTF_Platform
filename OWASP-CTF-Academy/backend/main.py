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

import storage
from observability import configure_logging, record_request, snapshot

from fastapi import FastAPI, HTTPException, Depends, Header, Query, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from fastapi import status as http_status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, desc, or_
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from pwdlib import PasswordHash
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

try:
    from authlib.integrations.starlette_client import OAuth
except ImportError:
    OAuth = None

try:
    from authlib.integrations.starlette_client import OAuth
except ImportError:
    OAuth = None

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
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


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
    if "certificates" not in tables:
        # New installations get this from create_all; old databases are handled by create_all.
        pass
    if "events" in tables:
        cols = {c["name"] for c in inspector.get_columns("events")}
        if "participation_mode" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE events ADD COLUMN participation_mode VARCHAR(20) NOT NULL DEFAULT 'individual'"))
    if "users" in tables:
        cols = {c["name"] for c in inspector.get_columns("users")}
        with engine.begin() as conn:
            if "email_verified" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE"))
            if "google_sub" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR(255)"))
            if "verification_sent_at" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN verification_sent_at TIMESTAMP"))

upgrade_sqlite_schema()

def upgrade_auth_schema():
    """Small additive migration for PostgreSQL deployments too."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("users")}
    if str(engine.url).startswith("sqlite"):
        return
    statements = []
    if "email_verified" not in cols:
        statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE")
    if "google_sub" not in cols:
        statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)")
    if "verification_sent_at" not in cols:
        statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMP")
    if statements:
        with engine.begin() as conn:
            for statement in statements:
                conn.execute(text(statement))

upgrade_auth_schema()


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
    db: Session = Depends(get_db)
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization token missing or invalid")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    db: Session = Depends(get_db)
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization token missing or invalid")

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    db: Session = Depends(get_db)
) -> Optional[User]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    sent = send_email(user.email, "Verify your OWASP CTF account", body)
    return sent, link if DEV_AUTH_LINKS else None


def send_password_reset_email(user: User):
    token = create_purpose_token(str(user.id), "password_reset", 30)
    link = f"{FRONTEND_URL}/#reset-password?token={token}"
    body = f"Hi {user.name},\n\nReset your OWASP CTF password:\n{link}\n\nThis link expires in 30 minutes. If you did not request this, ignore this email."
    sent = send_email(user.email, "Reset your OWASP CTF password", body)
    return sent, link if DEV_AUTH_LINKS else None


def google_oauth_configured():
    return bool(OAuth and GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

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
    sent = send_email(user.email, "Verify your OWASP CTF account", body)
    return sent, link if DEV_AUTH_LINKS else None


def send_password_reset_email(user: User):
    token = create_purpose_token(str(user.id), "password_reset", 30)
    link = f"{FRONTEND_URL}/#reset-password?token={token}"
    body = f"Hi {user.name},\n\nReset your OWASP CTF password:\n{link}\n\nThis link expires in 30 minutes. If you did not request this, ignore this email."
    sent = send_email(user.email, "Reset your OWASP CTF password", body)
    return sent, link if DEV_AUTH_LINKS else None


def google_oauth_configured():
    return bool(OAuth and GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

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
    runtime_protocol: str = "http"
    instance_timeout_minutes: int = 60
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


class TeamJoinRequest(BaseModel):
    slug: str


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
    if not user or not verify_password(data.password, user.password_hash):
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
    if not user or user.google_sub:
        return result
    try:
        sent, dev_link = send_password_reset_email(user)
        if dev_link: result["development_reset_link"] = dev_link
        result["delivery"] = "sent" if sent else "smtp_not_configured"
    except Exception:
        result["delivery"] = "failed"
    return result


@app.post("/auth/reset-password")
def reset_password(data: PasswordResetConfirmRequest, db: Session = Depends(get_db)):
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    payload = decode_purpose_token(data.token, "password_reset")
    try: user_id = int(payload["sub"])
    except Exception: raise HTTPException(status_code=400, detail="Invalid reset link")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.google_sub: raise HTTPException(status_code=400, detail="Password reset is unavailable for this account")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"success": True, "message": "Password updated. Please log in with your new password."}


@app.get("/auth/google")
def google_login(request: Request):
    if not google_oauth_configured():
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")
    oauth = OAuth()
    oauth.register(name="google", client_id=GOOGLE_CLIENT_ID, client_secret=GOOGLE_CLIENT_SECRET,
                   server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
                   client_kwargs={"scope": "openid email profile"})
    state = create_purpose_token(secrets.token_urlsafe(24), "google_oauth", 10)
    redirect_uri = GOOGLE_REDIRECT_URI
    return oauth.google.authorize_redirect(request, redirect_uri, state=state)


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
        "auth_provider": "google" if current_user.google_sub else "password"
    }


@app.put("/auth/profile")
def update_profile(
    data: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.name and len(data.name.strip()) >= 2:
        current_user.name = data.name.strip()
    if data.college is not None:
        current_user.college = data.college.strip() or None
    if data.bio is not None:
        current_user.bio = data.bio.strip() or None
    if data.github is not None:
        current_user.github = data.github.strip() or None
    if data.profile_photo is not None:
        current_user.profile_photo = data.profile_photo.strip() or None

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

    result = []
    for c in challenges:
        is_solved = c.id in solved_set
        hint_unlocked = (c.id in unlocked_hints_set) or (current_user and current_user.role == "admin")
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
            "file_url": c.file_url,
            "connection_info": c.connection_info,
            "event_id": c.event_id,
            "solves_count": c.solves_count,
            "is_solved": is_solved,
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
            "file_url": challenge.file_url,
            "connection_info": challenge.connection_info,
            "event_id": challenge.event_id,
            "solves_count": challenge.solves_count,
            "is_solved": is_solved,
            "has_writeup": bool(challenge.writeup)
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
    hint = db.query(ChallengeHint).filter(ChallengeHint.id == hint_id, ChallengeHint.challenge_id == challenge_id).first()
    if not challenge or not hint:
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

    # Flag verification (exact or trimmed)
    correct = submitted_flag == challenge.flag.strip()
    points_awarded = challenge.points if correct else 0

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

    if correct:
        redis_delete(f"leaderboard:users:{current_user.id}", "leaderboard:colleges")
        if scoring_team:
            scoring_team.points += challenge.points
            scoring_team.challenges_solved += 1
            db.add(Notification(user_id=current_user.id, title="Squad flag captured", message=f"{scoring_team.name} solved {challenge.title} and earned {challenge.points} points.", kind="solve"))
            for member in scoring_team.members:
                if member.user_id != current_user.id:
                    db.add(Notification(user_id=member.user_id, title="Squad flag captured", message=f"{scoring_team.name} solved {challenge.title} through {current_user.name}.", kind="solve"))
        else:
            current_user.points += challenge.points
            current_user.challenges_solved += 1
            check_and_award_badges(current_user, db)
            db.add(Notification(user_id=current_user.id, title="Flag captured", message=f"You solved {challenge.title} and earned {challenge.points} points.", kind="solve"))
        challenge.solves_count += 1

    db.commit()

    return {
        "success": True,
        "correct": correct,
        "already_solved": False,
        "points_awarded": points_awarded,
        "total_points": scoring_team.points if scoring_team else current_user.points,
        "team_id": scoring_team.id if scoring_team else None,
        "message": "🎉 Correct flag! Challenge solved." if correct else "❌ Incorrect flag. Keep digging!"
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

    # Access allowed if admin OR solved
    is_solved = db.query(Submission).filter(
        Submission.user_id == current_user.id,
        Submission.challenge_id == challenge_id,
        Submission.is_correct == True
    ).first() is not None

    if not is_solved and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Writeup is locked! You must solve this challenge first.")

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
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(User).filter(User.role == "user", User.is_active == True)

    if not college and not category and not search:
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
    if not college and not category and not search:
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

    existing = db.query(EventRegistration).filter(
        EventRegistration.event_id == event_id,
        EventRegistration.user_id == current_user.id
    ).first()
    if existing:
        return {"success": True, "message": "You are already registered for this event!", "registration_type": "team" if existing.team_id else "individual", "team_id": existing.team_id}

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
            raise HTTPException(status_code=403, detail="Only the squad owner can register the squad for this tournament")
        team_reg = db.query(EventRegistration).filter(EventRegistration.event_id == event_id, EventRegistration.team_id == team.id).first()
        if team_reg:
            raise HTTPException(status_code=400, detail="This squad is already registered for the tournament")
    else:
        if mode == "team":
            raise HTTPException(status_code=400, detail="Select a squad to register for this team tournament")

    reg = EventRegistration(event_id=event_id, user_id=current_user.id, team_id=team.id if team else None, registered_at=datetime.utcnow())
    db.add(reg)

    if team:
        # Team registration is represented for every member, so every member can enter the arena.
        existing_member_regs = db.query(EventRegistration).filter(EventRegistration.event_id == event_id, EventRegistration.team_id == team.id).all()
        registered_user_ids = {r.user_id for r in existing_member_regs}
        for member in team.members:
            if member.user_id not in registered_user_ids and member.user_id != current_user.id:
                db.add(EventRegistration(event_id=event_id, user_id=member.user_id, team_id=team.id, registered_at=datetime.utcnow()))
                db.add(Notification(user_id=member.user_id, title="Squad joined a tournament", message=f"{team.name} registered for {event.name}.", kind="event"))
        for member in team.members:
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

    return {
        "success": True,
        "event": {"id": event.id, "name": event.name, "description": event.description, "start_date": event.start_date, "end_date": event.end_date, "is_scoreboard_frozen": event.is_scoreboard_frozen, "participation_mode": event.participation_mode or "individual"},
        "registered": bool(registration), "registration_type": registration_type,
        "team": {"id": team.id, "name": team.name, "slug": team.slug, "points": team.points, "challenges_solved": team.challenges_solved, "member_count": len(team.members)} if team else None,
        "score": int(score or 0), "solved": len(solved), "total_challenges": len(challenges),
        "challenges": [{"id": c.id, "title": c.title, "description": c.description, "category": c.category, "difficulty": c.difficulty, "points": c.points, "file_url": (f"{PUBLIC_API_URL}/challenges/{c.id}/file" if c.file_path else c.file_url), "connection_info": c.connection_info, "runtime_enabled": bool(c.runtime_image and c.runtime_port), "runtime_protocol": c.runtime_protocol, "has_hint": bool(c.hint), "hint_cost": c.hint_cost, "is_solved": c.id in solved} for c in challenges]
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


def build_certificate_pdf(cert: Certificate, event: Event):
    path = CERT_ROOT / f"{cert.certificate_id}.pdf"
    c = canvas.Canvas(str(path), pagesize=landscape(A4))
    width, height = landscape(A4)
    c.setLineWidth(3); c.rect(12*mm, 12*mm, width-24*mm, height-24*mm)
    c.setLineWidth(1); c.rect(18*mm, 18*mm, width-36*mm, height-36*mm)
    c.setFont("Helvetica-Bold", 25); c.drawCentredString(width/2, height-42*mm, "COLLEGE OWASP STUDENT CHAPTER")
    c.setFont("Helvetica", 13); c.drawCentredString(width/2, height-52*mm, "Certificate of CTF Participation & Achievement")
    c.setFont("Helvetica", 11); c.drawCentredString(width/2, height-72*mm, "This certificate is proudly presented to")
    c.setFont("Helvetica-Bold", 30); c.drawCentredString(width/2, height-92*mm, cert.participant_name)
    if cert.college:
        c.setFont("Helvetica", 13); c.drawCentredString(width/2, height-103*mm, cert.college)
    text = f"for participating in {event.name} and capturing {cert.solves} flag(s) for {cert.score} points."
    c.setFont("Helvetica", 13); c.drawCentredString(width/2, height-122*mm, text)
    label = cert.certificate_type.title()
    c.setFont("Helvetica-Bold", 16); c.drawCentredString(width/2, height-139*mm, label)
    c.setFont("Helvetica", 10); c.drawString(25*mm, 25*mm, f"Certificate ID: {cert.certificate_id}")
    c.drawRightString(width-25*mm, 25*mm, cert.issued_at.strftime("%B %d, %Y"))
    c.setFont("Helvetica-Bold", 11); c.drawString(width-75*mm, 42*mm, "OWASP Lead & Faculty Coordinator")
    try:
        from reportlab.graphics.barcode import qr
        from reportlab.graphics.shapes import Drawing
        qr_code = qr.QrCode(f"{PUBLIC_API_URL}/verify/certificate/{cert.certificate_id}/page")
        qr_code.barWidth = qr_code.barHeight = 22*mm
        drawing = Drawing(22*mm, 22*mm); drawing.add(qr_code); drawing.drawOn(c, width-48*mm, 55*mm)
        c.setFont("Helvetica", 7); c.drawCentredString(width-37*mm, 52*mm, "Scan to verify")
    except Exception:
        pass
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
        db.add(cert); db.flush(); pdf = build_certificate_pdf(cert, event); cert.pdf_path = storage.put_file(f"certificates/{cert.certificate_id}.pdf", pdf, "application/pdf") if storage.enabled() else str(pdf.relative_to(CERT_ROOT))
        db.commit(); db.refresh(cert)
    elif not (CERT_ROOT / cert.pdf_path).exists():
        build_certificate_pdf(cert, event)
    return {"success": True, "certificate": {"certificate_id": cert.certificate_id, "event_name": event.name, "student_name": cert.participant_name, "college": cert.college, "score": cert.score, "solves": cert.solves, "rank": cert.rank, "certificate_type": cert.certificate_type, "issued_date": cert.issued_at.strftime("%B %d, %Y"), "signature": "OWASP Lead & Faculty Coordinator", "download_url": f"{PUBLIC_API_URL}/certificates/{cert.certificate_id}/download", "verification_url": f"{PUBLIC_API_URL}/verify/certificate/{cert.certificate_id}/page"}}


@app.get("/certificates/{certificate_id}/download")
def certificate_download(certificate_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cert = db.query(Certificate).filter(Certificate.certificate_id == certificate_id, Certificate.is_valid == True).first()
    if not cert: raise HTTPException(status_code=404, detail="Certificate not found")
    if current_user.id != cert.user_id and current_user.role not in ["admin", "moderator"]: raise HTTPException(status_code=403, detail="Not allowed")
    if cert.pdf_path.startswith("s3://"):
        url = storage.signed_url(cert.pdf_path)
        if not url:
            raise HTTPException(status_code=503, detail="Object storage is unavailable")
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=url, status_code=307)
    from fastapi.responses import FileResponse
    path = CERT_ROOT / cert.pdf_path
    if not path.exists():
        path = build_certificate_pdf(cert, cert.event)
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
        return HTMLResponse("<html><body><h1>Certificate not found</h1></body></html>", status_code=404)
    status = "VALID" if cert.is_valid else "REVOKED"
    return HTMLResponse(f"""<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>Certificate Verification</title><style>body{{font-family:Arial;background:#0b1220;color:#e5e7eb;padding:40px}}.card{{max-width:700px;margin:auto;background:#111827;border:1px solid #334155;border-radius:18px;padding:32px}}.ok{{color:#34d399}}.bad{{color:#f87171}}.id{{font-family:monospace;color:#67e8f9}}</style></head><body><div class='card'><h1>OWASP CTF Certificate Verification</h1><h2 class='{ 'ok' if cert.is_valid else 'bad' }'>{status}</h2><p><b>Participant:</b> {cert.participant_name}</p><p><b>College:</b> {cert.college or 'OWASP Student Member'}</p><p><b>Event:</b> {cert.event.name if cert.event else ''}</p><p><b>Score:</b> {cert.score} points</p><p><b>Flags:</b> {cert.solves}</p><p><b>Rank:</b> {cert.rank or '—'}</p><p><b>Issued:</b> {cert.issued_at.strftime('%B %d, %Y')}</p><p class='id'>{cert.certificate_id}</p></div></body></html>""")


@app.get("/admin/events/{event_id}/certificates")
def admin_list_certificates(event_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event: raise HTTPException(status_code=404, detail="Event not found")
    certs = db.query(Certificate).filter(Certificate.event_id == event_id).order_by(desc(Certificate.score), desc(Certificate.solves)).all()
    return {"success": True, "event": {"id": event.id, "name": event.name, "ended": datetime.utcnow() >= event.end_date}, "certificates": [{"certificate_id": c.certificate_id, "name": c.participant_name, "college": c.college, "score": c.score, "solves": c.solves, "rank": c.rank, "type": c.certificate_type, "is_valid": c.is_valid} for c in certs]}


@app.post("/admin/events/{event_id}/certificates/generate")
def admin_generate_certificates(event_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event: raise HTTPException(status_code=404, detail="Event not found")
    if datetime.utcnow() < event.end_date: raise HTTPException(status_code=400, detail="End the event before generating certificates")
    regs = db.query(EventRegistration).filter(EventRegistration.event_id == event_id).all()
    created = 0
    for reg in regs:
        if db.query(Certificate).filter(Certificate.event_id == event_id, Certificate.user_id == reg.user_id).first(): continue
        user = db.query(User).filter(User.id == reg.user_id).first()
        if not user: continue
        score, solves = event_user_stats(event_id, user.id, db)
        cert = Certificate(certificate_id=f"OWASP-CTF-{event.id}-{user.id}-{secrets.token_hex(4).upper()}", event_id=event.id, user_id=user.id, team_id=reg.team_id, participant_name=user.name, college=user.college or "OWASP Student Member", score=score, solves=solves, rank=event_user_rank(event_id, user.id, db), certificate_type="participation", pdf_path="")
        db.add(cert); db.flush(); pdf = build_certificate_pdf(cert, event); cert.pdf_path = storage.put_file(f"certificates/{cert.certificate_id}.pdf", pdf, "application/pdf") if storage.enabled() else str(pdf.relative_to(CERT_ROOT)); created += 1
    db.commit()
    return {"success": True, "created": created, "message": f"Generated {created} certificate(s)"}


@app.post("/admin/certificates/{certificate_id}/revoke")
def revoke_certificate(certificate_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    cert = db.query(Certificate).filter(Certificate.certificate_id == certificate_id).first()
    if not cert: raise HTTPException(status_code=404, detail="Certificate not found")
    cert.is_valid = False; db.commit()
    return {"success": True, "message": "Certificate revoked"}


@app.get("/teams/leaderboard")
def team_leaderboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    teams = db.query(Team).order_by(Team.points.desc(), Team.challenges_solved.desc(), Team.created_at.asc()).all()
    return {"success": True, "leaderboard": [
        {"rank": i, "team_id": t.id, "name": t.name, "slug": t.slug, "points": t.points,
         "challenges_solved": t.challenges_solved, "member_count": len(t.members),
         "members": [m.user.name for m in t.members]}
        for i, t in enumerate(teams, 1)
    ]}


# =========================================================
# TEAMS / SQUAD HUB
# =========================================================

@app.get("/teams")
def list_teams(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    teams = db.query(Team).order_by(Team.created_at.desc()).all()
    mine = db.query(TeamMember).filter(TeamMember.user_id == current_user.id).first()
    return {"success": True, "my_team_id": mine.team_id if mine else None, "teams": [
        {"id": t.id, "name": t.name, "slug": t.slug, "owner_id": t.owner_id,
         "owner_name": t.owner.name if t.owner else "Unknown", "member_count": len(t.members),
         "members": [{"id": m.user.id, "name": m.user.name, "college": m.user.college} for m in t.members]}
        for t in teams
    ]}


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


@app.post("/teams/join")
def join_team(data: TeamJoinRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if db.query(TeamMember).filter(TeamMember.user_id == current_user.id).first():
        raise HTTPException(status_code=400, detail="Leave your current squad before joining another")
    team = db.query(Team).filter(Team.slug == data.slug.strip().lower()).first()
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
    db.add(TeamMember(team_id=team.id, user_id=current_user.id))
    db.add(Notification(user_id=current_user.id, title="Joined squad", message=f"You joined {team.name}.", kind="team"))
    if team.owner_id != current_user.id:
        db.add(Notification(user_id=team.owner_id, title="New squad member", message=f"{current_user.name} joined {team.name}.", kind="team"))
    db.commit()
    return {"success": True, "message": f"Joined {team.name}"}


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
        "open_security_alerts": db.query(SecurityAlert).filter(SecurityAlert.status == "open").count(),
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
        "has_flag_secret": bool(c.flag_secret), "runtime_image": c.runtime_image, "runtime_port": c.runtime_port, "runtime_protocol": c.runtime_protocol, "instance_timeout_minutes": c.instance_timeout_minutes, "created_at": c.created_at.isoformat()
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
        instance_timeout_minutes=max(5, min(data.instance_timeout_minutes or 60, 240))
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
    ch = db.query(Challenge).filter(Challenge.id == challenge_id, Challenge.is_active == True, Challenge.status == "published").first()
    if not ch or not ch.file_path:
        raise HTTPException(status_code=404, detail="Challenge file not found")
    if ch.file_path.startswith("s3://"):
        url = storage.signed_url(ch.file_path)
        if not url:
            raise HTTPException(status_code=503, detail="Object storage is unavailable")
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=url, status_code=307)
    path = Path(ch.file_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Challenge file is missing")
    return FileResponse(path, filename=path.name, media_type="application/octet-stream")


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