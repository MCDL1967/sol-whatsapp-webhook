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

**As of 2026-07-07, the full table structure from `Physical_Schema_v0.1.md` is live on the linked Supabase project (`sol_whatsapp_webhook_main`, ref `muhahnfodnnplrizefhu`).** Seed content beyond the anchors was outstanding until the KB seed migration round on 2026-07-21 (see "Resolved — KB Seed Migration" below) — the config tables listed just below are now populated, not just structural. `venue_hours` (exact hours) and `runtime_packages` (compiled package) remain unseeded — out of scope per the MVP mapping boundary and the separate runtime-consumption-model chokepoint, respectively.

- Migration `supabase/migrations/20260707200539_minimal_reservation_path.sql` applied via `supabase db push --linked --include-seed`. Confirmed applied both locally and remotely via `supabase migration list --linked` (timestamp `20260707200539` on both sides).
- Walking-skeleton tables live from that migration: `tenants`, `properties`, `guest_threads`, `cases`, `reservation_details` — chosen to prove the WhatsApp → reservation-write path end-to-end before building the rest.
- `supabase/seed.sql` applied in the same push: one `tenants` row (`sol_demo`, "SOL Demo") and one `properties` row (`demo`, "Your Casino", `America/Panama`) — the resolved seed anchors, not full content.
- Migration `supabase/migrations/20260707235402_config_and_operational_tables.sql` applied via `supabase db push --linked`. Confirmed applied both locally and remotely via `supabase migration list --linked` (timestamp `20260707235402` on both sides; `supabase db push --linked --dry-run` reports "Remote database is up to date").
- Remaining tables live from that migration: `property_settings`, `teams`, `venues`, `venue_aliases`, `venue_descriptions`, `venue_hours`, `reservation_rules`, `menu_branches`, `menu_options`, `menu_option_aliases`, `menu_branch_triggers`, `answer_boundaries`, `response_templates`, `runtime_feature_flags`, `messages`, `complaint_details`, `incident_details`, `service_request_details`, `operational_events`, `runtime_packages`. As of 2026-07-21: `property_settings`, `teams`, `venues`, `venue_aliases`, `venue_descriptions`, `reservation_rules`, `menu_branches`, `menu_options`, `menu_option_aliases`, `menu_branch_triggers`, `answer_boundaries`, `response_templates`, `runtime_feature_flags` are seeded (see "Resolved — KB Seed Migration" below); `venue_hours`, `messages`, `complaint_details`, `incident_details`, `service_request_details`, `operational_events`, `runtime_packages` remain structure-only.
- **RLS baseline resolved and live** across all tables (both migrations): `alter table ... enable row level security` with **zero policies** — deny-all except `service_role`, which bypasses RLS entirely. This is the actual current state of the database, not just a recommendation.
- The two previously-deferred FKs are now enforced: `reservation_details.venue_id → venues.id` and `cases.assigned_team_id → teams.id`, added via `alter table ... add constraint` at the end of the config-tables migration, now that `venues` and `teams` exist.
- Enum `CHECK` constraint policy for this round: see "Resolved — Config-Table Migration Round" above.
- **Rule going forward**: both migrations have been applied — never edit them. Any change is a new migration file.

## Resolved — Config-Table Migration Round

| Item | Decision |
|---|---|
| Enum `CHECK` constraint policy for columns not explicitly listed in a table's own Constraints block | Split by how settled/closed the enum is and whether anything writes to the column yet. **Add `CHECK`**: `venue_aliases.language`, `menu_option_aliases.language`, `menu_branch_triggers.language` (all nullable `en`/`es`), and `messages.channel` / `messages.sender_type` (closed, named enums with fixed drafts, zero current writers so zero migration risk). **Skip `CHECK`**: `menu_options.case_type` and `menu_options.dept_target` — the schema doc explicitly hedges these as "optional... if option creates work," reading as an evolving field rather than a settled enum; constraining now risks a migration just to add a routing value later. Rationale: unconstrained config-table enums fail silently as guest-facing conversation-quality bugs (e.g. a mistagged language alias silently not matching), not crashes — worth catching at write time where the enum is genuinely closed. |

## Open — needs resolution before the rest of the schema is built

