# Google OAuth local setup

1. Copy `.env.example` to `.env`.
2. Set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/auth/google/callback`
   - `FRONTEND_URL=http://127.0.0.1:5173`
3. In Google Cloud, add exactly the same redirect URI to the Web OAuth client.
4. Build and start:
   `docker compose down`
   `docker compose build --no-cache backend`
   `docker compose up -d`
5. Check:
   `docker compose ps`
   `Invoke-RestMethod http://127.0.0.1:8000/health`
   `Invoke-RestMethod http://127.0.0.1:8000/auth/google/status`
6. Test:
   `http://127.0.0.1:8000/auth/google`

Do not commit `.env` or expose the Google client secret.
