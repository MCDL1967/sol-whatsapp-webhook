# SOL DB Construction — Execution Blocker Decisions v0.1

Status: decisions for `Physical_Schema_v0.1.md` execution blockers
Date: 2026-07-07

## Resolved

| Item | Decision |
|---|---|
| Supabase schema name | `public` |
| RLS / permissions | Webhook connects via the `service_role` key (trusted server-side, bypasses RLS). RLS policies are only needed for authenticated-human surfaces — Property Admin tool, future SOL Admin tool, LOGS dashboard — scoped by `tenant_id`/`property_id` via JWT claim. No policies required for the webhook's own access path. |
| Seed data values | Keep current placeholders: `tenant_key: sol_demo`, `property_key: demo`, `display_name: Your Casino`, `timezone: America/Panama`, `default_language: en` |
| Runtime package storage | Supabase table row — `runtime_packages` table, `package_json JSONB`, per the shape already sketched in `Physical_Schema_v0.1.md` |
| Enum implementation | `text check (...)` constraints, not Postgres enum types (easier to extend during early iteration) |
| `venue_hours.day_of_week` | 0–6, Sunday = 0 — matches Postgres `EXTRACT(DOW FROM date)` and JavaScript `Date.getDay()`, avoiding a translation layer between the app and DB |
| `updated_at` strategy | Shared Postgres trigger function applied to every table with an `updated_at` column — guarantees correctness regardless of which write path (webhook, admin tool, direct SQL) touches the row |
| Migration method | CLI-managed versioned migration files (`supabase migration new`, `supabase db push`), checked into the repo — free-tier compatible; the paid-tier feature is Branching (auto-provisioned preview environments), a separate thing. Mirrors the existing `dev`→`main` git workflow. |
| `dept_target` naming | `ADM` → **`OPS`**. `GM` still always receives every case (not itself a `dept_target` value); routes in addition to one of `FNB` / `SEC` / `OPS`. `HSK` (housekeeping) folds into `OPS` for MVP rather than a 4th value, unless a specific property already fields housekeeping requests through a distinct team. |
| Supabase project | Single project only — free-tier project limit reached, no separate dev project available. Working directly in `public` schema on the one project (no dev/prod schema separation for now, matches the original MVP default). Project renamed `sol_whatsapp_webhook_main`, ref `muhahnfodnnplrizefhu`. CLI linked (`supabase link --project-ref muhahnfodnnplrizefhu`). |

## Resolved — Schema Completeness Gaps (Demo Data Mapping round)

Source: gaps and open questions surfaced by `Demo_Data_to_Schema_Mapping_v0.3.md`.

