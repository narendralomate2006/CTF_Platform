# OWASP CTF Academy — Enhanced Working Edition

A local college CTF platform with practice challenges, tournament-specific arenas, flag submission, hints, writeups, leaderboards, profiles, squads, notifications, and an admin control center.

## Run on Windows PowerShell

### Backend
```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Remove-Item .\ctf_platform.db -ErrorAction SilentlyContinue
python seed.py
python -m uvicorn main:app --reload
```
Open http://127.0.0.1:8000/docs to verify the API.

### Frontend
In a second terminal:
```powershell
cd frontend
npm install
npm run dev
```
Open the Vite URL (usually http://localhost:5173). Ports 5173–5179 are allowed by the API.

## Demo accounts
- Admin: `admin@ctf.com` / `admin123`
- Student: `user@ctf.com` / `user123`
- Hacker: `ninja@pccoe.edu` / `user123`

## Implemented in this edition
- Authentication with JWT and Argon2 password hashing
- Practice arena with categories/difficulties, hints, writeups and discussions
- Tournament registration and **registered-user-only tournament arena**
- Tournament challenge submission windows
- Tournament progress and score
- Event leaderboard and certificate preview
- Squad creation/join/leave (max 5 members)
- Notification center with unread count and read controls
- Profile, badges, global and college leaderboards
- Admin challenge/event/user/analytics controls
- CORS for common local Vite ports
- Fresh-database seed script and demo data

## Remaining production work
These require real infrastructure and should not be faked in a local demo:
1. Per-user/per-team dynamic flags and flag hashing/HMAC storage
2. Real file upload storage (S3/R2/Supabase Storage) with signed downloads and scanning
3. Docker/Firecracker-style isolated live challenge instances for Web/Pwn
4. PostgreSQL + Redis for production scale, queues, and distributed rate limiting
5. Google/college OAuth and email verification
6. Persistent certificate records + PDF generation/email delivery
7. Advanced anti-cheat signals and moderator review workflow
8. CI/CD, HTTPS, secret management, backups, monitoring and production deployment
9. Team tournament scoring/locking rules beyond the current squad membership system

The local version intentionally uses SQLite and static demo challenge artifacts so it can run without paid/cloud services.

## Advanced Challenge Builder (v2.1)

Admin/Moderator challenge management now supports:
- Draft / Published / Archived lifecycle
- Static, per-student, and per-squad flag modes
- Optional dynamic flag secret generation
- Multiple ordered hints, each with its own point cost
- Local challenge file upload (up to 25 MB) with a curated extension allow-list
- Event assignment and connection information
- Publish/archive controls from the Challenge Manager

For an existing SQLite database, the backend performs lightweight schema upgrades on startup. For a clean local setup, deleting `backend/ctf_platform.db` and running `python seed.py` is still recommended.

Uploaded challenge files are intended for local development. Production deployment should move them to private object storage with signed URLs and malware scanning.

## Certificate Center

The platform now supports persistent event certificates. After an event ends, an admin can open **Admin Command Center → Certificates**, select the event, and generate PDF certificates for registered participants. Each certificate has a unique ID, score/solve statistics, rank, a QR verification link, and a revocation state.

Students can open **Tournaments & Events → Get Certificate** after an event ends and download the generated PDF. The authenticated download endpoint protects certificate files. Public verification is available from the QR link without requiring a login.

For a fresh local setup, `reportlab` is included in `backend/requirements.txt`.

## Anti-Cheat & Competition Monitoring

The platform now includes a server-side anti-cheat layer for submission behavior:
- 2-second minimum submission interval per user
- temporary cooldown after excessive failed submissions
- automated risk scoring for rapid bursts, repeated failures, and many challenges in a short window
- security alerts stored for admin/moderator review
- Anti-Cheat Monitor in the Admin Command Center
- open/reviewed/all alert filters
- human review workflow; alerts do not automatically ban users
- limited request IP/user-agent metadata stored with submissions for competition investigation

This is a behavioral monitoring layer, not a complete anti-cheat guarantee. It should be combined with isolated challenge infrastructure, stronger authentication, audit logging, and competition rules for production events.

## Live Challenge Infrastructure

Challenges can optionally run isolated Docker instances. In the Admin Challenge Builder configure a Docker image, container port, protocol, and maximum lifetime. Students then see **Start Instance** in the Tournament Arena. Each user gets a separate container with CPU/memory/PID limits, dropped Linux capabilities, `no-new-privileges`, a read-only root filesystem with a small temporary filesystem, and an internal Docker network. The published endpoint is bound to `127.0.0.1` for local development.

Build the included test images from the repository root:

```powershell
docker build -t owasp/web-basic:local .\backend\live_challenges\web-basic
docker build -t owasp/tcp-basic:local .\backend\live_challenges\tcp-basic
```

**Production note:** this is a local development runtime manager, not a complete untrusted-code sandbox. For public competitions, use dedicated challenge hosts/VMs, stronger isolation (for example a VM/Firecracker-style boundary), resource monitoring, image signing/scanning, and network egress controls.

## PostgreSQL + Redis deployment

The backend now supports environment-based database configuration. SQLite remains the default for beginner/local use; PostgreSQL is recommended for deployment. Redis is used for distributed submission rate limiting and short-lived leaderboard caching, with a graceful fallback if Redis is unavailable.

### Option A — Docker Compose (recommended)

1. Install Docker Desktop and start it.
2. From the project root:

```powershell
$env:SECRET_KEY="replace-this-with-a-long-random-secret"
docker compose up --build -d
```

3. Check the API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

4. Open the API docs at `http://127.0.0.1:8000/docs`.

The Compose stack provides PostgreSQL, Redis, and the FastAPI backend. Persistent Docker volumes keep the PostgreSQL database, Redis data, challenge uploads, and certificates across container restarts.

To stop it:

```powershell
docker compose down
```

To stop and remove database/cache volumes too:

```powershell
docker compose down -v
```

### Option B — Windows development with PostgreSQL/Redis running locally

Copy `backend/.env.example` to `backend/.env` and set:

```text
DATABASE_URL=postgresql+psycopg://ctf:ctf_password@localhost:5432/ctf_platform
REDIS_URL=redis://localhost:6379/0
REDIS_ENABLED=true
SECRET_KEY=your-long-random-secret
```

Then install dependencies and run:

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### SQLite fallback

For the simplest setup, do not set `DATABASE_URL` or `REDIS_URL`. The application uses local SQLite and can run without Redis. The lightweight legacy schema upgrade code is only applied to SQLite.

### Frontend API URL

The frontend now supports `VITE_API_URL`. For example:

```text
VITE_API_URL=http://127.0.0.1:8000
```

This allows the same frontend build to point to a deployed backend without changing source code.

### Production notes

Before a public deployment, change all example credentials/secrets, use HTTPS, use a managed PostgreSQL/Redis service or private network, configure restricted CORS origins, add backups and monitoring, and keep live challenge containers on a separate hardened worker host/network.

## Production authentication

The authentication layer now supports:

- Argon2 password hashing
- configurable email verification
- verification links with expiring signed tokens
- resend verification without exposing account existence
- password reset links with 30-minute expiry
- optional Google OpenID Connect sign-in
- one-time Redis-backed OAuth code exchange (the access token is not placed in the browser URL)
- account provider information in `/auth/me`

### SMTP configuration

Copy `.env.example` to `.env` and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM`. For Gmail, use an App Password rather than your normal Google password.

For local testing without email delivery, set `DEV_AUTH_LINKS=true`. The API then returns a development-only verification/reset link in the response. Do not enable this in production.

### Google OAuth configuration

Create a Google OAuth Web Application and configure this exact redirect URI for local development:

`http://127.0.0.1:8000/auth/google/callback`

Then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `.env`. Google sign-in also requires Redis because the authorization result is exchanged through a short-lived, one-time server-side code.

### Existing seeded users

The seed users are marked as email-verified so the demo accounts continue to work when `REQUIRE_EMAIL_VERIFICATION=true`.


## Private object storage

Challenge files and generated certificate PDFs can use AWS S3 or any S3-compatible provider such as Cloudflare R2. Files are private; students receive short-lived signed URLs only after an authenticated API request. Local filesystem storage remains the fallback when `OBJECT_STORAGE_ENABLED=false`.

Set these variables for S3/R2:

```env
OBJECT_STORAGE_ENABLED=true
OBJECT_STORAGE_BUCKET=your-bucket
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
OBJECT_STORAGE_ACCESS_KEY=...
OBJECT_STORAGE_SECRET_KEY=...
OBJECT_STORAGE_SIGNED_URL_TTL=600
PUBLIC_API_URL=https://api.example.com
```

For AWS S3, leave `OBJECT_STORAGE_ENDPOINT` empty and use your bucket region. Do not commit credentials. The `/health` endpoint reports object-storage configuration/reachability without exposing secrets.

## Production operations

The project now includes CI workflows, Docker health/readiness probes, JSON request logging, request IDs, security headers, an admin Production Monitor, and PostgreSQL backup helpers.

For a production deployment:

```powershell
docker compose up --build -d
Invoke-RestMethod http://127.0.0.1:8000/ready
```

The frontend is served on port `5173` by the production nginx container. Set `VITE_API_URL` to the public HTTPS API URL before building the frontend.

Set `ENVIRONMENT=production`, a strong `SECRET_KEY`, and a separate `METRICS_TOKEN`. Keep `/internal/metrics` behind a trusted monitoring network. Do not expose PostgreSQL or Redis directly to the public internet.

Live Docker challenge execution is disabled by default in the application container. Keep it disabled unless you deploy a dedicated isolated challenge-runtime worker/pool.
