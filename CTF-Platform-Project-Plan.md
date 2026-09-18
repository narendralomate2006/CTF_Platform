# 🛡️ College OWASP Club — CTF Platform

**A hybrid CTF hosting + learning platform (CTFd + LeetCode style) for college security clubs.**

---

## 1. Project Overview

A web platform for the college OWASP Cybersecurity Club that serves two purposes:

1. **Event Hosting** — Run live CTF competitions for the college (jeopardy-style), with scoreboards, team support, and admin controls.
2. **Learning Platform** — A permanent practice arena (like picoCTF) where students solve categorized, difficulty-tagged challenges year-round, build a public profile, and climb leaderboards.

Target users:
- **Students** — practice challenges, join events, track progress, compete on leaderboards
- **Admins (OWASP club team)** — create/manage challenges, host events, manage users, view analytics

Budget: **$0** — must run entirely on free-tier infrastructure.

---

## 2. Core Feature List

### 2.1 Student-Facing Features

**Practice Mode**
- Challenges organized by category: Web Exploitation, Cryptography, Forensics, Reverse Engineering, Pwn/Binary Exploitation, OSINT, Steganography, Misc
- Difficulty tags: Easy / Medium / Hard / Insane
- Instant flag validation
- Hint system (points deducted per hint used)
- Writeups unlocked after solving or after event closes
- Downloadable challenge files / links to live challenge instances

**Profiles (LeetCode-style)**
- Total points, global rank, college rank
- Category-wise strength breakdown (radar/spider chart)
- Solved challenges history
- Streaks and activity heatmap (GitHub-style contribution graph)
- Badges/achievements (e.g. "First Blood", "Pwn Master", "7-day streak")
- Public profile page (shareable, like LeetCode)

**Leaderboards**
- Global leaderboard
- College-level leaderboard
- Per-event leaderboard
- Filters: category, time range, individual vs team

**Events**
- Upcoming events calendar with countdown
- Solo or team registration
- Live scoreboard during the event
- Scoreboard freeze near the end (standard CTF practice — adds suspense, prevents last-minute sniping)
- Certificates/badges for winners post-event

**Community**
- Comment/discussion section per challenge (unlocked only after solving, to avoid spoilers)
- Notifications: new challenge drop, event starting soon, someone overtook you on leaderboard

### 2.2 Admin Panel Features (OWASP Club Team)

- **Challenge Management**: create/edit/delete challenges, upload files, set flags (static or per-team dynamic flags to prevent flag-sharing), set points (static or decaying based on solve count), set category + difficulty, add hints
- **Event Management**: create events, set start/end time, choose included challenges, freeze/unfreeze scoreboard, export results, generate certificates
- **User Management**: roles (student/moderator/admin), ban/mute, view submission logs
- **Analytics Dashboard**: solve rate per challenge (tune difficulty), most active users, category-wise engagement, submission attempt logs
- **Anti-Cheat**: rate-limited flag submission, duplicate/shared-flag detection across accounts, IP/session anomaly flags

### 2.3 Platform-Wide
- Dark/light theme
- Fully mobile-responsive
- College email / Google OAuth login

---

## 3. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React / Next.js | Component-based, great for dashboards & profiles |
| Backend | Node.js (Express/NestJS) or Python (Django/FastAPI) | FastAPI/Django pairs naturally with security tooling if team knows Python |
| Database | PostgreSQL | Relational data: users, challenges, submissions, teams, events |
| Cache / Leaderboard | Redis (sorted sets) | Real-time leaderboard ranking |
| Auth | JWT + OAuth (Google/college email) | Standard, low-maintenance |
| Containerization | Docker + Docker Compose | Isolate live challenge instances |
| File Storage | S3-compatible (Cloudflare R2 / Supabase Storage) | Challenge files, profile pictures |

---

## 4. Free Hosting Strategy ($0 Budget)

### 4.1 Web App (always-on, lightweight)

| Component | Free Service |
|---|---|
| Frontend | **Vercel** or **Netlify** |
| Backend API | **Render** (free tier) / **Fly.io** (free allowance) |
| Database | **Supabase** (Postgres, ~500MB free) or **Neon** (serverless Postgres) |
| Redis | **Upstash Redis** (free quota) |
| File Storage | **Cloudflare R2** (10GB free, no egress fee) or Supabase Storage |
| Domain | GitHub Student Developer Pack (free/discounted domains) or college subdomain |

### 4.2 Live/Dynamic Challenges (heavier compute)

Key insight: **most challenge categories don't need live containers.**

