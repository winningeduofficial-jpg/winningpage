-- =====================================================================
-- 게시판(공지사항·회사소식) 리뉴얼 — 조회수 컬럼 + IP 기반 1일 1회 중복
-- 방지 + 조회수 증가 RPC + 정렬 인덱스 대칭화.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- ★ 적용 순서: 이 SQL을 dev/운영에 먼저 실행한 뒤 프런트를 배포할 것 —
--   어드민(Admin.jsx)이 view_count 를 목록 컬럼으로 읽고 저장 페이로드에서
--   제외하는 변경을 포함하므로, 컬럼 없이 프런트만 올리면 어드민 저장이
--   PGRST204(스키마 캐시에 없는 컬럼)로 실패한다.
--   (sql/README.md:23, sql/45_faq_renewal.sql:5-6 에 기록된 실사고)
--   공개면 읽기는 select('*') + getViewCount() null 폴백으로 방어돼 있어
--   SQL 적용 전에도 목록 화면 자체는 죽지 않는다(sql/36 + columnData.js 선례).
--
-- 파일 번호:
--   이 파일은 처음 46번으로 작성했으나 두 차례 재번호를 거쳐 50번이 됐다.
--     - 46 = dev 의 sql/46_profiles_role_hardening.sql (머지 완료).
--       profiles.role 권한상승 차단 RLS 하드닝 — public.profiles 의 RLS
--       정책만 건드린다.
--     - 47·48·49 = admission-structured-json 브랜치가 커밋 상태로 점유
--       (47_admission_section_json / 48_admission_resource_index_json_flags /
--       49_app_settings). 아직 머지 전이다.
--     - 그래서 이 파일이 50번. 50 이상은 전 워크트리·원격 어디에도 없음을
--       확인했다.
--   위 어느 번호에도 **실제 선행 의존은 없다.** 이 파일이 다루는 객체는
--   company_news / notices / board_views / increment_board_view 뿐이고
--   46~49 중 어느 것과도 겹치는 객체가 하나도 없다 — 즉 번호만 뒤다.
--   43~49 를 전부 건너뛴 DB 에서도 이 파일 단독 실행이 가능하다.
--   다만 47~49 는 아직 미머지이므로 **머지 순서에 따라 번호가 또 바뀔 수
--   있다** — 이 파일이 먼저 머지되면 저쪽 3개가 뒤로 밀린다.
--
-- 배경:
--   Figma 게시판 시안(회사소식 2235:3536 / 공지사항 1882:20932)의 표에
--   "조회수" 컬럼이 있으나 company_news / notices 어디에도 대응 컬럼이 없다.
--   컬럼 정의는 galleries(교육칼럼) 선례를 그대로 따른다
--   (sql/36_column_renewal.sql:23 — integer not null default 0).
--
--   조회수 "증가"까지 이 파일에서 함께 도입한다. 게시글 상세 화면 시안은
--   이번 범위 밖이지만 `?id=` 상세뷰 자체는 이미 존재하므로 증가를 호출할
--   지점이 실재한다. 다만 이 저장소에서 anon 이 RLS 를 우회해 행을 변경하는
--   SECURITY DEFINER 경로는 이것이 최초이므로(기존 정의자 권한 함수들은 전부
--   판정/읽기용이거나 auth.uid() 전제) 아래 4중 방어를 전부 건다:
--     (a) p_source 화이트리스트 — 동적 SQL 로 임의 테이블을 UPDATE 하는 것을
--         원천 차단. 화이트리스트 통과 이전에는 동적 SQL 을 조립하지 않는다.
--         이어서 대상 글의 존재·활성 확인을 board_views insert 보다 **먼저**
--         수행한다 — 순서가 뒤바뀌면 존재하지 않는 uuid 반복 호출만으로
--         anon 이 board_views 를 무한 증식시킬 수 있다.
--     (b) set search_path = public 고정 — search_path 하이재킹 방지.
--     (c) view_count 외 컬럼 절대 미변경 (원자적 +1). updated_at 오염도
--         아래 (4) 가드 트리거로 차단.
--     (d) revoke all from public → grant execute (필요 롤에만).
--
-- 포함:
--   1) company_news.view_count / notices.view_count 추가
--   2) board_views — 1일 1회 중복 방지 대장 (RLS on, 정책 0건)
--   3) increment_board_view(text, uuid) RPC
--   4) 조회수만 바뀐 UPDATE 에서 updated_at 을 보존하는 가드 트리거
--   5) notices 정렬 인덱스 대칭화
--
-- 주의:
--   - notices 는 is_pinned / is_active / sort_order / created_at / updated_at 이
--     nullable 이다(company_news 는 전부 NOT NULL). 이 파일은 nullability 를
--     바꾸지 않는다 — 기존 행에 NULL 이 있으면 승격이 실패하고, 그 정리는 별건이다.
--     RPC 의 is_active 판정에서 이 차이를 coalesce 로 흡수한다.
--   - notices 의 RLS 정책 7종에 is_winning_admin() 계열과 구 is_admin() 계열이
--     혼재해 있다(00_base_schema.sql:1931-1959). 정리는 이 파일의 범위가 아니다
--     — sql/45_faq_renewal.sql:36-40 이 같은 불일치를 발견하고도 범위 밖으로
--     남긴 선례를 따른다.
--   - schema_migrations 마커를 쓰지 않는다. 이 파일은 DDL + 함수 정의뿐이고
--     관리자가 어드민에서 고친 값을 덮는 UPDATE/시드가 없기 때문이다
--     (sql/README.md:30-32 의 마커 사용 기준).
--
-- RLS: company_news / notices 의 기존 정책은 행 단위이므로 신규 view_count
--      컬럼에 대한 추가 정책이 필요 없다. 익명 UPDATE 정책은 이 파일에서도
--      만들지 않는다 — 증가는 오직 SECURITY DEFINER RPC 경유다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) 조회수 컬럼 — galleries 선례(sql/36_column_renewal.sql:23)와 동일
--    타입/기본값. integer not null default 0 이라 기존 행은 전부 0으로
--    즉시 채워지고, 프런트의 null 폴백 경로는 타지 않는다.
-- ---------------------------------------------------------------------
alter table public.company_news
  add column if not exists view_count integer not null default 0;

