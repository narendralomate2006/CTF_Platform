from app.database.database import SessionLocal
from app.models.user import User


def create_test_users():

    db = SessionLocal()

    try:

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

    finally:
        db.close()