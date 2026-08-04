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


def _load_menu_tree(client, property_id):
    branches = (
        client.table("menu_branches")
        .select("id, branch_key, parent_branch_key")
        .eq("property_id", property_id)
        .eq("active", True)
        .execute()
        .data
    )
    branches_by_key = {b["branch_key"]: b for b in branches}

    options = []
    if branches:
        options = (
            client.table("menu_options")
            .select("id, branch_id, option_key, label_en, label_es, choice_number, next_branch_key")
            .in_("branch_id", [b["id"] for b in branches])
            .eq("active", True)
            .order("choice_number")
            .execute()
            .data
        )
    options_by_branch_id = {}
    for o in options:
        options_by_branch_id.setdefault(o["branch_id"], []).append(o)

    return branches_by_key, options_by_branch_id


def _branch_depth(branches_by_key, branch_key):
    # Walks parent_branch_key up to main_menu (depth 0). A branch's depth is
    # a property of the branch itself, not of which option led to it, so
    # this stays well-defined even when several sibling options share one
    # next_branch_key (see restaurants_menu -> restaurant_followup_menu).
    depth = 0
    key = branch_key
    seen = set()
    while True:
        branch = branches_by_key.get(key)
        parent = branch["parent_branch_key"] if branch else None
        if not parent or parent in seen:
            return depth
        depth += 1
        seen.add(parent)
        key = parent


def _branch_label(branches_by_key, options_by_branch_id, branch_key):
    # menu_branches has no display-name column — a branch's guest-facing
    # label is whichever option's label led to it. Falls back to the raw
    # key if no parent option is found (shouldn't happen outside main_menu).
    if branch_key == "main_menu":
        return "Main Menu"
    branch = branches_by_key.get(branch_key)
    parent = branches_by_key.get(branch["parent_branch_key"]) if branch else None
    if not parent:
        return branch_key
    for option in options_by_branch_id.get(parent["id"], []):
        if option["next_branch_key"] == branch_key:
            return option["label_en"]
    return branch_key


def _breadcrumb_trail(branches_by_key, options_by_branch_id, branch_key, current_label=None):
    # current_label overrides only the trailing (current-branch) crumb, so a
    # shared branch (e.g. restaurant_followup_menu, reached by 7 different
    # venue options) shows the option actually clicked rather than always
    # the first sibling that happens to point there — see the "via" param
    # on the menu_tree route.
    trail = []
    key = branch_key
    seen = set()
    first = True
    while key and key not in seen:
        seen.add(key)
        label = current_label if (first and current_label is not None) else _branch_label(
            branches_by_key, options_by_branch_id, key
        )
        trail.append((key, label))
        first = False
        branch = branches_by_key.get(key)
        key = branch["parent_branch_key"] if branch else None
    trail.reverse()
    return trail


def _next_option_key(client, branch_id):
    rows = (
        client.table("menu_options")
        .select("option_key")
        .eq("branch_id", branch_id)
        .execute()
        .data
    )
    used = {
        int(m.group(1))
        for row in rows
        if (m := re.fullmatch(r"option_(\d+)", row["option_key"]))
    }
    n = 1
    while n in used:
        n += 1
    return f"option_{n}"


def _menu_limits(client, property_id):
    return (
        client.table("property_settings")
        .select("menu_max_depth, menu_max_children_per_branch")
        .eq("property_id", property_id)
        .single()
        .execute()
        .data
    )


@app.route("/menu-tree/<branch_key>")
def menu_tree(branch_key):
    client = get_client()
    property_id = get_property_id()
    branches_by_key, options_by_branch_id = _load_menu_tree(client, property_id)

    branch = branches_by_key.get(branch_key)
    if not branch:
        abort(404)

    limits = _menu_limits(client, property_id)
    options = options_by_branch_id.get(branch["id"], [])
    depth = _branch_depth(branches_by_key, branch_key)

    current_label = None
    via_option_id = request.args.get("via")
    parent = branches_by_key.get(branch["parent_branch_key"]) if branch["parent_branch_key"] else None
    if via_option_id and parent:
        for opt in options_by_branch_id.get(parent["id"], []):
            if opt["id"] == via_option_id and opt["next_branch_key"] == branch_key:
                current_label = opt["label_en"]
                break

    return render_template(
        "menu_tree.html",
        branch_key=branch_key,
        options=options,
        depth=depth,
        max_depth=limits["menu_max_depth"],
        max_children=limits["menu_max_children_per_branch"],
        at_breadth_limit=len(options) >= limits["menu_max_children_per_branch"],
        at_depth_limit=depth >= limits["menu_max_depth"],
        sibling_target_keys=sorted({o["next_branch_key"] for o in options if o["next_branch_key"]}),
        breadcrumbs=_breadcrumb_trail(branches_by_key, options_by_branch_id, branch_key, current_label),
        active="menu_tree",
    )


