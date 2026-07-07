# Voice Channel Architecture Note v0.3

Status: proposal for review
Date: 2026-07-05
Scope: planning representation for future Voice / ElevenLabs support

## Purpose

The current non-demo runtime is WhatsApp/text-first. The demo version must include Voice / ElevenLabs, but complete architecture and functionality are still TBD.

This note defines how to represent voice in the planning model without overbuilding runtime tables before the product path is approved.

## Current Reality

- Current runtime is WhatsApp/text-first.
- Voiceflow is the current conversational runtime.
- The middleware sends text or launch actions to Voiceflow.
- Meta WhatsApp tokens and Voiceflow API keys are deployment/env concerns.
- No active ElevenLabs implementation or audio pipeline is present in the workspace.

## Planning Principle

Treat voice as a **channel and integration capability**, not as a property fact.

Voice should be modeled enough to avoid blocking future demo architecture, but not enough to imply completed call/session behavior.

## Recommended MVP Representation

MVP schema may include provider-neutral integration scaffolding:

| Concept | Suggested table/domain | MVP status |
|---|---|---|
| Channel list | `communication_channels` | Optional MVP |
| Provider account metadata | `integration_accounts` | MVP if integrations are reviewed |
| Property-channel enablement | `property_integrations` or `channel_integrations` | MVP for future-proofing |
| Secret references | deployment secret manager reference only | MVP boundary |
| Voice persona metadata | `voice_profiles` | Later or demo-only |
| Voice sessions | `voice_sessions` | Later |
| Voice turns/events | `voice_turns` / `channel_events` | Later |
| Transcripts | `transcripts` | Later |

## Suggested Integration Fields

`integration_accounts`:

- `id`
- `provider_key`: `meta_whatsapp`, `voiceflow`, `elevenlabs`
- `display_name`
- `status`
- `secret_ref`
- `non_secret_config_json`
- `created_at`
- `updated_at`

`property_integrations`:

- `id`
- `property_id`
- `channel_key`: `whatsapp`, `voice`, `webchat`
- `provider_key`
- `integration_account_id`
- `enabled`
- `runtime_mode`: `production`, `demo`, `planned`, `disabled`
- `fallback_channel_key`
- `config_json`

Potential later `voice_profiles`:

- `id`
- `property_id`
- `provider_key`
- `external_voice_id`
- `display_name`
- `supported_languages`
- `voice_persona_notes`
- `status`

## Secret Boundary

Never store these as tenant-editable DB values:

- ElevenLabs API keys
- Meta tokens
- Voiceflow API keys
- Webhook signing secrets
- Provider account secrets

The DB may store references such as `secret_ref`, but secret material should remain in the deployment environment or approved secret manager.

## Voice Runtime Later

Only add these tables after real voice flow is approved:

- `voice_sessions`
- `voice_turns`
- `transcripts`
- `audio_artifacts`
- `channel_events`

Possible events:

- call started
- audio received
- speech-to-text completed
- agent turn generated
- text-to-speech generated
- audio sent
- call ended
- provider error

## Template Implications

Response templates eventually need channel suitability:

- `text`
- `voice`
- `both`

Voice-safe templates may need shorter phrasing, no emoji dependency, and clearer turn-taking prompts.

## Open Decisions

- Is voice inbound phone-call based, WhatsApp audio-note based, web widget based, or all three later?
- Is Voiceflow still the orchestration brain for voice?
- Does ElevenLabs provide only TTS voice, or conversational agent/session handling?
- Should transcripts be retained fully, summarized only, or governed by per-tenant retention policy?
- Should voice continue an existing WhatsApp guest thread or create separate voice threads?
- Who approves voice persona and language behavior: tenant admin, SOL admin, or deployment owner?
- Is voice required for MVP schema, demo-only schema, or later schema?

## Recommendation

Include integration/channel scaffolding in planning now. Keep full voice session tables out of MVP until the demo voice architecture is approved.

## v0.3 Accepted Voiceflow Boundary

- Voiceflow remains the current conversational runtime boundary.
- Direct LLM orchestration is deferred.
- ElevenLabs voice remains a demo requirement, but complete architecture is still TBD.
- Voiceflow session/init variables should be derived from approved DB/config variables defined in the schema and runtime package contract.

Candidate init variables should come from approved domains:

```text
property display name
concierge name
default language
supported languages
active menu/runtime package version
guest/thread identity where available
current language where available
active reservation projection where available
configured venue/menu/service labels
team routing map
```
