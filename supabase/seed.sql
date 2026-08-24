-- Local dev seed data. Demo PIN for every bar/beheer member below is 1234 —
-- fine for local `supabase start`, never seed this into a real deployment.

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

insert into products (name, category, price_cents) values
  ('Pils',   'Bier', 250),
  ('Radler', 'Bier', 250),
  ('Cola',   'Fris', 200),
  ('Water',  'Fris', 120),
  ('Chips',  'Snacks', 150);
