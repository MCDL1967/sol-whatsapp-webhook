/*
LOGS MAPPER
Role: convert webhook/session/runtime events into SOL LOGS-shaped payloads
Scope: pure mapping helpers only; no I/O

Change notes:
  2026-04-17 — added buildReservationClosureRecord: builds a full operational
               record shape for a confirmed reservation exit; uses same
               deriveCategoryAndSection/deriveUrgency internals as
               buildInboundOperationalRecord; closure-origin fields substituted
               where known; unavailable fields (venue_or_department, party_size)
               are blank as approved for this delta
*/

function normalizeText(value = "") {
  return value
    .toString()
    .replace(/\s+/g, " ")
    .trim();
}

function lowerText(value = "") {
  return normalizeText(value).toLowerCase();
}

function summarizeText(value = "", maxLength = 180) {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function deriveUrgency(userText = "") {
  const t = lowerText(userText);

  if (
    ["robbed", "stolen", "theft", "robbery", "security", "ambulance", "police", "robo", "asalto", "ambulancia", "policia"]
      .some((term) => t.includes(term))
  ) {
    return "critical";
  }

  if (
    ["complaint", "queja", "billing", "charge", "wrong charge", "problem", "problema"]
      .some((term) => t.includes(term))
  ) {
    return "high";
  }

  if (
    ["reservation", "reservacion", "book", "table", "restaurant"]
      .some((term) => t.includes(term))
  ) {
    return "medium";
  }

  return "low";
}

function deriveSeverity(userText = "") {
  const t = lowerText(userText);

  if (["ambulance", "police", "robbed", "robbery", "stolen", "asalto", "me robaron"].some((term) => t.includes(term))) {
    return "critical";
  }
  if (["security", "seguridad", "theft", "robo", "wallet", "cartera"].some((term) => t.includes(term))) {
    return "high";
  }
  if (["problem", "problema", "charge", "billing"].some((term) => t.includes(term))) {
    return "medium";
  }
  return "";
}

function deriveComplaintCategory(userText = "") {
  const t = lowerText(userText);
  if (["billing", "charge", "cargo", "bill"].some((term) => t.includes(term))) return "billing";
  if (["staff", "service", "mal servicio"].some((term) => t.includes(term))) return "service";
  if (["room", "facility", "bathroom", "elevator"].some((term) => t.includes(term))) return "facility";
  return "";
}

function deriveRequestCategory(userText = "", category = "") {
  const t = lowerText(userText);
  if (category === "Player") {
    if (["comp", "reward", "points", "loyalty"].some((term) => t.includes(term))) return "comp_request";
    if (["account", "tier", "card"].some((term) => t.includes(term))) return "account_inquiry";
    return "other";
  }
  if (category === "Admin") {
    if (["vip"].some((term) => t.includes(term))) return "operational";
    return "other";
  }
  return "";
}

function deriveCategoryAndSection({ detectedIntent = null, activeRequestType = null, userText = "" } = {}) {
  const t = lowerText(userText);
  const type = detectedIntent || activeRequestType || null;

  if (type === "reservation") {
    return {
      category: "F&B",
      section_team: "Food & Beverage",
      request_type: "reservation",
      routing_reason: "auto"
    };
  }

  if (type === "complaint") {
    const securitySignal = [
      "security",
      "seguridad",
      "robbed",
      "stole",
      "stolen",
      "theft",
      "robo",
      "robbery",
      "asalto",
      "ambulance",
      "police",
      "wallet",
      "cartera"
    ].some((term) => t.includes(term));

    if (securitySignal) {
      return {
        category: "Security",
        section_team: "Security",
        request_type: "security_incident",
        routing_reason: "manual_escalation"
      };
    }

    return {
      category: "Complaint",
      section_team: "Guest Services",
      request_type: "guest_complaint",
      routing_reason: "auto"
    };
  }

  if (type === "info") {
    return {
      category: "Triage",
      section_team: "Guest Services",
      request_type: "information_request",
      routing_reason: "auto"
    };
  }

  return {
    category: "Triage",
    section_team: "Guest Services",
    request_type: "unclassified",
    routing_reason: "manual_escalation"
  };
}

function buildInboundOperationalRecord(payload = {}) {
  const {
    user_id,
    user_text = "",
    message_id = "",
    event_timestamp = new Date().toISOString(),
    session_summary = {},
    detected_intent = null,
    active_request = null
  } = payload;

  const routing = deriveCategoryAndSection({
    detectedIntent: detected_intent,
    activeRequestType: active_request?.type || null,
    userText: user_text
  });

  const urgency = deriveUrgency(user_text);
  const severity = routing.category === "Security" ? deriveSeverity(user_text) || urgency : "";
  const complaint_category = routing.category === "Complaint" ? deriveComplaintCategory(user_text) : "";
  const request_category = ["Player", "Admin"].includes(routing.category)
    ? deriveRequestCategory(user_text, routing.category)
    : "";

  return {
    event_timestamp,
    source_event: "inbound_message",
    source_message_id: message_id || "",
    session_id: session_summary?.session_id || "",
    guest_name: "",
    contact_phone: user_id || "",
    contact_email: "",
    preferred_contact_method: "whatsapp",
    timestamp: event_timestamp,
    category: routing.category,
    section_team: routing.section_team,
    request_type: routing.request_type,
    workflow_stage: "guest_message_received",
    status: "open",
    urgency,
    location_section: "",
    venue_or_department: routing.section_team,
    service_date: "",
    service_time: "",
    party_size: "",
    incident_type: routing.category === "Security" ? "security_incident" : "",
    summary: summarizeText(user_text),
    special_requests_or_notes: normalizeText(user_text),
    team_log_file: `${routing.section_team.replace(/\s+/g, "_").toLowerCase()}_log.xlsx`,
    broadcast_channel: "whatsapp",
    broadcast_status: "received",
    client_message_status: "received",
    follow_up_required: ["F&B", "Complaint", "Security", "Triage"].includes(routing.category) ? "YES" : "NO",
    follow_up_type: routing.category === "F&B" ? "reservation_follow_up" : "guest_services_follow_up",
    assigned_manager_or_queue: routing.section_team,
    internal_resolution_status: "open",
    customer_confirmation_status: "not_sent",
    closure_status: "open",
    resolution_summary: "",
    resolved_by: "",
    resolution_timestamp: "",
    survey_sent_timestamp: "",
    survey_response_timestamp: "",
    customer_feedback_score: "",
    final_closure_timestamp: "",
    issue_reopened: "NO",
    routing_reason: routing.routing_reason,
    severity,
    complaint_category,
    request_category
  };
}

function buildReservationClosureRecord(payload = {}) {
  const event_timestamp = payload.event_timestamp || new Date().toISOString();
  const session_summary = payload.session_summary || {};

  const routing = deriveCategoryAndSection({ activeRequestType: "reservation" });
  const urgency = deriveUrgency("reservation");

  return {
    event_timestamp,
    source_event: "reservation_closure",
    source_message_id: "",
    session_id: session_summary?.session_id || "",
    guest_name: payload.guest_name || "",
    contact_phone: payload.contact_phone || payload.user_id || "",
    contact_email: payload.contact_email || "",
    preferred_contact_method: "whatsapp",
    timestamp: event_timestamp,
    category: routing.category,
    section_team: routing.section_team,
    request_type: routing.request_type,
    workflow_stage: "guest_message_received",
    status: "open",
    urgency,
    location_section: "",
    venue_or_department: payload.venue_or_department || "",
    service_date: payload.service_date || "",
    service_time: payload.service_time || "",
    party_size: payload.party_size || "",
    incident_type: "",
    summary: summarizeText(payload.summary || ""),
    special_requests_or_notes: "",
    team_log_file: `${routing.section_team.replace(/\s+/g, "_").toLowerCase()}_log.xlsx`,
    broadcast_channel: "whatsapp",
    broadcast_status: "received",
    client_message_status: "received",
    follow_up_required: "YES",
    follow_up_type: "reservation_follow_up",
    assigned_manager_or_queue: routing.section_team,
    internal_resolution_status: "open",
    customer_confirmation_status: "not_sent",
    closure_status: "open",
    resolution_summary: "",
    resolved_by: "",
    resolution_timestamp: "",
    survey_sent_timestamp: "",
    survey_response_timestamp: "",
    customer_feedback_score: "",
    final_closure_timestamp: "",
    issue_reopened: "NO",
    routing_reason: routing.routing_reason,
    severity: "",
    complaint_category: "",
    request_category: ""
  };
}

function buildOutboundStatusUpdate(payload = {}) {
  return {
    source_event: "outbound_message",
    event_timestamp: payload.event_timestamp || new Date().toISOString(),
    user_id: payload.user_id || "",
    session_id: payload.session_summary?.session_id || "",
    source_message_id: payload.source_message_id || "",
    whatsapp_message_id: payload.whatsapp_message_id || "",
    broadcast_channel: "whatsapp",
    broadcast_status: payload.broadcast_status || "sent_to_meta",
    client_message_status: payload.client_message_status || "sent",
    summary: summarizeText(payload.reply || "")
  };
}

function buildMetaStatusUpdate(payload = {}) {
  const raw_status = payload.raw_status || {};
  return {
    source_event: "meta_status",
    event_timestamp: payload.event_timestamp || new Date().toISOString(),
    user_id: payload.user_id || raw_status.recipient_id || "",
    session_id: payload.session_summary?.session_id || "",
    whatsapp_message_id: raw_status.id || "",
    broadcast_channel: "whatsapp",
    broadcast_status: raw_status.status || "",
    client_message_status: raw_status.status || "",
    summary: raw_status.status || "status_update"
  };
}

function buildMiddlewareEvent(payload = {}) {
  return {
    source_event: payload.event_type || "middleware_event",
    event_timestamp: payload.event_timestamp || new Date().toISOString(),
    user_id: payload.user_id || "",
    session_id: payload.session_summary?.session_id || "",
    summary: payload.summary || payload.user_text || payload.reply || payload.reason || payload.event_type || "middleware_event",
    raw: payload
  };
}

module.exports = {
  buildInboundOperationalRecord,
  buildReservationClosureRecord,
  buildOutboundStatusUpdate,
  buildMetaStatusUpdate,
  buildMiddlewareEvent
};
