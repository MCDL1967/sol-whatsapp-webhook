/*
WEBHOOK
File: webhook.v13.1.10.js
Version: v13.1.10
Date: 2026-04-14
Role: WhatsApp ↔ Voiceflow middleware webhook
Status: patched working candidate
Base: webhook.v13.1.5.js

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

const app = express();

app.use(express.json());

const VERIFY_TOKEN = "sol_verify_123";
const VF_API_KEY = process.env.VF_API_KEY;
const WA_TOKEN = process.env.WA_TOKEN;
const WA_PHONE_ID = process.env.WA_PHONE_ID;
const PANAMA_TIMEZONE = "America/Panama";
const LOGS_TASK_QUEUE_FILE = process.env.LOGS_TASK_QUEUE_FILE || "";
const LOGS_EXPORT_TOKEN = process.env.LOGS_EXPORT_TOKEN || "";

// ---- SESSION CONTROL CONFIG ----
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const sessions = {};

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
    source_text: null
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
    last_bot_reply: null,
    created_at: now,
    last_seen: now
  };
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
    "for now"
  ];
  if (disallowed.includes(normalized)) return false;

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return false;

  return tokens.every((token) => /^[A-Za-zÀ-ÿ'’-]+$/.test(token));
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

function extractGuestName(text = "", session = null) {
  const raw = (text || "").trim();
  if (!raw) return null;

  const explicitPatterns = [
    /\bmy name is\s+([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){0,3})/i,
    /\bname is\s+([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){0,3})/i,
    /\bunder the name\s+([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){0,3})/i,
    /\bthis is\s+([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){0,3})/i
  ];

  for (const pattern of explicitPatterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return titleCaseWords(cleanNameCandidate(match[1]));
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

function resolveReservationDateContext(text = "", baseDate = new Date()) {
  const absoluteRef = parseAbsoluteDateReference(text, baseDate);
  const relativeRef = parseRelativeDateReference(text, baseDate);

  if (!absoluteRef && !relativeRef) {
    return createReservationContext();
  }

  if (absoluteRef && relativeRef) {
    if (absoluteRef.iso_date === relativeRef.iso_date) {
      return {
        resolved_date: absoluteRef.iso_date,
        resolved_weekday: absoluteRef.weekday,
        resolution_status: "consistent_relative_absolute",
        conflict_relative_date: null,
        conflict_absolute_date: null,
        source_text: text || ""
      };
    }

    return {
      resolved_date: null,
      resolved_weekday: null,
      resolution_status: "conflict",
      conflict_relative_date: relativeRef.iso_date,
      conflict_absolute_date: absoluteRef.iso_date,
      source_text: text || ""
    };
  }

  if (absoluteRef) {
    return {
      resolved_date: absoluteRef.iso_date,
      resolved_weekday: absoluteRef.weekday,
      resolution_status: "absolute_only",
      conflict_relative_date: null,
      conflict_absolute_date: null,
      source_text: text || ""
    };
  }

  return {
    resolved_date: relativeRef.iso_date,
    resolved_weekday: relativeRef.weekday,
    resolution_status: "relative_only",
    conflict_relative_date: null,
    conflict_absolute_date: null,
    source_text: text || ""
  };
}

function mergeReservationContext(existingContext = {}, patch = {}) {
  if (!patch || !patch.resolution_status || patch.resolution_status === "none") {
    return existingContext && Object.keys(existingContext).length > 0 ? existingContext : createReservationContext();
  }

  if (patch.resolution_status === "conflict") {
    return {
      resolved_date: existingContext?.resolved_date || null,
      resolved_weekday: existingContext?.resolved_weekday || null,
      resolution_status: "conflict",
      conflict_relative_date: patch.conflict_relative_date || null,
      conflict_absolute_date: patch.conflict_absolute_date || null,
      source_text: patch.source_text || existingContext?.source_text || null
    };
  }

  return {
    resolved_date: patch.resolved_date || existingContext?.resolved_date || null,
    resolved_weekday: patch.resolved_weekday || existingContext?.resolved_weekday || null,
    resolution_status: patch.resolution_status || existingContext?.resolution_status || null,
    conflict_relative_date: null,
    conflict_absolute_date: null,
    source_text: patch.source_text || existingContext?.source_text || null
  };
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
  const reservationContext = options.reservationDateContext || session?.reservation_context || createReservationContext();

  return {
    middleware_session_id: session?.session_id || null,
    middleware_current_language: session?.current_language || null,
    middleware_locked_response_language: responseLanguage,
    middleware_user_input_language: userInputLanguage,
    middleware_language_lock: !!responseLanguage,
    middleware_language_switch_requested: explicitLanguageSwitch || null,
    middleware_active_request_type: session?.active_request?.type || null,
    middleware_active_request_status: session?.active_request?.status || null,
    middleware_current_datetime_iso: runtimeContext.current_datetime_iso,
    middleware_current_date: runtimeContext.current_date,
    middleware_current_time: runtimeContext.current_time,
    middleware_current_weekday: runtimeContext.current_weekday,
    middleware_current_timezone: runtimeContext.current_timezone,
    middleware_today_date: runtimeContext.today_date,
    middleware_tomorrow_date: runtimeContext.tomorrow_date,
    middleware_tomorrow_weekday: runtimeContext.tomorrow_weekday,
    middleware_relative_minutes_ago: runtimeContext.relative_minutes_ago,
    middleware_approximate_incident_date: runtimeContext.approximate_incident_date,
    middleware_approximate_incident_time: runtimeContext.approximate_incident_time,
    middleware_reservation_requested_time: runtimeContext.reservation_requested_time,
    middleware_reservation_requested_time_display: runtimeContext.reservation_requested_time_display,
    middleware_reservation_alternative_time_1: runtimeContext.reservation_alternative_time_1,
    middleware_reservation_alternative_time_1_display: runtimeContext.reservation_alternative_time_1_display,
    middleware_reservation_alternative_time_2: runtimeContext.reservation_alternative_time_2,
    middleware_reservation_alternative_time_2_display: runtimeContext.reservation_alternative_time_2_display,
    user_language: responseLanguage,
    response_language: responseLanguage,
    language_lock: !!responseLanguage,
    language_switch_allowed: false,
    language_switch_requested: !!explicitLanguageSwitch,
    explicit_language_switch_target: explicitLanguageSwitch || null,
    guest_name: guestProfile.guest_name || null,
    guest_contact_phone: guestProfile.contact_phone || null,
    guest_contact_email: guestProfile.contact_email || null,
    middleware_reservation_resolved_date: reservationContext.resolved_date || null,
    middleware_reservation_resolved_weekday: reservationContext.resolved_weekday || null,
    middleware_reservation_date_resolution_status: reservationContext.resolution_status || null,
    middleware_reservation_date_conflict_relative_date: reservationContext.conflict_relative_date || null,
    middleware_reservation_date_conflict_absolute_date: reservationContext.conflict_absolute_date || null
  };
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
  return `Goodbye — I’ll be here if you need anything else. ✨
Hasta luego — aquí estaré si necesitas algo más. ✨`;
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
    return "I’ll continue in English, as selected. Please tell me the next incident detail so I can continue the report.";
  }
  if (activeType === "reservation") {
    return "I’ll continue in English, as selected. Please tell me the next reservation detail so I can continue your request.";
  }
  return "I’ll continue in English, as selected. Please continue with your request.";
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
      : "I’m sorry. This sounds urgent. Please tell me your exact location and confirm whether you are safe right now. I can continue the report for Security.";
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
    "wrong charge",
    "robbed",
    "stole",
    "stolen",
    "theft",
    "theft report",
    "wallet",
    "cartera",
    "robo",
    "robbery",
    "asalto",
    "asaltaron",
    "me robaron",
    "security",
    "seguridad",
    "ambulance",
    "ambulancia",
    "police",
    "policia",
    "lost wallet",
    "missing wallet"
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

  if (currentRequestType === "complaint" && containsAny(t, securityLocationFollowupKeywords)) {
    return "complaint";
  }

  if (containsAny(t, complaintKeywords) || containsAny(t, theftSignals)) {
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
      : "I didn’t quite catch that, but I’d be happy to help with casino games. Please type the game name again, for example: roulette, poker, or blackjack.";
  }

  return spanishSignals
    ? "Lo siento, no capté bien tu mensaje. Puedo ayudarte con juegos, reservaciones, información general o quejas. ¿Qué te gustaría consultar?"
    : "Sorry, I didn’t quite catch that. I can help with games, reservations, general information, or complaints. What would you like to explore?";
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
    return res.status(200).send(snapshot.contents);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "export_failed"
    });
  }
});

// ---- INBOUND MESSAGE HANDLER ----
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // acknowledge Meta immediately

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];
    const statusEvent = changes?.value?.statuses?.[0];

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

    if (!message || message.type !== "text") return;

    const userID = message.from;
    const userText = message.text.body;

    const session = getOrCreateSession(userID);

    const guestProfileUpdate = extractGuestProfileUpdate(userText, session);
    if (Object.keys(guestProfileUpdate).length > 0) {
      const mergedGuestProfile = mergeGuestProfile(session.guest_profile, guestProfileUpdate);
      updateSession(userID, { guest_profile: mergedGuestProfile });
      session.guest_profile = mergedGuestProfile;

      console.log(
        `[GUEST PROFILE UPDATED] user=${userID} guest_name=${mergedGuestProfile.guest_name || "—"} contact_email=${mergedGuestProfile.contact_email || "—"}`
      );
    }

    console.log(`[INBOUND] user=${userID} session_id=${session.session_id} text="${userText}"`);
    console.log(`[SESSION BEFORE]`, getSessionSummary(session));

    const explicitLanguageSwitchCommand = detectExplicitLanguageSwitchRequest(userText, session.current_language);
    const languageCommand = detectLanguageCommand(userText) || explicitLanguageSwitchCommand;
    const detectedInputLanguage = detectLikelyTextLanguage(userText);
    const restartCommand = detectRestartCommand(userText);
    const menuCommand = detectMenuCommand(userText);
    const exitCommand = detectExitCommand(userText);
    const greetingReentry = isGreetingReentry(userText);
    const detectedIntent = detectIntent(userText, session.active_request?.type || null);

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
        last_bot_reply: prompt
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

    // ---- REQUEST CONTROL ----
    let requestControlEvent = null;

    if (restartCommand) {
      updateSession(userID, {
        active_request: null,
        current_language: null,
        awaiting_language: true,
        side_chat_count: 0,
        guest_profile: createGuestProfile(userID),
        reservation_context: createReservationContext(),
        last_bot_reply: null,
        state: "idle"
      });

      console.log(`[REQUEST RESET] user=${userID} reason=restart_command`);
      requestControlEvent = { request_action: "reset", reason: "restart_command" };
    } else if (menuCommand) {
      updateSession(userID, {
        active_request: null,
        side_chat_count: 0,
        reservation_context: createReservationContext()
      });

      console.log(`[REQUEST RESET] user=${userID} reason=menu_command`);
      requestControlEvent = { request_action: "reset", reason: "menu_command" };
    } else if (exitCommand) {
      updateSession(userID, {
        active_request: null,
        current_language: null,
        awaiting_language: true,
        side_chat_count: 0,
        reservation_context: createReservationContext(),
        last_bot_reply: null,
        state: "idle"
      });

      console.log(`[REQUEST RESET] user=${userID} reason=exit_command`);
      requestControlEvent = { request_action: "reset", reason: "exit_command" };
    } else {
      const currentSession = sessions[userID];

      if (!currentSession.active_request) {
        if (detectedIntent) {
          const newRequest = {
            type: detectedIntent,
            status: initialStatusForType(detectedIntent)
          };

          updateSession(userID, { active_request: newRequest, awaiting_language: false, reservation_context: newRequest.type === "reservation" ? (sessions[userID]?.reservation_context || createReservationContext()) : createReservationContext() });

          console.log(
            `[REQUEST DETECTED] user=${userID} type=${newRequest.type} status=${newRequest.status}`
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

    const currentSessionAfterControl = sessions[userID];
    const shouldEvaluateReservationDate =
      currentSessionAfterControl?.active_request?.type === "reservation" || detectedIntent === "reservation";
    const reservationDateContextFromText = shouldEvaluateReservationDate
      ? resolveReservationDateContext(userText)
      : createReservationContext();

    if (shouldEvaluateReservationDate && reservationDateContextFromText.resolution_status) {
      const mergedReservationContext = mergeReservationContext(
        currentSessionAfterControl?.reservation_context || createReservationContext(),
        reservationDateContextFromText
      );

      updateSession(userID, { reservation_context: mergedReservationContext });
      currentSessionAfterControl.reservation_context = mergedReservationContext;

      console.log(
        `[RESERVATION DATE CONTEXT] user=${userID} status=${mergedReservationContext.resolution_status} resolved_date=${mergedReservationContext.resolved_date || "—"}`
      );
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

    const lockedResponseLanguage = sessions[userID]?.current_language || effectiveCurrentLanguage || null;
    const shouldBypassLanguageLock =
      !!languageCommand ||
      effectiveAwaitingLanguage ||
      isLanguageSelectionInput(userText, effectiveCurrentLanguage) ||
      isPlainNumericChoice(userText);

    const activeReservationContext = sessions[userID]?.reservation_context || createReservationContext();
    const shouldApplyReservationDateInstruction =
      !shouldBypassLanguageLock &&
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

    const replies = filteredReplies.map((reply) => {
      const mismatch = detectReplyLanguageMismatch(reply, lockedResponseLanguage);
      return mismatch.mismatch
        ? buildLockedLanguageFallbackReply(sessions[userID], lockedResponseLanguage)
        : reply;
    });

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

      console.log(
        `[OUTBOUND FALLBACK] user=${userID} session_id=${sessions[userID].session_id} reply="${fallbackReply}"`
      );

      return;
    }

    const combinedReplyForMemory = replies.join("\n\n");

    updateSession(
      userID,
      exitCommand
        ? { state: "idle", active_request: null, last_bot_reply: combinedReplyForMemory }
        : { state: "active", last_bot_reply: combinedReplyForMemory }
    );

    console.log(`[SESSION AFTER]`, getSessionSummary(sessions[userID]));

    // ---- SEND REPLY BACK VIA WHATSAPP ----
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
