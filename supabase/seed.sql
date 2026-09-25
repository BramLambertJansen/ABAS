-- Local dev seed data. Demo PIN for every bar/beheer member below is 1234 —
-- fine for local `supabase start`, never seed this into a real deployment.

-- Local/CI-only device account (docs/ARCHITECTURE.md → "Shared bar-tablet
-- session mechanism"). `src/middleware.ts` signs `shells/bar` in as this
-- account via SUPABASE_DEVICE_EMAIL/SUPABASE_DEVICE_PASSWORD before any
-- RLS-protected read can succeed. Production provisions its own real
-- account manually via Studio (docs/ARCHITECTURE.md → "Still open" —
-- unchanged by this); this is only so `supabase start` (and therefore
-- `npm run check:a11y`'s bezetting-overlay/verkoop flows, which need a
-- signed-in session to render the staff picker at all) has *something* to
-- sign in as. Root-caused 2026-08-26: this was the actual reason
-- e2e/a11y.spec.ts's bezetting-overlay test timed out waiting for a staff
-- button in real CI (run 32998590441 off #38) — not an a11y regression,
-- no account existed to sign in as, so every RLS read came back empty.
-- Direct auth.users/auth.identities insert, the standard local-dev-only
-- recipe (`enable_signup = false` in config.toml rules out a normal
-- signup call) — never run against a real/remote project.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'device@aurora.local',
  crypt('local-device-dev-only', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), id, id::text,
  format('{"sub":"%s","email":"%s"}', id::text, email)::jsonb,
  'email', now(), now(), now()
from auth.users where email = 'device@aurora.local';

-- Non-zero for local dev so the negative-balance path is actually
-- exercisable (Piet Bakker below starts already negative). Production
-- default stays €0 (migration 0001) until a beheerder sets it.
update app_settings set negative_limit_cents = 1500;

insert into members (name, role, pin_hash, balance_cents, archived) values
  ('Tom Willems',   'bardienst', crypt('1234', gen_salt('bf')), 980,  false),
  ('Sanne Bakker',  'bardienst', crypt('1234', gen_salt('bf')), 2100, false),
  ('Femke Bos',     'beheerder', crypt('1234', gen_salt('bf')), 1640, false),
  ('Anna de Vries', 'lid',       null,                          1240, false),
  ('Piet Bakker',   'lid',       null,                          -840, false);

-- Beheerder e-mail/wachtwoord account for Femke Bos, so
-- e2e/a11y.spec.ts's beheer-login scenario (#11,
-- docs/features/negatieve-saldolimiet.md → Randgevallen "A11y") can sign
-- in via BeheerLogin.tsx's real wachtwoord-flow. Her `pin_hash` is cleared
-- below the moment she gets a linked auth_user_id: ADR 0003 makes the
-- auth-methode a per-member either/or (PIN *or* e-mail/wachtwoord, never
-- both), so a seeded member can't keep a working PIN once she's also
-- given a password account (caught by review on PR #50 — the seed
-- originally left her PIN active alongside the new password, which no
-- real member state is meant to allow). No prior /beheer e2e scenario
-- needed a password account, which is why Femke Bos had no linked
-- auth_user_id until now. Same local-dev-only direct
-- auth.users/auth.identities insert as the shared device account above,
-- still never seeded into a real deployment.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'femke.bos@aurora.local',
  crypt('local-beheerder-dev-only', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), id, id::text,
  format('{"sub":"%s","email":"%s"}', id::text, email)::jsonb,
  'email', now(), now(), now()
from auth.users where email = 'femke.bos@aurora.local';

update members set auth_user_id = (
    select id from auth.users where email = 'femke.bos@aurora.local'
  ),
  pin_hash = null
where name = 'Femke Bos';

-- Bardienst e-mail/wachtwoord account for Sanne Bakker, so
-- e2e/a11y.spec.ts can prove issue #19's role-gate on BeheerTabs.tsx (the
-- Logboek-tab only renders for `role === "beheerder"`) against a genuine
-- `bardienst` session reaching `/beheer`, not just a beheerder one — the
-- seeded bardienst members (Tom Willems, Sanne Bakker) only had a PIN
-- before this, and PIN sign-in is bar-modus only (ADR 0002/0003), never
-- reaching `/beheer`'s `BeheerTabs`. Sanne Bakker, not Tom Willems: Tom's
-- PIN is load-bearing across `e2e/a11y.spec.ts`'s whole
-- "stateful bar-shell scenarios" describe.serial block
-- (`STAFF_BUTTON_NAME`/`ensureShiftStarted()`), so giving him a password
-- account would mean clearing his `pin_hash` (ADR 0003's per-member
-- either/or, see the Femke Bos comment above) and breaking all of that —
-- Sanne has no such dependency anywhere in the codebase. Same
-- either/or consequence as Femke Bos: her `pin_hash` is cleared below the
-- moment she gets a linked auth_user_id, same local-dev-only direct
-- auth.users/auth.identities insert as the two accounts above, still never
-- seeded into a real deployment. This narrows
-- docs/features/auth-methode-per-lid.md's "Tom Willems, Sanne Bakker are
-- both PIN-only fixtures" observation down to Tom Willems alone — that
-- section only documents *why* the schema tolerates
-- `pin_hash is not null` / `auth_user_id is null` together, not a
-- guarantee that both fixtures forever stay in that state.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'sanne.bakker@aurora.local',
  crypt('local-bardienst-dev-only', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), id, id::text,
  format('{"sub":"%s","email":"%s"}', id::text, email)::jsonb,
  'email', now(), now(), now()
from auth.users where email = 'sanne.bakker@aurora.local';

update members set auth_user_id = (
    select id from auth.users where email = 'sanne.bakker@aurora.local'
  ),
  pin_hash = null
where name = 'Sanne Bakker';

insert into products (name, category, price_cents) values
  ('Pils',   'Bier', 250),
  ('Radler', 'Bier', 250),
  ('Cola',   'Fris', 200),
  ('Water',  'Fris', 120),
  ('Chips',  'Snacks', 150);
