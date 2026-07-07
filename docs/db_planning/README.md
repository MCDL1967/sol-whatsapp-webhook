# SOL DB Planning Review Packet v0.3

Status: review artifact only
Date: 2026-07-06
Scope: database planning, deterministic menu runtime planning, and configuration-tool alignment

## Boundary

These documents do not construct a database, modify runtime behavior, or authorize changes to `webhook.js`, LOGS, Voiceflow, ElevenLabs, or deployment configuration.

The purpose is to align the current loose JSON/package structure, the Tenant Property Configuration Tool, any Client View / Vista del Cliente preview surfaces inside that tool, the deterministic menu runtime service boundary, and the proposed Supabase model before DB construction begins.

## Review Artifacts

1. [Database Map v0.1](Database_Map_v0.1.md)
2. [Runtime Config Contract v0.3](Runtime_Config_Contract_v0.3.md)
3. [SOL Menu Runtime Service v0.3](SOL_Menu_Runtime_Service_v0.3.md)
4. [Demo Data to Schema Mapping v0.3](Demo_Data_to_Schema_Mapping_v0.3.md)
5. [Tenant Property Configuration Tool vs Canonical Schema Gap List v0.3](Tenant_Property_Configuration_vs_Canonical_Schema_Gap_List_v0.3.md)
6. [Voice Channel Architecture Note v0.3](Voice_Channel_Architecture_Note_v0.3.md)
7. [Hardcode Retirement Matrix v0.3](Hardcode_Retirement_Matrix_v0.3.md)

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

The current source of truth for this planning pass is `/Users/MCDL1/Documents/Codex_Webhook`.
