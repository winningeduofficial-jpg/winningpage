-- 관리자 권한 체계 — 스키마 + 판정 함수
--
-- 무엇을 만드는가
--   기획 문서(「관리자 권한 체계 안내」)의 1~2단계 = 권한 항목 / 권한 묶음 /
--   개별 권한과 그 합산 규칙을 DB에 앉힌다.
--
--   지금까지 관리자 판정 축은 profiles.role='admin' 하나뿐이었다. CHECK 가
--   ('user','admin') 두 값만 허용하므로 is_winning_admin() 이 들고 있는
--   admin_basic/admin_manager/admin_master 3종은 DB 에 존재할 수 없는 사문이다
--   — 즉 실질 권한은 "어드민이냐 아니냐" 2단계였고 메뉴 단위 권한 개념이
--   없었다. 이 마이그레이션이 그 자리를 만든다.
--
-- ⚠️ 이름 주의 — 구 sql/ 체계에서 지웠던 admin_* 고아 테이블과 다른 것이다.
--   그쪽은 무접두어 짝(banners ↔ admin_banners)이 있는 **중복 도메인
--   테이블**이라 고아가 됐다. 여기 5개는 짝이 없는 신규 권한 도메인이며,
--   삭제 대상이 아니다. 6개월 뒤 "admin_ 로 시작하니 또 고아겠지"로
--   오해하지 않도록 남긴다.
--
-- 왜 「관리자 그룹」(사람 묶음)이 없는가
--   기획 문서는 5단(항목→묶음→그룹→개별→최종)인데 이 파일은 그룹을 빼고
--   4단으로 만든다. 팀원 5명 규모에서 그룹은 구성원이 1~2명씩이라 묶는
--   실익이 없고, 최종 권한의 출처가 3곳이 되면 "왜 이 메뉴가 안 보이지"를
--   추적하기 어려워진다. **나중에 추가할 때 이 파일을 고칠 필요가 없도록**
--   설계했다 — admin_groups / admin_group_roles / admin_member_groups 3개를
--   덧붙이고 fn_admin_effective_permissions 의 union 에 한 갈래만 더하면 된다.
--
-- 접근 수준 3종 (기획 문서와 같은 어휘)
--   edit  수정 가능 : 보기·만들기·고치기·지우기
--   view  읽기 전용 : 보기만
--   none  접근 불가 : 메뉴가 화면에 보이지 않음
--
-- 합산 규칙 (기획 문서 3줄 그대로)
--   1. none 이 하나라도 명시돼 있으면 그 메뉴는 무조건 잠긴다(deny-wins).
--   2. none 이 없으면 받은 항목 중 가장 높은 수준이 적용된다(edit > view).
--   3. 아무 항목도 없는 메뉴는 접근 불가다(default deny).
--
-- SQLSTATE 배정 (기존 WC001~WC058 뒤를 잇는다)
--   WC059  last_super_admin_protected  최고 관리자가 1명뿐일 때 그 사람을
--                                       강등·정지하려 함(전원 잠김 사고 방지).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) admin_resources : 권한을 걸 수 있는 메뉴 목록
--
--    키는 src/pages/admin/adminSectionKeys.ts 의 ADMIN_SECTION_KEYS 와
--    **1:1로 같은 문자열**이다. 새로 지어내지 않는다 — 그래야 화면을 추가할
--    때 권한 항목이 저절로 따라온다. group_title 은 Admin.tsx 의 MENU_GROUPS
--    대분류 제목이고, 권한 화면의 트리 표시에만 쓴다(판정에는 안 쓴다).
-- ---------------------------------------------------------------------
create table if not exists public.admin_resources (
  key         text primary key,
  group_title text not null,
  label       text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.admin_resources is
  '권한을 걸 수 있는 어드민 메뉴 마스터(20260822000003_admin_permissions). key 는 ADMIN_SECTION_KEYS 와 같은 문자열이어야 한다 — 코드가 정본이고 이 테이블은 그 사본이다. 어긋나면 화면은 있는데 권한을 못 주거나(키 누락) 권한 화면에 유령 항목이 뜬다(키 잔존).';


-- ---------------------------------------------------------------------
-- 2) admin_roles : 권한 묶음
--
--    is_super = 최고 관리자 묶음. 별도 장치가 아니라 "이 묶음을 받았다"는
--    사실 자체가 최고 관리자라는 지위다(기획 문서와 동일). 그래서 super 는
--    admin_role_permissions 에 항목을 넣지 않는다 — 판정 함수가 전 메뉴
--    edit 으로 단락(short-circuit)시킨다. 메뉴가 새로 생겨도 최고 관리자는
--    자동으로 쓸 수 있어야 하기 때문이다(기획 문서 FAQ).
-- ---------------------------------------------------------------------
create table if not exists public.admin_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  is_super    boolean not null default false,
  -- 시스템 기본 묶음은 UI 에서 삭제 버튼을 감춘다(지우면 복구 수단이 없다).
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 최고 관리자 묶음은 하나뿐이어야 한다. 둘이면 "어느 쪽이 진짜 super 인가"가
-- 생기고, 아래 마지막-1인 보호 로직의 집계 기준이 흔들린다.
create unique index if not exists admin_roles_single_super_idx
  on public.admin_roles ((true)) where is_super;

