"""Shared limits and authentication for the reference services."""
import hmac
import os
from fastapi import HTTPException, Request


def authorize(request: Request):
    token = os.environ.get("SIDECAR_TOKEN")
    if not token:
        raise HTTPException(503, "Sidecar token is not configured")
    supplied = request.headers.get("authorization", "").encode()
    if not hmac.compare_digest(supplied, f"Bearer {token}".encode()):
        raise HTTPException(401, "Authentication required")


async def bounded_body(request: Request):
    authorize(request)
    limit = int(os.environ.get("MAX_REQUEST_BYTES", "5000000"))
    declared = request.headers.get("content-length")
    if declared and (not declared.isdecimal() or int(declared) > limit):
        raise HTTPException(413, "Request too large")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > limit:
            raise HTTPException(413, "Request too large")
        data.extend(chunk)
    return bytes(data)
