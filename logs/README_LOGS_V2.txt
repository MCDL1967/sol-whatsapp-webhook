═══════════════════════════════════════════════════════════════════════════
LOGS v2 — SOL Operational Case Management System
GranSolux / ICT Labs
═══════════════════════════════════════════════════════════════════════════

DOCTRINE
────────
  DB (SQLite)       = SOURCE OF TRUTH
  HTML ops panel    = PRIMARY OPERATING SURFACE
  Excel workbooks   = GENERATED OUTPUTS / REPORTING ARTIFACTS

The current temporary pipeline (webhook → Render → queue → Mac → Excel)
is NOT destroyed. LOGS v2 runs alongside it. Excel files become exports
from the DB, not the operating engine.


FILE TREE
─────────
  logs_v2/
  ├── logs_app.py            Flask application + all routes
  ├── logs_db.py             SQLite connection, schema init, DB path
  ├── logs_models.py         Field contract, routing rules, row mapper
  ├── logs_ingest.py         JSONL → SQLite ingestion command
  ├── logs_export.py         SQLite → Excel export command
  ├── logs_seed.py           Demo data loader
  ├── run.sh                 Local startup convenience script
  ├── requirements.txt
  ├── README_LOGS_V2.txt     (this file)
  │
  ├── templates/
  │   ├── base.html          Shared nav + layout
  │   ├── list.html          Case list (used by GM/FNB/SEC/ADM views)
  │   └── detail.html        Case detail + edit form
  │
  ├── static/
  │   └── logs.css           Single stylesheet
  │
  ├── middleware/
  │   └── LOGS/
  │       └── logs_v2_runtime/
  │           ├── logs.db            SQLite database (auto-created)
  │           └── export_snapshots/  Timestamped Excel backups
  │
  ├── GM/
  │   └── gm_consolidated_log_live.xlsx    (your existing file)
  ├── FNB/
  │   └── fnb_team_log_live.xlsx
  ├── SEC/
  │   └── sec_team_log_live.xlsx
  └── ADM/
      └── adm_team_log_live.xlsx


HOW TO RUN LOCALLY
──────────────────
Option A — run.sh (recommended first time):
  chmod +x run.sh
  ./run.sh

Option B — manual:
  python3 -m venv venv
  source venv/bin/activate          # Windows: venv\Scripts\activate
  pip install -r requirements.txt
  python3 logs_db.py                # initializes DB
  python3 logs_app.py               # starts Flask on 127.0.0.1:5050

Then open: http://127.0.0.1:5050

Load demo data (first run):
  Visit http://127.0.0.1:5050/seed
  OR run: python3 logs_seed.py


HTML VIEWS
──────────
  /          → redirects to /gm
  /gm        → GM dashboard — all cases, all depts, all filters
  /fnb       → FNB view — dining reservations only
  /sec       → SEC view — security / incidents only
  /adm       → ADM view — gaming / events / admin only
  /case/<id> → Case detail + edit form

Filters (all views):
  - Free text search: guest name, summary, record_id
  - Status dropdown
  - Dept target dropdown (GM view only)
  All filters via GET query params — shareable URLs.

Editable fields on detail page:
  - status
  - internal_resolution_status
  - customer_confirmation_status
  - closure_status
  - assigned_manager_or_queue
  - resolution_summary
  - operator_notes (never overwritten by ingest — UI only)


INGEST — JSONL → DB
────────────────────
Command:
  python3 logs_ingest.py path/to/queue.jsonl

Dry run (no writes):
  python3 logs_ingest.py path/to/queue.jsonl --dry-run

Rules:
  - Only processes: type == "upsert_operational_record"
  - Silently skips: append_middleware_event, update_client_message_status,
                    update_broadcast_status
  - Unknown types: logged to stdout, skipped
  - Uses INSERT OR REPLACE (upsert) — safe to run multiple times
  - operator_notes is NEVER overwritten by ingest
  - Each run is logged to the ingest_runs table

Typical workflow:
  1. Your existing middleware produces queue JSONL as usual
  2. After each operational batch, run: python3 logs_ingest.py queue.jsonl
  3. App immediately reflects new/updated cases


EXPORT — DB → EXCEL
────────────────────
Via command line:
  python3 logs_export.py gm
  python3 logs_export.py fnb
  python3 logs_export.py sec
  python3 logs_export.py adm
  python3 logs_export.py all

Via the ops panel:
  Nav bar → Export ▾ → choose view

