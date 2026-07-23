"""
seed_kb_from_demo_package.py
One-off migration: transforms property_packages/demo/*.json into the
corresponding Supabase config tables, per the mapping in
docs/db_planning/Demo_Data_to_Schema_Mapping_v0.3.md and the decisions
recorded in docs/db_planning/DB_Construction_Decisions_v0.1.md and
docs/db_planning/Webhook_Tenant_Mockup_Unification_v0.1.md.

Does not touch webhook.js or the runtime_packages table — this only
populates config tables that nothing reads yet.

Run via: cd logs && source venv/bin/activate && python seed_kb_from_demo_package.py
Safe to re-run: tables without a real non-nullable unique key are cleared
and re-inserted per scope (venue/branch/property) rather than upserted,
since Postgres unique constraints treat NULL language columns as distinct
from each other.
"""

import json
import re
from pathlib import Path

from logs_db import get_client, get_property_id

PKG_DIR = Path(__file__).parent.parent / "property_packages" / "demo"

# Deeper menu transitions that fast_path_responder.js hardcodes in JS
# rather than encoding in menu_dictionary.json's next_context field.
# See docs/db_planning/Webhook_Tenant_Mockup_Unification_v0.1.md.
BRANCH_PARENTS = {
    "main_menu": None,
    "restaurants_menu": "main_menu",
    "loyalty_rewards_menu": "main_menu",
    "shows_events_menu": "main_menu",
    "casino_gaming_menu": "main_menu",
    "general_information_menu": "main_menu",
    "complaints_menu": "main_menu",
    "restaurant_followup_menu": "restaurants_menu",
    "loyalty_program_info_menu": "loyalty_rewards_menu",
    "loyalty_points_rewards_menu": "loyalty_rewards_menu",
}

PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")


def load_json(name):
    return json.loads((PKG_DIR / name).read_text())


def update_teams(client, master):
    prop = master["property"]
    routing = master["dining"]["escalation_routing"]
    updates = [
        ("ops_team", prop["team_name_1"], routing.get("team_name_1_scope")),
        ("fnb_team", prop["team_name_2"], routing.get("team_name_2_scope")),
        # team_name_3 ("Security") has no scope text anywhere in the source
        # data - flagged, not invented. Left null.
        ("sec_team", prop["team_name_3"], None),
    ]
    for team_key, display_name, scope in updates:
        client.table("teams").update(
            {"display_name": display_name, "scope": scope}
        ).eq("team_key", team_key).execute()
    print(f"teams: updated {len(updates)} rows")


def seed_property_settings(client, property_id, config):
    default_language = (config.get("language_default") or "en").lower()
    client.table("property_settings").upsert(
        {
            "property_id": property_id,
            "concierge_name": "SOL",
            "default_language": default_language,
            "supported_languages": ["en", "es"],
        },
        on_conflict="property_id",
    ).execute()
    print("property_settings: upserted 1 row")


def seed_reservation_rules(client, property_id, master):
    facts = master["dining"]["reservation_facts"]
    client.table("reservation_rules").upsert(
        {
            "property_id": property_id,
            "large_party_threshold": facts["advance_reservations_recommended_for_groups_over"],
            "arrival_buffer_minutes": facts["recommended_arrival_minutes_before_reservation"],
            "typical_duration_minutes": facts["typical_dining_duration_minutes"],
            "required_fields": facts["required_new_reservation_fields"],
            "policy_json": {
                "dinner_reservations_recommended": facts["dinner_reservations_recommended"],
                "walk_ins_based_on_availability": facts["walk_ins_based_on_availability"],
                "vip_group_required_fields": facts["vip_group_required_fields"],
            },
        },
        on_conflict="property_id",
    ).execute()
    print("reservation_rules: upserted 1 row")


