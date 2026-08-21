-- 학습진단 유료 게이팅(이용 요금 구조 최종본 20260806) — 회원가입 시 1회 무료,
-- 이후 이용권 회차 소진.
--
-- 소비 원장은 새로 만들지 않고 performance_credit_ledger 를 재사용한다.
-- fn_program_access_grants_summary(회차 요약)·fn_program_access_state(입장 판정)·
-- fn_order_consumption_state(환불 소비 판정)가 전부 이 원장 하나를 정본으로
-- 재계산하므로, 진단 소비도 여기에 적재해야 기존 판정·환불 게이트·어드민 표시가
-- 전부 추가 배선 없이 맞는다. source_kind 확장은 'mentor_call_booking' 이 이미 낸
-- 길과 같다(session_id NULL 형태 — performance_credit_ledger_session_id_shape_check
-- 가 이미 허용한다).
alter table public.performance_credit_ledger
  drop constraint performance_credit_ledger_source_kind_check;
alter table public.performance_credit_ledger
  add constraint performance_credit_ledger_source_kind_check
  check (source_kind = any (array[
    'performance_session'::text,
    'mentor_call_booking'::text,
    'diagnosis_attempt'::text
  ]));

-- 진단 시도 기록 — 무료 1회 판정(kind='free')과 회차 소진(kind='credit')의 멱등 키.
-- id 는 클라이언트가 제출 직전에 만드는 attempt uuid 다. 진단에는 수행평가 세션 같은
-- 서버 선행 엔티티가 없어(설문 응답은 sessionStorage 에만 있다), 더블클릭·네트워크
-- 재시도 멱등을 이 pk 하나로 잡는다 — consume_performance_credit 의
-- UNIQUE(session_id) 와 같은 역할이다.
create table public.diagnosis_attempts (
  id uuid primary key,
  profile_id uuid not null,
  kind text not null check (kind in ('free', 'credit')),
  ledger_id uuid references public.performance_credit_ledger(id),
  reason text,
  created_at timestamptz not null default now(),
  constraint diagnosis_attempts_credit_needs_ledger
    check (kind <> 'credit' or ledger_id is not null)
);

comment on table public.diagnosis_attempts is
  '학습진단 제출 시도 원장. kind=free 는 회원가입 1회 무료분(프로필당 1행, 부분 유니크), kind=credit 은 이용권 차감분(performance_credit_ledger 행과 1:1). id 는 클라이언트 생성 attempt uuid — consume_diagnosis_attempt 의 멱등 키.';

-- 무료 1회는 프로필당 한 번만.
create unique index diagnosis_attempts_free_once
  on public.diagnosis_attempts (profile_id)
  where kind = 'free';
create index diagnosis_attempts_profile_idx
  on public.diagnosis_attempts (profile_id);

alter table public.diagnosis_attempts enable row level security;

-- 본인 조회만. 쓰기 정책은 만들지 않는다 — 적재는 consume_diagnosis_attempt
-- (SECURITY DEFINER, service_role 전용) 경유만 허용한다.
create policy "diagnosis_attempts self read"
  on public.diagnosis_attempts for select
  using (profile_id = auth.uid());

grant select on public.diagnosis_attempts to authenticated;
grant all on public.diagnosis_attempts to service_role;

