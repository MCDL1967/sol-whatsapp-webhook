/*
WEBHOOK
File: webhook.js
Version: v14.0.7
Date: 2026-06-24
Role: WhatsApp ↔ Voiceflow middleware webhook with V14 Fast Path trial
Status: trial hybrid diagnostic candidate
Base: webhook.v13.1.31.js
 

This version adds (v14.0.7):
- adds session-scoped reservation draft memory using `reservations`, `active_reservation_id`, and `next_reservation_seq`
- preserves the existing singular active reservation flow by mirroring the active draft into `reservation_context`
- adds reservation draft helpers for creation, lookup, update, and active-draft synchronization
- updates reservation processing so parsed date/time/venue/party-size values are written into the active reservation draft without deleting prior drafts in the same session
- updates guest-profile propagation so active reservation drafts inherit guest_name / contact_phone / contact_email changes
- updates Voiceflow variable projection to read the active reservation draft first while keeping current `reservation_context` compatibility
- does not add multi-reservation selection UX yet, does not change Voiceflow prompts, and does not widen Fast Path/menu architecture


This version adds (v14.0.6):
- adds KB-grounded restaurant large-party routing with standard reservation size
  capped at 8 guests; counts above 8 are routed to VIP / group handling
- adds bare-number reservation party-size fallback for structured detail turns,
  excluding numbers that are part of recognized time tokens
- adds parseReservationPartySizeForRouting() helper to separate extracted raw count
  from standard reservation acceptance vs VIP/group handoff requirement
- keeps VIP/group guest-facing handoff copy in language templates, not hardcoded in
  middleware logic; webhook.js only selects the template and routes the turn
- does not add notes parsing, does not change Fast Path classifier/responder, and
  does not widen menu architecture


This version adds (v14.0.5):
- adds deterministic handling for combined main-menu reset + language switch phrases
  in a single user turn (e.g. "main menu, spanish", "menu in english",
  "menú principal en español", "menu principal ingles")
- adds detectCombinedMenuLanguageCommand() helper: narrow substring detector that
  fires only when the message contains both a menu-reset token and a language token;
  returns "en" or "es"; returns null otherwise
- new handler runs after the language gate and before the Fast Path block,
  short-circuiting Voiceflow entirely for matched turns
- on match: sets current_language, clears awaiting_language, sets fast_path_context
  to "main_menu", clears active_request and selected_restaurant, sends the canonical
  localized main menu from response templates, and returns
- subsequent numeric input (e.g. "1") is then interpreted against the correct
  language + main_menu context instead of a stale submenu
- does not widen detectMenuCommand or detectLanguageCommand; both remain exact-match
- does not affect plain "menu", plain "main menu", or single-word "spanish" / "english"
- does not change Fast Path, Voiceflow, VF bridge, or any other reset path
 
This version adds (v14.0.4):
- preserves selected restaurant during reservation continuation when the guest is already inside restaurant follow-up context
- adds restaurant-context handoff guidance so downstream AI / Voiceflow does not re-ask which restaurant unless the guest explicitly changes venue
- protects restaurant follow-up turns such as `reservation`, `reserve`, `book`, `reserva`, and `reservar` from generic reservation override
- remains compatible with future branch-by-branch menu-tree population by keeping the new parsing/menu logic in menu-driven Fast Path files rather than baking restaurant-only branching into the webhook
- does not add full reservation closure in middleware
- does not change language-gate behavior or mixed-language reply policy
 
This version adds (v14.0.3):
- preserves all v14.0.2 diagnostics
- adds Hybrid Fast Path handling for outbound failures
- logs Fast Path reply generation before Meta/WhatsApp outbound attempt
- allows terminal/curl testing with test-user dry-run handling so classifier/responder can be validated without a real WhatsApp recipient
- continues to Voiceflow fallback when Fast Path cannot build a reply or when Meta outbound fails for a real user
- keeps Fast Path feature-flag controlled through FAST_PATH_ENABLED
- does not change reservation closure, LOGS queue export, VF bridge, or existing v13 reset logic
 
Purpose:
- manage session creation / timeout / reset
- enforce pre-language gating before free interaction
- normalize select commands
- forward messages to Voiceflow
- return Voiceflow replies to WhatsApp
- preserve request-state continuity with conservative re-anchor behavior
- emit external LOGS hooks without moving workbook execution into the webhook
 
This version adds:
- hard response-language lock per selected session language
- explicit-only language switching support
- middleware language-lock prompt injection for Voiceflow turns
- outbound language mismatch detection and safe locked-language fallback
- preservation of v13.1.5 clock/calendar and guest-profile memory features
- numeric 1/2 language selection accepted again when a language prompt is active
- secure LOGS task export/status routes for local worker intake
 
This version adds:
- active language-lock response guardrails preserved
- numeric 1/2 language selection recovery when a language prompt is active
- secure task transport support for manual Render-to-Mac LOGS export
 
This version adds (v13.1.11):
- reservation-only captureRequestClosure hook on normal reply exit path (Block B) only
- /logs/tasks/export: x-logs-line-count response header
- POST /logs/tasks/clear: bounded tail-rewrite clear route
 
This version adds (v13.1.12):
- pre-reset reservation snapshot so captureRequestClosure survives exitCommand request reset
- reservation-only closure hook remains on normal reply exit path (Block B) only
 
This version adds (v13.1.13):
- durable reservation-context fields for closure payload sourcing
- conservative middleware-side extraction for reservation time, party size, and venue candidates
- structured reservation summary generation from preserved reservation context
- closure hook payload sourced from structured pre-exit reservation snapshot instead of assistant goodbye text
 
This version changes (v13.1.22):
- explicit exit-command reset now clears `guest_profile` using `createGuestProfile(userID)`
- prevents stale guest profile carryover into the next session after `exit` / `goodbye` command-driven resets
- preserves existing restart and menu reset behavior without changing reservation candidate handling
 
This version changes (v13.1.27):
- adds per-user inbound request serialization using a lightweight promise queue keyed by `userID`
- preserves immediate Meta acknowledgement by keeping `res.sendStatus(200)` first in the webhook handler
- keeps status-event handling outside the queue and leaves the main processing body unchanged inside the queued callback
- hardens queue cleanup with terminal `finally(...).catch(() => {})` handling and returns the queued promise handle
- no VF / KB2 / list / payload-cleanup changes in this version
 
This version changes (v13.1.28):
- enforces single guest-facing outbound per inbound user turn by consolidating multiple Voiceflow text traces into one WhatsApp reply
- preserves all filtered guest-facing text in original order using double-newline paragraph separation
- leaves the no-reply fallback path unchanged when Voiceflow returns no guest-facing text traces
- no VF / KB2 / serialization / payload-cleanup changes in this version
 
This version changes (v13.1.29):
- gates middleware language-lock injection on short structured turns when drift risk is low
- gates reservation-date-resolution injection after the date is already resolved and stable
- trims `buildVoiceflowStateVariables` to a lean core plus conditional reservation / conflict / time / incident groups
- adds timing instrumentation for VF interact, bridge read, outbound, and total turn duration
- no VF / KB2 / queue / list logic changes in this version
 
This version changes (v13.1.30):
- preserves `middleware_tomorrow_weekday` in the always-on core variable set for safer date-awareness continuity
- hardens language-lock bypass so complaint / security turns keep the lock even when short and structured
- reuses current-turn date/time parsing inside the lock/date gating block to avoid redundant per-turn parsing
- corrects timing attribution by logging `bridge_read_ms` immediately after the bridge call and `response_processing_ms` after reply/session processing
- adds timing coverage to the no-text fallback path without changing fallback behavior
 
This version changes (v13.1.31):
- adds a dining-context-aware list-request classifier to bypass language-lock overhead on genuine dining-list turns only
- dining-context gate now supports three legs: reservation context, dining-oriented prior bot reply, or dining/restaurant signals in the current turn
- preserves property portability by keeping middleware generic and venue-name-free
- adds explicit `[DINING LIST REQUEST]` logging for auditability on matched turns
- no VF / KB2 / bridge / reset / activation redesign in this version
 
This version changes (v13.1.25):
- adds Voiceflow state delete on `exitCommand` and `restartCommand` using the official state delete endpoint
- `exitCommand` now sends the goodbye reply directly from middleware and returns before any VF interact call
- preserves P1 reset/session-authority fixes from v13.1.24 (`session_id` rotation and exit-turn language-lock suppression)
- no KB/tool/list changes
- no broader session redesign
 
This version changes (v13.1.24):
- rotates `session_id` on `restartCommand` reset
- rotates `session_id` on `exitCommand` reset
- suppresses language-lock injection on exit turns by short-circuiting `lockedResponseLanguage` to null when `exitCommand` is true
- no VF DELETE yet
- no exit-call suppression yet
- no KB/tool/list changes
 
This version changes (v13.1.23):
- adds one additive colloquial bare-numeric party-size pattern to `extractReservationPartySize`:
    /\b(?:do|make|get|book|seat)\s+(\d{1,2})(?!\s*(?:am|pm|:|st\b|nd\b|rd\b|th\b))\b/i
- preserves all existing party-size patterns in original order
- no changes to activation sequencing, A5 logic, request switching, reset behavior,
  bridge transport, closure path, or record-ID carryover
 
This version changes (v13.1.20):
- adds shouldActivateReservation(userText, session): parallel activation function
  alongside detectIntent, covering four rules in priority order:
    A2 — known venue alias in user text
    A3 — last bot reply was a venue prompt (any inbound turn activates)
    A4 — last bot reply confirmed exactly one venue + inbound is affirmative/continuation
    A5 — user text contains party-size AND (time OR date) signals together
- patches activation branch in control block: if detectIntent did not return
  "reservation" and shouldActivateReservation returns true, activates with
  type="reservation"; logs via=${activationReason}
- no changes to detectIntent, field extraction, venue governance, merge logic,
  reply-side hydration, exit snapshot sequencing, closure path, or record-ID carryover
 
This version changes (v13.1.19):
- adds party-size pattern /\b(\d{1,2})\s+of\s+us\b/i to extractReservationPartySize
- adds three explicit name patterns to extractGuestName (after existing patterns, before prompt-reply path):
    reservation under [name]
    party name [name]
    (book|put|place|list|add) (it) under [name]
  each filtered: first-token stop-word rejection ("the","a","an","name")
               + known-venue-alias rejection via extractKnownReservationVenue
- no changes to venue hydration, exit snapshot sequencing, language enforcement,
  closure path, or record-ID carryover
 
This version changes (v13.1.18):
- adds extractSingleVenueFromReply: scans bot reply for known-venue aliases, returns
  canonical name only when exactly one unique venue is present; null if zero or multiple
- adds guarded venue hydration block after last_bot_reply is stored: fires only when
  active_request.type === "reservation", reservation_context.venue_or_department is null,
  and extractSingleVenueFromReply returns a non-null canonical name
- emits [VENUE HYDRATED FROM REPLY] log entry when hydration occurs
- no changes to closure sequencing, exit snapshot, record-ID carryover, or language enforcement
 
This version changes (v13.1.17):
- venue_or_department: all acceptance paths now registry-gated via extractKnownReservationVenue
- explicit-pattern and prompt-reply paths demoted to candidate extractors only; no free-text venue written
- outbound reply language substitution removed; mismatch detection is now passive logging only
- session language changes only through explicit switch commands (unchanged)
 
This version adds (v13.1.16):
- expanded venue normalisation disallowed values (options, option, restaurant options)
- conservative known-venue matching for on-property venues
- prompt-reply venue extraction for venue-selection replies
- weekday-based reservation date resolution
- single-token guest-name capture when bot is explicitly asking for name
- conservative bare "for 4" / "para 4" party-size capture
 
This version adds (v13.1.15):
- pre-reset reservation-context capture for exit-turn closure continuity
- exit-turn reservation evaluation using pre-reset reservation eligibility
- deferred pre-exit reservation snapshot built from merged local reservation context
- menu-command partial reservation-context preservation for venue/time/party_size
- no runtime structured venue candidate hydration yet in this stage
 
Version notes:
- preserves v13.1.13 transport, export, and bounded-clear behavior
- preserves reservation-only closure scope on the normal reply exit path
- stage 1 only: sequencing/snapshot/menu-reset correction
- does not add complaint/security/general-info closure emission
- does not add business-status transition automation
- does not add runtime structured venue candidate ingestion in this version
 
Intentionally preserved:
- v13 exit/reset behavior
- v13 direct language-command behavior
- v13 side-chat re-anchor behavior
- existing Voiceflow transport / reply path
*/
 
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const logsService = require("./logs_service");
const { readVfState }              = require('./vf_bridge/vf_state_reader');
const { readReservationCandidate } = require('./vf_bridge/reservation_candidate_reader');
const { writeReservationCase, writeCaseFromActiveRequest } = require('./supabase_bridge/supabase_client');
const { loadPropertyPackage } = require('./src/fast_path/property_loader');
const { classifyFastPath } = require('./src/fast_path/fast_path_classifier');
const { buildResponse } = require('./src/fast_path/fast_path_responder');
 
const app = express();
 
app.use(express.json());
 
const VERIFY_TOKEN = "sol_verify_123";
const VF_API_KEY = process.env.VF_API_KEY;
const VF_PROJECT_ID = process.env.VF_PROJECT_ID || process.env.VF_PROJECTID || "";
const WA_TOKEN = process.env.WA_TOKEN;
const WA_PHONE_ID = process.env.WA_PHONE_ID;
const PANAMA_TIMEZONE = "America/Panama";
const LOGS_TASK_QUEUE_FILE = process.env.LOGS_TASK_QUEUE_FILE || "";
const LOGS_EXPORT_TOKEN = process.env.LOGS_EXPORT_TOKEN || "";
const FAST_PATH_ENABLED = process.env.FAST_PATH_ENABLED === "true";
const PROPERTY_ID = process.env.PROPERTY_ID || "demo";
const FAST_PATH_DRY_RUN = process.env.FAST_PATH_DRY_RUN === "true";
const STANDARD_RESTAURANT_PARTY_SIZE_MAX = 8;
 
// ---- SESSION CONTROL CONFIG ----
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const sessions = {};
 
// ── PER-USER SERIALIZATION QUEUE ─────────────────────────────────────────────
// Ensures only one inbound turn per user is processed at a time.
// Each new turn waits for the prior in-flight turn to fully resolve before
// entering the main processing pipeline.
// Prevents overlapping VF calls, duplicate bridge reads, and contradictory
// outbounds for the same user.
const userQueues = {};
 
function enqueueForUser(userID, fn) {
  const prior = (userQueues[userID] || Promise.resolve()).then(
    () => {},
    () => {}  // absorb prior rejection — fn must always run
  );
 
  const next = prior.then(() => fn());
 
  userQueues[userID] = next;
 
  next.finally(() => {
    if (userQueues[userID] === next) {
      delete userQueues[userID];
    }
  }).catch(() => {});  // silence derived promise rejection from finally chain
 
  return next;
}
// ─────────────────────────────────────────────────────────────────────────────
 
// ---- SESSION HELPERS ----
function generateSessionId() {
  return crypto.randomUUID();
}
 
function createGuestProfile(userID = "") {
  return {
    guest_name: null,
    contact_phone: userID || null,
    contact_email: null
  };
}
 
 
function createReservationContext() {
  return {
    resolved_date: null,
    resolved_weekday: null,
    resolution_status: null,
    conflict_relative_date: null,
    conflict_absolute_date: null,
    source_text: null,
    service_time: null,
    venue_or_department: null,
    party_size: null,
    reservation_summary: null
  };
}
 
function createNewSession(userID, now) {
  return {
    session_id: generateSessionId(),
    user_id: userID,
    state: "idle",
    active_request: null,
    current_language: null,
    awaiting_language: true,
    side_chat_count: 0,
    guest_profile: createGuestProfile(userID),
    reservation_context: createReservationContext(),
    reservations: [],
    active_reservation_id: null,
    next_reservation_seq: 1,
    last_bot_reply: null,
    fast_path_context: "main_menu",
    created_at: now,
    last_seen: now
  };
}

function createReservationDraft(session = {}) {
  const seq = Number.isInteger(session?.next_reservation_seq)
    ? session.next_reservation_seq
    : 1;

  const nowIso = new Date().toISOString();
  const guestProfile = session?.guest_profile || createGuestProfile(session?.user_id || "");

  return {
    local_id: `res_${String(seq).padStart(3, "0")}`,
    status: "draft",
    category: "restaurant",
    venue_name: null,
    service_date: null,
    service_time: null,
    party_size: null,
    notes: null,
    guest_name: guestProfile.guest_name || null,
    contact_phone: guestProfile.contact_phone || null,
    contact_email: guestProfile.contact_email || null,
    source_language: session?.current_language || null,
    created_at: nowIso,
    updated_at: nowIso
  };
}

function getActiveReservation(session = null) {
  if (!session?.active_reservation_id) return null;
  if (!Array.isArray(session?.reservations)) return null;

  return session.reservations.find(
    (reservation) => reservation?.local_id === session.active_reservation_id
  ) || null;
}

function startNewReservationDraft(session = null) {
  if (!session) return null;

  const draft = createReservationDraft(session);
  const currentReservations = Array.isArray(session.reservations)
    ? session.reservations
    : [];

  session.reservations = [...currentReservations, draft];
  session.active_reservation_id = draft.local_id;
  session.next_reservation_seq = (session.next_reservation_seq || 1) + 1;

  console.log(
    `[RESERVATION DRAFT CREATED] user=${session.user_id || "—"} reservation_id=${draft.local_id}`
  );

  return draft;
}

function updateActiveReservation(session = null, patch = {}) {
  if (!session || !Array.isArray(session.reservations) || !session.active_reservation_id) {
    return null;
  }

  let updatedReservation = null;
  session.reservations = session.reservations.map((reservation) => {
    if (reservation?.local_id !== session.active_reservation_id) return reservation;

    updatedReservation = {
      ...reservation,
      ...patch,
      updated_at: new Date().toISOString()
    };

    return updatedReservation;
  });

  return updatedReservation;
}

function syncActiveReservationToReservationContext(session = null) {
  if (!session) return createReservationContext();

  const activeReservation = getActiveReservation(session);
  if (!activeReservation) {
    session.reservation_context = createReservationContext();
    return session.reservation_context;
  }

  const baseContext = session.reservation_context || createReservationContext();
  session.reservation_context = {
    ...baseContext,
    resolved_date: activeReservation.service_date || baseContext.resolved_date || null,
    resolved_weekday: activeReservation.service_date
      ? (baseContext.resolved_weekday || weekdayFromIsoDate(activeReservation.service_date))
      : (baseContext.resolved_weekday || null),
    service_time: activeReservation.service_time || baseContext.service_time || null,
    venue_or_department: activeReservation.venue_name || baseContext.venue_or_department || null,
    party_size: activeReservation.party_size || baseContext.party_size || null
  };

  return session.reservation_context;
}

