# Session Handoff — Mockup Tool Kickoff

Status: context/handoff document — written so a fresh session (or a coworker pulling `dev`) can pick this up without re-deriving the research below. Read `README.md` → `SOL_DB_Master_Plan_v1.0.md` first for full background; this doc is the point-in-time "what just happened and what's next," not a durable reference.
Date: 2026-07-22

## What happened this session

1. **Resolved the runtime-consumption-model design** (chokepoint #1 of the sequencing in `SOL_DB_Master_Plan_v1.0.md` section 3): compile trigger (tenant-edit only, not per-message), completeness rule (leave undefined fields out, no error), referential-integrity rule (anything defined must resolve to something real — narrow check, decided this session), versioning, rollback (tenant-side config download, not server-side history), and the generic-graph-walker direction for the eventual webhook rewire (gated, see below).
2. **Built and ran `logs/seed_kb_from_demo_package.py`** — migrated the demo property's `property_packages/demo/*.json` files into the Supabase config tables. Verified against source data.
3. **Built and ran `logs/compile_runtime_package.py`** — compiles those config tables into one `runtime_packages.package_json` row (v1, live for the demo property). Verified the `next_branch_key` graph and answer boundaries round-trip correctly.
4. **`webhook.js` was not touched** — nothing reads `runtime_packages` yet. That rewrite is explicitly gated on the mockup tool existing and being proven with at least one tenant (your own stated condition this session).
5. **Read all remaining `docs/db_planning/` files** and found a real, unresolved conflict — see below.
6. **Consolidated the whole `docs/db_planning/` folder**: all v0.1/v0.3 planning-round docs merged into `SOL_DB_Master_Plan_v1.0.md`; originals preserved via `git mv` into `old_planning_docs/` (nothing deleted); every stale cross-reference to the moved files, across 10 files including code comments in `logs/` and `supabase_bridge/`, was found and corrected.

## ⚠️ The conflict to resolve before starting the mockup tool

An earlier, previously-accepted planning round (`old_planning_docs/Tenant_Property_Configuration_vs_Canonical_Schema_Gap_List_v0.3.md`, 2026-07-05) explicitly decided:

> Keep out of tool v0.3: **Full menu tree editing**... **Menu structure should be SOL/Admin-owned in v0.3.**

This session, you said:

> "tenant should be able to add further branches"

These directly contradict each other, and it changes what the mockup tool's core job is. Before building it, decide one of:
- The old v0.3 boundary still holds — menu structure (branches) stays SOL/Admin-owned; the tenant edits content *within* SOL/Admin-defined branches (labels, aliases, hours, descriptions, template wording) but can't create a new branch type.
- Your statement this session overrides it — tenants can add their own branches, meaning the tool needs real menu-tree-authoring UI, not just field-editing forms.
- A hybrid — e.g., tenants can add *options* within existing branch types (a new venue, a new service-request slot) but adding a wholly new *branch* (a new top-level conversation category) stays SOL/Admin-reviewed.

Full context and the rest of the v0.3 field-ownership split (property-editable vs. SOL/Admin-owned): `SOL_DB_Master_Plan_v1.0.md` section 5.

## Ranked next steps (from this session's prioritization discussion)

1. **Build the mockup tool, configure the first demo tenant end-to-end** — highest value. Resolves the conflict above as a prerequisite. This is the actual bottleneck: nothing today lets a *second* tenant get configured without hand-writing another migration script.
2. **Fast-path `if`-block rewrite → generic branch walker** — deliberately not yet. Gated on #1 existing and being proven with a real tenant, by your own stated rule.
3. `menu_options.case_type`/`dept_target`/`template_key` definition, and `runtime_feature_flags` ownership moving to tenant-editable — not separate work, these fall out of #1 as fields the tool needs to expose.
4. LOGS dashboard functionality and multi-user/role setup — a separate axis (tenant *staff* triage vs. tenant *admin* config), doesn't block or get blocked by #1. You already deferred this yourself at the very start of this whole effort.

## The concrete workflow #1 will exercise (your framing, this session)

Build the mockup tool → edit the demo config's variables through it → push/pull that data to/from Supabase → recompile the runtime package (`compile_runtime_package.py` or its eventual replacement) → test. This loop is the thing to validate; it's also the first real stress-test of whether the schema and compiled-package shape hold up outside of "migrate an already-clean JSON file."

## Smaller open items (not blocking, tracked in full in `SOL_DB_Master_Plan_v1.0.md` section 9)

- Referential-integrity check + a warning/flag so a broken reference doesn't stall a guest conversation silently — decided in principle this session, not yet built.
- Compare compiled `package_json` against the current file package as a cheap validation pass — not yet done.
- `"__back"` navigation semantics and the branch-level reprompt-template column — deferred to the webhook-rewire session.
- `team_name_2` unused `handoff_team_key` quirk — documented, doesn't affect anything today.

## Key artifacts

- `logs/seed_kb_from_demo_package.py`, `logs/compile_runtime_package.py` — the two scripts built this session.
- `docs/db_planning/SOL_DB_Master_Plan_v1.0.md` — full consolidated architecture/design reference.
- `docs/db_planning/DB_Construction_Decisions_v0.1.md` — still-growing decision log.
- `docs/db_planning/Physical_Schema_v0.1.md` — schema of record.
- `docs/db_planning/old_planning_docs/` — archived originals, only needed to recheck something against its source.
