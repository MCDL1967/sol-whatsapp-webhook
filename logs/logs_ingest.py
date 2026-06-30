"""
logs_ingest.py
Ingests JSONL queue files into the LOGS v2 SQLite database.

Usage:
    python logs_ingest.py path/to/queue.jsonl
    python logs_ingest.py path/to/queue.jsonl --dry-run

Rules:
- Processes operational records where task_type == "upsert_operational_record"
  (or type == "upsert_operational_record" for backward compatibility)
- All other types are counted and skipped
- Uses INSERT OR REPLACE (upsert) so running twice is safe
- operator_notes field is NEVER overwritten by ingest (UI-only)

Patch marker:
- 2026-04-15 LOGS ingest compatibility + reconciliation fix
  - supports task_type
  - normalizes payload before row conversion
  - derives record_id when absent in live queue input
  - reconciles to existing clean IDs before upsert
  - removes prior raw-message-ID duplicates when a clean match exists
"""

import json
import argparse
from pathlib import Path

from logs_db import get_db, init_db
from logs_models import record_to_case_row

OPERATIONAL_TYPE = "upsert_operational_record"
KNOWN_NOISE_TYPES = {
    "append_middleware_event",
    "update_client_message_status",
    "update_broadcast_status",
}


def _norm(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _find_existing_clean_record_id(conn, row: dict) -> str | None:
    """
    Try to reconcile an incoming operational row against an existing case already
    loaded in SQLite.

    Matching key (exact timestamp + normalized text fields):
    - timestamp
    - section_team
    - request_type
    - summary
    - contact_phone
    - venue_or_department

    Ordering prefers non-wamid IDs so a clean existing ID wins over a prior
    accidental raw-message-ID row.
    """
    sql = """
        SELECT record_id
        FROM cases
        WHERE COALESCE(timestamp, '') = ?
          AND LOWER(COALESCE(section_team, '')) = LOWER(?)
          AND LOWER(COALESCE(request_type, '')) = LOWER(?)
          AND LOWER(COALESCE(summary, '')) = LOWER(?)
          AND COALESCE(contact_phone, '') = ?
          AND LOWER(COALESCE(venue_or_department, '')) = LOWER(?)
        ORDER BY
          CASE WHEN record_id LIKE 'wamid.%' THEN 1 ELSE 0 END,
          updated_at DESC,
          created_at DESC
        LIMIT 1
    """
    params = (
        _norm(row.get("timestamp")),
        _norm(row.get("section_team")),
        _norm(row.get("request_type")),
        _norm(row.get("summary")),
        _norm(row.get("contact_phone")),
        _norm(row.get("venue_or_department")),
    )
    hit = conn.execute(sql, params).fetchone()
    return hit["record_id"] if hit else None


def ingest(jsonl_path: str, dry_run: bool = False) -> dict:
    """
    Read a JSONL file and upsert operational records into the DB.
    Returns a summary dict.
    """
    path = Path(jsonl_path)
    if not path.exists():
        raise FileNotFoundError(f"JSONL file not found: {jsonl_path}")

    stats = {
        "source_file": str(path),
        "records_seen": 0,
        "records_upserted": 0,
        "records_skipped": 0,
        "errors": 0,
    }

    init_db()
    conn = get_db()

    upsert_sql = """
        INSERT INTO cases (
            record_id, timestamp, created_at, updated_at,
            category, section_team, request_type, workflow_stage,
            status, urgency, severity, complaint_category, request_category,
            routing_reason, dept_target,
            guest_name, contact_phone, contact_email, preferred_contact_method,
            location_section, venue_or_department,
            service_date, service_time, party_size,
            incident_type, summary, special_requests_or_notes,
            team_log_file, broadcast_channel, broadcast_status, client_message_status,
            follow_up_required, follow_up_type, assigned_manager_or_queue,
            internal_resolution_status, customer_confirmation_status, closure_status,
            issue_reopened, resolution_summary, resolved_by, resolution_timestamp,
            final_closure_timestamp, survey_sent_timestamp, survey_response_timestamp,
            customer_feedback_score
        ) VALUES (
            :record_id, :timestamp, datetime('now'), :updated_at,
            :category, :section_team, :request_type, :workflow_stage,
            :status, :urgency, :severity, :complaint_category, :request_category,
            :routing_reason, :dept_target,
            :guest_name, :contact_phone, :contact_email, :preferred_contact_method,
            :location_section, :venue_or_department,
            :service_date, :service_time, :party_size,
            :incident_type, :summary, :special_requests_or_notes,
            :team_log_file, :broadcast_channel, :broadcast_status, :client_message_status,
            :follow_up_required, :follow_up_type, :assigned_manager_or_queue,
            :internal_resolution_status, :customer_confirmation_status, :closure_status,
            :issue_reopened, :resolution_summary, :resolved_by, :resolution_timestamp,
            :final_closure_timestamp, :survey_sent_timestamp, :survey_response_timestamp,
            :customer_feedback_score
        )
        ON CONFLICT(record_id) DO UPDATE SET
            timestamp                    = excluded.timestamp,
            updated_at                   = excluded.updated_at,
            category                     = excluded.category,
            section_team                 = excluded.section_team,
            request_type                 = excluded.request_type,
            workflow_stage               = excluded.workflow_stage,
            status                       = excluded.status,
            urgency                      = excluded.urgency,
            severity                     = excluded.severity,
            complaint_category           = excluded.complaint_category,
            request_category             = excluded.request_category,
            routing_reason               = excluded.routing_reason,
            dept_target                  = excluded.dept_target,
            guest_name                   = excluded.guest_name,
            contact_phone                = excluded.contact_phone,
            contact_email                = excluded.contact_email,
            preferred_contact_method     = excluded.preferred_contact_method,
            location_section             = excluded.location_section,
            venue_or_department          = excluded.venue_or_department,
            service_date                 = excluded.service_date,
            service_time                 = excluded.service_time,
            party_size                   = excluded.party_size,
            incident_type                = excluded.incident_type,
            summary                      = excluded.summary,
            special_requests_or_notes    = excluded.special_requests_or_notes,
            team_log_file                = excluded.team_log_file,
            broadcast_channel            = excluded.broadcast_channel,
            broadcast_status             = excluded.broadcast_status,
            client_message_status        = excluded.client_message_status,
            follow_up_required           = excluded.follow_up_required,
            follow_up_type               = excluded.follow_up_type,
            assigned_manager_or_queue    = excluded.assigned_manager_or_queue,
            internal_resolution_status   = excluded.internal_resolution_status,
            customer_confirmation_status = excluded.customer_confirmation_status,
            closure_status               = excluded.closure_status,
            issue_reopened               = excluded.issue_reopened,
            resolution_summary           = excluded.resolution_summary,
            resolved_by                  = excluded.resolved_by,
            resolution_timestamp         = excluded.resolution_timestamp,
            final_closure_timestamp      = excluded.final_closure_timestamp,
            survey_sent_timestamp        = excluded.survey_sent_timestamp,
            survey_response_timestamp    = excluded.survey_response_timestamp,
            customer_feedback_score      = excluded.customer_feedback_score
            -- operator_notes intentionally excluded: never overwritten by ingest
    """

    with open(path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            stats["records_seen"] += 1

            try:
                record = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"  [WARN] Line {line_num}: invalid JSON — {e}")
                stats["errors"] += 1
                continue

            event_type = record.get("task_type") or record.get("type", "")

            if event_type != OPERATIONAL_TYPE:
                if event_type not in KNOWN_NOISE_TYPES:
                    print(f"  [INFO] Line {line_num}: unknown type '{event_type}', skipping")
                stats["records_skipped"] += 1
                continue

            source = dict(record.get("payload") or record)

            if not source.get("record_id"):
                if source.get("source_message_id"):
                    source["record_id"] = source["source_message_id"]
                elif source.get("session_id") and source.get("timestamp"):
                    source["record_id"] = f"{source['session_id']}::{source['timestamp']}"

            row = record_to_case_row(source)

            if not row.get("record_id"):
                print(f"  [WARN] Line {line_num}: missing record_id after normalization, skipping")
                stats["errors"] += 1
                continue

            existing_clean_id = _find_existing_clean_record_id(conn, row)
            duplicate_raw_id = None

            if existing_clean_id and existing_clean_id != row["record_id"]:
                if str(row["record_id"]).startswith("wamid."):
                    duplicate_raw_id = row["record_id"]
                row["record_id"] = existing_clean_id

            if dry_run:
                tag = " | reconciled" if existing_clean_id else ""
                print(
                    f"  [DRY-RUN] Would upsert: "
                    f"{row['record_id']} | {row.get('guest_name')} | {row.get('dept_target')}{tag}"
                )
                stats["records_upserted"] += 1
                continue

            try:
                with conn:
                    conn.execute(upsert_sql, row)
                    if duplicate_raw_id:
                        conn.execute(
                            "DELETE FROM cases WHERE record_id = ?",
                            (duplicate_raw_id,),
                        )
                stats["records_upserted"] += 1
            except Exception as e:
                print(f"  [ERROR] Line {line_num}: DB error — {e}")
                stats["errors"] += 1

    if not dry_run:
        try:
            with conn:
                conn.execute("""
                    INSERT INTO ingest_runs (source_file, records_seen, records_upserted, records_skipped, errors)
                    VALUES (:source_file, :records_seen, :records_upserted, :records_skipped, :errors)
                """, stats)
        except Exception:
            pass

    conn.close()
    return stats


def main():
    parser = argparse.ArgumentParser(description="Ingest JSONL queue into LOGS v2 DB")
    parser.add_argument("jsonl_file", help="Path to the JSONL queue file")
    parser.add_argument("--dry-run", action="store_true", help="Parse and show without writing to DB")
    args = parser.parse_args()

    print(f"\n[logs_ingest] Starting ingest: {args.jsonl_file}")
    if args.dry_run:
        print("[logs_ingest] DRY-RUN MODE — no writes to DB")

    stats = ingest(args.jsonl_file, dry_run=args.dry_run)

    print(f"\n[logs_ingest] Done.")
    print(f"  Seen:     {stats['records_seen']}")
    print(f"  Upserted: {stats['records_upserted']}")
    print(f"  Skipped:  {stats['records_skipped']}")
    print(f"  Errors:   {stats['errors']}")


if __name__ == "__main__":
    main()