comment on table public.admin_roles is
  '권한 묶음(20260822000003_admin_permissions). is_super 묶음은 권한 항목을 갖지 않고 판정 함수가 전 메뉴 edit 으로 단락시킨다 — 새 메뉴가 추가돼도 최고 관리자는 자동 사용 가능해야 하므로.';


-- ---------------------------------------------------------------------
-- 3) admin_role_permissions : 권한 항목(묶음이 주는 것)
-- ---------------------------------------------------------------------
create table if not exists public.admin_role_permissions (
  role_id      uuid not null references public.admin_roles (id) on delete cascade,
  resource_key text not null references public.admin_resources (key) on delete cascade,
  level        text not null,
  constraint admin_role_permissions_pkey primary key (role_id, resource_key),
  constraint admin_role_permissions_level_check check (level in ('edit', 'view', 'none'))
);


-- ---------------------------------------------------------------------
-- 4) admin_members : 직원(= 어드민 계정)
--
--    profiles 를 대체하지 않는다. "이 회원은 직원이다"라는 사실과 부서·상태·
--    초대 이력만 이 테이블이 진다. 이름·이메일·연락처는 profiles 가 정본이다
--    (한 사람 정보를 두 군데 두면 sql/61 이 겪은 이원화가 재발한다).
--
--    status
--      invited   초대 메일 발송됨, 아직 활성화 전 → 권한 없음(로그인해도 못 씀)
--      active    정상
--      suspended 정지 — 계정은 남기고 권한만 회수(기획 문서 "계정 비활성화")
-- ---------------------------------------------------------------------
create table if not exists public.admin_members (
  profile_id   uuid primary key references public.profiles (id) on delete cascade,
  role_id      uuid references public.admin_roles (id) on delete restrict,
  department   text,
  status       text not null default 'invited',
  invited_by   uuid references public.profiles (id) on delete set null,
  invited_at   timestamptz not null default now(),
  activated_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint admin_members_status_check check (status in ('invited', 'active', 'suspended'))
);

create index if not exists admin_members_role_idx on public.admin_members (role_id);
create index if not exists admin_members_status_idx on public.admin_members (status);

comment on column public.admin_members.role_id is
  '대표 역할 1개. 클라이언트 요구("이름별로 대표그룹을 설정")의 그 자리다 — 여기서 기본을 주고 admin_member_permissions 로 사람별 예외를 더하거나 뺀다.';


