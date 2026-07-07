# SOL Database Map v0.1

Status: proposal for review
Date: 2026-07-06
Scope: database construction map after schema review corrections

## Purpose

This map translates the accepted review decisions into one practical database shape before construction.

It is not a migration script and does not authorize runtime, webhook, LOGS, Voiceflow, or ElevenLabs changes.

## High-Level Map

```text
Tenant / Property Configuration
  -> normalized Supabase tables
  -> Menu Runtime Builder
  -> published runtime package
  -> SOL Menu Runtime Service
  -> webhook / WhatsApp now / voice later

Operational guest activity
  -> guest_threads
  -> messages
  -> cases
  -> case detail tables
  -> operational_events
  -> LOGS / reporting
```

## Configuration Tables

These tables hold tenant/property truth and publish into the runtime package.

```text
tenants
properties
property_settings
teams
venues
venue_aliases
venue_descriptions
venue_hours
reservation_rules
menu_branches
menu_options
response_templates
runtime_feature_flags
```

Key ownership rule:

```text
Property users may edit presentation/content settings.
SOL/Admin owns stable keys, IDs, routing, runtime flags, tenant status, and secrets.
```

## Runtime Package Boundary

The normalized DB remains the source of truth. Live guest turns should not assemble data from many normalized tables.

The runtime package should include only deterministic execution data:

```text
property identity
concierge name
default language
supported languages
active menu branches and options
menu labels and aliases
venue labels, aliases, visibility, descriptions, and hours where approved
reservation rules
team routing map
response template bodies
service request slot labels
runtime feature flags
```

Voiceflow initialization variables should be derived from approved DB/config variables defined in the schema and runtime package contract.

## Operational Tables

Every actionable guest/staff item creates a parent `cases` row. Type-specific facts live in a 1:1 detail table.

```text
guest_threads
messages
cases
reservation_details
complaint_details
incident_details
service_request_details
operational_events
```

Accepted rule:

```text
Common operational fields live on cases.
Type-specific fields live in the relevant detail table.
```

## Parent Case Model

`cases` is the operational source of truth for LOGS, routing, lifecycle, reporting, and deduplication.

Recommended core fields:

```text
id
tenant_id
property_id
guest_thread_id
case_type
dept_target
assigned_team_id
status
priority
guest_name
guest_phone
source_channel
source_message_id
summary
created_at
updated_at
closed_at
closed_by
```

Accepted MVP status values:

```text
new
open
assigned
waiting_guest
waiting_staff
resolved
closed
cancelled
```

Accepted priority values:

```text
low
normal
high
urgent
```

## Detail Tables

Each child detail table is 1:1 with `cases`.

Accepted ID rule:

```text
case_id is both the primary key and foreign key.
Do not duplicate property_id or guest_thread_id on detail tables.
```

### reservation_details

```text
case_id
venue_id
requested_date
requested_time
party_size
reservation_name
special_requests
```

Reservation drafts remain transient conversation state and are not persisted until submitted/finalized.

### complaint_details

```text
case_id
complaint_category
severity
location_text
guest_impact
resolution_notes
```

### incident_details

```text
case_id
incident_category
severity
location_text
people_involved
resolution_notes
```

### service_request_details

Generic fallback for service areas that do not justify dedicated schema.

```text
case_id
service_request_type
service_area_label
requested_date
requested_time
guest_count
location_text
notes
```

MVP service request slots:

```text
service_request_1
service_request_2
service_request_3
```

The Tenant Property Configuration Tool can label these slots per property, for example Spa, Gym, Beach Club, Private Chef, or Kids Club.

## Transportation And Shows

Accepted MVP rule:

```text
Transportation and Shows do not automatically become full domains.
```

Default modeling:

```text
Transportation -> service_request_details unless logistics require a dedicated table later.
Shows -> venues with venue_type = show unless ticketing/seat/schedule complexity requires more later.
Room Service -> service_request_details (service, not a venue). case_type is service_request, not reservation.
```

## Messages

Use one `messages` table with `direction`, not separate inbound/outbound tables.

Always store clean conversation fields:

```text
id
tenant_id
property_id
guest_thread_id
case_id
direction
channel
sender_type
message_text
sent_at
created_at
```

Accepted raw payload rule:

```text
raw_payload is optional/selective diagnostic data.
Store it only when debug, audit, dispute, or case-impacting context requires it.
```

## Operational Events

`operational_events` tracks business/audit actions around cases.

Examples:

```text
case_created
case_assigned
status_changed
template_sent
staff_note_added
case_closed
delivery_failed
```

Technical runtime errors stay in logs by default unless they directly affect a case and need manager visibility.

## LOGS Boundary

LOGS consumes `cases` as the operational source of truth and joins detail/message/event data when needed.

LOGS does not own:

```text
tenant truth
property configuration
menu trees
template editing
runtime package publication
deployment secrets
```

## Migration / Seed Order

Accepted order:

```text
1. tenants
2. properties
3. teams / departments
4. venues
5. menu branches / options
6. templates / settings / rules
7. generate runtime package
8. validate runtime behavior
9. begin writing cases / messages / events
```

## Retired Proposal Objects

These should not appear in the final canonical schema:

```text
reservation_requests
complaint_incidents
inbound_messages
outbound_messages
schema_review_comments
```
