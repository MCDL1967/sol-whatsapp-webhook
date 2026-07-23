# SOL Database & Runtime Master Plan v1.0

Status: consolidated master planning doc — supersedes the individual v0.1/v0.3 planning-round docs, which are preserved (not deleted) in `old_planning_docs/` for archival/recheck. Two documents remain outside this consolidation because they're actively-maintained current state, not background: `Physical_Schema_v0.1.md` (schema of record) and `DB_Construction_Decisions_v0.1.md` (decision log). This doc links to both rather than duplicating them.
Date: 2026-07-22

## How to read this

1. Section 1 (below) — what's actually live right now.
2. `DB_Construction_Decisions_v0.1.md` — the authoritative, still-growing decision log; read it for anything about current DB state.
3. `Physical_Schema_v0.1.md` — full live schema.
4. Sections 2-9 below — consolidated architecture, design decisions, scope boundaries, and open items from every prior planning round.
5. `old_planning_docs/` — archived originals, only needed if something below needs to be rechecked against its source.

## 1. Where things stand (current live state)

- Supabase project `sol_whatsapp_webhook_main` (ref `muhahnfodnnplrizefhu`), full schema from `Physical_Schema_v0.1.md` live.
- All config tables seeded from the demo property's `property_packages/demo/*.json` files (`logs/seed_kb_from_demo_package.py`, 2026-07-21) — venues, teams, menu branches/options/aliases/triggers, response templates, reservation rules, answer boundaries, runtime feature flags, property settings all populated for `sol_demo`/`demo`.
- First runtime package compiled (`logs/compile_runtime_package.py`, 2026-07-22) — `runtime_packages` holds v1 for the demo property.
- `webhook.js` is **untouched** — it still reads the static JSON files in `property_packages/demo/`, completely disconnected from everything above. Nothing currently reads `runtime_packages`.
- LOGS dashboard (`logs/logs_app.py`) reads/writes Supabase directly, no local SQLite, confirmed working (venue names resolve, team display names/scopes reflect the seed migration).

## 2. Architecture overview

```text
Tenant Property Configuration Tool (not yet built)
  -> normalized Supabase config tables
  -> compile step (logs/compile_runtime_package.py today; a real build/publish
     pipeline once the tool exists)
  -> runtime_packages.package_json
  -> (future) SOL Menu Runtime Service / rewired fast_path_* -- gated, see section 4
  -> webhook.js -> WhatsApp

Operational guest activity (already live, unaffected by any of the above):
  guest_threads -> messages -> cases -> case detail tables -> operational_events -> LOGS
```

Key principle carried forward from the original v0.3 review round and reconfirmed this session: **the normalized DB is the source of truth for editing/governance; the compiled package is the fast, cached read model for guest turns.** Guest-specific data (an open reservation, an in-progress incident, session state) never enters the package — it lives in the operational tables above and changes per-message; the package only changes when a tenant edits their config.

## 3. Runtime package compilation — resolved design

(Implemented in `logs/compile_runtime_package.py`, design decided 2026-07-22.)