alter table public.notices
  add column if not exists view_count integer not null default 0;


-- ---------------------------------------------------------------------
-- 2) board_views — 1일 1회 중복 방지 대장
--
--    PK 4-튜플 (source, post_id, viewer_key, viewed_on) 자체가 중복 방지
--    제약이다. 별도 unique 인덱스를 두지 않고 PK 에 on conflict 를 건다.
--
--    [viewer_key 는 해시다 — 원본 IP 를 저장하지 않는다]
--      개인정보 최소수집 원칙. 아래 RPC 가 IP + user-agent + 일자 + 게시판 +
--      게시글 id 를 md5 로 접어 넣은 값만 기록한다. 복호화 경로가 없다.
--
--    [RLS 는 켜되 정책은 하나도 만들지 않는다 — 의도된 조합이다]
--      · RLS 가 켜진 테이블에 정책이 0건이면 그 테이블에 대한 모든 접근이
--        거부된다. 즉 anon / authenticated 는 PostgREST 로 board_views 를
--        읽지도 쓰지도 못한다. 방문 기록은 조회수 파생 데이터일 뿐이고
--        클라이언트가 직접 만질 이유가 전혀 없다.
--      · 반면 아래 increment_board_view() 는 SECURITY DEFINER 이므로 이
--        마이그레이션을 실행한 소유자 권한으로 동작한다. 그 소유자가 곧
--        board_views 의 소유자이고, 테이블 소유자는 (force row level
--        security 를 켜지 않는 한) 자기 테이블의 RLS 에서 면제된다.
--        따라서 "정책 0건 + SECURITY DEFINER" 조합이 정확히
--        "RPC 경유로만 쓰기 가능" 을 만든다. force row level security 를
--        절대 켜지 말 것 — 켜는 순간 RPC 가 죽는다.
--      · 이것이 정책을 "깜빡한" 것이 아니라 설계라는 점을 명시해 둔다.
-- ---------------------------------------------------------------------
create table if not exists public.board_views (
  source     text not null,          -- 'company_news' | 'notices' (RPC 화이트리스트와 동일)
  post_id    uuid not null,
  viewer_key text not null,          -- md5(IP|UA|일자|source|post_id) — 원본 IP 미보관
  viewed_on  date not null,          -- KST 기준 날짜 (RPC 에서 산출)
  created_at timestamptz not null default now(),
  constraint board_views_pkey primary key (source, post_id, viewer_key, viewed_on)
);

