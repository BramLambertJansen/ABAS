-- Dienst per sessie, stap 1: het datamodel (docs/features/dienst-per-sessie.md
-- → Datamodel, ADR 0016).
--
-- Bar-werk gebeurt voortaan in een persoonlijke, geregistreerde
-- Supabase-sessie (`bar_sessions`, sleutel = het JWT-claim `session_id`), en
-- een dienst hoort bij die sessie via `shift_sessions`. Deze migratie legt
-- alleen tabellen, kolommen, RLS en rechten vast; de guards en RPC's staan
-- in 0028 en 0029.
--
-- Alle nieuwe tabellen: RLS aan, schrijven ingetrokken voor `anon` en
-- `authenticated`. Schrijven kan alleen via een SECURITY DEFINER-RPC of
-- server-side met de service-role (die RLS omzeilt). De tabellen voor de
-- PIN-login (`bar_devices`, `bar_device_members`, `pin_failures`) hebben
-- bewust géén leespolicy: alleen de server-side loginflow leest ze.

-- ── Voorwaarde: geen open diensten bij de uitrol ─────────────────────────
--
-- Oude diensten hebben geen `started_session_id` en geen koppelingen: ze
-- zouden na deze migratie als "wees-dienst" open blijven staan zonder dat
-- iemand ze kan sluiten. De uitrolvolgorde in de spec (Tablet koppelen
-- verwijderen → Uitrolvolgorde, stap 2) eist daarom dat alle diensten eerst
-- zijn afgesloten; de migratie dwingt dat af in plaats van te vertrouwen op
-- een checklist.
do $$
begin
  if exists (select 1 from shifts where ended_at is null) then
    raise exception 'dienst_per_sessie: sluit eerst alle open diensten af voordat deze migratie draait (docs/features/dienst-per-sessie.md → Uitrolvolgorde)';
  end if;
end $$;

-- ── bar_devices: apparaten waarop met de PIN ingelogd mag worden ─────────
--
-- Het apparaatcookie `abas_apparaat` is een willekeurig token; alleen de
-- SHA-256 daarvan staat hier. Het cookie is GEEN sleutel voor de dienst (die
-- hangt aan de sessie): het bestaat alleen om de PIN-login aan een apparaat
-- te binden (ADR 0016 → Beslissing 7).
create table bar_devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  -- Elke login (wachtwoord of PIN) verlengt het vertrouwen met 30 dagen;
  -- verval wordt op deze kolom afgedwongen (bar_pin_state, 0028).
  last_seen_at timestamptz not null default now(),
  -- Gezet door "apparaat afmelden" (admin_end_bar_session): dit apparaat is
  -- daarna voor niemand meer vertrouwd, ook niet met dezelfde cookie.
  revoked_at timestamptz
);

-- ── bar_device_members: welk lid op welk apparaat met de PIN mag ─────────
create table bar_device_members (
  device_id uuid not null references bar_devices(id),
  member_id uuid not null references members(id),
  -- Laatste wachtwoordlogin via de namenlijst op dit apparaat.
  password_login_at timestamptz not null,
  -- Gezet bij archiveren of rol → `lid` (alle apparaten van dat lid).
  revoked_at timestamptz,
  primary key (device_id, member_id)
);

-- ── pin_failures: lockout per lid, over alle apparaten (B2) ──────────────
create table pin_failures (
  member_id uuid primary key references members(id),
  failed_count integer not null default 0,
  last_failed_at timestamptz,
  -- Gezet bij de vijfde foute PIN; een geslaagde wachtwoordlogin heft de
  -- blokkade op (record_bar_password_login, 0028).
  locked_at timestamptz
);

-- ── bar_sessions ─────────────────────────────────────────────────────────
create table bar_sessions (
  id uuid primary key default gen_random_uuid(),
  -- `auth.jwt()->>'session_id'`, nooit een clientparameter. Bewust géén
  -- foreign key naar auth.sessions: die rij verdwijnt bij uitloggen, terwijl
  -- de dienst zijn geschiedenis (welke sessies werkten erin) moet houden
  -- (ADR 0016 → Verworpen alternatieven).
  auth_session_id uuid not null unique,
  member_id uuid not null references members(id),
  mode text not null check (mode in ('bar', 'beheer')),
  -- Gezet bij een login via de namenlijst, null bij `/beheer`.
  device_id uuid references bar_devices(id),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (
    end_reason in ('uitgelogd', 'inactief', 'afgemeld', 'geen_bar_rol', 'niet_hervat')
  ),
  -- Alleen bij `afgemeld`: welke beheerder deed het.
  ended_by uuid references members(id),
  constraint bar_sessions_einde_consistent check (
    (ended_at is null) = (end_reason is null)
  ),
  constraint bar_sessions_ended_by_alleen_afgemeld check (
    ended_by is null or coalesce(end_reason = 'afgemeld', false)
  )
);

