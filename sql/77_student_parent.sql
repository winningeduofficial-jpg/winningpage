-- =====================================================================
-- 77_student_parent.sql — 학생이 연결된 학부모를 조회하는 RPC
--
-- 배경
--   학생 "신청 상세 내역"(Figma 3967:3571)은 결제담당을 "이혜진 학부모님"으로
--   보여준다. 그런데 학생은 학부모의 이름을 읽을 수 없다 —
--   profiles_select_own(sql/00)이 본인 행만 열어 준다. parent_child_links 는
--   "party read"(sql/40)로 열려 있어 상대의 **uuid** 는 알 수 있지만 이름은
--   아니다. 그래서 화면이 지금 일반 라벨("학부모님")로 떨어지고 있다.
--
--   fn_parent_children(sql/73)의 반대 방향이다. 그쪽은 학부모가 자녀들을 보고,
--   이쪽은 학생이 자기 학부모를 본다. RLS 를 푸는 대신(=학부모 프로필을 학생
--   전체에 여는 대신) 필요한 필드만 SECURITY DEFINER 함수가 골라 돌려준다.
--
-- 반환 범위
--   status in ('pending','approved') 인 링크만. 학생:학부모 = 1:1 이 제품
--   규칙이므로(sql/40 getApprovedParentLink 주석) 최대 1행이지만, 과거 요청이
--   남아 있을 수 있어 approved 를 우선 정렬해 첫 행을 쓰게 한다.
--
--   이름만 돌려준다. 학부모의 이메일·휴대폰은 화면이 요구하지 않으므로 열지
--   않는다 — 필요해질 때 그 필드만 추가하는 편이 안전하다.
-- =====================================================================

create or replace function public.fn_student_parent()
returns table (
  link_id           uuid,
  parent_profile_id uuid,
  link_status       text,
  linked_at         timestamptz,
  parent_name       text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid := auth.uid();
begin
  if v_student is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.parent_id,
    l.status,
    coalesce(l.responded_at, l.requested_at),
    p.name
  from public.parent_child_links l
  join public.profiles p on p.id = l.parent_id
  where l.student_id = v_student
    and l.status in ('pending', 'approved')
  -- approved 를 먼저 — 화면은 첫 행만 쓴다.
  order by (l.status = 'approved') desc, coalesce(l.responded_at, l.requested_at) desc;
end;
$$;

comment on function public.fn_student_parent() is
  '학생이 연결된 학부모를 조회한다(sql/77). fn_parent_children(sql/73)의 반대 방향 — profiles_select_own 때문에 학생이 학부모 이름을 못 읽는 문제를 RLS 완화 대신 이 함수로 좁게 푼다. pending/approved 링크만, 이름만 돌려준다. 학생 "신청 상세 내역"(3967:3571)의 결제담당 표시가 유일한 호출부다.';

revoke all on function public.fn_student_parent() from public, anon;
grant execute on function public.fn_student_parent() to authenticated;


-- =====================================================================
-- 확인용
-- =====================================================================
-- 학생 세션:  select * from public.fn_student_parent();   -- 1행(학부모 이름)
-- 학부모 세션: select * from public.fn_student_parent();  -- 0행(그는 학생이 아니다)
-- =====================================================================
--
-- 적용 이력
-- =====================================================================
-- dev 적용: (미적용 — 적용 후 이 줄에 날짜를 남길 것)
