"""
logs_app.py
LOGS v2 Flask application — local-first, server-rendered HTML.
Reads/writes Supabase directly. See docs/db_planning/old_planning_docs/whatsapp_db_logs_adaptation_v0.1.md.

Views:
  /                 → redirect to /gm
  /gm               → GM dashboard (all cases)
  /team/<team_key>  → one dashboard per tenant-defined team (was the fixed
                      /fnb /sec /ops routes — routing is now arbitrary
                      per-tenant via teams/assigned_team_id, not a fixed
                      dept_target enum. See DB_Construction_Decisions_v0.1.md.)
  /case/<id>        → case detail + minimal edit form
  /case/<id>/edit   → POST handler for edits
  /export/<view>    → trigger Excel export (stubbed — see logs_export.py)
  /seed             → load seed data (dev helper)
"""

import os

from flask import Flask, render_template, request, redirect, url_for, flash, abort

from logs_db import get_client, get_property_id
from logs_models import VALID_STATUSES, EDITABLE_FIELDS

app = Flask(__name__)
app.secret_key = os.environ.get("LOGS_SECRET", "logs-v2-local-dev-key")

CASE_SELECT = "*, reservation_details(*, venues(display_name)), complaint_details(*), incident_details(*), service_request_details(*), teams(id,team_key,display_name)"

# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_filters(args) -> dict:
    return {
        "status":  args.get("status", "").strip(),
        "team_id": args.get("team_id", "").strip(),
        "q":       args.get("q", "").strip(),
    }


def _get_teams() -> list:
    client = get_client()
    res = (
        client.table("teams")
        .select("id,team_key,display_name,dept_target")
        .eq("property_id", get_property_id())
        .eq("active", True)
        .order("team_key")
        .execute()
    )
    return res.data


def _get_cases(filters: dict) -> list:
    client = get_client()
    query = client.table("cases").select(CASE_SELECT).eq("property_id", get_property_id())

    if filters.get("team_id"):
        query = query.eq("assigned_team_id", filters["team_id"])
    if filters.get("status"):
        query = query.eq("status", filters["status"])
    if filters.get("q"):
        q = filters["q"]
        query = query.or_(f"guest_name.ilike.%{q}%,summary.ilike.%{q}%")

    res = query.order("created_at", desc=True).limit(500).execute()
    return res.data


def _counts() -> dict:
    """Return case counts per view for the nav bar: total, one per team, and open."""
    client = get_client()
    property_id = get_property_id()

    def count(team_id: str | None = None, status_not_closed: bool = False) -> int:
        q = client.table("cases").select("id", count="exact").eq("property_id", property_id)
        if team_id:
            q = q.eq("assigned_team_id", team_id)
        if status_not_closed:
            q = q.neq("status", "closed")
        return q.execute().count or 0

    by_team = {t["team_key"]: count(team_id=t["id"]) for t in _get_teams()}

    return {
        "total": count(),
        "by_team": by_team,
        "open": count(status_not_closed=True),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return redirect(url_for("view_gm"))


@app.route("/gm")
def view_gm():
    filters = _parse_filters(request.args)
    cases   = _get_cases(filters)
    return render_template("list.html",
        view="gm", title="GM — All Cases",
        cases=cases, filters=filters, teams=_get_teams(),
        statuses=VALID_STATUSES, counts=_counts())


@app.route("/team/<team_key>")
def view_team(team_key):
    teams = _get_teams()
    team = next((t for t in teams if t["team_key"] == team_key), None)
    if not team:
        abort(404)

    filters = _parse_filters(request.args)
    filters["team_id"] = team["id"]
    cases = _get_cases(filters)
    return render_template("list.html",
        view=f"team_{team_key}", title=f"{team['display_name']} — Cases",
        cases=cases, filters=filters, teams=teams,
        statuses=VALID_STATUSES, counts=_counts())


@app.route("/case/<case_id>")
def case_detail(case_id):
    client = get_client()
    try:
        res = (
            client.table("cases")
            .select(CASE_SELECT)
            .eq("id", case_id)
            .eq("property_id", get_property_id())
            .single()
            .execute()
        )
    except Exception:
        abort(404)

    if not res.data:
        abort(404)

    return render_template("detail.html",
        case=res.data,
        statuses=VALID_STATUSES,
        editable=EDITABLE_FIELDS,
        teams=_get_teams(),
        counts=_counts())


@app.route("/case/<case_id>/edit", methods=["POST"])
def case_edit(case_id):
    client = get_client()

    updates = {}
    for field in EDITABLE_FIELDS:
        val = request.form.get(field)
        if val is not None:
            updates[field] = val.strip() or None

    try:
        result = (
            client.table("cases")
            .update(updates)
            .eq("id", case_id)
            .eq("property_id", get_property_id())
            .execute()
        )
    except Exception:
        abort(404)

    if not result.data:
        abort(404)

    flash(f"Case updated.", "success")
    return redirect(url_for("case_detail", case_id=case_id))


@app.route("/export/<view_name>")
def trigger_export(view_name):
    valid = {"gm", "all"} | {t["team_key"] for t in _get_teams()}
    if view_name not in valid:
        abort(404)
    flash("Excel export is temporarily unavailable — pending a Supabase-schema rewrite of logs_export.py.", "error")
    return redirect(request.referrer or url_for("view_gm"))


# ── Seed data ─────────────────────────────────────────────────────────────────

@app.route("/seed")
def seed():
    """Load demo data. Only for dev/setup. Remove in production."""
    from logs_seed import run_seed
    count = run_seed()
    flash(f"Seed complete: {count} cases loaded.", "success")
    return redirect(url_for("view_gm"))


# ── Startup ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    get_property_id()  # fail fast if Supabase/tenant config is misconfigured
    app.run(host="127.0.0.1", port=5050, debug=True)
