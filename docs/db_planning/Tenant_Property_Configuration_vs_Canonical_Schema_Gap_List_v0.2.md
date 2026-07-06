# Tenant Property Configuration Tool vs Canonical Schema Gap List v0.2

Status: proposal for review
Date: 2026-07-05
Applies to: Tenant Property Configuration Tool, Client View / Vista del Cliente preview surfaces, and canonical DB planning

## Purpose

The Tenant Property Configuration Tool is the configuration surface. It may include Client View / Vista del Cliente previews, but those previews do not rename or replace the tool. It is not the full DB model and should not be treated as complete schema coverage.

This document identifies which wizard fields represent configuration truth, which are review helpers, which are export-only, and what canonical schema concepts are currently missing.

## Core Gap

The wizard covers:

- Tenant/account basics
- Property identity
- Three basic teams
- Venue list
- Dining/reservation rules
- Guest preview
- Draft JSON export

The canonical schema proposal covers:

- Tenant and property truth
- Settings
- Teams and routing
- Venues and services
- Menus and templates
- Runtime flags
- Messages and threads
- Reservation records
- Complaint / incident records
- Operational events
- Future review comments

## Wizard Field Classification

| Wizard field | Proposed canonical target | Classification |
|---|---|---|
| Tenant account name | `tenants.display_name` | Config truth |
| Tenant key | `tenants.tenant_key` | Config truth, admin-governed |
| Property name | `properties.display_name` | Config truth |
| Concierge name | `property_settings.concierge_name` | Config truth |
| Timezone | `properties.timezone` | Config truth |
| Default guest language | `property_settings.default_language` | Config truth |
| Guest support team | `teams.display_name`, `teams.scope` | Config truth, under-modeled |
| Reservation team | `teams.display_name`, `teams.scope` | Config truth, under-modeled |
| Safety/security team | `teams.display_name`, `teams.scope` | Config truth, under-modeled |
| Venue guest-facing name | `venues.display_name` | Config truth |
| Internal venue key | `venues.venue_key` | Config truth, admin-governed |
| Venue type | `venues.venue_type` or service class | Config truth |
| Cuisine/service | `venues` metadata or `venue_descriptions` | Config/helper hybrid |
| Hours message | Later `venue_hours` or temporary safe copy | Review helper unless formalized |
| Handoff team | `routing_rules` or venue-team relationship | Config truth |
| Collect reservation details | `venues.reservation_enabled` | Config truth |
| Supports group reservations | `reservation_rules` or venue policy | Config truth, placement open |
| Aliases | `venue_aliases.alias` | Config truth |
| Short guest description | `venue_descriptions.short_description` | Config truth |
| Escalation note | `routing_rules` / `answer_boundaries` | Config/helper hybrid |
| Dinner reservations recommended | `reservation_rules` | Config truth |
| Walk-ins depend on availability | `reservation_rules` or venue policy | Config truth |
| Group threshold | `reservation_rules.large_party_threshold` | Config truth |
| Typical dining duration | `reservation_rules.typical_duration_minutes` or value JSON | Missing target |
| Arrival buffer | `reservation_rules.arrival_buffer_minutes` | Config truth |
| Venue-specific hours configured | `runtime_feature_flags` / `venue_hours` readiness | Review helper unless formalized |
| Readiness checklist | none | Review helper |
| KPIs | none | Review helper |
| Guest preview | none | Review helper |
| Download JSON buttons | none | Export-only |

## Missing Wizard Coverage

These are valid schema/runtime concepts but should not automatically become client-wizard fields:

- `property_settings.phone_region`
- Team keys and team scopes
- Menu branches
- Menu options
- Menu lookup aliases
- List triggers
- Response templates
- Template approval status
- Runtime feature flags
- Runtime config versions
- Guest threads
- Inbound messages
- Outbound messages
- Reservation request lifecycle
- Complaint / incident lifecycle
- Operational events
- Review comments
- Voice / channel integrations

## UX Implications

- Client users can edit display copy and business facts, but stable keys should be generated once and changed only with admin review.
- The wizard needs hidden normalized IDs eventually, even if the UI remains simple.
- Menus/templates should be admin-owned in v0.2. The Tenant Property Configuration Tool may preview menus without owning full menu-tree editing.
- Multilingual content needs an explicit boundary. Current wizard mostly captures English; demo runtime uses English and Spanish.
- Hours should stay conservative. Exact schedule editing should wait until `venue_hours` is approved.

## Recommended Tool v0.2 Boundary

Keep in wizard:

- Tenant display name
- Property display name
- Concierge name
- Timezone
- Default language
- Phone region
- Team display names
- Team scopes
- Venue names
- Venue aliases
- Venue descriptions
- Venue routing team
- Reservation flags
- Group threshold
- Safe hours boundary

Keep out of tool v0.2:

- Full menu tree editing
- Full response template editing
- Runtime feature flag editing
- Operational event editing
- LOGS ownership
- Voice runtime behavior
- Secret/provider credentials

## Alignment Recommendations

1. Keep the name Tenant Property Configuration Tool; use Client View / Vista del Cliente only for preview or client-facing modes inside the tool.
2. Add `phone_region` and team `scope` as near-term fields.
3. Normalize language values to lowercase at compile time.
4. Add Spanish venue description support before treating the wizard as runtime-complete.
5. Explicitly label generated exports as review artifacts, not production-ready schema exports.
6. Let the Tenant Property Configuration Tool feed normalized property/menu truth that can publish into the menu runtime package, not raw webhook behavior.
