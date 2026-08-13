-- =====================================================================
-- 수행평가 인앱 이식 선행 인프라 (P1 ①②③) — 지식베이스 스키마 교정.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 대상 객체는 전부 `00_base_schema.sql`이 만든 기존 것이다:
--   - 테이블 public.winning_assessment_knowledge_items  (:955-977)
--   - RPC   public.match_winning_suhaeng_all_subjects   (:1356-1385)
--   - 인덱스 winning_suhaeng_embedding_hnsw_idx          (:1101)
--
-- 포함:
--   (1) RLS 교정 — `for ALL to authenticated using(true) with check(true)`
--       전면 개방 정책을 폐기하고 `is_admin()` 단일 정책으로 교체
--   (2) `source_link text` 컬럼 신설 + 기존 행 정규식 백필
--   (3) RPC 재생성 — 반환에 `source_link` 추가 + `filter_subject` 파라미터 추가
--
-- 근거 문서: docs/수행평가-상세-명세.md §8 (Q50 / 출처 링크 WARN / 과목 필터 WARN),
--            §12 이식 화이트리스트, 로드맵 P1 ①②③
--
-- ---------------------------------------------------------------------
-- (1) RLS — 왜 지금 고치는가
-- ---------------------------------------------------------------------
-- 현재 정책은 `00_base_schema.sql:2109-2112` 하나뿐이다:
--
--   create policy "authenticated can manage winning assessment knowledge"
--     on public.winning_assessment_knowledge_items
--     as PERMISSIVE for ALL to authenticated
--     using (true) with check (true);
--
-- 즉 **로그인한 아무 계정이나** 지식베이스 전량을 select / insert / update /
-- delete 할 수 있다. 같은 파일의 이웃 테이블 `winning_base_data`(:2114-2117)와
-- `winning_db_inputs`(:2119-2122)는 이미 `is_admin()`으로 잠겨 있고 **이 테이블만
-- 예외**다 — 운영에서 문제가 드러나지 않았던 건 지금까지 이 Supabase에
-- authenticated로 붙는 계정이 사실상 어드민뿐이었기 때문이다. 수행평가를
-- 인앱으로 들이면 **학생 계정이 같은 프로젝트에 authenticated로 붙는다.**
-- 그 순간 유료 상품의 원천 자산인 지식베이스가 읽기는 물론 수정·삭제까지
-- 열린다. 그래서 이식 브랜치의 첫 마이그레이션이 이 파일이다.
--
-- ---------------------------------------------------------------------
-- (1-a) 판정 함수 선택 — `is_admin()` 이다 (`is_winning_admin()` 아님)
-- ---------------------------------------------------------------------
-- README 「RLS admin 판정」은 "새 admin write 정책은 `is_winning_admin()`을
-- 따르라"고 적고 있으나, 이 테이블은 그 관례의 대상(= 31번이 판정을 교체한
-- **랜딩 계열** 테이블)이 아니며 아래 사유로 `is_admin()`을 쓴다.
--
--   public.is_admin()          (00_base_schema.sql:1273-1286)
--     profiles.id = auth.uid() AND role = 'admin'
--
--   public.is_winning_admin()  (00_base_schema.sql:1338-1353)
--     ( profiles.id = auth.uid()
--       OR lower(profiles.email) = lower(auth.jwt() ->> 'email') )
--     AND role IN ('admin','admin_basic','admin_manager','admin_master')
--
-- 두 함수의 실제 차이는 두 가지다.
--
--   ㄱ. role 집합 — `is_winning_admin()`이 추가로 인정하는 3개 값
--      ('admin_basic','admin_manager','admin_master')은 **이 DB에서 존재할 수
--      없다.** `profiles_role_check`(00_base_schema.sql:815)가
--      `role = ANY (ARRAY['user','admin'])`로 값을 두 개로 제한하기 때문이다.
--      즉 role 집합 확장분은 이 프로젝트에선 순전한 사문(死文)이고,
--      두 함수의 유효 판정 대상은 사실상 'admin' 하나로 동일하다.
--      (그 4단계 role 체계는 외부 위닝 앱 쪽 잔재다.)
--
--   ㄴ. 매칭 축 — `is_winning_admin()`은 uid 외에 **JWT의 email 문자열**로도
--      profiles 행을 찾는다. `profiles.email`에는 UNIQUE 제약이 없으므로
--      (00_base_schema.sql:790 부근 — id만 PK) 같은 이메일을 가진 행이 둘
--      이상 존재하면 uid가 다른 계정도 admin 행에 매칭되어 참이 된다.
--      지식베이스는 유료 상품의 원천 자산이라 판정 축을 넓힐 이유가 없다.
--      uid 단일 축인 `is_admin()`이 더 좁고, 좁은 쪽이 옳다.
--
-- README가 `is_winning_admin()`을 못박은 실제 사유는 "profiles 정책이 profiles를
-- 재참조하면 42P17 infinite recursion"인데, 이는 **두 함수 모두 SECURITY
-- DEFINER라 똑같이 해소한다** — 그 사유는 둘을 가르지 못한다. 반면
-- 이 테이블의 형제인 `winning_base_data` / `winning_db_inputs`가 이미
-- `is_admin()`을 쓰고 있어 winning_* 계열 내부 일관성도 `is_admin()` 쪽이다.
-- 명세서 로드맵 P1 ⑤도 같은 판정을 명시한다("인증 = Bearer + `is_admin()`
-- ... `is_winning_admin()`이 아니다").
--
-- ---------------------------------------------------------------------
-- (1-b) 읽기 정책 — "서버 경유"를 어떻게 구현했는가
-- ---------------------------------------------------------------------
-- 목표는 두 가지이고 서로 충돌한다:
--   · 학생/일반 회원의 **클라이언트 직접 select 차단**
--   · 어드민 화면의 **직접 조회 경로 보존**
--
-- 실측: `src/pages/Admin.jsx`의 위닝DB 3개 섹션(`winningSuhaengTopicDb`:2094,
-- `winningSuhaengResourceDb`:2159, `winningStudentRecordDb`:2236)은 전부
-- `table: 'winning_assessment_knowledge_items'`이고, 제네릭 CRUD 경로가
-- **브라우저 supabase 클라이언트(사용자 세션 = authenticated 롤)** 로
-- 이 테이블을 직접 친다:
--   select : `src/pages/Admin.jsx:6115`  supabase.from(config.table).select('*')
--   insert : `:6259-6273`
--   update : `:6332`
--   delete : `:6305`
-- 즉 **서버 라우트를 경유하지 않는다.** 여기서 select를 통째로 막으면
-- 어드민의 위닝DB 3개 화면이 그대로 죽는다.
--
-- 따라서 읽기는 "전면 차단"이 아니라 **"어드민만 허용"** 으로 좁힌다.
-- 서버(RAG) 경로는 `api/_lib/dynamic-knowledge.js`가 service_role 키로 붙고
-- service_role은 **RLS를 우회**하므로 정책을 하나도 주지 않아도 그대로 읽힌다
-- (RPC `match_winning_suhaeng_all_subjects`는 SECURITY INVOKER라 호출자
-- 권한으로 도는데, 호출자가 service_role이므로 동일하게 통과한다).
-- 결과 접근 행렬:
--   anon                    → 전면 거부 (정책 없음)
--   authenticated / 학생    → 전면 거부 (is_admin() = false)
--   authenticated / 어드민  → select+insert+update+delete 전부 허용
--   service_role (서버)     → RLS 우회, 그대로 허용
--
-- 정책은 형제 테이블(`winning_base_data_admin_all` 등)과 같은 관용구로
-- `for ALL` 1개만 둔다. `for ALL`은 select를 포함하므로 읽기 전용 정책을
-- 따로 두면 같은 술어(is_admin())가 중복될 뿐이다.
--
-- ⚠ `revoke all on table ... from anon, authenticated`는 **걸지 않는다.**
--   테이블 권한은 RLS보다 먼저 평가되고 어드민도 DB 레벨에선 동일한
--   authenticated 롤이라, 회수하면 위 어드민 경로가 함께 죽는다
--   (46번의 컬럼 GRANT 기각 사유, 52번이 같은 함정을 다시 기록).
--
-- ---------------------------------------------------------------------
-- (2) source_link — 왜 컬럼을 만드는가
-- ---------------------------------------------------------------------
-- 외부 앱 `api/_lib/dynamic-knowledge.js`의 `getRowSourceLink`는 출처 링크를
-- `source_link`/`source_url`/`url`/`link`/`reference_url`/... 10개 키에서 찾고
-- `meta`/`metadata`/`extra`를 JSON 파싱까지 하지만, **그 컬럼이 목적지
-- 테이블에 하나도 없다.** 10키 탐색과 JSON 파싱은 전부 no-op이고 실효 경로는
-- 마지막 한 줄, `row.source` 본문에 대한 `/https?:\/\/[^\s)]+/i` 정규식뿐이다.
-- 즉 이 다중 탐색은 **컬럼이 없어서 생긴 우회**다. 컬럼을 만들면 우회 전체가
-- 사라지고 링크가 본문에서 분리된다(현재는 `출처 정보: https://... 최종덕`처럼
-- URL과 저자명이 한 필드에 뒤엉켜 있다).
--
-- 백필은 그 정규식을 SQL로 그대로 옮긴 것이다 — 판정이 달라지면 이식 전후
-- 출력이 달라지므로 의도적으로 동일하게 맞췄다(아래 (2-b) 주석 참고).
-- 백필로 채워지지 않는 행이 남는 것은 정상이다(출처 링크가 애초에 없는 행).
--
-- ---------------------------------------------------------------------
-- (3) RPC 재생성 — 무엇을 바꾸고 무엇을 안 바꾸는가
-- ---------------------------------------------------------------------
-- 바꾸는 것 2개:
--   · RETURNS TABLE 에 `source_link text` 추가 (기존 10컬럼은 순서·이름·타입
--     그대로 두고 similarity 앞에 append)
--   · `filter_subject text DEFAULT NULL` 파라미터 추가 (맨 뒤)
--     (`filter_grade`와 같은 모양으로 '공통'/'전체'/'확인 필요' 폴백을 둔다
--      — 명세서 §8:1862. 정확 일치로 좁히면 과목 무관 태그 행이 벡터 경로에서
--      조용히 빠진다)
-- 안 바꾸는 것 (기존 호출부 보호):
--   · 기존 5개 파라미터의 이름·타입·순서·기본값 (`match_threshold` 0.52 포함)
--   · `filter_grade`의 '공통'/'전체'/'확인 필요' 폴백
--   · `knowledge_type in ('topic_pattern','verified_resource')` 제한
--   · `limit least(match_count, 20)` 상한, `language sql` / `stable`
--
-- RETURNS TABLE 이 바뀌므로 `create or replace`가 42P13으로 거부된다 →
-- 반드시 DROP 후 재생성이다. 또한 파라미터를 뒤에 추가하면 **구 5인자 함수가
-- 남아 있을 경우 오버로드 2개가 공존**하고, PostgREST가 구 이름 5개로 호출할 때
-- 두 후보 모두 매칭되어 42725(function is not unique)가 난다. 그래서 아래
-- do 블록이 이름이 같은 **모든 오버로드를 oid로 훑어 drop**한다 —
-- 인자 타입을 손으로 적어 맞히는 방식(`drop function ...(vector, text, ...)`)은
-- vector 타입이 extensions 스키마에 있어(00_base_schema.sql:28) search_path에
-- 따라 빗나갈 수 있다.
--
-- 의존성:
--   - 00_base_schema.sql : winning_assessment_knowledge_items, is_admin(),
--                          match_winning_suhaeng_all_subjects, extensions.vector
--   다른 마이그레이션과 독립 실행 가능.
--
-- 배포 순서:
--   이 파일을 **먼저** 실행한 뒤 수행평가 이식 코드를 배포한다. 컬럼·반환
--   컬럼이 없는 상태로 새 코드가 뜨면 `source_link`가 undefined로 조용히
--   비고, `filter_subject`를 넘기는 순간 PGRST202로 RPC 호출이 전량 실패한다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) RLS — 전면 개방 정책 폐기 후 is_admin() 단일 정책으로 교체
-- ---------------------------------------------------------------------
alter table public.winning_assessment_knowledge_items enable row level security;

