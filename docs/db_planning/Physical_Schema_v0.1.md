# SOL Physical Schema v0.1

Status: draft for review, not executable
Date: 2026-07-07
Source: `Database_Map_v0.1.md`, `Schema_Proposal_v0.4.html`, accepted review decisions

## Purpose

This document translates the accepted logical database map into a first physical Supabase/Postgres schema draft.

It is not a migration script. It does not authorize creating tables, changing runtime behavior, editing `webhook.js`, changing LOGS, or wiring Supabase to production.

## Replacement Placeholders

Use this table as the first stop when final project details are available. Each placeholder is identified by location so it can be replaced quickly.

| Placeholder | Location | Needed value | Current draft value |
|---|---|---|---|
| `{{SUPABASE_PROJECT_REF}}` | Section: Supabase Target | Dev Supabase project ref/name | TBD |
| `{{DB_SCHEMA_NAME}}` | Section: Supabase Target | Postgres schema name | `public` |
| `{{TENANT_KEY_DEMO}}` | Section: Seed Anchors | Canonical demo tenant key | `sol_demo` |
| `{{PROPERTY_KEY_DEMO}}` | Section: Seed Anchors | Canonical demo property key | `demo` |
| `{{PROPERTY_DISPLAY_NAME}}` | Section: Seed Anchors | Demo property display name | `Your Casino` |
| `{{DEFAULT_TIMEZONE}}` | Section: Seed Anchors | Default property timezone | `America/Panama` |
| `{{DEFAULT_LANGUAGE}}` | Section: Seed Anchors | Default runtime language | `en` |
| `{{SERVICE_ROLE_NAME}}` | Section: Roles And Access | Runtime service role / DB role | TBD |
| `{{LOGS_READ_ROLE}}` | Section: Roles And Access | LOGS read role / policy role | TBD |
| `{{PROPERTY_ADMIN_ROLE}}` | Section: Roles And Access | Property admin app role | TBD |
| `{{SOL_ADMIN_ROLE}}` | Section: Roles And Access | SOL admin app role | TBD |
| `{{RUNTIME_PACKAGE_STORAGE}}` | Section: Runtime Package Publication | Storage mode for runtime package | TBD: JSONB row / generated file / cache |
| `{{MIGRATION_TOOL}}` | Section: Migration Execution | Migration runner/tool | TBD: Supabase SQL editor / CLI / migrations |
| `{{EXTENSION_UUID}}` | Section: Extensions | UUID extension choice | `pgcrypto` |
| `{{EXTENSION_UPDATED_AT}}` | Section: Extensions | Updated-at trigger helper approach | TBD |

## Supabase Target

```text
Project: {{SUPABASE_PROJECT_REF}}
Schema: {{DB_SCHEMA_NAME}}
Migration tool: {{MIGRATION_TOOL}}
```

Recommendation for MVP: keep objects in `public` unless Supabase/RLS strategy requires a separate schema.

## Extensions

Recommended:

```sql
create extension if not exists pgcrypto;
```

Use `gen_random_uuid()` for primary keys unless the Supabase project standard requires another UUID strategy.

## Naming Rules

- Table names use plural snake_case.
- Stable runtime keys use lowercase snake_case text.
- Primary keys are UUID unless a 1:1 detail table uses `case_id` as both primary key and foreign key.
- Timestamps use `timestamptz`.
- JSON payload fields use `jsonb`.
- System-managed fields should be visible in review tools but not reviewer-actionable.

## Common Columns

Most tables should include:

