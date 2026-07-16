# Webhook ↔ Tenant Mockup Unification v0.1

Status: context/handoff document — no implementation decisions made yet, written to let a fresh conversation pick this up without re-deriving the research below
Date: 2026-07-15
Source: live inspection of `webhook.js`, `src/fast_path/*.js`, `property_packages/demo/*.json`, `supabase_bridge/supabase_client.js`, cross-referenced with `docs/db_planning/Physical_Schema_v0.1.md`

## Why this document exists

While scoping a narrow fix (resolving `reservation_details.venue_id` at write-time — done, see `DB_Construction_Decisions_v0.1.md`), it became clear the webhook's guest-facing venue/menu matching is **not one system with a documented gap** — it's **three separate, non-cross-referenced systems already living inside the webhook**, none of which read from Supabase at all. Building "the runtime-package pipeline" (config tables → compiled package → webhook consumes) that was loosely scoped as future work is therefore not one task. This doc records exactly what exists today so that work can be scoped properly in a future session.

## The three disconnected venue/menu representations (confirmed by direct code trace)

1. **`KNOWN_RESERVATION_VENUES`** — `webhook.js:1393-1400`. A hardcoded array (`canonical` name + `aliases[]`) used only by `extractKnownReservationVenue()`/`extractSingleVenueFromReply()` (`webhook.js:1402-1442`) to parse free-text venue mentions during reservation conversations. This is what `supabase_bridge/supabase_client.js`'s `resolveVenueId()` matches against — see the venue_id fix.
2. **`property_master_data.json`'s `dining.venues[]`** — loaded via `loadPropertyPackage()` into `propertyData.propertyMasterData`, consumed only by `src/fast_path/fast_path_responder.js` (`getSelectableRestaurants`, `buildRestaurantList`, `resolveRestaurantByKey`) to render the "show me restaurants" list and resolve a selected venue by `menu_key`. Same 6 venues (+ excluded Room Service) as #1, but a completely separate data structure with its own fields (`menu_key`, `canonical_name`, `aliases`, `type`, `service_class`, `reservation_led`, etc. — this is the file the venue seed data for Supabase was sourced from).
3. **`menu_dictionary.json`'s menu tree** — loaded into `propertyData.menuDictionary`, consumed only by `src/fast_path/fast_path_classifier.js`'s `classifyFastPath()`. A denormalized tree keyed by context (`main_menu`, `restaurants_menu`, etc.), each with `options{}` and a flat `lookup{}`/`choice_aliases` map for matching guest input to a menu action.

