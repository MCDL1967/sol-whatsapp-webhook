"""
logs_models.py
Field contract, routing rules, and case helpers for LOGS v2.
"""

from datetime import datetime
import pytz

PANAMA_TZ = pytz.timezone("America/Panama")

# ── Routing doctrine ─────────────────────────────────────────────────────────
# GM always receives every case.
# dept_target = the one department that also receives the case.

ROUTING_RULES = {
    # request_type → dept_target
    # --- canonical ingest values ---
    "dining_reservation":           "FNB",
    "food_beverage":                "FNB",
    "fnb":                          "FNB",
    "reservation":                  "FNB",
    "restaurant_reservation":       "FNB",

    "security":                     "SEC",
    "theft":                        "SEC",
    "incident":                     "SEC",
    "security_incident":            "SEC",
    "theft_report":                 "SEC",

    "event_reservation":            "OPS",
    "gaming_question":              "OPS",
    "gaming_information":           "OPS",
    "gaming":                       "OPS",
    "general_info":                 "OPS",
    "admin":                        "OPS",
    "admin_request":                "OPS",
    "guest_service_routing":        "OPS",
    "general":                      "OPS",
    "general_operational_request":  "OPS",
    "player_request":               "OPS",
    "guest_complaint":              "OPS",
    "complaint":                    "OPS",
    "triage_request":               "OPS",
    "fallback_/_triage_routing":    "OPS",
    "unclassified":                 "OPS",
}

# section_team → dept_target (fallback when request_type doesn't match)
# Covers real workbook values observed in live data
SECTION_TEAM_ROUTING = {
    # canonical
    "FNB": "FNB",
    "SEC": "SEC",
    "OPS": "OPS",
    "GM":  None,
    # real workbook values
    "F&B":             "FNB",
    "Food & Beverage": "FNB",
    "Security":        "SEC",
    "Guest Relations": "OPS",
    "Guest Services":  "OPS",
    "Players Desk":    "OPS",
    "Player Desk":     "OPS",
    "Triage":          "OPS",
    "Admin":           "OPS",
    "Complaint":       "OPS",
    "Housekeeping":    "OPS",
}

# Matches the live Supabase `case_status` check constraint exactly — the LOGS
# dashboard edit form must never offer a value Postgres would reject.
VALID_STATUSES = [
    "new",
    "open",
    "assigned",
    "waiting_guest",
    "waiting_staff",
    "resolved",
    "closed",
    "cancelled",
]

VALID_DEPTS = ["FNB", "SEC", "OPS"]


def resolve_dept_target(record: dict) -> str | None:
    """
    Determine dept_target from request_type or section_team.
    Returns 'FNB' | 'SEC' | 'OPS' | None.
    request_type is normalized (lower, spaces→underscores) before lookup.
    section_team is matched as-is against SECTION_TEAM_ROUTING.
    """
    rt_raw = (record.get("request_type") or "")
    rt = rt_raw.lower().strip().replace(" ", "_")
    st = (record.get("section_team") or "").strip()

    # request_type wins if matched
    if rt in ROUTING_RULES:
        return ROUTING_RULES[rt]

    # fall back to section_team exact match
    if st in SECTION_TEAM_ROUTING:
        return SECTION_TEAM_ROUTING[st]

    # fall back to section_team normalized
    st_norm = st.lower().replace(" ", "_").replace("&", "and")
    for k, v in SECTION_TEAM_ROUTING.items():
        if k.lower().replace(" ", "_").replace("&", "and") == st_norm:
            return v

    return None


def now_panama_iso() -> str:
    """Return current Panama-local time as ISO string."""
    return datetime.now(PANAMA_TZ).strftime("%Y-%m-%dT%H:%M:%S")


def record_to_case_row(record: dict) -> dict:
    """
    Map a raw JSONL upsert_operational_record dict to the cases table row dict.
    Adds dept_target via routing rules.
    """
    dept = resolve_dept_target(record)

    return {
        "record_id":                    record.get("record_id"),
        "timestamp":                    record.get("timestamp"),
        "category":                     record.get("category"),
        "section_team":                 record.get("section_team"),
        "request_type":                 record.get("request_type"),
        "workflow_stage":               record.get("workflow_stage"),
        "status":                       record.get("status", "open"),
        "urgency":                      record.get("urgency", "normal"),
        "severity":                     record.get("severity"),
        "complaint_category":           record.get("complaint_category"),
        "request_category":             record.get("request_category"),
        "routing_reason":               record.get("routing_reason"),
        "dept_target":                  dept,
        "guest_name":                   record.get("guest_name"),
        "contact_phone":                record.get("contact_phone"),
        "contact_email":                record.get("contact_email"),
        "preferred_contact_method":     record.get("preferred_contact_method"),
        "location_section":             record.get("location_section"),
        "venue_or_department":          record.get("venue_or_department"),
        "service_date":                 record.get("service_date"),
        "service_time":                 record.get("service_time"),
        "party_size":                   record.get("party_size"),
        "incident_type":                record.get("incident_type"),
        "summary":                      record.get("summary"),
        "special_requests_or_notes":    record.get("special_requests_or_notes"),
        "team_log_file":                record.get("team_log_file"),
        "broadcast_channel":            record.get("broadcast_channel"),
        "broadcast_status":             record.get("broadcast_status"),
        "client_message_status":        record.get("client_message_status"),
        "follow_up_required":           record.get("follow_up_required"),
        "follow_up_type":               record.get("follow_up_type"),
        "assigned_manager_or_queue":    record.get("assigned_manager_or_queue"),
        "internal_resolution_status":   record.get("internal_resolution_status", "open"),
        "customer_confirmation_status": record.get("customer_confirmation_status", "not_sent"),
        "closure_status":               record.get("closure_status", "open"),
        "issue_reopened":               record.get("issue_reopened", "NO"),
        "resolution_summary":           record.get("resolution_summary"),
        "resolved_by":                  record.get("resolved_by"),
        "resolution_timestamp":         record.get("resolution_timestamp"),
        "final_closure_timestamp":      record.get("final_closure_timestamp"),
        "survey_sent_timestamp":        record.get("survey_sent_timestamp"),
        "survey_response_timestamp":    record.get("survey_response_timestamp"),
        "customer_feedback_score":      record.get("customer_feedback_score"),
        "operator_notes":               None,   # UI-only field, never overwritten by ingest
        "updated_at":                   now_panama_iso(),
    }


# Editable fields exposed in the case detail UI (cases table columns only).
#
# FUTURE UI EXPANSION FLAG: the legacy SQLite schema also had
# internal_resolution_status, customer_confirmation_status, closure_status,
# resolution_summary, and assigned_manager_or_queue as editable fields. None
# of these have an equivalent column in the live Supabase schema today (see
# docs/db_planning/old_planning_docs/whatsapp_db_logs_adaptation_v0.1.md, decision #6) —
# status/priority/assigned_team_id/operator_notes are believed to cover the
# same ground for now. If a real need for finer-grained resolution/confirmation
# tracking comes up later, revisit adding those as new cases columns (or a
# case_status_history table) rather than reintroducing the old free-text
# fields as-is.
EDITABLE_FIELDS = [
    "status",
    "priority",
    "assigned_team_id",
    "operator_notes",
]
