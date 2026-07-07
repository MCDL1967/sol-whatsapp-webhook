-- Minimal reservation-write path (walking skeleton).
-- Scope: prove WhatsApp -> reservation write end-to-end before building the full schema.
-- See docs/db_planning/Physical_Schema_v0.1.md and DB_Construction_Decisions_v0.1.md.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- tenants -------------------------------------------------------------

create table tenants (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_key),
  check (status in ('active','trial','pending_setup','suspended','cancelled'))
);

alter table tenants enable row level security;

create trigger tenants_set_updated_at
  before update on tenants
  for each row execute function set_updated_at();

-- properties ------------------------------------------------------------

create table properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  property_key text not null,
  display_name text not null,
  timezone text not null default 'America/Panama',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, property_key)
);

create index properties_tenant_property_key_idx on properties (tenant_id, property_key);

alter table properties enable row level security;

create trigger properties_set_updated_at
  before update on properties
  for each row execute function set_updated_at();

-- guest_threads -----------------------------------------------------------

create table guest_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  property_id uuid not null references properties(id),
  external_user_id text not null,
  channel text not null default 'whatsapp',
  current_language text,
  status text not null default 'active',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, channel, external_user_id),
  check (current_language is null or current_language in ('en','es'))
);

create index guest_threads_property_last_message_idx on guest_threads (property_id, last_message_at);

alter table guest_threads enable row level security;

create trigger guest_threads_set_updated_at
  before update on guest_threads
  for each row execute function set_updated_at();

-- cases -------------------------------------------------------------------

create table cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  property_id uuid not null references properties(id),
  guest_thread_id uuid not null references guest_threads(id),
  case_type text not null,
  dept_target text not null,
  assigned_team_id uuid,
  status text not null default 'new',
  priority text not null default 'normal',
  guest_name text,
  guest_phone text,
  source_channel text not null default 'whatsapp',
  source_message_id uuid,
  summary text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid,
  check (case_type in ('reservation','complaint','incident','service_request')),
  check (dept_target in ('FNB','SEC','OPS')),
  check (status in ('new','open','assigned','waiting_guest','waiting_staff','resolved','closed','cancelled')),
  check (priority in ('low','normal','high','urgent'))
);

create index cases_property_status_created_idx on cases (property_id, status, created_at);
create index cases_property_dept_status_idx on cases (property_id, dept_target, status);
create index cases_guest_thread_created_idx on cases (guest_thread_id, created_at);

alter table cases enable row level security;

create trigger cases_set_updated_at
  before update on cases
  for each row execute function set_updated_at();

-- reservation_details -------------------------------------------------------

create table reservation_details (
  case_id uuid primary key references cases(id),
  venue_id uuid,
  requested_date date,
  requested_time time,
  party_size integer,
  reservation_name text,
  special_requests text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table reservation_details enable row level security;

create trigger reservation_details_set_updated_at
  before update on reservation_details
  for each row execute function set_updated_at();
