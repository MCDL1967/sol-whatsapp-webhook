"""
logs_app.py
LOGS v2 Flask application — local-first, server-rendered HTML.

Views:
  /               → redirect to /gm
  /gm             → GM dashboard (all cases)
  /fnb            → FNB view (dining reservations)
  /sec            → SEC view (security / incidents)
  /adm            → ADM view (gaming / events / admin)
  /case/<id>      → case detail + minimal edit form
  /case/<id>/edit → POST handler for edits
  /export/<view>  → trigger Excel export
  /seed           → load seed data (dev helper)
"""

import os
from pathlib import Path
from datetime import datetime

import pytz
from flask import Flask, render_template, request, redirect, url_for, flash, abort

from logs_db import get_db, init_db
from logs_models import VALID_STATUSES, EDITABLE_FIELDS, PANAMA_TZ, now_panama_iso
from logs_export import export_view

app = Flask(__name__)
app.secret_key = os.environ.get("LOGS_SECRET", "logs-v2-local-dev-key")

# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_filters(args) -> dict:
    return {
        "status":       args.get("status", "").strip(),
        "dept_target":  args.get("dept_target", "").strip(),
        "section_team": args.get("section_team", "").strip(),
        "q":            args.get("q", "").strip(),
    }


def _build_query(base_where: str, filters: dict) -> tuple[str, list]:
    """Build WHERE clause and params list from filters dict."""
    clauses = []
    params  = []

    if base_where:
        clauses.append(base_where)

    if filters.get("status"):
        clauses.append("status = ?")
        params.append(filters["status"])

    if filters.get("dept_target"):
        clauses.append("dept_target = ?")
        params.append(filters["dept_target"])

    if filters.get("section_team"):
        clauses.append("section_team = ?")
        params.append(filters["section_team"])

    if filters.get("q"):
        q = f"%{filters['q']}%"
        clauses.append("(guest_name LIKE ? OR summary LIKE ? OR record_id LIKE ?)")
        params.extend([q, q, q])

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


def _get_cases(base_where: str, filters: dict) -> list:
    where, params = _build_query(base_where, filters)
    sql = f"SELECT * FROM cases {where} ORDER BY timestamp DESC LIMIT 500"
    conn = get_db()
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    conn.close()
    return rows


def _counts() -> dict:
    """Return case counts per view for the nav bar."""
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM cases").fetchone()[0]
    fnb   = conn.execute("SELECT COUNT(*) FROM cases WHERE dept_target='FNB'").fetchone()[0]
    sec   = conn.execute("SELECT COUNT(*) FROM cases WHERE dept_target='SEC'").fetchone()[0]
    adm   = conn.execute("SELECT COUNT(*) FROM cases WHERE dept_target='ADM'").fetchone()[0]
    open_ = conn.execute("SELECT COUNT(*) FROM cases WHERE status NOT IN ('closed')").fetchone()[0]
    conn.close()
    return {"total": total, "fnb": fnb, "sec": sec, "adm": adm, "open": open_}


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return redirect(url_for("view_gm"))


@app.route("/gm")
def view_gm():
    filters = _parse_filters(request.args)
    cases   = _get_cases("", filters)
    return render_template("list.html",
        view="gm", title="GM — All Cases",
        cases=cases, filters=filters,
        statuses=VALID_STATUSES, counts=_counts())


@app.route("/fnb")
def view_fnb():
    filters = _parse_filters(request.args)
    cases   = _get_cases("dept_target = 'FNB'", filters)
    return render_template("list.html",
        view="fnb", title="FNB — Dining Reservations",
        cases=cases, filters=filters,
        statuses=VALID_STATUSES, counts=_counts())


@app.route("/sec")
def view_sec():
    filters = _parse_filters(request.args)
    cases   = _get_cases("dept_target = 'SEC'", filters)
    return render_template("list.html",
        view="sec", title="SEC — Security / Incidents",
        cases=cases, filters=filters,
        statuses=VALID_STATUSES, counts=_counts())


@app.route("/adm")
def view_adm():
    filters = _parse_filters(request.args)
    cases   = _get_cases("dept_target = 'ADM'", filters)
    return render_template("list.html",
        view="adm", title="ADM — Gaming / Events / Admin",
        cases=cases, filters=filters,
        statuses=VALID_STATUSES, counts=_counts())


@app.route("/case/<record_id>")
def case_detail(record_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM cases WHERE record_id = ?", (record_id,)).fetchone()
    conn.close()
    if not row:
        abort(404)
    return render_template("detail.html",
        case=dict(row),
        statuses=VALID_STATUSES,
        editable=EDITABLE_FIELDS,
        counts=_counts())


@app.route("/case/<record_id>/edit", methods=["POST"])
def case_edit(record_id):
    conn = get_db()
    row = conn.execute("SELECT record_id FROM cases WHERE record_id = ?", (record_id,)).fetchone()
    if not row:
        conn.close()
        abort(404)

    updates = {}
    for field in EDITABLE_FIELDS:
        val = request.form.get(field)
        if val is not None:
            updates[field] = val.strip() or None

    updates["updated_at"] = now_panama_iso()

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["record_id"] = record_id

    with conn:
        conn.execute(f"UPDATE cases SET {set_clause} WHERE record_id = :record_id", updates)
    conn.close()

    flash(f"Case {record_id} updated.", "success")
    return redirect(url_for("case_detail", record_id=record_id))


@app.route("/export/<view_name>")
def trigger_export(view_name):
    valid = ["gm", "fnb", "sec", "adm", "all"]
    if view_name not in valid:
        abort(404)
    try:
        if view_name == "all":
            for v in ["gm", "fnb", "sec", "adm"]:
                export_view(v)
            flash("All Excel exports completed.", "success")
        else:
            result = export_view(view_name)
            flash(f"{view_name.upper()} exported: {result['rows']} rows.", "success")
    except Exception as e:
        flash(f"Export error: {e}", "error")

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
    init_db()
    app.run(host="127.0.0.1", port=5050, debug=True)