**None of these three reference each other by ID.** They happen to agree today because someone kept them in sync by hand when the venue list was last updated. There is no structural link between "the venue a reservation was made for" (#1), "the venue shown in the restaurant list" (#2), and "the menu context a fast-path reply navigates to" (#3).

## Other confirmed findings

- **No build/compile step exists anywhere.** `package.json` has only `"start": "node webhook.js"`. No `build.js`/`compile.js`. Grep for `runtime_package`/`compile` across all `.js` files: zero hits.
- **The JSON files are re-read from disk on every relevant message, not cached.** `src/fast_path/property_loader.js`'s `safeRequireJson()` explicitly does `delete require.cache[...]` before every `require()` — this is a live disk read + parse on every fast-path turn, called from 4 separate sites in `webhook.js` (lines ~2910, 2981, 3426, 3937), each independently re-loading rather than sharing one cached object per request.
- **`fast_path_triggers.json` is dead code.** Nothing in the repo reads it — confirmed via repo-wide grep. The trigger-keyword concept it once held now lives inline inside `menu_dictionary.json`'s `lookup`/`choice_aliases` maps.
- **`response_templates_en.json`/`response_templates_es.json`/`response_templates.json`** are flat `{template_key: "string with {{placeholders}}"}` maps (~64-132 keys). Language is encoded by key-name suffix (`_en`/`_es`), not a `language` field. No `channel`, `approval_status`, or `required_variables` metadata — placeholders are implicit (discovered by reading the string), not declared. This is meaningfully simpler than the `response_templates` table already built in Supabase (`language`, `channel`, `approval_status`, `required_variables` columns).
- **Supabase's only current read from the webhook side** is the narrow `venues` FK lookup in `resolveVenueId()` (`supabase_bridge/supabase_client.js`) added for the venue_id fix — an exact-match lookup only, not a general config read. Confirmed via repo-wide grep: nothing reads `menu_branches`, `menu_options`, `menu_option_aliases`, `menu_branch_triggers`, `answer_boundaries`, `response_templates`, `reservation_rules`, `runtime_feature_flags`, `property_settings`, or `teams` from Supabase anywhere in the webhook or `src/`.
- **The Tenant Property Configuration Tool** (`Tenant_Property_Configuration_v0.2.html`, repo root) is a static HTML/CSS/JS mockup — state lives in browser `localStorage` only, zero backend, zero Supabase wiring, zero API calls. A UI hint string inside the file itself says *"This is the kind of structured data the webhook and LOGS could eventually read from Supabase"* — aspirational, not built.

## The open sequencing question (not yet decided)

Three ways to approach unifying this, discussed but not chosen:

1. **Unify the 3 in-repo sources first, bridge to Supabase second.** Lower risk, testable independently of Supabase — pick one canonical venue/menu model in-repo, migrate all 3 consumers (`extractKnownReservationVenue`, `fast_path_responder.js`, `fast_path_classifier.js`) to it, *then* build the Supabase bridge on top of one already-unified thing instead of three.
2. **Design the full end-state architecture first** (Supabase config → compiled runtime package → webhook consumes), then work backward to see what in-repo unification the end-state design forces.
3. **Patch-only, defer unification entirely.** Leave the 3 sources as-is, only fix specific gaps as they cause real problems (this is what the venue_id fix itself did — narrow, didn't touch this).

No decision was made on which path to take — that's the first thing to resolve in the next session.

## Critical files to load into context for this work

**Webhook fast-path system:**
- `webhook.js` — `KNOWN_RESERVATION_VENUES` (~1393-1400), `extractKnownReservationVenue`/`extractSingleVenueFromReply`/`extractReservationVenue` (~1402-1480+), the 4 `loadPropertyPackage()` call sites (~2910, 2981, 3426, 3937)
- `src/fast_path/property_loader.js` — `safeRequireJson`, `loadPropertyPackage`, `loadResponseTemplates`
- `src/fast_path/fast_path_responder.js` — `getSelectableRestaurants`, `buildRestaurantList`, `resolveRestaurantByKey`, `buildResponse`
- `src/fast_path/fast_path_classifier.js` — `classifyFastPath`

**Static config data (source of truth today):**
- `property_packages/demo/property_config.json` — loaded but **never actually read downstream** (dead weight, confirm before touching)
- `property_packages/demo/property_master_data.json` — `dining.venues[]` (7 entries incl. Room Service), `dining.reservation_facts`, `dining.hours_boundary`, `dining.escalation_routing`
- `property_packages/demo/menu_dictionary.json` — the `menus{}` tree
- `property_packages/demo/response_templates_en.json` / `response_templates_es.json` / `response_templates.json`
- `property_packages/demo/fast_path_triggers.json` — **dead, unreferenced**, confirm before deleting or reviving

**Supabase side (already built, mostly unused by the webhook):**
- `supabase_bridge/supabase_client.js` — `resolveVenueId()` is the one existing (narrow) Supabase config read
- `docs/db_planning/Physical_Schema_v0.1.md` — full target schema for `venues`, `venue_aliases`, `venue_descriptions`, `venue_hours`, `menu_branches`, `menu_options`, `menu_option_aliases`, `menu_branch_triggers`, `answer_boundaries`, `response_templates`, `reservation_rules`, `runtime_feature_flags`, `property_settings`, `teams`, `runtime_packages` (the never-built compiled-package table)
- `docs/db_planning/DB_Construction_Decisions_v0.1.md` — records the venue_id fix and originally flagged this exact gap as "Open — flagged as future work, not started"
- `docs/db_planning/Tenant_Management_Future_Considerations_v0.1.md` — explicit "do not build against this document yet" re: multi-tenant/auth; stay in single-tenant (`sol_demo`/`demo`) scope
- `Tenant_Property_Configuration_v0.2.html` (repo root) — the static mockup; treat any field/data shape in it as a *design reference*, not a working integration

## How to read the live database to continue this work

- **Python side** (reliable, already working): `cd logs && source venv/bin/activate`, then `from logs_db import get_client, get_property_id` — `get_client()` returns an authenticated `supabase-py` client (reads `logs/.env` via `python-dotenv`), `get_property_id()` resolves the single demo property's UUID. Query any table directly, e.g. `client.table("venues").select("*").eq("property_id", get_property_id()).execute()`.
- **Schema changes**: `supabase migration new <name>`, write SQL, then `supabase db push --linked --dry-run` to preview, `supabase db push --linked` to apply. This path works reliably.
- **Seed data**: do **not** rely on `supabase db push --linked --include-seed` — confirmed this session that it silently no-ops (updates its tracked hash without executing the SQL) when Docker isn't running locally, which it wasn't. Insert seed data directly via the Python client (`client.table(...).upsert(...)`) instead, and update `supabase/seed.sql` afterward for documentation purposes only, not as the actual application path.
- **Node/webhook side**: **Node.js is not installed on this Mac** (confirmed: no `node`/`npm`/`nvm` anywhere in PATH or standard install locations). `webhook.js` has apparently never been run locally — it only runs on Render. Verifying any webhook.js change requires committing, pushing to `dev` (Render auto-deploys from `dev`), and testing via a real WhatsApp message, then inspecting the result in Supabase via the Python path above.

## Project-level facts still true

- Single-tenant demo scope only: `tenant_key=sol_demo`, `property_key=demo`. No multi-tenant work in scope.
- Branch strategy: `dev` → `main`, all work happens on `dev`, Render auto-deploys from `dev`.
- RLS is enabled on every Supabase table with zero policies (deny-all except `service_role`, which bypasses it). Both the webhook and LOGS use the same `service_role` key — interim, documented, not yet scoped down.
- LOGS dashboard (`logs/logs_app.py`) already reads/writes Supabase directly (no ingestion script) — see `whatsapp_db_logs_adaptation_v0.1.md` for that unrelated but adjacent piece of work.

## Reference

Full context: `Physical_Schema_v0.1.md`, `DB_Construction_Decisions_v0.1.md`, `whatsapp_db_logs_adaptation_v0.1.md`, `Tenant_Management_Future_Considerations_v0.1.md` in this folder.