-- Voor de inactiviteitsjob (close_inactive_bar_sessions) en de lijst van
-- actieve sessies: alleen de open rijen.
create index bar_sessions_actief_idx on bar_sessions (last_activity_at)
  where ended_at is null;
create index bar_sessions_member_actief_idx on bar_sessions (member_id)
  where ended_at is null;

-- ── shift_sessions: de koppeling dienst ↔ sessie ─────────────────────────
create table shift_sessions (
  shift_id uuid not null references shifts(id),
  bar_session_id uuid not null references bar_sessions(id),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text check (
    left_reason in (
      'dienst_afgesloten', 'afgesloten_door_beheerder', 'uitgelogd',
      'inactief', 'overgenomen', 'afgemeld', 'geen_bar_rol'
    )
  ),
  primary key (shift_id, bar_session_id),
  constraint shift_sessions_einde_consistent check (
    (left_at is null) = (left_reason is null)
  )
);

-- Een sessie werkt in hooguit één dienst tegelijk, in elke stand (spec →
-- Het model).
create unique index shift_sessions_een_actieve_per_sessie
  on shift_sessions (bar_session_id) where left_at is null;
create index shift_sessions_actief_per_dienst_idx
  on shift_sessions (shift_id) where left_at is null;

-- ── shifts / boekingen: welke sessie ─────────────────────────────────────
-- Null voor diensten van vóór de migratie, en voor boekingen die niet via
-- een bar-sessie zijn gemaakt (reverse_order_as_admin).
alter table shifts add column started_session_id uuid references bar_sessions(id);
alter table orders add column bar_session_id uuid references bar_sessions(id);
alter table top_ups add column bar_session_id uuid references bar_sessions(id);
alter table order_reversals add column bar_session_id uuid references bar_sessions(id);

-- ── admin_notifications: dienst zonder actieve sessie ────────────────────
--
-- Geen vrij tekstveld (zelfde afweging als client_errors, ADR 0015). Eén
-- melding per wees-moment; een volgende koppeling (overname) of het sluiten
-- van de dienst lost haar op.
create table admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dienst_zonder_sessie')),
  reason text not null check (
    reason in ('inactief', 'uitgelogd', 'afgemeld', 'geen_bar_rol')
  ),
  shift_id uuid not null references shifts(id),
  bar_session_id uuid references bar_sessions(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references members(id),
  constraint admin_notifications_opgelost_consistent check (
    resolved_by is null or resolved_at is not null
  )
);

-- Hooguit één openstaande melding per dienst: backstop voor "één melding per
-- wees-moment".
create unique index admin_notifications_een_open_per_dienst
  on admin_notifications (shift_id) where resolved_at is null;

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table bar_devices enable row level security;
alter table bar_device_members enable row level security;
alter table pin_failures enable row level security;
alter table bar_sessions enable row level security;
alter table shift_sessions enable row level security;
alter table admin_notifications enable row level security;

-- Lezen: bardienst en beheerder, geen lid en geen sessie zonder gekoppeld lid.
-- Een subquery op `members` in plaats van `not caller_is_lid()`: dat laatste
-- is ook waar voor een sessie zonder members-rij (bv. het device-account, dat
-- bij de uitrol verdwijnt), en die hoort hier niets te lezen.
create policy bar_sessions_select on bar_sessions for select to authenticated
  using (
    exists (
      select 1 from members m
      where m.auth_user_id = auth.uid()
        and not m.archived
        and m.role in ('bardienst', 'beheerder')
    )
  );

create policy shift_sessions_select on shift_sessions for select to authenticated
  using (
    exists (
      select 1 from members m
      where m.auth_user_id = auth.uid()
        and not m.archived
        and m.role in ('bardienst', 'beheerder')
    )
  );

-- Meldingen: alleen een beheerder.
create policy admin_notifications_select on admin_notifications for select to authenticated
  using (
    exists (
      select 1 from members m
      where m.auth_user_id = auth.uid()
        and not m.archived
        and m.role = 'beheerder'
    )
  );

-- bar_devices, bar_device_members en pin_failures: bewust geen enkele policy.
-- Zonder policy ziet en schrijft een API-rol niets; de service-role (de
-- server-side loginflow) omzeilt RLS.

-- ── Schrijven en (waar bedoeld) lezen intrekken ──────────────────────────
--
-- Zelfde patroon als de geldtabellen: RLS alleen is niet genoeg tegen een
-- latere policy per ongeluk, dus de tabelrechten gaan er expliciet af.
revoke all on bar_devices, bar_device_members, pin_failures from authenticated, anon;
revoke all on bar_sessions, shift_sessions, admin_notifications from anon;
revoke insert, update, delete, truncate, references, trigger
  on bar_sessions, shift_sessions, admin_notifications from authenticated;
