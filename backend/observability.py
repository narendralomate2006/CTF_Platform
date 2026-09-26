"""Small dependency-free observability helpers for the CTF API."""
import json
import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone

LOG = logging.getLogger("ctf_api")

_lock = threading.Lock()
_recent = deque(maxlen=500)
_counters = {"requests": 0, "errors": 0, "5xx": 0, "4xx": 0}
_started = time.time()

class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "request_id"):
            payload["request_id"] = record.request_id
        return json.dumps(payload, ensure_ascii=False)


def configure_logging():
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        root.addHandler(handler)
    root.setLevel(logging.INFO)


def record_request(method, path, status, duration_ms, request_id):
    with _lock:
        _counters["requests"] += 1
        if status >= 500:
            _counters["5xx"] += 1
            _counters["errors"] += 1
        elif status >= 400:
            _counters["4xx"] += 1
        _recent.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "path": path,
            "status": status,
            "duration_ms": round(duration_ms, 2),
            "request_id": request_id,
        })


def snapshot():
    with _lock:
        recent = list(_recent)[-50:]
        counters = dict(_counters)
    uptime = int(time.time() - _started)
    return {"uptime_seconds": uptime, "counters": counters, "recent_requests": recent}