- Crypto, forensics, OSINT, misc, and much of rev/web can be **static**: downloadable file/binary + flag submission. No hosting cost.
- For challenges that truly need a live backend (e.g. vulnerable web app for SQLi practice):
  - Deploy as a small **shared instance** per challenge on Render/Fly.io free tier (club-scale traffic doesn't need per-team isolation in most cases — use unique flags per team instead to prevent sharing).
  - **Oracle Cloud Free Tier** is the standout option for anything needing persistent Docker hosting — genuinely free forever (up to 4 ARM CPUs / 24GB RAM). Best choice for hosting a batch of live challenge containers.
  - For live event days only: use **Cloudflare Tunnel** to expose a member's PC/Raspberry Pi or a lab machine borrowed from college, without exposing a home IP.
  - Avoid AWS/GCP free tiers for anything long-term — they're 12-months-only and carry billing risk if forgotten.

### 4.3 Recommended Combo

```
Frontend  → Vercel
Backend   → Render / Fly.io
Database  → Supabase (Postgres)
Redis     → Upstash
Storage   → Cloudflare R2
Live challenges → Oracle Cloud Free Tier VM (Docker)
Domain    → GitHub Student Developer Pack perk
```

---

## 5. Security Considerations

Ironically, a CTF platform is one of the highest-value targets for its own users to attack — treat it as seriously as any production app:

- Sandbox/isolate all live challenge containers from the host and from each other
- Rate-limit and consider CAPTCHA on flag submission endpoints (prevent brute-force)
- Store flags **hashed**, never in plaintext in DB or client-side code
- Strict input validation everywhere (assume SQLi/XSS attempts against the platform itself)
- Separate network segment for challenge containers vs. the main app
- Unique per-team flags for shared-challenge instances to detect/prevent flag sharing

---

## 6. Suggested Build Order (Phases)

**Phase 1 — MVP**
- Auth (email/OAuth)
- Challenge CRUD + categories + difficulty tags
- Flag submission + validation
- Basic global leaderboard

**Phase 2 — Admin & Events**
- Full admin panel
- Event creation, registration, live scoreboard
- Scoreboard freeze/unfreeze

**Phase 3 — Profiles & Engagement**
- Public profiles, badges, streaks, activity heatmap
- Hints system with point deduction
- Discussion section (post-solve unlock)

**Phase 4 — Live Challenges**
- Docker-based live challenge deployment (Oracle Cloud)
- Team support, per-team dynamic flags

**Phase 5 — Polish**
- Notifications
- Analytics dashboard for admins
- Mobile responsiveness pass
- Certificates/export for event winners

---

## 7. Rough Database Schema (High-Level)

- **users** — id, name, email, password_hash/oauth_id, role (student/mod/admin), college, avatar, created_at
- **teams** — id, name, members (FK to users), points
- **challenges** — id, title, description, category, difficulty, points, flag_hash, files, hints, is_live_instance (bool), docker_image (if live)
- **submissions** — id, user_id/team_id, challenge_id, submitted_flag, is_correct, timestamp
- **events** — id, name, start_time, end_time, description, is_scoreboard_frozen
- **event_challenges** — event_id, challenge_id (many-to-many)
- **badges** — id, name, description, criteria
- **user_badges** — user_id, badge_id, earned_at

---

## 8. Alternative: Extend CTFd Instead of Building From Scratch

**CTFd** (open-source, Python/Flask) already provides challenge hosting, categories, dynamic scoring, team support, and an admin panel — all free and self-hostable on the same free infra above (Oracle Cloud Free Tier VM via Docker).

- **Use CTFd if:** the goal is to get a working platform quickly and focus club effort on writing good challenges and running events.
- **Build custom if:** the build itself is meant to be a learning project for the club, and you want deep customization (LeetCode-style profiles, streaks, badges, always-on practice mode) beyond what CTFd's plugin system comfortably supports.

A hybrid approach also works: self-host CTFd for **event hosting**, and build a lightweight custom **practice/profile platform** alongside it that talks to CTFd's API.

---

## 9. Next Steps

1. Decide: build from scratch vs. extend CTFd vs. hybrid
2. Pick backend language based on team's strongest skill (Node vs Python)
3. Set up free-tier accounts: Vercel, Render/Fly.io, Supabase, Upstash, Oracle Cloud
4. Activate GitHub Student Developer Pack for all core team members
5. Start with Phase 1 MVP — auth, challenges, submissions, leaderboard
6. Recruit challenge authors early (writing good challenges takes longer than building the platform)