def fetch_venue_ids(client, property_id):
    rows = (
        client.table("venues")
        .select("id, venue_key")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    return {r["venue_key"]: r["id"] for r in rows}


def seed_venue_aliases(client, master, venue_id_by_key):
    venue_ids = list(venue_id_by_key.values())
    if venue_ids:
        client.table("venue_aliases").delete().in_("venue_id", venue_ids).execute()

    rows = []
    for v in master["dining"]["venues"]:
        venue_id = venue_id_by_key.get(v["menu_key"])
        if not venue_id:
            continue  # Room Service - not a venue, see DB_Construction_Decisions_v0.1.md
        for alias in v.get("aliases", []):
            rows.append({"venue_id": venue_id, "alias": alias, "language": None})
    if rows:
        client.table("venue_aliases").insert(rows).execute()
    print(f"venue_aliases: replaced with {len(rows)} rows")


def seed_venue_descriptions(client, master, venue_id_by_key):
    rows = []
    for v in master["dining"]["venues"]:
        venue_id = venue_id_by_key.get(v["menu_key"])
        if not venue_id:
            continue
        if v.get("short_description_en"):
            rows.append({"venue_id": venue_id, "language": "en", "short_description": v["short_description_en"]})
        if v.get("short_description_es"):
            rows.append({"venue_id": venue_id, "language": "es", "short_description": v["short_description_es"]})
    if rows:
        client.table("venue_descriptions").upsert(rows, on_conflict="venue_id,language").execute()
    print(f"venue_descriptions: upserted {len(rows)} rows")


def seed_menu_branches(client, property_id, menu_dict):
    branches = menu_dict["menus"]
    rows = []
    for i, branch_key in enumerate(branches.keys()):
        rows.append(
            {
                "property_id": property_id,
                "branch_key": branch_key,
                "parent_branch_key": BRANCH_PARENTS.get(branch_key),
                "display_order": i,
                "active": True,
            }
        )
    client.table("menu_branches").upsert(rows, on_conflict="property_id,branch_key").execute()
    print(f"menu_branches: upserted {len(rows)} rows")

    fetched = (
        client.table("menu_branches")
        .select("id, branch_key")
        .eq("property_id", property_id)
        .execute()
        .data
    )
    return {r["branch_key"]: r["id"] for r in fetched}


def next_branch_for(branch_key, option_key, option_data):
    if branch_key == "restaurants_menu":
        return "restaurant_followup_menu"
    if branch_key == "loyalty_rewards_menu" and option_key == "program_info":
        return "loyalty_program_info_menu"
    if branch_key == "loyalty_rewards_menu" and option_key == "rewards_points_info":
        return "loyalty_points_rewards_menu"
    return option_data.get("next_context")


def seed_menu_options(client, menu_dict, branch_id_by_key):
    rows = []
    for branch_key, branch in menu_dict["menus"].items():
        branch_id = branch_id_by_key[branch_key]
        for option_key, option_data in branch.get("options", {}).items():
            rows.append(
                {
                    "branch_id": branch_id,
                    "option_key": option_key,
                    "label_en": option_data.get("label_en"),
                    "label_es": option_data.get("label_es"),
                    "choice_number": option_data.get("number"),
                    "next_branch_key": next_branch_for(branch_key, option_key, option_data),
                    "target_file": option_data.get("target_file"),
                    "active": True,
                }
            )
    client.table("menu_options").upsert(rows, on_conflict="branch_id,option_key").execute()
    print(f"menu_options: upserted {len(rows)} rows")


def seed_menu_option_aliases(client, menu_dict, branch_id_by_key):
    total = 0
    for branch_key, branch in menu_dict["menus"].items():
        branch_id = branch_id_by_key[branch_key]
        options = branch.get("options", {})
        alias_map = {}

        for alias_text, option_key in (branch.get("lookup") or {}).items():
            alias_map[alias_text] = option_key

        number_to_option = {
            str(opt["number"]): key for key, opt in options.items() if "number" in opt
        }
        for choice_number, aliases in (branch.get("choice_aliases") or {}).items():
            target_option = number_to_option.get(str(choice_number))
            if not target_option:
                continue
            for alias_text in aliases:
                alias_map.setdefault(alias_text, target_option)

        client.table("menu_option_aliases").delete().eq("branch_id", branch_id).execute()

        rows = [
            {"branch_id": branch_id, "option_key": option_key, "alias_text": alias_text, "language": None}
            for alias_text, option_key in alias_map.items()
        ]
        if rows:
            client.table("menu_option_aliases").insert(rows).execute()
        total += len(rows)
    print(f"menu_option_aliases: replaced with {total} rows")


def seed_menu_branch_triggers(client, menu_dict, branch_id_by_key):
    total = 0
    for branch_key, branch in menu_dict["menus"].items():
        list_triggers = branch.get("list_triggers")
        branch_id = branch_id_by_key[branch_key]
        client.table("menu_branch_triggers").delete().eq("branch_id", branch_id).execute()
        if not list_triggers:
            continue
        rows = []
        for lang, phrases in list_triggers.items():
            for phrase in phrases:
                rows.append({"branch_id": branch_id, "trigger_text": phrase, "language": lang})
        if rows:
            client.table("menu_branch_triggers").insert(rows).execute()
        total += len(rows)
    print(f"menu_branch_triggers: replaced with {total} rows")


def seed_answer_boundaries(client, property_id, master):
    dining = master["dining"]
    client.table("answer_boundaries").delete().eq("property_id", property_id).execute()

    rows = []
    for topic in dining.get("sol_may_answer_directly", []):
        rows.append({"property_id": property_id, "boundary_type": "may_answer_directly", "topic": topic, "rule_text": None})
    for topic in dining.get("sol_must_escalate", []):
        rows.append({"property_id": property_id, "boundary_type": "must_escalate", "topic": topic, "rule_text": None})
    safe_rule = dining.get("hours_boundary", {}).get("guest_safe_rule")
    if safe_rule:
        rows.append({"property_id": property_id, "boundary_type": "safe_rule", "topic": None, "rule_text": safe_rule})

    if rows:
        client.table("answer_boundaries").insert(rows).execute()
    print(f"answer_boundaries: replaced with {len(rows)} rows")


def seed_runtime_feature_flags(client, property_id, master):
    hours_boundary = master["dining"]["hours_boundary"]
    rows = [
        {
            "property_id": property_id,
            "flag_key": "room_service_available_24_hours",
            "enabled": bool(hours_boundary.get("room_service_available_24_hours")),
        },
        {
            "property_id": property_id,
            "flag_key": "venue_specific_hours_configured",
            "enabled": bool(hours_boundary.get("venue_specific_hours_configured")),
        },
    ]
    client.table("runtime_feature_flags").upsert(rows, on_conflict="property_id,flag_key").execute()
    print(f"runtime_feature_flags: upserted {len(rows)} rows")


def seed_response_templates(client, property_id, templates_en, templates_es):
    rows = []
    for lang, templates in (("en", templates_en), ("es", templates_es)):
        for key, body in templates.items():
            template_key = key[: -len(f"_{lang}")] if key.endswith(f"_{lang}") else key
            required_vars = sorted(set(PLACEHOLDER_RE.findall(body)))
            rows.append(
                {
                    "property_id": property_id,
                    "template_key": template_key,
                    "language": lang,
                    "body": body,
                    "required_variables": required_vars or None,
                    "channel": "text",
                    "approval_status": "approved",
                    "active": True,
                }
            )
    client.table("response_templates").upsert(rows, on_conflict="property_id,template_key,language").execute()
    print(f"response_templates: upserted {len(rows)} rows")


def main():
    client = get_client()
    property_id = get_property_id()

    config = load_json("property_config.json")
    master = load_json("property_master_data.json")
    menu_dict = load_json("menu_dictionary.json")
    templates_en = load_json("response_templates_en.json")
    templates_es = load_json("response_templates_es.json")

    update_teams(client, master)
    seed_property_settings(client, property_id, config)
    seed_reservation_rules(client, property_id, master)

    venue_id_by_key = fetch_venue_ids(client, property_id)
    seed_venue_aliases(client, master, venue_id_by_key)
    seed_venue_descriptions(client, master, venue_id_by_key)

    branch_id_by_key = seed_menu_branches(client, property_id, menu_dict)
    seed_menu_options(client, menu_dict, branch_id_by_key)
    seed_menu_option_aliases(client, menu_dict, branch_id_by_key)
    seed_menu_branch_triggers(client, menu_dict, branch_id_by_key)

    seed_answer_boundaries(client, property_id, master)
    seed_runtime_feature_flags(client, property_id, master)
    seed_response_templates(client, property_id, templates_en, templates_es)

    print("Done.")


if __name__ == "__main__":
    main()
