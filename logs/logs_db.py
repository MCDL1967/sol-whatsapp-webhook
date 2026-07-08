"""
logs_db.py
Database layer for LOGS v2.
SQLite, local-first. DB lives at middleware/LOGS/logs_v2_runtime/logs.db
"""

import sqlite3
import os
from pathlib import Path

# Canonical DB path relative to this file's location
BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "logs_v2_runtime" / "logs.db"


def get_db() -> sqlite3.Connection:
    """Return a connection with row_factory set for dict-like access."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables if they do not exist. Safe to run on every startup."""
    conn = get_db()
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS cases (
                -- Identity
                record_id               TEXT PRIMARY KEY,
                timestamp               TEXT NOT NULL,           -- ISO8601, UTC stored
                created_at              TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at              TEXT NOT NULL DEFAULT (datetime('now')),

                -- Classification
                category                TEXT,
                section_team            TEXT,
                request_type            TEXT,
                workflow_stage          TEXT,
                status                  TEXT DEFAULT 'open',
                urgency                 TEXT DEFAULT 'normal',
                severity                TEXT,
                complaint_category      TEXT,
                request_category        TEXT,
                routing_reason          TEXT,

                -- Routing flags (derived; stored for query convenience)
                dept_target             TEXT,   -- NULL | FNB | SEC | OPS

                -- Guest info
                guest_name              TEXT,
                contact_phone           TEXT,
                contact_email           TEXT,
                preferred_contact_method TEXT,

                -- Location / venue
                location_section        TEXT,
                venue_or_department     TEXT,

                -- Service details
                service_date            TEXT,
                service_time            TEXT,
                party_size              INTEGER,

                -- Incident
                incident_type           TEXT,

                -- Content
                summary                 TEXT,
                special_requests_or_notes TEXT,

                -- Broadcast / comms tracking
                team_log_file           TEXT,
                broadcast_channel       TEXT,
                broadcast_status        TEXT,
                client_message_status   TEXT,

                -- Follow-up
                follow_up_required      TEXT,
                follow_up_type          TEXT,
                assigned_manager_or_queue TEXT,

                -- Lifecycle / closure governance
                internal_resolution_status    TEXT DEFAULT 'open',
                customer_confirmation_status  TEXT DEFAULT 'not_sent',
                closure_status                TEXT DEFAULT 'open',
                issue_reopened                TEXT DEFAULT 'NO',

                -- Resolution
                resolution_summary      TEXT,
                resolved_by             TEXT,
                resolution_timestamp    TEXT,
                final_closure_timestamp TEXT,

                -- Survey
                survey_sent_timestamp   TEXT,
                survey_response_timestamp TEXT,
                customer_feedback_score TEXT,

                -- Operator notes (UI-editable free text)
                operator_notes          TEXT
            );

            -- Secondary log for non-operational events (future use)
            CREATE TABLE IF NOT EXISTS event_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type  TEXT NOT NULL,
                raw_json    TEXT NOT NULL,
                received_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Ingest run log
            CREATE TABLE IF NOT EXISTS ingest_runs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                run_at          TEXT NOT NULL DEFAULT (datetime('now')),
                source_file     TEXT,
                records_seen    INTEGER DEFAULT 0,
                records_upserted INTEGER DEFAULT 0,
                records_skipped  INTEGER DEFAULT 0,
                errors          INTEGER DEFAULT 0
            );

            -- Index for common queries
            CREATE INDEX IF NOT EXISTS idx_cases_status       ON cases(status);
            CREATE INDEX IF NOT EXISTS idx_cases_dept_target  ON cases(dept_target);
            CREATE INDEX IF NOT EXISTS idx_cases_section_team ON cases(section_team);
            CREATE INDEX IF NOT EXISTS idx_cases_timestamp    ON cases(timestamp);
            CREATE INDEX IF NOT EXISTS idx_cases_guest_name   ON cases(guest_name);
        """)
    conn.close()
    print(f"[logs_db] DB initialized at: {DB_PATH}")


if __name__ == "__main__":
    init_db()