comment on table public.board_views is
  '게시판 조회수 1일 1회 중복 방지 대장. public.increment_board_view() RPC 경유로만 기록된다(RLS on / 정책 0건). viewer_key 는 해시이며 원본 IP 는 저장하지 않는다.';

alter table public.board_views enable row level security;

-- 정책은 만들지 않는다(위 주석 참고). PostgREST 노출을 확실히 막기 위해
-- 기본 부여돼 있을 수 있는 테이블 권한까지 회수한다 — RLS 거부와 권한 회수의
-- 이중 방어. SECURITY DEFINER 함수는 소유자 권한으로 돌아 영향받지 않는다.
revoke all on table public.board_views from anon, authenticated;

-- 보존 정리용. 대장은 방문마다 무한히 늘어나므로 주기적으로
--   delete from public.board_views where viewed_on < current_date - 90;
-- 를 돌리게 되는데, PK 선두 컬럼이 source 라 viewed_on 단독 조건은
-- PK 를 타지 못한다. 정리 DELETE 가 seq scan 이 되지 않도록 하나 둔다.
create index if not exists board_views_viewed_on_idx
  on public.board_views using btree (viewed_on);


-- ---------------------------------------------------------------------
-- 3) increment_board_view(p_source, p_id) — 조회수 증가 RPC
--
--    반환값: 증가 반영 후(또는 이미 오늘 집계된 경우 현재) view_count.
--            프런트가 재조회 없이 화면 숫자를 갱신할 수 있게 integer 를
--            돌려준다. 대상 행이 없거나 비활성이면 0 — 이 경우 board_views
--            에도 아무것도 쓰지 않고 즉시 반환한다(아래 (a-2) 참고).
--
--    [클라이언트 IP 획득 — inet_client_addr() 를 쓰지 않는 이유]
--      Supabase 는 커넥션 풀러(Supavisor/PgBouncer)를 경유하므로
--      inet_client_addr() 는 최종 사용자가 아니라 풀러의 IP 를 돌려준다.
--      전 사용자가 같은 값으로 접히면 "1일 1회" 가 "게시글당 하루 1회"
--      로 붕괴한다. 그래서 PostgREST 가 GUC 로 넘겨주는 요청 헤더의
--      x-forwarded-for 첫 항목(= 원 클라이언트)을 쓴다.
--      current_setting(..., true) 의 두 번째 인자 true 는 "설정이 없으면
--      에러 대신 NULL" 이다 — SQL Editor 등 HTTP 밖에서 호출해도 죽지 않는다.
--      nullif(..., '') 는 빈 문자열을 ::json 캐스트하면 22P02 로 터지기
--      때문에 반드시 필요하다.
--
--    [해시 알고리즘 — md5() 확정. pgcrypto(extensions.digest) 를 쓰지 않는다]
--      1) 가용성: md5() 는 pg_catalog 내장 함수라 어떤 환경에서도 존재한다.
--         extensions.digest() 는 pgcrypto 확장 설치가 전제인데, 이 파일을
--         작성하는 시점에 dev/운영의 pg_extension 을 조회할 수단이 없다.
--         함수 안에서 to_regprocedure() 로 런타임 분기하는 방법도 있지만,
--         그러면 "확장 설치 전/후"로 같은 방문자의 viewer_key 가 달라져
--         그날의 중복 방지가 조용히 깨진다. 정확성 비용이 이득보다 크다.
--      2) 목적: 이 해시는 인증·서명이 아니라 "원본 IP 를 보관하지 않기
--         위한 일방향 축약"(개인정보 최소수집)이다. 어차피 입력 공간이
--         IPv4(2^32) × UA 라 sha256 으로 바꿔도 오프라인 전수 대입 저항력이
--         생기지 않는다 — 알고리즘을 올려도 해결되지 않는 문제다.
--         실질 방어선은 board_views 가 anon/authenticated 에게 아예 읽히지
--         않는다는 점(위 2번 RLS 설계)이다.
--      3) 충돌: 하루·게시글 단위 버킷 키이므로 충돌 시 최대 피해는 "조회수
--         1 미집계" 다. md5 의 충돌 확률로 감당 가능한 손실이다.
--      → 이 판단을 뒤집어 pgcrypto 로 옮길 거라면, 확장 설치 여부를 실제로
--        확인한 뒤 새 마이그레이션에서 board_views 를 비우고(키 체계 변경)
--        전환할 것. 함수만 바꾸면 그날 하루 중복 집계가 발생한다.
--
--    [일자 기준 KST]
--      게시판 표기가 KST YYYY-MM-DD 이므로 "1일" 의 경계도 KST 로 맞춘다.
--      UTC 기준이면 한국 시간 오전 9시에 카운터가 리셋된다.
--
--    [비활성 행]
--      notices 는 is_active 가 nullable 이라 `is_active = true` 로 비교하면
--      NULL 행이 조용히 누락된다. coalesce(is_active, true) 로 흡수한다
--      (기본값이 true 이므로 NULL 은 "활성"으로 본다).
--      이 판정은 함수 본문 맨 앞((a-2))에서 한 번, UPDATE 의 WHERE 에서 한 번
--      — 두 곳 모두 같은 coalesce 표현을 쓴다. 앞의 것은 board_views 오염과
--      anon 증폭을 막는 게이트이고, 뒤의 것은 그 사이 비활성화된 경우를
--      흡수하는 최종 조건이다.
-- ---------------------------------------------------------------------
create or replace function public.increment_board_view(p_source text, p_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_headers    json;
  v_ip         text;
  v_ua         text;
  v_today      date;
  v_viewer_key text;
  v_count      integer;
  v_visible    boolean;
begin
  -- (a) 화이트리스트. 이 검사를 통과하기 전에는 동적 SQL 을 한 글자도
  --     조립하지 않는다. 없으면 anon 이 임의 테이블을 UPDATE 할 수 있다.
  if p_source is null or p_source not in ('company_news', 'notices') then
    raise exception 'increment_board_view: unsupported source %', p_source
      using errcode = '22023';
  end if;

  if p_id is null then
    raise exception 'increment_board_view: p_id is required'
      using errcode = '22023';
  end if;

  -- (a-2) 대상 글의 존재 + 활성 확인. **반드시 board_views insert 보다 먼저다.**
  --   · 무한 증식 방어: 이 RPC 는 anon 에게 열려 있고 board_views 는 방문마다
  --     행이 늘어난다. 존재 확인을 insert 뒤로 미루면, 존재하지도 않는 uuid 를
  --     반복 호출하는 것만으로 대장이 무한히 부풀 수 있다(그때마다 viewer_key
  --     가 p_id 를 섞어 만들어지므로 PK 충돌조차 나지 않는다). rate limit 도
  --     자동 정리 잡도 없으니, "쓰기 전에 대상부터 확인" 이 유일한 방어선이다.
  --   · 비활성 글 영구 잠금 방어: 확인이 뒤에 있으면 비활성 글 조회 시
  --     board_views 행만 남고 UPDATE 는 coalesce(is_active, true) 조건에 걸려
  --     0행이 된다. 같은 날 관리자가 글을 활성화해도 그 방문자는 이미 대장에
  --     찍혀 있어 재집계되지 않는다. 확인을 앞으로 옮기면 비활성 구간의 호출은
  --     대장에 아무 흔적도 남기지 않으므로, 활성화 직후 정상 집계된다.
  --   · 동적 SQL 은 format('%I') 로 식별자만 넣고 uuid 는 using 바인딩이다
  --     (화이트리스트를 통과한 p_source 외에는 어떤 값도 문자열로 붙이지 않는다).
  --   · 여기서 통과한 뒤 UPDATE 사이에 글이 비활성화되는 경합은 조회수 +1 이
  --     0행이 되는 것뿐이라 무해하다 — 잠그지 않는다.
  execute format(
    'select exists(select 1 from public.%I where id = $1 and coalesce(is_active, true))',
    p_source
  )
     into v_visible
    using p_id;

  if not coalesce(v_visible, false) then
    return 0;
  end if;

  v_today := (now() at time zone 'Asia/Seoul')::date;

  -- PostgREST 가 넘겨주는 요청 헤더. HTTP 밖 호출이면 NULL 이다.
  v_headers := nullif(current_setting('request.headers', true), '')::json;

  v_ip := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
  v_ua := coalesce(v_headers ->> 'user-agent', '');

  -- 원본 IP 는 여기서 즉시 해시로 접히고, 어디에도 저장되지 않는다.
  -- IP 를 못 얻은 경로(SQL Editor 등)는 'unknown' 버킷으로 모인다 —
  -- 그런 호출은 사실상 관리자 수동 호출이므로 하루 1회로 묶여도 무해하다.
  v_viewer_key := md5(
    coalesce(v_ip, 'unknown') || '|' || v_ua || '|' ||
    v_today::text || '|' || p_source || '|' || p_id::text
  );

  insert into public.board_views (source, post_id, viewer_key, viewed_on)
  values (p_source, p_id, v_viewer_key, v_today)
  on conflict do nothing;

  -- on conflict do nothing 으로 아무 행도 안 들어갔으면 오늘 이미 집계된
  -- 방문이다. 증가 없이 현재 값만 돌려준다.
  if not found then
    execute format('select view_count from public.%I where id = $1', p_source)
       into v_count
      using p_id;
    return coalesce(v_count, 0);
  end if;

  execute format(
    'update public.%I set view_count = coalesce(view_count, 0) + 1 '
    ' where id = $1 and coalesce(is_active, true) '
    ' returning view_count',
    p_source
  )
     into v_count
    using p_id;

  return coalesce(v_count, 0);
end;
$$;

comment on function public.increment_board_view(text, uuid) is
  '게시판 조회수 +1 (IP+UA 해시 기준 1일 1회). p_source 는 company_news|notices 화이트리스트. 반환값은 반영 후 view_count.';

-- 함수는 생성 시 PUBLIC 에 EXECUTE 가 기본 부여되므로 먼저 회수한다.
-- 회수 없이 grant 만 하면 "anon/authenticated 에만 허용" 이 실제로는
-- 성립하지 않는다(모든 롤이 이미 실행 가능). 순서가 중요하다.
-- (sql/20_landing_renewal.sql:31-32 의 is_admin() 선례와 동일 패턴)
revoke all on function public.increment_board_view(text, uuid) from public;
grant execute on function public.increment_board_view(text, uuid) to anon, authenticated;
-- service_role 은 위 grant 목록에 **일부러 넣지 않았다**. 서버 사이드 코드는 RLS 를
-- 우회해 테이블을 직접 UPDATE 할 수 있어 이 RPC 가 필요 없고, 현재 api/* 중 조회수를
-- 건드리는 경로도 없기 때문이다.
-- 다만 dev DB 적용 후 실측하면 service_role 에 EXECUTE 가 **붙어 있다**:
--   increment_board_view → anon / authenticated / postgres / service_role (모두 EXECUTE)
-- Supabase 가 public 스키마 함수에 기본으로 부여하는 것이라 위 `revoke ... from public`
-- 으로는 회수되지 않는다. 즉 "우리가 grant 하지 않았을 뿐, 실제로는 실행 가능"이다.
-- 기능상 무해하므로(어차피 RLS 우회 권한을 이미 가진 롤이다) 그대로 둔다.
-- 정말로 막아야 한다면 `revoke execute ... from service_role` 을 명시해야 한다.


-- ---------------------------------------------------------------------
-- 4) updated_at 오염 방지 가드 트리거
--
--    문제: 두 테이블에는 BEFORE UPDATE 트리거가 이미 걸려 있고
--      · company_news : set_company_news_updated_at
--                       → set_homepage_content_updated_at() (00_base_schema.sql:1412, :1484)
--      · notices      : trg_notices_updated_at
--                       → set_updated_at()                  (00_base_schema.sql:1424, :1520)
--    둘 다 조건 없이 new.updated_at = now() 를 박는다. 조회수 +1 이 곧
--    "최종 수정일 갱신" 이 되어 버려서, 아무도 편집하지 않은 게시글의
--    updated_at 이 방문 때마다 오늘로 밀린다. 지금 당장 updated_at 으로
--    정렬하는 화면은 없지만(Admin.jsx 는 저장 payload 에서 제거만 한다)
--    컬럼의 의미 자체가 깨지고, 나중에 "최근 수정순" 을 붙이면 조회수가
--    많은 글이 영구 상위 고정되는 형태로 터진다.
--
--    선택한 해법: 기존 트리거를 건드리지 않고 "뒤에서 되돌리는" 가드
--    트리거를 추가한다.
--      · PostgreSQL 은 같은 이벤트의 BEFORE ROW 트리거를 트리거명
--        알파벳 순으로 실행한다. 아래 트리거명을 zz_ 로 시작시켜
--        set_… / trg_… 보다 뒤에 돌게 만든다. 앞선 트리거가 new.updated_at
--        을 now() 로 덮은 뒤, 이 트리거가 old.updated_at 으로 되돌린다.
--      · 되돌리는 조건은 "view_count 가 바뀌었고, view_count 와 updated_at
--        을 제외한 나머지 컬럼은 전부 그대로" 일 때뿐이다. 관리자가 본문을
--        고치면서 조회수가 함께 움직인 경우에는 updated_at 이 정상 갱신된다.
--
--    기존 트리거를 drop 후 WHEN 절을 달아 재생성하는 방식은 택하지 않았다:
--      · 트리거 정의를 이 파일이 소유하게 되어 00_base_schema.sql 재실행 시
--        WHEN 절이 조용히 사라진다(원복 사고).
--      · 그 트리거는 조회수 외 경로(어드민 저장 등)도 태우는 공용 경로라,
--        재생성 사이 짧은 순간이라도 정의를 갈아끼우는 것은 위험하다.
--    추가만 하는 이 방식은 base_schema 재실행에도 살아남고, 다른 경로의
--    동작을 바꾸지 않는다.
--
--    가드 함수는 컬럼명만 맞으면 어느 테이블에나 붙는 범용 함수로 둔다
--    (향후 galleries 등에 조회수 증가를 붙일 때 재사용).
-- ---------------------------------------------------------------------
create or replace function public.keep_updated_at_on_view_count_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.view_count is distinct from old.view_count
     and (to_jsonb(new) - 'view_count' - 'updated_at')
       = (to_jsonb(old) - 'view_count' - 'updated_at')
  then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

comment on function public.keep_updated_at_on_view_count_only() is
  'view_count 만 변경된 UPDATE 에서 updated_at 을 원값으로 되돌리는 BEFORE UPDATE 가드. 기존 set_updated_at 계열 트리거보다 뒤(알파벳 순 zz_)에 실행되어야 한다.';

-- drop 대상은 "이 파일이 만든 가드 트리거" 뿐이다. 기존 set_… / trg_…
-- 트리거는 건드리지 않는다.
drop trigger if exists zz_company_news_keep_updated_at on public.company_news;
create trigger zz_company_news_keep_updated_at
  before update on public.company_news
  for each row
  execute function public.keep_updated_at_on_view_count_only();

drop trigger if exists zz_notices_keep_updated_at on public.notices;
create trigger zz_notices_keep_updated_at
  before update on public.notices
  for each row
  execute function public.keep_updated_at_on_view_count_only();


-- ---------------------------------------------------------------------
-- 5) notices 정렬 인덱스 대칭화
--
--    공개면 공통 정렬 규약은 is_pinned desc → sort_order asc → created_at desc
--    이고, company_news 에는 이미 방향이 일치하는
--    company_news_display_idx (00_base_schema.sql:1060) 가 있다.
--    반면 notices 쪽 idx_notices_events_visible (00_base_schema.sql:1070) 은
--    (is_active, is_pinned, sort_order, created_at) 전부 ASC 라 실제 쿼리
--    방향과 어긋난다. 대칭 인덱스를 새로 추가한다.
--
--    기존 인덱스를 drop 하지 않는 이유: 00_base_schema.sql 은 운영 덤프에서
--    재생성되는 파일이라 재실행 시 idx_notices_events_visible 이 되살아난다.
--    여기서 drop 해도 다음 base 재실행에 원복되므로 drop 은 무의미하고,
--    그 사이 다른 쿼리가 그 인덱스에 의존하고 있을 가능성만 남긴다.
--    → 추가만 한다.
-- ---------------------------------------------------------------------
create index if not exists notices_display_idx
  on public.notices using btree (is_active, is_pinned desc, sort_order, created_at desc);


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- -- view_count 컬럼 존재 확인
-- select table_name, column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and column_name = 'view_count'
--    and table_name in ('company_news', 'notices');
--
-- -- 가드 트리거가 기존 트리거보다 뒤(알파벳 순)에 있는지 확인
-- select event_object_table, trigger_name, action_timing, event_manipulation
--   from information_schema.triggers
--  where event_object_table in ('company_news', 'notices')
--  order by event_object_table, trigger_name;
--
-- -- board_views 가 RLS on / 정책 0건 인지 확인 (rowsecurity=true, count=0 기대)
-- select relrowsecurity, relforcerowsecurity from pg_class
--  where oid = 'public.board_views'::regclass;
-- select count(*) from pg_policies
--  where schemaname = 'public' and tablename = 'board_views';
--
-- -- RPC 동작 확인 (SQL Editor 에서는 IP 가 'unknown' 버킷으로 잡힌다)
-- --   1회차: view_count + 1 / 2회차: 같은 값 (하루 1회 중복 방지 동작)
-- --   updated_at 이 두 호출 전후로 변하지 않아야 한다.
-- select id, view_count, updated_at from public.notices limit 1;
-- select public.increment_board_view('notices', '<위 id>'::uuid);
-- select public.increment_board_view('notices', '<위 id>'::uuid);
-- select id, view_count, updated_at from public.notices limit 1;
--
-- -- 화이트리스트 방어 확인 (22023 에러가 나야 정상)
-- select public.increment_board_view('profiles', gen_random_uuid());
--
-- -- anon 증폭 방어 확인: 존재하지 않는 uuid 로 여러 번 호출해도
-- --   반환값은 0 이고 board_views 행 수가 늘지 않아야 한다.
-- select count(*) from public.board_views;                       -- before
-- select public.increment_board_view('notices', gen_random_uuid());
-- select public.increment_board_view('notices', gen_random_uuid());
-- select count(*) from public.board_views;                       -- 동일해야 정상
-- =====================================================================
