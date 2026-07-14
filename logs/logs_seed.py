"""
logs_seed.py
Loads plausible casino/hospitality demo cases directly into Supabase.
Run via: python logs_seed.py  OR  visit /seed in the running app.
See docs/db_planning/whatsapp_db_logs_adaptation_v0.1.md for the translation
mapping this file implements.
"""

from logs_db import get_client, get_property_id

SEED_MARKER = "[SEED] "

TEAMS = [
    {"team_key": "fnb_team", "dept_target": "FNB", "display_name": "FNB Service Team"},
    {"team_key": "sec_team", "dept_target": "SEC", "display_name": "Security Team"},
    {"team_key": "ops_team", "dept_target": "OPS", "display_name": "Guest Services / OPS"},
]

# Each record: guest identity, case shape, and exactly one of
# reservation/complaint/incident/service_request detail payloads.
SEED_CASES = [
    # FNB — dining reservations
    {
        "external_user_id": "seed-F-SEED0001",
        "guest_name": "María Rodríguez",
        "guest_phone": "6000-1111",
        "case_type": "reservation",
        "dept_target": "FNB",
        "status": "assigned",  # old: in_progress
        "priority": "normal",
        "summary": SEED_MARKER + "Anniversary dinner reservation, window table requested",
        "reservation_details": {
            "requested_date": "2026-04-16",
            "requested_time": "20:00",
            "party_size": 6,
            "special_requests": "Venue: Fenicia. Anniversary. Cake arranged.",
        },
    },
    {
        "external_user_id": "seed-F-SEED0002",
        "guest_name": "James Whitfield",
        "guest_phone": "6000-2222",
        "case_type": "reservation",
        "dept_target": "FNB",
        "status": "new",  # old: open
        "priority": "high",
        "summary": SEED_MARKER + "Same-day lunch reservation, VIP guest",
        "reservation_details": {
            "requested_date": "2026-04-15",
            "requested_time": "13:00",
            "party_size": 2,
            "special_requests": "Venue: La Brasserie. VIP — comp appetizer.",
        },
    },
    {
        "external_user_id": "seed-F-SEED0003",
        "guest_name": "Sun Li",
        "guest_phone": "6000-3333",
        "case_type": "reservation",
        "dept_target": "FNB",
        "status": "closed",
        "priority": "normal",
        "summary": SEED_MARKER + "Group dinner — completed successfully",
        "reservation_details": {
            "requested_date": "2026-04-13",
            "requested_time": "19:30",
            "party_size": 4,
            "special_requests": "Venue: Fenicia. Party seated, no issues.",
        },
    },
    # SEC — security / incidents
    {
        "external_user_id": "seed-S-SEED0001",
        "guest_name": None,
        "guest_phone": None,
        "case_type": "incident",
        "dept_target": "SEC",
        "status": "assigned",  # old: in_progress
        "priority": "high",
        "summary": SEED_MARKER + "Guest reported missing wallet near slot machines on Floor B",
        "incident_details": {
            "incident_category": "theft",
            "severity": "medium",
            "location_text": "Slot Floor B",
            "people_involved": "Unknown",
            "resolution_notes": "CCTV review requested for 02:30-02:45",
        },
    },
    {
        "external_user_id": "seed-S-SEED0002",
        "guest_name": "Roberto Salas",
        "guest_phone": "6000-4444",
        "case_type": "incident",
        "dept_target": "SEC",
        "status": "new",  # old: open
        "priority": "urgent",  # old urgency: critical
        "summary": SEED_MARKER + "Guest altercation at main entrance, security intervened",
        "incident_details": {
            "incident_category": "security",
            "severity": "high",
            "location_text": "Main Entrance",
            "people_involved": "Roberto Salas",
            "resolution_notes": "Police called. Guest escorted off premises.",
        },
    },
    {
        "external_user_id": "seed-S-SEED0003",
        "guest_name": "Carmen Vilez",
        "guest_phone": None,
        "case_type": "incident",
        "dept_target": "SEC",
        "status": "closed",
        "priority": "normal",
        "summary": SEED_MARKER + "Guest slipped near restroom. No injury. Area marked.",
        "incident_details": {
            "incident_category": "incident",
            "severity": "low",
            "location_text": "Restroom Area",
            "people_involved": "Carmen Vilez",
            "resolution_notes": "Area cleaned and marked. Report filed.",
        },
    },
    # OPS — gaming / events / admin
    {
        "external_user_id": "seed-A-SEED0001",
        "guest_name": "David Park",
        "guest_phone": "6000-5555",
        "case_type": "service_request",
        "dept_target": "OPS",
        "status": "assigned",  # old: in_progress
        "priority": "normal",
        "summary": SEED_MARKER + "Guest asking about poker tournament schedule and buy-in amounts",
        "service_request_details": {
            "service_request_type": "service_request_1",
            "service_area_label": "Gaming Floor",
        },
    },
    {
        "external_user_id": "seed-A-SEED0002",
        "guest_name": "Empresa XYZ S.A.",
        "guest_phone": "6000-6666",
        "case_type": "reservation",
        "dept_target": "OPS",
        "status": "assigned",  # old: in_progress
        "priority": "normal",
        "summary": SEED_MARKER + "Corporate event — product launch. AV, catering included.",
        "reservation_details": {
            "requested_date": "2026-04-25",
            "requested_time": "18:00",
            "party_size": 80,
            "special_requests": "Venue: Salón Cristal. Requires projector, podium, cocktail setup.",
        },
    },
    {
        "external_user_id": "seed-A-SEED0003",
        "guest_name": "Anónimo",
        "guest_phone": "6000-7777",
        "case_type": "service_request",
        "dept_target": "OPS",
        "status": "new",  # old: open
        "priority": "normal",
        "summary": SEED_MARKER + "Guest asking about parking validation and hotel check-in hours",
        "service_request_details": {
            "service_request_type": "service_request_2",
            "service_area_label": "Guest Services",
        },
    },
    {
        "external_user_id": "seed-A-SEED0004",
        "guest_name": "Patricia Molina",
        "guest_phone": "6000-8888",
        "case_type": "complaint",
        "dept_target": "OPS",
        "status": "open",  # old: reopened
        "priority": "high",
        "summary": SEED_MARKER + "Guest complaint: billing discrepancy on players card statement",
        "complaint_details": {
            "complaint_category": "billing",
            "resolution_notes": "Previously marked closed. Guest followed up disputing resolution.",
        },
    },
]