-- 이 테이블의 **모든** 기존 정책을 pg_policies 로 훑어 제거한다.
--
-- ⚠ 이름을 손으로 적어 지우는 방식(`drop policy if exists "authenticated can
--   manage winning assessment knowledge"`)은 쓰지 않는다. PERMISSIVE 정책은
--   **OR 로 결합**되므로 대상 DB에 이름이 다른 개방 정책이 하나라도 남아 있으면
--   아래 is_admin() 정책은 아무것도 막지 못하고 테이블은 계속 전면 개방이다.
--   그런데 `drop policy if exists` 는 대상이 없으면 조용한 no-op 이라 마이그레이션은
--   **에러 없이 성공**으로 끝나고, 뚫린 사실이 은폐된다.
--   정책 이름의 근거는 `00_base_schema.sql:2109`(dev 에서 재생성한 덤프) 하나뿐인데
--   이 repo 는 dev ↔ 운영 drift 를 전제로 운용한다(README 「운영 반영은 dev 덤프
--   재생성 후 운영과 diff」). 운영에 과거 다른 이름으로 만든 정책이 남아 있으면
--   이 파일의 유일한 목적(학생 계정 인앱 진입 전에 지식베이스 잠그기)이
--   침묵 속에 실패한다.
--   (3-a) 가 함수 오버로드에 대해 oid 로 훑는 것과 같은 방어를 정책에도 적용한다.
--
-- 이 테이블의 최종 상태는 정책 정확히 1개(`winning_assessment_knowledge_admin_all`)
-- 이므로, drop-all 후 재생성해도 멱등성은 그대로다.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'winning_assessment_knowledge_items'
  loop
    raise notice '53_performance: dropping policy %', pol.policyname;
    execute format(
      'drop policy if exists %I on public.winning_assessment_knowledge_items',
      pol.policyname
    );
  end loop;
