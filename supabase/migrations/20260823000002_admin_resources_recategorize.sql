-- ---------------------------------------------------------------------
-- 어드민 메뉴 재편 — admin_resources(권한 마스터)를 새 대분류에 맞춘다.
--
-- 배경
--   노션 「관리자 페이지 > 메뉴 및 기능 정리」 기획표(2026-08-22 확정분)대로
--   사이드바 대분류를 다시 묶었다(src/pages/Admin.tsx 의 MENU_GROUPS).
--     - 구 「게시판 관리」 해체 → 입시정보 관리 + 고객안내 관리
--     - 구 「위닝관리」·「프로그램 관리」·「목표관리」 흡수 → 서비스 관리
--     - 구 「관리자 설정」 → 직원관리
--     - 라벨 4개 변경: 멘토 성공전략→멘토스 소개, 대입합격→수시정시합격,
--       대학별 모집요강→대입 모집 요강, (그룹) 관리자 설정→직원관리
--
--   admin_resources 는 그 메뉴 구성의 사본이다(정본은 코드 —
--   20260822000010_admin_permissions 상단 주석). 권한 화면(AdminRolesAdmin /
--   AdminMembersAdmin)이 group_title 로 묶어 그리므로, 사이드바만 바꾸고 여기를
--   두면 권한 화면에는 옛 대분류가 계속 뜬다.
--
--   ⚠️ 화면·섹션 키·라우트는 그대로다. key 는 하나도 바뀌지 않으므로 기존
--      권한 행(admin_role_permissions / admin_member_permissions)은 전부 유효하다.
--      바뀌는 것은 group_title · label · sort_order 뿐이다.
-- ---------------------------------------------------------------------

-- 1) 메뉴 마스터를 새 구성으로 덮어쓴다. 키가 이미 다 있으므로 사실상 update 지만,
--    20260822000010 과 같은 insert…on conflict 형태를 유지한다(누락 키 자가 복구).
insert into public.admin_resources (key, group_title, label, sort_order) values
  ('popups',                          '메인화면 관리',  '팝업 관리',            110),
  ('banners',                         '메인화면 관리',  '메인 배너 관리',        120),
  ('sideBanners',                     '메인화면 관리',  '우측 소형 배너',        130),
  ('universityAcceptances',           '메인화면 관리',  '합격생 대학 관리',      140),
  ('programCategories',               '메인화면 관리',  '핵심 서비스',          150),
  ('mentorStrategies',                '메인화면 관리',  '멘토스 소개',          160),

  ('admissionGuidelines',             '입시정보 관리',  '대입 모집 요강',        210),
  ('admissionUniversities',           '입시정보 관리',  '대학 목록 관리',        220),
  ('admissionSusiJungsi',             '입시정보 관리',  '수시정시합격',          230),
  ('acceptanceRates',                 '입시정보 관리',  '연도별 합격률',         232),
  ('admissionCaseLogos',              '입시정보 관리',  '대학 로고',            234),
  ('specialHighschool',               '입시정보 관리',  '특목고합격',           240),
  ('specialHighschoolRates',          '입시정보 관리',  '특목고 합격률',         242),
  ('admissionResults',                '입시정보 관리',  '입결정보',             250),
  ('trendingDepartments',             '입시정보 관리',  '지금 뜨고 있는 학과',    260),
  ('galleries',                       '입시정보 관리',  '교육칼럼',             270),

  ('companyNews',                     '고객안내 관리',  '회사소식',             310),
  ('notices',                         '고객안내 관리',  '공지사항',             320),
  ('faqs',                            '고객안내 관리',  '자주하는질문',          330),
  ('pageContents',                    '고객안내 관리',  '세부 페이지 관리',       340),

  ('learningDiagnosis',               '서비스 관리',    '학습진단 관리',         410),
  ('learningDiagnosisV2SurveyCopy',   '서비스 관리',    '학습진단(ver2) 문항 문구', 420),
  ('goalUniversityCuts',              '서비스 관리',    '목표관리 — 대학 컷',     430),
  ('goalStudents',                    '서비스 관리',    '목표관리 — 학생 현황',   440),
  ('premiumBookPages',                '서비스 관리',    '프리미엄 책자 관리',      450),
  ('premiumConsults',                 '서비스 관리',    '프리미엄 상담 신청',      460),
  ('mentorApplications',              '서비스 관리',    '멘토 신청 내역',        470),
  ('mentorApplyFaqs',                 '서비스 관리',    '멘토신청 FAQ',         480),
  ('mentorApplyCopy',                 '서비스 관리',    '멘토신청 문구',         490),
  ('winningBaseData',                 '서비스 관리',    '기초데이터추출',         500),
  ('winningDbInputs',                 '서비스 관리',    '위닝DB입력',           510),
  ('winningSuhaengTopicDb',           '서비스 관리',    '위닝 수행 주제 DB',      520),
  ('winningSuhaengResourceDb',        '서비스 관리',    '위닝 수행 자료 DB',      530),
  ('winningSetukDb',                  '서비스 관리',    '위닝 세특 DB',         540),
  ('winningDeepReportDb',             '서비스 관리',    '위닝 심화보고서 DB',     550),
  ('winningStudentRecordDb',          '서비스 관리',    '위닝 생기부 DB',        560),
  ('dailyEntries',                    '서비스 관리',    '일일 입장',            570),
  ('usageStatus',                     '서비스 관리',    '이용 현황',            580),

  ('members',                         '회원관리',       '회원 목록',            610),

  ('enrollments',                     '매출·결제관리',  '수강 신청 내역',        710),
  ('payments',                        '매출·결제관리',  '매출 조정',            720),
  ('settlements',                     '매출·결제관리',  '매출 정산',            730),
  ('dailySettlements',                '매출·결제관리',  '일일정산',             740),
  ('refunds',                         '매출·결제관리',  '환불 수기 대장',        750),
  ('refundRequests',                  '매출·결제관리',  '환불 신청 내역',        760),
  ('coupons',                         '매출·결제관리',  '쿠폰관리',             770),

  ('adminMembers',                    '직원관리',       '관리자 관리',           810),
  ('adminRoles',                      '직원관리',       '관리자 권한 관리',       820)
