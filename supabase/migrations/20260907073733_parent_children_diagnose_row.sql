-- 학부모 자녀 카드 학습진단 행 유지(QA 시트 행 210, Figma 3754-6765).
--
-- 문제: fn_parent_children(sql/73, 20260821000000_baseline.sql)의 서비스 목록은
-- fn_program_access_grants_summary(sql/65).live_count > 0 인 프로그램만 반환한다.
-- 학습진단(program_key='diagnose')은 1회권 소진 후 grant 가 expires_at 지나거나,
-- 애초 grant 없이 무료진단만 받은 자녀(diagnosis_reports 에만 행이 있음)면 목록에서
-- 통째로 사라져 학부모가 리포트 화면에 진입할 방법이 없다. 다른 프로그램(target 등)은
-- 지금 판정을 그대로 둔다 — 이용권이 없으면 서비스 자체가 없던 게 맞다.
--
-- 처방: diagnose 는 다음 중 하나면 서비스 행을 포함한다.
--   (a) 기존과 동일 — live grant(revoked_at is null, 미만료) 있음 → 실제 요약값 그대로.
--   (b) revoked_at is null 인 grant 가 있었음(만료 포함, 즉 취소되지 않은 이력) →
--       "살아있는 회차 0" 값(unlimited_period=false, expires_at=null, quota_total/used/
--       remaining=0)으로 반환. 폴백 상수가 아니라 실제로 남은 게 없다는 사실 값이다.
--   (c) diagnosis_reports(20260902134950)에 이 학생 리포트가 있음(무료진단 등,
--       grant 자체가 없던 경우) → (b)와 같은 0 값으로 반환.
-- fn_program_access_grants_summary 호출 방식과 판정 로직은 그대로 재사용한다
-- (판정 로직 복제 금지 원칙). diagnose 이외 프로그램은 변경 없음. 정렬은 기존처럼
-- programs.sort_order, program_key 기준(diagnose sort_order=5, 자리 변경 없음).

CREATE OR REPLACE FUNCTION "public"."fn_parent_children"() RETURNS TABLE("link_id" "uuid", "student_profile_id" "uuid", "link_status" "text", "linked_at" timestamp with time zone, "student_name" "text", "school_type" "text", "school_name" "text", "services" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_parent uuid := auth.uid();
begin
  if v_parent is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.student_id,
    l.status,
    coalesce(l.responded_at, l.requested_at),
    p.name,
    p.school_type,
    p.school_name,
    case
      -- 수락 전에는 이용 내역을 보여주지 않는다(위 "반환 대상" 참고).
      when l.status <> 'approved' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'program_key',      k.program_key,
                   'program_name',     pr.name,
                   'unlimited_period', case when k.program_key = 'diagnose' and s.live_count = 0 then false
                                             else s.unlimited_period end,
                   'expires_at',       case when k.program_key = 'diagnose' and s.live_count = 0 then null
                                             else s.expires_at end,
                   'quota_total',      case when k.program_key = 'diagnose' and s.live_count = 0 then 0
                                             else s.quota_total end,
                   'quota_used',       case when k.program_key = 'diagnose' and s.live_count = 0 then 0
                                             else s.quota_used end,
                   'remaining',        case when k.program_key = 'diagnose' and s.live_count = 0 then 0
                                             when s.quota_total is null then null
                                             else greatest(s.quota_total - s.quota_used, 0)
                                        end
                 )
                 order by pr.sort_order, k.program_key
               )
          from (
            -- (a) 기존 판정: live grant 가 있는 프로그램(전 프로그램 공통).
            select g.program_key
              from public.program_access_grants g
             where g.profile_id = l.student_id
               and g.revoked_at is null
               and (g.expires_at is null or g.expires_at > now())
            union
            -- (b) 학습진단만: 취소되지 않은 grant 이력이 있었음(만료 포함).
            select 'diagnose'
             where exists (
               select 1
                 from public.program_access_grants g2
                where g2.profile_id = l.student_id
                  and g2.program_key = 'diagnose'
                  and g2.revoked_at is null
             )
            union
            -- (c) 학습진단만: grant 없이도 리포트가 존재(무료진단 등).
            select 'diagnose'
             where exists (
               select 1
                 from public.diagnosis_reports dr
                where dr.profile_id = l.student_id
             )
          ) k
          join public.programs pr on pr.program_key = k.program_key
          cross join lateral public.fn_program_access_grants_summary(l.student_id, k.program_key) s
         where k.program_key = 'diagnose' or s.live_count > 0
      ), '[]'::jsonb)
    end
  from public.parent_child_links l
  join public.profiles p on p.id = l.student_id
  where l.parent_id = v_parent
    and l.status in ('pending', 'approved')
  order by coalesce(l.responded_at, l.requested_at) desc;
end;
$$;

COMMENT ON FUNCTION "public"."fn_parent_children"() IS '학부모 마이페이지 자녀 목록(sql/73, 20260907 diagnose 행 보강). profiles_select_own 때문에 학부모가 자녀 프로필을 못 읽는 문제를 RLS 완화 대신 이 함수로 좁게 푼다 — 연결된(pending/approved) 자녀의 이름·학교·서비스 요약만 돌려준다. 서비스 요약은 fn_program_access_grants_summary(sql/65)를 그대로 호출한다(판정 로직 복제 금지). 학습진단(diagnose)만 예외로, live grant 가 없어도 취소되지 않은 grant 이력이나 diagnosis_reports 행이 있으면 0 값 서비스 행을 반환한다(QA 시트 행 210 — 학부모가 리포트 화면에 진입할 수 있어야 함). pending 링크는 services 가 빈 배열이다. 표시 카피는 만들지 않는다 — 프런트가 조립한다.';
