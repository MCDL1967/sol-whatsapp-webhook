/*
File: property_loader.js
Role: Load the compiled runtime_packages.package_json row for a property from
      Supabase, replacing the old property_packages/*.json static-file
      loader. Same exported function name/shape (loadPropertyPackage) so
      callers only need to add `await` -- see
      docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 3.

Caching: in-memory, per-process, keyed by property. Refetches the latest
runtime_packages row (by published_at) at most once per CACHE_TTL_MS,
so a guest turn never waits on a live Supabase round trip on every message,
while a Publish in tenant_tool still reaches guests within one TTL window
without needing a restart.

Soft-fail: if Supabase is unreachable and there is no cache yet, returns the
same empty-safe shape the old safeRequireJson fallback did -- classifyFastPath
then simply never matches, and webhook.js already falls through to the
normal Voiceflow path in that case. Never throws.
*/

'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_KEY = process.env.TENANT_KEY || 'sol_demo';

const CACHE_TTL_MS = 60 * 1000;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const EMPTY_PACKAGE = {
  menuBranches: {},
  responseTemplates: {},
  venues: [],
  teams: []
};

const cacheByProperty = new Map();

async function resolvePropertyId(propertyKey) {
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id')
    .eq('tenant_key', TENANT_KEY)
    .single();

  if (tenantError || !tenant) {
    throw new Error(`tenant lookup failed for tenant_key=${TENANT_KEY}: ${tenantError?.message || 'not found'}`);
  }

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('property_key', propertyKey)
    .single();

  if (propertyError || !property) {
    throw new Error(`property lookup failed for property_key=${propertyKey}: ${propertyError?.message || 'not found'}`);
  }

  return property.id;
}

function flattenResponseTemplates(templatesByLanguage = {}) {
  const flat = {};
  for (const [language, templates] of Object.entries(templatesByLanguage)) {
    for (const [templateKey, template] of Object.entries(templates)) {
      flat[`${templateKey}_${language}`] = template.body;
    }
  }
  return flat;
}

async function fetchLatestPackage(propertyKey) {
  const propertyId = await resolvePropertyId(propertyKey);

  const { data: rows, error } = await supabase
    .from('runtime_packages')
    .select('runtime_package_version, package_json, published_at')
    .eq('property_id', propertyId)
    .order('published_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`runtime_packages fetch failed: ${error.message}`);
  }

  const row = rows?.[0];
  if (!row) {
    return { ...EMPTY_PACKAGE, propertyId, packageVersion: null };
  }

  const packageJson = row.package_json || {};

  return {
    propertyId,
    packageVersion: row.runtime_package_version,
    menuBranches: packageJson.menu_branches || {},
    responseTemplates: flattenResponseTemplates(packageJson.response_templates),
    venues: packageJson.venues || [],
    teams: packageJson.teams || []
  };
}

async function loadPropertyPackage(propertyKey = 'demo') {
  if (!supabase) {
    console.error('[RUNTIME PACKAGE LOADER] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — returning empty package');
    return { ...EMPTY_PACKAGE, propertyId: propertyKey, packageVersion: null };
  }

  const cached = cacheByProperty.get(propertyKey);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const data = await fetchLatestPackage(propertyKey);
    cacheByProperty.set(propertyKey, { data, fetchedAt: now });
    return data;
  } catch (err) {
    console.error(`[RUNTIME PACKAGE LOADER] failed property=${propertyKey} error=${err?.message || err}`);
    if (cached) return cached.data;
    return { ...EMPTY_PACKAGE, propertyId: propertyKey, packageVersion: null };
  }
}

module.exports = { loadPropertyPackage };
