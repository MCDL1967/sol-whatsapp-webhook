/*
SUPABASE BRIDGE
Role: minimal reservation-write path into Supabase (walking-skeleton scope)
Scope: tenants / properties / guest_threads / cases / reservation_details only.
Status: single hardcoded tenant/property (sol_demo/demo via env vars) — real
        multi-tenant resolution is future work, see
        docs/db_planning/old_planning_docs/Tenant_Management_Future_Considerations_v0.1.md
venue_id resolution: payload.venue_or_department is matched by exact string
        against venues.display_name (webhook.js's KNOWN_RESERVATION_VENUES
        registry already collapses guest text to one of a fixed set of
        canonical names before this point, so an exact match is sufficient —
        see docs/db_planning/old_planning_docs/whatsapp_db_logs_adaptation_v0.1.md). If no
        match is found (e.g. a venue not yet seeded), venue_id stays null —
        soft-fail, never blocks the reservation write.
Known limitation: no real guest "special requests" capture exists anywhere
        in the current conversation flow, so reservation_details.special_requests
        is always null today.
*/

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT_KEY = process.env.TENANT_KEY || "sol_demo";
const PROPERTY_KEY = process.env.PROPERTY_ID || "demo";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

async function getDemoTenantAndProperty() {
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id")
    .eq("tenant_key", TENANT_KEY)
    .single();

  if (tenantError || !tenant) {
    throw new Error(
      `tenant lookup failed for tenant_key=${TENANT_KEY}: ${tenantError?.message || "not found"}`
    );
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("property_key", PROPERTY_KEY)
    .single();

  if (propertyError || !property) {
    throw new Error(
      `property lookup failed for property_key=${PROPERTY_KEY}: ${propertyError?.message || "not found"}`
    );
  }

  return { tenantId: tenant.id, propertyId: property.id };
}

// Resolves both the venue row and its handoff team in one lookup — venues
// now carries handoff_team_id (FK -> teams.id, added alongside cases'
// existing assigned_team_id pattern; see
// docs/db_planning/DB_Construction_Decisions_v0.1.md). Soft-fails on any
// error, same as the venue-only lookup this replaces: never blocks the
// reservation write.
async function resolveVenue(propertyId, venueName) {
  const empty = { id: null, handoffTeamId: null, handoffTeamKey: null };
  if (!venueName) return empty;

  try {
    const { data: venue, error } = await supabase
      .from("venues")
      .select("id, handoff_team_id, teams(team_key)")
      .eq("property_id", propertyId)
      .eq("display_name", venueName)
      .maybeSingle();

    if (error) {
      console.error(`[SUPABASE VENUE LOOKUP ERROR] venue_name=${venueName}`, error.message);
      return empty;
    }

    return {
      id: venue?.id || null,
      handoffTeamId: venue?.handoff_team_id || null,
      handoffTeamKey: venue?.teams?.team_key || null
    };
  } catch (err) {
    console.error(`[SUPABASE VENUE LOOKUP ERROR] venue_name=${venueName}`, err?.message || err);
    return empty;
  }
}

async function upsertGuestThread(tenantId, propertyId, userId) {
  const { data: guestThread, error: guestThreadError } = await supabase
    .from("guest_threads")
    .upsert(
      {
        tenant_id: tenantId,
        property_id: propertyId,
        external_user_id: userId,
        channel: "whatsapp"
      },
      { onConflict: "property_id,channel,external_user_id" }
    )
    .select("id")
    .single();

  if (guestThreadError || !guestThread) {
    throw new Error(`guest_thread upsert failed: ${guestThreadError?.message}`);
  }

  return guestThread;
}

async function writeReservationCase(payload = {}) {
  if (!supabase) {
    console.error(
      "[SUPABASE] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — skipping reservation write"
    );
    return null;
  }

  const { tenantId, propertyId } = await getDemoTenantAndProperty();

  const guestThread = await upsertGuestThread(tenantId, propertyId, payload.user_id);

  const venue = await resolveVenue(propertyId, payload.venue_or_department);

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .insert({
      tenant_id: tenantId,
      property_id: propertyId,
      guest_thread_id: guestThread.id,
      case_type: "reservation",
      // Team routing is now arbitrary per-tenant (see
      // docs/db_planning/DB_Construction_Decisions_v0.1.md). Routes to the
      // venue's configured handoff team when one is set; if the venue
      // didn't resolve or has no handoff team configured, stays visibly
      // "unrouted" rather than guessing — matches the same
      // don't-fail-silently philosophy as the referential-integrity design.
      dept_target: venue.handoffTeamKey || "unrouted",
      assigned_team_id: venue.handoffTeamId,
      guest_name: payload.guest_name || null,
      guest_phone: payload.contact_phone || null,
      source_channel: "whatsapp",
      summary: payload.summary || "Reservation captured via WhatsApp"
    })
    .select("id")
    .single();

  if (caseError || !caseRow) {
    throw new Error(`case insert failed: ${caseError?.message}`);
  }

  const { error: detailsError } = await supabase.from("reservation_details").insert({
    case_id: caseRow.id,
    venue_id: venue.id,
    requested_date: payload.service_date || null,
    requested_time: payload.service_time || null,
    party_size: payload.party_size || null,
    special_requests: null
  });

  if (detailsError) {
    throw new Error(`reservation_details insert failed: ${detailsError.message}`);
  }

  return caseRow.id;
}

// Walking-skeleton write for complaint/incident cases — same soft-fail
// pattern as writeReservationCase. No accumulated conversational context
// exists for these yet (unlike reservation_context), so complaint_details/
// incident_details only get case_id today; category/severity/location stay
// null until that context-tracking is built. Ships unrouted
// (dept_target: "unrouted", assigned_team_id: null) — no per-case-type
// default-team mechanism exists yet, same as reservations before
// venues.handoff_team_id existed. See docs/db_planning/DB_Construction_Decisions_v0.1.md.
const CASE_DETAIL_TABLE_BY_TYPE = {
  complaint: "complaint_details",
  incident: "incident_details"
};

async function writeCaseFromActiveRequest(payload = {}) {
  if (!supabase) {
    console.error(
      "[SUPABASE] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — skipping case write"
    );
    return null;
  }

  const detailTable = CASE_DETAIL_TABLE_BY_TYPE[payload.case_type];
  if (!detailTable) {
    throw new Error(`writeCaseFromActiveRequest: unsupported case_type "${payload.case_type}"`);
  }

  const { tenantId, propertyId } = await getDemoTenantAndProperty();

  const guestThread = await upsertGuestThread(tenantId, propertyId, payload.user_id);

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .insert({
      tenant_id: tenantId,
      property_id: propertyId,
      guest_thread_id: guestThread.id,
      case_type: payload.case_type,
      dept_target: "unrouted",
      assigned_team_id: null,
      guest_name: payload.guest_name || null,
      guest_phone: payload.contact_phone || null,
      source_channel: "whatsapp",
      summary: payload.summary || "Reported via WhatsApp"
    })
    .select("id")
    .single();

  if (caseError || !caseRow) {
    throw new Error(`case insert failed: ${caseError?.message}`);
  }

  const { error: detailsError } = await supabase.from(detailTable).insert({
    case_id: caseRow.id
  });

  if (detailsError) {
    throw new Error(`${detailTable} insert failed: ${detailsError.message}`);
  }

  return caseRow.id;
}

module.exports = { writeReservationCase, writeCaseFromActiveRequest };