@app.route("/menu-tree/<branch_key>/options/add", methods=["POST"])
def menu_tree_option_add(branch_key):
    client = get_client()
    property_id = get_property_id()
    branches_by_key, options_by_branch_id = _load_menu_tree(client, property_id)

    branch = branches_by_key.get(branch_key)
    if not branch:
        abort(404)

    label_en = request.form.get("label_en", "").strip()
    label_es = request.form.get("label_es", "").strip()
    routing = request.form.get("routing", "terminal")
    existing_target = request.form.get("existing_target", "").strip()

    if not label_en:
        flash("New option needs a label.", "error")
        return redirect(url_for("menu_tree", branch_key=branch_key))

    options = options_by_branch_id.get(branch["id"], [])
    limits = _menu_limits(client, property_id)

    if len(options) >= limits["menu_max_children_per_branch"]:
        flash(f"This branch already has the max {limits['menu_max_children_per_branch']} options.", "error")
        return redirect(url_for("menu_tree", branch_key=branch_key))

    next_branch_key = None
    if routing == "new":
        depth = _branch_depth(branches_by_key, branch_key)
        if depth + 1 > limits["menu_max_depth"]:
            flash(f"A new sub-branch here would be {depth + 1} levels deep — the max is {limits['menu_max_depth']}.", "error")
            return redirect(url_for("menu_tree", branch_key=branch_key))
        new_branch_key = _next_slot_key(client, "menu_branches", "branch_key", property_id, "branch")
        client.table("menu_branches").insert(
            {
                "property_id": property_id,
                "branch_key": new_branch_key,
                "parent_branch_key": branch_key,
                "display_order": len(options) + 1,
                "active": True,
            }
        ).execute()
        next_branch_key = new_branch_key
    elif routing == "existing":
        # Sibling reuse only — every option offered here already targets a
        # branch whose parent_branch_key is this branch, so reusing it can't
        # give that branch a second, structurally different parent.
        sibling_keys = {o["next_branch_key"] for o in options if o["next_branch_key"]}
        if existing_target not in sibling_keys:
            flash("Choose one of this branch's existing sub-branches to reuse.", "error")
            return redirect(url_for("menu_tree", branch_key=branch_key))
        next_branch_key = existing_target

    client.table("menu_options").insert(
        {
            "branch_id": branch["id"],
            "option_key": _next_option_key(client, branch["id"]),
            "label_en": label_en,
            "label_es": label_es or None,
            "choice_number": len(options) + 1,
            "next_branch_key": next_branch_key,
            "active": True,
        }
    ).execute()

    flash(f'Added "{label_en}".', "success")
    return redirect(url_for("menu_tree", branch_key=branch_key))


@app.route("/menu-tree/options/<option_id>/save", methods=["POST"])
def menu_tree_option_save(option_id):
    client = get_client()
    property_id = get_property_id()

    option = (
        client.table("menu_options")
        .select("id, branch_id, option_key")
        .eq("id", option_id)
        .maybe_single()
        .execute()
        .data
    )
    if not option:
        abort(404)
    branch = (
        client.table("menu_branches")
        .select("branch_key, property_id")
        .eq("id", option["branch_id"])
        .single()
        .execute()
        .data
    )
    if not branch or branch["property_id"] != property_id:
        abort(404)

    label_en = request.form.get("label_en", "").strip()
    label_es = request.form.get("label_es", "").strip()
    if not label_en:
        flash(f"{option['option_key']}: label is required.", "error")
        return redirect(url_for("menu_tree", branch_key=branch["branch_key"]))

    client.table("menu_options").update(
        {"label_en": label_en, "label_es": label_es or None}
    ).eq("id", option_id).execute()

    flash("Saved to Supabase.", "success")
    return redirect(url_for("menu_tree", branch_key=branch["branch_key"]))


@app.route("/menu-tree/options/<option_id>/delete", methods=["POST"])
def menu_tree_option_delete(option_id):
    client = get_client()
    property_id = get_property_id()

    option = (
        client.table("menu_options")
        .select("id, branch_id, label_en, next_branch_key")
        .eq("id", option_id)
        .maybe_single()
        .execute()
        .data
    )
    if not option:
        abort(404)
    branch = (
        client.table("menu_branches")
        .select("id, branch_key, property_id")
        .eq("id", option["branch_id"])
        .single()
        .execute()
        .data
    )
    if not branch or branch["property_id"] != property_id:
        abort(404)

    if option["next_branch_key"]:
        target_branch = (
            client.table("menu_branches")
            .select("id")
            .eq("property_id", property_id)
            .eq("branch_key", option["next_branch_key"])
            .maybe_single()
            .execute()
            .data
        )
        if target_branch:
            other_siblings_pointing_here = (
                client.table("menu_options")
                .select("id", count="exact")
                .eq("branch_id", branch["id"])
                .eq("next_branch_key", option["next_branch_key"])
                .neq("id", option_id)
                .execute()
                .count
                or 0
            )
            if other_siblings_pointing_here == 0:
                # This is the last option pointing at the sub-branch — it
                # only comes along for the ride if that sub-branch is empty.
                options_inside_target = (
                    client.table("menu_options")
                    .select("id", count="exact")
                    .eq("branch_id", target_branch["id"])
                    .execute()
                    .count
                    or 0
                )
                if options_inside_target > 0:
                    flash(
                        f"\"{option['label_en']}\" leads to a sub-branch that still has "
                        f"{options_inside_target} option(s) — remove those first.",
                        "error",
                    )
                    return redirect(url_for("menu_tree", branch_key=branch["branch_key"]))
                client.table("menu_branches").delete().eq("id", target_branch["id"]).execute()

    client.table("menu_options").delete().eq("id", option_id).execute()
    flash(f"Removed \"{option['label_en']}\".", "success")
    return redirect(url_for("menu_tree", branch_key=branch["branch_key"]))


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