| Item | Status |
|---|---|
| Granular RLS policies | `service_role` bypass is live (see above). Property Admin / SOL Admin / LOGS-read policies still can't be written — those tools don't have real Supabase Auth users yet. |
| Seed content production | **Resolved 2026-07-21** — see "Resolved — KB Seed Migration (Demo Data → Config Tables round)" below. |
| Remaining ~15 tables | **Resolved 2026-07-07** — all migrated via `supabase/migrations/20260707235402_config_and_operational_tables.sql`. See "Live Database State" above. |
| `webhook.js` integration | Done — `cases`/`reservation_details` writes are live at both reservation-closure code paths (commits 6402086, 6034563). |

## Pending code changes

**Resolved 2026-07-07 — `ADM`→`OPS` rename applied.** Scope covered, wider than originally scoped since the rename also touched files not in the original list:

| File | What changed |
|---|---|
| `logs/logs_models.py` | `VALID_DEPTS`, all `"ADM"` values in `ROUTING_RULES`, all `"ADM"` values in `SECTION_TEAM_ROUTING`, docstring |
| `logs/logs_app.py` | Route `/adm`→`/ops`, function `view_adm`→`view_ops`, SQL filters, `_counts()` dict key `adm`→`ops`, export valid-view lists |
| `logs/logs_export.py` | `ADM_COLUMNS`→`OPS_COLUMNS`, `VIEW_COLUMNS`/`VIEW_QUERIES`/`EXCEL_PATHS` dict key `adm`→`ops`, env var `LOGS_PATH_ADM`→`LOGS_PATH_OPS`, argparse choices |
| `logs/logs_migrate_xls.py` | `WORKBOOK_SOURCES` key `adm`→`ops`, env var `LOGS_PATH_ADM`→`LOGS_PATH_OPS`, argparse choices |
| `logs/logs_seed.py` | 4 seed records' `"section_team": "ADM"`→`"OPS"` |
| `logs/logs_db.py` | Schema comment documenting `dept_target` valid values |
| `logs/templates/base.html`, `logs/templates/list.html` (not in original scope, found during implementation) | Nav link, badge, export link, filter dropdown, view-membership checks |
| `logs/static/logs.css` (not in original scope) | `--adm-color`→`--ops-color`, `.badge-adm`→`.badge-ops`, `.dept-adm`→`.dept-ops` |
| `logs_v2_runtime/logs.db` (local dev data, not code) | 4 existing `dept_target='ADM'` rows updated to `'OPS'` via one-off `UPDATE`, so seeded demo data stays visible under the renamed view |

**Google Drive export path decision**: kept stable, not renamed. `logs_export.py`'s `"ops"` entry and `logs_migrate_xls.py`'s `"ops"` source still point at the physical `ADM/adm_team_log_live.xlsx` file/folder on Drive — only the internal dept_target/route/view value changed to `OPS`. Reasoning: that path points to a real, already-in-use file on Google Drive (not something in this repo), and is hardcoded to a different local user (`MCDL1`) than the current dev machine, so it can't be verified or renamed from here.

**Not changed**: `logs_seed.py`'s `"assigned_manager_or_queue": "ADM Manager"` — free-text descriptive seed content, not the `dept_target` enum, out of scope for this rename. `Schema_Proposal_v0.4.html`'s Hard-Code Map entry for `logs_mapper.js:100` — checked, `logs_mapper.js` doesn't actually contain the literal string `ADM`, so there was nothing to rename there. `.old.py` backup files (`logs_db.py.old.py`, `logs_export.py.old.py`) — left untouched as dead/superseded code, per standing "don't touch pre-existing dead code" convention.

Note: `logs/logs_seed.py` was fully rewritten in the LOGS-Supabase integration work below — the `"section_team"` field it referenced here no longer exists at all in the current file. This row documents what was true at the time of the ADM→OPS rename, not the current state of that file.

## Resolved — LOGS-to-Supabase Integration

Full decision record, root-cause analysis, and seed-data translation mapping: `whatsapp_db_logs_adaptation_v0.1.md` in this folder. Summary of the schema-relevant change:

