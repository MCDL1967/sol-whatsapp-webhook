/*
LOGS SERVICE
Role: webhook-facing task builder for SOL LOGS scaffolding
Scope: safe orchestration only; workbook execution is queued elsewhere

Change notes:
  2026-04-17 — added captureRequestClosure: calls mapper.buildReservationClosureRecord
               for full proven shape, applies rules.applyGovernanceDefaults, then
               calls workbook.upsertOperationalRecord; closure origin marked in
               meta only via hook: "captureRequestClosure"; no new task_type
*/

const mapper = require("./logs_mapper");
const rules = require("./logs_rules");
const workbook = require("./logs_workbook");

async function captureInboundMessage(payload = {}) {
  const record = mapper.buildInboundOperationalRecord(payload);
  const governed = rules.applyGovernanceDefaults(record);

  return workbook.upsertOperationalRecord(governed, {
    hook: "captureInboundMessage",
    user_id: payload.user_id || "",
    session_id: payload.session_summary?.session_id || ""
  });
}

async function captureRequestState(payload = {}) {
  return workbook.appendMiddlewareEvent(
    mapper.buildMiddlewareEvent({
      ...payload,
      event_type: "request_state_change",
      summary: payload.summary || payload.request_action || "request_state_change"
    }),
    {
      hook: "captureRequestState",
      user_id: payload.user_id || "",
      session_id: payload.session_summary?.session_id || ""
    }
  );
}

async function captureLanguageGateBlock(payload = {}) {
  return workbook.appendMiddlewareEvent(
    mapper.buildMiddlewareEvent({
      ...payload,
      event_type: "language_gate_block",
      summary: payload.summary || "language_gate_block"
    }),
    {
      hook: "captureLanguageGateBlock",
      user_id: payload.user_id || "",
      session_id: payload.session_summary?.session_id || ""
    }
  );
}

async function captureRequestReset(payload = {}) {
  return workbook.appendMiddlewareEvent(
    mapper.buildMiddlewareEvent({
      ...payload,
      event_type: "request_reset",
      summary: payload.summary || payload.reason || "request_reset"
    }),
    {
      hook: "captureRequestReset",
      user_id: payload.user_id || "",
      session_id: payload.session_summary?.session_id || ""
    }
  );
}

async function captureVoiceflowTurn(payload = {}) {
  return workbook.appendMiddlewareEvent(
    mapper.buildMiddlewareEvent({
      ...payload,
      event_type: "voiceflow_turn",
      summary: payload.summary || `voiceflow replies=${payload.reply_count || 0}`
    }),
    {
      hook: "captureVoiceflowTurn",
      user_id: payload.user_id || "",
      session_id: payload.session_summary?.session_id || ""
    }
  );
}

async function captureOutboundMessage(payload = {}) {
  const update = mapper.buildOutboundStatusUpdate(payload);
  return workbook.updateBroadcastStatus(update, {
    hook: "captureOutboundMessage",
    user_id: payload.user_id || "",
    session_id: payload.session_summary?.session_id || ""
  });
}

async function captureStatusEvent(payload = {}) {
  const update = mapper.buildMetaStatusUpdate(payload);
  return workbook.updateClientMessageStatus(update, {
    hook: "captureStatusEvent",
    user_id: payload.user_id || "",
    session_id: payload.session_summary?.session_id || ""
  });
}

async function captureMiddlewareError(payload = {}) {
  return workbook.appendMiddlewareEvent(
    mapper.buildMiddlewareEvent({
      ...payload,
      event_type: "middleware_error",
      summary: payload.summary || payload.error_message || "middleware_error"
    }),
    {
      hook: "captureMiddlewareError",
      user_id: payload.user_id || "",
      session_id: payload.session_summary?.session_id || ""
    }
  );
}

async function captureRequestClosure(payload = {}) {
  const record = mapper.buildReservationClosureRecord(payload);
  const governed = rules.applyGovernanceDefaults(record);

  return workbook.upsertOperationalRecord(governed, {
    hook: "captureRequestClosure",
    user_id: payload.user_id || "",
    session_id: payload.session_summary?.session_id || ""
  });
}

module.exports = {
  captureInboundMessage,
  captureRequestState,
  captureLanguageGateBlock,
  captureRequestReset,
  captureVoiceflowTurn,
  captureOutboundMessage,
  captureStatusEvent,
  captureMiddlewareError,
  captureRequestClosure
};