function ensureActiveReservationDraft(session = null) {
  if (!session) return null;

  let activeReservation = getActiveReservation(session);
  if (activeReservation) return activeReservation;

  activeReservation = startNewReservationDraft(session);
  syncActiveReservationToReservationContext(session);
  return activeReservation;
}
 
function getOrCreateSession(userID) {
  const now = Date.now();
  const existing = sessions[userID];
 
  if (!existing) {
    const newSession = createNewSession(userID, now);
    sessions[userID] = newSession;
    console.log(`[SESSION CREATED] user=${userID} session_id=${newSession.session_id}`);
    return newSession;
  }
 
  const expired = now - existing.last_seen > SESSION_TIMEOUT_MS;
 
  if (expired) {
    const newSession = createNewSession(userID, now);
    sessions[userID] = newSession;
    console.log(
      `[SESSION EXPIRED → NEW SESSION] user=${userID} old_session=${existing.session_id} new_session=${newSession.session_id}`
    );
    return newSession;
  }
 
  existing.last_seen = now;
  return existing;
}
 
function updateSession(userID, updates = {}) {
  if (!sessions[userID]) return;
 
  sessions[userID] = {
    ...sessions[userID],
    ...updates,
    last_seen: Date.now()
  };
}
 
function getSessionSummary(session) {
  return {
    session_id: session.session_id,
    user_id: session.user_id,
    state: session.state,
    active_request: session.active_request,
    current_language: session.current_language,
    awaiting_language: session.awaiting_language,
    side_chat_count: session.side_chat_count,
    guest_profile: session.guest_profile || createGuestProfile(session.user_id),
    has_last_bot_reply: !!session.last_bot_reply,
    fast_path_context: session.fast_path_context || "main_menu",
    created_at: session.created_at,
    last_seen: session.last_seen
  };
}
 
async function runLogsHook(hookName, payload = {}) {
  const hook = logsService?.[hookName];
 
  if (typeof hook !== "function") return null;
 
  try {
    return await hook(payload);
  } catch (err) {
    console.error(`[LOGS HOOK ERROR] hook=${hookName}`, err?.stack || err?.message || err);
    return null;
  }
}
 
function buildHookPayload(payload = {}) {
  return {
    source_file: "webhook.js",
    event_timestamp: new Date().toISOString(),
    ...payload
  };
}
 
function titleCaseWords(value = "") {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
 
function cleanNameCandidate(name = "") {
  return name
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
 
function isLikelyNamePrompt(text = "") {
  const t = normalizeText(text);
  return (
    t.includes("what name should i place") ||
    t.includes("what name should i use") ||
    t.includes("what name should i put") ||
    t.includes("under what name") ||
    t.includes("what name should i place the reservation under") ||
    t.includes("what name should i place the request under") ||
    t.includes("what name should i place the report under") ||
    t.includes("your name") ||
    t.includes("name for contact") ||
    t.includes("place the reservation under")
  );
}
 
function looksLikeStandaloneName(text = "") {
  const raw = (text || "").trim();
  if (!raw) return false;
  if (raw.length > 60) return false;
  if (/[0-9@]/.test(raw)) return false;
  if (/[,;:!?]/.test(raw)) return false;
 
  const normalized = normalizeText(raw);
  const disallowed = [
    "yes",
    "no",
    "ok",
    "okay",
    "menu",
    "goodbye",
    "security",
    "reservation",
    "fenicia",
    "steakhouse",
    "tomorrow",
    "today",
    "for now",
    "thanks",
    "thank you",
    "thx",
    "cool"
  ];
  if (disallowed.includes(normalized)) return false;
 
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 4) return false;
 
  return tokens.every((token) => /^[A-Za-zÀ-ÿ''-]+$/.test(token));
}
 
function extractEmail(text = "") {
  const match = (text || "").match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  return match ? match[1].toLowerCase() : null;
}
 
function extractPhone(text = "") {
  const digits = (text || "").replace(/\D/g, "");
  if (digits.length >= 7 && digits.length <= 15) {
    return digits;
  }
 
  return null;
}
 
// v14.0.4 additive — Bug B (Reservation phone reuse).
// Detect whether the prior bot reply was the reservation contact-phone prompt.
// Scoped narrowly to the reservation contact step only.
function isReservationPhonePromptText(text = "") {
  const t = normalizeText(text);
  if (!t) return false;
  return (
    t.includes("provide a phone number") ||
    t.includes("phone number for the reservation") ||
    t.includes("phone number or email") ||
    t.includes("contact phone") ||
    t.includes("share a phone number") ||
    t.includes("type the number you") ||
    t.includes("type the phone number") ||
    t.includes("número de teléfono") ||
    t.includes("numero de telefono") ||
    t.includes("teléfono para la reservación") ||
    t.includes("telefono para la reservacion") ||
    t.includes("compartir un teléfono") ||
    t.includes("compartir un telefono")
  );
}
 
// v14.0.4 additive — Bug B (Reservation phone reuse).
// Detect an affirmative reuse signal in response to a phone-reuse offer.
// Does NOT include bare digits — digits are handled by extractPhone as a
// new number from the guest.
function isPhoneReuseAffirmative(text = "") {
  const t = normalizeText(text);
  if (!t) return false;
  if (/\d/.test(t)) return false;
  const patterns = [
    /^y$/, /^yes$/, /^yep$/, /^yeah$/, /^yup$/,
    /^ok$/, /^okay$/, /^sure$/, /^confirm(ed)?$/, /^correct$/,
    /^si$/, /^sí$/, /^claro$/, /^dale$/, /^vale$/, /^de acuerdo$/,
    /\buse (this|that|my|the same|same) (one|number|phone|contact|whatsapp)\b/,
    /\b(re[- ]?use|reuse|same|keep|use my) (number|phone|contact|whatsapp)\b/,
    /\bthis (one|number|phone) is (fine|ok|good)\b/,
    /\busa(r)? (este|ese|el|mi|el mismo|este mismo) (numero|número|teléfono|telefono|contacto|whatsapp)\b/,
    /\b(mismo|este) (numero|número|teléfono|telefono)\b/,
    /^no(,)?\s*use this\b/,
    /^no(,)?\s*use my\b/
  ];
  return patterns.some((re) => re.test(t));
}
 
// v14.0.4 additive — Bug B (Reservation phone reuse).
// Detect a clear decline signal ("no, ask me later", "skip", etc.).
function isPhoneReuseDecline(text = "") {
  const t = normalizeText(text);
  if (!t) return false;
  if (isPhoneReuseAffirmative(t)) return false;
  if (/\d/.test(t)) return false;
  const patterns = [
    /^no$/, /^nope$/, /^skip$/, /^without$/,
    /\b(no|skip|without)\s+(phone|contact)\b/,
    /\b(don'?t|do not)\s+(use|share|need)\b/,
    /^sin$/, /\bsin (teléfono|telefono|contacto|número|numero)\b/
  ];
  return patterns.some((re) => re.test(t));
}
 
// v14.0.4 additive — Bug B (Reservation phone reuse).
// Build the reuse-offer reply from response_templates, scoped to a phone prompt
// reply whose guest already has a stored contact_phone (typically seeded from
// userID on session creation) AND is in or near an active reservation flow.
function maybeBuildPhoneReuseOffer({ reply, session, responseTemplates }) {
  if (!reply || !session || !responseTemplates) return null;
  if (!isReservationPhonePromptText(reply)) return null;
 
  const phone = session?.guest_profile?.contact_phone;
  if (!phone) return null;
 
  const isReservationScoped =
    session?.active_request?.type === "reservation" ||
    session?.fast_path_context === "restaurant_followup_menu" ||
    isReservationPhonePromptText(reply);
  if (!isReservationScoped) return null;
 
  const language = session.current_language === "es" ? "es" : "en";
  const template =
    language === "es"
      ? responseTemplates.reservation_phone_reuse_offer_es
      : responseTemplates.reservation_phone_reuse_offer_en;
  if (!template) return null;
 
  return template.replace(/{{phone}}/g, phone);
}
 
// v14.0.4 additive — Bug B (Reservation phone reuse).
// Build the confirmation reply once the guest agrees to reuse the stored phone.
function buildPhoneReuseConfirmedReply({ session, responseTemplates }) {
  if (!session || !responseTemplates) return null;
  const phone = session?.guest_profile?.contact_phone;
  if (!phone) return null;
 
  const language = session.current_language === "es" ? "es" : "en";
  const template =
    language === "es"
      ? responseTemplates.reservation_phone_reuse_confirmed_es
      : responseTemplates.reservation_phone_reuse_confirmed_en;
  if (!template) return null;
 
  return template.replace(/{{phone}}/g, phone);
}
 
function extractGuestName(text = "", session = null) {
  const raw = (text || "").trim();
  if (!raw) return null;
 
  const explicitPatterns = [
    /\bmy name is\s+([A-Za-zÀ-ÿ''\-]+(?:\s+[A-Za-zÀ-ÿ''\-]+){0,3})/i,
    /\bname is\s+([A-Za-zÀ-ÿ''\-]+(?:\s+[A-Za-zÀ-ÿ''\-]+){0,3})/i,
    /\bunder the name\s+([A-Za-zÀ-ÿ''\-]+(?:\s+[A-Za-zÀ-ÿ''\-]+){0,3})/i,
    /\bthis is\s+([A-Za-zÀ-ÿ''\-]+(?:\s+[A-Za-zÀ-ÿ''\-]+){0,3})/i
  ];
 
  for (const pattern of explicitPatterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return titleCaseWords(cleanNameCandidate(match[1]));
    }
  }
 
  // v13.1.19: additional explicit name patterns.
  // Guards: first-token stop-word rejection + known-venue-alias rejection.
  // Existing patterns above remain first and are unaffected.
  const newNamePatterns = [
    /\breservation under\s+([A-Za-zÀ-ÿ''\-]+(?:\s+[A-Za-zÀ-ÿ''\-]+){0,3})/i,
    /\bparty name[:\s]+([A-Za-zÀ-ÿ''\-]+(?:\s+[A-Za-zÀ-ÿ''\-]+){0,3})/i,
    /\b(?:book|put|place|list|add)\s+(?:it\s+)?under\s+([A-Za-zÀ-ÿ''\-]+(?:\s+[A-Za-zÀ-ÿ''\-]+){0,3})/i
  ];
 
  for (const pattern of newNamePatterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const candidate = cleanNameCandidate(match[1]);
      const firstToken = normalizeText(candidate.split(/\s+/)[0]);
      if (["the", "a", "an", "name"].includes(firstToken)) continue;
      if (extractKnownReservationVenue(candidate)) continue;
      return titleCaseWords(candidate);
    }
  }
 
  if (session?.last_bot_reply && isLikelyNamePrompt(session.last_bot_reply) && looksLikeStandaloneName(raw)) {
    return titleCaseWords(cleanNameCandidate(raw));
  }
 
  return null;
}
 
function mergeGuestProfile(existingProfile = {}, patch = {}) {
  return {
    guest_name: patch.guest_name || existingProfile.guest_name || null,
    contact_phone: patch.contact_phone || existingProfile.contact_phone || null,
    contact_email: patch.contact_email || existingProfile.contact_email || null
  };
}
 
function extractGuestProfileUpdate(text = "", session = null) {
  const patch = {};
 
  const guestName = extractGuestName(text, session);
  if (guestName) patch.guest_name = guestName;
 
  const email = extractEmail(text);
  if (email) patch.contact_email = email;
 
  const phone = extractPhone(text);
  if (phone) patch.contact_phone = phone;
 
  return patch;
}
 
function getPanamaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: PANAMA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
 
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
 
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: parts.weekday,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}
 
function addPanamaDays(date = new Date(), days = 0) {
  const parts = getPanamaDateParts(date);
  const utcAnchor = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  utcAnchor.setUTCDate(utcAnchor.getUTCDate() + days);
  return utcAnchor;
}
 
function formatMinutesToHHMM(totalMinutes = 0) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}
 
function formatMinutesTo12Hour(totalMinutes = 0) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}
 
function parseRequestedClockTime(text = "") {
  const raw = (text || "").trim();
  if (!raw) return null;
 
  const normalized = normalizeText(raw);
 
  let match = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] || "0");
    const meridiem = match[3];
 
    if (hour === 12) hour = 0;
    if (meridiem === "pm") hour += 12;
 
    return {
      hhmm_24: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      display: formatMinutesTo12Hour(hour * 60 + minute),
      minutes: hour * 60 + minute
    };
  }
 
  match = normalized.match(/\b(\d{1,2}):(\d{2})\b/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
 
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {
        hhmm_24: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        display: formatMinutesTo12Hour(hour * 60 + minute),
        minutes: hour * 60 + minute
      };
    }
  }
 
  match = normalized.match(/\b(\d{1,2})\s*(pm|am)\b/);
  if (match) {
    let hour = Number(match[1]);
    const meridiem = match[2];
    if (hour === 12) hour = 0;
    if (meridiem === "pm") hour += 12;
 
    return {
      hhmm_24: `${String(hour).padStart(2, "0")}:00`,
      display: formatMinutesTo12Hour(hour * 60),
      minutes: hour * 60
    };
  }
 
  return null;
}
 
function parseRelativeMinutesAgo(text = "") {
  const normalized = normalizeText(text);
  let match = normalized.match(/\b(?:about|around|approx(?:imately)?)?\s*(\d{1,3})\s*(?:min|mins|minute|minutes)\s*ago\b/);
  if (match) {
    return Number(match[1]);
  }
 
  match = normalized.match(/\b(?:about|around|approx(?:imately)?)?\s*(\d{1,2})\s*(?:hour|hours|hr|hrs)\s*ago\b/);
  if (match) {
    return Number(match[1]) * 60;
  }
 
  if (/\bjust now\b/.test(normalized)) return 0;
 
  return null;
}
 
function buildReservationAlternatives(requestedClockTime = null) {
  if (!requestedClockTime) {
    return {
      reservation_requested_time: null,
      reservation_requested_time_display: null,
      reservation_alternative_time_1: null,
      reservation_alternative_time_1_display: null,
      reservation_alternative_time_2: null,
      reservation_alternative_time_2_display: null
    };
  }
 
  const alt1 = requestedClockTime.minutes - 30;
  const alt2 = requestedClockTime.minutes + 30;
 
  return {
    reservation_requested_time: requestedClockTime.hhmm_24,
    reservation_requested_time_display: requestedClockTime.display,
    reservation_alternative_time_1: formatMinutesToHHMM(alt1),
    reservation_alternative_time_1_display: formatMinutesTo12Hour(alt1),
    reservation_alternative_time_2: formatMinutesToHHMM(alt2),
    reservation_alternative_time_2_display: formatMinutesTo12Hour(alt2)
  };
}
 
function buildPanamaRuntimeContext(userText = "", baseDate = new Date()) {
  const nowParts = getPanamaDateParts(baseDate);
  const tomorrowDate = addPanamaDays(baseDate, 1);
  const tomorrowParts = getPanamaDateParts(tomorrowDate);
 
  const currentDate = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  const currentTime = `${nowParts.hour}:${nowParts.minute}`;
  const currentDateTimeIso = `${currentDate}T${currentTime}:${nowParts.second}-05:00`;
 
  const relativeMinutesAgo = parseRelativeMinutesAgo(userText);
  let approximateIncidentTime = null;
  let approximateIncidentDate = null;
 
  if (relativeMinutesAgo !== null) {
    const shifted = new Date(baseDate.getTime() - relativeMinutesAgo * 60 * 1000);
    const shiftedParts = getPanamaDateParts(shifted);
    approximateIncidentDate = `${shiftedParts.year}-${shiftedParts.month}-${shiftedParts.day}`;
    approximateIncidentTime = `${shiftedParts.hour}:${shiftedParts.minute}`;
  }
 
  const requestedClockTime = parseRequestedClockTime(userText);
  const reservationAlternatives = buildReservationAlternatives(requestedClockTime);
 
  return {
    current_datetime_iso: currentDateTimeIso,
    current_date: currentDate,
    current_time: currentTime,
    current_weekday: nowParts.weekday,
    current_timezone: PANAMA_TIMEZONE,
    today_date: currentDate,
    tomorrow_date: `${tomorrowParts.year}-${tomorrowParts.month}-${tomorrowParts.day}`,
    tomorrow_weekday: tomorrowParts.weekday,
    relative_minutes_ago: relativeMinutesAgo,
    approximate_incident_date: approximateIncidentDate,
    approximate_incident_time: approximateIncidentTime,
    ...reservationAlternatives
  };
}
 
 
const MONTH_NAME_TO_NUMBER = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12
};
 
const WEEKDAY_NAME_TO_INDEX = {
  sunday: 0, sun: 0, domingo: 0, dom: 0,
  monday: 1, mon: 1, lunes: 1, lun: 1,
  tuesday: 2, tue: 2, tues: 2, martes: 2, mar: 2,
  wednesday: 3, wed: 3, miercoles: 3, miércoles: 3, mie: 3, mié: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, jueves: 4, jue: 4,
  friday: 5, fri: 5, viernes: 5, vie: 5,
  saturday: 6, sat: 6, sabado: 6, sábado: 6, sab: 6
};
 
function isoDateFromParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
 
function buildDateFromIsoAtNoon(isoDate = "") {
  return new Date(`${isoDate}T12:00:00Z`);
}
 
