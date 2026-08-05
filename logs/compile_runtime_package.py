"""
compile_runtime_package.py
Reads the Supabase config tables for a property and compiles them into one
runtime_packages.package_json row. Mirror of seed_kb_from_demo_package.py,
reversed: Supabase tables -> one JSON blob, instead of JSON files -> Supabase.

Design decisions this implements: see
docs/db_planning/SOL_DB_Master_Plan_v1.0.md ->
"Runtime package compilation - design resolved 2026-07-22".

- Only tenant-wide static config goes in the package - no guest-specific
  data (open reservations, session state). That stays in cases/
  reservation_details/session-state, untouched here.
- menu_options with no next_branch_key just carry a null value - no
  validation, no completeness requirement.
- Every run inserts a new versioned row (simple auto-incrementing integer,
  stored as text per the runtime_packages.runtime_package_version column)
  rather than overwriting - free history, even though there's no rollback
  UI built on top of it yet.
- Every run is treated as an immediate publish (published_at = now()) -
  there's no separate draft/review workflow for the whole package yet
  (only response_templates.approval_status gates wording today).

Does not touch webhook.js - nothing reads runtime_packages yet.

Run via: cd logs && source venv/bin/activate && python compile_runtime_package.py
"""

from datetime import datetime, timezone

from logs_db import get_client, get_property_id

SOURCE_SCHEMA_VERSION = "physical_schema_v0.1"


