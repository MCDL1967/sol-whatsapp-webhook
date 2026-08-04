"""
app.py
Tenant Property Configuration Tool — pass 1 (property basics only).
Flask app mirroring logs/logs_app.py's pattern: server-rendered Jinja,
Supabase read/write via service_role key, no user auth yet.

Scope for this pass: docs/db_planning/SOL_DB_Master_Plan_v1.0.md's
"property-editable" basics — proving the pull -> edit -> push -> publish ->
recompile loop before venues/menu-tree editing is built on top of it.

Editable: tenants.display_name, properties.display_name, properties.timezone,
property_settings.{concierge_name, default_language, supported_languages}.
Read-only: tenants.tenant_key, properties.property_key — these are the
SOL/Admin-owned "stable keys" per section 5 of the master plan, not
Property-Admin-editable.
"""

import os
import re
import sys
from collections import Counter
from pathlib import Path

from flask import Flask, render_template, request, redirect, url_for, flash, abort

from db import get_client, get_tenant_id, get_property_id

# logs/compile_runtime_package.py is designed as an importable library
# (compile_package/next_version) — reuse it rather than duplicating the
# compile logic. See docs/db_planning/DB_Construction_Decisions_v0.1.md.
sys.path.insert(0, str(Path(__file__).parent.parent / "logs"))
from compile_runtime_package import compile_package, next_version, SOURCE_SCHEMA_VERSION

from datetime import datetime, timezone

app = Flask(__name__)
app.secret_key = os.environ.get("TENANT_TOOL_SECRET", "tenant-tool-local-dev-key")

LANGUAGE_CHOICES = ["en", "es"]


def _load_basics(client, tenant_id, property_id):
    tenant = (
        client.table("tenants")
        .select("tenant_key, display_name")
        .eq("id", tenant_id)
        .single()
        .execute()
        .data
    )
    property_row = (
        client.table("properties")
        .select("property_key, display_name, timezone")
        .eq("id", property_id)
        .single()
        .execute()
        .data
    )
    settings = (
        client.table("property_settings")
        .select("concierge_name, default_language, supported_languages")
        .eq("property_id", property_id)
        .single()
        .execute()
        .data
    )
    return {"tenant": tenant, "property": property_row, "settings": settings}


@app.route("/basics")
def basics():
    client = get_client()
    basics_data = _load_basics(client, get_tenant_id(), get_property_id())
    return render_template(
        "basics.html",
        **basics_data,
        language_choices=LANGUAGE_CHOICES,
        active="basics",
    )


@app.route("/save", methods=["POST"])
def save():
    client = get_client()
    tenant_id = get_tenant_id()
    property_id = get_property_id()

    tenant_name = request.form.get("tenant_name", "").strip()
    property_name = request.form.get("property_name", "").strip()
    timezone_name = request.form.get("timezone_name", "").strip()
    concierge_name = request.form.get("concierge_name", "").strip()
    default_language = request.form.get("default_language", "").strip()
    supported_languages = request.form.getlist("supported_languages")

    if not all([tenant_name, property_name, timezone_name, concierge_name]) or (
        default_language not in LANGUAGE_CHOICES or not supported_languages
    ):
        flash("All fields are required, and at least one supported language must be checked.", "error")
        return redirect(url_for("basics"))

    client.table("tenants").update({"display_name": tenant_name}).eq("id", tenant_id).execute()
    client.table("properties").update(
        {"display_name": property_name, "timezone": timezone_name}
    ).eq("id", property_id).execute()
    client.table("property_settings").update(
        {
            "concierge_name": concierge_name,
            "default_language": default_language,
            "supported_languages": supported_languages,
        }
    ).eq("property_id", property_id).execute()

    flash("Saved to Supabase.", "success")
    return redirect(url_for("basics"))


