# SOL Menu Runtime Service v0.2

Status: proposal for review
Date: 2026-07-05
Scope: deterministic menu execution service boundary

## Purpose

SOL's current guest flow is strongly deterministic. The core runtime problem is not primarily free-language interpretation. The core runtime problem is fast, context-sensitive menu execution:

```text
current context + guest input + language + session state + menu package
  -> deterministic result
```

The SOL Menu Runtime Service is the proposed service boundary that executes approved menus, templates, routing rules, and venue context without making the webhook reason across normalized DB tables during a guest turn.

## Key Insight

The database is the source of truth for editing and governance. The menu runtime service is the execution layer.

The service should answer:

- What context is the guest currently in?
- Does the input resolve deterministically in that context?
- Which option key does it map to?
- What context comes next?
- Which template should be sent?
- Which venue, language, or request context should be carried forward?
- Should this remain in deterministic Fast Path?
- Should this hand off to Voiceflow / staff / later voice flow?
- What invalid-input reprompt should be sent?

## Architecture Position

```text
Tenant Property Configuration Tool / SOL Admin
  -> normalized DB
  -> Menu Runtime Builder
  -> published menu runtime package
  -> SOL Menu Runtime Service
  -> webhook transport / WhatsApp now / voice later
```

## Responsibilities

The service owns deterministic menu execution:

- context lookup
- numeric choice resolution
- text alias resolution
- leading-choice parsing
- list trigger handling
- back/menu/reset sentinel interpretation where approved
- next-context transition
- response template selection
- selected venue carry-forward
- branch stay/reprompt selection
- deterministic handoff classification
- invalid deterministic input response

## Non-Responsibilities

The service should not own:

- WhatsApp transport
- Meta status processing
- Voiceflow API transport
- LOGS workbook/report generation
- credential or secret storage
- tenant admin authentication
- free-form AI reasoning
- database table editing
- final DB schema ownership

## Runtime Inputs

Example request:

```json
{
  "property_key": "demo",
  "runtime_package_version": "2026-07-05.1",
  "session": {
    "current_language": "en",
    "fast_path_context": "restaurant_followup_menu",
    "selected_restaurant_key": "fenicia",
    "selected_restaurant": "Fenicia",
    "active_request_type": null
  },
  "input": {
    "raw_text": "2",
    "normalized_text": "2"
  }
}
```

## Runtime Outputs

Example output:

```json
{
  "handled": true,
  "result_type": "restaurant_followup_selection",
  "option_key": "new_reservation",
  "previous_context": "restaurant_followup_menu",
  "next_context": "restaurant_followup_menu",
  "template_key": "restaurant_new_reservation_prompt_en",
  "template_replacements": {
    "restaurant_name": "Fenicia"
  },
  "session_patch": {
    "selected_restaurant": "Fenicia",
    "selected_restaurant_key": "fenicia",
    "active_request_type": "reservation"
  },
  "handoff": null,
  "reason": "context_lookup"
}
```

Fallback output:

```json
{
  "handled": false,
  "reason": "no_deterministic_match",
  "handoff": "voiceflow"
}
```

Invalid deterministic input output:

```json
{
  "handled": true,
  "result_type": "reprompt",
  "previous_context": "casino_gaming_menu",
  "next_context": "casino_gaming_menu",
  "template_key": "gaming_stay_reprompt_en",
  "reason": "invalid_context_choice"
}
```

## Runtime Package

The published runtime package is the service's read model. It should include:

- property identity needed by menus/templates
- supported languages
- deterministic menu contexts
- menu display order
- menu options
- lookup aliases
- choice aliases
- list triggers
- context transitions
- response template keys and bodies
- venue list and venue aliases
- venue visibility flags
- reservation rules
- answer boundaries
- handoff team keys
- feature flags

This package is generated from normalized DB data, but it is not the normalized DB.

## Deterministic Examples

Main menu:

```text
context: main_menu
input: 1
language: en
-> restaurants
-> next_context: restaurants_menu
-> template: restaurant_intro_en
```

Restaurant follow-up:

```text
context: restaurant_followup_menu
selected_restaurant: Fenicia
input: 2
language: es
-> new_reservation
-> carry forward Fenicia
-> template: restaurant_new_reservation_prompt_es
```

Gaming submenu:

```text
context: casino_gaming_menu
input: ruleta
language: es
-> tables
-> template: gaming_tables_es
```

## Why This Reduces Lag

Guest turns should not query and assemble many normalized tables. Property/menu data changes occasionally; guest messages arrive constantly.

The shaping work should happen when menu/property config is published:

```text
normalized DB update -> validate -> publish runtime package
```

The guest-turn path should be:

```text
guest input -> cached package -> deterministic service -> response
```

## Versioning

Recommended version fields:

- `service_contract_version`
- `runtime_package_version`
- `property_key`
- `generated_at`
- `published_at`
- `published_by`
- `source_schema_version`

The webhook should be able to log which package version resolved a turn.

## Open Decisions

- Is this service an internal module first, or a separate HTTP service later?
- Is the runtime package stored in Supabase JSONB, generated file, cache, or all three by phase?
- Which invalid inputs should reprompt versus fall through to Voiceflow?
- Should template rendering happen inside the service or in the webhook/responder layer?
- Should session patching be advisory or authoritative?
- How should voice reuse the same deterministic menu service for spoken choices?
