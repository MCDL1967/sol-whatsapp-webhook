-- Remaining config + operational tables from the full target schema.
-- Scope: schema structure only, no seed content (seed content is a separate follow-up).
-- See docs/db_planning/Physical_Schema_v0.1.md and DB_Construction_Decisions_v0.1.md.

-- property_settings ---------------------------------------------------------

create table property_settings (
  property_id uuid primary key references properties(id),
  concierge_name text not null,
  default_language text not null default 'en',
  supported_languages text[] not null default array['en','es'],
  phone_region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_language in ('en','es'))
);

alter table property_settings enable row level security;

create trigger property_settings_set_updated_at
  before update on property_settings
  for each row execute function set_updated_at();

-- teams -----------------------------------------------------------------

create table teams (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  team_key text not null,
  display_name text not null,
  dept_target text not null,
  scope text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, team_key),
  check (dept_target in ('FNB','SEC','OPS'))
);

create index teams_property_dept_target_idx on teams (property_id, dept_target);

alter table teams enable row level security;

create trigger teams_set_updated_at
  before update on teams
  for each row execute function set_updated_at();

-- venues ------------------------------------------------------------------

create table venues (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  venue_key text not null,
  display_name text not null,
  venue_type text not null,
  reservation_enabled boolean not null default false,
  show_in_runtime_menu boolean not null default true,
  selectable boolean not null default true,
  show_in_restaurant_list boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, venue_key)
);

create index venues_property_venue_type_idx on venues (property_id, venue_type);

alter table venues enable row level security;

create trigger venues_set_updated_at
  before update on venues
  for each row execute function set_updated_at();

-- venue_aliases -------------------------------------------------------------

create table venue_aliases (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id),
  alias text not null,
  language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, alias, language),
  check (language is null or language in ('en','es'))
);

create index venue_aliases_alias_idx on venue_aliases (alias);

alter table venue_aliases enable row level security;

create trigger venue_aliases_set_updated_at
  before update on venue_aliases
  for each row execute function set_updated_at();

-- venue_descriptions --------------------------------------------------------

create table venue_descriptions (
  venue_id uuid not null references venues(id),
  language text not null,
  short_description text,
  long_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (venue_id, language),
  check (language in ('en','es'))
);

alter table venue_descriptions enable row level security;

create trigger venue_descriptions_set_updated_at
  before update on venue_descriptions
  for each row execute function set_updated_at();

-- venue_hours ---------------------------------------------------------------

create table venue_hours (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id),
  day_of_week smallint not null,
  open_time time,
  close_time time,
  is_closed boolean not null default false,
  is_24_hours boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (day_of_week between 0 and 6)
);

alter table venue_hours enable row level security;

create trigger venue_hours_set_updated_at
  before update on venue_hours
  for each row execute function set_updated_at();

-- reservation_rules ----------------------------------------------------------

create table reservation_rules (
  property_id uuid primary key references properties(id),
  large_party_threshold integer not null default 8,
  arrival_buffer_minutes integer default 10,
  typical_duration_minutes integer,
  required_fields text[] not null,
  policy_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table reservation_rules enable row level security;

create trigger reservation_rules_set_updated_at
  before update on reservation_rules
  for each row execute function set_updated_at();

-- menu_branches ---------------------------------------------------------------

create table menu_branches (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  branch_key text not null,
  parent_branch_key text,
  display_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, branch_key)
);

alter table menu_branches enable row level security;

create trigger menu_branches_set_updated_at
  before update on menu_branches
  for each row execute function set_updated_at();

-- menu_options ----------------------------------------------------------------

create table menu_options (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references menu_branches(id),
  option_key text not null,
  label_en text not null,
  label_es text,
  choice_number integer,
  next_branch_key text,
  case_type text,
  dept_target text,
  template_key text,
  target_file text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, option_key)
);

create index menu_options_branch_choice_number_idx on menu_options (branch_id, choice_number);

alter table menu_options enable row level security;

create trigger menu_options_set_updated_at
  before update on menu_options
  for each row execute function set_updated_at();

-- menu_option_aliases -----------------------------------------------------------

create table menu_option_aliases (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references menu_branches(id),
  option_key text not null,
  alias_text text not null,
  language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, alias_text, language),
  check (language is null or language in ('en','es'))
);

alter table menu_option_aliases enable row level security;

create trigger menu_option_aliases_set_updated_at
  before update on menu_option_aliases
  for each row execute function set_updated_at();

-- menu_branch_triggers ------------------------------------------------------------