function formatIsoDateForDisplay(isoDate = "", language = "en") {
  if (!isoDate) return null;
 
  const date = buildDateFromIsoAtNoon(isoDate);
  return new Intl.DateTimeFormat(language === "es" ? "es-PA" : "en-US", {
    timeZone: PANAMA_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}
 
function weekdayFromIsoDate(isoDate = "") {
  if (!isoDate) return null;
  return getPanamaDateParts(buildDateFromIsoAtNoon(isoDate)).weekday;
}
 
function parseAbsoluteDateReference(text = "", baseDate = new Date()) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/);
 
  if (!match) return null;
 
  const month = MONTH_NAME_TO_NUMBER[match[1]];
  const day = Number(match[2]);
  const baseParts = getPanamaDateParts(baseDate);
  const year = match[3] ? Number(match[3]) : Number(baseParts.year);
 
  if (!month || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
 
  const isoDate = isoDateFromParts(year, month, day);
  return {
    iso_date: isoDate,
    weekday: weekdayFromIsoDate(isoDate),
    display: formatIsoDateForDisplay(isoDate, "en"),
    source: match[0]
  };
}
 
function parseRelativeDateReference(text = "", baseDate = new Date()) {
  const normalized = normalizeText(text);
  const hasToday = /\btoday\b/.test(normalized) || /\bhoy\b/.test(normalized) || /\btonight\b/.test(normalized);
  const hasTomorrow = /\btomorrow\b/.test(normalized) || /\bmanana\b/.test(normalized) || /\bmañana\b/.test(text || "");
 
  if (!hasToday && !hasTomorrow) return null;
 
  const targetDate = hasTomorrow ? addPanamaDays(baseDate, 1) : addPanamaDays(baseDate, 0);
  const parts = getPanamaDateParts(targetDate);
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
 
  return {
    iso_date: isoDate,
    weekday: parts.weekday,
    display: formatIsoDateForDisplay(isoDate, "en"),
    source: hasTomorrow ? "tomorrow" : "today"
  };
}
 
function parseWeekdayDateReference(text = "", baseDate = new Date()) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(sunday|sun|domingo|dom|monday|mon|lunes|lun|tuesday|tue|tues|martes|wednesday|wed|miercoles|miércoles|mie|mié|thursday|thu|thur|thurs|jueves|jue|friday|fri|viernes|vie|saturday|sat|sabado|sábado|sab)\b/);
 
  if (!match) return null;
 
  const targetWeekday = WEEKDAY_NAME_TO_INDEX[match[1]];
  if (targetWeekday === undefined) return null;
 
  const baseParts = getPanamaDateParts(baseDate);
  const todayIso = `${baseParts.year}-${baseParts.month}-${baseParts.day}`;
  const todayDate = buildDateFromIsoAtNoon(todayIso);
  const todayWeekday = todayDate.getUTCDay();
 
  let diff = (targetWeekday - todayWeekday + 7) % 7;
  if (diff === 0) diff = 7;
 
  const targetDate = addPanamaDays(baseDate, diff);
  const parts = getPanamaDateParts(targetDate);
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
 
  return {
    iso_date: isoDate,
    weekday: parts.weekday,
    display: formatIsoDateForDisplay(isoDate, "en"),
    source: match[0]
  };
}
 
function resolveReservationDateContext(text = "", baseDate = new Date()) {
  const absoluteRef = parseAbsoluteDateReference(text, baseDate);
  const relativeRef = parseRelativeDateReference(text, baseDate);
  const weekdayRef = parseWeekdayDateReference(text, baseDate);
  const refs = [absoluteRef, relativeRef, weekdayRef].filter(Boolean);
 
  if (refs.length === 0) {
    return createReservationContext();
  }
 
  const uniqueIsoDates = [...new Set(refs.map((ref) => ref.iso_date))];
 
  if (uniqueIsoDates.length > 1) {
    return {
      resolved_date: null,
      resolved_weekday: null,
      resolution_status: "conflict",
      conflict_relative_date: relativeRef?.iso_date || weekdayRef?.iso_date || null,
      conflict_absolute_date: absoluteRef?.iso_date || null,
      source_text: text || ""
    };
  }
 
  const resolvedRef = refs[0];
  const statuses = [
    absoluteRef ? "absolute" : null,
    relativeRef ? "relative" : null,
    weekdayRef ? "weekday" : null
  ].filter(Boolean);
 
  let resolutionStatus = "absolute_only";
  if (statuses.length === 1) {
    if (statuses[0] === "relative") resolutionStatus = "relative_only";
    if (statuses[0] === "weekday") resolutionStatus = "weekday_only";
  } else {
    resolutionStatus = `consistent_${statuses.join("_")}`;
  }
 
  return {
    resolved_date: resolvedRef.iso_date,
    resolved_weekday: resolvedRef.weekday,
    resolution_status: resolutionStatus,
    conflict_relative_date: null,
    conflict_absolute_date: null,
    source_text: text || ""
  };
}
 
function mergeReservationContext(existingContext = {}, patch = {}) {
  const baseContext =
    existingContext && Object.keys(existingContext).length > 0
      ? { ...createReservationContext(), ...existingContext }
      : createReservationContext();
 
  if (!patch || Object.keys(patch).length === 0) {
    return baseContext;
  }
 
  const merged = {
    ...baseContext,
    service_time: patch.service_time || baseContext.service_time || null,
    venue_or_department: patch.venue_or_department || baseContext.venue_or_department || null,
    party_size: patch.party_size || baseContext.party_size || null,
    reservation_summary: patch.reservation_summary || baseContext.reservation_summary || null
  };
 
  if (!patch.resolution_status || patch.resolution_status === "none") {
    return {
      ...merged,
      resolved_date: baseContext.resolved_date || null,
      resolved_weekday: baseContext.resolved_weekday || null,
      resolution_status: baseContext.resolution_status || null,
      conflict_relative_date: baseContext.conflict_relative_date || null,
      conflict_absolute_date: baseContext.conflict_absolute_date || null,
      source_text: patch.source_text || baseContext.source_text || null
    };
  }
 
  if (patch.resolution_status === "conflict") {
    return {
      ...merged,
      resolved_date: baseContext.resolved_date || null,
      resolved_weekday: baseContext.resolved_weekday || null,
      resolution_status: "conflict",
      conflict_relative_date: patch.conflict_relative_date || null,
      conflict_absolute_date: patch.conflict_absolute_date || null,
      source_text: patch.source_text || baseContext.source_text || null
    };
  }
 
  return {
    ...merged,
    resolved_date: patch.resolved_date || baseContext.resolved_date || null,
    resolved_weekday: patch.resolved_weekday || baseContext.resolved_weekday || null,
    resolution_status: patch.resolution_status || baseContext.resolution_status || null,
    conflict_relative_date: null,
    conflict_absolute_date: null,
    source_text: patch.source_text || baseContext.source_text || null
  };
}
 
function normalizeReservationVenueCandidate(candidate = "") {
  const cleaned = (candidate || "")
    .replace(/[.,!?]+$/g, "")
    .replace(/\b(?:today|tomorrow|tonight|hoy|mañana|manana|esta noche)\b.*$/i, "")
    .replace(/\b(?:for|para)\s+\d{1,2}\b.*$/i, "")
    .replace(/\b(?:at|a las)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
 
  if (!cleaned) return null;
  if (/\d/.test(cleaned)) return null;
 
  const normalized = normalizeText(cleaned);
  const disallowed = [
    "reservation",
    "reservacion",
    "reserva",
    "restaurant",
    "restaurante",
    "restaurant options",
    "restaurante opciones",
    "options",
    "option",
    "venue options",
    "booking",
    "book",
    "table",
    "dinner",
    "lunch",
    "breakfast",
    "please",
    "por favor",
    "goodbye",
    "bye",
    "adios",
    "menu"
  ];
 
  if (disallowed.includes(normalized)) return null;
 
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 5) return null;
  if (!tokens.every((token) => /^[A-Za-zÀ-ÿ'&.\-]+$/.test(token))) return null;
 
  return titleCaseWords(cleaned);
}
 
function isLikelyVenuePrompt(text = "") {
  const t = normalizeText(text);
  return (
    t.includes("which restaurant") ||
    t.includes("what restaurant") ||
    t.includes("which venue") ||
    t.includes("what venue") ||
    t.includes("restaurant would you like") ||
    t.includes("what dining venue") ||
    t.includes("que restaurante") ||
    t.includes("cual restaurante") ||
    t.includes("cuál restaurante") ||
    t.includes("que lugar") ||
    t.includes("cuál lugar") ||
    t.includes("cual lugar") ||
    t.includes("en que restaurante") ||
    t.includes("en cuál restaurante") ||
    t.includes("en cual restaurante")
  );
}
 
// ── DINING-LIST REQUEST CLASSIFIER ───────────────────────────────────────────
// Identifies turns that are unambiguously requesting a dining/restaurant list.
// Property-agnostic: matches guest intent (wants a list), not venue names.
// Three-leg context gate prevents false positives in non-dining flows.
 
const _DINING_LIST_TRIGGERS = [
  "list", "listado", "lista",
  "full list", "show list", "show all", "dining list", "dining options",
  "restaurant list", "all options", "see all", "view all", "show options",
  "ver todos", "todas las opciones", "opciones de restaurantes",
  "mostrar lista", "ver lista", "ver opciones",
  "what restaurants", "what venues"
];
 
const _DINING_LIST_NAME_GUARD  = /\b(?:name is|under|a nombre|nombre)\b/i;
const _DINING_LIST_PHONE_GUARD = /\+?\d[\d\s\-()]{5,}\d/;
const _DINING_LIST_EMAIL_GUARD = /@/;
 
function isDiningListRequest(userText = "") {
  const n = normalizeText(userText);
  if (n.length > 55) return false;
  if (_DINING_LIST_NAME_GUARD.test(userText)) return false;
  if (_DINING_LIST_PHONE_GUARD.test(userText)) return false;
  if (_DINING_LIST_EMAIL_GUARD.test(userText)) return false;
  return _DINING_LIST_TRIGGERS.some((trigger) => n.includes(trigger));
}
 
// Context gate: dining context is true when ANY ONE of three legs matches.
const _DINING_CONTEXT_BOT_SIGNALS = [
  "restaurant", "dining", "restaurante", "restaurantes",
  "venue", "venues", "reservacion", "reservation", "cuisine", "cocina"
];
const _DINING_CONTEXT_TURN_SIGNALS = [
  "dining", "restaurant", "restaurants", "venue", "venues",
  "cuisine", "menu", "restaurante", "restaurantes", "cena", "comida"
];
 
function isInDiningContext(activeRequestType, lastBotReply, userText) {
  // Leg 1: session is in reservation flow
  if (activeRequestType === "reservation") return true;
  // Leg 2: prior bot reply was dining-oriented
  if (lastBotReply) {
    const t = normalizeText(lastBotReply);
    if (_DINING_CONTEXT_BOT_SIGNALS.some((s) => t.includes(s))) return true;
  }
  // Leg 3: current turn itself contains dining/restaurant signals
  const n = normalizeText(userText);
  return _DINING_CONTEXT_TURN_SIGNALS.some((s) => n.includes(s));
}
// ─────────────────────────────────────────────────────────────────────────────
 
 
function extractReservationPartySize(text = "") {
  const normalized = normalizeText(text);
  const patterns = [
    /\bparty of\s+(\d{1,2})\b/i,
    /\btable for\s+(\d{1,2})\b/i,
    /\bfor\s+(\d{1,2})\s+(?:guests?|people|persons?)\b/i,
    /\b(\d{1,2})\s+(?:guests?|people|persons?)\b/i,
    /\b(\d{1,2})\s*pax\b/i,
    /\bfor\s+(\d{1,2})(?!\s*(?:am|pm|:))\b/i,
    /\bpara\s+(\d{1,2})\s+(?:personas?|huespedes|huéspedes)\b/i,
    /\bpara\s+(\d{1,2})\b/i,
    /\b(?:somos|seremos)\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s+personas\b/i,
    /\b(\d{1,2})\s+of\s+us\b/i,  // v13.1.19
    /\b(?:do|make|get|book|seat)\s+(\d{1,2})(?!\s*(?:am|pm|:|st\b|nd\b|rd\b|th\b))\b/i // v13.1.23
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1];
  }

  const standaloneNumberMatches = [...normalized.matchAll(/\b(\d{1,2})\b/g)];
  if (standaloneNumberMatches.length === 0) return null;

  const timeTokenMatches = new Set();
  for (const match of normalized.matchAll(/\b(\d{1,2})(?::\d{2})?\s*(am|pm)\b/g)) {
    if (match?.[1]) timeTokenMatches.add(match[1]);
  }
  for (const match of normalized.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
    if (match?.[1]) timeTokenMatches.add(match[1]);
  }

  for (const match of standaloneNumberMatches) {
    const candidate = match?.[1];
    if (!candidate) continue;
    if (timeTokenMatches.has(candidate)) continue;
    return candidate;
  }

  return null;
}

function parseReservationPartySizeForRouting(text = "") {
  const rawPartySize = extractReservationPartySize(text);
  if (!rawPartySize) {
    return {
      raw_party_size: null,
      standard_party_size: null,
      requires_vip_group_handoff: false
    };
  }

  const parsed = Number.parseInt(rawPartySize, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      raw_party_size: null,
      standard_party_size: null,
      requires_vip_group_handoff: false
    };
  }

  if (parsed > STANDARD_RESTAURANT_PARTY_SIZE_MAX) {
    return {
      raw_party_size: String(parsed),
      standard_party_size: null,
      requires_vip_group_handoff: true
    };
  }

  return {
    raw_party_size: String(parsed),
    standard_party_size: String(parsed),
    requires_vip_group_handoff: false
  };
}

const KNOWN_RESERVATION_VENUES = [
  { canonical: "La Brasserie", aliases: ["la brasserie", "brasserie"] },
  { canonical: "Fenicia", aliases: ["fenicia"] },
  { canonical: "Larry's Sports Bar & Terrace", aliases: ["larry's sports bar & terrace", "larrys sports bar & terrace", "larry's sports bar", "larrys sports bar", "larry's", "larrys"] },
  { canonical: "Acua Pool Lounge & Bar", aliases: ["acua pool lounge & bar", "acua pool lounge", "acua"] },
  { canonical: "Larry's Market", aliases: ["larry's market", "larrys market"] },
  { canonical: "The Garden Lobby Bar", aliases: ["the garden lobby bar", "garden lobby bar", "garden bar"] }
];
 
function extractKnownReservationVenue(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return null;
 
  const candidates = KNOWN_RESERVATION_VENUES.flatMap((venue) =>
    venue.aliases.map((alias) => ({ alias, canonical: venue.canonical }))
  ).sort((a, b) => b.alias.length - a.alias.length);
 
  for (const candidate of candidates) {
    const escaped = candidate.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i");
    if (pattern.test(normalized)) {
      return candidate.canonical;
    }
  }
 
  return null;
}
 
// v13.1.18: scans a bot reply for known-venue aliases and returns the canonical name
// ONLY when exactly one unique venue is present. Returns null if zero or multiple
// distinct venues are found — prevents hydrating the wrong venue from list/option replies.
function extractSingleVenueFromReply(replyText = "") {
  const normalized = normalizeText(replyText);
  if (!normalized) return null;
 
  const matched = new Set();
  for (const venue of KNOWN_RESERVATION_VENUES) {
    for (const alias of venue.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i");
      if (pattern.test(normalized)) {
        matched.add(venue.canonical);
        break; // alias found for this venue — no need to test remaining aliases
      }
    }
  }
 
  if (matched.size === 1) return [...matched][0];
  return null; // zero matches or multiple distinct venues → do not hydrate
}
 
function extractPromptReplyVenueCandidate(text = "") {
  const raw = (text || "").trim();
  if (!raw) return null;
 
  const leadingCandidate = raw
    .split(/[,;\n]/)[0]
    .replace(/\b(?:for|para)\b.*$/i, "")
    .replace(/\b(?:at|a las)\b.*$/i, "")
    .trim();
 
  return normalizeReservationVenueCandidate(leadingCandidate);
}
 
function extractReservationVenue(text = "", session = null) {
  const raw = (text || "").trim();
  if (!raw) return null;
 
  const knownVenue = extractKnownReservationVenue(raw);
  if (knownVenue) return knownVenue;
 
  const explicitPatterns = [
    /\b(?:reservation|booking|table|dinner|lunch|breakfast)\s+(?:at|for)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'&.\- ]{1,50})/i,
    /\b(?:reservacion|reserva|mesa)\s+(?:en|para)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'&.\- ]{1,50})/i,
    /\b(?:restaurant|restaurante|venue)\s*(?::|-)?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'&.\- ]{1,50})/i
  ];
 
  // v13.1.17: explicit-pattern and prompt-reply paths are candidate extractors only.
  // Final acceptance must resolve through the known-venue registry.
  // If no registry hit, return null — free-text strings are never written to venue_or_department.
  for (const pattern of explicitPatterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const registryHit = extractKnownReservationVenue(match[1]);
      if (registryHit) return registryHit;
    }
  }
 
  if (session?.last_bot_reply && isLikelyVenuePrompt(session.last_bot_reply)) {
    const promptReplyVenue = extractPromptReplyVenueCandidate(raw);
    if (promptReplyVenue) {
      const registryHit = extractKnownReservationVenue(promptReplyVenue);
      if (registryHit) return registryHit;
    }
  }
 
  return null;
}
 
function extractReservationDetailContext(text = "", session = null) {
  const requestedClockTime = parseRequestedClockTime(text);
  const partySize = extractReservationPartySize(text);
 
  let venue = extractReservationVenue(text, session);

  // session.selected_restaurant is now set only via a real menu_options.venue_id
  // resolution (see src/fast_path/fast_path_responder.js) and cleared on every
  // menu/restart/exit reset, so it no longer needs a fast_path_context branch-
  // name check to avoid leaking a stale venue into an unrelated later turn.
  if (!venue && session?.selected_restaurant) {
    venue = session.selected_restaurant;
  }
 
  return {
    service_time: requestedClockTime?.hhmm_24 || null,
    party_size: partySize || null,
    venue_or_department: venue || null
  };
}
 
function hasStructuredReservationDetails(text = "", session = null) {
  const reservationDetails = extractReservationDetailContext(text, session);
  const reservationDateContext = resolveReservationDateContext(text);
 
  return !!(
    reservationDetails?.service_time ||
    reservationDetails?.party_size ||
    reservationDateContext?.resolved_date ||
    reservationDateContext?.resolution_status === "conflict"
  );
}
 
function buildRestaurantReservationHandoffPrefix(session = null, userText = "", detectedIntent = null) {
  if (!session?.selected_restaurant) return "";

  const isStructuredContinuation = hasStructuredReservationDetails(userText, session);
  const isReservationAlreadyActive = session?.active_request?.type === "reservation";
  const isExplicitReservationIntent = detectedIntent === "reservation";
 
  if (!isStructuredContinuation && !isReservationAlreadyActive && !isExplicitReservationIntent) {
    return "";
  }
 
  return `[[RESTAURANT CONTEXT: Selected venue is ${session.selected_restaurant}. Do NOT ask which restaurant unless the guest explicitly changes venue. Carry this venue forward for reservation handling.]] `;
}
 