| Item | Decision |
|---|---|
| Menu lookup data (`lookup`, `choice_aliases`, `list_triggers`) | **Normalized tables, locked in**: `menu_option_aliases (id, branch_id, option_key, alias_text, language)` and `menu_branch_triggers (id, branch_id, trigger_text, language)`. Consistent with the existing `venue_aliases` pattern; this data sits in the hot path of every guest turn, so it belongs indexed rather than parsed out of JSONB per request. (Note considered and set aside: JSONB would have been faster to implement and marginally more memory-compact at this dataset's small scale — normalized tables were chosen for query performance and schema consistency instead.) |
| `answer_boundaries` domain | First-class table: `answer_boundaries (id, property_id, boundary_type ['may_answer_directly'\|'must_escalate'\|'safe_rule'], topic text, rule_text text)`. List-shaped data (multiple topics per boundary type), same reasoning as venue/menu aliases. |
| Venue visibility fields | Add two booleans to `venues`: `selectable` (guest can pick this venue directly for a reservation) and `show_in_restaurant_list` (appears in the "show me restaurants" listing) — replaces the hardcoded Room Service exclusion at `src/fast_path/fast_path_responder.js:20`. No separate "service-only" flag — derivable from `venue_type` + `reservation_enabled`. |
| `target_file`/KB source relationship | Plain nullable `menu_options.target_file text` field for now. **Flagged for later**: full KB governance (source provenance, versioning, review status) explicitly deferred — already listed under "Later Contract Domains" in `Runtime_Config_Contract_v0.3.md`. Revisit when KB governance is actually built. |
| Template governance fields | Add `response_templates.approval_status text check (draft, approved, needs_review) default 'approved'` and `response_templates.last_reviewed timestamptz` (nullable) — relevant to the Tenant Property Configuration Tool (`Tenant_Property_Configuration_v0.2.html`), not LOGS: gates/audits Property Admin wording edits so a bad edit doesn't go straight to guests unreviewed. Skip `owner` (redundant with the tenant-editable-fields policy already set at the field level) and `source_kb` (defer with target_file/KB governance above). Not actually a gap: `channel_suitability` is already covered by the existing `response_templates.channel` field. |
| `services_enabled` | Not a table, not a feature flag — derive at runtime-package build time from which top-level `menu_branches` are `active` for that property. Avoids a parallel list that can drift out of sync with actual menu config. |
| Menu aliases: rows or JSONB | Rows — see menu lookup data decision above. |
| `typical_dining_duration_minutes` | Already resolved, no action — `reservation_rules.typical_duration_minutes` already exists in the physical schema draft. |
| Room Service: venue or service | **Service, not venue** (supersedes earlier venue-based recommendation; confirmed). No `venues` row. Becomes a labeled `service_request_details` slot (recommend `service_request_1` by default, given likely high frequency); its `case_type` is `service_request`, not `reservation` — more semantically correct since room service is an on-demand order, not a booked time slot. Menu/food-item structure is unaffected since `menu_branches`/`menu_options` are already property-scoped, not venue-scoped. Natural-language matching moves to `menu_option_aliases` instead of `venue_aliases`. Intro/description copy lives in `response_templates` instead of `venue_descriptions`. Watch-item: MVP only defines 3 `service_request` slots — may need to grow if a property needs more than 3 distinct service types. |

## Live Database State (mockup demo)

**As of 2026-07-07, this is no longer just planning — a minimal slice is actually live on the linked Supabase project (`sol_whatsapp_webhook_main`, ref `muhahnfodnnplrizefhu`).**

- Migration `supabase/migrations/20260707200539_minimal_reservation_path.sql` applied via `supabase db push --linked --include-seed`. Confirmed applied both locally and remotely via `supabase migration list --linked` (timestamp `20260707200539` on both sides).
- Tables live: `tenants`, `properties`, `guest_threads`, `cases`, `reservation_details` — a walking-skeleton subset of the full `Physical_Schema_v0.1.md` design (not a simplified/different version — every column matches the finalized shape), chosen to prove the WhatsApp → reservation-write path end-to-end before building the remaining ~15 tables.
- `supabase/seed.sql` applied in the same push: one `tenants` row (`sol_demo`, "SOL Demo") and one `properties` row (`demo`, "Your Casino", `America/Panama`) — the resolved seed anchors, not full content.
- **RLS baseline resolved and live** (supersedes the "Open" note that used to be here): all 5 tables have `alter table ... enable row level security` with **zero policies** — deny-all except `service_role`, which bypasses RLS entirely. This is the actual current state of the database, not just a recommendation.
- Two FKs are intentionally **not yet enforced**: `reservation_details.venue_id` and `cases.assigned_team_id` are plain `uuid` columns with no FK constraint, because `venues` and `teams` don't exist yet. A follow-up migration adds those constraints once those tables are created.
- **Rule going forward**: this migration has been applied — never edit it. Any change is a new migration file.

## Open — needs resolution before the rest of the schema is built

| Item | Status |
|---|---|
| Granular RLS policies | `service_role` bypass is live (see above). Property Admin / SOL Admin / LOGS-read policies still can't be written — those tools don't have real Supabase Auth users yet. |
| Seed content production | Not yet produced. The seed *anchors* are now live (see above) and the *mapping locations* (`Demo_Data_to_Schema_Mapping_v0.3.md`) are resolved, but nobody has transformed the actual `property_master_data.json` / `menu_dictionary.json` / `response_templates_en.json` / `response_templates_es.json` content into concrete seed values (real team names, real venue list, real menu tree, real template bodies, real reservation thresholds, real service-request slot labels). |
| Remaining ~15 tables | Not yet migrated — `venues`, `teams`, `menu_branches`/`menu_options`, `menu_option_aliases`, `menu_branch_triggers`, `answer_boundaries`, `response_templates`, `reservation_rules`, `runtime_feature_flags`, `property_settings`, `complaint_details`/`incident_details`/`service_request_details`, `operational_events`, `messages`, `runtime_packages`. All fully designed in `Physical_Schema_v0.1.md`, just not yet written as migration files. |
| `webhook.js` integration | Not yet done — the actual write from a live WhatsApp reservation into `cases`/`reservation_details` hasn't been coded. In progress as of this session. |

## Pending code changes (not yet executed — code edits deferred)

The `ADM`→`OPS` rename is approved but not yet applied to code. `Physical_Schema_v0.1.md`'s `teams.dept_target` example already reads `FNB, HSK, SEC, OPS`, so no planning-doc change was needed there. Scope for when code editing resumes:

| File | What changes |
|---|---|
| `logs/logs_models.py` | `VALID_DEPTS`, all `"ADM"` values in `ROUTING_RULES`, all `"ADM"` values in `SECTION_TEAM_ROUTING` |
| `logs/logs_app.py` | 2 SQL filters (`dept_target='ADM'`) |
| `logs/logs_export.py` (+ `.old.py`) | SQL query filter; **separate decision needed**: the Google Drive export path is itself named `ADM/adm_team_log_live.xlsx` — decide whether to rename that folder/file too or keep the Drive path stable while the internal value changes |
| `logs/logs_migrate_xls.py` | Same Drive path reference, env var `LOGS_PATH_ADM` |
| `logs/logs_seed.py` | 4 seed records using `"section_team": "ADM"` |
| Hard-Code Map (`Schema_Proposal_v0.4.html` or successor) | Entry for `logs_mapper.js:100` referencing `ADM` |

Supabase CLI installed and `supabase/migrations/` scaffolded; project linked (see Supabase project row above) — no longer pending.

## Reference
Full context: `Physical_Schema_v0.1.md`, `Database_Map_v0.1.md`, `Runtime_Config_Contract_v0.3.md` in this folder.