-- ---------------------------------------------------------------------
-- 5) admin_member_permissions : 개별 권한(사람 단위 추가/차단)
--
--    level='none' 이 곧 "차단"이다. 묶음이 준 edit 을 이 한 줄로 덮는다
--    (합산 규칙 1). 반대로 묶음에 없는 메뉴를 여기서 view/edit 으로 더할 수도
--    있다 — 클라이언트가 말한 "개별적으로 부분별 메뉴도 추가 혹은 제외".
-- ---------------------------------------------------------------------
create table if not exists public.admin_member_permissions (
  profile_id   uuid not null references public.admin_members (profile_id) on delete cascade,
  resource_key text not null references public.admin_resources (key) on delete cascade,
  level        text not null,
  granted_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint admin_member_permissions_pkey primary key (profile_id, resource_key),
  constraint admin_member_permissions_level_check check (level in ('edit', 'view', 'none'))
);


-- ---------------------------------------------------------------------
-- 6) 판정 함수
-- ---------------------------------------------------------------------

-- 6-a) 한 사람의 최종 권한 전체. 어드민 화면이 부팅할 때 한 번 읽어
--      메뉴를 그리는 용도이기도 하다(매 화면 조회를 막는다).
create or replace function public.fn_admin_effective_permissions(p_profile_id uuid)
returns table (resource_key text, level text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with member as (
    select m.profile_id, m.role_id, m.status, r.is_super
      from public.admin_members m
      left join public.admin_roles r on r.id = m.role_id
     where m.profile_id = p_profile_id
  ),
  -- 정지·미활성화는 어떤 항목을 갖고 있든 전부 무효다.
  active_member as (
    select * from member where status = 'active'
  ),
  granted as (
    -- 묶음이 준 것
    select rp.resource_key, rp.level
      from active_member am
      join public.admin_role_permissions rp on rp.role_id = am.role_id
     where not coalesce(am.is_super, false)
    union all
    -- 사람에게 직접 준 것
    select mp.resource_key, mp.level
      from active_member am
      join public.admin_member_permissions mp on mp.profile_id = am.profile_id
     where not coalesce(am.is_super, false)
  )
  -- 최고 관리자는 전 메뉴 edit 으로 단락한다(새 메뉴 자동 포함).
  select res.key, 'edit'::text
    from public.admin_resources res, active_member am
   where coalesce(am.is_super, false) and res.is_active
  union all
  select g.resource_key,
         case
           -- 규칙 1: none 이 하나라도 있으면 무조건 잠근다.
           when bool_or(g.level = 'none') then 'none'
           -- 규칙 2: 남은 것 중 가장 높은 수준.
           when bool_or(g.level = 'edit') then 'edit'
           else 'view'
         end
    from granted g
   group by g.resource_key;
$$;

comment on function public.fn_admin_effective_permissions(uuid) is
  '한 사람의 최종 권한(20260822000003_admin_permissions). 규칙은 deny-wins → 최고수준 → default deny. 여기 안 나오는 메뉴는 접근 불가다(규칙 3은 "행이 없음"으로 표현된다).';

revoke all on function public.fn_admin_effective_permissions(uuid) from public, anon;
grant execute on function public.fn_admin_effective_permissions(uuid) to authenticated, service_role;


-- 6-b) 단일 판정. RLS 술어와 api/ 라우트가 쓰는 손잡이다.
--      p_need='view' 는 view/edit 둘 다 통과, p_need='edit' 는 edit 만.
create or replace function public.fn_admin_can(p_resource text, p_need text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.fn_admin_effective_permissions(auth.uid()) p
     where p.resource_key = p_resource
       and (p.level = 'edit' or (p_need = 'view' and p.level = 'view'))
  );
$$;

revoke all on function public.fn_admin_can(text, text) from public, anon;
grant execute on function public.fn_admin_can(text, text) to authenticated, service_role;


-- 6-c) 최고 관리자 여부. 승격·강등 등 관리자 설정 자체의 게이트.
create or replace function public.fn_is_super_admin(p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.admin_members m
      join public.admin_roles r on r.id = m.role_id
     where m.profile_id = p_profile_id
       and m.status = 'active'
       and r.is_super
  );
