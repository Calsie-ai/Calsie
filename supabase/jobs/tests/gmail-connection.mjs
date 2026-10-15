// Disposable PostgreSQL regression checks. No production connection is accepted.
// PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node supabase/jobs/tests/gmail-connection.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);`);
  await db.exec(readFileSync(new URL('../migrations/20261015085538_gmail_session_connection.sql', import.meta.url), 'utf8'));
  const user = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const session = '33333333-3333-4333-8333-333333333333';
  const attempt = '44444444-4444-4444-8444-444444444444';
  const trace = '55555555-5555-4555-8555-555555555555';
  const next = '66666666-6666-4666-8666-666666666666';
  const nonce = 'a'.repeat(64);
  await db.query('insert into auth.users values ($1),($2)', [user, other]);
  await db.query('insert into auth.sessions values ($1,$2,null)', [session, user]);
  const rpc = async (action, owner = user, data = {}) => (await db.query(
    'select public.calsie_gmail_transition($1,$2,$3) as result', [action, owner, JSON.stringify(data)]
  )).rows[0].result;
  const startData = (id = attempt, hash = nonce) => ({ attempt_id: id, nonce_hash: hash,
    expires_at: new Date(Date.now() + 300000).toISOString(),
    consent: { privacy_accepted: true, dedicated_email_confirmed: true, policy_version: '2026-07-30' } });
  const complete = { attempt_id: attempt, gmail_email: 'dedicated@example.com', google_subject: 'provider-id',
    scope: 'openid email https://www.googleapis.com/auth/gmail.send', token_ciphertext: 'encrypted-test-payload' };

  assert.equal((await rpc('session_active', user, { session_id: session })).ok, true);
  assert.equal((await rpc('session_active', other, { session_id: session })).ok, false);
  await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1", [session]);
  assert.equal((await rpc('session_active', user, { session_id: session })).ok, false);
  await db.query('delete from auth.sessions where id=$1', [session]);
  assert.equal((await rpc('session_active', user, { session_id: session })).ok, false);
  await assert.rejects(rpc('begin', user, { ...startData(), consent: {} }));
  await assert.rejects(rpc('begin', user, { ...startData(), nonce_hash: null }));
  await assert.rejects(rpc('begin', user, { ...startData(), expires_at: null }));
  assert.equal((await rpc('begin', user, startData())).ok, true);
  assert.equal((await rpc('claim', other, { attempt_id: attempt, nonce_hash: nonce })).ok, false);
  assert.equal((await rpc('claim', user, { attempt_id: attempt, nonce_hash: 'b'.repeat(64) })).ok, false);
  assert.equal((await rpc('claim', user, { attempt_id: attempt, nonce_hash: nonce })).ok, true);
  assert.equal((await rpc('claim', user, { attempt_id: attempt, nonce_hash: nonce })).ok, false);
  await assert.rejects(rpc('complete', user, { ...complete, scope: 'email' }));
  assert.equal((await rpc('complete', user, complete)).ok, true);
  assert.equal((await rpc('complete', user, complete)).ok, false);
  assert.equal((await rpc('status')).connected, true);
  assert.equal((await rpc('status', other)).connected, false);
  assert.equal(JSON.stringify(await rpc('status')).includes(complete.token_ciphertext), false);

  const disconnected = await rpc('disconnect', user, { trace_id: trace });
  assert.equal(disconnected.token_ciphertext, complete.token_ciphertext);
  assert.equal((await rpc('status')).connected, false);
  assert.equal((await db.query('select token_ciphertext from calsie_private.gmail_connections where user_id=$1', [user])).rows[0].token_ciphertext, null);
  assert.equal((await rpc('begin', user, startData(next, 'c'.repeat(64)))).ok, false);
  assert.equal((await rpc('disconnect', user, { trace_id: next })).revocation_pending, true);
  assert.equal((await db.query('select disconnect_trace_id from calsie_private.gmail_connections where user_id=$1', [user])).rows[0].disconnect_trace_id, trace);
  assert.equal((await rpc('begin', user, startData(next, 'c'.repeat(64)))).ok, false);
  await rpc('revocation_result', user, { trace_id: trace, confirmed: false });
  assert.equal((await rpc('begin', user, startData(next, 'c'.repeat(64)))).ok, true);
  await rpc('claim', user, { attempt_id: next, nonce_hash: 'c'.repeat(64) });
  await rpc('disconnect', user, { trace_id: next });
  assert.equal((await rpc('complete', user, { ...complete, attempt_id: next })).ok, false);

  const expired = '77777777-7777-4777-8777-777777777777';
  await rpc('begin', user, startData(expired, 'd'.repeat(64)));
  await db.query("update calsie_private.gmail_oauth_attempts set expires_at=now()-interval '1 minute' where id=$1", [expired]);
  assert.equal((await rpc('claim', user, { attempt_id: expired, nonce_hash: 'd'.repeat(64) })).ok, false);
  assert.equal((await db.query('select status from calsie_private.gmail_oauth_attempts where id=$1', [expired])).rows[0].status, 'expired');

  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from calsie_private.gmail_connections'));
  await assert.rejects(rpc('status'));
  await db.exec('reset role; set role anon');
  await assert.rejects(rpc('status'));
  await db.exec('reset role; set role service_role');
  assert.equal((await rpc('status')).connected, false);
  await db.exec('reset role');
  const events = (await db.query('select event,count(*)::int as count from calsie_private.gmail_events group by event')).rows;
  assert.ok(events.some(row => row.event === 'attempt_expired'));
  assert.ok(events.some(row => row.event === 'attempt_cancelled'));
  assert.ok(events.some(row => row.event === 'connection_confirmed'));
  console.log('PASS: migration; active/deleted/expired session ownership; consent; nonce; replay; required scope; user isolation; metadata-only status; disconnect and reconnect ordering; expiry recovery; RLS/RPC privileges; event history.');
} finally {
  await db.close();
}
