"""Private object storage for challenge and certificate files.

Supports AWS S3 and S3-compatible providers such as Cloudflare R2.
If storage is not configured, files remain on the local filesystem for development.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import BinaryIO

try:
    import boto3
except ImportError:  # pragma: no cover
    boto3 = None

STORAGE_ENABLED = os.getenv("OBJECT_STORAGE_ENABLED", "false").lower() == "true"
BUCKET = os.getenv("OBJECT_STORAGE_BUCKET", "")
REGION = os.getenv("OBJECT_STORAGE_REGION", "auto")
ENDPOINT = os.getenv("OBJECT_STORAGE_ENDPOINT", "")
ACCESS_KEY = os.getenv("OBJECT_STORAGE_ACCESS_KEY", "")
SECRET_KEY = os.getenv("OBJECT_STORAGE_SECRET_KEY", "")
SIGNED_TTL = max(60, min(int(os.getenv("OBJECT_STORAGE_SIGNED_URL_TTL", "600")), 3600))


def enabled() -> bool:
    return bool(STORAGE_ENABLED and boto3 and BUCKET and ACCESS_KEY and SECRET_KEY)


def client():
    if not enabled():
        return None
    kwargs = {"service_name": "s3", "region_name": REGION, "aws_access_key_id": ACCESS_KEY, "aws_secret_access_key": SECRET_KEY}
    if ENDPOINT:
        kwargs["endpoint_url"] = ENDPOINT
    return boto3.client(**kwargs)


def put_bytes(key: str, data: bytes, content_type: str | None = None) -> str:
    """Upload bytes and return a storage reference."""
    s3 = client()
    if not s3:
        raise RuntimeError("Object storage is not configured")
    extra = {"ContentType": content_type} if content_type else {}
    s3.put_object(Bucket=BUCKET, Key=key, Body=data, **extra)
    return f"s3://{BUCKET}/{key}"


def put_file(key: str, path: Path, content_type: str | None = None) -> str:
    with path.open("rb") as fh:
        return put_stream(key, fh, content_type)


def put_stream(key: str, fh: BinaryIO, content_type: str | None = None) -> str:
    s3 = client()
    if not s3:
        raise RuntimeError("Object storage is not configured")
    extra = {"ContentType": content_type} if content_type else {}
    if extra:
        s3.upload_fileobj(fh, BUCKET, key, ExtraArgs=extra)
    else:
        s3.upload_fileobj(fh, BUCKET, key)
    return f"s3://{BUCKET}/{key}"


def parse_ref(ref: str):
    if not ref.startswith("s3://"):
        return None
    raw = ref[5:]
    bucket, _, key = raw.partition("/")
    return bucket, key


def signed_url(ref: str, expires: int | None = None) -> str | None:
    parsed = parse_ref(ref)
    if not parsed:
        return None
    s3 = client()
    if not s3:
        return None
    bucket, key = parsed
    return s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires or SIGNED_TTL)


def delete(ref: str) -> bool:
    parsed = parse_ref(ref)
    if not parsed:
        return False
    s3 = client()
    if not s3:
        return False
    bucket, key = parsed
    s3.delete_object(Bucket=bucket, Key=key)
    return True


def status() -> dict:
    configured = enabled()
    reachable = False
    if configured:
        try:
            client().head_bucket(Bucket=BUCKET)
            reachable = True
        except Exception:
            reachable = False
    return {"configured": configured, "reachable": reachable, "provider": "s3-compatible" if ENDPOINT else "aws-s3", "bucket": BUCKET or None}