| Item | Decision |
|---|---|
| `cases.operator_notes` | New nullable `text` column, added via `supabase/migrations/20260714011758_add_cases_operator_notes.sql`, applied and confirmed live (`supabase db push --linked --dry-run` → "up to date"). Staff-authored free text, never written by the webhook — the one legacy LOGS concept (of many considered) judged worth preserving as a real column. Full rationale and the 11 other decisions made alongside it (teams seeding, library choice, credential reuse, dropped legacy fields, stubbed Excel export, env var delivery, seed data mapping) are in `whatsapp_db_logs_adaptation_v0.1.md` — each was confirmed individually with the repo owner, not batch-approved. |
| LOGS dashboard data source | Switched from local SQLite (`logs_v2_runtime/logs.db`, fed only by manual seed/ingest) to direct Supabase reads/writes via `supabase-py`, using the same `service_role` credential as the webhook. Verified end-to-end: live queries, joins (`cases` + `reservation_details`/`teams`), edits (status/priority/team/operator_notes) all confirmed persisting correctly against the real Supabase project. |

Verified via a live local run: `/ops` returns 200 with the correct title, the old `/adm` route now 404s, and the nav bar's OPS badge correctly counts the 4 updated rows.

Supabase CLI installed and `supabase/migrations/` scaffolded; project linked (see Supabase project row above) — no longer pending.

## Resolved — venue_id Resolution (narrow fix)

`reservation_details.venue_id` was null for every reservation (real or seeded) because the `venues` table was empty and `supabase_bridge/supabase_client.js` had no lookup logic — it stored the venue name as workaround text in `special_requests` instead. Scoped narrowly, not the full architecture (see "Open" below):

| Item | Decision |
|---|---|
| Venue seed data | 6 real venues seeded for the `demo` property, sourced from `property_packages/demo/property_master_data.json`'s `dining.venues` list (excludes Room Service — already decided as a service, not a venue). `display_name` values match `webhook.js`'s `KNOWN_RESERVATION_VENUES` canonical strings exactly, since that registry already collapses guest text to one of a fixed set of names before anything reaches Supabase. Applied via direct `supabase-py` upsert, not `supabase db push --include-seed` — that path silently no-ops without Docker running locally (confirmed: it updates the tracked seed hash without executing the SQL). `supabase/seed.sql` was still updated with the equivalent SQL for documentation/future-Docker-availability, but treat the live database, not that file, as source of truth until re-verified with Docker running. |
| `venue_aliases` | Explicitly **not** seeded. Would be inert: `webhook.js`'s alias/typo matching happens entirely before `venue_or_department` ever reaches Supabase (a typo that doesn't match `KNOWN_RESERVATION_VENUES` today stays `null` before and after this fix — no regression, no improvement). Seeding aliases now would be accurate but unused data until the full runtime-package architecture (see "Open" below) actually queries it. Revisit together with that work, not before. |
| `supabase_bridge/supabase_client.js` lookup | Exact-match query (`venues.display_name = payload.venue_or_department`) at write-time, soft-fail internally (catches its own errors, returns `null` on any failure — never blocks the reservation write). `reservation_details.special_requests` changed from the venue-name workaround text to `null`, since no real guest "special requests" capture exists anywhere in the current conversation flow. |
| LOGS dashboard | `logs_app.py`'s `CASE_SELECT` now embeds `reservation_details(*, venues(display_name))`; `list.html`/`detail.html` show the resolved venue name, falling back to the old `special_requests` text only for rows written before this fix (their `venue_id` stays permanently null — not retroactively fixed). |
| Verification | No Node.js installed locally (confirmed: not found anywhere in PATH or standard install locations) — `webhook.js` has apparently never been run locally, only on Render. Verified via commit + deploy + live WhatsApp test instead of local execution. |

## Open — flagged as future work, not started

