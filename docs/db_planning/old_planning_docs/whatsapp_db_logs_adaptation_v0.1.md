# WhatsApp DB → LOGS Adaptation v0.1

Status: decisions for connecting the LOGS staff dashboard directly to Supabase — every item below was reviewed and confirmed individually, not batch-approved
Date: 2026-07-13
Source: `Physical_Schema_v0.1.md`, `DB_Construction_Decisions_v0.1.md`, `Database_Map_v0.1.md`, `Tenant_Management_Future_Considerations_v0.1.md`, live inspection of `logs/`, `webhook.js`, `logs_workbook.js`, `logs_service.js`

## Purpose

The webhook now writes reservations straight into Supabase (`cases`/`reservation_details`), proven live in production this session. The LOGS staff dashboard (`logs/logs_app.py`) still reads a local SQLite file (`logs/logs_v2_runtime/logs.db`) that's only ever populated by dev seed data or a manual JSONL-ingest step — a completely disconnected pipeline. This document records why, and every decision made to fix it, in the same style as `Physical_Schema_v0.1.md`/`DB_Construction_Decisions_v0.1.md`.

## Root Cause

LOGS reads a local SQLite file with no connection to Supabase. Two independent webhook write paths exist:
1. `runLogsHook("captureRequestClosure", ...)` → `logs_service.js` → `logs_workbook.js: enqueueTask()` → appends a JSON line to a file at `LOGS_TASK_QUEUE_FILE`, an env var that is **not defined anywhere in this repo** (no `.env`, no `render.yaml`, no default) — it can only be a Render dashboard environment variable, unconfirmed whether it was ever actually set. When unset, `enqueueTask()` silently returns `{status: "skipped"}` with no error logged — this pipeline may never have run end-to-end.
2. `writeReservationCase(...)` → direct Supabase write (earlier this session) — confirmed working via live test.

Even when path 1 works, the JSONL file lands on Render's own (ephemeral) filesystem, not the local Mac running LOGS — `webhook.js` exposes `/logs/tasks/status`/`/logs/tasks/export`/`/logs/tasks/clear` specifically so someone can manually pull it down, then run `logs_ingest.py` locally. Nobody ran this for the test reservation made this session, and there was no automated bridge from Supabase into LOGS at all.

## Resolved Decisions

Each row below was confirmed individually with the repo owner, not approved as a bundle.

