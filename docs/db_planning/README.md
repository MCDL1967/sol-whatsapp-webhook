# SOL DB Planning Review Packet v0.3

Status: DB construction has started — see "Current Status" below before reading anything else
Date: 2026-07-06 (packet) / 2026-07-07 (construction started)
Scope: database planning, deterministic menu runtime planning, and configuration-tool alignment

## Current Status (read this first — especially in a new session)

A minimal 5-table subset of the schema is **live** on the linked Supabase project. Full detail, live-state record, and every decision made since the original v0.3 review packet: **`DB_Construction_Decisions_v0.1.md`** — read that file first, not this one, for anything about current state. This packet below is the original review-round background; it has not been kept current with construction status.

Reading order for a new session:
1. `DB_Construction_Decisions_v0.1.md` — what's live, what's decided, what's still open, pending code changes
2. `Physical_Schema_v0.1.md` — full target schema design (its own header notes which parts are live vs. still draft)
3. `Tenant_Management_Future_Considerations_v0.1.md` — explicitly out-of-scope-for-now questions (tenant onboarding, billing, per-tenant security) — do not act on these without a decision first
4. The v0.3 review artifacts below — background/rationale only, superseded where they conflict with `DB_Construction_Decisions_v0.1.md`

## Boundary

These documents do not construct a database, modify runtime behavior, or authorize changes to `webhook.js`, LOGS, Voiceflow, ElevenLabs, or deployment configuration — **except** the minimal 5-table subset explicitly logged as live in `DB_Construction_Decisions_v0.1.md`.

The purpose is to align the current loose JSON/package structure, the Tenant Property Configuration Tool, any Client View / Vista del Cliente preview surfaces inside that tool, the deterministic menu runtime service boundary, and the proposed Supabase model before full DB construction continues.

## Review Artifacts (v0.3 review round — background/rationale)

1. [Database Map v0.1](Database_Map_v0.1.md)
2. [Runtime Config Contract v0.3](Runtime_Config_Contract_v0.3.md)
3. [SOL Menu Runtime Service v0.3](SOL_Menu_Runtime_Service_v0.3.md)
4. [Demo Data to Schema Mapping v0.3](Demo_Data_to_Schema_Mapping_v0.3.md)
5. [Tenant Property Configuration Tool vs Canonical Schema Gap List v0.3](Tenant_Property_Configuration_vs_Canonical_Schema_Gap_List_v0.3.md)
6. [Voice Channel Architecture Note v0.3](Voice_Channel_Architecture_Note_v0.3.md)
7. [Hardcode Retirement Matrix v0.3](Hardcode_Retirement_Matrix_v0.3.md)

## Construction Artifacts (current — read these for anything post-review)

8. [Physical Schema v0.1](Physical_Schema_v0.1.md) — full target schema; header shows live vs. draft status
9. [DB Construction Decisions v0.1](DB_Construction_Decisions_v0.1.md) — **the authoritative current-state document**
10. [Tenant Management Future Considerations v0.1](Tenant_Management_Future_Considerations_v0.1.md) — flagged, not decided

## v0.3 Review Resolutions

- Adopt the hybrid `cases` parent model with 1:1 detail tables.
- Replace separate inbound/outbound message tables with one `messages` table using `direction`.
- Use `service_request_details` for configurable service slots that do not justify dedicated schema.
- Keep reservation drafts transient until submitted/finalized.
- Keep technical runtime errors in logs unless they directly affect a case and need manager visibility.
- Store clean message fields always; store `raw_payload` selectively.
- Keep Voiceflow as the current runtime boundary; derive Voiceflow init variables from approved DB/config variables.
- Publish deterministic runtime packages from normalized DB config before live operational writes.

## Recommended Review Order

1. Agree that deterministic menu execution belongs in a SOL Menu Runtime Service, not directly in raw DB queries or scattered webhook logic.
2. Agree that the service should consume a published menu runtime package instead of raw normalized DB tables.
3. Review how current demo package fields map to proposed schema domains.
4. Decide what the Tenant Property Configuration Tool should own in v0.3, including any Client View / Vista del Cliente previews.
5. Confirm how much voice / ElevenLabs scaffolding belongs in MVP.
6. Prioritize hardcoded runtime values for later retirement.

## Current Source of Truth

This repository (`sol-whatsapp-webhook`), `dev` branch. The Supabase project itself (`sol_whatsapp_webhook_main`) is also now a source of truth for whatever has actually been migrated — see `DB_Construction_Decisions_v0.1.md` → "Live Database State" for what that currently includes.
