# SOL DB Planning

Status: this folder was consolidated on 2026-07-22 — read this file first, especially in a new session.

Reading order:

1. **`SOL_DB_Master_Plan_v1.0.md`** — the master planning doc. Current live state, architecture, runtime package compilation design, mockup tool scope (including a flagged unresolved conflict), hardcode retirement plan, LOGS status, explicitly-deferred items, and the full open-items list.
2. **`DB_Construction_Decisions_v0.1.md`** — the authoritative, still-growing decision log. Read this for anything about current DB state or a specific decision's history.
3. **`Physical_Schema_v0.1.md`** — full live schema (its own header notes what's live vs. draft).
4. **`old_planning_docs/`** — the individual v0.1/v0.3 planning-round documents the master plan consolidates (`Database_Map_v0.1.md`, `Demo_Data_to_Schema_Mapping_v0.3.md`, `Hardcode_Retirement_Matrix_v0.3.md`, `Runtime_Config_Contract_v0.3.md`, `SOL_Menu_Runtime_Service_v0.3.md`, `Tenant_Management_Future_Considerations_v0.1.md`, `Tenant_Property_Configuration_vs_Canonical_Schema_Gap_List_v0.3.md`, `Voice_Channel_Architecture_Note_v0.3.md`, `Webhook_Tenant_Mockup_Unification_v0.1.md`, `whatsapp_db_logs_adaptation_v0.1.md`). Preserved, not deleted — only needed if something in the master plan needs to be rechecked against its original source.

## Boundary

These documents do not construct a database, modify runtime behavior, or authorize changes to `webhook.js`, LOGS, Voiceflow, ElevenLabs, or deployment configuration beyond what's explicitly logged as live in `DB_Construction_Decisions_v0.1.md`.

## Current Source of Truth

This repository (`sol-whatsapp-webhook`), `dev` branch. The Supabase project itself (`sol_whatsapp_webhook_main`) is also a source of truth for whatever has actually been migrated — see `DB_Construction_Decisions_v0.1.md` → "Live Database State".