| Item | Status |
|---|---|
| Full runtime-package architecture | The intended full design (Property Admin configures venues/menus via the Tenant Property Configuration Tool → compiled into a `runtime_packages` row → webhook consumes it live) does not exist. Today, the webhook's guest-facing venue/menu matching runs entirely off static files in `property_packages/demo/*.json`, completely disconnected from the Supabase schema — a parallel system, not a source feeding it. The venue_id fix above is a narrow bridge (seed Supabase to match what the static files already produce), not this. Building the real pipeline is its own multi-session project: compile step, webhook rewire to consume Supabase config instead of static JSON, and a real backend for the Tenant Property Configuration Tool (currently a `localStorage`-only mockup with zero Supabase wiring). **Full research and open sequencing decision recorded in `Webhook_Tenant_Mockup_Unification_v0.1.md`** — confirms this is actually 3 separate, non-cross-referenced venue/menu representations already living inside the webhook (not one gap), plus no build/compile step, a dead `fast_path_triggers.json`, and no unification decision made yet. |
| Typo/fuzzy venue matching | `webhook.js`'s `KNOWN_RESERVATION_VENUES` alias matching is exact-phrase regex only, no typo tolerance. A guest typo that isn't in the alias list produces `venue_or_department: null` today and will continue to after any Supabase-side change, since the matching happens before Supabase is ever consulted. Only worth revisiting alongside the full runtime-package architecture above, where alias matching could move to Supabase's `venue_aliases` table. |
| `menu_options.case_type` / `dept_target` / `template_key` | Confirmed unused anywhere in the codebase (grepped `webhook.js`, `supabase_bridge/`, `src/fast_path/`). The only place `case_type`/`dept_target` exist at all today is hardcoded literal values (`"reservation"`/`"FNB"`) inside `writeReservationCase()` in `supabase_client.js` — there is no equivalent write path yet for complaints/incidents/service requests (webhook.js tracks these conversationally via `session.active_request.type` but never inserts a `cases` row for them). `template_key` is unused everywhere; templates are hardcoded literal keys directly in `fast_path_responder.js`'s `if` blocks. These three columns were left null in the KB seed migration below — this is genuinely new configuration surface the Tenant Property Configuration Tool will need to define, not something migrated from existing data. |
| `team_name_2` ("Reservations") unused `handoff_team_key` | Every venue entry in `property_master_data.json`'s `dining.venues[]` has `"handoff_team_key": "team_name_1"` (Guest Services) — including the two reservation-led venues (La Brasserie, Fenicia). `team_name_2` ("Reservations") is named and given its own `escalation_routing` scope but is never actually referenced by any venue. Documented, not fixed — the `teams` seeding below (Guest Services→`OPS`, Reservations→`FNB`, Security→`SEC`) was approved independent of this quirk, since no current code path uses `handoff_team_key` for routing anyway. |
| Branch-level reprompt/fallback template | `fast_path_responder.js`'s `stayMap` object re-shows a branch-specific reprompt template when guest input doesn't match anything in the current context. No `menu_branches` column exists for "this branch's fallback template." Deferred to the next webhook-rewire session, not solved by the seed migration below. |
| `"__back"` navigation target semantics | Code always routes `"__back"`/`"0"` selections straight to `main_menu`, regardless of how deep the branch hierarchy goes (e.g. `loyalty_program_info_menu`'s back skips `loyalty_rewards_menu` entirely) — it is not "go to `parent_branch_key}`." Not yet decided whether a Supabase-driven runtime should preserve this exact behavior or move to parent-based back navigation. Deferred alongside the reprompt-template item above. |
| `runtime_feature_flags` ownership | Schema (`Physical_Schema_v0.1.md`) currently documents this table as "controlled by SOL/Admin," but the working assumption going forward is that property-specific flags (e.g. `room_service_available_24_hours`) should be tenant/Property-Admin-editable via the mockup tool instead, similar to `property_settings`. Ownership/RLS model not yet updated to reflect this — revisit once the Tenant Property Configuration Tool's real backend and auth are designed. |

## Resolved — KB Seed Migration (Demo Data → Config Tables round, 2026-07-21)

One-off migration script: `logs/seed_kb_from_demo_package.py` (run via `cd logs && source venv/bin/activate && python seed_kb_from_demo_package.py`). Transforms the current `property_packages/demo/*.json` files into the corresponding Supabase config tables, per the mapping in `Demo_Data_to_Schema_Mapping_v0.3.md`. Does **not** touch `webhook.js` or `runtime_packages` — this only populates config tables nothing reads yet (see `Webhook_Tenant_Mockup_Unification_v0.1.md` for the sequencing rationale: runtime consumption model is a separate, later chokepoint).

| Table | What happened |
|---|---|
| `teams` | **Updated in place, not inserted.** `ops_team`/`fnb_team`/`sec_team` already existed (from `logs/logs_seed.py`, 2026-07-14, used by LOGS demo cases) — inserting new rows keyed by the real team names would have created duplicate teams per `dept_target`. Enriched `display_name` + `scope` from `property_master_data.json`: Guest Services→`ops_team` (`OPS`), Reservations→`fnb_team` (`FNB`), Security→`sec_team` (`SEC`, `scope` left **null** — no scope text exists anywhere in the source data for `team_name_3`, flagged rather than invented). `team_key`/`id` untouched, so existing LOGS-seeded case assignments still resolve correctly. |
| `property_settings` | `concierge_name: 'SOL'` for the demo property — explicitly modeled as a tenant-editable field the mockup tool should expose as a variable, not a hardcoded value. `default_language` from `property_config.json`'s `language_default` (normalized to lowercase). |
| `reservation_rules` | Direct mapping from `dining.reservation_facts`; `vip_group_required_fields` and the two reservation booleans folded into `policy_json` (no dedicated columns for those). |
| `venues` | Untouched — already seeded (2026-07-14, venue_id fix). |
| `venue_aliases` | Previously deliberately left empty (see "Resolved — venue_id Resolution" above); now populated from `dining.venues[].aliases[]`, 19 rows across the 6 real venues (Room Service excluded — service, not venue). |
| `venue_descriptions` | `short_description_en`/`short_description_es` per venue, 12 rows. |
| `menu_branches` / `menu_options` | 10 branches, 50 options, from `menu_dictionary.json`. **`parent_branch_key`/`next_branch_key` were fully ported from `fast_path_responder.js`'s hardcoded JS logic, not just from `menu_dictionary.json`'s `next_context` field** — only `main_menu`'s 6 edges are JSON-encoded; every deeper transition (`restaurants_menu`→`restaurant_followup_menu` for all 7 venues, `loyalty_rewards_menu`→its two sub-menus) was reverse-engineered directly from the responder's `if` blocks and written in as real graph edges. `case_type`/`dept_target`/`template_key` left null (see Open items above). |
| `menu_option_aliases` | 762 rows, merged from each branch's `lookup` + `choice_aliases` maps (deduplicated by alias text within a branch). Replaces the demo package's in-memory lookup structures. |
| `menu_branch_triggers` | 11 rows — only `restaurants_menu` has `list_triggers` in the source data. |
| `answer_boundaries` | 14 rows — `sol_may_answer_directly[]`/`sol_must_escalate[]` each as one row per topic (`rule_text` null), plus `hours_boundary.guest_safe_rule` as a single `safe_rule` row. |
| `runtime_feature_flags` | `room_service_available_24_hours` (true), `venue_specific_hours_configured` (false) — see the ownership open item above. |
| `response_templates` | 128 rows (64 keys × 2 languages) from `response_templates_en.json`/`response_templates_es.json` only — the combined/fallback `response_templates.json` was intentionally skipped (mapping doc already calls the split files the "effective" source). `required_variables` auto-derived via regex on `{{placeholder}}` syntax rather than hand-transcribed. `channel` defaulted to `'text'` (no voice channel exists today). |
| `property_config.json`'s `services` field | Intentionally skipped — already resolved elsewhere (see "Resolved — Schema Completeness Gaps" above) to be derived at runtime-package build time from active `menu_branches`, not its own seed data. |

Idempotency note: tables whose natural unique key includes a nullable `language` column (`venue_aliases`, `menu_option_aliases`, `menu_branch_triggers`) can't rely on `upsert(on_conflict=...)` — Postgres treats distinct rows with `NULL` in that column as non-conflicting, so re-running would duplicate them. The script instead deletes-then-reinserts those tables scoped by `venue_id`/`branch_id`, making the whole script safely re-runnable. Same reasoning applied to `answer_boundaries`, which has no natural unique key at all.

## Reference
Full context: `Physical_Schema_v0.1.md`, `Database_Map_v0.1.md`, `Runtime_Config_Contract_v0.3.md`, `Webhook_Tenant_Mockup_Unification_v0.1.md` in this folder.