def fetch_property(client, property_id):
    prop = (
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
    return {**prop, **settings}


def fetch_teams(client, property_id):
    return (
        client.table("teams")
        .select("team_key, display_name, dept_target, scope")
        .eq("property_id", property_id)
        .eq("active", True)
        .execute()
        .data
    )


def fetch_venues(client, property_id):
    venues = (
        client.table("venues")
        .select("*")
        .eq("property_id", property_id)
        .eq("active", True)
        .execute()
        .data
    )
    venue_ids = [v["id"] for v in venues]

    aliases_by_venue = {}
    descriptions_by_venue = {}
    if venue_ids:
        for row in (
            client.table("venue_aliases")
            .select("venue_id, alias, language")
            .in_("venue_id", venue_ids)
            .execute()
            .data
        ):
            aliases_by_venue.setdefault(row["venue_id"], []).append(
                {"alias": row["alias"], "language": row["language"]}
            )
        for row in (
            client.table("venue_descriptions")
            .select("venue_id, language, short_description, long_description")
            .in_("venue_id", venue_ids)
            .execute()
            .data
        ):
            descriptions_by_venue.setdefault(row["venue_id"], {})[row["language"]] = {
                "short_description": row["short_description"],
                "long_description": row["long_description"],
            }

    return [
        {
            "id": v["id"],
            "venue_key": v["venue_key"],
            "display_name": v["display_name"],
            "venue_type": v["venue_type"],
            "reservation_enabled": v["reservation_enabled"],
            "selectable": v["selectable"],
            "show_in_restaurant_list": v["show_in_restaurant_list"],
            "aliases": aliases_by_venue.get(v["id"], []),
            "descriptions": descriptions_by_venue.get(v["id"], {}),
        }
        for v in venues
    ]


def fetch_reservation_rules(client, property_id):
    rows = client.table("reservation_rules").select("*").eq("property_id", property_id).execute().data
    if not rows:
        return None
    r = rows[0]
    return {
        "large_party_threshold": r["large_party_threshold"],
        "arrival_buffer_minutes": r["arrival_buffer_minutes"],
        "typical_duration_minutes": r["typical_duration_minutes"],
        "required_fields": r["required_fields"],
        "policy": r["policy_json"],
    }


def fetch_menu_branches(client, property_id):
    branches = (
        client.table("menu_branches")
        .select("*")
        .eq("property_id", property_id)
        .eq("active", True)
        .order("display_order")
        .execute()
        .data
    )
    branch_ids = [b["id"] for b in branches]

    options_by_branch = {}
    aliases_by_branch = {}
    triggers_by_branch = {}
    if branch_ids:
        for o in (
            client.table("menu_options")
            .select("*")
            .in_("branch_id", branch_ids)
            .eq("active", True)
            .execute()
            .data
        ):
            options_by_branch.setdefault(o["branch_id"], []).append(o)
        for a in (
            client.table("menu_option_aliases")
            .select("branch_id, option_key, alias_text, language")
            .in_("branch_id", branch_ids)
            .execute()
            .data
        ):
            aliases_by_branch.setdefault(a["branch_id"], []).append(
                {"option_key": a["option_key"], "alias_text": a["alias_text"], "language": a["language"]}
            )
        for t in (
            client.table("menu_branch_triggers")
            .select("branch_id, trigger_text, language")
            .in_("branch_id", branch_ids)
            .execute()
            .data
        ):
            triggers_by_branch.setdefault(t["branch_id"], []).append(
                {"trigger_text": t["trigger_text"], "language": t["language"]}
            )

    result = {}
    for b in branches:
        options = [
            {
                "option_key": o["option_key"],
                "label_en": o["label_en"],
                "label_es": o["label_es"],
                "choice_number": o["choice_number"],
                "next_branch_key": o.get("next_branch_key"),
                "case_type": o.get("case_type"),
                "dept_target": o.get("dept_target"),
                "template_key": o.get("template_key"),
                "target_file": o.get("target_file"),
                "venue_id": o.get("venue_id"),
            }
            for o in options_by_branch.get(b["id"], [])
        ]
        result[b["branch_key"]] = {
            "parent_branch_key": b.get("parent_branch_key"),
            "display_order": b["display_order"],
            "options": options,
            "aliases": aliases_by_branch.get(b["id"], []),
            "list_triggers": triggers_by_branch.get(b["id"], []),
        }
    return result


def fetch_answer_boundaries(client, property_id):
    rows = (
        client.table("answer_boundaries")
        .select("boundary_type, topic, rule_text")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    result = {"may_answer_directly": [], "must_escalate": [], "safe_rules": []}
    for r in rows:
        if r["boundary_type"] == "may_answer_directly":
            result["may_answer_directly"].append(r["topic"])
        elif r["boundary_type"] == "must_escalate":
            result["must_escalate"].append(r["topic"])
        elif r["boundary_type"] == "safe_rule":
            result["safe_rules"].append(r["rule_text"])
    return result


def fetch_runtime_feature_flags(client, property_id):
    rows = (
        client.table("runtime_feature_flags")
        .select("flag_key, enabled, value_json")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    return {r["flag_key"]: (r["value_json"] if r["value_json"] is not None else r["enabled"]) for r in rows}


def fetch_response_templates(client, property_id):
    rows = (
        client.table("response_templates")
        .select("template_key, language, body, required_variables, channel")
        .eq("property_id", property_id)
        .eq("active", True)
        .eq("approval_status", "approved")
        .execute()
        .data
    )
    result = {}
    for r in rows:
        result.setdefault(r["language"], {})[r["template_key"]] = {
            "body": r["body"],
            "required_variables": r["required_variables"] or [],
            "channel": r["channel"],
        }
    return result


def next_version(client, property_id):
    rows = (
        client.table("runtime_packages")
        .select("runtime_package_version")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    versions = [int(r["runtime_package_version"]) for r in rows if str(r["runtime_package_version"]).isdigit()]
    return str(max(versions) + 1) if versions else "1"


def compile_package(client, property_id):
    return {
        "property": fetch_property(client, property_id),
        "teams": fetch_teams(client, property_id),
        "venues": fetch_venues(client, property_id),
        "reservation_rules": fetch_reservation_rules(client, property_id),
        "menu_branches": fetch_menu_branches(client, property_id),
        "answer_boundaries": fetch_answer_boundaries(client, property_id),
        "runtime_feature_flags": fetch_runtime_feature_flags(client, property_id),
        "response_templates": fetch_response_templates(client, property_id),
    }


def main():
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

    total_options = sum(len(b["options"]) for b in package_json["menu_branches"].values())
    print(f"Compiled runtime package v{version} for property {property_id}")
    print(f"  teams: {len(package_json['teams'])}")
    print(f"  venues: {len(package_json['venues'])}")
    print(f"  menu_branches: {len(package_json['menu_branches'])} ({total_options} options)")
    print(f"  response_templates languages: {list(package_json['response_templates'].keys())}")


if __name__ == "__main__":
    main()
