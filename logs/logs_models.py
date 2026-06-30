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

    "event_reservation":            "ADM",
    "gaming_question":              "ADM",
    "gaming_information":           "ADM",
    "gaming":                       "ADM",
    "general_info":                 "ADM",
    "admin":                        "ADM",
    "admin_request":                "ADM",
    "guest_service_routing":        "ADM",
    "general":                      "ADM",
    "general_operational_request":  "ADM",
    "player_request":               "ADM",
    "guest_complaint":              "ADM",
    "complaint":                    "ADM",
    "triage_request":               "ADM",
    "fallback_/_triage_routing":    "ADM",
    "unclassified":                 "ADM",
}

# section_team → dept_target (fallback when request_type doesn't match)
# Covers real workbook values observed in live data
SECTION_TEAM_ROUTING = {
    # canonical
    "FNB": "FNB",
    "SEC": "SEC",
    "ADM": "ADM",
    "GM":  None,
    # real workbook values
    "F&B":             "FNB",
    "Food & Beverage": "FNB",
    "Security":        "SEC",
    "Guest Relations": "ADM",
    "Guest Services":  "ADM",
    "Players Desk":    "ADM",
    "Player Desk":     "ADM",
    "Triage":          "ADM",
    "Admin":           "ADM",
    "Complaint":       "ADM",
    "Housekeeping":    "ADM",
}

VALID_STATUSES = [
    "open",
    "in_progress",
    "tentative",
    "pending_customer_confirmation",
    "pending_review",
    "confirmed",
    "closed",
    "reopened",
]

VALID_DEPTS = ["FNB", "SEC", "ADM"]


def resolve_dept_target(record: dict) -> str | None:
    """
    Determine dept_target from request_type or section_team.
    Returns 'FNB' | 'SEC' | 'ADM' | None.
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


# Editable fields exposed in the case detail UI
EDITABLE_FIELDS = [
    "status",
    "internal_resolution_status",
    "customer_confirmation_status",
    "closure_status",
    "resolution_summary",
    "assigned_manager_or_queue",
    "operator_notes",
]
