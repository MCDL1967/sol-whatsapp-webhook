/*
SUPABASE BRIDGE
Role: minimal reservation-write path into Supabase (walking-skeleton scope)
Scope: tenants / properties / guest_threads / cases / reservation_details only.
Status: single hardcoded tenant/property (sol_demo/demo via env vars) — real
        multi-tenant resolution is future work, see
        docs/db_planning/Tenant_Management_Future_Considerations_v0.1.md
Known limitation: venue_or_department is not yet resolvable to a venue_id
        (venues table does not exist yet) — stored as a labeled note in
        special_requests until the venues table and matching are built.
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

async function writeReservationCase(payload = {}) {
  if (!supabase) {
    console.error(
      "[SUPABASE] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — skipping reservation write"
    );
    return null;
  }

  const { tenantId, propertyId } = await getDemoTenantAndProperty();

  const { data: guestThread, error: guestThreadError } = await supabase
    .from("guest_threads")
    .upsert(
      {
        tenant_id: tenantId,
        property_id: propertyId,
        external_user_id: payload.user_id,
        channel: "whatsapp"
      },
      { onConflict: "property_id,channel,external_user_id" }
    )
    .select("id")
    .single();

  if (guestThreadError || !guestThread) {
    throw new Error(`guest_thread upsert failed: ${guestThreadError?.message}`);
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .insert({
      tenant_id: tenantId,
      property_id: propertyId,
      guest_thread_id: guestThread.id,
      case_type: "reservation",
      dept_target: "FNB",
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

  const specialRequests = payload.venue_or_department
    ? `Venue (unresolved, no venues table yet): ${payload.venue_or_department}`
    : null;

  const { error: detailsError } = await supabase.from("reservation_details").insert({
    case_id: caseRow.id,
    requested_date: payload.service_date || null,
    requested_time: payload.service_time || null,
    party_size: payload.party_size || null,
    special_requests: specialRequests
  });

  if (detailsError) {
    throw new Error(`reservation_details insert failed: ${detailsError.message}`);
  }

  return caseRow.id;
}

module.exports = { writeReservationCase };