on conflict (key) do update
  set group_title = excluded.group_title,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      is_active   = true;


-- 2) 옛 대분류가 남아 있지 않은지 확인. 키를 하나도 지우지 않았으므로 남아 있다면
--    코드(ADMIN_SECTION_KEYS)에 없는 유령 항목이라는 뜻이라, 조용히 넘기지 않는다.
do $$
declare
  stale text;
begin
  select string_agg(distinct group_title, ', ')
    into stale
    from public.admin_resources
   where group_title not in ('메인화면 관리', '입시정보 관리', '고객안내 관리',
                             '서비스 관리', '회원관리', '매출·결제관리', '직원관리');

  if stale is not null then
    raise exception 'admin_resources 에 옛 대분류가 남아 있습니다: % — 위 시드에서 빠진 키가 있는지 확인하세요.', stale;
  end if;
end $$;


-- 3) 「실무 관리자」 묶음 권한을 새 대분류 기준으로 다시 맞춘다.
--    원래 규칙(20260822000010 9-b)은 그대로다 — 회원 정보는 읽기 전용,
--    매출·결제와 직원관리는 접근 불가(항목 없음 = 규칙 3), 나머지는 edit.
--
--    ⚠️ 재편 때문에 실질 권한이 바뀌는 메뉴 2개 (의도된 변경):
--      - enrollments(수강 신청 내역) : 회원 관리 view → 매출·결제관리 접근 불가.
--        납부상태·수강료·감면액을 담은 결제 원장이라 매출 쪽 취급을 따른다.
--      - mentorApplications(멘토 신청 내역) : 회원 관리 view → 서비스 관리 edit.
--        승인·반려 처리가 목적인 화면이라 읽기 전용으로는 쓸 수 없다.
delete from public.admin_role_permissions p
 using public.admin_roles r, public.admin_resources res
 where p.role_id = r.id
   and r.name = '실무 관리자'
   and res.key = p.resource_key
   and res.group_title in ('매출·결제관리', '직원관리');

insert into public.admin_role_permissions (role_id, resource_key, level)
select r.id, res.key,
       case when res.group_title = '회원관리' then 'view' else 'edit' end
  from public.admin_roles r
  cross join public.admin_resources res
 where r.name = '실무 관리자'
   and res.group_title in ('메인화면 관리', '입시정보 관리', '고객안내 관리',
                           '서비스 관리', '회원관리')
on conflict (role_id, resource_key) do update set level = excluded.level;

comment on table public.admin_resources is
  '권한을 걸 수 있는 어드민 메뉴 마스터(20260823000002_admin_resources_recategorize 로 대분류 재편). key 는 ADMIN_SECTION_KEYS 와 같은 문자열이어야 한다 — 코드가 정본이고 이 테이블은 그 사본이다. 어긋나면 화면은 있는데 권한을 못 주거나(키 누락) 권한 화면에 유령 항목이 뜬다(키 잔존).';


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 대분류 7개 · 47행이 맞는지.
-- select group_title, count(*) from public.admin_resources
--  group by 1 order by min(sort_order);
--
-- 2) 실무 관리자의 최종 권한 — 매출·결제관리와 직원관리가 안 나와야 정상.
-- select res.group_title, res.label, p.level
--   from public.admin_role_permissions p
--   join public.admin_roles r   on r.id = p.role_id
--   join public.admin_resources res on res.key = p.resource_key
--  where r.name = '실무 관리자' order by res.sort_order;
