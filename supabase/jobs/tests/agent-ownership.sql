-- Run only on a disposable database after the Jobs agent_ownership migration.
begin;
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select * from public.calsie_choose_agent('disability', 'Greater Sydney · NSW 2141');
do $$ declare v_agent public.calsie_agents; v_started timestamptz; begin
  select * into strict v_agent from public.calsie_agents;
  assert v_agent.status = 'draft' and v_agent.payment_status = 'deferred', 'owned agent is draft, payment deferred';
  assert (select count(*) from public.calsie_agent_events) = 1, 'activation event recorded';
  begin
    perform public.calsie_choose_agent('invalid');
    raise exception 'invalid category was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.calsie_agents(user_id,category,name) values ('22222222-2222-4222-8222-222222222222','childcare','Wrong owner');
    raise exception 'cross-user insert was accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.calsie_agents set payment_status = 'paid';
    raise exception 'user could fake payment';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.calsie_agent_events(agent_id,user_id,event_type,next_status) values (v_agent.id,v_agent.user_id,'campaign_started','active');
    raise exception 'user could forge lifecycle history';
  exception when insufficient_privilege then null; end;
  begin
    update public.calsie_agents set status = 'paused' where id = v_agent.id;
    raise exception 'draft-to-paused transition was accepted';
  exception when check_violation then null; end;
  update public.calsie_agents set status = 'active' where id = v_agent.id;
  select started_at into v_started from public.calsie_agents where id = v_agent.id;
  assert v_started is not null, 'first start timestamp saved';
  update public.calsie_agents set status = 'paused' where id = v_agent.id;
  perform public.calsie_choose_agent('disability', 'Different location');
  assert (select count(*) from public.calsie_agents) = 1, 'repeat activation is idempotent';
  assert (select status from public.calsie_agents where id = v_agent.id) = 'paused', 'repeat activation preserves pause';
  assert (select preferences->>'location' from public.calsie_agents where id = v_agent.id) = 'Greater Sydney · NSW 2141', 'repeat activation preserves preferences';
  assert (select count(*) from public.calsie_agent_events) = 3, 'repeat activation does not add another ownership event';
  update public.calsie_agents set status = 'active' where id = v_agent.id;
  assert (select started_at from public.calsie_agents where id = v_agent.id) = v_started, 'resume preserves first start';
  assert (select paused_at from public.calsie_agents where id = v_agent.id) is not null, 'pause timestamp retained';
  assert (select count(*) from public.calsie_agent_events) = 4, 'all transitions traceable';
end $$;

-- Another signed-in user sees no rows, cannot update the first user's agent,
-- and may own their own instance of the same category.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$ declare v_count integer; begin
  assert (select count(*) from public.calsie_agents) = 0, 'RLS isolates ownership';
  assert (select count(*) from public.calsie_agent_events) = 0, 'RLS isolates history';
  update public.calsie_agents set status = 'paused' where user_id = '11111111-1111-4111-8111-111111111111';
  get diagnostics v_count = row_count;
  assert v_count = 0, 'cross-user update blocked';
end $$;
select * from public.calsie_choose_agent('disability');
do $$ begin
  assert (select count(*) from public.calsie_agents) = 1, 'second user owns separate agent';
  assert (select payment_status from public.calsie_agents) = 'deferred', 'payment remains deferred';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$ declare v_agent uuid; begin
  select id into v_agent from public.calsie_agents where user_id = auth.uid();
  insert into public.calsie_job_swipe_decisions(agent_id,user_id,category) values (v_agent,auth.uid(),'disability');
  update public.calsie_agents set status = 'paused' where id = v_agent;
  begin
    insert into public.calsie_job_swipe_decisions(agent_id,user_id,category) values (v_agent,auth.uid(),'disability');
    raise exception 'a stale decision bypassed pause';
  exception when check_violation then null; end;
  begin
    insert into public.calsie_job_swipe_decisions(agent_id,user_id,category) values (v_agent,auth.uid(),'childcare');
    raise exception 'a decision bypassed category ownership';
  exception when check_violation then null; end;
  perform public.calsie_choose_agent('disability');
  assert (select count(*) from public.calsie_job_swipe_decisions where agent_id = v_agent) = 1, 'reselection retains saved swipe history';
end $$;
update public.calsie_agents set status = 'active' where user_id = auth.uid();
-- The Edge Function inserts as service_role after verifying the user's token.
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.calsie_job_swipe_decisions(agent_id,user_id,category)
  select id,user_id,category from public.calsie_agents
  where user_id = '11111111-1111-4111-8111-111111111111';
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.calsie_choose_agent('childcare');
    raise exception 'anonymous activation was accepted';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
