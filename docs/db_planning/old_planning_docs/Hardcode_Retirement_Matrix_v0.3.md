# Hardcode Retirement Matrix v0.3

Status: proposal for review
Date: 2026-07-05
Scope: planning only; no runtime changes authorized

## Purpose

Current runtime behavior contains hardcoded property, routing, deterministic menu, template, and deployment values. This matrix identifies likely future retirement targets and proposes where they should move after schema, SOL Menu Runtime Service, runtime package, and migration sequencing are approved.

This is not authorization to edit `webhook.js`, LOGS, or runtime files.

## Retirement Priority Matrix

| Current value / behavior | Current area | Future source | Priority | Owner | Notes |
|---|---|---|---|---|---|
| Verify token literal | `webhook.js` | deployment env / secret manager | High | Deployment | Not tenant-editable |
| `America/Panama` timezone constant | `webhook.js`, package data | `properties.timezone`, menu runtime package | High | Property Admin / Deployment | Runtime may keep fallback |
| Large-party threshold `8` | `webhook.js`, package data | `reservation_rules.large_party_threshold` | High | Property Admin | Must match routing behavior |
| Known reservation venues | `webhook.js` | `venues` + `venue_aliases`, menu runtime package | High | Property Admin / SOL Admin | Sensitive because venue detection is behavior-critical |
| Welcome copy with property name | `webhook.js` / templates | `response_templates` + `properties.display_name` | High | SOL Admin | Template governance needed |
| Loyalty facts in middleware prompt | `webhook.js` | `response_templates`, `content_facts`, or approved KB config | High | SOL Admin | Avoid tenant editing without approval |
| Guest Services / Security labels | `logs_mapper.js`, templates, package data | `teams` + `routing_rules` | Medium | Property Admin / LOGS | LOGS should not own property truth |
| Room Service exclusion from restaurant list | `fast_path_responder.js` | `venues.show_in_restaurant_list` / visibility flags | Medium | Property Admin | Make implicit behavior explicit |
| Venue presentation copy map | `fast_path_responder.js` | `venue_descriptions` | Medium | Property Admin | Runtime config can preserve current output |
| Response template key set | package JSON | `response_templates` compiled to flat runtime keys | Medium | SOL Admin | Preserve current flat keys initially |
| Menu contexts and aliases | `menu_dictionary.json` | `menu_branches`, `menu_options`, alias tables/JSON | Medium | SOL Admin | Needs validation rules |
| Fast Path feature behavior | env + runtime constants | `runtime_feature_flags` + deployment env | Medium | SOL Admin / Deployment | Avoid tenant toggling unsafe flags |
| WhatsApp token / phone ID | `webhook.js` env | deployment env / integration secret refs | High | Deployment | DB stores references only |
| Voiceflow project/API config | env / bridge | deployment env / integration secret refs | High | Deployment | DB stores non-secret metadata only |
| Future ElevenLabs config | not present | `property_integrations`, `voice_profiles`, secret refs | Later | Deployment / SOL Admin | Planning only |

## Migration Sequence

1. Define and approve the SOL Menu Runtime Service boundary.
2. Define normalized schema and seed mapping.
3. Seed current demo data into normalized tables.
4. Generate the published menu runtime package from DB seed.
5. Compare generated config against current file package.
6. Only after review, plan runtime read-path migration.
7. Retire hardcodes in small, separately approved patches.

## Risk Notes

- Venue detection changes can alter reservation routing.
- Template changes can alter guest-facing promises.
- LOGS routing label changes can affect operational reporting.
- Deployment secrets must not become tenant-editable DB fields.
- Voice should not be wired until provider flow, session model, and retention rules are approved.

## v0.3 Accepted Boundary

Hardcoded keyword/topic-shift arrays may be documented as future retirement candidates, but they are not MVP schema requirements and do not authorize a `classifier_rules` table.

Technical runtime errors remain in logs by default unless they directly affect a case and need manager visibility.

## Open Decisions

- Which hardcodes are production blockers versus cleanup items?
- Should menu runtime package generation support property inheritance from global defaults?
- Who approves content and template updates?
- Should LOGS consume operational views only, or also joined property metadata views?
- What is the first safe hardcode retirement pilot after DB construction?
