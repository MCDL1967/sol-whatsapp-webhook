/*
LOGS WORKBOOK DISPATCHER
Role: queue workbook tasks for downstream execution
Scope: no direct XLSX mutation in this scaffold
*/

const fs = require("fs/promises");
const path = require("path");

const TASK_QUEUE_FILE = process.env.LOGS_TASK_QUEUE_FILE || "";

async function enqueueTask(taskType, payload = {}, meta = {}) {
  if (!TASK_QUEUE_FILE) {
    return {
      status: "skipped",
      reason: "LOGS_TASK_QUEUE_FILE not set",
      task_type: taskType
    };
  }

  const queuePath = path.resolve(TASK_QUEUE_FILE);
  await fs.mkdir(path.dirname(queuePath), { recursive: true });

  const row = {
    enqueued_at: new Date().toISOString(),
    task_type: taskType,
    payload,
    meta
  };

  await fs.appendFile(queuePath, `${JSON.stringify(row)}\n`, "utf8");

  return {
    status: "queued",
    task_type: taskType,
    queue_file: queuePath
  };
}

async function upsertOperationalRecord(record, meta = {}) {
  return enqueueTask("upsert_operational_record", record, meta);
}

async function updateBroadcastStatus(update, meta = {}) {
  return enqueueTask("update_broadcast_status", update, meta);
}

async function updateClientMessageStatus(update, meta = {}) {
  return enqueueTask("update_client_message_status", update, meta);
}

async function appendMiddlewareEvent(event, meta = {}) {
  return enqueueTask("append_middleware_event", event, meta);
}

module.exports = {
  upsertOperationalRecord,
  updateBroadcastStatus,
  updateClientMessageStatus,
  appendMiddlewareEvent
};
