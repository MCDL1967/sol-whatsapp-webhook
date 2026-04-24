/**
 * vf_bridge/vf_client.js
 * Version: v13.1.21
 * Track: MID — VF Bridge Phase 1
 *
 * Common Voiceflow HTTP client helpers.
 * Handles: auth headers, projectID header, safe userID encoding,
 * request wrapper, error normalization.
 *
 * SECURITY: No API key is hardcoded here.
 * Key is read from process.env.VF_DM_API_KEY || process.env.VF_API_KEY.
 * VF_API_KEY is the existing baseline env var; VF_DM_API_KEY takes precedence
 * if set separately. Either alone is sufficient. If neither is set, state reads
 * will log a configuration warning and skip gracefully.
 */

'use strict';

const https = require('https');

// ---------------------------------------------------------------------------
// CONFIG — read from environment only, never hardcoded
// ---------------------------------------------------------------------------

// VF_API_KEY is read lazily at call time (not cached at module load).
// This allows env vars set after require() to be picked up, and supports
// test environments where env is configured after module resolution.
const VF_PROJECT_ID   = '69ae4b7b7dcd7cd0bce3a0d5';         // locked project ID from bridge spec
const VF_RUNTIME_HOST = 'general-runtime.voiceflow.com';

// Warn once at module load if key is already known to be missing.
// A missing key at load time is not fatal — vfGet checks at call time.
if (!process.env.VF_DM_API_KEY && !process.env.VF_API_KEY) {
  console.warn('[VF-BRIDGE-P1] WARNING: neither VF_DM_API_KEY nor VF_API_KEY is set at module load — state reads will be skipped until configured');
}

/** Read the API key at call time — never cached.
 *  VF_DM_API_KEY takes precedence; falls back to VF_API_KEY (baseline var). */
function getApiKey() {
  return process.env.VF_DM_API_KEY || process.env.VF_API_KEY || null;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Safely URI-encode a userID for use in path segments.
 * VF docs require encoding; SOL userIDs include phone numbers with +.
 * @param {string} userId
 * @returns {string}
 */
function encodeUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('[vf_client] encodeUserId: userId must be a non-empty string');
  }
  return encodeURIComponent(userId);
}

/**
 * Build standard Voiceflow auth + project headers.
 * Reads API key lazily at call time.
 * @returns {object}
 */
function buildAuthHeaders() {
  return {
    'Authorization': getApiKey() || '',
    'projectID':     VF_PROJECT_ID,
    'accept':        'application/json',
    'content-type':  'application/json',
  };
}

/**
 * Perform a GET request against VF general-runtime.
 * Returns parsed JSON body on HTTP 200.
 * Rejects with a normalized error object on non-200 or network failure.
 * API key is read lazily at call time.
 *
 * @param {string} path  e.g. '/state/user/%2B50760001234'
 * @returns {Promise<object>}
 */
function vfGet(path) {
  return new Promise((resolve, reject) => {
    if (!getApiKey()) {
      return reject(new Error('neither VF_DM_API_KEY nor VF_API_KEY is configured — skipping state read'));
    }

    const options = {
      hostname: VF_RUNTIME_HOST,
      path:     path,
      method:   'GET',
      headers:  buildAuthHeaders(),
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(Object.assign(
            new Error(`VF state read returned HTTP ${res.statusCode}`),
            { statusCode: res.statusCode, body: raw }
          ));
        }
        try {
          resolve(JSON.parse(raw));
        } catch (parseErr) {
          reject(Object.assign(
            new Error('VF state read: failed to parse response JSON'),
            { cause: parseErr, body: raw }
          ));
        }
      });
    });

    req.on('error', (err) => {
      reject(Object.assign(
        new Error(`VF state read: network error — ${err.message}`),
        { cause: err }
      ));
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  encodeUserId,
  buildAuthHeaders,
  vfGet,
  getApiKey,
  VF_PROJECT_ID,
  VF_RUNTIME_HOST,
};
