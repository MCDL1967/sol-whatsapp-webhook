/*
LOGS RULES
Role: governed closure-state helpers for SOL LOGS schema
Scope: pure helpers only; no transport or workbook I/O
*/

function normalizeText(value) {
  return (value ?? "").toString().trim();
}

function normalizeEnum(value, allowedValues, fallbackValue) {
  const normalized = normalizeText(value);
  return allowedValues.includes(normalized) ? normalized : fallbackValue;
}

const INTERNAL_RESOLUTION_VALUES = [
  "open",
  "in_progress",
  "resolved_pending_customer",
  "returned_for_rework"
];

const CUSTOMER_CONFIRMATION_VALUES = [
  "not_sent",
  "awaiting_response",
  "confirmed_closed",
  "requested_reopen",
  "no_response"
];

const CLOSURE_STATUS_VALUES = [
  "open",
  "pending_customer_confirmation",
  "closed",
  "reopened"
];

function applyGovernanceDefaults(record = {}) {
  const next = { ...record };

  next.internal_resolution_status = normalizeEnum(
    next.internal_resolution_status,
    INTERNAL_RESOLUTION_VALUES,
    "open"
  );

  next.customer_confirmation_status = normalizeEnum(
    next.customer_confirmation_status,
    CUSTOMER_CONFIRMATION_VALUES,
    "not_sent"
  );

  // Customer-confirmed closure is the only path to final closure.
  if (next.customer_confirmation_status === "confirmed_closed") {
    next.closure_status = "closed";
  } else if (next.customer_confirmation_status === "requested_reopen") {
    next.closure_status = "reopened";
  } else if (next.internal_resolution_status === "resolved_pending_customer") {
    next.closure_status = "pending_customer_confirmation";
  } else {
    next.closure_status = normalizeEnum(next.closure_status, CLOSURE_STATUS_VALUES, "open");
    if (next.closure_status === "closed" && next.customer_confirmation_status !== "confirmed_closed") {
      next.closure_status = "open";
    }
  }

  next.issue_reopened = next.customer_confirmation_status === "requested_reopen" ? "YES" : "NO";

  if (next.closure_status === "closed") {
    next.final_closure_timestamp = normalizeText(next.final_closure_timestamp) || new Date().toISOString();
  } else {
    next.final_closure_timestamp = "";
  }

  if (!normalizeText(next.survey_sent_timestamp) && next.customer_confirmation_status !== "not_sent") {
    next.survey_sent_timestamp = next.event_timestamp || new Date().toISOString();
  }

  if (!normalizeText(next.survey_response_timestamp)) {
    if (["confirmed_closed", "requested_reopen", "no_response"].includes(next.customer_confirmation_status)) {
      next.survey_response_timestamp = next.customer_confirmation_status === "no_response"
        ? ""
        : (next.event_timestamp || new Date().toISOString());
    }
  }

  return next;
}

module.exports = {
  INTERNAL_RESOLUTION_VALUES,
  CUSTOMER_CONFIRMATION_VALUES,
  CLOSURE_STATUS_VALUES,
  applyGovernanceDefaults
};