-- 회차 차감 — consume_performance_credit(sql/65) 미러. 차이 두 가지:
--   1) 무료 1회 선판정 — free 미사용이면 부여가 없어도 이번 제출을 무료로 기록하고
--      끝낸다(원장 미적재 — 무료분은 회차가 아니다).
--   2) 멱등 키가 세션이 아니라 attempt id(diagnosis_attempts pk)다.
-- 잠금은 같은 salt(101)·프로필 단위 — 부여·회수(sql/64)·수행평가 차감과 잠금 순서를
-- 공유해 데드락을 피하고, 같은 사용자의 동시 제출을 직렬화한다.
create or replace function public.consume_diagnosis_attempt(
  "p_attempt_id" uuid,
  "p_profile_id" uuid,
  "p_reason" text default 'diagnosis:survey-submit'
) returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c_program_key constant text := 'diagnose';

  v_existing    public.diagnosis_attempts;
  v_summary     record;
  v_access      public.program_access;
  v_grant       record;
  v_selected_id uuid;
  v_live_count  int := 0;
  v_ever_exists boolean;
  v_consumed    int;
  v_ledger_id   uuid;
  v_free_used   boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text, 101));

  -- 멱등: 같은 attempt id 재호출은 무엇도 다시 차감하지 않는다.
  select * into v_existing
    from public.diagnosis_attempts a
   where a.id = p_attempt_id;

  if found then
    if v_existing.profile_id <> p_profile_id then
      -- 남의 attempt id 재사용 — 기록하지 않고 거부만 한다.
      return jsonb_build_object(
        'status', 'attempt_conflict', 'charged', false, 'kind', null,
        'free_available', null, 'quota_total', null, 'quota_used', null,
        'quota_remaining', null, 'plan_ends_at', null, 'program_key', c_program_key
      );
    end if;

    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'already_recorded', 'charged', false, 'kind', v_existing.kind,
      'free_available', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', case when v_summary.quota_total is null then null
                              else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
      'plan_ends_at', v_summary.expires_at, 'program_key', c_program_key
    );
  end if;

  -- 1) 무료 1회 — 아직 안 썼으면 이번 제출이 무료분이다. 부여 유무와 무관.
  select exists (
    select 1 from public.diagnosis_attempts a
     where a.profile_id = p_profile_id and a.kind = 'free'
  ) into v_free_used;

  if not v_free_used then
    insert into public.diagnosis_attempts (id, profile_id, kind, reason)
    values (
      p_attempt_id, p_profile_id, 'free',
      coalesce(nullif(btrim(p_reason), ''), 'diagnosis:survey-submit')
    );

    return jsonb_build_object(
      'status', 'free_used', 'charged', false, 'kind', 'free',
      'free_available', false,
      'quota_total', null, 'quota_used', null, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  -- 2) 운영자 제재만 program_access 캐시에서 읽는다(consume_performance_credit
  --    4)절과 동일) — 기간·회차는 원장에서만 판정한다.
  select * into v_access
    from public.program_access
   where id = p_profile_id and program_key = c_program_key;

  if found and v_access.access_status = 'suspended' then
    return jsonb_build_object(
      'status', 'entitlement_expired', 'charged', false, 'kind', null,
      'free_available', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  -- 3) 살아있고 만료되지 않은 부여를 소비 순서로 잠근다(consume_performance_credit
  --    5)절 미러 — 만료 임박 우선, 매 호출 잠금 폭 동일 유지).
  v_selected_id := null;
  for v_grant in
    select g.id, g.granted_sessions
      from public.program_access_grants g
     where g.profile_id  = p_profile_id
       and g.program_key = c_program_key
       and g.revoked_at is null
       and (g.expires_at is null or g.expires_at > now())
     order by g.expires_at asc nulls last, g.starts_at asc, g.created_at asc, g.id asc
       for update
  loop
    v_live_count := v_live_count + 1;

    if v_selected_id is not null then
      continue;
    end if;

    if v_grant.granted_sessions is null then
      v_selected_id := v_grant.id;   -- 무제한 부여. 즉시 채택.
      continue;
    end if;

    select coalesce(sum(-l.delta), 0) into v_consumed
      from public.performance_credit_ledger l
     where l.grant_id = v_grant.id;

    if v_grant.granted_sessions - v_consumed > 0 then
      v_selected_id := v_grant.id;
    end if;
  end loop;

  if v_live_count = 0 then
    select exists (
      select 1 from public.program_access_grants g
       where g.profile_id = p_profile_id and g.program_key = c_program_key
    ) into v_ever_exists;

    return jsonb_build_object(
      'status', case when v_ever_exists then 'entitlement_expired' else 'no_entitlement' end,
      'charged', false, 'kind', null, 'free_available', false,
      'quota_total', null, 'quota_used', 0, 'quota_remaining', null,
      'plan_ends_at', null, 'program_key', c_program_key
    );
  end if;

  if v_selected_id is null then
    select * into v_summary
      from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

    return jsonb_build_object(
      'status', 'quota_exhausted', 'charged', false, 'kind', null,
      'free_available', false,
      'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
      'quota_remaining', 0, 'plan_ends_at', v_summary.expires_at,
      'program_key', c_program_key
    );
  end if;

  -- 4) 차감 성립 = 원장 INSERT + 시도 기록 INSERT. attempt pk 가 멱등을 이미
  --    보장하고(위 재조회), advisory lock 이 동시 제출을 직렬화하므로 여기서의
  --    경합 재방어는 필요 없다.
  insert into public.performance_credit_ledger
    (profile_id, grant_id, delta, reason, source_kind)
  values (
    p_profile_id, v_selected_id, -1,
    coalesce(nullif(btrim(p_reason), ''), 'diagnosis:survey-submit'),
    'diagnosis_attempt'
  )
  returning id into v_ledger_id;

  insert into public.diagnosis_attempts (id, profile_id, kind, ledger_id, reason)
  values (
    p_attempt_id, p_profile_id, 'credit', v_ledger_id,
    coalesce(nullif(btrim(p_reason), ''), 'diagnosis:survey-submit')
  );

  select * into v_summary
    from public.fn_program_access_grants_summary(p_profile_id, c_program_key);

  return jsonb_build_object(
    'status', 'charged', 'charged', true, 'kind', 'credit',
    'free_available', false,
    'quota_total', v_summary.quota_total, 'quota_used', v_summary.quota_used,
    'quota_remaining', case when v_summary.quota_total is null then null
                            else greatest(v_summary.quota_total - v_summary.quota_used, 0) end,
    'plan_ends_at', v_summary.expires_at, 'program_key', c_program_key
  );
end;
$$;

comment on function public.consume_diagnosis_attempt(uuid, uuid, text) is
  '학습진단 제출 1건 판정·기록. 무료 1회 미사용이면 free 기록(원장 미적재), 사용했으면 diagnose 부여에서 회차 1개 차감(performance_credit_ledger source_kind=diagnosis_attempt). 멱등 키는 p_attempt_id(diagnosis_attempts pk). status 어휘: free_used/charged/already_recorded/no_entitlement/entitlement_expired/quota_exhausted/attempt_conflict. 잠금은 consume_performance_credit 과 같은 advisory(101, 프로필 단위).';

revoke all on function public.consume_diagnosis_attempt(uuid, uuid, text) from public;
grant all on function public.consume_diagnosis_attempt(uuid, uuid, text) to service_role;
