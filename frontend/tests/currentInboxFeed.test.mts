import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as rules from '../../supabase/jobs/functions/calsie-agent-feed/feedRules.ts';
const uuid = '12345678-1234-4234-8234-123456789abc';
const today = '2026-10-01T20:33:25Z';
const agent = { id: 'agent-a', user_id: 'user-a', category: 'aged_care', status: 'active', created_at: today, preferences: { location: 'NSW 2141' } };
const job = { id: uuid, title: 'Care worker', job_source: 'seek', source_job_id: 'seek-123', canonical_apply_url: 'https://seek.com.au/job/123', location: 'Sydney NSW', description: 'Inbox description', first_seen_at: today, raw_payload: { listing_date: '2026-09-30T00:00:00Z' } };
test('UUIDs and exact bigint IDs survive the decision contract', () => {
  assert.equal(rules.validJobId(uuid.toUpperCase()), uuid);
  assert.equal(rules.validJobId('9223372036854775807'), '9223372036854775807');
  for (const bad of [null, '', 0, -1, 1.2, {}, '9223372036854775808', 'invalid', '1e3']) assert.equal(rules.validJobId(bad), null);
});
test('collection day uses Sydney, independently of provider posting dates', () => {
  const mapped = rules.mapFeedJob(job, agent.id, 'agecare_jobs_view');
  assert.equal(mapped.batch_date, '2026-10-02');
  assert.equal(mapped.posted_at, '2026-09-30T00:00:00Z');
  assert.equal(mapped.description, job.description);
  assert.equal(mapped.source_job_id, uuid);
  assert.equal(rules.fetchedDay('2026-10-04T13:30:00Z'), '2026-10-05');
  assert.equal(rules.mapFeedJob({ ...job, raw_payload: {} }, agent.id, 'agecare_jobs_view').posted_at, null);
});
test('legacy history suppresses matching provider jobs without numeric ID collisions', () => {
  const d = { source_table: 'agecare_jobs_apify', source_job_id: '10', job_snapshot: { canonical_apply_url: job.canonical_apply_url } };
  assert.equal(rules.alreadyReviewed(job, 'agecare_jobs_view', [d]), true);
  assert.equal(rules.alreadyReviewed({ id: '10' }, 'agecare_jobs_view', [d]), false);
});
function setup(tables: Record<string, any[]>, validAuth = true) {
  const calls: string[] = [];
  class Query {
    table: string; rows: any[]; single = false; orders: Array<{ c: string; ascending: boolean }> = [];
    constructor(table: string) { this.table = table; this.rows = [...(tables[table] || [])]; }
    select() { return this; }
    eq(c: string, v: unknown) { this.rows = this.rows.filter(r => String(r[c]) === String(v)); return this; }
    in(c: string, vs: any[]) { this.rows = this.rows.filter(r => vs.map(String).includes(String(r[c]))); return this; }
    order(c: string, o: { ascending: boolean }) { this.orders.push({ c, ascending: o.ascending }); this.rows.sort((a,b) => { for (const order of this.orders) { const cmp = String(a[order.c] || '').localeCompare(String(b[order.c] || '')) * (order.ascending ? 1 : -1); if (cmp) return cmp; } return 0; }); return this; }
    range(a: number, b: number) { this.rows = this.rows.slice(a,b+1); return this; }
    maybeSingle() { this.single = true; return this; }
    insert(r: any) { (tables[this.table] ||= []).push(r); this.rows = []; return this; }
    then(resolve: any, reject: any) { calls.push(this.table); return Promise.resolve({ data: this.single ? this.rows[0] || null : this.rows, error: null }).then(resolve,reject); }
  }
  let handler: (req: Request) => Promise<Response>;
  const source = readFileSync(new URL('../../supabase/jobs/functions/calsie-agent-feed/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, { ...rules, Request, Response,
    Deno: { env: { get: () => 'test-config' }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => ({ from: (t: string) => new Query(t), auth: { getUser: async () => ({ data: { user: validAuth ? { id: 'user-a' } : null }, error: validAuth ? null : new Error('invalid') }) } }),
  });
  return { calls, request: async (body: any) => {
    const r = await handler!(new Request('https://example.test/feed', { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: r.status, body: await r.json() };
  } };
}
test('every category reads its current view with newest fetches first', async () => {
  for (const [category,pool] of Object.entries(rules.CATEGORY_POOLS)) {
    const newer = { ...job, id: '02345678-1234-4234-8234-123456789abc', first_seen_at: '2026-10-02T01:00:00Z', source_job_id: 'new', canonical_apply_url: 'https://example.test/new' };
    const s = setup({ calsie_agents: [{ ...agent, category }], [pool.current]: [job,newer] });
    const r = await s.request({ action: 'feed', agent_id: agent.id });
    assert.equal(r.status,200); assert.equal(r.body.source_table,pool.current);
    assert.deepEqual(r.body.opportunities.map((j: any) => j.id),[newer.id,job.id]);
    assert.equal(s.calls.includes(pool.legacy),false);
  }
});
test('legacy snapshots stay visible and reviewed inbox copies stay out of the queue', async () => {
  const d = { user_id: 'user-a', agent_id: agent.id, source_table: 'agecare_jobs_apify', source_job_id: '10', decision: 'skipped', job_snapshot: { id: 10, title: 'Historic job', canonical_apply_url: job.canonical_apply_url } };
  const s = setup({ calsie_agents: [agent], agecare_jobs_view: [job], calsie_job_swipe_decisions: [d] });
  const r = await s.request({ action: 'feed' });
  assert.equal(r.body.opportunities.length,1); assert.equal(r.body.opportunities[0].status,'skipped'); assert.equal(r.body.opportunities[0].title,'Historic job');
});
test('UUID decisions save once and refuse a repeated review', async () => {
  const tables = { calsie_agents: [agent], agecare_jobs_view: [job], calsie_job_swipe_decisions: [] as any[] };
  const s = setup(tables);
  assert.equal((await s.request({ action: 'decide', agent_id: agent.id, source_job_id: uuid, decision: 'approved' })).status,200);
  assert.equal(tables.calsie_job_swipe_decisions[0].source_job_id,uuid); assert.equal(tables.calsie_job_swipe_decisions[0].source_table,'agecare_jobs_view');
  assert.equal((await s.request({ action: 'decide', agent_id: agent.id, source_job_id: uuid, decision: 'skipped' })).status,409);
});
test('ownership, auth, campaign status and location are enforced', async () => {
  const s = setup({ calsie_agents: [agent,{ ...agent, id: 'foreign', user_id: 'other' }], agecare_jobs_view: [{ ...job, location: 'Melbourne VIC' }] });
  assert.equal((await s.request({ agent_id: 'foreign' })).status,404);
  assert.equal((await s.request({ action: 'feed' })).body.opportunities.length,0);
  assert.equal((await s.request({ action: 'decide', source_job_id: uuid, decision: 'approved' })).status,409);
  const paused = setup({ calsie_agents: [{ ...agent, status: 'paused' }], agecare_jobs_view: [job] });
  assert.equal((await paused.request({ action: 'feed' })).body.opportunities.length,0);
  assert.equal((await paused.request({ action: 'decide', source_job_id: uuid, decision: 'approved' })).status,409);
  assert.equal((await setup({},false).request({ action: 'feed' })).status,401);
});
