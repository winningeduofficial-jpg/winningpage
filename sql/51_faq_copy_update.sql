-- =====================================================================
-- FAQ 카피 갱신 (2026-08-07 운영팀 원고) — 카테고리 라벨 1건 rename +
-- 답변 6행 문구 교정.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- ★ 적용 순서: 이 SQL을 dev/운영에 먼저 실행한 뒤 프런트를 배포할 것.
--   src/data/faqCategories.js 의 라벨이 '학교·기관 도입 (B2G)' →
--   '학교 및 기관 도입' 으로 바뀌는데, DB category 는 이 한글 표시값을 그대로
--   저장한다(45번 파일의 설계). SQL 없이 프런트만 올리면 옛 라벨로 저장된
--   3행이 어떤 카테고리 탭에도 안 잡히고 '전체' 탭에만 노출된다
--   (Faq.jsx:62 visibleTabs 가 FAQ_CATEGORIES 와의 교집합만 탭으로 그린다).
--   컬럼 추가가 없어 PGRST204 류의 저장 실패는 없다 — 조용한 카피 누락이다.
--
-- 왜 "전체 재삽입"이 아니라 "부분 UPDATE" 인가:
--   2026-08-07 원고를 45번 시드/현 dev DB 30행과 기계 대조한 결과
--   질문 30개는 순서·문구까지 100% 동일, 답변은 30개 중 29개가 동일했다.
--   실제 차이는 (1) 카테고리 라벨 1개, (2) 답변 1개(환불 안내 경로) 뿐이고
--   여기에 사용자가 별도로 확정한 명백한 오타 교정 5건을 더한 것이 전부다.
--   즉 30행을 delete + insert 하면 얻는 것은 없고, id(uuid)가 전부 새로
--   발급되면서 어드민이 편집한 이력·정렬 기준과 앞으로 붙을 참조가 흔들린다.
--   → 행을 지우지 않는다. sort_order / is_active / id 도 건드리지 않는다.
--
-- content_json 을 jsonb_set 으로만 손대는 이유:
--   dev DB 30행 실측상 전부 blocks 길이 1 / type='paragraph' /
--   blocks[0].content 길이 1 이며, blocks[0].content[0].text = answer 가
--   30/30 일치한다. 그래서 '{blocks,0,content,0,text}' 하나만 교체하면
--   블록 UUID·editor 버전('blocknote@0.52.1')·props 가 전부 보존된다.
--   봉투를 통째로 다시 쓰면 새 UUID 를 지어내야 하고, 어드민 에디터가
--   기존 블록을 다른 블록으로 인식하게 된다. → 새 UUID 를 만들지 않는다.
--   jsonb_set 은 strict 함수라 content_json 이 null 인 행은 null 그대로
--   남는다(오염 없음). answer(text)는 평문 미러이므로 함께 갱신한다.
--
-- 멱등성 규약:
--   모든 UPDATE 의 where 절에 "옛 문구가 아직 남아 있는가" 조건을 넣었다.
--   최초 실행은 대상 행에 적중하고, 재실행은 조용히 0행이 된다. 조용한
--   0행이 "적용됨"인지 "애초에 안 맞았음"인지 구분되지 않으므로, 파일
--   하단 검증 SELECT 로 실제 반영 여부를 눈으로 확인할 것.
--   updated_at 은 기존 트리거가 알아서 갱신하므로 직접 대입하지 않는다.
--
-- 보류(이 파일 범위 밖 — 사용자가 명시적으로 보류한 항목):
--   1) '2026년 9월 정식 오픈 하였습니다' 의 시제. 오늘(2026-08-07) 기준
--      미래인 9월을 과거형으로 서술하고 있으나 원고 그대로 둔다.
--   2) '고객센터(이메일/전화번호 입력 예정)' 플레이스홀더. 연락처 확정 후
--      별도 UPDATE 로 처리한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 카테고리 라벨 rename — 3행 ('학교·기관 도입 (B2G)' → '학교 및 기관 도입')
--    45번 시드에서 이 카테고리를 쓰는 행은 정확히 3건이다.
--    CHECK 제약이 없으므로(45번 파일의 의도적 판단) 라벨 변경에 스키마
--    변경이 필요 없다 — 값만 바꾸면 된다.
--    where 절이 곧 멱등 가드다(재실행 시 0행).
-- ---------------------------------------------------------------------
update public.faqs
   set category = '학교 및 기관 도입'
 where category = '학교·기관 도입 (B2G)';