```text
id uuid primary key default gen_random_uuid()
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Exceptions:

- 1:1 case detail tables use `case_id` as primary key.
- Pure join tables, if added later, may use composite keys.
- Append-only tables may omit `updated_at` unless updates are expected.

## Enum Drafts

These may be implemented as Postgres enums or `text check (...)` constraints. Recommendation for early iteration: use `text check` constraints unless enum immutability is desired immediately.

### tenant_status

```text
active
trial
pending_setup
suspended
cancelled
```

### language_code

```text
en
es
```

### case_type

```text
reservation
complaint
incident
service_request
```

### case_status

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

### case_priority

```text
low
normal
high
urgent
```

### message_direction

```text
inbound
outbound
```

### message_channel

```text
whatsapp
voice
web
internal
```

### sender_type

```text
guest
system
staff
assistant
admin
```

### service_request_type

```text
service_request_1
service_request_2
service_request_3
```

### operational_event_type

MVP seed set:

```text
case_created
case_assigned
status_changed
template_sent
staff_note_added
case_closed
delivery_failed
```

Technical runtime errors remain in logs by default unless they directly affect a case and need manager visibility.

## Configuration Tables

These tables hold tenant/property truth and publish into the runtime package.

### tenants

Purpose: client organization account.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `tenant_key` | text | yes | Unique stable key |
| `display_name` | text | yes | Human-readable tenant name |
| `status` | text | yes | `tenant_status`; gates live processing |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints / indexes:

```sql
unique (tenant_key)
check (status in ('active','trial','pending_setup','suspended','cancelled'))
```

### properties

Purpose: physical property/site under a tenant.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `tenant_id` | uuid | yes | FK -> `tenants.id` |
| `property_key` | text | yes | Stable key unique within tenant |
| `display_name` | text | yes | Property-facing name |
| `timezone` | text | yes | Default `{{DEFAULT_TIMEZONE}}` for demo |
| `status` | text | yes | Suggested: `active`, `inactive`, `setup` |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints / indexes:

```sql
unique (tenant_id, property_key)
index (tenant_id)
```

### property_settings

Purpose: one row of runtime-facing property settings.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `property_id` | uuid | yes | PK and FK -> `properties.id` |
| `concierge_name` | text | yes | Property editable |
| `default_language` | text | yes | `language_code` |
| `supported_languages` | text[] | yes | Default `['en','es']` |
| `phone_region` | text | no | Later validation TBD |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints:

```sql
check (default_language in ('en','es'))
```

### teams

Purpose: stable routing teams with property-facing display names.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `property_id` | uuid | yes | FK -> `properties.id` |
| `team_key` | text | yes | SOL/Admin owned stable key |
| `display_name` | text | yes | Property editable display value |
| `dept_target` | text | yes | SOL/Admin routing target, e.g. `FNB`, `HSK`, `SEC`, `OPS` |
| `scope` | text | no | Optional operational description |
| `active` | boolean | yes | Default true |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints / indexes:

```sql
unique (property_id, team_key)
index (property_id, dept_target)
```

Open item: final allowed `dept_target` values.

### venues

Purpose: restaurants, bars, room service, amenities, shows, or guest-facing service points.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `property_id` | uuid | yes | FK -> `properties.id` |
| `venue_key` | text | yes | SOL/Admin owned stable key |
| `display_name` | text | yes | Property editable |
| `venue_type` | text | yes | Example: `restaurant`, `bar`, `room_service`, `show`, `amenity` |
| `reservation_enabled` | boolean | yes | Default false |
| `show_in_runtime_menu` | boolean | yes | Default true |
| `active` | boolean | yes | Default true |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints / indexes:

```sql
unique (property_id, venue_key)
index (property_id, venue_type)
```

### venue_aliases

Purpose: search and natural-language aliases for venues.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `venue_id` | uuid | yes | FK -> `venues.id` |
| `alias` | text | yes | Runtime lookup alias |
| `language` | text | no | `language_code`, null means all |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints / indexes:

```sql
unique (venue_id, alias, language)
index (alias)
```

### venue_descriptions

Purpose: localized venue descriptions.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `venue_id` | uuid | yes | FK -> `venues.id` |
| `language` | text | yes | `language_code` |
| `short_description` | text | no | Runtime/menu list copy |
| `long_description` | text | no | Detail copy |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Primary key:

```sql
primary key (venue_id, language)
```

### venue_hours

Purpose: configured operating hours and exceptions.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `venue_id` | uuid | yes | FK -> `venues.id` |
| `day_of_week` | smallint | yes | 0-6 or 1-7 convention TBD |
| `open_time` | time | no | Null if closed or all-day |
| `close_time` | time | no | Null if closed or all-day |
| `is_closed` | boolean | yes | Default false |
| `is_24_hours` | boolean | yes | Default false |
| `notes` | text | no | Guest-safe operational note |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Open item: final weekday convention.

### reservation_rules

Purpose: reservation thresholds, policy, and required fields.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `property_id` | uuid | yes | PK and FK -> `properties.id` |
| `large_party_threshold` | integer | yes | Default 8 for current demo behavior |
| `arrival_buffer_minutes` | integer | no | Suggested default 10 |
| `typical_duration_minutes` | integer | no | Runtime/package value if used |
| `required_fields` | text[] | yes | Required finalized reservation fields |
| `policy_json` | jsonb | no | Flexible policy extension |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

### menu_branches

Purpose: deterministic menu contexts/branches.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `property_id` | uuid | yes | FK -> `properties.id` |
| `branch_key` | text | yes | Stable runtime context key |
| `parent_branch_key` | text | no | Optional parent context key |
| `display_order` | integer | yes | Sort order |
| `active` | boolean | yes | Default true |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints:

```sql
unique (property_id, branch_key)
```

### menu_options

Purpose: deterministic menu options and next-context routing.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `branch_id` | uuid | yes | FK -> `menu_branches.id` |
| `option_key` | text | yes | Stable option key |
| `label_en` | text | yes | Property editable display label |
| `label_es` | text | no | Property editable display label |
| `choice_number` | integer | no | Numeric option if applicable |
| `next_branch_key` | text | no | Stable next context |
| `case_type` | text | no | Optional case type if option creates work |
| `dept_target` | text | no | SOL/Admin routing |
| `template_key` | text | no | Optional response template |
| `active` | boolean | yes | Default true |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints / indexes:

```sql
unique (branch_id, option_key)
index (branch_id, choice_number)
```

### response_templates

Purpose: localized response wording. Property Admin owns wording; SOL/Admin owns keys, triggers, required variables, and runtime wiring.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `property_id` | uuid | yes | FK -> `properties.id` |
| `template_key` | text | yes | SOL/Admin stable key |
| `language` | text | yes | `language_code` |
| `body` | text | yes | Property Admin editable wording |
| `required_variables` | text[] | no | SOL/Admin owned |
| `channel` | text | yes | Suggested: `text`, `voice`, `both` |
| `active` | boolean | yes | Default true |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints:

```sql
unique (property_id, template_key, language)
check (language in ('en','es'))
```

### runtime_feature_flags

Purpose: per-property runtime toggles controlled by SOL/Admin.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `property_id` | uuid | yes | FK -> `properties.id` |
| `flag_key` | text | yes | Stable flag key |
| `enabled` | boolean | yes | Default false |
| `value_json` | jsonb | no | Optional structured value |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Primary key:

```sql
primary key (property_id, flag_key)
```

## Operational Tables

### guest_threads

Purpose: conversation session identity and state references.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `tenant_id` | uuid | yes | FK -> `tenants.id` |
| `property_id` | uuid | yes | FK -> `properties.id` |
| `external_user_id` | text | yes | WhatsApp user id or channel-specific id |
| `channel` | text | yes | `message_channel` |
| `current_language` | text | no | `language_code` |
| `status` | text | yes | Suggested: `active`, `inactive`, `blocked` |
| `last_message_at` | timestamptz | no | Runtime-maintained |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints / indexes:

```sql
unique (property_id, channel, external_user_id)
index (property_id, last_message_at)
```

### messages

Purpose: single readable conversation timeline. Clean fields are always stored; raw payload is selective.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `tenant_id` | uuid | yes | FK -> `tenants.id` |
| `property_id` | uuid | yes | FK -> `properties.id` |
| `guest_thread_id` | uuid | yes | FK -> `guest_threads.id` |
| `case_id` | uuid | no | FK -> `cases.id` when applicable |
| `direction` | text | yes | `inbound` / `outbound` |
| `channel` | text | yes | `message_channel` |
| `sender_type` | text | yes | `sender_type` |
| `external_message_id` | text | no | Provider message id |
| `message_text` | text | no | Readable text/transcript |
| `raw_payload` | jsonb | no | Selective diagnostic/audit data |
| `sent_at` | timestamptz | no | Provider/event time |
| `created_at` | timestamptz | yes | System |

Constraints / indexes:

```sql
check (direction in ('inbound','outbound'))
index (guest_thread_id, sent_at)
index (case_id)
index (property_id, created_at)
```

### cases

Purpose: parent operational source of truth for LOGS, routing, lifecycle, reporting, and deduplication.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `tenant_id` | uuid | yes | FK -> `tenants.id` |
| `property_id` | uuid | yes | FK -> `properties.id` |
| `guest_thread_id` | uuid | yes | FK -> `guest_threads.id` |
| `case_type` | text | yes | `case_type` |
| `dept_target` | text | yes | SOL/Admin routing target |
| `assigned_team_id` | uuid | no | FK -> `teams.id` |
| `status` | text | yes | `case_status`, default `new` |
| `priority` | text | yes | `case_priority`, default `normal` |
| `guest_name` | text | no | If known |
| `guest_phone` | text | no | If known / channel phone |
| `source_channel` | text | yes | `message_channel` |
| `source_message_id` | uuid | no | FK -> `messages.id` if created from a message |
| `summary` | text | yes | Manager-readable description |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |
| `closed_at` | timestamptz | no | Closure timestamp |
| `closed_by` | uuid | no | Future staff/admin user FK |

Constraints / indexes:

```sql
check (case_type in ('reservation','complaint','incident','service_request'))
check (status in ('new','open','assigned','waiting_guest','waiting_staff','resolved','closed','cancelled'))
check (priority in ('low','normal','high','urgent'))
index (property_id, status, created_at)
index (property_id, dept_target, status)
index (guest_thread_id, created_at)
```

### reservation_details

Purpose: reservation-specific fields for finalized reservation cases.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `case_id` | uuid | yes | PK and FK -> `cases.id` |
| `venue_id` | uuid | no | FK -> `venues.id` |
| `requested_date` | date | no | Finalized request date |
| `requested_time` | time | no | Finalized request time |
| `party_size` | integer | no | Number of guests |
| `reservation_name` | text | no | Name on reservation |
| `special_requests` | text | no | Guest-provided notes |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Reservation drafts stay transient until submitted/finalized.

### complaint_details

Purpose: complaint-specific fields.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `case_id` | uuid | yes | PK and FK -> `cases.id` |
| `complaint_category` | text | no | Category taxonomy TBD |
| `severity` | text | no | Detail-specific seriousness |
| `location_text` | text | no | Room/location if known |
| `guest_impact` | text | no | Optional guest impact |
| `resolution_notes` | text | no | Staff/manager notes |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

### incident_details

Purpose: incident-specific fields.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `case_id` | uuid | yes | PK and FK -> `cases.id` |
| `incident_category` | text | no | Category taxonomy TBD |
| `severity` | text | no | Detail-specific seriousness |
| `location_text` | text | no | Room/location if known |
| `people_involved` | text | no | Free-text MVP field |
| `resolution_notes` | text | no | Staff/manager notes |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

### service_request_details

Purpose: configurable service requests that do not justify dedicated schema.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `case_id` | uuid | yes | PK and FK -> `cases.id` |
| `service_request_type` | text | yes | `service_request_1`, `service_request_2`, `service_request_3` |
| `service_area_label` | text | no | Property label such as Spa, Gym, Beach Club |
| `requested_date` | date | no | If applicable |
| `requested_time` | time | no | If applicable |
| `guest_count` | integer | no | If applicable |
| `location_text` | text | no | If applicable |
| `notes` | text | no | Guest/staff notes |
| `created_at` | timestamptz | yes | System |
| `updated_at` | timestamptz | yes | System |

Constraints:

```sql
check (service_request_type in ('service_request_1','service_request_2','service_request_3'))
```

### operational_events

Purpose: business/audit events for case history and manager-visible operational actions.

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `tenant_id` | uuid | yes | FK -> `tenants.id` |
| `property_id` | uuid | yes | FK -> `properties.id` |
| `case_id` | uuid | no | FK -> `cases.id` when applicable |
| `event_type` | text | yes | `operational_event_type` |
| `actor_type` | text | yes | `system`, `staff`, `admin`, `webhook` |
| `actor_id` | uuid | no | Future user/service actor |
| `event_payload` | jsonb | no | Business/audit payload |
| `created_at` | timestamptz | yes | Append-only event time |

Constraints / indexes:

```sql
index (case_id, created_at)
index (property_id, created_at)
index (property_id, event_type, created_at)
```

## Runtime Package Publication

Placeholder:

```text
{{RUNTIME_PACKAGE_STORAGE}}
```

Candidate physical approaches:

1. Generated JSON file committed/exported from builder.
2. Supabase table row, e.g. `runtime_packages`.
3. SQL/materialized view feeding a builder.
4. Cache object generated outside DB.

No final table is proposed here until storage mode is selected.

If using a table later, likely draft shape:

| Column | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | PK |
| `property_id` | uuid | yes | FK -> `properties.id` |
| `runtime_package_version` | text | yes | Published package version |
| `source_schema_version` | text | yes | Example `physical_schema_v0.1` |
| `package_json` | jsonb | yes | Compiled deterministic runtime package |
| `published_at` | timestamptz | no | Null for draft |
| `published_by` | uuid | no | Future user/service actor |
| `created_at` | timestamptz | yes | System |

## Seed Anchors

Initial seed should follow accepted order:

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

Initial demo placeholders:

```text
tenant_key: {{TENANT_KEY_DEMO}}
property_key: {{PROPERTY_KEY_DEMO}}
property_display_name: {{PROPERTY_DISPLAY_NAME}}
timezone: {{DEFAULT_TIMEZONE}}
default_language: {{DEFAULT_LANGUAGE}}
```

## Roles And Access

Placeholders:

```text
SOL admin role: {{SOL_ADMIN_ROLE}}
Property admin role: {{PROPERTY_ADMIN_ROLE}}
Runtime/webhook service role: {{SERVICE_ROLE_NAME}}
LOGS read role: {{LOGS_READ_ROLE}}
```

RLS/policy draft:

| Role | Read | Write | Notes |
|---|---|---|---|
| SOL admin | all tables | config + admin-managed operational overrides | Owns stable keys, tenant status, routing, runtime flags |
| Property admin | own tenant/property config rows | approved editable fields only | No secrets, stable keys, routing wiring, tenant status |
| Runtime/webhook service | needed config, threads, messages, cases, details, events | operational writes | Uses service credentials, not tenant-editable role |
| LOGS read | cases, details, messages, operational_events, reporting views | none by default | LOGS does not own property truth |

Detailed RLS policies remain pending before execution.

## Index Checklist

MVP indexes to include in executable SQL:

```text
tenants(tenant_key)
properties(tenant_id, property_key)
teams(property_id, team_key)
teams(property_id, dept_target)
venues(property_id, venue_key)
venues(property_id, venue_type)
venue_aliases(alias)
menu_branches(property_id, branch_key)
menu_options(branch_id, option_key)
menu_options(branch_id, choice_number)
response_templates(property_id, template_key, language)
guest_threads(property_id, channel, external_user_id)
messages(guest_thread_id, sent_at)
messages(case_id)
cases(property_id, status, created_at)
cases(property_id, dept_target, status)
cases(guest_thread_id, created_at)
operational_events(case_id, created_at)
operational_events(property_id, created_at)
```

## Execution Blockers

Before turning this into SQL, resolve:

1. Final Supabase project target: `{{SUPABASE_PROJECT_REF}}`.
2. Migration method: `{{MIGRATION_TOOL}}`.
3. RLS policy details and app roles.
4. Final `dept_target` allowed values.
5. Final weekday convention for `venue_hours.day_of_week`.
6. Runtime package storage mode: `{{RUNTIME_PACKAGE_STORAGE}}`.
7. Whether to implement enums as Postgres enum types or text check constraints.
8. Seed data source and exact seed values.