create table menu_branch_triggers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references menu_branches(id),
  trigger_text text not null,
  language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, trigger_text, language),
  check (language is null or language in ('en','es'))
);

alter table menu_branch_triggers enable row level security;

create trigger menu_branch_triggers_set_updated_at
  before update on menu_branch_triggers
  for each row execute function set_updated_at();

-- answer_boundaries -----------------------------------------------------------------

create table answer_boundaries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  boundary_type text not null,
  topic text,
  rule_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (boundary_type in ('may_answer_directly','must_escalate','safe_rule'))
);

create index answer_boundaries_property_boundary_type_idx on answer_boundaries (property_id, boundary_type);

alter table answer_boundaries enable row level security;

create trigger answer_boundaries_set_updated_at
  before update on answer_boundaries
  for each row execute function set_updated_at();

-- response_templates ------------------------------------------------------------------

create table response_templates (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  template_key text not null,
  language text not null,
  body text not null,
  required_variables text[],
  channel text not null,
  approval_status text not null default 'approved',
  last_reviewed timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, template_key, language),
  check (language in ('en','es')),
  check (approval_status in ('draft','approved','needs_review'))
);

alter table response_templates enable row level security;

create trigger response_templates_set_updated_at
  before update on response_templates
  for each row execute function set_updated_at();

-- runtime_feature_flags ----------------------------------------------------------------

create table runtime_feature_flags (
  property_id uuid not null references properties(id),
  flag_key text not null,
  enabled boolean not null default false,
  value_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, flag_key)
);

alter table runtime_feature_flags enable row level security;

create trigger runtime_feature_flags_set_updated_at
  before update on runtime_feature_flags
  for each row execute function set_updated_at();

-- messages -------------------------------------------------------------------------------

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  property_id uuid not null references properties(id),
  guest_thread_id uuid not null references guest_threads(id),
  case_id uuid references cases(id),
  direction text not null,
  channel text not null,
  sender_type text not null,
  external_message_id text,
  message_text text,
  raw_payload jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (direction in ('inbound','outbound')),
  check (channel in ('whatsapp','voice','web','internal')),
  check (sender_type in ('guest','system','staff','assistant','admin'))
);

create index messages_guest_thread_sent_at_idx on messages (guest_thread_id, sent_at);
create index messages_case_id_idx on messages (case_id);
create index messages_property_created_at_idx on messages (property_id, created_at);

alter table messages enable row level security;

-- complaint_details -----------------------------------------------------------------------

create table complaint_details (
  case_id uuid primary key references cases(id),
  complaint_category text,
  severity text,
  location_text text,
  guest_impact text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table complaint_details enable row level security;

create trigger complaint_details_set_updated_at
  before update on complaint_details
  for each row execute function set_updated_at();

-- incident_details -------------------------------------------------------------------------

create table incident_details (
  case_id uuid primary key references cases(id),
  incident_category text,
  severity text,
  location_text text,
  people_involved text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table incident_details enable row level security;

create trigger incident_details_set_updated_at
  before update on incident_details
  for each row execute function set_updated_at();

-- service_request_details -----------------------------------------------------------------

create table service_request_details (
  case_id uuid primary key references cases(id),
  service_request_type text not null,
  service_area_label text,
  requested_date date,
  requested_time time,
  guest_count integer,
  location_text text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_request_type in ('service_request_1','service_request_2','service_request_3'))
);

alter table service_request_details enable row level security;

create trigger service_request_details_set_updated_at
  before update on service_request_details
  for each row execute function set_updated_at();

-- operational_events ------------------------------------------------------------------------

create table operational_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  property_id uuid not null references properties(id),
  case_id uuid references cases(id),
  event_type text not null,
  actor_type text not null,
  actor_id uuid,
  event_payload jsonb,
  created_at timestamptz not null default now()
);

create index operational_events_case_created_idx on operational_events (case_id, created_at);
create index operational_events_property_created_idx on operational_events (property_id, created_at);
create index operational_events_property_event_type_created_idx on operational_events (property_id, event_type, created_at);

alter table operational_events enable row level security;

-- runtime_packages ---------------------------------------------------------------------------

create table runtime_packages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id),
  runtime_package_version text not null,
  source_schema_version text not null,
  package_json jsonb not null,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now()
);

alter table runtime_packages enable row level security;

-- Deferred FKs from the walking-skeleton migration, now enforceable ---------------------------

alter table cases
  add constraint cases_assigned_team_id_fkey foreign key (assigned_team_id) references teams(id);

alter table reservation_details
  add constraint reservation_details_venue_id_fkey foreign key (venue_id) references venues(id);