// v14.0.4 additive — Bug A (Loyalty branch drift).
// When the session is anchored in the Loyalty and points branch, prepend a
// branch-stay instruction to the VF payload so the runtime does not drift into
// General information or merge Promotions into Loyalty for ambiguous follow-ups.
// Account-specific items remain staff-handled and must be escalated.
function buildLoyaltyStayPrefix(session = null) {
  if (!session) return "";
  if (session?.fast_path_context !== "loyalty_rewards_menu") return "";
 
  return `[[LOYALTY CONTEXT: The guest is in the Loyalty and points branch. Use only loyalty_rewards_guest_guide.txt as the source of truth. Do NOT drift into General information. Do NOT merge Promotions into Loyalty. Approved submenu: 1) Program information, 2) Points and rewards information, 3) Account-specific help. Provide only KB-safe public program facts (program name Your Casino Club Card, free enrollment, valid government-issued ID, 1 point per $5 wagered on slots, minimum redemption 100 points, points expire after 3 months of inactivity, tiers Silver/Gold/Black/Diamond). For account-specific items (balance, missing points, tier-status verification, card replacement, identity-based questions, account corrections), escalate to staff / Player's Club desk. Do NOT invent loyalty facts. Accept replies by number or by words.]] `;
}
 
function hasReservationDetailContextPatch(patch = {}) {
  return !!(
    patch?.service_time ||
    patch?.party_size ||
    patch?.venue_or_department ||
    patch?.reservation_summary
  );
}
 
function buildReservationContextSummary(context = {}) {
  const parts = [];
 
  if (context.venue_or_department) parts.push(`venue=${context.venue_or_department}`);
  if (context.resolved_date) parts.push(`date=${context.resolved_date}`);
  if (context.service_time) parts.push(`time=${context.service_time}`);
  if (context.party_size) parts.push(`party_size=${context.party_size}`);
 
  if (parts.length === 0) return null;
 
  return `reservation_request | ${parts.join(" | ")}`;
}
 
 
function isLikelyDateClarificationPrompt(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return false;
 
  return (
    normalized.includes("do you mean") ||
    normalized.includes("when you say") ||
    normalized.includes("exact calendar date") ||
    normalized.includes("today or") ||
    normalized.includes("tomorrow") ||
    normalized.includes("fecha exacta") ||
    normalized.includes("cuando dices") ||
    normalized.includes("hoy o") ||
    normalized.includes("manana") ||
    normalized.includes("mañana")
  );
}
 
function buildReservationDateInstruction(reservationContext = {}, options = {}) {
  const language = options.language || "en";
  if (!reservationContext?.resolution_status) return null;
 
  if (reservationContext.resolution_status === "conflict") {
    const relativeDisplay = formatIsoDateForDisplay(reservationContext.conflict_relative_date, language);
    const absoluteDisplay = formatIsoDateForDisplay(reservationContext.conflict_absolute_date, language);
    if (language === "es") {
      return `[[RESOLUCION DE FECHA DE RESERVA: El huésped dio referencias de fecha en conflicto. La referencia relativa apunta a ${relativeDisplay}, mientras que la fecha absoluta es ${absoluteDisplay}. Haz UNA sola aclaración breve pidiendo elegir entre esas dos fechas.]]`;
    }
    return `[[RESERVATION DATE CONFLICT: The guest gave conflicting date references. The relative reference resolves to ${relativeDisplay}, while the absolute date is ${absoluteDisplay}. Ask ONE short clarification choosing between those two dates.]]`;
  }
 
  const resolvedDisplay = formatIsoDateForDisplay(reservationContext.resolved_date, language);
  if (language === "es") {
    return `[[RESOLUCION DE FECHA DE RESERVA: Trata la fecha solicitada de la reserva como ${resolvedDisplay}. La fecha está resuelta y no es ambigua. NO vuelvas a pedir aclaración sobre hoy/mañana a menos que el huésped cambie la fecha explícitamente.]]`;
  }
  return `[[RESERVATION DATE RESOLUTION: Treat the requested reservation date as ${resolvedDisplay}. The reservation date is resolved and not ambiguous. Do NOT ask the guest to re-clarify today/tomorrow unless they explicitly change the date.]]`;
}
 
function applyReservationDateResolutionLock(text, reservationContext = {}, options = {}) {
  if (!text || options.skip) return text;
 
  const instruction = buildReservationDateInstruction(reservationContext, { language: options.language || "en" });
  if (!instruction) return text;
 
  return `${instruction} ${text}`;
}
 
function buildVoiceflowStateVariables(session, userText = "", options = {}) {
  const runtimeContext = buildPanamaRuntimeContext(userText);
  const guestProfile = session?.guest_profile || createGuestProfile(session?.user_id || "");
  const responseLanguage = options.responseLanguage || session?.current_language || null;
  const userInputLanguage = options.userInputLanguage || detectLikelyTextLanguage(userText);
  const explicitLanguageSwitch = options.languageCommand || null;
  const activeReservation = getActiveReservation(session);
  const reservationContext = options.reservationDateContext || session?.reservation_context || createReservationContext();
  const activeRequestType = session?.active_request?.type || null;
 
  // ── LEAN CORE: always-on variables sent on every turn (~25 fields) ──────────
  const core = {
    middleware_session_id: session?.session_id || null,
    middleware_current_language: session?.current_language || null,
    middleware_locked_response_language: responseLanguage,
    middleware_user_input_language: userInputLanguage,
    middleware_language_lock: !!responseLanguage,
    middleware_language_switch_requested: explicitLanguageSwitch || null,
    middleware_active_request_type: activeRequestType,
    middleware_active_request_status: session?.active_request?.status || null,
    middleware_current_datetime_iso: runtimeContext.current_datetime_iso,
    middleware_current_date: runtimeContext.current_date,
    middleware_current_time: runtimeContext.current_time,
    middleware_current_weekday: runtimeContext.current_weekday,
    middleware_current_timezone: runtimeContext.current_timezone,
    middleware_today_date: runtimeContext.today_date,
    middleware_tomorrow_date: runtimeContext.tomorrow_date,
    middleware_tomorrow_weekday: runtimeContext.tomorrow_weekday,
    // Legacy aliases kept for VF consumer compatibility
    user_language: responseLanguage,
    response_language: responseLanguage,
    language_lock: !!responseLanguage,
    language_switch_allowed: false,
    language_switch_requested: !!explicitLanguageSwitch,
    explicit_language_switch_target: explicitLanguageSwitch || null,
    guest_name: guestProfile.guest_name || null,
    guest_contact_phone: guestProfile.contact_phone || null,
    guest_contact_email: guestProfile.contact_email || null
  };
 
  // ── RESERVATION GROUP: only when reservation is active ──────────────────────
  const reservationVars = activeRequestType === "reservation" ? {
    middleware_reservation_resolved_date: activeReservation?.service_date || reservationContext.resolved_date || null,
    middleware_reservation_resolved_weekday: reservationContext.resolved_weekday || null,
    middleware_reservation_date_resolution_status: reservationContext.resolution_status || null,
    middleware_reservation_service_time: activeReservation?.service_time || reservationContext.service_time || null,
    middleware_reservation_venue_or_department: activeReservation?.venue_name || reservationContext.venue_or_department || null,
    middleware_reservation_party_size: activeReservation?.party_size || reservationContext.party_size || null,
    middleware_reservation_summary: reservationContext.reservation_summary || null
  } : {};
 
  // ── CONFLICT GROUP: only when date is in conflict state ─────────────────────
  const conflictVars = reservationContext.resolution_status === "conflict" ? {
    middleware_reservation_date_conflict_relative_date: reservationContext.conflict_relative_date || null,
    middleware_reservation_date_conflict_absolute_date: reservationContext.conflict_absolute_date || null
  } : {};
 
  // ── TIME ALTERNATIVES: only when a time signal is present in current input ──
  const hasTimeSignal = !!runtimeContext.reservation_requested_time;
  const timeAltVars = hasTimeSignal ? {
    middleware_reservation_requested_time: runtimeContext.reservation_requested_time,
    middleware_reservation_requested_time_display: runtimeContext.reservation_requested_time_display,
    middleware_reservation_alternative_time_1: runtimeContext.reservation_alternative_time_1,
    middleware_reservation_alternative_time_1_display: runtimeContext.reservation_alternative_time_1_display,
    middleware_reservation_alternative_time_2: runtimeContext.reservation_alternative_time_2,
    middleware_reservation_alternative_time_2_display: runtimeContext.reservation_alternative_time_2_display
  } : {};
 
  // ── INCIDENT GROUP: only on complaint/security active requests ───────────────
  const incidentVars = activeRequestType === "complaint" || activeRequestType === "incident" ? {
    middleware_relative_minutes_ago: runtimeContext.relative_minutes_ago,
    middleware_approximate_incident_date: runtimeContext.approximate_incident_date,
    middleware_approximate_incident_time: runtimeContext.approximate_incident_time
  } : {};
 
  return { ...core, ...reservationVars, ...conflictVars, ...timeAltVars, ...incidentVars };
}
 
// ---- TEXT NORMALIZATION ----
function normalizeText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
 
function isEmojiOnly(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
 
  const withoutEmojiLike = trimmed
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f]/gu, "")
    .trim();
 
  return withoutEmojiLike.length === 0;
}
 
function detectLanguageCommand(text) {
  const t = normalizeText(text);
 
  const englishCommands = ["english", "ingles"];
  const spanishCommands = ["espanol", "espanol por favor", "espanol porfa", "spanish"];
 
  if (englishCommands.includes(t)) return "en";
  if (spanishCommands.includes(t)) return "es";
 
  return null;
}
 
function detectRestartCommand(text) {
  const t = normalizeText(text);
 
  const restartPhrases = ["start over", "restart"];
 
  return restartPhrases.includes(t);
}
 
function detectMenuCommand(text) {
  const t = normalizeText(text);
 
  const menuPhrases = ["menu", "main menu", "menu principal", "menú", "menu please"];
 
  return menuPhrases.includes(t);
}
 
// ── COMBINED MENU + LANGUAGE SWITCH DETECTOR (v14.0.4-fix) ───────────────
// Returns "en" or "es" when the message clearly requests BOTH a main-menu
// reset AND a language switch in a single turn (e.g. "main menu, spanish",
// "menu in english", "menú principal en español").
// Intentionally narrow: only fires on phrases that unambiguously contain a
// menu-reset token AND a language token. Does NOT overlap with plain "menu"
// or plain "spanish" (those remain in their existing handlers).
function detectCombinedMenuLanguageCommand(text) {
  const t = normalizeText(text);

  const menuTokens = ["menu", "main menu", "menu principal", "menu principal", "menú principal", "menú"];
  const hasMenuToken = menuTokens.some((m) => t.includes(m));
  if (!hasMenuToken) return null;

  const hasEnglishToken = t.includes("english") || t.includes("ingles");
  const hasSpanishToken = t.includes("spanish") || t.includes("espanol");

  if (hasEnglishToken) return "en";
  if (hasSpanishToken) return "es";

  return null;
}
// ─────────────────────────────────────────────────────────────────────────

function detectExitCommand(text) {
  const t = normalizeText(text);
 
  const exactExitPhrases = [
    "exit",
    "end",
    "goodbye",
    "bye",
    "bye bye",
    "ok bye",
    "okay bye",
    "see you",
    "see you later",
    "talk later",
    "talk to you later",
    "thanks bye",
    "thank you bye",
    "no thanks bye",
    "no thank you bye",
    "thats all bye",
    "that's all bye",
 
    "adios",
    "fin",
    "hasta luego",
    "hasta pronto",
    "hasta manana",
    "hasta mañana",
    "nos vemos",
    "chau",
    "chao",
    "gracias adios",
    "gracias hasta luego",
    "gracias chau",
    "gracias chao",
    "no gracias adios",
    "no gracias chau",
    "bueno bye",
    "bueno chau",
    "bueno chao"
  ];
 
  if (exactExitPhrases.includes(t)) return true;
 
  const pattern = /\b(goodbye|bye|see you later|talk later|talk to you later|adios|hasta luego|hasta pronto|nos vemos|chau|chao)\b/;
 
  return pattern.test(t);
}
 
function detectSessionLanguage(text, currentLanguage = null, options = {}) {
  const t = normalizeText(text);
  const allowNumericSelection = !!options.allowNumericSelection;
 
  if (["english", "ingles"].includes(t)) return "en";
  if (["spanish", "espanol"].includes(t)) return "es";
 
  if ((!currentLanguage || allowNumericSelection) && t === "1") return "en";
  if ((!currentLanguage || allowNumericSelection) && t === "2") return "es";
 
  return currentLanguage || null;
}
 
function isLanguageSelectionInput(text, currentLanguage = null, options = {}) {
  const t = normalizeText(text);
  const allowNumericSelection = !!options.allowNumericSelection;
 
  if (["english", "ingles", "spanish", "espanol"].includes(t)) return true;
  if ((!currentLanguage || allowNumericSelection) && (t === "1" || t === "2")) return true;
 
  return false;
}
 
function isActiveLanguagePromptContext(session = null) {
  return !!session?.awaiting_language || isLanguageSelectionPromptText(session?.last_bot_reply || "");
}
 
function buildLanguageSelectionPrompt() {
  return `Welcome to Your Casino! 🎰
Bienvenido a Tu Casino.
 
Please choose your language:
Por favor elija su idioma:
 
1️⃣ English
2️⃣ Español`;
}
 
function buildPreLanguageGoodbyePrompt() {
  return `Goodbye — I'll be here if you need anything else. ✨
Hasta luego — aquí estaré si necesitas algo más. ✨`;
}
 
function buildMiddlewareExitReply(language = null) {
  if (language === "es") {
    return "Gracias — aquí estaré si necesitas algo más. ¡Que tengas un excelente día! ✨";
  }
 
  if (language === "en") {
    return "Thanks — I'll be here if you need anything else. Have a great day ✨";
  }
 
  return buildPreLanguageGoodbyePrompt();
}
 
async function deleteVoiceflowState(userID, reason = "reset") {
  if (!VF_API_KEY || !VF_PROJECT_ID) {
    console.error(
      `[VF STATE DELETE] user=${userID} reason=${reason} status=skipped missing_config api_key=${!!VF_API_KEY} project_id=${!!VF_PROJECT_ID}`
    );
    return { ok: false, skipped: true, reason: "missing_config" };
  }
 
  try {
    const response = await axios.delete(
      `https://general-runtime.voiceflow.com/state/user/${encodeURIComponent(userID)}`,
      {
        headers: {
          authorization: VF_API_KEY,
          projectID: VF_PROJECT_ID
        }
      }
    );
 
    console.log(
      `[VF STATE DELETE] user=${userID} reason=${reason} status=ok http=${response.status}`
    );
 
    return { ok: true, status: response.status };
  } catch (vfDeleteErr) {
    const httpStatus = vfDeleteErr?.response?.status || "n/a";
    const errorBody = vfDeleteErr?.response?.data
      ? JSON.stringify(vfDeleteErr.response.data)
      : (vfDeleteErr.message || String(vfDeleteErr));
 
    console.error(
      `[VF STATE DELETE] user=${userID} reason=${reason} status=error http=${httpStatus} error=${errorBody}`
    );
 
    return { ok: false, status: httpStatus, error: errorBody };
  }
}
 
 
function containsAny(text, keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}
 
function detectExplicitLanguageSwitchRequest(text, currentLanguage = null) {
  const t = normalizeText(text);
 
  const englishSwitchPhrases = [
    "switch to english",
    "change to english",
    "reply in english",
    "respond in english",
    "speak english",
    "in english please",
    "english please",
    "can we do english",
    "cambiar a ingles",
    "en ingles",
    "en ingles por favor"
  ];
 
  const spanishSwitchPhrases = [
    "switch to spanish",
    "change to spanish",
    "reply in spanish",
    "respond in spanish",
    "speak spanish",
    "in spanish please",
    "spanish please",
    "cambiar a espanol",
    "cambiar a español",
    "en espanol",
    "en español",
    "en espanol por favor",
    "en español por favor"
  ];
 
  if (englishSwitchPhrases.some((phrase) => t.includes(phrase))) {
    return currentLanguage === "en" ? null : "en";
  }
 
  if (spanishSwitchPhrases.some((phrase) => t.includes(phrase))) {
    return currentLanguage === "es" ? null : "es";
  }
 
  return null;
}
 
function detectLikelyTextLanguage(text = "") {
  const raw = text || "";
  const t = ` ${normalizeText(raw)} `;
 
  if (!t.trim()) return "unknown";
 
  let spanishScore = 0;
  let englishScore = 0;
 
  if (/[áéíóúñ¿¡]/i.test(raw)) {
    spanishScore += 3;
  }
 
  const spanishSignals = [
    " hola ",
    " gracias ",
    " claro ",
    " vale ",
    " necesito ",
    " quiero ",
    " reservacion ",
    " reserva ",
    " seguridad ",
    " por favor ",
    " correo ",
    " televisor ",
    " partido ",
    " adios ",
    " fecha ",
    " hora ",
    " lugar ",
    " nombre ",
    " cliente ",
    " solicitud ",
    " servicio ",
    " adelante ",
    " que ",
    " para "
  ];
 
  const englishSignals = [
    " hello ",
    " hi ",
    " thanks ",
    " thank you ",
    " please ",
    " reservation ",
    " security ",
    " tomorrow ",
    " today ",
    " date ",
    " time ",
    " name ",
    " contact ",
    " guests ",
    " request ",
    " would ",
    " like ",
    " can you ",
    " booking ",
    " party ",
    " table ",
    " right now "
  ];
 
  for (const signal of spanishSignals) {
    if (t.includes(signal)) spanishScore += 1;
  }
 
  for (const signal of englishSignals) {
    if (t.includes(signal)) englishScore += 1;
  }
 
  if (spanishScore === 0 && englishScore === 0) return "unknown";
  if (Math.abs(spanishScore - englishScore) < 2) return "unknown";
 
  return spanishScore > englishScore ? "es" : "en";
}
 
function buildLanguageLockInstruction(lockedLanguage = "en") {
  const languageName = lockedLanguage === "es" ? "Spanish" : "English";
  const otherLanguageName = lockedLanguage === "es" ? "English" : "Spanish";
 
  return `[[SESSION LANGUAGE LOCK: Respond ONLY in ${languageName}. Do NOT switch to ${otherLanguageName} just because the guest writes in ${otherLanguageName} or because the request feels urgent. Only switch languages if the guest explicitly requests a language change. Continue the current flow naturally.]]`;
}
 
function applyResponseLanguageLock(text, lockedLanguage = null, options = {}) {
  if (!text || !lockedLanguage || options.skip) return text;
 
  const lockInstruction = buildLanguageLockInstruction(lockedLanguage);
  return `${lockInstruction} ${text}`;
}
 
function isPlainNumericChoice(text = "") {
  return /^\d+$/.test(normalizeText(text));
}
 
