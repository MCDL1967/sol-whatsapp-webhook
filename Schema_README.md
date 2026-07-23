# SOL Schema Review Instructions

Status: review instructions only
Scope: schema proposal, tenant/property configuration mockup, and DB planning packet

## Purpose

This review packet is for aligning the SOL database model, tenant/property configuration flow, deterministic menu runtime boundary, and review comments before DB construction begins.

These files are review artifacts. They do not build a database, change runtime behavior, modify `webhook.js`, or alter LOGS.

## Files to Review

1. `Schema_Proposal_v0.4.html`
   - Main schema review portal.
   - Use this file to review the accepted hybrid `cases` model, database map, table catalog, field matrix, ERD, and decisions.
   - This file supports reviewer names, OK markers, notes, export JSON, import JSON, and PM review by collaborator.

2. `Tenant_Property_Configuration_v0.2.html`
   - Tenant Property Configuration Tool mockup.
   - Use this file to review the configuration flow and the live internal/external previews.
   - This file is not a production admin tool and does not write to Supabase.

3. `docs/db_planning/README.md`
   - Planning packet index.
   - Use this as the entry point for deeper review of the database map, runtime config, menu runtime service, demo data mapping, voice scope, hardcode retirement, and schema/tool gaps.

## How to Review `Schema_Proposal_v0.4.html`

1. Open `Schema_Proposal_v0.4.html` in your browser.
2. When prompted, enter your reviewer name.
3. For each review target:
   - Click `OK` if the item is acceptable and needs no comment.
   - Click `N` if you need to leave a note.
4. Use notes for:
   - missing fields
   - unclear ownership
   - wrong table placement
   - runtime concerns
   - LOGS/reporting concerns
   - migration blockers
   - MVP vs later scope concerns
5. When finished, click `Export feedback JSON`.
6. Send the exported JSON file to the project manager.

Expected exported filename:

```text
SOL_Schema_Proposal_v0.4_feedback.json
```

## How the Project Manager Reviews Feedback

Feedback is browser-local until exported. The project manager cannot automatically see comments stored on each collaborator's machine.

To consolidate review feedback:

1. Collect each collaborator's exported `SOL_Schema_Proposal_v0.4_feedback.json`.
2. Open `Schema_Proposal_v0.4.html` locally.
3. Click `Import feedback JSON` once for each collaborator file.
4. Use the sidebar section `Reviewers / Revisores` to inspect:
   - all reviewers together
   - each individual reviewer
   - that reviewer's OKs
   - that reviewer's pending items
   - that reviewer's notes

The consolidated view remains local to the project manager's browser unless exported again.

## How to Review `Tenant_Property_Configuration_v0.2.html`

1. Open `Tenant_Property_Configuration_v0.2.html` in your browser.
2. Review the property basics, teams, venues, dining rules, and export previews.
3. Confirm whether the live previews make sense:
   - Internal preview / Vista interna
   - External guest preview / Vista externa
4. Send written notes to the project manager for:
   - missing tenant/property fields
   - confusing labels
   - missing preview behavior
   - fields that should not be tenant-editable
   - items that belong in admin/runtime ownership instead of the tool

This mockup does not currently export embedded review comments.

## What to Send Back

Each reviewer should send:

1. Exported schema feedback JSON from `Schema_Proposal_v0.4.html`.
2. Written notes for `Tenant_Property_Configuration_v0.2.html`.
3. Any DB construction blockers.
4. Any MVP vs later recommendations, especially for voice, ElevenLabs, analytics, automation, and advanced menu configuration.

## What Not to Do

Do not:

- edit `webhook.js`
- edit LOGS runtime files
- build or migrate the DB
- treat these HTML files as production admin/runtime code
- push unrelated changes
- rename or restructure review artifacts without approval

## Sync Instructions for Collaborators

After the project manager commits and pushes this packet:

1. Pull the latest repo changes.
2. Open the two HTML files locally in a browser.
3. Complete your review.
4. Export and send back your schema feedback JSON.
5. Send separate written notes for the Tenant Property Configuration Tool.

## Current Review Boundary

The key architecture assumption under review is:

```text
Normalized DB
  -> Menu Runtime Builder
  -> published menu runtime package
  -> SOL Menu Runtime Service
  -> webhook transport / WhatsApp now / voice later
```

Live guest turns should not require the webhook to reason across raw normalized tables.

## v0.4 Schema Decisions Reflected

- `cases` is the parent operational record for LOGS, routing, lifecycle, and reporting.
- `reservation_details`, `complaint_details`, `incident_details`, and `service_request_details` are 1:1 child tables.
- `messages` replaces separate inbound/outbound message tables and uses `direction`.
- Clean message fields are stored always; `raw_payload` is selective diagnostic/audit data.
- `schema_review_comments` is not part of the product DB.
- Voiceflow remains the current runtime boundary; init variables derive from approved DB/config variables.
- See `docs/db_planning/old_planning_docs/Database_Map_v0.1.md` for the accepted database map.
