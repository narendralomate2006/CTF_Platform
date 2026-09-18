from pathlib import Path
p=Path('/tmp/ctfnext/backend/models.py')
s=p.read_text()
s=s.replace('    is_active = Column(Boolean, default=True, nullable=False)\n', '    is_active = Column(Boolean, default=True, nullable=False)\n    email_verified = Column(Boolean, default=False, nullable=False, index=True)\n    google_sub = Column(String(255), unique=True, nullable=True, index=True)\n    verification_sent_at = Column(DateTime, nullable=True)\n')
p.write_text(s)

p=Path('/tmp/ctfnext/backend/main.py')
s=p.read_text()
s=s.replace('import re\nfrom pathlib import Path\n', 'import re\nimport smtplib\nfrom email.message import EmailMessage\nfrom urllib.parse import urlencode\nfrom pathlib import Path\n')
s=s.replace('from reportlab.lib.units import mm\n', 'from reportlab.lib.units import mm\n\ntry:\n    from authlib.integrations.starlette_client import OAuth\nexcept ImportError:\n    OAuth = None\n')
# Insert config after security imports/config block before password hash
needle='SECRET_KEY = os.getenv("SECRET_KEY", "OWASP_CTF_DEV_ONLY_CHANGE_ME")\n'
insert='''SECRET_KEY = os.getenv("SECRET_KEY", "OWASP_CTF_DEV_ONLY_CHANGE_ME")\nFRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173").rstrip("/")\nREQUIRE_EMAIL_VERIFICATION = os.getenv("REQUIRE_EMAIL_VERIFICATION", "true").lower() not in {"0", "false", "no"}\nDEV_AUTH_LINKS = os.getenv("DEV_AUTH_LINKS", "false").lower() in {"1", "true", "yes"}\nSMTP_HOST = os.getenv("SMTP_HOST", "")\nSMTP_PORT = int(os.getenv("SMTP_PORT", "587"))\nSMTP_USERNAME = os.getenv("SMTP_USERNAME", "")\nSMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")\nSMTP_FROM = os.getenv("SMTP_FROM", SMTP_USERNAME or "no-reply@owasp-ctf.local")\nSMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() not in {"0", "false", "no"}\nGOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")\nGOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")\nGOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/auth/google/callback")\n'''
s=s.replace(needle,insert)
# Insert migration fields after events migration block
needle='''    if "events" in tables:\n        cols = {c["name"] for c in inspector.get_columns("events")}\n        if "participation_mode" not in cols:\n            with engine.begin() as conn:\n                conn.execute(text("ALTER TABLE events ADD COLUMN participation_mode VARCHAR(20) NOT NULL DEFAULT 'individual'"))\n\nupgrade_sqlite_schema()\n'''
replacement='''    if "events" in tables:\n        cols = {c["name"] for c in inspector.get_columns("events")}\n        if "participation_mode" not in cols:\n            with engine.begin() as conn:\n                conn.execute(text("ALTER TABLE events ADD COLUMN participation_mode VARCHAR(20) NOT NULL DEFAULT 'individual'"))\n    if "users" in tables:\n        cols = {c["name"] for c in inspector.get_columns("users")}\n        with engine.begin() as conn:\n            if "email_verified" not in cols:\n                conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE"))\n            if "google_sub" not in cols:\n                conn.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR(255)"))\n            if "verification_sent_at" not in cols:\n                conn.execute(text("ALTER TABLE users ADD COLUMN verification_sent_at TIMESTAMP"))\n\nupgrade_sqlite_schema()\n\ndef upgrade_auth_schema():\n    """Small additive migration for PostgreSQL deployments too."""\n    from sqlalchemy import inspect, text\n    inspector = inspect(engine)\n    if "users" not in inspector.get_table_names():\n        return\n    cols = {c["name"] for c in inspector.get_columns("users")}\n    if str(engine.url).startswith("sqlite"):\n        return\n    statements = []\n    if "email_verified" not in cols:\n        statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE")\n    if "google_sub" not in cols:\n        statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)")\n    if "verification_sent_at" not in cols:\n        statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMP")\n    if statements:\n        with engine.begin() as conn:\n            for statement in statements:\n                conn.execute(text(statement))\n\nupgrade_auth_schema()\n'''
s=s.replace(needle,replacement)
# add auth helper functions before schemas
needle='# =========================================================\n# SCHEMAS\n# =========================================================\n'
helpers=r'''# =========================================================
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

'''
s=s.replace(needle,helpers+needle)
# Extend RegisterRequest password validation handled later; add reset schemas
needle='class LoginRequest(BaseModel):\n    email: EmailStr\n    password: str\n\n'
rep=needle+'''\nclass VerifyEmailRequest(BaseModel):\n    token: str\n\n\nclass ResendVerificationRequest(BaseModel):\n    email: EmailStr\n\n\nclass PasswordResetRequest(BaseModel):\n    email: EmailStr\n\n\nclass PasswordResetConfirmRequest(BaseModel):\n    token: str\n    new_password: str\n\n'''
s=s.replace(needle,rep)
# replace register/login exact block up to auth/me
start=s.index('@app.post("/auth/register")')
end=s.index('@app.get("/auth/me")')
new=r'''@app.post("/auth/register")
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


'''
s=s[:start]+new+s[end:]
# include email_verified in me
s=s.replace('        "unlocked_hint_ids": unlocked_hint_ids\n', '        "unlocked_hint_ids": unlocked_hint_ids,\n        "email_verified": bool(current_user.email_verified),\n        "auth_provider": "google" if current_user.google_sub else "password"\n')
p.write_text(s)
