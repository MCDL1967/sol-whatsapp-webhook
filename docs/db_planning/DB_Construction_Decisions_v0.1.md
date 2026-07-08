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

**As of 2026-07-07, the full table structure from `Physical_Schema_v0.1.md` is live on the linked Supabase project (`sol_whatsapp_webhook_main`, ref `muhahnfodnnplrizefhu`) — seed content is still the only thing outstanding.**

- Migration `supabase/migrations/20260707200539_minimal_reservation_path.sql` applied via `supabase db push --linked --include-seed`. Confirmed applied both locally and remotely via `supabase migration list --linked` (timestamp `20260707200539` on both sides).
- Walking-skeleton tables live from that migration: `tenants`, `properties`, `guest_threads`, `cases`, `reservation_details` — chosen to prove the WhatsApp → reservation-write path end-to-end before building the rest.
- `supabase/seed.sql` applied in the same push: one `tenants` row (`sol_demo`, "SOL Demo") and one `properties` row (`demo`, "Your Casino", `America/Panama`) — the resolved seed anchors, not full content.
- Migration `supabase/migrations/20260707235402_config_and_operational_tables.sql` applied via `supabase db push --linked`. Confirmed applied both locally and remotely via `supabase migration list --linked` (timestamp `20260707235402` on both sides; `supabase db push --linked --dry-run` reports "Remote database is up to date").
- Remaining tables live from that migration: `property_settings`, `teams`, `venues`, `venue_aliases`, `venue_descriptions`, `venue_hours`, `reservation_rules`, `menu_branches`, `menu_options`, `menu_option_aliases`, `menu_branch_triggers`, `answer_boundaries`, `response_templates`, `runtime_feature_flags`, `messages`, `complaint_details`, `incident_details`, `service_request_details`, `operational_events`, `runtime_packages` — structure only, no seed rows in any of them yet.
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
| Seed content production | Not yet produced. The seed *anchors* are now live (see above) and the *mapping locations* (`Demo_Data_to_Schema_Mapping_v0.3.md`) are resolved, but nobody has transformed the actual `property_master_data.json` / `menu_dictionary.json` / `response_templates_en.json` / `response_templates_es.json` content into concrete seed values (real team names, real venue list, real menu tree, real template bodies, real reservation thresholds, real service-request slot labels). |
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

Verified via a live local run: `/ops` returns 200 with the correct title, the old `/adm` route now 404s, and the nav bar's OPS badge correctly counts the 4 updated rows.

Supabase CLI installed and `supabase/migrations/` scaffolded; project linked (see Supabase project row above) — no longer pending.

## Reference
Full context: `Physical_Schema_v0.1.md`, `Database_Map_v0.1.md`, `Runtime_Config_Contract_v0.3.md` in this folder.
