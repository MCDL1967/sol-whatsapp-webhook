/**
 * vf_bridge/reservation_candidate_reader.js
 * Version: v13.1.21
 * Track: MID — VF Bridge Phase 1
 *
 * Extracts reservation_candidate from VF state variables.
 * Reports raw value, typeof, parse result (if string), and non-null field inventory.
 *
 * PHASE 1 SCOPE — READ AND LOG ONLY:
 *   - NO merge into governed middleware state
 *   - NO authority decisions
 *   - NO activation changes from candidate
 *   - NO validation of field values
 *
 * All logging uses [VF-BRIDGE-P1] prefix per spec.
 */

'use strict';

// All spec-defined fields for the reservation_candidate shape.
// Used for non-null key inventory only — not for validation.
const CANDIDATE_FIELDS = [
  'intent',
  'venue_name',
  'service_date',
  'service_time',
  'party_size',
  'guest_name',
  'contact_phone',
  'contact_email',
  'notes',
  'status',
];

// ---------------------------------------------------------------------------
// MAIN READER
// ---------------------------------------------------------------------------

/**
 * Extract and log reservation_candidate from a VF state object.
 * Called only when readVfState returned ok=true.
 *
 * Returns a diagnostic result object (for test/observability only):
 * {
 *   present:        boolean,
 *   rawType:        string,       // typeof result
 *   parseResult:    'success' | 'fail' | 'not_needed' | 'not_present',
 *   nonNullFields:  string[],     // only populated when object is available
 *   candidate:      object|null,  // parsed/raw object if available, else null
 * }
 *
 * @param {object} vfState  — full state body from readVfState
 * @returns {object}
 */
function readReservationCandidate(vfState) {
  const vars = (vfState && vfState.variables) ? vfState.variables : {};
  const present = Object.prototype.hasOwnProperty.call(vars, 'reservation_candidate');

  // --- ABSENT ---
  if (!present) {
    // readVfState already logged present=false; nothing more to do here
    return {
      present:       false,
      rawType:       'undefined',
      parseResult:   'not_present',
      nonNullFields: [],
      candidate:     null,
    };
  }

  const raw     = vars.reservation_candidate;
  const rawType = typeof raw;

  console.log(`[VF-BRIDGE-P1] reservation_candidate typeof=${rawType}`);

  // Truncate raw log to 500 chars to avoid log flooding on unexpected large values
  const rawLog = String(
    rawType === 'object' ? JSON.stringify(raw) : raw
  ).slice(0, 500);
  console.log(`[VF-BRIDGE-P1] reservation_candidate raw=${rawLog}`);

  // --- NULL ---
  if (raw === null) {
    console.log(`[VF-BRIDGE-P1] parse result=not_needed (value is null)`);
    return {
      present:       true,
      rawType:       'null',       // typeof null === 'object' in JS; clarify
      parseResult:   'not_needed',
      nonNullFields: [],
      candidate:     null,
    };
  }

  // --- OBJECT (already parsed by VF engine) ---
  if (rawType === 'object') {
    console.log(`[VF-BRIDGE-P1] parse result=not_needed`);
    const nonNullFields = inventoryNonNullFields(raw);
    console.log(`[VF-BRIDGE-P1] non_null_fields=${nonNullFields.length > 0 ? nonNullFields.join(',') : '(none)'}`);
    return {
      present:       true,
      rawType,
      parseResult:   'not_needed',
      nonNullFields,
      candidate:     raw,
    };
  }

  // --- STRING (requires JSON.parse) ---
  if (rawType === 'string') {
    let parsed = null;
    let parseResult;

    try {
      parsed      = JSON.parse(raw);
      parseResult = 'success';
      console.log(`[VF-BRIDGE-P1] parse result=success`);
    } catch (_) {
      parseResult = 'fail';
      console.error(`[VF-BRIDGE-P1] parse result=fail raw="${rawLog}"`);
    }

    const nonNullFields = parsed && typeof parsed === 'object'
      ? inventoryNonNullFields(parsed)
      : [];

    if (parseResult === 'success') {
      console.log(`[VF-BRIDGE-P1] non_null_fields=${nonNullFields.length > 0 ? nonNullFields.join(',') : '(none)'}`);
    }

    return {
      present:       true,
      rawType,
      parseResult,
      nonNullFields,
      candidate:     parsed,
    };
  }

  // --- UNEXPECTED TYPE (number, boolean, etc.) ---
  console.warn(`[VF-BRIDGE-P1] reservation_candidate unexpected typeof=${rawType} — logged only`);
  console.log(`[VF-BRIDGE-P1] parse result=not_needed`);
  console.log(`[VF-BRIDGE-P1] non_null_fields=(none)`);
  return {
    present:       true,
    rawType,
    parseResult:   'not_needed',
    nonNullFields: [],
    candidate:     null,
  };
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Return list of spec-defined fields that are non-null in candidate.
 * Also captures any unexpected extra keys (forward-compat logging).
 * @param {object} obj
 * @returns {string[]}
 */
function inventoryNonNullFields(obj) {
  if (!obj || typeof obj !== 'object') return [];

  const nonNull = [];

  // Check spec-defined fields first
  for (const field of CANDIDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, field) && obj[field] !== null && obj[field] !== undefined) {
      nonNull.push(field);
    }
  }

  // Log any unexpected keys not in spec (diagnostic only — no action)
  const allKeys    = Object.keys(obj);
  const extraKeys  = allKeys.filter(k => !CANDIDATE_FIELDS.includes(k));
  if (extraKeys.length > 0) {
    console.warn(`[VF-BRIDGE-P1] reservation_candidate contains unexpected keys: ${extraKeys.join(',')}`);
  }

  return nonNull;
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = { readReservationCandidate };
