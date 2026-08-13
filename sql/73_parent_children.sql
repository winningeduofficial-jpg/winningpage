-- =====================================================================
-- 73_parent_children.sql — 학부모 자녀 목록 조회 RPC
--
-- 배경
--   학부모 마이페이지 "자녀 등록 및 수정" 탭(Figma 3636:104)은 자녀 카드에
--   이름 · 학교 · 이용 중인 서비스 요약을 보여준다. 그런데 클라이언트에서
--   그 데이터를 모을 방법이 없다:
--
--     · profiles_select_own (sql/00) — 학부모는 자녀의 profiles 행을 읽을 수
--       없다. 이름도 학교도 안 나온다.
--     · program_access_select_own (sql/00) — 자녀의 이용 권한도 못 읽는다.
--     · fn_program_access_grants_summary (sql/65) — service_role 전용.
--
--   parent_child_links 만 "party read"(sql/40)로 열려 있어 학부모가 읽을 수
--   있는 것은 링크 행(상대 uuid, 상태, 날짜)뿐이다. 즉 화면을 그리려면
--   uuid 옆에 이름 대신 uuid 를 쓰는 수밖에 없었다.
--
--   이 파일이 그 구멍을 SECURITY DEFINER RPC 하나로 메운다. RLS 를 느슨하게
--   푸는 대신(=자녀 프로필을 학부모 전체에 열어주는 대신) **연결된 자녀의,
--   화면에 필요한 필드만** 함수가 골라 돌려준다.
--
-- 노출 범위 결정
--   이름 전체를 돌려준다(마스킹하지 않는다). 근거 — api/lookup-child.js 가
--   이미 연결코드 입력만으로 학부모에게 자녀의 이름과 학교를 보여준다(연결
--   *전* 단계인데도). 연결이 승인된 뒤에 그보다 좁게 가릴 이유가 없다.
--   시안 3636:104 는 '김O원'으로 마스킹돼 있으나 같은 화면의 다른 리비전
--   (3360:10499)은 '김주원'으로 그려져 있어 시안 자체가 일관되지 않다 —
--   기능 판단으로 전체 노출을 택했고, 마스킹이 정책이면 프런트에서 가리는
--   것이 아니라 이 함수의 반환을 바꿔야 한다.
--
-- 반환 대상
--   status in ('pending','approved') 인 링크만. revoked/rejected 는 목록에서
--   사라져야 한다(삭제하기 = revoke_parent_link, sql/40).
--   pending 은 카드에 '수락대기' 배지로 뜨고 서비스 요약은 비운다 — 아직
--   자녀가 수락하지 않았으므로 이용 내역을 보여줄 근거가 없다.
--
-- 서비스 요약
--   판정 로직을 복제하지 않는다(sql/65 원칙). 살아있는 부여가 있는
--   program_key 를 추린 뒤 각각 fn_program_access_grants_summary 를 호출해
--   그 반환을 그대로 싣는다. 이 함수는 service_role 전용이지만, SECURITY
--   DEFINER 인 이 함수가 소유자 권한으로 실행되므로 호출할 수 있다.
--
--   services 원소:
--     { program_key, program_name, unlimited_period, expires_at,
--       quota_total, quota_used, remaining }
--   remaining 은 quota_total 이 있을 때만 채운다(회차권). 기간권은
--   expires_at 으로 표시한다. 화면 문구(예: '이용중 ~2027.02.28' /
--   '잔여 2회')는 프런트가 만든다 — 표시 카피를 DB 에 박지 않는다.
-- =====================================================================

create or replace function public.fn_parent_children()
returns table (
  link_id            uuid,
  student_profile_id uuid,
  link_status        text,
  linked_at          timestamptz,
  student_name       text,
  school_type        text,
  school_name        text,
  services           jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
                   'unlimited_period', s.unlimited_period,
                   'expires_at',       s.expires_at,
                   'quota_total',      s.quota_total,
                   'quota_used',       s.quota_used,
                   'remaining',        case
                                         when s.quota_total is null then null
                                         else greatest(s.quota_total - s.quota_used, 0)
                                       end
                 )
                 order by pr.sort_order, k.program_key
               )
          from (
            select distinct g.program_key
              from public.program_access_grants g
             where g.profile_id = l.student_id
               and g.revoked_at is null
               and (g.expires_at is null or g.expires_at > now())
          ) k
          join public.programs pr on pr.program_key = k.program_key
          cross join lateral public.fn_program_access_grants_summary(l.student_id, k.program_key) s
         where s.live_count > 0
      ), '[]'::jsonb)
    end
  from public.parent_child_links l
  join public.profiles p on p.id = l.student_id
  where l.parent_id = v_parent
    and l.status in ('pending', 'approved')
  order by coalesce(l.responded_at, l.requested_at) desc;
end;
$$;

comment on function public.fn_parent_children() is
  '학부모 마이페이지 자녀 목록(sql/73). profiles_select_own 때문에 학부모가 자녀 프로필을 못 읽는 문제를 RLS 완화 대신 이 함수로 좁게 푼다 — 연결된(pending/approved) 자녀의 이름·학교·서비스 요약만 돌려준다. 서비스 요약은 fn_program_access_grants_summary(sql/65)를 그대로 호출한다(판정 로직 복제 금지). pending 링크는 services 가 빈 배열이다. 표시 카피는 만들지 않는다 — 프런트가 조립한다.';

revoke all on function public.fn_parent_children() from public, anon;
grant execute on function public.fn_parent_children() to authenticated;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 학부모 세션에서:
--   select * from public.fn_parent_children();
--
-- 기대 — 연결된 자녀 1행, services 는 결제·부여가 없으면 '[]'.
-- 학생 세션에서 호출하면 0행이어야 한다(그 사람은 누구의 parent 도 아니므로).
-- 비로그인(anon)은 실행 권한 자체가 없다.
--
-- select proname, pg_get_function_identity_arguments(oid), proacl
--   from pg_proc where proname = 'fn_parent_children';
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev 적용: (미적용 — 적용 후 이 줄에 날짜를 남길 것)