end;
$$;

create policy "winning_assessment_knowledge_admin_all"
    on public.winning_assessment_knowledge_items
    as PERMISSIVE for ALL to authenticated
    using (public.is_admin())
    with check (public.is_admin());

comment on table public.winning_assessment_knowledge_items is
    '수행평가 RAG 지식베이스. RLS: 어드민(is_admin())만 직접 CRUD, 그 외 authenticated/anon 전면 거부. 서버 RAG 경로는 service_role(RLS 우회)로만 읽는다.';

-- (1-c) 검증 — 정책이 정확히 1개인지 확인하고, 아니면 터뜨린다.
--       위 drop-all 이 어떤 이유로든 빠뜨린 개방 정책이 남으면 OR 결합으로
--       테이블이 계속 열린 채인데, 마이그레이션은 조용히 성공해버린다.
--       그 침묵을 막는 것이 이 블록의 유일한 목적이다.
do $$
declare
  pol_count integer;
  pol_names text;
begin
  select count(*), coalesce(string_agg(policyname::text, ', ' order by policyname), '(none)')
    into pol_count, pol_names
    from pg_policies
   where schemaname = 'public'
     and tablename = 'winning_assessment_knowledge_items';

  if pol_count <> 1 then
    raise exception
      '53_performance: winning_assessment_knowledge_items 정책이 %개다 (기대 1). 남은 정책: % — PERMISSIVE 정책은 OR 결합이라 개방 정책이 하나라도 남으면 is_admin() 잠금이 무효다.',
      pol_count, pol_names;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- (2) source_link 컬럼 신설