$$;

revoke all on function public.fn_is_super_admin(uuid) from public, anon;
grant execute on function public.fn_is_super_admin(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 7) 안전장치 — 마지막 최고 관리자 보호 (WC059)
--
--    최고 관리자가 1명만 남았을 때 그 사람을 강등(role 변경)하거나 정지하면
--    **아무도 권한을 되돌릴 수 없는 상태**가 된다. 자기 자신을 내리는 경우도
--    같다(기획 문서 "안전장치"). DELETE 도 같은 사고라 함께 막는다.
-- ---------------------------------------------------------------------
create or replace function public.fn_guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_was_super boolean;
  v_is_super  boolean;
  v_remaining int;
begin
  select coalesce(r.is_super, false) into v_was_super
    from public.admin_roles r where r.id = old.role_id;

  -- 최고 관리자가 아니었으면 이 트리거가 관여할 일이 없다.
  if not coalesce(v_was_super, false) or old.status <> 'active' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_is_super := false;
  else
    select coalesce(r.is_super, false) into v_is_super
      from public.admin_roles r where r.id = new.role_id;
    v_is_super := coalesce(v_is_super, false) and new.status = 'active';
  end if;

  -- 여전히 활성 최고 관리자면 아무것도 잃지 않았다.
  if v_is_super then
    return new;
  end if;

  select count(*) into v_remaining
    from public.admin_members m
    join public.admin_roles r on r.id = m.role_id
   where r.is_super and m.status = 'active' and m.profile_id <> old.profile_id;

  if v_remaining = 0 then
    raise exception '최고 관리자가 1명뿐이라 강등·정지·삭제할 수 없다. 다른 사람을 먼저 최고 관리자로 올릴 것.'
      using errcode = 'WC059';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists admin_members_guard_last_super on public.admin_members;
create trigger admin_members_guard_last_super
  before update or delete on public.admin_members
  for each row execute function public.fn_guard_last_super_admin();


-- ---------------------------------------------------------------------
-- 8) RLS — 읽기는 본인 것, 쓰기는 최고 관리자만
--
--    권한 테이블 자체를 실무 관리자가 고칠 수 있으면 권한 체계가 무의미해진다
--    (자기 권한을 스스로 올릴 수 있게 된다 — sql/46 이 profiles.role 에서 막은
--    것과 같은 유형의 구멍).
-- ---------------------------------------------------------------------
alter table public.admin_resources           enable row level security;
alter table public.admin_roles               enable row level security;
alter table public.admin_role_permissions    enable row level security;
alter table public.admin_members             enable row level security;
alter table public.admin_member_permissions  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'admin_resources', 'admin_roles', 'admin_role_permissions',
    'admin_members', 'admin_member_permissions'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_super_all', t);

    -- 읽기: 로그인한 어드민이면 전부 읽을 수 있다. 권한 화면이 "누가 무엇을
    -- 가졌는지"를 그려야 하고, 숨겨서 얻는 보안 이득이 없다(쓰기가 막혀 있다).
    execute format($f$
      create policy %I on public.%I as permissive for select to authenticated
      using (exists (select 1 from public.admin_members m
                      where m.profile_id = auth.uid() and m.status = 'active'))
    $f$, t || '_read', t);

    -- 쓰기: 최고 관리자만.
    execute format($f$
      create policy %I on public.%I as permissive for all to authenticated
      using (public.fn_is_super_admin()) with check (public.fn_is_super_admin())
    $f$, t || '_super_all', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 9) 시드 — 메뉴 마스터 / 기본 묶음 2종 / 기존 관리자 승격
--
--    기획 문서 "도입 시 달라지는 것": 도입 시점의 기존 관리자 전원은 자동으로
--    최고 관리자가 된다. 도입 직후에는 지금과 똑같이 쓸 수 있다.
-- ---------------------------------------------------------------------

