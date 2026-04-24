/**
 * vf_bridge/vf_state_reader.js
 * Version: v13.1.21
 * Track: MID — VF Bridge Phase 1
 *
 * Calls GET /state/user/{userID} after each interact turn.
 * Returns full VF state body.
 * Logs HTTP status and raw variable presence per Phase 1 spec.
 * All failures are non-fatal — errors are returned as structured result,
 * never thrown to the webhook orchestrator.
 */

'use strict';

const { encodeUserId, vfGet } = require('./vf_client');

// ---------------------------------------------------------------------------
// STATE READ
// ---------------------------------------------------------------------------

/**
 * Read full VF session state for a given userID.
 * Must be called AFTER the interact POST resolves — not in parallel.
 *
 * Returns a result object:
 *   { ok: true,  statusCode: 200, state: <full VF state object> }
 *   { ok: false, statusCode: <n>|null, error: <string> }
 *
 * @param {string} userId  — raw userID (will be encoded internally)
 * @returns {Promise<object>}
 */
async function readVfState(userId) {
  let encodedId;

  try {
    encodedId = encodeUserId(userId);
  } catch (encErr) {
    const msg = `userID encoding failed: ${encErr.message}`;
    console.error(`[VF-BRIDGE-P1] state read error — ${msg}`);
    return { ok: false, statusCode: null, error: msg };
  }

  const path = `/state/user/${encodedId}`;

  try {
    const state = await vfGet(path);
    console.log(`[VF-BRIDGE-P1] state read status=200`);

    // Log whether reservation_candidate key is present at all in variables map
    const vars = (state && state.variables) ? state.variables : {};
    const present = Object.prototype.hasOwnProperty.call(vars, 'reservation_candidate');
    console.log(`[VF-BRIDGE-P1] reservation_candidate present=${present}`);

    return { ok: true, statusCode: 200, state };

  } catch (err) {
    const statusCode = err.statusCode || null;
    const errMsg     = err.message || String(err);
    console.error(`[VF-BRIDGE-P1] state read status=${statusCode || 'network_error'} error="${errMsg}"`);
    return { ok: false, statusCode, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = { readVfState };
