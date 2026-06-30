"""
logs_migrate_xls.py
One-time migration: existing live XLS workbooks → LOGS v2 SQLite DB.

Workbook structure discovered from real files:
  - Sheet: GM_Consolidated_Log
  - Row 0: merged title cell (ignored)
  - Row 1: actual column headers (all 42 canonical field names)
  - Rows 2+: data

Deduplication rule: INSERT OR IGNORE on record_id.
  Existing rows (seed or prior migration) are NOT overwritten.
  Use --overwrite to switch to INSERT OR REPLACE.

Usage:
    python3 logs_migrate_xls.py --inspect
    python3 logs_migrate_xls.py --dry-run
    python3 logs_migrate_xls.py
    python3 logs_migrate_xls.py --overwrite
"""

import argparse
import sys
from pathlib import Path
import openpyxl

sys.path.insert(0, str(Path(__file__).parent))
from logs_db import get_db, init_db
from logs_models import record_to_case_row, now_panama_iso

DATA_SHEET = "GM_Consolidated_Log"

# Source files — override with env vars if needed
import os as _os
_GDRIVE = Path("/Users/MCDL1/Library/CloudStorage/GoogleDrive-sol.concierge.ai@gmail.com/My Drive/SOL_DEMO_1/LOGS")

WORKBOOK_SOURCES = [
    ("gm",  Path(_os.environ.get("LOGS_PATH_GM",  str(_GDRIVE / "GM"  / "gm_consolidated_log_live.xlsx")))),
    ("fnb", Path(_os.environ.get("LOGS_PATH_FNB", str(_GDRIVE / "FNB" / "fnb_team_log_live.xlsx")))),
    ("sec", Path(_os.environ.get("LOGS_PATH_SEC", str(_GDRIVE / "SEC" / "sec_team_log_live.xlsx")))),
    ("adm", Path(_os.environ.get("LOGS_PATH_ADM", str(_GDRIVE / "ADM" / "adm_team_log_live.xlsx")))),
]


def _cell_str(val):
    """Clean cell value to string or None."""
    if val is None:
        return None
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%dT%H:%M:%S")
    s = str(val).strip()
    return s if s else None


def read_workbook(path: Path) -> tuple[list[str], list[dict]]:
    """
    Read GM_Consolidated_Log sheet.
    Returns (headers_list, list_of_row_dicts).
    Row 0 = merged title → skip.
    Row 1 = actual headers.
    Rows 2+ = data.
    """
    wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
    ws = wb[DATA_SHEET]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if len(rows) < 2:
        return [], []

    headers = [str(h).strip() if h is not None else None for h in rows[1]]
    records = []
    for row in rows[2:]:
        if not any(v is not None for v in row):
            continue
        rec = {}
        for i, h in enumerate(headers):
            if h and i < len(row):
                rec[h] = _cell_str(row[i])
        records.append(rec)
    return headers, records


def migrate_source(source_key: str, path: Path, conn,
                   dry_run: bool, overwrite: bool) -> dict:
    stats = {"source": source_key, "path": str(path),
             "rows_read": 0, "upserted": 0, "skipped": 0, "errors": 0}

    if not path.exists():
        print(f"  [{source_key.upper()}] ⚠ FILE NOT FOUND: {path}")
        stats["errors"] = -1
        return stats

    headers, records = read_workbook(path)
    stats["rows_read"] = len(records)

    insert_sql = "INSERT OR IGNORE" if not overwrite else "INSERT OR REPLACE"

    sql = f"""
        {insert_sql} INTO cases (
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
    """

    for rec in records:
        rid = rec.get("record_id")
        if not rid:
            print(f"  [{source_key.upper()}] skip row — no record_id: {rec.get('summary','?')[:40]}")
            stats["skipped"] += 1
            continue

        row = record_to_case_row(rec)

        if dry_run:
            dept = row.get("dept_target")
            print(f"  [DRY {source_key.upper()}] {rid:<18} | {str(rec.get('guest_name','—')):<22} | dept={dept}")
            stats["upserted"] += 1
            continue

        try:
            with conn:
                conn.execute(sql, row)
            stats["upserted"] += 1
        except Exception as e:
            print(f"  [{source_key.upper()}] ERROR {rid}: {e}")
            stats["errors"] += 1

    return stats


def inspect_all():
    for source_key, path in WORKBOOK_SOURCES:
        print(f"\n{'='*60}")
        print(f"  {source_key.upper()}: {path.name}")
        if not path.exists():
            print(f"  ⚠ NOT FOUND: {path}")
            continue
        headers, records = read_workbook(path)
        print(f"  Headers: {headers}")
        print(f"  Data rows: {len(records)}")
        for r in records[:2]:
            print(f"  Sample: {r}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect",   action="store_true", help="Print headers/samples only")
    parser.add_argument("--dry-run",   action="store_true", help="Parse + map, no DB writes")
    parser.add_argument("--overwrite", action="store_true", help="Use INSERT OR REPLACE (overwrites existing rows)")
    parser.add_argument("--source", choices=["gm","fnb","sec","adm","all"], default="all")
    args = parser.parse_args()

    if args.inspect:
        inspect_all()
        return

    init_db()
    conn = get_db()

    sources = WORKBOOK_SOURCES if args.source == "all" else [
        s for s in WORKBOOK_SOURCES if s[0] == args.source
    ]

    mode = "DRY-RUN" if args.dry_run else ("OVERWRITE" if args.overwrite else "INSERT OR IGNORE")
    print(f"\n[migrate] Mode: {mode}")

    total = {"rows_read": 0, "upserted": 0, "skipped": 0, "errors": 0}
    for source_key, path in sources:
        print(f"\n[migrate:{source_key.upper()}] {path}")
        stats = migrate_source(source_key, path, conn, args.dry_run, args.overwrite)
        for k in ("rows_read", "upserted", "skipped", "errors"):
            total[k] += stats.get(k, 0)
        print(f"  read={stats['rows_read']} upserted={stats['upserted']} skipped={stats['skipped']} errors={stats['errors']}")

    conn.close()
    print(f"\n[migrate] TOTAL: read={total['rows_read']} upserted={total['upserted']} skipped={total['skipped']} errors={total['errors']}")


if __name__ == "__main__":
    main()
