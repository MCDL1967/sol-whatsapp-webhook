# SOL Tenant Management — Future Considerations v0.1

Status: flagged for later development
Date: 2026-07-07
Scope: raised during physical schema construction; explicitly deferred until after successful database creation and the WhatsApp → reservation end-to-end test

## Boundary

Nothing in this document is decided. These are open questions to revisit once the minimal reservation-write path is proven working end-to-end. Do not build against this document yet.

## Raised Questions

### Tenant onboarding
- Where do new tenants get created? No workflow or tool exists today.
- What determines how many users/sub-users a tenant can have?
- What roles exist for tenant users vs. their employees (sub-users)?

### System administration (SOL / the creators)
- A workflow is needed for system administrators (SOL) to: approve new tenants, set user-count limits, assign roles, review payment/subscription status, and set permissions.
- Where do SOL admins review whether a tenant has pending payment issues? No billing/subscription-status tracking exists in the schema today.

### Per-tenant security
- What security protocols exist per tenant today, and what's needed?
- Do tenant users (and their sub-users) have individual passwords/accounts to access dashboard sections (Tenant Property Configuration Tool, future LOGS dashboard)? Not yet — no real Supabase Auth users exist for any of these tools yet (see `Physical_Schema_v0.1.md` → Roles And Access, all three tool roles are still TBD).
- What data security exists now, and what will be needed in the future (encryption at rest/in transit, access auditing, compliance requirements)?

### Multi-tenant isolation testing
- Proposed test tenants once this phase starts: `DEMO` and `STARBAY`, to validate that tenants cannot access each other's data.
- **Immediate schema question this raises** (affects current DDL, tracked separately — see `DB_Construction_Decisions_v0.1.md`): does `tenant_id` need to exist directly on every table as a defense-in-depth security feature, or is scoping through `property_id` → `properties.tenant_id` sufficient? Currently inconsistent — operational tables (`guest_threads`, `messages`, `cases`, `operational_events`) already carry both `tenant_id` and `property_id`; configuration tables (`venues`, `menu_branches`, `teams`, `reservation_rules`, `response_templates`, `runtime_feature_flags`) only carry `property_id`, requiring a join through `properties` to reach `tenant_id`.

## Not yet addressed anywhere
- Subscription/billing status as a data concept (no table, no field, no workflow)
- Employee/sub-user model under a tenant (schema currently has no `users` or `tenant_users` table at all)
- Per-tenant user-count limits or plan tiers
- Audit logging for who-changed-what across tenant admin actions

## Reference
Related: `Physical_Schema_v0.1.md` (Roles And Access), `DB_Construction_Decisions_v0.1.md` (RLS baseline open item).