| # | Item | Decision |
|---|---|---|
| 1 | Integration approach | LOGS reads/writes Supabase directly via `supabase-py`, no ingestion script, no sync job — matches the shared-backend architecture implied by `Physical_Schema_v0.1.md`'s Roles And Access table (webhook / Property Admin / SOL Admin / LOGS all against one schema, differentiated by role later). Explicitly rejected: a sync/ingest job pulling Supabase → local SQLite (adds a failure point the repo owner explicitly wants to avoid). |
| 2 | `cases.operator_notes` | New nullable `text` column via migration. Rejected reusing `summary` (webhook-owned, different lifecycle/authorship). Rejected a JSONB catch-all (speculative, single-use). Matches the existing pattern of `complaint_details.resolution_notes`/`incident_details.resolution_notes`. |
| 3 | `teams` seed | Seed 3 rows for the demo property: `fnb_team`/FNB, `sec_team`/SEC, `ops_team`/OPS. Matches `Physical_Schema_v0.1.md`'s own Seed Anchors ordering, which lists teams as a prerequisite before cases. |
| 4 | Python↔Supabase library | `supabase-py` (PostgREST client), not `psycopg`/raw SQL. Same credential shape as `supabase_bridge/supabase_client.js`, one secret type across both services, synchronous by default (fits Flask). Confirmed installable (2.31.0) for the LOGS venv's Python 3.12. |
| 5 | Credential/RLS posture | LOGS uses the same `service_role` key as the webhook — interim, mirrors the already-accepted webhook precedent. Two services now share one super-privileged credential. LOGS-specific role scoping stays deferred until LOGS has real Supabase Auth users — unchanged from the existing documented stance in `Physical_Schema_v0.1.md`'s Roles And Access table. |
| 6 | Legacy LOGS lifecycle/survey fields (`workflow_stage`, `broadcast_channel`/`broadcast_status`, `client_message_status`, `follow_up_required`/`follow_up_type`, `internal_resolution_status`, `customer_confirmation_status`, `closure_status`, `issue_reopened`, `resolution_summary`/`resolved_by`/`resolution_timestamp`/`final_closure_timestamp`, `survey_sent_timestamp`/`survey_response_timestamp`/`customer_feedback_score`) | Dropped from the LOGS dashboard UI entirely. Confirmed via full read of `Database_Map_v0.1.md` and `Runtime_Config_Contract_v0.3.md`: none of these concepts are modeled anywhere in the accepted schema — genuinely unbuilt territory. Nothing in the current tenant-config → webhook-case → LOGS-review workflow needs delivery-status or survey tracking yet. Revisit only if a real requirement emerges (e.g. confirming a WhatsApp reply actually reached the guest). |
| 7 | Excel/Drive export (`logs_export.py`) | Stubbed, not rewritten, in this pass. Its ~30 legacy columns don't map to the new schema, and rewriting them around 4 different case_type-specific detail tables is real, separate scope. `trigger_export` becomes a stub that flashes "temporarily unavailable" and redirects. `logs_export.py`/`logs_migrate_xls.py`/`logs_ingest.py` are left completely untouched on disk — but `logs_app.py`'s top-level `from logs_export import export_view` import is removed, because `logs_export.py` imports `logs_db.get_db`/`init_db`, and dropping SQLite from `logs_db.py` without breaking that import chain would crash the entire app at boot (`ImportError`), not just the `/export` route. |
| 8 | Env var delivery | `python-dotenv` + a `logs/.env` file (already covered by the repo's root `.gitignore` pattern `.env`, which matches at any depth — confirmed via `git check-ignore -v logs/.env`). The repo owner creates this file themselves, copying the same `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` values already set in Render's dashboard (Render env vars only apply to the deployed webhook process, not the local LOGS process — the two are unconnected). Chosen over plain `os.environ` exports for convenience across repeated local test sessions. |
| 9 | Old JSONL pipeline (`logs_ingest.py`, `logs_migrate_xls.py`, webhook.js's `/logs/tasks/*` routes) | Left in place, untouched, not deleted — don't remove pre-existing code without being explicitly asked. Flagged here as superseded/dead once this work lands; removal is a separate future decision. |
| 10 | Seed data translation mapping | Full mapping confirmed below — case_type/dept_target/detail table, an 8-row status mapping (expanded from the 4 statuses appearing in the current 10 demo records to cover all 8 values the old schema allowed), and priority/severity kept as two independent fields (not combined). |
| 11 | `tenant_id` inconsistency (present on operational tables, absent from config tables) | Confirmed out of scope for this task — already flagged as unresolved in `Tenant_Management_Future_Considerations_v0.1.md`. LOGS only ever queries by `property_id`. Revisit only when real multi-tenant work begins. |
| 12 | Tenant Property Configuration Tool (static HTML/localStorage mockup, no backend, no Supabase wiring) | Confirmed out of scope for this task. LOGS's direct Supabase integration does not depend on this tool existing. |

### Seed data translation mapping

**Case shape:**

| Old record | new `case_type` | `dept_target` | detail table | notable field mapping |
|---|---|---|---|---|
| F-SEED0001/2/3 (dining reservations) | `reservation` | FNB | `reservation_details` | `venue_or_department` text → `special_requests` (no `venues` table seeded yet, same limitation the live webhook path already has) |
| S-SEED0001/2/3 (theft/altercation/slip) | `incident` | SEC | `incident_details` | `incident_type`→`incident_category`, `severity`→`severity` (unchanged, see below), `location_section`→`location_text`, `resolution_summary`→`resolution_notes` |
| A-SEED0001 (gaming question) | `service_request` | OPS | `service_request_details` | `service_request_type='service_request_1'`, `service_area_label='Gaming Floor'` |
| A-SEED0002 (corporate event) | `reservation` | OPS | `reservation_details` | same shape as FNB rows |
| A-SEED0003 (parking/check-in question) | `service_request` | OPS | `service_request_details` | `service_request_type='service_request_2'`, `service_area_label='Guest Services'` |
| A-SEED0004 (billing complaint) | `complaint` | OPS | `complaint_details` | `complaint_category='billing'`, `resolution_summary`→`resolution_notes` |

**Status mapping** (old `VALID_STATUSES`, all 8 values, → new `case_status`):

| Old status | → New `case_status` | Reasoning |
|---|---|---|
| `open` | `new` | Case reported, no work started yet |
| `in_progress` | `assigned` | Actively being worked |
| `tentative` | `waiting_guest` | Provisional, awaiting guest confirmation |
| `pending_customer_confirmation` | `waiting_guest` | Explicit wait-on-guest state |
| `pending_review` | `waiting_staff` | Awaiting internal staff review |
| `confirmed` | `resolved` | Requested action completed, not yet archived |
| `closed` | `closed` | Direct match |
| `reopened` | `open` | Back to needing attention |

Known limitation, confirmed acceptable: `tentative` and `pending_customer_confirmation` both collapse into the single new `waiting_guest` state — the new schema only has one "waiting on guest" status, not two.

**Priority mapping** (old `urgency` → new `priority` — kept fully independent from severity, not combined):

| Old `urgency` | → New `priority` |
|---|---|
| `normal` | `normal` |
| `high` | `high` |
| `critical` | `urgent` |
| *(`low`, unused in current seed data, included for completeness)* | `low` |

**Severity** (`incident_details.severity` / `complaint_details.severity`) — carried over unchanged as free text; no enum constraint in either the old or new schema; never merged with priority.

## Known Blockers / Limitations

Expected, not new bugs introduced by this work:

- **Venues stay unseeded.** `reservation_details.venue_id` is null for every case, seeded or real. The "Venue" column shows `special_requests` text or `—`, never a real venue name — same known limitation `supabase_bridge/supabase_client.js` already documents for the live webhook path.
- **PostgREST schema-cache lag risk.** The embedded-resource select (`cases` → `reservation_details`/`teams`) depends on Supabase's schema cache reflecting the FKs added at the end of the second migration plus the new `operator_notes` column — smoke-tested before the full rewrite.
- **`cases.guest_thread_id` is `NOT NULL`** — any case creation must create/find a `guest_threads` row first.
- **Status enum sync** — `logs_models.VALID_STATUSES` must match the DB's `case_status` check constraint exactly, or staff can submit a value Postgres rejects at save time.
- **UUID route params must 404, not 500** on a malformed/non-UUID case id.
- **Seeding order matters** — teams must exist before any case sets `assigned_team_id`.
- **Excel/Drive export stays broken** after this pass, by design — stub message is the intended end state pending a separate follow-up.
- **`logs/.env` must be created manually** by the repo owner (not by an agent), copying values from Render's dashboard — already confirmed covered by `.gitignore`.

## Reference

Full context: `Physical_Schema_v0.1.md`, `DB_Construction_Decisions_v0.1.md`, `Database_Map_v0.1.md`, `Tenant_Management_Future_Considerations_v0.1.md` in this folder.