-- 9-a) 메뉴 마스터. ADMIN_SECTION_KEYS + MENU_GROUPS 를 그대로 옮긴 것이다.
--      '관리자 설정' 2개(adminMembers/adminRoles)는 이번에 새로 생기는 화면.
insert into public.admin_resources (key, group_title, label, sort_order) values
  ('popups',                          '메인 관리',      '팝업 관리',            10),
  ('banners',                         '메인 관리',      '메인 배너 관리',        20),
  ('sideBanners',                     '메인 관리',      '우측 소형 배너',        30),
  ('universityAcceptances',           '메인 관리',      '합격생 대학 관리',      40),
  ('programCategories',               '메인 관리',      '핵심 서비스',          50),
  ('mentorStrategies',                '메인 관리',      '멘토 성공전략',        60),
  ('pageContents',                    '메인 관리',      '세부 페이지 관리',      70),
  ('premiumBookPages',                '메인 관리',      '프리미엄 책자 관리',    80),
  ('premiumConsults',                 '메인 관리',      '프리미엄 상담 신청',    90),
  ('notices',                         '게시판 관리',    '공지사항',            110),
  ('companyNews',                     '게시판 관리',    '회사소식',            120),
  ('admissionSusiJungsi',             '게시판 관리',    '수시정시합격',         130),
  ('specialHighschool',               '게시판 관리',    '특목고합격',          140),
  ('specialHighschoolRates',          '게시판 관리',    '특목고 합격률',        145),
  ('acceptanceRates',                 '게시판 관리',    '연도별 합격률',        146),
  ('admissionCaseLogos',              '게시판 관리',    '대학 로고',           147),
  ('admissionGuidelines',             '게시판 관리',    '대학별 모집요강',       150),
  ('admissionUniversities',           '게시판 관리',    '대학 목록 관리',       160),
  ('admissionResults',                '게시판 관리',    '입결정보',            170),
  ('trendingDepartments',             '게시판 관리',    '지금 뜨고 있는 학과',   180),
  ('galleries',                       '게시판 관리',    '교육칼럼',            190),
  ('faqs',                            '게시판 관리',    '자주하는질문',         200),
  ('mentorApplyFaqs',                 '게시판 관리',    '멘토신청 FAQ',        210),
  ('mentorApplyCopy',                 '게시판 관리',    '멘토신청 문구',        220),
  ('learningDiagnosis',               '게시판 관리',    '학습진단 관리',        230),
  ('learningDiagnosisV2SurveyCopy',   '게시판 관리',    '학습진단(ver2) 문항 문구', 240),
  ('members',                         '회원 관리',      '회원 목록',           310),
  ('enrollments',                     '회원 관리',      '수강 신청 내역',       320),
  ('mentorApplications',              '회원 관리',      '멘토 신청 내역',       330),
  ('dailyEntries',                    '프로그램 관리',  '일일 입장',           410),
  ('usageStatus',                     '프로그램 관리',  '이용 현황',           420),
  ('goalUniversityCuts',              '목표관리',       '대학 컷 관리',         510),
  ('goalStudents',                    '목표관리',       '학생 현황',           520),
  ('winningBaseData',                 '위닝관리',       '기초데이터추출',        610),
  ('winningDbInputs',                 '위닝관리',       '위닝DB입력',          620),
  ('winningSuhaengTopicDb',           '위닝관리',       '위닝 수행 주제 DB',    630),
  ('winningSuhaengResourceDb',        '위닝관리',       '위닝 수행 자료 DB',    640),
  ('winningSetukDb',                  '위닝관리',       '위닝 세특 DB',        650),
  ('winningDeepReportDb',             '위닝관리',       '위닝 심화보고서 DB',   660),
  ('winningStudentRecordDb',          '위닝관리',       '위닝 생기부 DB',      670),
  ('payments',                        '수입·매출 관리', '매출 조정',           710),
  ('settlements',                     '수입·매출 관리', '매출 정산',           720),
  ('dailySettlements',                '수입·매출 관리', '일일정산',            730),
  ('refunds',                         '수입·매출 관리', '환불 수기 대장',       740),
  ('refundRequests',                  '수입·매출 관리', '환불 신청 내역',       750),
  ('coupons',                         '수입·매출 관리', '쿠폰관리',            760),
  ('adminMembers',                    '관리자 설정',    '관리자 관리',          810),
  ('adminRoles',                      '관리자 설정',    '관리자 권한 관리',      820)