DETAIL_TABLES = [
    "reservation_details",
    "complaint_details",
    "incident_details",
    "service_request_details",
]


def _seed_teams(client, property_id: str) -> None:
    for team in TEAMS:
        client.table("teams").upsert(
            {**team, "property_id": property_id},
            on_conflict="property_id,team_key",
        ).execute()


def _clear_prior_seed(client, property_id: str) -> None:
    """Delete previously seeded cases (and their detail rows) for a clean re-seed."""
    existing = (
        client.table("cases")
        .select("id")
        .eq("property_id", property_id)
        .like("summary", f"{SEED_MARKER}%")
        .execute()
    )
    case_ids = [row["id"] for row in existing.data]
    if not case_ids:
        return

    for table in DETAIL_TABLES:
        client.table(table).delete().in_("case_id", case_ids).execute()

    client.table("cases").delete().in_("id", case_ids).execute()


def _upsert_guest_thread(client, property_id: str, tenant_id: str, external_user_id: str) -> str:
    res = (
        client.table("guest_threads")
        .upsert(
            {
                "tenant_id": tenant_id,
                "property_id": property_id,
                "external_user_id": external_user_id,
                "channel": "whatsapp",
            },
            on_conflict="property_id,channel,external_user_id",
        )
        .select("id")
        .execute()
    )
    return res.data[0]["id"]


def run_seed() -> int:
    client = get_client()
    property_id = get_property_id()

    tenant = client.table("properties").select("tenant_id").eq("id", property_id).single().execute()
    tenant_id = tenant.data["tenant_id"]

    _seed_teams(client, property_id)
    _clear_prior_seed(client, property_id)

    count = 0
    for record in SEED_CASES:
        guest_thread_id = _upsert_guest_thread(
            client, property_id, tenant_id, record["external_user_id"]
        )

        case_row = {
            "tenant_id": tenant_id,
            "property_id": property_id,
            "guest_thread_id": guest_thread_id,
            "case_type": record["case_type"],
            "dept_target": record["dept_target"],
            "status": record["status"],
            "priority": record["priority"],
            "guest_name": record["guest_name"],
            "guest_phone": record["guest_phone"],
            "source_channel": "whatsapp",
            "summary": record["summary"],
        }
        case_res = client.table("cases").insert(case_row).select("id").execute()
        case_id = case_res.data[0]["id"]

        for table in DETAIL_TABLES:
            key = table
            if key in record:
                client.table(table).insert({**record[key], "case_id": case_id}).execute()

        count += 1

    return count


if __name__ == "__main__":
    n = run_seed()
    print(f"[seed] {n} cases inserted (plus 3 teams upserted)")