function detectReplyLanguageMismatch(reply = "", lockedLanguage = null) {
  if (!reply || !lockedLanguage) {
    return { mismatch: false, detectedLanguage: "unknown" };
  }
 
  const detectedLanguage = detectLikelyTextLanguage(reply);
  const mismatch = detectedLanguage !== "unknown" && detectedLanguage !== lockedLanguage;
 
  return { mismatch, detectedLanguage };
}
 
function buildLockedLanguageFallbackReply(session = null, lockedLanguage = null) {
  const lang = lockedLanguage || session?.current_language || "en";
  const activeType = session?.active_request?.type || null;
 
  if (lang === "es") {
    if (activeType === "complaint") {
      return "Continuaré en español, como fue seleccionado. Por favor dime el siguiente detalle del incidente para continuar el reporte.";
    }
    if (activeType === "reservation") {
      return "Continuaré en español, como fue seleccionado. Por favor dime el siguiente detalle de la reservación para continuar.";
    }
    return "Continuaré en español, como fue seleccionado. Por favor continúa con tu solicitud.";
  }
 
  if (activeType === "complaint") {
    return "I'll continue in English, as selected. Please tell me the next incident detail so I can continue the report.";
  }
  if (activeType === "reservation") {
    return "I'll continue in English, as selected. Please tell me the next reservation detail so I can continue your request.";
  }
  return "I'll continue in English, as selected. Please continue with your request.";
}
 
function isLanguageSelectionPromptText(text = "") {
  const t = normalizeText(text);
  return (
    t.includes("please choose your language") ||
    t.includes("por favor elija su idioma")
  );
}
 
function getContextAwareFallbackMessage(text, session = null) {
  const activeType = session?.active_request?.type || null;
  const t = normalizeText(text);
 
  const securitySignals = [
    "wallet",
    "stolen",
    "stole",
    "theft",
    "robbery",
    "robo",
    "robbed",
    "security",
    "seguridad",
    "police",
    "policia",
    "ambulance",
    "ambulancia"
  ];
 
  if (activeType === "complaint" || containsAny(t, securitySignals)) {
    const spanishSignals =
      /[áéíóúñ¿¡]/i.test(text || "") ||
      ["hola", "gracias", "seguridad", "robo", "cartera", "policia", "ambulancia"].some((w) =>
        t.includes(normalizeText(w))
      );
 
    return spanishSignals
      ? "Lo siento. Esto parece urgente. Por favor dime tu ubicación exacta y confirma si estás a salvo ahora mismo. Puedo continuar el reporte para Seguridad."
      : "I'm sorry. This sounds urgent. Please tell me your exact location and confirm whether you are safe right now. I can continue the report for Security.";
  }
 
  return getSafetyFallbackMessage(text);
}
 
function detectChitChat(text) {
  const t = normalizeText(text);
 
  const chitChatPhrases = [
    "what emoji is that",
    "what other emojis can you send",
    "what other emojis",
    "do you have more",
    "i love those emojis",
    "i love those emoji",
    "those are cool",
    "thats cool",
    "that's cool",
    "great job",
    "good job",
    "nice",
    "cool",
    "for sure",
    "thats too bad",
    "that's too bad",
    "have a good night",
    "good night",
    "thanks",
    "thank you",
    "gracias"
  ];
 
  if (t.includes("emoji")) return true;
  return chitChatPhrases.includes(t);
}
 
function shouldTrackSideChat(session, userText, detectedIntent, flags = {}) {
  if (!session?.active_request) return false;
  if (flags.languageCommand || flags.restartCommand || flags.menuCommand || flags.exitCommand) return false;
  if (detectedIntent) return false;
  if (isLikelyContinuation(userText)) return false;
 
  return detectChitChat(userText);
}
 
function buildReanchorMessage(session, userText) {
  const lang =
    session?.current_language ||
    (/[áéíóúñ¿¡]/i.test(userText || "") || /\b(hola|gracias|queja|reserva|emoji)\b/i.test(userText || "") ? "es" : "en");
 
  const type = session?.active_request?.type || "request";
 
  if (lang === "es") {
    if (type === "complaint") {
      return "Claro 😊 Antes de seguir, ¿quiere que terminemos el reporte de la queja? Puede describirme el problema y la ubicación, o decirme si prefiere que lo conecte con Guest Services.";
    }
    if (type === "reservation") {
      return "Claro 😊 Antes de seguir, ¿quiere que terminemos la solicitud de reservación? Puedo continuar con los detalles o enviarla a Guest Services para seguimiento.";
    }
    return "Claro 😊 Antes de seguir, ¿quiere que retomemos esta solicitud?";
  }
 
  if (type === "complaint") {
    return "Of course 😊 Before we continue, would you like to finish the complaint report? You can describe the issue and location, or tell me if you prefer that I connect you with Guest Services.";
  }
  if (type === "reservation") {
    return "Of course 😊 Before we continue, would you like to finish the reservation request? I can continue with the details or send it to Guest Services for follow-up.";
  }
  return "Of course 😊 Before we continue, would you like to resume this request?";
}
 
function isGreetingReentry(text) {
  const t = normalizeText(text);
 
  const greetings = [
    "hi",
    "hello",
    "hola",
    "hello sol",
    "hola sol",
    "hey",
    "buenas",
    "buenos dias",
    "buenas tardes",
    "buenas noches"
  ];
 
  return greetings.includes(t) || isEmojiOnly(text);
}
 
// ---- INTENT DETECTION ----
function detectIntent(text, currentRequestType = null) {
  const t = normalizeText(text);
 
  const complaintKeywords = [
    "queja",
    "complaint",
    "problema",
    "problem",
    "billing",
    "bill",
    "cargo",
    "charge",
    "mal servicio",
    "wrong charge"
  ];
 
  const reservationKeywords = [
    "reserva",
    "reservar",
    "reservacion",
    "reservation",
    "book",
    "booking",
    "restaurant reservation",
    "restaurant booking",
    "book a table",
    "table for ",
    "table for",
    "dinner reservation",
    "make a reservation",
    "restaurant"
  ];
 
  const infoKeywords = [
    "info",
    "informacion",
    "hours",
    "location",
    "ubicacion",
    "where",
    "donde"
  ];
 
  const securityLocationFollowupKeywords = [
    "table ",
    "roulette table",
    "ruleta",
    "roulette",
    "roulet",
    "roulete",
    "next to",
    "near",
    "by the",
    "column",
    "colmn",
    "lobby",
    "garage",
    "valet",
    "casino floor",
    "hotel lobby"
  ];
 
  const theftSignals = [
    "wallet",
    "cartera",
    "stolen",
    "stole",
    "theft",
    "robbery",
    "robo",
    "robbed",
    "security",
    "seguridad",
    "police",
    "policia",
    "ambulance",
    "ambulancia"
  ];
 
  const reservationDiningSignals = [
    "dinner",
    "lunch",
    "breakfast",
    "restaurant",
    "table for",
    "party of",
    "guests",
    "pax"
  ];
 
  if (
    (currentRequestType === "complaint" || currentRequestType === "incident") &&
    containsAny(t, securityLocationFollowupKeywords)
  ) {
    return currentRequestType;
  }

  // Theft/safety/security signals classify as "incident" (case_type
  // "incident", written to incident_details), distinct from general
  // service/billing complaints ("complaint", written to complaint_details) --
  // previously both collapsed into "complaint" here, meaning incident_details
  // could never receive a real write regardless of what the guest reported.
  if (containsAny(t, theftSignals)) {
    return "incident";
  }

  if (containsAny(t, complaintKeywords)) {
    return "complaint";
  }
 
  if (containsAny(t, reservationKeywords) || containsAny(t, reservationDiningSignals)) {
    return "reservation";
  }
 
  if (containsAny(t, infoKeywords)) {
    return "info";
  }
 
  return null;
}
 
function isLikelyContinuation(text) {
  const t = normalizeText(text);
 
  if (/^\d+$/.test(t)) return true;
  if (/^\d+[.)-]?$/.test(t)) return true;
 
  const shortReplies = [
    "si",
    "no",
    "ok",
    "okay",
    "dale",
    "va",
    "yes",
    "yeah",
    "yep",
    "nop",
    "2",
    "3",
    "4",
    "5"
  ];
 
  return shortReplies.includes(t);
}
 
function initialStatusForType(type) {
  switch (type) {
    case "reservation":
    case "complaint":
    case "incident":
    case "info":
    default:
      return "inquiry";
  }
}
 
function shouldSwitchIntent(currentRequest, newIntent, userText) {
  if (!currentRequest || !newIntent) return false;
  if (currentRequest.type === newIntent) return false;
  if (isLikelyContinuation(userText)) return false;
 
  return true;
}
 
function shouldClearActiveRequest(currentRequest, newIntent, userText) {
  if (!currentRequest) return false;
  if (newIntent) return false;
  if (isLikelyContinuation(userText)) return false;
 
  const t = normalizeText(userText);
 
  const topicShiftHints = [
    "ruleta",
    "roulette",
    "poker",
    "blackjack",
    "casino",
    "gaming",
    "instalaciones",
    "facilities",
    "property",
    "dossier",
    "habitaciones",
    "rooms",
    "spa",
    "transporte",
    "transport",
    "system prompt",
    "prompt",
    "objetivo",
    "who are you",
    "quien eres"
  ];
 
  return topicShiftHints.some((hint) => t.includes(hint));
}
 
// v13.1.20: reservation activation layer — parallel to detectIntent, session-aware.
// Fires only when active_request is null. Priority order matches spec:
//   A2 — known venue in user text
//   A3 — venue-prompt continuation (last bot reply was a venue prompt)
//   A4 — affirmative continuation after single-venue bot reply
//   A5 — detail-rich reservation turn (party size + time/date signal together)
// Returns true if middleware should activate reservation, false otherwise.
// Does NOT modify state. Caller owns the activation write.
function shouldActivateReservation(userText, session) {
  if (!userText) return false;
 
  // A2 — user text contains a known venue alias directly
  if (extractKnownReservationVenue(userText)) return true;
 
  const lastReply = session?.last_bot_reply || "";
 
  // A3 — last bot reply was a venue prompt and user turn is a continuation
  // (numeric pick, short reply, or any text when venue prompt is active)
  if (isLikelyVenuePrompt(lastReply)) return true;
 
  // A4 — last bot reply contained exactly one known venue (confirmation reply)
  // and user text is an affirmative or continuation signal
  if (lastReply) {
    const confirmedVenue = extractSingleVenueFromReply(lastReply);
    if (confirmedVenue && isLikelyContinuation(userText)) return true;
  }
 
  // A5 — detail-rich turn: party-size signal AND (time signal OR date signal)
  const hasPartySize = !!extractReservationPartySize(userText);
  const hasTime = !!parseRequestedClockTime(userText);
  const hasDate = !!resolveReservationDateContext(userText).resolution_status;
  if (hasPartySize && (hasTime || hasDate)) return true;
 
  return false;
}
 
function getSafetyFallbackMessage(text) {
  const t = normalizeText(text);
 
  const gamingHints = [
    "ruleta",
    "roulette",
    "rulet",
    "roulet",
    "roulete",
    "poker",
    "powker",
    "blackjack",
    "bj",
    "slots",
    "slot",
    "casino",
    "juegos",
    "games"
  ];
 
  const spanishSignals =
    /[áéíóúñ¿¡]/i.test(text || "") ||
    ["hola", "gracias", "ruleta", "poker", "juegos", "ingles", "espanol", "español"].some((w) =>
      t.includes(normalizeText(w))
    );
 
  if (gamingHints.some((hint) => t.includes(hint))) {
    return spanishSignals
      ? "No capté bien esa consulta, pero con gusto te ayudo con juegos de casino. Puedes escribir el nombre del juego otra vez, por ejemplo: ruleta, póker o blackjack."
      : "I didn't quite catch that, but I'd be happy to help with casino games. Please type the game name again, for example: roulette, poker, or blackjack.";
  }
 
  return spanishSignals
    ? "Lo siento, no capté bien tu mensaje. Puedo ayudarte con juegos, reservaciones, información general o quejas. ¿Qué te gustaría consultar?"
    : "Sorry, I didn't quite catch that. I can help with games, reservations, general information, or complaints. What would you like to explore?";
}
 
 
function getResolvedLogsQueuePath() {
  return LOGS_TASK_QUEUE_FILE ? path.resolve(LOGS_TASK_QUEUE_FILE) : "";
}
 
function getLogsExportTokenFromRequest(req) {
  const queryToken = typeof req.query?.token === "string" ? req.query.token.trim() : "";
  const headerToken = typeof req.headers["x-logs-export-token"] === "string"
    ? req.headers["x-logs-export-token"].trim()
    : "";
  return queryToken || headerToken || "";
}
 
function isAuthorizedLogsExportRequest(req) {
  if (!LOGS_EXPORT_TOKEN) return false;
  return getLogsExportTokenFromRequest(req) === LOGS_EXPORT_TOKEN;
}
 
function buildLogsExportFilename() {
  const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
  return `logs_tasks_export_${stamp}.jsonl`;
}
 
async function readLogsQueueSnapshot(queuePath) {
  const resolved = queuePath || getResolvedLogsQueuePath();
  if (!resolved) {
    return {
      queue_path: "",
      exists: false,
      size_bytes: 0,
      line_count: 0,
      contents: ""
    };
  }
 
  try {
    const stats = await fs.stat(resolved);
    const contents = await fs.readFile(resolved, "utf8");
    const lineCount = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
 
    return {
      queue_path: resolved,
      exists: true,
      size_bytes: stats.size,
      line_count: lineCount,
      contents
    };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return {
        queue_path: resolved,
        exists: false,
        size_bytes: 0,
        line_count: 0,
        contents: ""
      };
    }
 
    throw err;
  }
}
 
// ---- WEBHOOK VERIFICATION ----
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
 
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
 
  return res.sendStatus(403);
});
 
 
// ---- LOGS TASK EXPORT ROUTES ----
app.get("/logs/tasks/status", async (req, res) => {
  try {
    if (!isAuthorizedLogsExportRequest(req)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
 
    const snapshot = await readLogsQueueSnapshot();
    return res.status(200).json({
      ok: true,
      queue_path: snapshot.queue_path,
      queue_configured: Boolean(LOGS_TASK_QUEUE_FILE),
      export_enabled: Boolean(LOGS_EXPORT_TOKEN),
      exists: snapshot.exists,
      size_bytes: snapshot.size_bytes,
      line_count: snapshot.line_count
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "status_failed"
    });
  }
});
 
app.get("/logs/tasks/export", async (req, res) => {
  try {
    if (!isAuthorizedLogsExportRequest(req)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
 
    const snapshot = await readLogsQueueSnapshot();
 
    if (!LOGS_TASK_QUEUE_FILE) {
      return res.status(503).json({
        ok: false,
        error: "queue_not_configured"
      });
    }
 
    if (!snapshot.exists || !snapshot.contents.trim()) {
      return res.status(204).send();
    }
 
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${buildLogsExportFilename()}"`);
    res.setHeader("x-logs-line-count", String(snapshot.line_count));
    return res.status(200).send(snapshot.contents);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "export_failed"
    });
  }
});
 
// ---- LOGS QUEUE CLEAR ROUTE ----
async function clearLogsQueue(confirmedLineCount) {
  const resolved = getResolvedLogsQueuePath();
  if (!resolved) return { cleared: false, reason: "queue_path_not_set" };
 
  const raw = await fs.readFile(resolved, "utf8").catch((err) => {
    if (err?.code === "ENOENT") return "";
    throw err;
  });
 
  const allLines = raw.split(/\r?\n/).filter((l) => l.trim());
  const tail = allLines.slice(confirmedLineCount);
 
  await fs.writeFile(
    resolved,
    tail.length ? tail.join("\n") + "\n" : "",
    "utf8"
  );
 
  console.log(
    `[LOGS CLEAR] snapshot_lines=${confirmedLineCount} total_lines=${allLines.length} preserved=${tail.length} path=${resolved}`
  );
 
  return {
    cleared: true,
    snapshot_lines: confirmedLineCount,
    preserved_lines: tail.length,
    queue_path: resolved
  };
}
 
app.post("/logs/tasks/clear", async (req, res) => {
  try {
    if (!isAuthorizedLogsExportRequest(req)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    if (!LOGS_TASK_QUEUE_FILE) {
      return res.status(503).json({ ok: false, error: "queue_not_configured" });
    }
    const raw = req.body?.line_count;
    const lineCount = Number.isInteger(raw) ? raw : parseInt(raw, 10);
    if (!Number.isFinite(lineCount) || lineCount < 0) {
      return res.status(400).json({ ok: false, error: "invalid_line_count" });
    }
    const result = await clearLogsQueue(lineCount);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "clear_failed"
    });
  }
});
 