on conflict (key) do update
  set group_title = excluded.group_title,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      is_active   = true;

-- 9-b) 기본 묶음 2종.
insert into public.admin_roles (name, description, is_super, is_system)
values ('최고 관리자', '모든 메뉴 수정 + 관리자 등록·권한 조정', true, true)
on conflict (name) do update set is_super = true, is_system = true;

insert into public.admin_roles (name, description, is_super, is_system)
values ('실무 관리자', '일상 업무 메뉴 수정. 회원은 읽기 전용, 매출·관리자 설정은 접근 불가', false, true)
on conflict (name) do update set is_system = true;

-- 실무 관리자 권한 항목 — 기획 문서 「권한 묶음 비교」 표 그대로.
--   메인/게시판/프로그램/위닝/목표관리 = edit, 회원 관리 = view,
--   수입·매출 + 관리자 설정 = 항목 없음(규칙 3에 의해 접근 불가).
insert into public.admin_role_permissions (role_id, resource_key, level)
select r.id, res.key,
       case
         when res.group_title = '회원 관리' then 'view'
         else 'edit'
       end
  from public.admin_roles r
  cross join public.admin_resources res
 where r.name = '실무 관리자'
   and res.group_title in ('메인 관리', '게시판 관리', '회원 관리',
                           '프로그램 관리', '위닝관리', '목표관리')
on conflict (role_id, resource_key) do update set level = excluded.level;

-- 9-c) 기존 관리자(profiles.role='admin') 전원을 최고 관리자로 승격.
--      이미 admin_members 행이 있으면 건드리지 않는다(재실행 시 수동 조정한
--      권한을 되돌리면 안 된다).
insert into public.admin_members (profile_id, role_id, status, activated_at)
select p.id, r.id, 'active', now()
  from public.profiles p
  cross join public.admin_roles r
 where p.role = 'admin' and r.is_super
on conflict (profile_id) do nothing;


-- =====================================================================
-- 확인용 (실행 후 눈으로 볼 것 — 아래는 주석, 자동 실행되지 않는다)
-- =====================================================================
-- 1) 메뉴 마스터가 코드와 같은 수인지 (ADMIN_SECTION_KEYS 46 + 신규 2 = 48).
-- select count(*) from public.admin_resources;
--
-- 2) 기존 관리자가 최고 관리자로 올라왔는지.
-- select p.name, p.email, r.name as role, m.status
--   from public.admin_members m
--   join public.profiles p on p.id = m.profile_id
--   left join public.admin_roles r on r.id = m.role_id;
--
-- 3) 실무 관리자의 최종 권한 — 매출·관리자 설정이 안 나와야 정상(규칙 3).
-- select * from public.fn_admin_effective_permissions('<profile_id>') order by 1;
--
-- 4) 개별 차단이 묶음을 이기는지 (규칙 1).
-- begin;
--   insert into public.admin_member_permissions (profile_id, resource_key, level)
--   values ('<실무 관리자 id>', 'notices', 'none');
--   select * from public.fn_admin_effective_permissions('<실무 관리자 id>')
--    where resource_key = 'notices';  -- none 기대
-- rollback;
--
-- 5) 마지막 최고 관리자 보호 (WC059) — 반드시 begin...rollback 안에서.
-- begin;
--   update public.admin_members set status = 'suspended'
--    where profile_id = '<유일한 최고 관리자 id>';  -- WC059 기대
-- rollback;
-- =====================================================================
