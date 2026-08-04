"""
db.py
Database layer for the Tenant Property Configuration Tool.
Reads/writes Supabase directly, same pattern as logs/logs_db.py (service_role
key, no user auth — see docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 8).
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
TENANT_KEY = os.environ.get("TENANT_KEY", "sol_demo")
PROPERTY_KEY = os.environ.get("PROPERTY_ID", "demo")

_client: Client | None = None
_tenant_id: str | None = None
_property_id: str | None = None


def get_client() -> Client:
    """Return a lazily-created Supabase client using the service_role key."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError(
                "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — check tenant_tool/.env"
            )
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client


def get_tenant_id() -> str:
    """Resolve and cache the demo tenant id (sol_demo)."""
    global _tenant_id
    if _tenant_id is None:
        client = get_client()
        tenant = (
            client.table("tenants")
            .select("id")
            .eq("tenant_key", TENANT_KEY)
            .single()
            .execute()
        )
        _tenant_id = tenant.data["id"]
    return _tenant_id


def get_property_id() -> str:
    """Resolve and cache the demo tenant/property id (sol_demo/demo)."""
    global _property_id
    if _property_id is None:
        client = get_client()
        prop = (
            client.table("properties")
            .select("id")
            .eq("tenant_id", get_tenant_id())
            .eq("property_key", PROPERTY_KEY)
            .single()
            .execute()
        )
        _property_id = prop.data["id"]
    return _property_id