1. **Trigger**: compile only on tenant config edit, not per guest message, not scheduled. Every run is currently a manual script invocation and is treated as an immediate publish (`published_at` set at insert time) — there's no separate draft/review gate for the whole package yet (only `response_templates.approval_status` gates wording today).
2. **Completeness**: no requirement. A `menu_options.next_branch_key` (or any other optional field) with nothing defined is simply left null — not an error.
3. **Referential integrity** (decided 2026-07-22, not yet implemented): anything that *does* have a value — `next_branch_key`, team references, etc. — must resolve to something that actually exists in the compiled set. Narrow, cheap existence check, not a full completeness/rules engine. Rationale: completeness-vs-integrity are separate questions; the completeness rule (#2) is right for where the project is, but silently allowing a *dangling* reference (a typo'd `next_branch_key` pointing at a branch that doesn't exist) risks a guest conversation stalling with nobody told there's a bug.
   - **Follow-up flagged, not yet built**: add a warning/flag surfaced somewhere (compile-time log, future mockup-tool UI) specifically so a broken reference doesn't fail silently — still needs a concrete design (where does the warning show up, who sees it) once the mockup tool exists.
4. **Versioning**: simple auto-incrementing integer (stored as text, per `runtime_packages.runtime_package_version`), assigned automatically by the compile script.
5. **Rollback**: no server-side package version history is consumed anywhere yet (though every compile run does insert a new row, so history exists for free). Primary rollback mechanism will be the future mockup tool letting a tenant download their own config as a file. Distinguish from *code* rollback, which is handled by the existing `dev`/`main` git branch separation.
6. **Compile logic**: a script, structurally the mirror of the seed script — reads Supabase config tables, writes one `package_json` blob. Manual today; automating "tenant clicks Publish" waits until the mockup tool exists.
7. **Package contents**: everything populated by the seed migration — property identity/settings, teams, venues (+ aliases + descriptions), reservation rules, menu branches/options/aliases/triggers, answer boundaries, runtime feature flags, response templates (both languages). No guest-specific data (per section 2).
8. **Generic graph-walker, confirmed** as the eventual replacement for `fast_path_classifier.js`/`fast_path_responder.js`'s hardcoded per-context `if` blocks, because tenants need to be able to add menu branches the code was never written to know about. **This directly conflicts with an earlier accepted v0.3 decision — see section 5's flagged conflict below, not yet resolved.**
9. **Caching**: webhook (once rewired) loads the package once, keeps it in memory, reloads only when a new version is published — falls out of #1.
10. **Cutover strategy**: big-bang swap of all 4 current JSON-load call sites, not an incremental parallel-run — acceptable given the `dev`/`main` branch safety net.
11. **Sequencing gate**: the actual rewrite of `fast_path_classifier.js`/`fast_path_responder.js` is deferred until the Tenant Property Configuration Tool exists and has been proven end-to-end with at least one tenant configured similarly to the demo property.

## 4. The future SOL Menu Runtime Service (not built, relevant once the gate in 3.11 is met)

Carried forward from the original `SOL_Menu_Runtime_Service_v0.3.md` proposal — this already sketches much of what a "generic graph-walker" needs to become and should be read before the actual rewrite, not re-derived from scratch.

Proposed request shape:
```json
{
  "property_key": "demo",
  "runtime_package_version": "2026-07-05.1",
  "session": {
    "current_language": "en",
    "fast_path_context": "restaurant_followup_menu",
    "selected_restaurant_key": "fenicia",
    "active_request_type": null
  },
  "input": { "raw_text": "2", "normalized_text": "2" }
}
```

Proposed response shape:
```json
{
  "handled": true,
  "result_type": "restaurant_followup_selection",
  "option_key": "new_reservation",
  "next_context": "restaurant_followup_menu",
  "template_key": "restaurant_new_reservation_prompt_en",
  "template_replacements": { "restaurant_name": "Fenicia" },
  "session_patch": { "selected_restaurant": "Fenicia", "active_request_type": "reservation" },
  "handoff": null,
  "reason": "context_lookup"
}
```

**Responsibilities**: context lookup, numeric/text/leading-choice resolution, list-trigger handling, back/menu/reset sentinel interpretation, next-context transition, template selection, venue carry-forward, branch stay/reprompt selection, deterministic handoff classification, invalid-input response.

**Explicitly not this service's job**: WhatsApp transport, Meta status processing, Voiceflow API transport, LOGS report generation, credential storage, tenant admin auth, free-form AI reasoning, DB table editing, final schema ownership.

**Still-open questions from that original proposal, unresolved**: internal module vs. separate HTTP service; which invalid inputs reprompt vs. fall through to Voiceflow/LLM; does template rendering happen in the service or the webhook/responder layer; is session patching advisory or authoritative. None of these need answers until the rewrite actually starts.

## 5. Tenant Property Configuration Tool (mockup tool) — scope

Carried forward from `Tenant_Property_Configuration_vs_Canonical_Schema_Gap_List_v0.3.md` (2026-07-05 review round, accepted at the time):

**Property-editable** (tenant-facing): venue display names, venue descriptions, venue hours, reservation rules/policy thresholds, response template wording, concierge name, default language, menu labels, service request slot labels.

**SOL/Admin-owned** (not tenant-editable): stable IDs and keys (`venue_key`, `team_key`, menu branch keys), `dept_target` routing, runtime flags, tenant status, deployment secrets, webhook credentials.

**⚠️ Flagged conflict, not yet resolved**: that same accepted v0.3 decision explicitly says to **keep "full menu tree editing" out of the tool** and that **"menu structure should be SOL/Admin-owned"** — directly contradicting what was said this session (2026-07-22): *"tenant should be able to add further branches."* This has to be resolved before mockup tool design starts, since it changes what the tool's core job is. Carried into the next-steps doc as the first thing to decide.

Also still true from that review round, not superseded by anything since: menu lookup aliases, list triggers, response template governance fields (approval status), runtime feature flags, and the entire operational side (messages/cases/detail tables/events) were explicitly recommended to stay **out** of the wizard's v0.3 scope — worth re-confirming these are still out of scope given the "tenant can add branches" statement, since that statement may have quietly expanded the intended scope further than just menu branches.

## 6. Hardcode retirement plan

Carried forward from `Hardcode_Retirement_Matrix_v0.3.md`. Migration sequence and current status:

1. Define/approve the SOL Menu Runtime Service boundary — proposed (section 4), not approved/built.
2. Define normalized schema and seed mapping — **done** (`Physical_Schema_v0.1.md`, `Demo_Data_to_Schema_Mapping_v0.3.md`).
3. Seed current demo data into normalized tables — **done** (KB seed migration, section 1).
4. Generate the published runtime package from DB seed — **done** (compile script, section 1).
5. **Compare generated config against the current file package — not yet done.** Worth doing as a cheap validation pass (diff `package_json` against `property_master_data.json`/`menu_dictionary.json`/`response_templates_*.json`) before trusting the compiled package for anything real — flagged as a candidate small task, not yet scheduled.
6. Only after review, plan the runtime read-path migration — this is the gated webhook rewire (section 3.11).
7. Retire hardcodes in small, separately-approved patches — not started.

Highest-priority hardcodes still live in `webhook.js` today, unchanged: verify token literal, `America/Panama` timezone constant, large-party threshold `8`, `KNOWN_RESERVATION_VENUES`, welcome copy, loyalty facts in the middleware prompt. None of these have moved yet — they're all still hardcoded pending the gated rewire.

## 7. LOGS dashboard — status

Carried forward from `whatsapp_db_logs_adaptation_v0.1.md`. Direct Supabase connection is live and confirmed working (no local SQLite, no ingestion script). Known, accepted limitations, not bugs:

- Excel/Drive export (`logs_export.py`) is intentionally stubbed — its ~30 legacy columns don't map to the new schema; rewriting it is separate, unscheduled scope.
- The old JSONL task-queue pipeline (`logs_ingest.py`, `logs_migrate_xls.py`, `webhook.js`'s `/logs/tasks/*` routes) is dead but left in place, not deleted.
- LOGS uses the same `service_role` key as the webhook — no LOGS-specific auth/role scoping exists, since no real Supabase Auth users exist for LOGS yet. This is the direct blocker for "setting up different users/team members who can edit the LOGS dashboard" — see section 8, this is explicitly deferred multi-tenant/auth territory, not a LOGS-specific gap.

## 8. Explicitly deferred / out of scope for now

Carried forward from `Tenant_Management_Future_Considerations_v0.1.md`, reconfirmed by everything since — do not act on these without a decision first:

- Tenant onboarding workflow (no tool exists to create a new tenant today).
- System administration workflow for SOL (approving tenants, user-count limits, roles, billing/subscription status — no billing concept exists anywhere in the schema).
- Per-tenant security / multi-user sub-accounts (no `users`/`tenant_users` table exists at all; no real Supabase Auth users exist for the webhook, LOGS, or the future mockup tool).
- Granular RLS policies for Property Admin / SOL Admin / LOGS-read roles — currently just `service_role` bypass + deny-all; per-role policies wait on those tools having real Auth users to scope against.
- Whether `tenant_id` needs to exist directly on every table (defense-in-depth) vs. scoping through `property_id` — currently inconsistent (operational tables carry both; config tables only carry `property_id`). Not urgent until real multi-tenant work begins.
- Voice/ElevenLabs channel support — modeled only as a future "channel and integration capability," not a property fact. No active implementation exists. Explicitly not to be overbuilt before the product path is approved.

## 9. Open items / growing revisions list

Everything still unresolved, consolidated from `DB_Construction_Decisions_v0.1.md`'s open-items table plus this session's findings:

- **The menu-tree-ownership conflict (section 5)** — needs a decision before mockup tool design starts.
- `menu_options.case_type`/`dept_target`/`template_key` — confirmed unbuilt anywhere except one hardcoded reservation case (`"reservation"`/`"FNB"` in `supabase_client.js`). Genuinely new config surface the mockup tool needs to define.
- `runtime_feature_flags` ownership — schema currently says "SOL/Admin controlled"; working assumption is these should move to tenant/Property-Admin-editable (per this session), similar to `property_settings`. Not yet implemented.
- Referential-integrity validation + the "don't stall silently" warning/flag (section 3.3) — decided in principle, not yet built.
- `team_name_2` ("Reservations") unused `handoff_team_key` — every venue in the source JSON points to `team_name_1` regardless of reservation status. Documented, not fixed; doesn't affect anything since no code path uses `handoff_team_key` for routing today.
- Branch-level reprompt/fallback template (`fast_path_responder.js`'s `stayMap`) — no schema column exists. Deferred to the webhook-rewire session.
- `"__back"` navigation target semantics — code always routes to `main_menu`, not to `parent_branch_key`. Not yet decided whether the future runtime should preserve this or move to parent-based back navigation.
- Compare compiled `package_json` against the current file package (section 6, step 5) — cheap validation pass, not yet done.
- Typo/fuzzy venue matching — `webhook.js`'s alias matching is exact-phrase only. Only worth revisiting alongside the full rewrite.

## Reference

Schema of record: `Physical_Schema_v0.1.md`. Decision log: `DB_Construction_Decisions_v0.1.md`. Archived originals this document consolidates: `old_planning_docs/`.