Snapshot behavior:
  - Before overwriting any live Excel file, a timestamped copy is saved to:
    middleware/LOGS/logs_v2_runtime/export_snapshots/
  - Format: gm_consolidated_log_live_20260415_142233.xlsx
  - The snapshot directory accumulates backups — clean it up manually as needed.

Column contract:
  - GM export:  all fields in full
  - FNB export: guest + dining + lifecycle fields
  - SEC export: guest + incident + closure fields
  - ADM export: guest + request + lifecycle fields
  Column order is defined in logs_export.py VIEW_COLUMNS — adjust there
  if your live file column order differs.

IMPORTANT: If your existing live Excel files have complex formulas, pivot
tables, or conditional formatting on sheets OTHER than the main data sheet,
those sheets are preserved. The export only rewrites the first (data) sheet.


ROUTING DOCTRINE
────────────────
GM always receives every case.
dept_target determines the one department view:

  request_type           → dept_target
  ──────────────────────────────────────
  dining_reservation     → FNB
  food_beverage / fnb    → FNB
  security / theft /     → SEC
    incident / security_incident
  event_reservation      → ADM
  gaming_question / gaming → ADM
  general_info / admin /  → ADM
    guest_service_routing

If request_type doesn't match, section_team is used as fallback.
If neither matches, dept_target = NULL (GM only).

Routing logic lives in logs_models.py → ROUTING_RULES dict.
Add new mappings there as needed.


CASE LIFECYCLE
──────────────
status values:
  open → in_progress → pending_customer_confirmation → closed
                                                     → reopened → ...

Governance fields tracked:
  internal_resolution_status    (open / in_progress / under_review / resolved / escalated)
  customer_confirmation_status  (not_sent / sent / confirmed / disputed / no_response)
  closure_status                (open / pending / closed)
  issue_reopened                (YES / NO)
  final_closure_timestamp       (set manually in edit form or by future automation)


TIMEZONE
────────
All timestamp display and Panama-local logic uses America/Panama explicitly.
The host machine's system timezone is irrelevant.
Stored timestamps in DB are ISO8601 UTC strings (from the ingest source).


MIGRATION FROM CURRENT JSONL/EXCEL WORKFLOW
────────────────────────────────────────────
Phase 1 (current): Run both systems in parallel.
  - Keep existing pipeline running as-is.
  - Run logs_ingest.py against queue files to populate LOGS v2 DB.
  - Use the HTML panel for observation / operational decisions.
  - Export to Excel as needed for reporting.

Phase 2 (future): Make LOGS v2 the write path.
  - Update middleware to POST directly to LOGS v2's ingest endpoint.
  - Retire the population worker step.
  - Excel becomes export-only.

Phase 3 (future): Add webhook receiver endpoint to Flask app.
  - Accept queue events over HTTP.
  - Write directly to DB.
  - Keep export layer.


WHAT IS INTENTIONALLY OUT OF SCOPE (v1)
────────────────────────────────────────
  ✗ Multi-user auth / login
  ✗ Role-based access control
  ✗ Cloud deployment
  ✗ Background workers / file watchers
  ✗ WebSockets / live push
  ✗ Webhook receiver (ingest is CLI-only in this pass)
  ✗ Case creation via UI (ingest is the creation path)
  ✗ Audit log / change history per case
  ✗ Email / WhatsApp notifications from the panel
  ✗ Pagination (capped at 500 rows per view — add if needed)
  ✗ Multi-sheet Excel layouts (first sheet only is written)


KNOWN LIMITATIONS
─────────────────
1. No pagination. List views cap at 500 rows. Add LIMIT/OFFSET if needed.
2. Export rewrites the first sheet only. Other sheets in the live workbook
   are preserved but not touched.
3. If your live Excel column order differs from logs_export.py VIEW_COLUMNS,
   adjust VIEW_COLUMNS before first export.
4. operator_notes is never populated by ingest — UI only. This is intentional.
5. The /seed route loads demo data only if record_ids don't already exist
   (INSERT OR IGNORE). Safe to call multiple times.
6. No HTTPS. Localhost only. Do not expose without adding auth + TLS.
7. pytz is used for Panama timezone. Works on all platforms without system
   timezone dependency.


SUPPORT / CONTACT
─────────────────
  GranSolux / ICT Labs
  marcelo@gransolux.com
  +507.6257.4995

═══════════════════════════════════════════════════════════════════════════