// ---- INBOUND MESSAGE HANDLER ----
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // acknowledge Meta immediately
 
  console.log("[WEBHOOK POST RECEIVED v14.0.3]", JSON.stringify({
    has_body: !!req.body,
    entry_count: Array.isArray(req.body?.entry) ? req.body.entry.length : 0
  }));
 
  let entry, changes, message, statusEvent;
  try {
    entry = req.body?.entry?.[0];
    changes = entry?.changes?.[0];
    message = changes?.value?.messages?.[0];
    statusEvent = changes?.value?.statuses?.[0];
  } catch (err) {
    console.log("[WEBHOOK PAYLOAD MALFORMED v14.0.3]", err?.message || err);
    return; // malformed body — nothing to process
  }
 
  try {
    console.log("[WEBHOOK PAYLOAD CLASSIFIED v14.0.3]", JSON.stringify({
      has_message: !!message,
      message_type: message?.type || null,
      has_status: !!statusEvent
    }));
 
    if (statusEvent) {
      const statusUserID = statusEvent.recipient_id;
      const statusSession = statusUserID ? sessions[statusUserID] || null : null;
 
      await runLogsHook(
        "captureStatusEvent",
        buildHookPayload({
          event_type: "meta_status",
          user_id: statusUserID || "",
          session_summary: statusSession ? getSessionSummary(statusSession) : null,
          raw_status: statusEvent,
          summary: statusEvent.status || "meta_status"
        })
      );
 
      return;
    }
 
    if (!message || message.type !== "text") {
      console.log("[WEBHOOK NO TEXT MESSAGE v14.0.3]", JSON.stringify({
        has_message: !!message,
        message_type: message?.type || null
      }));
      return;
    }
 
    const userID = message.from;
    const userText = message.text.body;
 
    // Serialize per user: this turn waits for the prior in-flight turn to finish
    enqueueForUser(userID, async () => {
      try {
        const session = getOrCreateSession(userID);
 
    const guestProfileUpdate = extractGuestProfileUpdate(userText, session);
    if (Object.keys(guestProfileUpdate).length > 0) {
      const mergedGuestProfile = mergeGuestProfile(session.guest_profile, guestProfileUpdate);
      updateSession(userID, { guest_profile: mergedGuestProfile });
      session.guest_profile = mergedGuestProfile;
 
      if (sessions[userID]?.active_request?.type === "reservation") {
        updateActiveReservation(sessions[userID], {
          guest_name: mergedGuestProfile.guest_name || null,
          contact_phone: mergedGuestProfile.contact_phone || null,
          contact_email: mergedGuestProfile.contact_email || null
        });
        syncActiveReservationToReservationContext(sessions[userID]);
      }
 
      console.log(
        `[GUEST PROFILE UPDATED] user=${userID} guest_name=${mergedGuestProfile.guest_name || "—"} contact_email=${mergedGuestProfile.contact_email || "—"}`
      );
    }
 
    const _turnStart = Date.now();
    console.log(`[INBOUND] user=${userID} session_id=${session.session_id} text="${userText}"`);
    console.log(`[SESSION BEFORE]`, getSessionSummary(session));
 
    const explicitLanguageSwitchCommand = detectExplicitLanguageSwitchRequest(userText, session.current_language);
    const languageCommand = detectLanguageCommand(userText) || explicitLanguageSwitchCommand;
    const detectedInputLanguage = detectLikelyTextLanguage(userText);
    const restartCommand = detectRestartCommand(userText);
    const menuCommand = detectMenuCommand(userText);
    const exitCommand = detectExitCommand(userText);
    const combinedMenuLanguageCommand = detectCombinedMenuLanguageCommand(userText);
    const greetingReentry = isGreetingReentry(userText);
    let detectedIntent = detectIntent(userText, session.active_request?.type || null);
    if (session.fast_path_context === "restaurant_followup_menu") {
      const isStructuredContinuation = hasStructuredReservationDetails(userText, session);
 
      if (isStructuredContinuation) {
        detectedIntent = null;
      }
    }
 
    if (
      session.fast_path_context === "restaurant_followup_menu" &&
      session.selected_restaurant &&
      hasStructuredReservationDetails(userText, session)
    ) {
      session.active_request = {
        type: "reservation",
        status: session.active_request?.status || "inquiry"
      };
    }
 
    await runLogsHook(
      "captureInboundMessage",
      buildHookPayload({
        event_type: "inbound_message",
        user_id: userID,
        user_text: userText,
        message_id: message.id || "",
        session_summary: getSessionSummary(session),
        detected_intent: detectedIntent,
        active_request: session.active_request || null,
        guest_profile: session.guest_profile || null,
        detected_input_language: detectedInputLanguage,
        explicit_language_switch_command: explicitLanguageSwitchCommand,
        runtime_context: buildPanamaRuntimeContext(userText)
      })
    );
 
    const activeLanguagePromptContext = isActiveLanguagePromptContext(session);
 
    const inferredLanguage = detectSessionLanguage(userText, session.current_language, {
      allowNumericSelection: activeLanguagePromptContext
    });
 
    if (inferredLanguage && inferredLanguage !== session.current_language) {
      updateSession(userID, { current_language: inferredLanguage, awaiting_language: false });
      session.current_language = inferredLanguage;
      session.awaiting_language = false;
      console.log(`[AWAITING LANGUAGE RESOLVED] user=${userID} language=${inferredLanguage}`);
    }
 
    const effectiveCurrentLanguage = inferredLanguage || session.current_language;
    const effectiveAwaitingLanguage =
      (session.awaiting_language || effectiveCurrentLanguage === null) &&
      effectiveCurrentLanguage === null;
 
    if (!effectiveAwaitingLanguage && isLanguageSelectionInput(userText, effectiveCurrentLanguage, {
      allowNumericSelection: activeLanguagePromptContext
    })) {
      console.log(
        `[LANGUAGE SELECTION PASS] user=${userID} session_id=${sessions[userID].session_id} text="${userText}" language=${effectiveCurrentLanguage}`
      );
    }
 
    const shouldGateForLanguage =
      effectiveAwaitingLanguage &&
      !isLanguageSelectionInput(userText, effectiveCurrentLanguage, {
        allowNumericSelection: activeLanguagePromptContext
      }) &&
      !exitCommand &&
      !restartCommand;
 
    if (shouldGateForLanguage) {
      const prompt = buildLanguageSelectionPrompt();
 
      await axios.post(
        `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: userID,
          type: "text",
          text: { body: prompt }
        },
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
 
      updateSession(userID, {
        state: "idle",
        active_request: null,
        current_language: null,
        awaiting_language: true,
        side_chat_count: 0,
        last_bot_reply: prompt,
        fast_path_context: "main_menu"
      });
 
      console.log(
        `[LANGUAGE GATE BLOCK] user=${userID} session_id=${sessions[userID].session_id} text="${userText}" reason=awaiting_language`
      );
 
      await runLogsHook(
        "captureLanguageGateBlock",
        buildHookPayload({
          user_id: userID,
          user_text: userText,
          session_summary: getSessionSummary(sessions[userID]),
          summary: "language_gate_block"
        })
      );
 
      return;
    }
 
    // ── COMBINED MENU + LANGUAGE SWITCH (v14.0.4-fix) ──────────────────────
    // Handles "main menu, spanish", "menu in english", "menú principal en español"
    // and similar combined reset+language-switch phrases deterministically.
    // Must run: after language gate (language must already be set), before fast
    // path, before Voiceflow. Never fires when awaiting_language is true.
    if (combinedMenuLanguageCommand && !effectiveAwaitingLanguage) {
      const targetLang = combinedMenuLanguageCommand;
      const propertyDataForMenu = await loadPropertyPackage(PROPERTY_ID);
      const menuTemplates = propertyDataForMenu?.responseTemplates || {};
      const mainMenuReply =
        targetLang === "es"
          ? menuTemplates.main_menu_prompt_es
          : menuTemplates.main_menu_prompt_en;

      if (mainMenuReply) {
        updateSession(userID, {
          current_language: targetLang,
          awaiting_language: false,
          fast_path_context: "main_menu",
          active_request: null,
          selected_restaurant: null,
          side_chat_count: 0,
          last_bot_reply: mainMenuReply
        });
        session.current_language = targetLang;
        session.fast_path_context = "main_menu";

        console.log(
          `[COMBINED MENU+LANG RESET] user=${userID} session_id=${sessions[userID].session_id} lang=${targetLang}`
        );

        const _dryRunCombined =
          FAST_PATH_DRY_RUN ||
          userID === "test-user" ||
          String(userID || "").startsWith("test-");

        if (!_dryRunCombined) {
          await axios.post(
            `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: userID,
              type: "text",
              text: { body: mainMenuReply }
            },
            {
              headers: {
                Authorization: `Bearer ${WA_TOKEN}`,
                "Content-Type": "application/json"
              }
            }
          );
        } else {
          console.log(
            `[COMBINED MENU+LANG DRY RUN] user=${userID} reply="${mainMenuReply}"`
          );
        }

        console.log(
          `[FAST PATH OUTBOUND] user=${userID} session_id=${sessions[userID].session_id} reply="${mainMenuReply}"`
        );
        console.log(`[SESSION AFTER FAST PATH]`, getSessionSummary(sessions[userID]));
        return;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── FAST PATH (V14.0.3 HYBRID) ────────────────────────────────────────
    // Runs only after language gate is satisfied and never on language-selection turns.
    // Hybrid rule:
    // - If Fast Path classifies and builds a reply, try to send it directly.
    // - For test-user / dry-run, log the reply and stop without Meta outbound.
    // - If Meta outbound fails for a real user, log the failure and continue to normal Voiceflow fallback.
    // - If no deterministic match/reply is found, continue to normal v13 Voiceflow path.
    if (FAST_PATH_ENABLED && !activeLanguagePromptContext && !isLanguageSelectionInput(userText, effectiveCurrentLanguage, {
      allowNumericSelection: activeLanguagePromptContext
    })) {
      try {
        const propertyData = await loadPropertyPackage(PROPERTY_ID);
 
        const fastPathResult = classifyFastPath({
          input: userText,
          session,
          menuBranches: propertyData.menuBranches
        });
 
        if (fastPathResult) {
          console.log(`[FAST PATH HIT] user=${userID} session_id=${session.session_id} type=${fastPathResult.type} key=${fastPathResult.option_key || fastPathResult.branch_key || "—"}`);
 
          const fastPathReply = buildResponse({
            result: fastPathResult,
            session,
            propertyData
          });
 
          if (fastPathReply) {
            console.log(`[FAST PATH REPLY BUILT] user=${userID} session_id=${session.session_id} reply="${fastPathReply}"`);
 
            const dryRunFastPath =
              FAST_PATH_DRY_RUN ||
              userID === "test-user" ||
              String(userID || "").startsWith("test-");
 
            if (dryRunFastPath) {
              updateSession(userID, {
                last_bot_reply: fastPathReply,
                fast_path_context: session.fast_path_context || "main_menu"
              });
 
              console.log(`[FAST PATH DRY RUN OUTBOUND] user=${userID} session_id=${sessions[userID].session_id} reply="${fastPathReply}"`);
              console.log(`[SESSION AFTER FAST PATH DRY RUN]`, getSessionSummary(sessions[userID]));
 
              return;
            }
 
            try {
              const outboundResponse = await axios.post(
                `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
                {
                  messaging_product: "whatsapp",
                  to: userID,
                  type: "text",
                  text: { body: fastPathReply }
                },
                {
                  headers: {
                    Authorization: `Bearer ${WA_TOKEN}`,
                    "Content-Type": "application/json"
                  }
                }
              );
 
              updateSession(userID, {
                last_bot_reply: fastPathReply,
                fast_path_context: session.fast_path_context || "main_menu"
              });
 
              await runLogsHook(
                "captureOutboundMessage",
                buildHookPayload({
                  user_id: userID,
                  reply: fastPathReply,
                  source_message_id: message.id || "",
                  whatsapp_message_id: outboundResponse?.data?.messages?.[0]?.id || "",
                  session_summary: getSessionSummary(sessions[userID]),
                  broadcast_status: "sent_to_meta",
                  client_message_status: "sent",
                  fast_path: true,
                  fast_path_result: fastPathResult
                })
              );
 
              console.log(`[FAST PATH OUTBOUND] user=${userID} session_id=${sessions[userID].session_id} reply="${fastPathReply}"`);
              console.log(`[SESSION AFTER FAST PATH]`, getSessionSummary(sessions[userID]));
 
              return;
            } catch (sendErr) {
              console.error(`[FAST PATH OUTBOUND ERROR → VF FALLBACK] user=${userID} session_id=${session.session_id} error=${sendErr?.response?.status || ""} ${sendErr?.message || sendErr}`);
            }
          } else {
            console.log(`[FAST PATH NO REPLY → VF FALLBACK] user=${userID} session_id=${session.session_id} type=${fastPathResult.type} key=${fastPathResult.option_key || fastPathResult.branch_key || "—"}`);
          }
        }
      } catch (err) {
        console.error(`[FAST PATH ERROR → VF FALLBACK] user=${userID} session_id=${session.session_id} error=${err?.stack || err?.message || err}`);
      }
    }
    // ─────────────────────────────────────────────────────────────────────
 
    // ---- REQUEST CONTROL ----
    let requestControlEvent = null;
    const wasActiveReservationBeforeReset =
      exitCommand && sessions[userID]?.active_request?.type === "reservation";
    // Mirrors wasActiveReservationBeforeReset for the other two case-producing
    // types — captures which one (if any) was active before exit resets the
    // session, so the closure block below knows whether to write and which
    // case_type/detail table to target.
    const preResetCaseType =
      exitCommand &&
      (sessions[userID]?.active_request?.type === "complaint" ||
        sessions[userID]?.active_request?.type === "incident")
        ? sessions[userID].active_request.type
        : null;
    const preResetGuestProfile = { ...(sessions[userID]?.guest_profile || createGuestProfile(userID)) };
    const preResetReservationContext = { ...(sessions[userID]?.reservation_context || createReservationContext()) };
    let preExitReservationClosure = null;
 
    if (restartCommand) {
      updateSession(userID, {
        session_id: generateSessionId(),
        active_request: null,
        current_language: null,
        awaiting_language: true,
        side_chat_count: 0,
        guest_profile: createGuestProfile(userID),
        reservation_context: createReservationContext(),
        selected_restaurant: null,
        selected_venue_id: null,
        last_bot_reply: null,
        state: "idle",
        fast_path_context: "main_menu"
      });

      console.log(`[REQUEST RESET] user=${userID} reason=restart_command`);
      await deleteVoiceflowState(userID, "restart_command");
      requestControlEvent = { request_action: "reset", reason: "restart_command" };
    } else if (menuCommand) {
      // selected_restaurant/selected_venue_id follow the same keep-if-actively-
      // reserving rule as reservation_context's venue fields just below --
      // otherwise a guest who says "menu" mid-reservation would lose the venue
      // the handoff prefix (buildRestaurantReservationHandoffPrefix) needs.
      const isActivelyReserving = sessions[userID]?.active_request?.type === "reservation";
      updateSession(userID, {
        active_request: null,
        side_chat_count: 0,
        fast_path_context: "main_menu",
        selected_restaurant: isActivelyReserving ? sessions[userID]?.selected_restaurant || null : null,
        selected_venue_id: isActivelyReserving ? sessions[userID]?.selected_venue_id || null : null,
        reservation_context: isActivelyReserving
          ? {
              ...createReservationContext(),
              venue_or_department: sessions[userID].reservation_context?.venue_or_department || null,
              service_time: sessions[userID].reservation_context?.service_time || null,
              party_size: sessions[userID].reservation_context?.party_size || null
            }
          : createReservationContext()
      });
 
      console.log(`[REQUEST RESET] user=${userID} reason=menu_command`);
      requestControlEvent = { request_action: "reset", reason: "menu_command" };
    } else if (exitCommand) {
      updateSession(userID, {
        session_id: generateSessionId(),
        active_request: null,
        current_language: null,
        awaiting_language: true,
        side_chat_count: 0,
        guest_profile: createGuestProfile(userID),
        reservation_context: createReservationContext(),
        selected_restaurant: null,
        selected_venue_id: null,
        last_bot_reply: null,
        state: "idle",
        fast_path_context: "main_menu"
      });

      console.log(`[REQUEST RESET] user=${userID} reason=exit_command`);
      await deleteVoiceflowState(userID, "exit_command");
      requestControlEvent = { request_action: "reset", reason: "exit_command" };
    } else {
      const currentSession = sessions[userID];
 
      if (!currentSession.active_request) {
        // v13.1.20: reservation activation layer — fires before generic detectIntent write
        // to catch venue-selection, affirmative, and detail-rich turns that return null from detectIntent
        const reservationActivation =
          detectedIntent !== "reservation" &&
          shouldActivateReservation(userText, currentSession);
 
        const effectiveIntent = reservationActivation ? "reservation" : detectedIntent;
        const activationReason = reservationActivation ? "reservation_activation" : "intent_detection";
 
        if (effectiveIntent) {
          const newRequest = {
            type: effectiveIntent,
            status: initialStatusForType(effectiveIntent)
          };
 
          updateSession(userID, {
            active_request: newRequest,
            awaiting_language: false,
            reservation_context: newRequest.type === "reservation"
              ? (sessions[userID]?.reservation_context || createReservationContext())
              : createReservationContext()
          });
 
          console.log(
            `[REQUEST DETECTED] user=${userID} type=${newRequest.type} status=${newRequest.status} via=${activationReason}`
          );
          requestControlEvent = { request_action: "detected", request_type: newRequest.type, request_status: newRequest.status };
        }
      } else {
        if (shouldSwitchIntent(currentSession.active_request, detectedIntent, userText)) {
          const previousType = currentSession.active_request.type;
          const newRequest = {
            type: detectedIntent,
            status: initialStatusForType(detectedIntent)
          };
 
          updateSession(userID, { active_request: newRequest, awaiting_language: false, reservation_context: newRequest.type === "reservation" ? (sessions[userID]?.reservation_context || createReservationContext()) : createReservationContext() });
 
          console.log(
            `[REQUEST SWITCH] user=${userID} from=${previousType} to=${newRequest.type} status=${newRequest.status}`
          );
          requestControlEvent = { request_action: "switched", previous_request_type: previousType, request_type: newRequest.type, request_status: newRequest.status };
        } else if (shouldClearActiveRequest(currentSession.active_request, detectedIntent, userText)) {
          const previousType = currentSession.active_request.type;
 
          updateSession(userID, { active_request: null, reservation_context: createReservationContext() });
 
          console.log(
            `[REQUEST CLEARED] user=${userID} from=${previousType} reason=non_continuation_unmatched_topic`
          );
          requestControlEvent = { request_action: "cleared", previous_request_type: previousType, reason: "non_continuation_unmatched_topic" };
        } else {
          console.log(
            `[REQUEST CONTINUING] user=${userID} type=${currentSession.active_request.type} status=${currentSession.active_request.status}`
          );
        }
      }
    }
 
    if (requestControlEvent) {
      const hookName = requestControlEvent.request_action === "reset"
        ? "captureRequestReset"
        : "captureRequestState";
 
      await runLogsHook(
        hookName,
        buildHookPayload({
          user_id: userID,
          user_text: userText,
          detected_intent: detectedIntent,
          active_request: sessions[userID]?.active_request || null,
          session_summary: getSessionSummary(sessions[userID]),
          ...requestControlEvent
        })
      );
    }
 
    if (exitCommand) {
      const exitReplyLanguage =
        effectiveCurrentLanguage ||
        (detectedInputLanguage === "es" || detectedInputLanguage === "en" ? detectedInputLanguage : null);
      const exitReply = buildMiddlewareExitReply(exitReplyLanguage);
 
      if (wasActiveReservationBeforeReset) {
        const closureSummary =
          preResetReservationContext.reservation_summary ||
          buildReservationContextSummary(preResetReservationContext);
 
        preExitReservationClosure = {
          session_summary: getSessionSummary(sessions[userID]),
          guest_name: preResetGuestProfile.guest_name || null,
          contact_phone: preResetGuestProfile.contact_phone || null,
          contact_email: preResetGuestProfile.contact_email || null,
          service_date: preResetReservationContext.resolved_date || null,
          service_time: preResetReservationContext.service_time || null,
          venue_or_department: preResetReservationContext.venue_or_department || null,
          party_size: preResetReservationContext.party_size || null,
          reservation_summary: closureSummary || null
        };
 
        console.log(
          `[PRE-EXIT RESERVATION SNAPSHOT] user=${userID} venue=${preExitReservationClosure.venue_or_department || "—"} date=${preExitReservationClosure.service_date || "—"} time=${preExitReservationClosure.service_time || "—"} party_size=${preExitReservationClosure.party_size || "—"}`
        );
 
        await runLogsHook(
          "captureRequestClosure",
          buildHookPayload({
            user_id: userID,
            session_summary: preExitReservationClosure.session_summary,
            guest_name: preExitReservationClosure.guest_name,
            contact_phone: preExitReservationClosure.contact_phone,
            contact_email: preExitReservationClosure.contact_email,
            service_date: preExitReservationClosure.service_date,
            service_time: preExitReservationClosure.service_time || null,
            venue_or_department: preExitReservationClosure.venue_or_department || null,
            party_size: preExitReservationClosure.party_size || null,
            summary: preExitReservationClosure.reservation_summary || null
          })
        );

        // ---- SUPABASE RESERVATION WRITE (minimal walking-skeleton path -- soft-fail, never blocks reply) ----
        try {
          const caseId = await writeReservationCase({
            user_id: userID,
            guest_name: preExitReservationClosure.guest_name,
            contact_phone: preExitReservationClosure.contact_phone,
            service_date: preExitReservationClosure.service_date,
            service_time: preExitReservationClosure.service_time || null,
            venue_or_department: preExitReservationClosure.venue_or_department || null,
            party_size: preExitReservationClosure.party_size || null,
            summary: preExitReservationClosure.reservation_summary || null
          });
          console.log(`[SUPABASE RESERVATION WRITE] user=${userID} case_id=${caseId || "skipped"}`);
        } catch (err) {
          console.error(`[SUPABASE RESERVATION WRITE ERROR] user=${userID}`, err?.stack || err?.message || err);
        }
      }

      // ---- SUPABASE COMPLAINT/INCIDENT WRITE (minimal walking-skeleton path -- soft-fail, never blocks reply) ----
      if (preResetCaseType) {
        try {
          const caseId = await writeCaseFromActiveRequest({
            user_id: userID,
            guest_name: preResetGuestProfile.guest_name || null,
            contact_phone: preResetGuestProfile.contact_phone || null,
            case_type: preResetCaseType,
            summary: preResetCaseType === "incident" ? "Incident reported via WhatsApp" : "Complaint reported via WhatsApp"
          });
          console.log(`[SUPABASE ${preResetCaseType.toUpperCase()} WRITE] user=${userID} case_id=${caseId || "skipped"}`);
        } catch (err) {
          console.error(`[SUPABASE ${preResetCaseType.toUpperCase()} WRITE ERROR] user=${userID}`, err?.stack || err?.message || err);
        }
      }

      updateSession(userID, { state: "idle", active_request: null, last_bot_reply: exitReply });
 
      console.log(`[SESSION AFTER]`, getSessionSummary(sessions[userID]));
 
      const outboundResponse = await axios.post(
        `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: userID,
          type: "text",
          text: { body: exitReply }
        },
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
 
      await runLogsHook(
        "captureOutboundMessage",
        buildHookPayload({
          user_id: userID,
          reply: exitReply,
          source_message_id: message.id || "",
          whatsapp_message_id: outboundResponse?.data?.messages?.[0]?.id || "",
          session_summary: getSessionSummary(sessions[userID]),
          broadcast_status: "sent_to_meta",
          client_message_status: "sent"
        })
      );
 
      console.log(
        `[OUTBOUND] user=${userID} session_id=${sessions[userID].session_id} reply="${exitReply}"`
      );
 
      return;
    }
 
    const currentSessionAfterControl = sessions[userID];
    const shouldEvaluateReservationDate =
      currentSessionAfterControl?.active_request?.type === "reservation" ||
      detectedIntent === "reservation" ||
      wasActiveReservationBeforeReset === true;
    const reservationDateContextFromText = shouldEvaluateReservationDate
      ? resolveReservationDateContext(userText)
      : createReservationContext();
    const reservationDetailContextFromText = shouldEvaluateReservationDate
      ? extractReservationDetailContext(userText, currentSessionAfterControl)
      : {};
    let mergedReservationContext = wasActiveReservationBeforeReset
      ? preResetReservationContext
      : (currentSessionAfterControl?.reservation_context || createReservationContext());
    let reservationContextChanged = false;
 
    if (shouldEvaluateReservationDate && reservationDateContextFromText.resolution_status) {
      mergedReservationContext = mergeReservationContext(
        mergedReservationContext,
        reservationDateContextFromText
      );
      reservationContextChanged = true;
 
      console.log(
        `[RESERVATION DATE CONTEXT] user=${userID} status=${mergedReservationContext.resolution_status} resolved_date=${mergedReservationContext.resolved_date || "—"}`
      );
    }
 
    if (shouldEvaluateReservationDate && hasReservationDetailContextPatch(reservationDetailContextFromText)) {
      mergedReservationContext = mergeReservationContext(
        mergedReservationContext,
        reservationDetailContextFromText
      );
      reservationContextChanged = true;
 
      console.log(
        `[RESERVATION DETAIL CONTEXT] user=${userID} venue=${mergedReservationContext.venue_or_department || "—"} date=${mergedReservationContext.resolved_date || "—"} time=${mergedReservationContext.service_time || "—"} party_size=${mergedReservationContext.party_size || "—"}`
      );
    }
 
    if (shouldEvaluateReservationDate) {
      const reservationSummary = buildReservationContextSummary(mergedReservationContext);
      if (reservationSummary && reservationSummary !== mergedReservationContext.reservation_summary) {
        mergedReservationContext = {
          ...mergedReservationContext,
          reservation_summary: reservationSummary
        };
        reservationContextChanged = true;
      }
    }
 
    if (shouldEvaluateReservationDate && currentSessionAfterControl?.active_request?.type === "reservation") {
      const activeReservation = ensureActiveReservationDraft(currentSessionAfterControl);

      if (activeReservation) {
        console.log(
          `[RESERVATION DRAFT ACTIVE] user=${userID} reservation_id=${activeReservation.local_id}`
        );
      }

      const activeReservationPatch = {};

      if (mergedReservationContext?.resolved_date) {
        activeReservationPatch.service_date = mergedReservationContext.resolved_date;
      }

      if (mergedReservationContext?.service_time) {
        activeReservationPatch.service_time = mergedReservationContext.service_time;
      }

      if (mergedReservationContext?.party_size) {
        activeReservationPatch.party_size = mergedReservationContext.party_size;
      }

      if (mergedReservationContext?.venue_or_department) {
        activeReservationPatch.venue_name = mergedReservationContext.venue_or_department;
      }

      if (Object.keys(activeReservationPatch).length > 0) {
        updateActiveReservation(currentSessionAfterControl, activeReservationPatch);
        console.log(
          `[RESERVATION DRAFT UPDATED] user=${userID} reservation_id=${currentSessionAfterControl.active_reservation_id} fields=${Object.keys(activeReservationPatch).join(",")}`
        );
      }

      syncActiveReservationToReservationContext(currentSessionAfterControl);
      mergedReservationContext = currentSessionAfterControl.reservation_context;
      reservationContextChanged = true;
    }

    if (shouldEvaluateReservationDate && reservationContextChanged) {
      updateSession(userID, {
        reservation_context: mergedReservationContext,
        reservations: currentSessionAfterControl?.reservations,
        active_reservation_id: currentSessionAfterControl?.active_reservation_id,
        next_reservation_seq: currentSessionAfterControl?.next_reservation_seq
      });
      currentSessionAfterControl.reservation_context = mergedReservationContext;
    }
 
    const partySizeRoutingFromText = shouldEvaluateReservationDate
      ? parseReservationPartySizeForRouting(userText)
      : { raw_party_size: null, standard_party_size: null, requires_vip_group_handoff: false };

    const isRestaurantReservationScoped =
      currentSessionAfterControl?.fast_path_context === "restaurant_followup_menu" ||
      !!currentSessionAfterControl?.selected_restaurant;

    if (
      shouldEvaluateReservationDate &&
      isRestaurantReservationScoped &&
      partySizeRoutingFromText.requires_vip_group_handoff
    ) {
      const propertyDataForVipGroup = await loadPropertyPackage(PROPERTY_ID);
      const vipGroupReply =
        currentSessionAfterControl?.current_language === "es"
          ? propertyDataForVipGroup?.responseTemplates?.vip_group_handoff_restaurant_es
          : propertyDataForVipGroup?.responseTemplates?.vip_group_handoff_restaurant_en;

      if (vipGroupReply) {
        updateSession(userID, {
          active_request: { type: "vip_group_request", status: "handoff" },
          awaiting_language: false,
          fast_path_context: "main_menu",
          side_chat_count: 0,
          last_bot_reply: vipGroupReply
        });

        console.log(
          `[VIP/GROUP HANDOFF] user=${userID} session_id=${sessions[userID].session_id} venue=${currentSessionAfterControl?.selected_restaurant || "—"} raw_party_size=${partySizeRoutingFromText.raw_party_size || "—"}`
        );

        const dryRunVipGroup =
          FAST_PATH_DRY_RUN ||
          userID === "test-user" ||
          String(userID || "").startsWith("test-");

        if (!dryRunVipGroup) {
          await axios.post(
            `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
            {
              messaging_product: "whatsapp",
              to: userID,
              type: "text",
              text: { body: vipGroupReply }
            },
            {
              headers: {
                Authorization: `Bearer ${WA_TOKEN}`,
                "Content-Type": "application/json"
              }
            }
          );
        } else {
          console.log(
            `[VIP/GROUP HANDOFF DRY RUN] user=${userID} reply="${vipGroupReply}"`
          );
        }

        console.log(
          `[FAST PATH OUTBOUND] user=${userID} session_id=${sessions[userID].session_id} reply="${vipGroupReply}"`
        );
        console.log(`[SESSION AFTER FAST PATH]`, getSessionSummary(sessions[userID]));
        return;
      }
    }

    const isSideChat = shouldTrackSideChat(currentSessionAfterControl, userText, detectedIntent, {
      languageCommand,
      restartCommand,
      menuCommand,
      exitCommand
    });
 
    if (currentSessionAfterControl?.active_request) {
      if (isSideChat) {
        const nextSideChatCount = (currentSessionAfterControl.side_chat_count || 0) + 1;
        updateSession(userID, { side_chat_count: nextSideChatCount });
        console.log(
          `[SIDE CHAT] user=${userID} type=${currentSessionAfterControl.active_request.type} side_chat_count=${nextSideChatCount}`
        );
      } else if ((currentSessionAfterControl.side_chat_count || 0) !== 0) {
        updateSession(userID, { side_chat_count: 0 });
      }
    }
 
    const forceLaunch =
      restartCommand ||
      (session.state === "idle" &&
        greetingReentry &&
        !languageCommand &&
        !menuCommand &&
        !exitCommand &&
        !detectedIntent);
 
    let forwardedText = userText;
 
    if (menuCommand) {
      forwardedText = "main menu";
    } else if (languageCommand === "en") {
      forwardedText = "english";
    } else if (languageCommand === "es") {
      forwardedText = "español";
    } else if (exitCommand) {
      forwardedText = "goodbye";
    }
 
    // v14.0.4 additive — Bug B (Reservation phone reuse).
    // If we previously offered to reuse the stored phone on the reservation
    // contact step, resolve the guest's decision here. Restricted to the
    // reservation flow: an active reservation or restaurant_followup_menu.
    // - If the guest typed a new phone number, extractGuestProfileUpdate has
    //   already updated guest_profile.contact_phone; we just clear the flag.
    // - If the guest affirmatively reuses the stored number, we synthesize
    //   forwardedText to be just the stored digits so VF's normal phone
    //   capture step completes without re-prompting.
    // - If the guest declines or sends something unrelated, we clear the flag
    //   and forward their original text unchanged so VF continues normally.
    if (
      sessions[userID]?.awaiting_phone_reuse_decision &&
      !menuCommand &&
      !languageCommand &&
      !exitCommand
    ) {
      const _storedPhone = sessions[userID]?.guest_profile?.contact_phone || null;
      const _userTypedPhone = extractPhone(userText);
      let _phoneReuseDecision = "unclear";
 
      if (_userTypedPhone) {
        _phoneReuseDecision = "new_phone";
      } else if (_storedPhone && isPhoneReuseAffirmative(userText)) {
        _phoneReuseDecision = "reuse";
        forwardedText = String(_storedPhone);
        console.log(
          `[PHONE REUSE CONFIRMED] user=${userID} session_id=${sessions[userID].session_id} contact_phone=${_storedPhone}`
        );
      } else if (isPhoneReuseDecline(userText)) {
        _phoneReuseDecision = "decline";
        console.log(
          `[PHONE REUSE DECLINED] user=${userID} session_id=${sessions[userID].session_id}`
        );
      }
 
      updateSession(userID, { awaiting_phone_reuse_decision: false });
      if (sessions[userID]) sessions[userID].awaiting_phone_reuse_decision = false;
      console.log(
        `[PHONE REUSE DECISION] user=${userID} decision=${_phoneReuseDecision}`
      );
    }
    
    const restaurantReservationHandoffPrefix = buildRestaurantReservationHandoffPrefix(
      sessions[userID],
      userText,
      detectedIntent
    );
 
    if (restaurantReservationHandoffPrefix) {
      forwardedText = `${restaurantReservationHandoffPrefix}${forwardedText}`;
    }
 
    // v14.0.4 additive — Bug A (Loyalty branch drift).
    // When the session is in the Loyalty and points branch, prepend the
    // loyalty-stay instruction so VF does not drift into General information
    // or merge Promotions into Loyalty for ambiguous follow-ups.
    const loyaltyStayPrefix = buildLoyaltyStayPrefix(sessions[userID]);
    if (loyaltyStayPrefix) {
      forwardedText = `${loyaltyStayPrefix}${forwardedText}`;
    }
 
    const lockedResponseLanguage = exitCommand
      ? null
      : sessions[userID]?.current_language || effectiveCurrentLanguage || null;
    // Language lock bypass: skip prefix injection when drift risk is negligible.
    // Extended: also skip when the guest's input language matches the session language
    // (detected as same language = no drift) AND the turn is short/structured.
    // This avoids ~65 tokens of prefix overhead on safe turns.
    const inputMatchesSessionLanguage =
      !!lockedResponseLanguage &&
      !!detectedInputLanguage &&
      detectedInputLanguage !== "unknown" &&
      detectedInputLanguage === lockedResponseLanguage;
 
    const currentTurnRequestedTime = parseRequestedClockTime(userText);
    const currentTurnHasDateSignal = !!reservationDateContextFromText.resolution_status;
    const currentTurnHasTimeSignal = !!currentTurnRequestedTime;
    const isSafetySensitiveRequest =
      sessions[userID]?.active_request?.type === "complaint" ||
      sessions[userID]?.active_request?.type === "incident";
 
    const isShortStructuredTurn =
      normalizeText(userText).length <= 60 &&
      !currentTurnHasDateSignal &&
      !currentTurnHasTimeSignal;
 
    // Dining-list classifier: fires only in dining context, on short unambiguous
    // list-request turns with no detail signals. Removes ~65-token prefix overhead.
    const isDiningList =
      !isSafetySensitiveRequest &&
      !currentTurnHasDateSignal &&
      !currentTurnHasTimeSignal &&
      isInDiningContext(
        sessions[userID]?.active_request?.type,
        sessions[userID]?.last_bot_reply,
        userText
      ) &&
      isDiningListRequest(userText);
 
    if (isDiningList) {
      console.log(
        `[DINING LIST REQUEST] user=${userID} session_id=${sessions[userID].session_id} input="${userText}"`
      );
    }
 
    const shouldBypassLanguageLock =
      !!languageCommand ||
      effectiveAwaitingLanguage ||
      isLanguageSelectionInput(userText, effectiveCurrentLanguage) ||
      isPlainNumericChoice(userText) ||
      isDiningList ||
      (!isSafetySensitiveRequest && inputMatchesSessionLanguage && isShortStructuredTurn);
 
    const activeReservationContext = sessions[userID]?.reservation_context || createReservationContext();
    // Date resolution prefix: skip when date is already resolved and this turn
    // has no new date/time signal. Avoids ~60 tokens on name/phone/notes turns.
    const turnHasDateOrTimeSignal =
      currentTurnHasDateSignal ||
      currentTurnHasTimeSignal;
 
    const dateAlreadyResolvedAndStable =
      sessions[userID]?.active_request?.type === "reservation" &&
      !!activeReservationContext?.resolved_date &&
      activeReservationContext?.resolution_status !== "conflict" &&
      !turnHasDateOrTimeSignal;
 
    const shouldApplyReservationDateInstruction =
      !shouldBypassLanguageLock &&
      !dateAlreadyResolvedAndStable &&
      (
        (shouldEvaluateReservationDate && !!reservationDateContextFromText.resolution_status) ||
        (
          sessions[userID]?.active_request?.type === "reservation" &&
          !!activeReservationContext?.resolved_date &&
          isLikelyDateClarificationPrompt(sessions[userID]?.last_bot_reply || "")
        ) ||
        (
          sessions[userID]?.active_request?.type === "reservation" &&
          activeReservationContext?.resolution_status === "conflict"
        )
      );
 
    forwardedText = applyReservationDateResolutionLock(
      forwardedText,
      shouldEvaluateReservationDate && reservationDateContextFromText.resolution_status
        ? reservationDateContextFromText
        : activeReservationContext,
      {
        skip: !shouldApplyReservationDateInstruction,
        language: lockedResponseLanguage || "en"
      }
    );
 
    forwardedText = applyResponseLanguageLock(forwardedText, lockedResponseLanguage, {
      skip: shouldBypassLanguageLock
    });
 
    const sessionBeforeForward = sessions[userID];
    const shouldReanchor =
      sessionBeforeForward?.active_request &&
      (sessionBeforeForward.side_chat_count || 0) >= 2 &&
      shouldTrackSideChat(sessionBeforeForward, userText, detectedIntent, {
        languageCommand,
        restartCommand,
        menuCommand,
        exitCommand
      });
 
    if (shouldReanchor) {
      const reanchorReply = buildReanchorMessage(sessionBeforeForward, userText);
 
      const reanchorResponse = await axios.post(
        `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: userID,
          type: "text",
          text: { body: reanchorReply }
        },
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
 
      await runLogsHook(
        "captureOutboundMessage",
        buildHookPayload({
          user_id: userID,
          reply: reanchorReply,
          source_message_id: message.id || "",
          whatsapp_message_id: reanchorResponse?.data?.messages?.[0]?.id || "",
          session_summary: getSessionSummary(sessions[userID]),
          broadcast_status: "sent_to_meta",
          client_message_status: "sent"
        })
      );
 
      updateSession(userID, { state: "active", side_chat_count: 0, last_bot_reply: reanchorReply });
 
      console.log(
        `[REANCHOR] user=${userID} session_id=${sessions[userID].session_id} type=${sessionBeforeForward.active_request.type} reply="${reanchorReply}"`
      );
 
      return;
    }
 
    const voiceflowStateVariables = buildVoiceflowStateVariables(sessions[userID], userText, {
      responseLanguage: lockedResponseLanguage,
      userInputLanguage: detectedInputLanguage,
      languageCommand,
      reservationDateContext: sessions[userID]?.reservation_context || createReservationContext()
    });
    const voiceflowRequestMetadata = {
      source: "middleware",
      timezone: voiceflowStateVariables.middleware_current_timezone,
      current_datetime_iso: voiceflowStateVariables.middleware_current_datetime_iso,
      active_request_type: voiceflowStateVariables.middleware_active_request_type,
      guest_name: voiceflowStateVariables.guest_name,
      response_language: voiceflowStateVariables.response_language,
      user_input_language: voiceflowStateVariables.middleware_user_input_language,
      language_lock: voiceflowStateVariables.language_lock,
      language_switch_requested: voiceflowStateVariables.explicit_language_switch_target,
      reservation_resolved_date: voiceflowStateVariables.middleware_reservation_resolved_date,
      reservation_date_resolution_status: voiceflowStateVariables.middleware_reservation_date_resolution_status
    };
 
    const vfUrl = `https://general-runtime.voiceflow.com/state/user/${userID}/interact`;
    const vfHeaders = {
      Authorization: VF_API_KEY,
      versionID: "production",
      "Content-Type": "application/json"
    };
 
    let traces = [];
    const _vfStart = Date.now();
 
    if (forceLaunch) {
      console.log(
        `[VOICEFLOW REQUEST] user=${userID} session_id=${sessions[userID].session_id} action=launch${
          languageCommand ? ` language=${languageCommand}` : ""
        }${menuCommand ? ` menu_command=true` : ""}${exitCommand ? ` exit_command=true` : ""}`
      );
 
      const vfResponse = await axios.post(
        vfUrl,
        {
          state: {
            variables: voiceflowStateVariables
          },
          request: voiceflowRequestMetadata,
          action: { type: "launch" },
          config: {
            session_id: sessions[userID].session_id
          }
        },
        {
          headers: vfHeaders
        }
      );
 
      traces = vfResponse.data;
    } else {
      const shouldPrimeIdleSession = session.state === "idle" && !exitCommand;
 
      if (shouldPrimeIdleSession) {
        console.log(
          `[VOICEFLOW PRIME] user=${userID} session_id=${sessions[userID].session_id} action=launch_then_text`
        );
 
        await axios.post(
          vfUrl,
          {
            state: {
              variables: voiceflowStateVariables
            },
            request: voiceflowRequestMetadata,
            action: { type: "launch" },
            config: {
              session_id: sessions[userID].session_id
            }
          },
          {
            headers: vfHeaders
          }
        );
      }
 
      console.log(
        `[VOICEFLOW REQUEST] user=${userID} session_id=${sessions[userID].session_id} action=text${
          languageCommand ? ` language=${languageCommand}` : ""
        }${menuCommand ? ` menu_command=true` : ""}${
          detectedIntent ? ` detected_intent=${detectedIntent}` : ""
        }${exitCommand ? ` exit_command=true` : ""} payload="${forwardedText}"`
      );
 
      const vfResponse = await axios.post(
        vfUrl,
        {
          state: {
            variables: voiceflowStateVariables
          },
          request: voiceflowRequestMetadata,
          action: {
            type: "text",
            payload: forwardedText
          },
          config: {
            session_id: sessions[userID].session_id
          }
        },
        {
          headers: vfHeaders
        }
      );
 
      traces = vfResponse.data;
    }
 
 
    // ── STALE IN-FLIGHT SUPPRESSION (v13.1.26) ──────────────────────────────
    // If session_id changed while awaiting the VF response, a concurrent reset
    // (exit / restart) fired and completed before this response landed.
    // This response belongs to the prior session — discard it entirely.
    // Do NOT mutate session state. Do NOT send an outbound. Log and return.
    if (sessions[userID]?.session_id !== sessionBeforeForward?.session_id) {
      console.log(
        `[STALE RESPONSE SUPPRESSED] user=${userID}` +
        ` stale_session=${sessionBeforeForward?.session_id}` +
        ` current_session=${sessions[userID]?.session_id}` +
        ` reason=session_rotated_during_vf_await`
      );
      return;
    }
    // ────────────────────────────────────────────────────────────────────────
 
 
    // ═══════════════════════════════════════════════════════════════════════════
    // VF BRIDGE — PHASE 1 READ BLOCK (v13.1.21)
    // Reads VF session state after interact resolves. Read/log only.
    // Non-fatal: bridge failure cannot break the user-facing response path.
    // ═══════════════════════════════════════════════════════════════════════════
    const _vfEnd = Date.now();
    console.log(`[TIMING] user=${userID} vf_interact_ms=${_vfEnd - _vfStart}`);
    const _bridgeStart = Date.now();
    try {
      const vfStateResult = await readVfState(userID);
 
      if (vfStateResult.ok) {
        readReservationCandidate(vfStateResult.state);
      }
      // If !ok: readVfState already logged the failure with [VF-BRIDGE-P1] prefix.
      // Normal webhook behavior continues regardless.
 
    } catch (bridgeErr) {
      // Belt-and-suspenders: catch any unexpected bridge error.
      // Must never reach the user-facing path.
      console.error(`[VF-BRIDGE-P1] unexpected bridge error — ${bridgeErr.message || bridgeErr}`);
    }
    const _bridgeEnd = Date.now();
    console.log(`[TIMING] user=${userID} bridge_read_ms=${_bridgeEnd - _bridgeStart}`);
    const _processingStart = Date.now();
    // ══════════════════════════════════════════════════════════════════════════
 
    // ---- EXTRACT TEXT REPLIES FROM VOICEFLOW ----
    const rawReplies = traces
      .filter((t) => t.type === "text")
      .map((t) => t.payload?.message)
      .filter(Boolean);
 
    const suppressedLanguagePrompt =
      !!sessions[userID]?.current_language &&
      !sessions[userID]?.awaiting_language &&
      rawReplies.some((reply) => isLanguageSelectionPromptText(reply));
 
    const filteredReplies = suppressedLanguagePrompt
      ? rawReplies.filter((reply) => !isLanguageSelectionPromptText(reply))
      : rawReplies;
 
    if (suppressedLanguagePrompt) {
      console.log(
        `[VOICEFLOW FILTER] user=${userID} session_id=${sessions[userID].session_id} action=suppress_language_prompt_mid_session`
      );
    }
 
    const replyLanguageMismatches = lockedResponseLanguage
      ? filteredReplies.map((reply) => ({ reply, ...detectReplyLanguageMismatch(reply, lockedResponseLanguage) }))
          .filter((item) => item.mismatch)
      : [];
 
    if (replyLanguageMismatches.length > 0) {
      console.log(
        `[VOICEFLOW FILTER] user=${userID} session_id=${sessions[userID].session_id} action=language_lock_mismatch locked=${lockedResponseLanguage} detected=${replyLanguageMismatches.map((item) => item.detectedLanguage).join(",")}`
      );
    }
 
    // v13.1.17: outbound reply substitution removed.
    // detectReplyLanguageMismatch fires for logging only (see replyLanguageMismatches above).
    // Session language changes exclusively through explicit switch commands.
 
    // ── SINGLE-OUTBOUND ENFORCEMENT (v13.1.28) ───────────────────────────────
    // VF may return multiple text traces per turn. Enforce one guest-facing
    // WhatsApp message per inbound turn by joining all traces into one reply.
    // Separator is a double newline so each trace reads as a distinct paragraph.
    let consolidatedReply = filteredReplies.join("\n\n");
 
    // v14.0.4 additive — Bug B (Reservation phone reuse).
    // If VF is asking for a phone number on the reservation contact step and we
    // already have a contact_phone on file (typically seeded from the guest's
    // WhatsApp userID), replace the outbound with a reuse-offer message and
    // set awaiting_phone_reuse_decision so the next inbound can resolve the
    // guest's choice (reuse / new number / decline).
    let _phoneReuseOfferApplied = false;
    try {
      const _propertyDataForReuse = await loadPropertyPackage(PROPERTY_ID);
      const _phoneReuseOffer = maybeBuildPhoneReuseOffer({
        reply: consolidatedReply,
        session: sessions[userID],
        responseTemplates: _propertyDataForReuse?.responseTemplates
      });
      if (_phoneReuseOffer) {
        consolidatedReply = _phoneReuseOffer;
        _phoneReuseOfferApplied = true;
        console.log(
          `[PHONE REUSE OFFER] user=${userID} session_id=${sessions[userID].session_id} reply_intercepted=true contact_phone=${sessions[userID]?.guest_profile?.contact_phone || "—"}`
        );
      }
    } catch (_phoneOfferErr) {
      console.error(
        `[PHONE REUSE OFFER ERROR] user=${userID} error=${_phoneOfferErr?.message || _phoneOfferErr}`
      );
    }
 
    const replies = consolidatedReply ? [consolidatedReply] : [];
    // ─────────────────────────────────────────────────────────────────────────
 
    await runLogsHook(
      "captureVoiceflowTurn",
      buildHookPayload({
        user_id: userID,
        user_text: userText,
        forwarded_text: forwardedText,
        detected_intent: detectedIntent,
        detected_input_language: detectedInputLanguage,
        locked_response_language: lockedResponseLanguage,
        explicit_language_switch_command: explicitLanguageSwitchCommand,
        session_summary: getSessionSummary(sessions[userID]),
        active_request: sessions[userID]?.active_request || null,
        trace_count: traces.length,
        reply_count: replies.length,
        raw_replies: filteredReplies,
        replies,
        reply_language_mismatches: replyLanguageMismatches,
        suppressed_language_prompt: suppressedLanguagePrompt,
        guest_profile: sessions[userID]?.guest_profile || null,
        voiceflow_state_variables: voiceflowStateVariables,
        summary: `voiceflow replies=${replies.length}`
      })
    );
 
    if (replies.length === 0) {
      const fallbackReply = getContextAwareFallbackMessage(userText, sessions[userID]);
 
      console.log(
        `[VOICEFLOW] No usable text reply for user=${userID} session_id=${sessions[userID].session_id} action=no_text_reply -> sending middleware fallback`
      );
 
      const _outboundStart = Date.now();
      const fallbackResponse = await axios.post(
        `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: userID,
          type: "text",
          text: { body: fallbackReply }
        },
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
 
      await runLogsHook(
        "captureOutboundMessage",
        buildHookPayload({
          user_id: userID,
          reply: fallbackReply,
          source_message_id: message.id || "",
          whatsapp_message_id: fallbackResponse?.data?.messages?.[0]?.id || "",
          session_summary: getSessionSummary(sessions[userID]),
          broadcast_status: "sent_to_meta",
          client_message_status: "sent"
        })
      );
 
      updateSession(
        userID,
        exitCommand ? { state: "idle", active_request: null, last_bot_reply: fallbackReply } : { state: "active", last_bot_reply: fallbackReply }
      );
 
      const _processingEnd = Date.now();
      console.log(`[TIMING] user=${userID} response_processing_ms=${_processingEnd - _processingStart}`);
      console.log(`[SESSION AFTER]`, getSessionSummary(sessions[userID]));
 
      const _turnEnd = Date.now();
      console.log(`[TIMING] user=${userID} outbound_ms=${_turnEnd - _outboundStart} total_turn_ms=${_turnEnd - _turnStart}`);
 
      console.log(
        `[OUTBOUND FALLBACK] user=${userID} session_id=${sessions[userID].session_id} reply="${fallbackReply}"`
      );
 
      return;
    }
 
    const combinedReplyForMemory = replies.join("\n\n");
 
    // ---- DEFERRED PRE-EXIT RESERVATION CLOSURE SNAPSHOT ----
    if (wasActiveReservationBeforeReset) {
      const closureSummary =
        mergedReservationContext.reservation_summary ||
        buildReservationContextSummary(mergedReservationContext);
 
      preExitReservationClosure = {
        session_summary: getSessionSummary(sessions[userID]),
        guest_name: preResetGuestProfile.guest_name || null,
        contact_phone: preResetGuestProfile.contact_phone || null,
        contact_email: preResetGuestProfile.contact_email || null,
        service_date: mergedReservationContext.resolved_date || null,
        service_time: mergedReservationContext.service_time || null,
        venue_or_department: mergedReservationContext.venue_or_department || null,
        party_size: mergedReservationContext.party_size || null,
        reservation_summary: closureSummary || null
      };
 
      console.log(
        `[PRE-EXIT RESERVATION SNAPSHOT] user=${userID} venue=${preExitReservationClosure.venue_or_department || "—"} date=${preExitReservationClosure.service_date || "—"} time=${preExitReservationClosure.service_time || "—"} party_size=${preExitReservationClosure.party_size || "—"}`
      );
    }
 
    // ---- LOGS CLOSURE HOOK (reservation confirmed exit only — Block B) ----
    if (preExitReservationClosure) {
      const closureSummary =
        preExitReservationClosure.reservation_summary ||
        buildReservationContextSummary({
          resolved_date: preExitReservationClosure.service_date || null,
          service_time: preExitReservationClosure.service_time || null,
          venue_or_department: preExitReservationClosure.venue_or_department || null,
          party_size: preExitReservationClosure.party_size || null
        });
 
      await runLogsHook(
        "captureRequestClosure",
        buildHookPayload({
          user_id: userID,
          session_summary: preExitReservationClosure.session_summary,
          guest_name: preExitReservationClosure.guest_name,
          contact_phone: preExitReservationClosure.contact_phone,
          contact_email: preExitReservationClosure.contact_email,
          service_date: preExitReservationClosure.service_date,
          service_time: preExitReservationClosure.service_time || null,
          venue_or_department: preExitReservationClosure.venue_or_department || null,
          party_size: preExitReservationClosure.party_size || null,
          summary: closureSummary || null
        })
      );

      // ---- SUPABASE RESERVATION WRITE (minimal walking-skeleton path — soft-fail, never blocks reply) ----
      try {
        const caseId = await writeReservationCase({
          user_id: userID,
          guest_name: preExitReservationClosure.guest_name,
          contact_phone: preExitReservationClosure.contact_phone,
          service_date: preExitReservationClosure.service_date,
          service_time: preExitReservationClosure.service_time || null,
          venue_or_department: preExitReservationClosure.venue_or_department || null,
          party_size: preExitReservationClosure.party_size || null,
          summary: closureSummary || null
        });
        console.log(`[SUPABASE RESERVATION WRITE] user=${userID} case_id=${caseId || "skipped"}`);
      } catch (err) {
        console.error(`[SUPABASE RESERVATION WRITE ERROR] user=${userID}`, err?.stack || err?.message || err);
      }
    }

    // ---- SUPABASE COMPLAINT/INCIDENT WRITE (minimal walking-skeleton path — soft-fail, never blocks reply) ----
    if (preResetCaseType) {
      try {
        const caseId = await writeCaseFromActiveRequest({
          user_id: userID,
          guest_name: preResetGuestProfile.guest_name || null,
          contact_phone: preResetGuestProfile.contact_phone || null,
          case_type: preResetCaseType,
          summary: preResetCaseType === "incident" ? "Incident reported via WhatsApp" : "Complaint reported via WhatsApp"
        });
        console.log(`[SUPABASE ${preResetCaseType.toUpperCase()} WRITE] user=${userID} case_id=${caseId || "skipped"}`);
      } catch (err) {
        console.error(`[SUPABASE ${preResetCaseType.toUpperCase()} WRITE ERROR] user=${userID}`, err?.stack || err?.message || err);
      }
    }

    updateSession(
      userID,
      exitCommand
        ? { state: "idle", active_request: null, last_bot_reply: combinedReplyForMemory, awaiting_phone_reuse_decision: false }
        : { state: "active", last_bot_reply: combinedReplyForMemory, awaiting_phone_reuse_decision: _phoneReuseOfferApplied === true }
    );
 
    // v13.1.18: back-populate venue from bot reply when runtime confirmed it conversationally
    // and middleware has not yet captured it from user text.
    // Guards: active reservation only · write-only-when-null · exactly one registry hit required.
    if (
      sessions[userID]?.active_request?.type === "reservation" &&
      !sessions[userID]?.reservation_context?.venue_or_department &&
      combinedReplyForMemory
    ) {
      const venueFromReply = extractSingleVenueFromReply(combinedReplyForMemory);
      if (venueFromReply) {
        updateSession(userID, {
          reservation_context: {
            ...(sessions[userID]?.reservation_context || createReservationContext()),
            venue_or_department: venueFromReply
          }
        });
        console.log(
          `[VENUE HYDRATED FROM REPLY] user=${userID} venue=${venueFromReply}`
        );
      }
    }
 
    const _processingEnd = Date.now();
    console.log(`[TIMING] user=${userID} response_processing_ms=${_processingEnd - _processingStart}`);
    console.log(`[SESSION AFTER]`, getSessionSummary(sessions[userID]));
 
    // ---- SEND REPLY BACK VIA WHATSAPP ----
    const _outboundStart = Date.now();
    for (const reply of replies) {
      const outboundResponse = await axios.post(
        `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: userID,
          type: "text",
          text: { body: reply }
        },
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
 
      await runLogsHook(
        "captureOutboundMessage",
        buildHookPayload({
          user_id: userID,
          reply,
          source_message_id: message.id || "",
          whatsapp_message_id: outboundResponse?.data?.messages?.[0]?.id || "",
          session_summary: getSessionSummary(sessions[userID]),
          broadcast_status: "sent_to_meta",
          client_message_status: "sent"
        })
      );
 
      console.log(
        `[OUTBOUND] user=${userID} session_id=${sessions[userID].session_id} reply="${reply}"`
      );
      }
    const _turnEnd = Date.now();
    console.log(`[TIMING] user=${userID} outbound_ms=${_turnEnd - _outboundStart} total_turn_ms=${_turnEnd - _turnStart}`);
      } catch (err) {
        await runLogsHook(
          "captureMiddlewareError",
          buildHookPayload({
            event_type: "middleware_error",
            summary: err.response?.data ? JSON.stringify(err.response.data) : err.message,
            error_message: err.message
          })
        );
 
        console.error("[ERROR]", err.response?.data || err.message);
      }
    }); // end enqueueForUser
  } catch (outerErr) {
    console.error("[ERROR] outer handler:", outerErr.message);
  }
});
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
 
