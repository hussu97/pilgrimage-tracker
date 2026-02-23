"""
API v2 — not yet implemented.

To add a v2 endpoint:
1. Create a router module in this directory (e.g. places.py).
2. Import and register it in this file's api_router_v2.
3. Include api_router_v2 in server/app/main.py.

Policy: v1 is maintained for 12 months after v2 launch.
"""

from fastapi import APIRouter

api_router_v2 = APIRouter(prefix="/api/v2", tags=["v2"])
# api_router_v2.include_router(places.router, prefix="/places")
