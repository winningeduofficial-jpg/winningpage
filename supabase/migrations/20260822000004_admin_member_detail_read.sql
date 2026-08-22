-- 회원 상세(고객조회) 화면의 「이용서비스」 탭이 읽어야 하는 program_access 에
-- 어드민 SELECT 정책을 연다.
--
-- 왜 program_access 뿐인가 — 실측으로 좁힌 결과다
--   회원 상세는 profiles / parent_child_links / program_access / orders 를 함께
--   읽는다. 이 중 어드민이 남의 행을 못 읽는 테이블은 program_access 하나뿐이었다:
--
--     orders             (auth.uid() = student_profile_id) OR (= parent_profile_id) OR is_admin()
--     order_items        위 orders 를 EXISTS 로 경유 — 같은 is_admin() 분기 포함
--     parent_child_links (parent_id = auth.uid()) OR (student_id = auth.uid()) OR is_winning_admin()
--     program_access     (auth.uid() = id)                    ← 어드민 경로가 없다
--
--   정책 "이름"만 보면 셋 다 select-own 처럼 보이지만(orders select own /
--   order_items select own / parent_child_links party read), 조건에는 이미
--   어드민 분기가 들어 있다. 그래서 그 셋에는 아무것도 추가하지 않는다 —
--   PERMISSIVE 정책은 OR 로 합쳐지므로 덧붙여봐야 중복일 뿐이다.
--
-- 왜 is_admin() 이 아니라 fn_admin_can() 인가
--   20260822000003 이 도입한 권한 체계를 화면뿐 아니라 데이터 층에서도 쓰기
--   위해서다. 어드민 화면은 브라우저에서 supabase-js 로 테이블을 직접 읽으므로,
--   술어가 is_admin() 이면 "메뉴는 숨겼는데 REST 로는 읽힌다"가 된다.
--   도입 시점의 기존 관리자는 전원 최고 관리자라(9-c절) 보이는 것은 달라지지 않는다.
--
--   자원 키를 members 로 잡은 이유: program_access 는 금액이 아니라 "누가 무슨
--   서비스를 언제까지 쓸 수 있는가"라 회원 정보 축에 가깝다.
--
-- ⚠️ 남은 불일치 — orders / order_items / parent_child_links 는 여전히
--   is_admin() · is_winning_admin() 기준이라, 매출 접근 불가로 설정된 관리자도
--   REST 로 직접 부르면 결제 데이터를 읽을 수 있다. 이걸 fn_admin_can 으로
--   통일하려면 기존 정책을 **교체**해야 하는데, 그 정책들은 이 화면 밖의
--   마이페이지·환불 관리 등도 함께 쓰고 있어 범위가 다르다. 어드민 쓰기 경로를
--   api/ 라우트로 옮기는 후속 작업에서 한꺼번에 정리한다.
--
-- 쓰기는 열지 않는다. 이 화면은 조회 전용이다.

drop policy if exists "program_access admin select" on public.program_access;
create policy "program_access admin select" on public.program_access
  as permissive for select to authenticated
  using (public.fn_admin_can('members', 'view'));

comment on policy "program_access admin select" on public.program_access is
  '회원 상세 이용서비스 탭(20260822000004). 기존 정책이 program_access_select_own(auth.uid() = id) 뿐이라 어드민이 남의 이용권을 에러가 아니라 0행으로 보게 되던 것을 연다. 술어가 is_admin()이 아니라 fn_admin_can(''members'',''view'')인 이유는 파일 상단 주석 참고.';