def _load_teams(client, property_id):
    teams = (
        client.table("teams")
        .select("id, team_key, dept_target, display_name, scope")
        .eq("property_id", property_id)
        .eq("active", True)
        .order("team_key")
        .execute()
        .data
    )
    cases = (
        client.table("cases")
        .select("assigned_team_id")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    counts = Counter(c["assigned_team_id"] for c in cases if c["assigned_team_id"])
    for team in teams:
        team["case_count"] = counts.get(team["id"], 0)
    return teams


def _next_slot_key(client, table, key_column, property_id, prefix):
    # Must consider ALL rows, including soft-deleted (active=false) ones —
    # the key column keeps its unique constraint regardless of active status,
    # so reusing a deleted-but-still-present row's key would collide. Picks
    # the smallest unused <prefix>_N rather than always climbing past the
    # highest number ever used, so 3 teams/venues stay _1/_2/_3, not
    # ever-growing numbers from add/delete churn.
    rows = (
        client.table(table)
        .select(key_column)
        .eq("property_id", property_id)
        .execute()
        .data
    )
    used = {
        int(m.group(1))
        for row in rows
        if (m := re.fullmatch(rf"{prefix}_(\d+)", row[key_column]))
    }
    n = 1
    while n in used:
        n += 1
    return f"{prefix}_{n}"


@app.route("/teams")
def teams():
    client = get_client()
    return render_template(
        "teams.html",
        teams=_load_teams(client, get_property_id()),
        active="teams",
    )


@app.route("/teams/<team_id>/save", methods=["POST"])
def teams_save(team_id):
    client = get_client()
    property_id = get_property_id()

    team = (
        client.table("teams")
        .select("team_key")
        .eq("id", team_id)
        .eq("property_id", property_id)
        .single()
        .execute()
        .data
    )
    if not team:
        abort(404)

    display_name = request.form.get("display_name", "").strip()
    scope = request.form.get("scope", "").strip()
    if not display_name:
        flash(f"{team['team_key']}: display name is required.", "error")
        return redirect(url_for("teams"))

    client.table("teams").update(
        {"display_name": display_name, "scope": scope or None}
    ).eq("id", team_id).execute()

    flash("Saved to Supabase.", "success")
    return redirect(url_for("teams"))


@app.route("/teams/<team_id>/delete", methods=["POST"])
def teams_delete(team_id):
    client = get_client()
    property_id = get_property_id()

    team = (
        client.table("teams")
        .select("team_key, display_name")
        .eq("id", team_id)
        .eq("property_id", property_id)
        .single()
        .execute()
        .data
    )
    if not team:
        abort(404)

    case_count = (
        client.table("cases")
        .select("id", count="exact")
        .eq("assigned_team_id", team_id)
        .execute()
        .count
        or 0
    )

    if case_count == 0:
        # Nothing to lose — hard delete, which frees team_key for reuse by
        # the next "Add team" (see _next_team_key). Soft-deleting an unused
        # team would permanently burn its number for no benefit.
        client.table("teams").delete().eq("id", team_id).execute()
        flash(f"Deleted {team['display_name']} ({team['team_key']}).", "success")
    else:
        # Has real history — soft delete (active = false) so cases keep
        # showing their assigned team; team_key stays reserved rather than
        # risking it colliding if reused later.
        client.table("teams").update({"active": False}).eq("id", team_id).execute()
        flash(f"Removed {team['display_name']} ({team['team_key']}) — its {case_count} case(s) keep their history.", "success")

    return redirect(url_for("teams"))


@app.route("/teams/add", methods=["POST"])
def teams_add():
    client = get_client()
    property_id = get_property_id()

    display_name = request.form.get("new_team_name", "").strip()
    if not display_name:
        flash("New team needs a display name.", "error")
        return redirect(url_for("teams"))

    team_key = _next_slot_key(client, "teams", "team_key", property_id, "team")
    client.table("teams").insert(
        {
            "property_id": property_id,
            "team_key": team_key,
            "dept_target": team_key,
            "display_name": display_name,
            "active": True,
        }
    ).execute()

    flash(f"Added {display_name} ({team_key}).", "success")
    return redirect(url_for("teams"))


def _load_venues(client, property_id):
    venues = (
        client.table("venues")
        .select("id, venue_key, display_name, venue_type, reservation_enabled, selectable, show_in_restaurant_list, handoff_team_id")
        .eq("property_id", property_id)
        .eq("active", True)
        .order("venue_key")
        .execute()
        .data
    )
    venue_ids = [v["id"] for v in venues]

    aliases_by_venue = {}
    descriptions_by_venue = {}
    reservation_counts = Counter()
    if venue_ids:
        for row in (
            client.table("venue_aliases")
            .select("venue_id, alias")
            .in_("venue_id", venue_ids)
            .execute()
            .data
        ):
            aliases_by_venue.setdefault(row["venue_id"], []).append(row["alias"])
        for row in (
            client.table("venue_descriptions")
            .select("venue_id, short_description")
            .in_("venue_id", venue_ids)
            .eq("language", "en")
            .execute()
            .data
        ):
            descriptions_by_venue[row["venue_id"]] = row["short_description"]
        reservation_counts = Counter(
            r["venue_id"]
            for r in client.table("reservation_details").select("venue_id").in_("venue_id", venue_ids).execute().data
            if r["venue_id"]
        )

    for v in venues:
        v["aliases"] = ", ".join(aliases_by_venue.get(v["id"], []))
        v["short_description"] = descriptions_by_venue.get(v["id"], "")
        v["reservation_count"] = reservation_counts.get(v["id"], 0)

    return venues


@app.route("/venues")
def venues():
    client = get_client()
    property_id = get_property_id()
    return render_template(
        "venues.html",
        venues=_load_venues(client, property_id),
        teams=_load_teams(client, property_id),
        active="venues",
    )


@app.route("/venues/<venue_id>/save", methods=["POST"])
def venues_save(venue_id):
    client = get_client()
    property_id = get_property_id()

    venue = (
        client.table("venues")
        .select("venue_key")
        .eq("id", venue_id)
        .eq("property_id", property_id)
        .single()
        .execute()
        .data
    )
    if not venue:
        abort(404)

    display_name = request.form.get("display_name", "").strip()
    venue_type = request.form.get("venue_type", "").strip()
    if not display_name or not venue_type:
        flash(f"{venue['venue_key']}: display name and venue type are required.", "error")
        return redirect(url_for("venues"))

    handoff_team_id = request.form.get("handoff_team_id", "").strip() or None

    client.table("venues").update(
        {
            "display_name": display_name,
            "venue_type": venue_type,
            "reservation_enabled": "reservation_enabled" in request.form,
            "selectable": "selectable" in request.form,
            "show_in_restaurant_list": "show_in_restaurant_list" in request.form,
            "handoff_team_id": handoff_team_id,
        }
    ).eq("id", venue_id).execute()

    aliases = [a.strip() for a in request.form.get("aliases", "").split(",") if a.strip()]
    client.table("venue_aliases").delete().eq("venue_id", venue_id).execute()
    if aliases:
        client.table("venue_aliases").insert(
            [{"venue_id": venue_id, "alias": alias, "language": None} for alias in aliases]
        ).execute()

    short_description = request.form.get("short_description", "").strip()
    client.table("venue_descriptions").upsert(
        {"venue_id": venue_id, "language": "en", "short_description": short_description or None},
        on_conflict="venue_id,language",
    ).execute()

    flash("Saved to Supabase.", "success")
    return redirect(url_for("venues"))


@app.route("/venues/<venue_id>/delete", methods=["POST"])
def venues_delete(venue_id):
    client = get_client()
    property_id = get_property_id()

    venue = (
        client.table("venues")
        .select("venue_key, display_name")
        .eq("id", venue_id)
        .eq("property_id", property_id)
        .single()
        .execute()
        .data
    )
    if not venue:
        abort(404)

    reservation_count = (
        client.table("reservation_details")
        .select("id", count="exact")
        .eq("venue_id", venue_id)
        .execute()
        .count
        or 0
    )

    if reservation_count == 0:
        # Nothing to lose — hard delete, which frees venue_key for reuse.
        # Aliases/descriptions have no ON DELETE CASCADE, so clear those
        # child rows first or deleting the venue itself would violate the FK.
        client.table("venue_aliases").delete().eq("venue_id", venue_id).execute()
        client.table("venue_descriptions").delete().eq("venue_id", venue_id).execute()
        client.table("venues").delete().eq("id", venue_id).execute()
        flash(f"Deleted {venue['display_name']} ({venue['venue_key']}).", "success")
    else:
        # Has real reservation history — soft delete (active = false) so
        # those reservations keep showing their venue; venue_key stays
        # reserved rather than risking it colliding if reused later.
        client.table("venues").update({"active": False}).eq("id", venue_id).execute()
        flash(f"Removed {venue['display_name']} ({venue['venue_key']}) — its {reservation_count} reservation(s) keep their history.", "success")

    return redirect(url_for("venues"))


@app.route("/venues/add", methods=["POST"])
def venues_add():
    client = get_client()
    property_id = get_property_id()

    display_name = request.form.get("new_venue_name", "").strip()
    if not display_name:
        flash("New venue needs a display name.", "error")
        return redirect(url_for("venues"))

    venue_key = _next_slot_key(client, "venues", "venue_key", property_id, "venue")
    client.table("venues").insert(
        {
            "property_id": property_id,
            "venue_key": venue_key,
            "display_name": display_name,
            "venue_type": "restaurant",
            "reservation_enabled": False,
            "selectable": True,
            "show_in_restaurant_list": True,
            "active": True,
        }
    ).execute()

    flash(f"Added {display_name} ({venue_key}).", "success")
    return redirect(url_for("venues"))


GUEST_RULES_FLAG_KEY = "venue_specific_hours_configured"


def _load_guest_rules(client, property_id):
    rules = (
        client.table("reservation_rules")
        .select("large_party_threshold, arrival_buffer_minutes, typical_duration_minutes, policy_json")
        .eq("property_id", property_id)
        .single()
        .execute()
        .data
    )
    flag = (
        client.table("runtime_feature_flags")
        .select("enabled")
        .eq("property_id", property_id)
        .eq("flag_key", GUEST_RULES_FLAG_KEY)
        .maybe_single()
        .execute()
        .data
    )
    rules["venue_specific_hours_configured"] = bool(flag["enabled"]) if flag else False
    return rules


@app.route("/guest-rules")
def guest_rules():
    client = get_client()
    return render_template(
        "guest_rules.html",
        rules=_load_guest_rules(client, get_property_id()),
        active="guest_rules",
    )


@app.route("/guest-rules/save", methods=["POST"])
def guest_rules_save():
    client = get_client()
    property_id = get_property_id()

    def _int(name):
        val = request.form.get(name, "").strip()
        return int(val) if val.isdigit() else None

    large_party_threshold = _int("large_party_threshold")
    arrival_buffer_minutes = _int("arrival_buffer_minutes")
    typical_duration_minutes = _int("typical_duration_minutes")

    if large_party_threshold is None:
        flash("Group threshold is required and must be a whole number.", "error")
        return redirect(url_for("guest_rules"))

    current = (
        client.table("reservation_rules")
        .select("policy_json")
        .eq("property_id", property_id)
        .single()
        .execute()
        .data
    )
    # Merge, don't overwrite — policy_json also carries vip_group_required_fields,
    # which this form doesn't (and shouldn't) touch.
    policy_json = {**(current["policy_json"] or {})}
    policy_json["dinner_reservations_recommended"] = "dinner_reservations_recommended" in request.form
    policy_json["walk_ins_based_on_availability"] = "walk_ins_based_on_availability" in request.form

    client.table("reservation_rules").update(
        {
            "large_party_threshold": large_party_threshold,
            "arrival_buffer_minutes": arrival_buffer_minutes,
            "typical_duration_minutes": typical_duration_minutes,
            "policy_json": policy_json,
        }
    ).eq("property_id", property_id).execute()

    client.table("runtime_feature_flags").upsert(
        {
            "property_id": property_id,
            "flag_key": GUEST_RULES_FLAG_KEY,
            "enabled": "venue_specific_hours_configured" in request.form,
        },
        on_conflict="property_id,flag_key",
    ).execute()

    flash("Saved to Supabase.", "success")
    return redirect(url_for("guest_rules"))


def _latest_package(client, property_id):
    rows = (
        client.table("runtime_packages")
        .select("runtime_package_version, published_at")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    # runtime_package_version is stored as text (see compile_runtime_package.py's
    # next_version) — sort numerically in Python rather than relying on the
    # DB's text ordering, which would put "10" before "9".
    numeric = [r for r in rows if str(r["runtime_package_version"]).isdigit()]
    if not numeric:
        return None
    return max(numeric, key=lambda r: int(r["runtime_package_version"]))


@app.route("/")
def overview():
    client = get_client()
    property_id = get_property_id()

    settings = (
        client.table("property_settings")
        .select("concierge_name")
        .eq("property_id", property_id)
        .single()
        .execute()
        .data
    )
    property_row = (
        client.table("properties")
        .select("display_name")
        .eq("id", property_id)
        .single()
        .execute()
        .data
    )
    team_count = (
        client.table("teams")
        .select("id", count="exact")
        .eq("property_id", property_id)
        .eq("active", True)
        .execute()
        .count
        or 0
    )
    latest_package = _latest_package(client, property_id)

    readiness = [
        (bool(settings and settings.get("concierge_name")), "Concierge name is set"),
        (team_count > 0, "At least one team is configured"),
        (latest_package is not None, "Published at least once"),
    ]

    return render_template(
        "overview.html",
        concierge_name=(settings or {}).get("concierge_name"),
        property_name=(property_row or {}).get("display_name"),
        team_count=team_count,
        latest_package=latest_package,
        readiness=readiness,
        active="overview",
    )


def _fetch_published_package(client, property_id, version):
    row = (
        client.table("runtime_packages")
        .select("package_json")
        .eq("property_id", property_id)
        .eq("runtime_package_version", version)
        .single()
        .execute()
        .data
    )
    return row["package_json"] if row else None


@app.route("/review")
def review():
    client = get_client()
    property_id = get_property_id()

    published = None
    version = request.args.get("v")
    if version:
        package_json = _fetch_published_package(client, property_id, version)
        if package_json:
            published = {"version": version, "package": package_json}

    return render_template("review.html", published=published, active="review")


@app.route("/publish", methods=["POST"])
def publish():
    client = get_client()
    property_id = get_property_id()

    package_json = compile_package(client, property_id)
    version = next_version(client, property_id)

    client.table("runtime_packages").insert(
        {
            "property_id": property_id,
            "runtime_package_version": version,
            "source_schema_version": SOURCE_SCHEMA_VERSION,
            "package_json": package_json,
            "published_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()

    flash(f"Published runtime package v{version}.", "success")
    return redirect(url_for("review", v=version))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5065, debug=True)