-- ---------------------------------------------------------------------
-- 2) 답변 문구 갱신 — 6행
--    각 행마다 answer(평문 미러)와 content_json(정본 블록 봉투)을 같은
--    replace() 로 함께 갱신해 둘이 어긋나지 않게 한다.
--    행 식별은 question 으로 한다 — 30문항 전체에서 유일하고, 카테고리는
--    어드민에서 바뀔 수 있는 값이라 식별자로 삼지 않는다.
-- ---------------------------------------------------------------------

-- (2-1) [내용 변경] 환불 신청 경로 — 2026-08-07 원고 반영.
--   '온라인신청' → '마이페이지 내 수강/결제내역'
--   최종 문구:
--     환불 절차와 기준은 「결제서비스 이용약관」 및 관련 법령(전자상거래법
--     등)을 준수하며 마이페이지 내 수강/결제내역 또는 고객센터를 통해
--     환불을 신청하실 수 있습니다.
--   30개 답변 중 유일하게 "오타 교정"이 아닌 실제 내용 변경이다.
update public.faqs
   set answer = replace(answer, '온라인신청', '마이페이지 내 수강/결제내역'),
       content_json = jsonb_set(
         content_json,
         '{blocks,0,content,0,text}',
         to_jsonb(replace(content_json #>> '{blocks,0,content,0,text}', '온라인신청', '마이페이지 내 수강/결제내역')::text)
       )
 where question = '환불은 어떻게 신청하나요?'
   and answer like '%온라인신청%';

-- (2-2) [오타] 띄어쓰기 — '구성 됩니다' → '구성됩니다'
update public.faqs
   set answer = replace(answer, '구성 됩니다', '구성됩니다'),
       content_json = jsonb_set(
         content_json,
         '{blocks,0,content,0,text}',
         to_jsonb(replace(content_json #>> '{blocks,0,content,0,text}', '구성 됩니다', '구성됩니다')::text)
       )
 where question = '목표관리, 수행평가 외에 다른 서비스도 있나요?'
   and answer like '%구성 됩니다%';

-- (2-3) [오타] 이중 공백 — '로그인 후  목표관리서비스' (공백 2칸) → 공백 1칸
update public.faqs
   set answer = replace(answer, '로그인 후  목표관리서비스', '로그인 후 목표관리서비스'),
       content_json = jsonb_set(
         content_json,
         '{blocks,0,content,0,text}',
         to_jsonb(replace(content_json #>> '{blocks,0,content,0,text}', '로그인 후  목표관리서비스', '로그인 후 목표관리서비스')::text)
       )
 where question = '목표 설정은 어떻게 진행되나요?'
   and answer like '%로그인 후  목표관리서비스%';

-- (2-4) [오타] 조사 — '무료 진단서비스은' → '무료 진단서비스는'
update public.faqs
   set answer = replace(answer, '무료 진단서비스은', '무료 진단서비스는'),
       content_json = jsonb_set(
         content_json,
         '{blocks,0,content,0,text}',
         to_jsonb(replace(content_json #>> '{blocks,0,content,0,text}', '무료 진단서비스은', '무료 진단서비스는')::text)
       )
 where question = '리포트는 얼마나 자주 받을 수 있나요?'
   and answer like '%무료 진단서비스은%';

-- (2-5) [오타] 오타 — '업로드 및 관룐 자료를' → '업로드 및 관련 자료를'
update public.faqs
   set answer = replace(answer, '업로드 및 관룐 자료를', '업로드 및 관련 자료를'),
       content_json = jsonb_set(
         content_json,
         '{blocks,0,content,0,text}',
         to_jsonb(replace(content_json #>> '{blocks,0,content,0,text}', '업로드 및 관룐 자료를', '업로드 및 관련 자료를')::text)
       )
 where question = '학교생활기록부(학생부) 파일을 업로드해야 하나요?'
   and answer like '%업로드 및 관룐 자료를%';

-- (2-6) [오타] 이중 공백 — '2026년 9월  정식' (공백 2칸) → 공백 1칸
--   ※ '오픈 하였습니다' 시제는 위 헤더 주석대로 의도적으로 손대지 않는다.
update public.faqs
   set answer = replace(answer, '2026년 9월  정식', '2026년 9월 정식'),
       content_json = jsonb_set(
         content_json,
         '{blocks,0,content,0,text}',
         to_jsonb(replace(content_json #>> '{blocks,0,content,0,text}', '2026년 9월  정식', '2026년 9월 정식')::text)
       )
 where question = '서비스는 언제 정식 오픈하나요?'
   and answer like '%2026년 9월  정식%';


-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- -- (a) 카테고리 분포. 기대: 7개 라벨 6/5/4/5/4/3/3 이고
-- --     '학교 및 기관 도입' 3건, '학교·기관 도입 (B2G)' 0건.
-- select category, count(*) from public.faqs group by 1 order by 1;
-- select count(*) as should_be_zero from public.faqs
--  where category = '학교·기관 도입 (B2G)';
--
-- -- (b) 수정 대상 6행의 answer 확인. 옛 문구가 0건이어야 정상.
-- select question, answer from public.faqs
--  where question in (
--    '환불은 어떻게 신청하나요?',
--    '목표관리, 수행평가 외에 다른 서비스도 있나요?',
--    '목표 설정은 어떻게 진행되나요?',
--    '리포트는 얼마나 자주 받을 수 있나요?',
--    '학교생활기록부(학생부) 파일을 업로드해야 하나요?',
--    '서비스는 언제 정식 오픈하나요?'
--  )
--  order by sort_order;
--
-- -- (c) 옛 문구 잔존 검사 — 6행 전부 0 이어야 정상.
-- --     (재실행 시 UPDATE 가 조용히 0행이 되므로 "적용됨"을 이걸로 판정한다)
-- select
--   count(*) filter (where answer like '%온라인신청%')          as old_refund,
--   count(*) filter (where answer like '%구성 됩니다%')          as old_spacing1,
--   count(*) filter (where answer like '%로그인 후  목표관리%')  as old_dblspace1,
--   count(*) filter (where answer like '%무료 진단서비스은%')    as old_josa,
--   count(*) filter (where answer like '%관룐 자료%')            as old_typo,
--   count(*) filter (where answer like '%9월  정식%')            as old_dblspace2
--   from public.faqs;
--
-- -- (d) answer(평문 미러) 와 content_json(정본) 동기 확인.
-- --     45번 시드 구조상 30행 전부 일치해야 한다 → synced=30, mismatched=0.
-- select
--   count(*) filter (where content_json #>> '{blocks,0,content,0,text}' = answer) as synced,
--   count(*) filter (where content_json #>> '{blocks,0,content,0,text}' is distinct from answer) as mismatched
--   from public.faqs;
--
-- -- (e) 블록 봉투가 보존됐는지(새 UUID 를 만들지 않았는지) 확인.
-- --     editor 는 전부 'blocknote@0.52.1', blocks 길이는 전부 1 이어야 한다.
-- select content_json ->> 'editor' as editor,
--        jsonb_array_length(content_json -> 'blocks') as block_count,
--        count(*)
--   from public.faqs
--  where content_json is not null
--  group by 1, 2;
-- =====================================================================
