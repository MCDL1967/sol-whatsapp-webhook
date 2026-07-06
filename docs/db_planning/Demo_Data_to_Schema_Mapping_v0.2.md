# Demo Data to Schema Mapping v0.2

Status: proposal for review
Date: 2026-07-05
Scope: mapping current file package data into a future canonical Supabase model

## Purpose

The demo package is currently the closest thing SOL has to property truth and deterministic menu behavior. Before DB construction, every current field should either map to a proposed schema location, map to the published menu runtime package, or be marked out of scope.

## Current Demo Package Files

| File | Current role | Notes |
|---|---|---|
| `property_config.json` | Small runtime summary | Property name, default language, timezone, enabled services |
| `property_master_data.json` | Main property facts | Teams, dining rules, venue facts, escalation boundaries |
| `menu_dictionary.json` | Deterministic menu tree | Contexts, options, labels, lookups, aliases, target files |
| `response_templates_en.json` | English guest-facing templates | Effective split template source |
| `response_templates_es.json` | Spanish guest-facing templates | Effective split template source |
| `response_templates.json` | Combined/fallback templates | Older or fallback template bundle |
| `fast_path_triggers.json` | Trigger metadata | Should be reviewed for trigger/routing schema fit |

## Mapping Summary

| Current source | Current field | Proposed schema target | Menu runtime package target | Notes |
|---|---|---|---|---|
| `property_config` | `property_name` | `properties.display_name` | `property.display_name` | Duplicate with master data property name |
| `property_config` | `language_default` | `property_settings.default_language` | `property.default_language` | Normalize to lowercase `en` / `es` |
| `property_config` | `timezone` | `properties.timezone` | `property.timezone` | Property-level truth |
| `property_config` | `services` | `runtime_feature_flags` or `property_services` | `property.services_enabled` | Needs schema decision |
| `property_master_data` | `version`, `date`, `status` | `runtime_config_versions` / import metadata | `source.package_versions` | Should not be tenant-editable truth |
| `property_master_data.property` | `property_name` | `properties.display_name` | `property.display_name` | Must reconcile with property_config |
| `property_master_data.property` | `team_name_1/2/3` | `teams` | `teams` | Keys should become stable team keys |
| `dining.reservation_facts` | reservation booleans and thresholds | `reservation_rules` | `dining.reservation_rules` | Include typical duration if approved |
| `dining.hours_boundary` | hour flags and guardrail | `venue_hours`, `runtime_feature_flags`, answer boundaries | `feature_flags`, `answer_boundaries` | Exact hours remain later |
| `dining.escalation_routing` | team scopes | `teams.scope`, `routing_rules` | `teams`, `answer_boundaries` | Needs normalized routing decision |
| `dining.sol_may_answer_directly` | answer allow-list | `answer_boundaries` or `routing_rules` | `dining.answer_boundaries.may_answer_directly` | Schema proposal needs explicit domain |
| `dining.sol_must_escalate` | escalation list | `answer_boundaries` or `routing_rules` | `dining.answer_boundaries.must_escalate` | Schema proposal needs explicit domain |
| `dining.venues[]` | venue facts | `venues` | `venues[]` | Not restaurants only; includes services |
| `venues[].aliases[]` | venue aliases | `venue_aliases` | `venues[].aliases` | Language optional in current data |
| `venues[].short_description_en/es` | localized descriptions | `venue_descriptions` | `venues[].descriptions` | Wizard currently only captures EN |
| `venues[].supported_hours` | safe hours text | Later `venue_hours` or template-safe field | `venues[].supported_hours_text` | Do not treat as exact schedule |
| `venues[].reservation_led` | reservation behavior | `venues.reservation_enabled` | `venues[].reservation_led` | Naming decision required |
| `venues[].group_reservation_supported` | group behavior | `reservation_rules` or venue policy | `venues[].group_reservation_supported` | Needs placement decision |
| `venues[].handoff_team_key` | team routing | `routing_rules` or venue-team relationship | `venues[].handoff_team_key` | Must resolve to team |
| `menu_dictionary.menus` | menu contexts | `menu_branches` | `menus` | Preserve context keys |
| `menus.*.display_order` | ordering | `menu_options.display_order` | `menus.*.display_order` | Validation required |
| `menus.*.options` | menu choices | `menu_options` | `menus.*.options` | Include labels and next context |
| `menus.*.lookup` | deterministic aliases | `menu_option_aliases` or JSONB | `menus.*.lookup` | Schema missing explicit table |
| `menus.*.choice_aliases` | leading-choice aliases | `menu_option_aliases` or JSONB | `menus.*.choice_aliases` | Preserve current parser behavior |
| `menus.*.list_triggers` | list request triggers | `menu_triggers` or JSONB | `menus.*.list_triggers` | Schema missing explicit table |
| `menus.*.target_file` | KB/source link | `knowledge_sources` or option metadata | `menus.*.options.*.target_file` | Later if KB governance expands |
| `response_templates*` | template body | `response_templates` | `response_templates` | Preserve flat runtime keys v0.1 |

## Schema Gaps Revealed by Demo Data

- No explicit table for menu lookup aliases, choice aliases, list triggers, and `__back` aliases.
- No explicit `answer_boundaries` domain for may-answer / must-escalate / safe-hours rules.
- No explicit venue visibility fields for:
  - selectable
  - show in restaurant list
  - service-only
  - reservation-led
- No explicit target file / KB source relationship.
- No template governance fields in current table catalog:
  - owner
  - approval status
  - source KB
  - last reviewed
  - channel suitability
- No direct representation of current runtime session fields such as `fast_path_context`, `selected_restaurant`, or `current_language`.

## MVP Mapping Boundary

MVP should map:

- Tenant / property / settings
- Teams
- Venues
- Venue aliases
- Venue descriptions
- Reservation rules
- Menu branches
- Menu options
- Menu aliases or lookup JSON
- Response templates
- Runtime feature flags
- Runtime config versions

MVP should not yet require:

- Exact venue hours with exceptions
- Full menu/template editing UI
- Hosted review comments
- Rich KB governance
- Voice sessions or transcript storage

## Review Decisions

- Should services enabled be modeled as `property_services`, `runtime_feature_flags`, or both?
- Should menu aliases be normalized rows or JSONB attached to menu branches/options?
- Is `typical_dining_duration_minutes` required in the schema or only the menu runtime package?
- Should `sol_may_answer_directly` and `sol_must_escalate` become first-class `answer_boundaries`?
- Should Room Service be modeled as a venue, service, or both?
