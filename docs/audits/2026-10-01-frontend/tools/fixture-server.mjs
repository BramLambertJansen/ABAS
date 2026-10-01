// Local, synthetic data only. Never connects to a Supabase project.
import http from 'node:http';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const members = [
  { id: id(1), name: 'Anna de Vries', role: 'lid', balance_cents: 1240, has_pin: false, auth_user_id: id(101), email: 'anna@example.test', archived: false, invited_at: null },
  { id: id(2), name: 'Tom Willems', role: 'bardienst', balance_cents: 800, has_pin: true, auth_user_id: id(102), email: 'tom@example.test', archived: false, invited_at: null },
  { id: id(3), name: 'Bram Jansen', role: 'beheerder', balance_cents: 5000, has_pin: true, auth_user_id: id(103), email: 'bram@example.test', archived: false, invited_at: null },
  { id: id(4), name: 'Femke Bos', role: 'bardienst', balance_cents: 250, has_pin: false, auth_user_id: id(104), email: 'femke@example.test', archived: false, invited_at: null },
  { id: id(5), name: 'Willem van de Lange Achternaam', role: 'lid', balance_cents: -500, has_pin: false, auth_user_id: null, email: null, archived: false, invited_at: null },
  { id: id(6), name: 'Archief Lid', role: 'lid', balance_cents: 0, has_pin: false, auth_user_id: null, email: null, archived: true, invited_at: null },
];
const products = [
  ['Pils', 'Bier', 250], ['Cola', 'Fris', 200], ['Koffie', 'Warm', 150],
  ['Thee', 'Warm', 150], ['Rode wijn', 'Wijn', 300], ['Chips', 'Snacks', 125],
  ['Alcoholvrij speciaalbier met een lange productnaam', 'Bier', 350],
  ['Spa rood', 'Fris', 200], ['Bitterballen', 'Snacks', 500], ['Jenever', 'Sterke drank', 300],
].map(([name, category, price_cents], i) => ({ id: id(20 + i), name, category, price_cents, archived: false }));
const types = [{ id: id(40), name: 'Repetitie', archived: false }, { id: id(41), name: 'Concert', archived: false }];
let config = { open: true, error: '', delay: 0, negativeLimit: 0, crew: [id(2), id(3)], balance: 1240 };
let orders = [
  { id: id(60), created_at: '2026-09-30T18:22:00Z', total_cents: 500, served_by: id(2), member_id: id(1), member: { name: 'Anna de Vries' }, server: { name: 'Tom Willems' }, order_lines: [{ qty: 2, products: { name: 'Pils' } }], order_reversals: { order_id: id(60), reason: 'Verkeerd lid gekozen', via: 'bar', reverser: { name: 'Tom Willems' } } },
  { id: id(61), created_at: '2026-09-28T18:10:00Z', total_cents: 200, served_by: id(3), member_id: id(1), member: { name: 'Anna de Vries' }, server: { name: 'Bram Jansen' }, order_lines: [{ qty: 1, products: { name: 'Cola' } }], order_reversals: null },
];
let topups = [{ id: id(70), created_at: '2026-09-25T18:00:00Z', amount_cents: 2000, method: 'cash', served_by: id(2), member: { name: 'Anna de Vries' }, server: { name: 'Tom Willems' } }];
const shift = () => ({ id: id(50), started_at: new Date(Date.now() - 7200000).toISOString(), members: { name: 'Tom Willems' }, activity_types: { name: 'Repetitie' } });
function session(member) {
  const exp = Math.floor(Date.now() / 1000) + 7200;
  const user = { id: member.auth_user_id, aud: 'authenticated', role: 'authenticated', email: member.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp, email: user.email })).toString('base64url'), 'audit-fixture-not-a-real-signature'].join('.');
  return { access_token: token, token_type: 'bearer', expires_in: 7200, expires_at: exp, refresh_token: 'audit-fixture', user };
}
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range,x-supabase-api-version', 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch {}
  const send = (data, status = 200) => { res.writeHead(status, headers); res.end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') return send({});
  if (url.pathname === '/audit/config') { if (req.method === 'POST') config = { ...config, ...body }; return send(config); }
  const path = url.pathname.split('/').pop();
  if (config.delay && req.method !== 'GET') await new Promise(r => setTimeout(r, config.delay));
  if (config.error === path) return send({ message: 'audit_simulated_error', code: 'XX000' }, 500);
  if (url.pathname.startsWith('/auth/')) {
    if (path === 'token') return send(session(members.find(m => m.email === body.email) || members[2]));
    if (path === 'user') return send(session(members[2]).user);
    return send({});
  }
  if (url.pathname.includes('/rpc/')) {
    if (path === 'list_members_admin') return send(members);
    if (path === 'list_own_transactions') return send([
      ...orders.map(o => ({ id: o.id, kind: 'bestelling', created_at: o.created_at, amount_cents: o.total_cents, method: null, server_name: o.server.name, reversed: !!o.order_reversals, reversal_reason: o.order_reversals?.reason ?? null, reversed_via: o.order_reversals?.via ?? null, reversed_by_name: o.order_reversals?.reverser.name ?? null })),
      ...topups.map(t => ({ id: t.id, kind: 'opwaardering', created_at: t.created_at, amount_cents: t.amount_cents, method: 'cash', server_name: t.server.name, reversed: false, reversal_reason: null, reversed_via: null, reversed_by_name: null })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    if (path === 'start_shift') { config.open = true; return send(id(50)); }
    if (path === 'end_shift') { config.open = false; return send(null); }
    if (path === 'add_shift_member') { config.crew = [...new Set([...config.crew, body.p_member_id])]; return send(null); }
    if (path === 'remove_shift_member') { config.crew = config.crew.filter(x => x !== body.p_member_id); return send(null); }
    if (path === 'top_up') { members.find(m => m.id === body.p_member_id).balance_cents += body.p_amount_cents; return send({ amount_cents: body.p_amount_cents }); }
    if (path === 'update_product_price') { const p = products.find(p => p.id === body.p_product_id); p.price_cents = body.p_price_cents; return send(p); }
    if (path === 'set_product_archived') { const p = products.find(p => p.id === body.p_product_id); p.archived = body.p_archived; return send(p); }
    if (path === 'set_own_pin') { members[2].has_pin = body.p_pin !== null; return send(null); }
    if (path === 'update_negative_limit') { config.negativeLimit = body.p_negative_limit_cents; return send(config.negativeLimit); }
    return send(null);
  }
  let rows = [];
  if (path === 'members') {
    rows = members;
    if (url.searchParams.has('auth_user_id')) rows = rows.filter(m => m.auth_user_id === url.searchParams.get('auth_user_id').slice(3));
    if (url.searchParams.get('has_pin') === 'eq.true') rows = rows.filter(m => m.has_pin);
    if (url.searchParams.get('archived') === 'eq.false') rows = rows.filter(m => !m.archived);
    if (url.searchParams.has('role')) rows = rows.filter(m => m.role !== 'lid');
  }
  if (path === 'products') rows = products.filter(p => url.searchParams.get('archived') !== 'eq.false' || !p.archived);
  if (path === 'activity_types') rows = types;
  if (path === 'shifts') rows = config.open ? [shift()] : [];
  if (path === 'shift_members') rows = config.crew.map(member_id => ({ member_id, added_at: '2026-10-01T18:00:00Z', members: { name: members.find(m => m.id === member_id)?.name } }));
  if (path === 'app_settings') rows = [{ negative_limit_cents: config.negativeLimit, low_balance_threshold_cents: 1000 }];
  if (path === 'orders') rows = orders;
  if (path === 'top_ups') rows = topups;
  if (path === 'order_lines') rows = orders.flatMap(o => o.order_lines.map(l => ({ ...l, order_id: o.id })));
  if (req.headers.accept?.includes('vnd.pgrst.object')) return send(rows[0] ?? null);
  return send(rows);
}).listen(54329, '127.0.0.1', () => console.log('Synthetic audit API listening on 54329'));
