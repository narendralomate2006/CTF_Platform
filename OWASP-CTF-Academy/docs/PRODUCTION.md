# Production Operations Guide

## 1. Required secrets

Set a strong random `SECRET_KEY`, `METRICS_TOKEN`, database credentials, OAuth secrets, SMTP credentials, and object-storage credentials through the deployment secret manager. Never commit `.env` files.

## 2. Health probes

- `GET /health` — dependency health summary.
- `GET /ready` — readiness probe; returns HTTP 503 when the database or enabled Redis dependency is unavailable.
- `GET /internal/metrics` — private runtime metrics. Requires `X-Metrics-Token`.

## 3. Monitoring

The admin UI contains **Production Monitor** with uptime, request counts, 4xx/5xx counts, live challenge instances, open security alerts, and recent request IDs.

For external monitoring, scrape or poll `/internal/metrics` from a trusted monitoring network only. Put TLS and authentication at the reverse proxy/load balancer.

## 4. Backups

Use `ops/backup_postgres.sh` on Linux or `ops/backup_postgres.ps1` on Windows. Store backups outside the application host and periodically test restoration.

A backup is not considered valid until a restore has been tested.

## 5. Deployment

Use the CI workflow for every push/PR. Tag releases (`v2.4.0`) to run the Docker build workflow. Run database migrations as a separate controlled deployment step before switching application traffic.

## 6. Live challenge isolation

The current Docker runtime is suitable for controlled local/club environments. For hostile multi-tenant public CTF workloads, use a dedicated runtime pool with stronger VM/microVM isolation, egress controls, image allowlists/signing, resource quotas, and centralized container logs.

## 7. Incident response

Keep request IDs, security alerts, and submission records long enough to investigate a competition. Restrict operational logs to authorized staff and avoid logging passwords, access tokens, reset tokens, or submitted flags.

## 8. Restore test

For a controlled restore test:

```bash
./ops/restore_postgres.sh ./backups/ctf_platform_YYYYMMDDTHHMMSSZ.dump
```

Run this against a staging database, not the live competition database. Validate login, challenge submissions, event registration, certificates, and admin access after restore.
