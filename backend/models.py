from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Boolean,
    ForeignKey
)
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="user")  # 'user', 'moderator', 'admin'
    profile_photo = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    college = Column(String(150), nullable=True, index=True)
    github = Column(String(150), nullable=True)
    points = Column(Integer, default=0, nullable=False)
    challenges_solved = Column(Integer, default=0, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False, index=True)
    google_sub = Column(String(255), unique=True, nullable=True, index=True)
    verification_sent_at = Column(DateTime, nullable=True)
    email_verified = Column(Boolean, default=False, nullable=False, index=True)
    google_sub = Column(String(255), unique=True, nullable=True, index=True)
    verification_sent_at = Column(DateTime, nullable=True)

    # Relationships
    submissions = relationship("Submission", back_populates="user", cascade="all, delete-orphan")
    hint_unlocks = relationship("HintUnlock", back_populates="user", cascade="all, delete-orphan")
    comments = relationship("ChallengeComment", back_populates="user", cascade="all, delete-orphan")
    user_badges = relationship("UserBadge", back_populates="user", cascade="all, delete-orphan")
    event_registrations = relationship("EventRegistration", back_populates="user", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    is_scoreboard_frozen = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False, index=True)
    google_sub = Column(String(255), unique=True, nullable=True, index=True)
    verification_sent_at = Column(DateTime, nullable=True)
    email_verified = Column(Boolean, default=False, nullable=False, index=True)
    google_sub = Column(String(255), unique=True, nullable=True, index=True)
    verification_sent_at = Column(DateTime, nullable=True)
    participation_mode = Column(String(20), default="individual", nullable=False)  # individual, team, both

    # Relationships
    challenges = relationship("Challenge", back_populates="event")
    registrations = relationship("EventRegistration", back_populates="event", cascade="all, delete-orphan")


class EventRegistration(Base):
    __tablename__ = "event_registrations"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    registered_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)

    event = relationship("Event", back_populates="registrations")
    user = relationship("User", back_populates="event_registrations")
    team = relationship("Team", back_populates="event_registrations")


class Challenge(Base):
    __tablename__ = "challenges"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), nullable=False, index=True)
    # Categories: Web Exploitation, Cryptography, Forensics, Reverse Engineering, Pwn/Binary Exploitation, OSINT, Steganography, Misc
    difficulty = Column(String(30), nullable=False, index=True)
    # Difficulties: Easy, Medium, Hard, Insane
    points = Column(Integer, nullable=False, default=100)
    flag = Column(String(255), nullable=False)
    hint = Column(Text, nullable=True)
    hint_cost = Column(Integer, default=15, nullable=False)  # Points deducted when hint unlocked
    writeup = Column(Text, nullable=True)  # Unlocked after solving or event close
    file_url = Column(String(500), nullable=True)  # Downloadable challenge file
    connection_info = Column(String(255), nullable=True)  # e.g. "nc ctf.owasp.club 1337" or URL
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    solves_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False, index=True)
    google_sub = Column(String(255), unique=True, nullable=True, index=True)
    verification_sent_at = Column(DateTime, nullable=True)
    email_verified = Column(Boolean, default=False, nullable=False, index=True)
    google_sub = Column(String(255), unique=True, nullable=True, index=True)
    verification_sent_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="published", nullable=False)  # draft, published, archived
    flag_mode = Column(String(20), default="static", nullable=False)  # static, user, team
    flag_secret = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)

    # Relationships
    event = relationship("Event", back_populates="challenges")
    submissions = relationship("Submission", back_populates="challenge", cascade="all, delete-orphan")
    hint_unlocks = relationship("HintUnlock", back_populates="challenge", cascade="all, delete-orphan")
    comments = relationship("ChallengeComment", back_populates="challenge", cascade="all, delete-orphan")


class ChallengeHint(Base):
    __tablename__ = "challenge_hints"

    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=False)
    title = Column(String(100), nullable=False, default="Hint")
    content = Column(Text, nullable=False)
    cost = Column(Integer, default=15, nullable=False)
    order_index = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    challenge = relationship("Challenge", backref="advanced_hints")


class HintUnlock(Base):
    __tablename__ = "hint_unlocks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=False)
    hint_id = Column(Integer, ForeignKey("challenge_hints.id"), nullable=True)
    cost_deducted = Column(Integer, default=0, nullable=False)
    unlocked_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="hint_unlocks")
    challenge = relationship("Challenge", back_populates="hint_unlocks")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=False)
    submitted_flag = Column(String(255), nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)
    points_awarded = Column(Integer, default=0, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    request_ip = Column(String(80), nullable=True)
    user_agent = Column(String(500), nullable=True)
    risk_score = Column(Integer, default=0, nullable=False)
    risk_reasons = Column(Text, nullable=True)

    user = relationship("User", back_populates="submissions")
    challenge = relationship("Challenge", back_populates="submissions")
    team = relationship("Team")


class ChallengeComment(Base):
    __tablename__ = "challenge_comments"

    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="comments")
    challenge = relationship("Challenge", back_populates="comments")


class Badge(Base):
    __tablename__ = "badges"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    slug = Column(String(50), nullable=False, unique=True)
    description = Column(String(255), nullable=False)
    icon = Column(String(50), nullable=False, default="FaTrophy")
    category = Column(String(50), nullable=True)
    criteria_desc = Column(String(255), nullable=False)

    user_badges = relationship("UserBadge", back_populates="badge", cascade="all, delete-orphan")


class UserBadge(Base):
    __tablename__ = "user_badges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    badge_id = Column(Integer, ForeignKey("badges.id"), nullable=False)
    earned_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="user_badges")
    badge = relationship("Badge", back_populates="user_badges")
class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    points = Column(Integer, default=0, nullable=False)
    challenges_solved = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", foreign_keys=[owner_id])
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    event_registrations = relationship("EventRegistration", back_populates="team", cascade="all, delete-orphan")


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    team = relationship("Team", back_populates="members")
    user = relationship("User")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    kind = Column(String(40), nullable=False, default="system")
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")


class Certificate(Base):
    __tablename__ = "certificates"

    id = Column(Integer, primary_key=True, index=True)
    certificate_id = Column(String(80), unique=True, nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True, index=True)
    participant_name = Column(String(150), nullable=False)
    college = Column(String(150), nullable=True)
    score = Column(Integer, default=0, nullable=False)
    solves = Column(Integer, default=0, nullable=False)
    rank = Column(Integer, nullable=True)
    certificate_type = Column(String(30), default="participation", nullable=False)
    issued_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    pdf_path = Column(String(500), nullable=False)
    is_valid = Column(Boolean, default=True, nullable=False)

    event = relationship("Event")
    user = relationship("User")
    team = relationship("Team")


class SecurityAlert(Base):
    __tablename__ = "security_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True, index=True)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=True, index=True)
    severity = Column(String(20), nullable=False, default="medium")
    alert_type = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    metadata_json = Column(Text, nullable=True)
    is_reviewed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
    team = relationship("Team")
    challenge = relationship("Challenge")


class ChallengeInstance(Base):
    __tablename__ = "challenge_instances"

    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    container_id = Column(String(100), nullable=True, index=True)
    container_name = Column(String(120), nullable=False, unique=True)
    host_port = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="starting")
    started_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    stopped_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)

    challenge = relationship("Challenge")
    user = relationship("User")
    team = relationship("Team")