-- ---------------------------------------------------------------------
alter table public.winning_assessment_knowledge_items
    add column if not exists source_link text;

comment on column public.winning_assessment_knowledge_items.source_link is
    '출처 원문 링크(URL 단일 값). source 컬럼은 "저자·기관·출처 설명" 자유 텍스트이고, 링크는 이 컬럼으로 분리한다.';


-- ---------------------------------------------------------------------
-- (2-b) 기존 행 백필 — source 본문에서 URL 추출
--
-- 외부 앱 판정(api/_lib/dynamic-knowledge.js `getRowSourceLink` 말미):
--     const urlMatch = String(row.source || '').match(/https?:\/\/[^\s)]+/i);
-- 을 PostgreSQL ARE 정규식으로 그대로 옮긴 것이다:
--     substring(source from '(?i)(https?://[^\s)]+)')
--   · `(?i)`      = JS 의 /i 플래그 (HTTP://, HttpS:// 도 매칭)
--   · `[^\s)]+`   = 공백류와 닫는 괄호 직전까지 (PostgreSQL ARE 는 대괄호
--                   안에서도 \s 축약을 지원한다)
--   · 바깥 괄호는 캡처 그룹이다 — `substring(x from pattern)` 은 패턴에
--     캡처 그룹이 있으면 **첫 그룹**을, 없으면 전체 매치를 돌려준다.
--     `(?i)` 는 캡처 그룹이 아니라 embedded option 이지만, 반환 규칙이
--     구현 세부에 흔들리지 않도록 URL 자체를 명시적으로 감쌌다.
--   · 첫 매치 1개만 취한다 — JS `String.match`(g 없음)와 동일
--   · 끝에 붙은 마침표·쉼표를 떼어내지 않는 것까지 원본과 동일하게 둔다.
--     여기서 다듬으면 이식 전후 출력이 달라지므로 의도적으로 맞춘 것이다.
--
-- 이미 값이 있는 행은 건드리지 않는다(어드민이 손으로 넣은 값 보호) →
-- 재실행해도 결과가 변하지 않는다. 별도 마커 테이블이 필요 없는 이유다.
-- 이 테이블에는 updated_at 트리거가 없으므로(00_base_schema.sql 에 winning_*
-- 트리거 0건) 백필이 갱신시각을 흔들지 않는다.
-- ---------------------------------------------------------------------
update public.winning_assessment_knowledge_items w
   set source_link = substring(w.source from '(?i)(https?://[^\s)]+)')
 where (w.source_link is null or btrim(w.source_link) = '')
   and w.source is not null
   and w.source ~ '(?i)https?://';


-- ---------------------------------------------------------------------
-- (3) RPC 재생성
-- ---------------------------------------------------------------------

-- (3-a) 같은 이름의 모든 오버로드 제거.
--       파라미터 추가로 시그니처가 바뀌므로 구 5인자 함수가 남으면
--       PostgREST 호출이 42725(function is not unique)로 깨진다.
--       인자 타입을 손으로 적지 않고 oid로 훑는다 — vector 타입이
--       extensions 스키마라 이름 해석이 search_path에 좌우되기 때문.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'match_winning_suhaeng_all_subjects'
  loop
    -- raise 를 drop 보다 먼저 한다 — regprocedure 는 대상이 이미 사라지면
    -- 시그니처 대신 숫자 oid 로 출력된다.
    raise notice '53_performance: dropping %', fn.sig::text;
    execute format('drop function if exists %s', fn.sig);
  end loop;
end;
$$;

-- (3-b) 재생성.
--       기존 5개 파라미터는 이름·타입·순서·기본값 그대로, 신규
--       filter_subject 만 맨 뒤에 default null 로 붙는다. 따라서 기존
--       호출부(이름 기반 5키 전달)는 시그니처 변경을 인지하지 못한 채
--       그대로 동작한다.
create or replace function public.match_winning_suhaeng_all_subjects(
    query_embedding vector,
    filter_knowledge_type text,
    filter_grade text DEFAULT NULL::text,
    match_count integer DEFAULT 10,
    match_threshold double precision DEFAULT 0.52,
    filter_subject text DEFAULT NULL::text
)
 RETURNS TABLE(
    id uuid,
    knowledge_type text,
    grade text,
    subject text,
    career_field text,
    title text,
    content text,
    source text,
    source_link text,
    memo text,
    similarity double precision
 )
 LANGUAGE sql
 STABLE
AS $function$
  select
    w.id,
    w.knowledge_type,
    w.grade,
    w.subject,
    w.career_field,
    w.title,
    w.content,
    w.source,
    w.source_link,
    w.memo,
    1 - (w.embedding <=> query_embedding) as similarity
  from public.winning_assessment_knowledge_items w
  where w.is_active = true
    and coalesce(w.rag_use, true) = true
    and w.embedding is not null
    and w.knowledge_type in ('topic_pattern', 'verified_resource')
    and w.knowledge_type = filter_knowledge_type
    and (
      filter_grade is null
      or w.grade = filter_grade
      or w.grade in ('공통', '전체', '확인 필요')
    )
    -- filter_subject: null 이면 과목 필터 없음(= 이 파일 이전의 동작 그대로).
    -- 값이 있으면 해당 과목 + 과목 무관 태그('공통'/'전체'/'확인 필요')를 통과시킨다.
    --
    -- 바로 위 filter_grade 절과 **같은 모양**이다. 명세서 §8
    -- (docs/수행평가-상세-명세.md:1862)이 "grade와 동일하게 '공통'/'전체'/
    -- '확인 필요' 허용"을 지시하고, 레거시 키워드 경로도 '공통'/'전체'를 후보에
    -- 넣는다(외부 앱 api/_lib/dynamic-knowledge.js:282-289 subjectCandidates).
    -- 정확 일치로 좁히면 subject 가 '공통'/'전체'로 태깅된 행이 벡터 경로에서
    -- **에러 없이** 통째로 빠져 리콜만 조용히 줄고 키워드 폴백으로 떨어진다
    -- (명세서 §8:1853이 지목하는 실패 양식과 동일). 그래서 폴백을 넣는다.
    and (
      filter_subject is null
      or w.subject = filter_subject
      or w.subject in ('공통', '전체', '확인 필요')
    )
    and 1 - (w.embedding <=> query_embedding) >= match_threshold
  order by w.embedding <=> query_embedding asc
  limit least(match_count, 20);
$function$;

comment on function public.match_winning_suhaeng_all_subjects(vector, text, text, integer, double precision, text) is
    '수행평가 RAG 전과목 벡터 검색. 53_performance.sql에서 source_link 반환 컬럼과 filter_subject 파라미터를 추가. SECURITY INVOKER이므로 service_role(RLS 우회) 또는 어드민 세션에서만 결과가 나온다.';


-- ---------------------------------------------------------------------
-- (참고) 인덱스는 건드리지 않는다
--   · winning_suhaeng_embedding_hnsw_idx (00_base_schema.sql:1101)
--     = hnsw (embedding vector_cosine_ops) where embedding is not null.
--     RPC가 쓰는 거리 연산자가 `<=>`(코사인)이라 opclass가 일치하고,
--     부분 인덱스 술어도 RPC의 `w.embedding is not null` 조건과 일치해
--     그대로 사용된다. 교정할 것이 없다.
--   · winning_suhaeng_filter_idx (:1102)
--     = btree (knowledge_type, grade, is_active, rag_use) — subject 없음.
--     다만 subject 를 포함한 btree 는 이미 따로 있다:
--     idx_winning_assessment_knowledge_lookup (:1099)
--     = btree (is_active, grade, subject, knowledge_type).
--     filter_subject 추가에 맞춰 인덱스를 새로 만들거나 고치는 안은
--     **보류**한다 — 실행계획의 주 드라이버는 HNSW 스캔이고, 선택도 이득이
--     측정되지 않은 상태에서 인덱스를 늘리면 쓰기 비용만 확실히 는다.
--     이식 후 threshold 재측정(명세서 §8)과 함께 실측으로 판단한다.
-- ---------------------------------------------------------------------
