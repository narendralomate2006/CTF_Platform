# Live challenge images

These are intentionally minimal runtime examples for local testing. Build them with Docker and configure the resulting image name in the Admin Challenge Builder.

Example:

    docker build -t owasp/web-basic:local backend/live_challenges/web-basic

Then create a challenge with:
- Docker Image: `owasp/web-basic:local`
- Container Port: `8080`
- Protocol: `http`
- Instance Time: `60`

The platform starts each student's instance with CPU, memory, PID, capability, read-only filesystem and an internal Docker network. It publishes the selected container port only to `127.0.0.1` on the host.

For production, run the runtime manager on a dedicated host/VM and use a hardened container runtime. Do not trust arbitrary third-party images.
