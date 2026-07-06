# Runtime Config Contract v0.2

Status: proposal for review
Date: 2026-07-05
Applies to: published menu runtime package consumed by the SOL Menu Runtime Service

## Purpose

This document was refined from v0.1 after clarifying the key service boundary: SOL does not need this package because guest input is mostly free-language. SOL needs this package because deterministic menu execution must be fast, context-aware, property-specific, and reviewable.

The SOL Menu Runtime Service should not read many raw normalized Supabase tables during a guest turn. Instead, normalized tenant/property/menu/template data should publish into a stable menu runtime package that preserves the deterministic behavior of today’s file package:

- `property_config.json`
- `property_master_data.json`
- `menu_dictionary.json`
- `response_templates_en.json`
- `response_templates_es.json`
- fallback `response_templates.json`

This keeps the webhook migration narrow and makes deterministic menu execution explicit.

## Principle

Supabase can be normalized for ownership, editing, permissions, and validation. The SOL Menu Runtime Service should consume a compact published package designed for deterministic execution.

Recommended decision: **the menu runtime service reads a published menu runtime package, not raw normalized DB tables**.

## Proposed Shape

```json
{
  "contract_version": "0.2",
  "generated_at": "<iso timestamp>",
  "source": {
    "property_id": "demo",
    "runtime_config_version": "draft",
    "package_versions": {
      "property_master_data": "v14.1.0",
      "menu_dictionary": "v14.0.6",
      "response_templates": "split_en_es"
    }
  },
  "property": {
    "property_key": "demo",
    "display_name": "Your Casino",
    "timezone": "America/Panama",
    "default_language": "en",
    "supported_languages": ["en", "es"],
    "services_enabled": ["restaurants", "shows", "gaming", "general"]
  },
  "feature_flags": {
    "fast_path_enabled": true,
    "split_response_templates_enabled": true,
    "restaurant_phone_reuse_enabled": true,
    "venue_specific_hours_configured": false,
    "room_service_24_hours": true,
    "cross_context_textual_menu_fallback_enabled": true
  },
  "teams": {
    "team_name_1": {
      "display_name": "Guest Services",
      "scope": "live availability, same-day confirmation, operating status"
    },
    "team_name_2": {
      "display_name": "Reservations",
      "scope": "advance reservations, group bookings over threshold, private dining"
    },
    "team_name_3": {
      "display_name": "Security",
      "scope": null
    }
  },
  "dining": {
    "reservation_rules": {
      "dinner_reservations_recommended": true,
      "walk_ins_based_on_availability": true,
      "large_group_threshold": 8,
      "typical_duration_minutes": 90,
      "arrival_buffer_minutes": 10,
      "required_new_reservation_fields": [
        "restaurant_name",
        "date",
        "time",
        "number_of_guests",
        "special_requests_if_any"
      ],
      "vip_group_required_fields": []
    },
    "answer_boundaries": {
      "may_answer_directly": [],
      "must_escalate": [],
      "hours_guest_safe_rule": "Do not provide exact outlet hours unless configured."
    }
  },
  "venues": [
    {
      "venue_key": "la_brasserie",
      "display_name": "La Brasserie",
      "aliases": ["la brasserie restaurant", "brasserie"],
      "type": "all-day cafe and restaurant",
      "service_class": "full_service_dining",
      "cuisine_or_service_type": "international all-day dining",
      "descriptions": {
        "en": "All-day cafe serving breakfast, lunch, and dinner",
        "es": "Cafe-restaurante todo el dia para desayuno, almuerzo y cena"
      },
      "supported_hours_text": "exact outlet hours not currently configured in runtime data",
      "reservation_led": true,
      "group_reservation_supported": true,
      "selectable": true,
      "show_in_restaurant_list": true,
      "handoff_team_key": "team_name_1",
      "escalation_note": "exact current hours or same-day live availability may require staff confirmation"
    }
  ],
  "menus": {
    "main_menu": {
      "context": "main_menu",
      "display_order": ["restaurants"],
      "options": {
        "restaurants": {
          "number": 1,
          "labels": {
            "en": "Restaurant reservations",
            "es": "Reservaciones de restaurantes"
          },
          "next_context": "restaurants_menu",
          "target_file": "dining_bars_guest_guide.txt"
        }
      },
      "lookup": {
        "1": "restaurants",
        "restaurant": "restaurants"
      }
    }
  },
  "response_templates": {
    "main_menu_en": "...",
    "main_menu_es": "..."
  }
}
```

## Required Runtime Conventions

- Runtime language values should be lowercase: `en`, `es`.
- Authoring tools may accept `EN` / `ES`, but compiled config must normalize them.
- Menu context keys must remain stable for current Fast Path compatibility.
- Flat response template keys should remain in v0.1 because the current responder expects keys such as `restaurant_intro_en`.
- Deterministic menu behavior must preserve:
  - `display_order`
  - `lookup`
  - `choice_aliases`
  - `list_triggers`
  - `__back` sentinels
  - `next_context`
- Room Service visibility should be explicit instead of implicit responder behavior.

## Service Execution Focus

The package should support direct deterministic resolution:

```text
context + normalized input + language + session state
  -> option key + next context + template key + session patch
```

Examples:

- `main_menu` + `1` -> `restaurants` -> `restaurants_menu` -> `restaurant_intro_en`
- `restaurant_followup_menu` + `2` + selected `Fenicia` -> `new_reservation` -> `restaurant_new_reservation_prompt_en`
- `casino_gaming_menu` + `ruleta` -> `tables` -> `gaming_tables_es`

This is the service's main value: it turns approved menu/package data into a fast execution map.

## MVP Contract Domains

- `source`
- `property`
- `feature_flags`
- `teams`
- `dining.reservation_rules`
- `dining.answer_boundaries`
- `venues`
- `menus`
- `response_templates`

## Later Contract Domains

- Exact `venue_hours` with exceptions
- Template approval metadata exposed at runtime
- Rich KB/source provenance
- Channel-specific templates
- Voice runtime profile
- Multi-property inheritance rules

## Validation Rules

- `property_key` must be stable and unique.
- Venue keys must be stable and unique within a property.
- Menu context keys and option keys must be stable.
- Every `display_order` entry must exist in `options`.
- Every lookup target must resolve to an option key or approved sentinel such as `__back`.
- Every `next_context` must resolve to a known menu context unless intentionally terminal.
- Required responder paths must have templates in each supported language.
- `handoff_team_key` must resolve to a configured team.
- If `venue_specific_hours_configured` is false, exact outlet hours must not be generated except approved exceptions such as 24-hour room service.
- Large party thresholds must be numeric and match reservation routing behavior.

## Open Decisions

- Should the published menu runtime package be stored as a table row, materialized view, JSON export, generated file, or cached object?
- Should response templates stay flat at runtime or eventually compile into nested `{template_key, language, body}` objects?
- Should menu aliases live with menu options, venues, or a shared alias table?
- How should global defaults and property overrides publish into one menu runtime package?
- What is the canonical property identifier: DB UUID, tenant/property key, package id, or all three?
- Is the SOL Menu Runtime Service initially an internal module or later a separate service?
