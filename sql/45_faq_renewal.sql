-- =====================================================================
-- 자주 묻는 질문(FAQ) 페이지 리뉴얼 — 카테고리 탭 + 블록 에디터 본문.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- ★ 적용 순서: 이 SQL을 dev/운영에 먼저 실행한 뒤 프런트를 배포할 것 —
--   컬럼이 없으면 어드민 저장이 PGRST204(스키마 캐시에 없는 컬럼)로 실패한다.
--
-- 배경:
--   1) 카테고리는 한글 표시값을 DB에 그대로 저장한다(슬러그 금지). 저장소
--      최신 선례(44_special_highschool.sql의 school_type)가 '자사고' 같은
--      한글 원시값을 그대로 저장하고, Admin.jsx의 searchable()이 원시값을
--      join해 검색하므로 슬러그면 어드민 검색이 깨진다. 라벨 정본은
--      src/data/faqCategories.js 이며, 운영팀 확정에 따라 다음 7개로
--      확정됐다: 서비스 소개 / 회원가입 및 이용환경 / 서비스 이용 방법 /
--      개인정보 및 데이터 보안 / 요금제 및 결제 / 학교·기관 도입 (B2G) /
--      기타 문의.
--   2) 본문은 교육칼럼(37_column_block_content.sql)과 동일한 이중 저장
--      구조로 전환한다: content_json(jsonb, BlockNote 블록 봉투)이 정본,
--      기존 answer(text)는 평문 미러로 계속 유지한다.
--
-- CHECK 제약을 걸지 않는 이유(계약 §1 명시 사항):
--   카테고리 라벨이 확정됐어도 CHECK는 걸지 않는다. FAQ 카테고리는 고정된
--   분류 체계가 아니라 운영팀이 언제든 이름을 바꿀 수 있는 편집 가능한
--   운영 카피이기 때문이다. 44번 파일의 school_type(자사고/외고/…)은
--   외부에 실재하는 제도적 분류라 CHECK가 타당했지만, 이 category는 그
--   전제가 성립하지 않는다. 입력 통제는 어드민 select(FAQ_CATEGORIES)가
--   담당하며, CHECK를 걸면 라벨을 바꿀 때마다 마이그레이션이 필요해진다.
--   실제로 44번의 school_type CHECK는 이미 한 번 대가를 치렀다 — 부산
--   국제고 분류가 바뀌면서 정정 UPDATE를 파일 끝에 덧붙여야 했다. 같은
--   함정을 반복하지 않는다.
--
-- RLS: public.faqs 에는 이미 faqs_public_read / faqs_admin_all 정책이
--   존재한다(00_base_schema.sql). 신규 컬럼은 컬럼 단위 정책이 아니므로
--   기존 정책이 자동으로 커버한다 — 이 파일에서 정책을 건드리지 않는다.
--   [참고, 이 파일 범위 아님] faqs_admin_all은 public.is_admin()(role='admin'
--   단일값)을 쓰고, 41/44번 신규 테이블들은 public.is_winning_admin()
--   (admin_basic/manager/master 포함)을 쓴다. 이 불일치는 실재하지만
--   faqs RLS 정책 자체를 바꾸는 건 이 파일의 범위가 아니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) category : 카테고리 탭 값(한글 표시값 그대로 저장, 슬러그 금지)
-- ---------------------------------------------------------------------
alter table public.faqs
  add column if not exists category text not null default '';

-- ---------------------------------------------------------------------
-- 2) content_json : 답변 본문 블록 에디터 정본
--    봉투 형식: { v: 1, editor: 'blocknote@0.52.1', blocks: [...] }
--    기존 answer(text)는 삭제하지 않고 평문 미러로 계속 동기 기록한다.
-- ---------------------------------------------------------------------
alter table public.faqs
  add column if not exists content_json jsonb;

-- ---------------------------------------------------------------------
-- 2-1) 시드 데이터: 운영팀 제공 위닝에듀_FAQ.docx (2026-08-06 수령) 원본
--      7개 카테고리 30문항 전량.
--      content_json은 각 답변을 단일 문단 블록 1개로 변환한 것이며,
--      부분 볼드·링크 같은 서식이 필요하면 어드민 블록 에디터에서 편집한다.
--      answer(text)는 content_json과 동일 원문의 평문 미러다.
--
-- [원문 그대로] 답변 본문은 운영팀 원고를 한 글자도 고치지 않고 그대로
--   옮겼다. 원문에 오타·중복 공백이 몇 군데 있는 것은 이미 파악됐고,
--   운영팀 카피이므로 임의로 다듬지 않기로 결정됐다.
-- [멱등] category+question 조합으로 이미 존재하는 행은 건너뛴다. 관리자가
--   어드민에서 문항을 수정·삭제한 뒤 이 파일을 재실행해도 그 행은 다시
--   덮어써지지 않는다(질문 문구를 그대로 유지한 수정에 한함).
-- [sort_order 전역 연번] 아래 sort_order는 카테고리별 1..N이 아니라 전역
--   1..30이다. 공개 페이지 쿼리(Faq.jsx)가 category 필터 없이
--   `order by sort_order asc, created_at desc`로 전체 목록을 한 번에
--   정렬하므로, 카테고리별로 1부터 다시 매기면 '전체' 탭에서 각 카테고리의
--   1번들이 앞으로 몰려 문서 순서와 무관하게 뒤섞인다. 행 순서는 이미
--   문서(카테고리) 순서대로 나열돼 있으므로 n번째 행에 sort_order = n을
--   부여한다. 카테고리별 연번으로 되돌리지 말 것.
-- ---------------------------------------------------------------------
insert into public.faqs
  (category, question, answer, content_json, sort_order, is_active)
select seed.category, seed.question, seed.answer, seed.content_json::jsonb,
       seed.sort_order, seed.is_active
from (values
  ('서비스 소개'::text, '위닝에듀는 어떤 서비스인가요?'::text, '위닝에듀는 입시와 학업을 먼저 경험한 멘토들이 설계한 중·고등학생 전용 진로·학습관리 플랫폼입니다. 목표 설정부터 실행, 점검까지 학생 개개인의 학습 여정을 단계별로 지원하며, AI 멘토링과 자체 노하우와 특허기술 진단을 결합해 막연한 노력이 아닌 방향이 있는 학습을 돕습니다.'::text, '{"v":1,"blocks":[{"id":"ee1ee01b-310f-4dfc-9aca-05e17ae36786","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝에듀는 입시와 학업을 먼저 경험한 멘토들이 설계한 중·고등학생 전용 진로·학습관리 플랫폼입니다. 목표 설정부터 실행, 점검까지 학생 개개인의 학습 여정을 단계별로 지원하며, AI 멘토링과 자체 노하우와 특허기술 진단을 결합해 막연한 노력이 아닌 방향이 있는 학습을 돕습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 1::integer, true::boolean),
  ('서비스 소개'::text, '위닝에듀만의 차별점은 무엇인가요?'::text, '위닝에듀는 “먼저 겪은 멘토들이 만든 플랫폼”이라는 철학 아래, 단순 정보 제공을 넘어 실제 입시·학업을 경험한 멘토의 노하우를 반영했습니다. 목표 수립(위닝 목표관리코칭)과 실행 관리(위닝 수행평가코칭)를 하나의 플랫폼에서 유기적으로 연결해, 계획만 세우고 끝나는 것이 아니라 꾸준한 실행까지 이어지도록 설계된 점이 특징입니다.'::text, '{"v":1,"blocks":[{"id":"cc3bbf97-7507-4451-8e6b-b14dffd9c2b2","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝에듀는 “먼저 겪은 멘토들이 만든 플랫폼”이라는 철학 아래, 단순 정보 제공을 넘어 실제 입시·학업을 경험한 멘토의 노하우를 반영했습니다. 목표 수립(위닝 목표관리코칭)과 실행 관리(위닝 수행평가코칭)를 하나의 플랫폼에서 유기적으로 연결해, 계획만 세우고 끝나는 것이 아니라 꾸준한 실행까지 이어지도록 설계된 점이 특징입니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 2::integer, true::boolean),
  ('서비스 소개'::text, '어떤 학생들이 이용하면 좋은가요?'::text, '고등학생과 중학생 모두 이용할 수 있으며, 특히 목표 대학·진로 방향을 구체화하고 싶은 학생, 스스로 학습 계획을 세우고 점검하는 습관을 기르고 싶은 학생에게 적합합니다. 학부모님도 자녀의 학습 현황을 함께 확인하며 코칭에 참고하실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"5e35b87d-7af0-474b-a950-6d4f1a5a6f86","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"고등학생과 중학생 모두 이용할 수 있으며, 특히 목표 대학·진로 방향을 구체화하고 싶은 학생, 스스로 학습 계획을 세우고 점검하는 습관을 기르고 싶은 학생에게 적합합니다. 학부모님도 자녀의 학습 현황을 함께 확인하며 코칭에 참고하실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 3::integer, true::boolean),
  ('서비스 소개'::text, '위닝 목표관리는 어떤 서비스인가요?'::text, '위닝 목표관리 서비스는 학생의 현재 위치와 희망 진로·목표를 바탕으로 구체적이고 단계적인 목표를 설계해주는 서비스입니다. 막연히 “열심히 하겠다”는 다짐이 아니라, 시기별·과목별로 실현 가능한 목표를 함께 세우고 이를 지속적으로 관리할 수 있도록 돕습니다.'::text, '{"v":1,"blocks":[{"id":"e9b7eeed-da00-4265-8ab4-614b449fed00","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝 목표관리 서비스는 학생의 현재 위치와 희망 진로·목표를 바탕으로 구체적이고 단계적인 목표를 설계해주는 서비스입니다. 막연히 “열심히 하겠다”는 다짐이 아니라, 시기별·과목별로 실현 가능한 목표를 함께 세우고 이를 지속적으로 관리할 수 있도록 돕습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 4::integer, true::boolean),
  ('서비스 소개'::text, '위닝 수행평가는 어떤 서비스인가요?'::text, '위닝 수행평가 서비스는 설정된 목표를 실제로 실행하는 과정을 AI가 함께 점검하고 피드백을 제공하는 서비스입니다. 학습 진행 상황을 학생 스스로 기재하면 AI가 이를 분석해 격려와 보완점을 제시하며, 목표와 실행 사이의 간극을 줄여줍니다.'::text, '{"v":1,"blocks":[{"id":"9fa4433e-4686-465b-941a-0883ad42e7fe","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝 수행평가 서비스는 설정된 목표를 실제로 실행하는 과정을 AI가 함께 점검하고 피드백을 제공하는 서비스입니다. 학습 진행 상황을 학생 스스로 기재하면 AI가 이를 분석해 격려와 보완점을 제시하며, 목표와 실행 사이의 간극을 줄여줍니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 5::integer, true::boolean),
  ('서비스 소개'::text, '목표관리, 수행평가 외에 다른 서비스도 있나요?'::text, '네, 위닝에듀는 목표관리·수행관리 서비스를 포함해 총 6종의 서비스로 구성 됩니다. 6종의 서비스는 다음과 같습니다. 학생학습진단서비스, 목표관리서비스, 수행평가서비스, 자기평가서비스, 심화탐구서비스, 콜멘토서비스 등이 있습니다. 자세한 사항은 서비스 메뉴에서 확인할 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"4d736d21-632d-4060-8330-d946f13b143d","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"네, 위닝에듀는 목표관리·수행관리 서비스를 포함해 총 6종의 서비스로 구성 됩니다. 6종의 서비스는 다음과 같습니다. 학생학습진단서비스, 목표관리서비스, 수행평가서비스, 자기평가서비스, 심화탐구서비스, 콜멘토서비스 등이 있습니다. 자세한 사항은 서비스 메뉴에서 확인할 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 6::integer, true::boolean),
  ('회원가입 및 이용환경'::text, '회원가입은 어떻게 하나요?'::text, '위닝에듀 웹사이트에서 이름, 연락처 등 기본 정보를 입력하고 본인인증을 거쳐 간편하게 가입할 수 있습니다. 가입 과정에서 이용약관, 개인정보처리방침 등 필수 동의 항목에 대한 동의가 필요합니다.'::text, '{"v":1,"blocks":[{"id":"f478db47-de8a-41fa-8903-8062780567d1","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝에듀 웹사이트에서 이름, 연락처 등 기본 정보를 입력하고 본인인증을 거쳐 간편하게 가입할 수 있습니다. 가입 과정에서 이용약관, 개인정보처리방침 등 필수 동의 항목에 대한 동의가 필요합니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 7::integer, true::boolean),
  ('회원가입 및 이용환경'::text, '본인인증은 어떻게 진행되나요?'::text, '결제시에 진행되는 본인인증은 PASS 앱 인증을 통해 진행되며, 주요 안내사항은 카카오 알림톡으로 발송됩니다. 안전한 인증 절차를 통해 본인 확인 및 계정 보안을 강화하고 있습니다.'::text, '{"v":1,"blocks":[{"id":"1d97cf3d-08d4-456b-8ae1-7174e2f2b4d8","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"결제시에 진행되는 본인인증은 PASS 앱 인증을 통해 진행되며, 주요 안내사항은 카카오 알림톡으로 발송됩니다. 안전한 인증 절차를 통해 본인 확인 및 계정 보안을 강화하고 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 8::integer, true::boolean),
  ('회원가입 및 이용환경'::text, '학부모도 자녀의 이용 현황을 확인할 수 있나요?'::text, '회원가입 시 학생·학부모 동의 절차를 통해 서비스가 제공되며, 자녀의 목표 설정 및 학습 진행 현황을 학부모님도 함께 확인하실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"0a442151-8a04-45cc-95ac-35b283c76bcc","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"회원가입 시 학생·학부모 동의 절차를 통해 서비스가 제공되며, 자녀의 목표 설정 및 학습 진행 현황을 학부모님도 함께 확인하실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 9::integer, true::boolean),
  ('회원가입 및 이용환경'::text, 'PC와 모바일 중 어디서 이용할 수 있나요?'::text, '위닝에듀는 웹 기반 플랫폼으로, PC와 모바일 웹 브라우저에서 모두 이용하실 수 있습니다. 별도 앱 설치 없이 접속하실 수 있어 언제 어디서나 편리하게 이용 가능합니다.'::text, '{"v":1,"blocks":[{"id":"8978394d-4324-4772-b00e-1c40ac6dde6e","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝에듀는 웹 기반 플랫폼으로, PC와 모바일 웹 브라우저에서 모두 이용하실 수 있습니다. 별도 앱 설치 없이 접속하실 수 있어 언제 어디서나 편리하게 이용 가능합니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 10::integer, true::boolean),
  ('회원가입 및 이용환경'::text, '형제·자매가 함께 이용할 경우 계정은 어떻게 관리하나요?'::text, '학생 개인별로 각각 계정을 생성하여 이용하시는 것을 권장합니다. 각 계정은 학생 개인의 목표와 학습 데이터를 독립적으로 관리하므로, 형제·자매도 각자의 계정으로 정확한 진단과 멘토링을 받으실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"dd9971a1-4e7c-41b4-b4fd-889e978a9a8e","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"학생 개인별로 각각 계정을 생성하여 이용하시는 것을 권장합니다. 각 계정은 학생 개인의 목표와 학습 데이터를 독립적으로 관리하므로, 형제·자매도 각자의 계정으로 정확한 진단과 멘토링을 받으실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 11::integer, true::boolean),
  ('서비스 이용 방법'::text, '무료학생진단 서비스와 결과 리포트는 어떤 내용을 담고 있나요?'::text, '위닝에듀는 모든 학생들에게 무료로 자기학습진단을 할 수 있는 서비스를 제공하며 이 결과리포트는 다각도 분석 체계를 기반으로 학생의 학업 역량과 목표 달성 현황을 종합적으로 진단해 제공합니다. 강점과 보완이 필요한 영역을 함께 안내해 다음 단계의 학습 방향을 구체화할 수 있도록 돕습니다.'::text, '{"v":1,"blocks":[{"id":"25deef2f-f104-485e-a2f9-12a841aa90de","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝에듀는 모든 학생들에게 무료로 자기학습진단을 할 수 있는 서비스를 제공하며 이 결과리포트는 다각도 분석 체계를 기반으로 학생의 학업 역량과 목표 달성 현황을 종합적으로 진단해 제공합니다. 강점과 보완이 필요한 영역을 함께 안내해 다음 단계의 학습 방향을 구체화할 수 있도록 돕습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 12::integer, true::boolean),
  ('서비스 이용 방법'::text, '목표 설정은 어떻게 진행되나요?'::text, '로그인 후  목표관리서비스 메뉴에서 현재 학년, 성적, 희망 진로·목표 대학 등 기본 정보를 입력하면, 이를 바탕으로 시기별·과목별 세부 목표가 제시됩니다. 이후 필요에 따라 목표를 직접 수정하거나 세분화할 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"e319ed36-01f4-4532-94d7-7135e5a8b53f","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"로그인 후  목표관리서비스 메뉴에서 현재 학년, 성적, 희망 진로·목표 대학 등 기본 정보를 입력하면, 이를 바탕으로 시기별·과목별 세부 목표가 제시됩니다. 이후 필요에 따라 목표를 직접 수정하거나 세분화할 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 13::integer, true::boolean),
  ('서비스 이용 방법'::text, '학습 및 활동 기록은 어떻게 입력하나요?'::text, '학생이 직접 학습 시간, 완료한 과제, 주요 활동 등을 서비스 내에서 간단히 기록하면, AI와 자체진단 시스템으로 이를 분석해 목표 대비 진행 상황과 보완이 필요한 부분을 알려드립니다.'::text, '{"v":1,"blocks":[{"id":"dac4ad05-99cf-4ff1-8538-4ccad5a6de97","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"학생이 직접 학습 시간, 완료한 과제, 주요 활동 등을 서비스 내에서 간단히 기록하면, AI와 자체진단 시스템으로 이를 분석해 목표 대비 진행 상황과 보완이 필요한 부분을 알려드립니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 14::integer, true::boolean),
  ('서비스 이용 방법'::text, '리포트는 얼마나 자주 받을 수 있나요?'::text, '리포트 제공 주기는 이용 중인 서비스 및 요금제에 따라 다를 수 있습니다. 무료 진단서비스은 학생1인당 1회 제공이 되며, 연계되는 서비스마다 제공 주기가 다르며, 서비스 세부내용에서 확인하실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"335bffa3-f97e-4e91-b754-438f1d1f3a0e","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"리포트 제공 주기는 이용 중인 서비스 및 요금제에 따라 다를 수 있습니다. 무료 진단서비스은 학생1인당 1회 제공이 되며, 연계되는 서비스마다 제공 주기가 다르며, 서비스 세부내용에서 확인하실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 15::integer, true::boolean),
  ('개인정보 및 데이터 보안'::text, '어떤 개인정보를 수집하나요?'::text, '회원가입 시 이름, 연락처, 학년 등 서비스 제공에 필요한 최소한의 정보를 수집하며, 서비스 이용 과정에서 입력하는 학습·활동 정보가 추가로 활용될 수 있습니다. 별도의 생기부 등의 자료는 보관 및 업로드하지 않습니다. 자세한 수집 항목과 이용 목적은 개인정보처리방침 및 개인정보 수집·이용 동의서에서 확인하실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"778388b8-39a0-4f76-b109-a9dd7b2399a8","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"회원가입 시 이름, 연락처, 학년 등 서비스 제공에 필요한 최소한의 정보를 수집하며, 서비스 이용 과정에서 입력하는 학습·활동 정보가 추가로 활용될 수 있습니다. 별도의 생기부 등의 자료는 보관 및 업로드하지 않습니다. 자세한 수집 항목과 이용 목적은 개인정보처리방침 및 개인정보 수집·이용 동의서에서 확인하실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 16::integer, true::boolean),
  ('개인정보 및 데이터 보안'::text, '학교생활기록부(학생부) 파일을 업로드해야 하나요?'::text, '위닝에듀는 학생이 직접 입력하는 목표·활동 정보와 자체 진단시스템으로 서비스를 제공하며, 개인 회원을 대상으로 학교생활기록부 파일 업로드 및 관룐 자료를 요구하지 않습니다. 이는 2026년 7월 29일부터 시행되는 학생부의 상업적 활용 제한 규정을 준수하고 있습니다.'::text, '{"v":1,"blocks":[{"id":"dee0e48c-f8ad-47ee-ace7-46b6e77dc279","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝에듀는 학생이 직접 입력하는 목표·활동 정보와 자체 진단시스템으로 서비스를 제공하며, 개인 회원을 대상으로 학교생활기록부 파일 업로드 및 관룐 자료를 요구하지 않습니다. 이는 2026년 7월 29일부터 시행되는 학생부의 상업적 활용 제한 규정을 준수하고 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 17::integer, true::boolean),
  ('개인정보 및 데이터 보안'::text, '제 데이터는 안전하게 보호되나요?'::text, '위닝에듀는 안정적인 클라우드 인프라를 기반으로 데이터를 암호화하여 저장·관리하고 있으며, 본인인증 역시 PASS 등 공인된 인증 수단을 통해 이루어집니다. 개인정보 관리에 관한 세부 사항은 개인정보처리방침에서 확인하실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"6ff66e01-09d3-40f8-8727-05facf388a39","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝에듀는 안정적인 클라우드 인프라를 기반으로 데이터를 암호화하여 저장·관리하고 있으며, 본인인증 역시 PASS 등 공인된 인증 수단을 통해 이루어집니다. 개인정보 관리에 관한 세부 사항은 개인정보처리방침에서 확인하실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 18::integer, true::boolean),
  ('개인정보 및 데이터 보안'::text, '제 합격 사례나 활동 내용이 홍보에 활용될 수 있나요?'::text, '합격 사례 등 개인의 성과를 홍보에 활용하는 경우는 별도의 「합격사례 홍보활용 동의서」에 자발적으로 동의하신 경우에 한합니다. 동의하지 않으셔도 서비스 이용에는 제한이 없습니다.'::text, '{"v":1,"blocks":[{"id":"c07da28d-5aa2-4eb1-a893-24f05b4a1cf1","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"합격 사례 등 개인의 성과를 홍보에 활용하는 경우는 별도의 「합격사례 홍보활용 동의서」에 자발적으로 동의하신 경우에 한합니다. 동의하지 않으셔도 서비스 이용에는 제한이 없습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 19::integer, true::boolean),
  ('개인정보 및 데이터 보안'::text, '마케팅 정보 수신 동의는 필수인가요?'::text, '아닙니다. 마케팅 정보 수신 동의는 선택 사항이며, 동의하지 않으셔도 위닝에듀의 모든 핵심 서비스를 정상적으로 이용하실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"e19cd711-8fe7-4ee6-b29b-e091db487e45","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"아닙니다. 마케팅 정보 수신 동의는 선택 사항이며, 동의하지 않으셔도 위닝에듀의 모든 핵심 서비스를 정상적으로 이용하실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 20::integer, true::boolean),
  ('요금제 및 결제'::text, '이용 요금은 어떻게 되나요?'::text, '서비스별 요금제는 이용신청 메뉴에서 서비스요금의 상세 페이지를 통해 안내되어 있습니다.'::text, '{"v":1,"blocks":[{"id":"4efa5eca-bc23-4091-afcc-6804d15543df","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"서비스별 요금제는 이용신청 메뉴에서 서비스요금의 상세 페이지를 통해 안내되어 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 21::integer, true::boolean),
  ('요금제 및 결제'::text, '결제 수단은 무엇인가요?'::text, '결제는 토스페이먼츠(Toss Payments)를 통해 안전하게 진행되며, 신용·체크카드 등 다양한 결제 수단을 지원하고 있습니다.'::text, '{"v":1,"blocks":[{"id":"12c3d59d-4fe4-4b92-a631-77d51e0e9d2d","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"결제는 토스페이먼츠(Toss Payments)를 통해 안전하게 진행되며, 신용·체크카드 등 다양한 결제 수단을 지원하고 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 22::integer, true::boolean),
  ('요금제 및 결제'::text, '무료로 이용할 수 있는 기능이 있나요?'::text, '학생 학습진단서비스는 회원가입만 해도 이용이 가능합니다. 별도의 진단 결과 리포트도 받아볼 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"b32fbbda-9da8-473d-8896-886e2cc16543","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"학생 학습진단서비스는 회원가입만 해도 이용이 가능합니다. 별도의 진단 결과 리포트도 받아볼 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 23::integer, true::boolean),
  ('요금제 및 결제'::text, '환불은 어떻게 신청하나요?'::text, '환불 절차와 기준은 「결제서비스 이용약관」 및 관련 법령(전자상거래법 등)을 준수하며 온라인신청 또는 고객센터를 통해 환불을 신청하실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"48e3fb89-61e3-4539-839d-a600a39af6a2","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"환불 절차와 기준은 「결제서비스 이용약관」 및 관련 법령(전자상거래법 등)을 준수하며 온라인신청 또는 고객센터를 통해 환불을 신청하실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 24::integer, true::boolean),
  ('학교·기관 도입 (B2G)'::text, '학교나 교육청 단위로도 도입할 수 있나요?'::text, '네, 위닝에듀는 학교 및 교육청 등 기관 단위 도입을 지원하고 있으며, 나라장터 등 공공조달 절차를 통한 계약도 가능합니다. 기관 도입을 원하시는 경우 별도 문의를 통해 상담받으실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"594829a7-446c-4fd5-a292-1254b2c87f4e","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"네, 위닝에듀는 학교 및 교육청 등 기관 단위 도입을 지원하고 있으며, 나라장터 등 공공조달 절차를 통한 계약도 가능합니다. 기관 도입을 원하시는 경우 별도 문의를 통해 상담받으실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 25::integer, true::boolean),
  ('학교·기관 도입 (B2G)'::text, '학교 도입 시 별도 계약 절차가 있나요?'::text, '기관 도입은 개인 회원 가입과 별도로 계약 절차를 통해 진행됩니다. 기관의 규모와 필요에 따라 이용 범위, 기간, 비용 등을 협의하여 진행하며, 담당 부서를 통해 문의하실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"874e633d-1004-4f40-b688-b6b122b331f5","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"기관 도입은 개인 회원 가입과 별도로 계약 절차를 통해 진행됩니다. 기관의 규모와 필요에 따라 이용 범위, 기간, 비용 등을 협의하여 진행하며, 담당 부서를 통해 문의하실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 26::integer, true::boolean),
  ('학교·기관 도입 (B2G)'::text, '학생부 활용과 관련된 법적 이슈는 없나요?'::text, '위닝에듀는 2026년 7월 29일 시행된 학생부의 상업적 활용 제한 규정을 준수하는 방향으로 서비스를 설계하였습니다. 개인 회원에게는 학생부 파일이 아닌 자기 입력 정보를 기반으로 서비스를 제공하며, 기관 도입 시에는 관련 법령과 절차를 준수하여 진행됩니다.'::text, '{"v":1,"blocks":[{"id":"60e96eab-8139-4b5b-90f0-cd43f5dacdfe","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝에듀는 2026년 7월 29일 시행된 학생부의 상업적 활용 제한 규정을 준수하는 방향으로 서비스를 설계하였습니다. 개인 회원에게는 학생부 파일이 아닌 자기 입력 정보를 기반으로 서비스를 제공하며, 기관 도입 시에는 관련 법령과 절차를 준수하여 진행됩니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 27::integer, true::boolean),
  ('기타 문의'::text, '서비스는 언제 정식 오픈하나요?'::text, '위닝에듀는 14년 이상의 현장 노하우를 토대로 만들어진 서비스 입니다. 특정 지역의 학생들에게 검증되어 실제 목표결과의 사례들이 있습니다. 이에 입시 목표를 이루고자 학생들에게 세부적이고 전문적인 도움을 주고자 전국적인 서비스를 2026년 9월  정식 오픈 하였습니다.'::text, '{"v":1,"blocks":[{"id":"63e18467-928a-40bf-a39e-a5c9f20240d4","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"위닝에듀는 14년 이상의 현장 노하우를 토대로 만들어진 서비스 입니다. 특정 지역의 학생들에게 검증되어 실제 목표결과의 사례들이 있습니다. 이에 입시 목표를 이루고자 학생들에게 세부적이고 전문적인 도움을 주고자 전국적인 서비스를 2026년 9월  정식 오픈 하였습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 28::integer, true::boolean),
  ('기타 문의'::text, '이용약관이나 개인정보처리방침은 어디서 확인할 수 있나요?'::text, '서비스 이용약관, 개인정보처리방침을 비롯한 관련 약관 전문은 위닝에듀 웹사이트 하단 또는 회원가입 페이지에서 확인하실 수 있습니다.'::text, '{"v":1,"blocks":[{"id":"bd5f25a0-ab09-4dc0-9717-2109ec239114","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"서비스 이용약관, 개인정보처리방침을 비롯한 관련 약관 전문은 위닝에듀 웹사이트 하단 또는 회원가입 페이지에서 확인하실 수 있습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 29::integer, true::boolean),
  ('기타 문의'::text, '오류나 불편사항은 어떻게 문의하나요?'::text, '서비스 이용 중 오류나 불편사항이 있으시면 고객센터(이메일/전화번호 입력 예정)로 문의해 주시기 바랍니다. 확인 후 빠르게 답변 드리겠습니다.'::text, '{"v":1,"blocks":[{"id":"46401304-cf83-4f6b-8971-4a80af414290","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"text":"서비스 이용 중 오류나 불편사항이 있으시면 고객센터(이메일/전화번호 입력 예정)로 문의해 주시기 바랍니다. 확인 후 빠르게 답변 드리겠습니다.","type":"text","styles":{}}],"children":[]}],"editor":"blocknote@0.52.1"}'::text, 30::integer, true::boolean)
) as seed(category, question, answer, content_json, sort_order, is_active)
where not exists (
  select 1 from public.faqs f
   where f.category = seed.category
     and f.question = seed.question
);

-- ---------------------------------------------------------------------
-- 3) 인덱스 판단
--
--    공개 페이지 실제 쿼리(src/pages/Faq.jsx):
--      .from('faqs').eq('is_active', true)
--        .order('sort_order', { ascending: true })
--        .order('created_at', { ascending: false })
--    카테고리는 서버 쿼리가 아니라 클라이언트 측 배열 필터다(탭 클릭 시
--    이미 받아온 목록을 JS에서 걸러낸다) — category 컬럼에 대한 별도
--    인덱스는 어떤 실제 쿼리도 서빙하지 않으므로 만들지 않는다.
--
--    is_active/sort_order/created_at 복합 인덱스 하나만 추가한다. 형제
--    테이블(질문 형태 도메인)들의 실측 행 수가 수십 건 규모라 이 인덱스가
--    실행계획을 seq scan에서 index scan으로 바꿀 만큼 유의미하지는 않지만,
--    공개 페이지가 유일하게 날리는 목록 쿼리의 WHERE+ORDER BY를 정확히
--    미러링하는 인덱스라 카디널리티가 커져도(수백~수천 건) 계속 유효하고
--    유지 비용도 이 한 건으로 그친다. 그래서 "안 만드는 판단"보다는 이
--    하나만 만드는 쪽을 택한다.
-- ---------------------------------------------------------------------
create index if not exists faqs_active_sort_created_idx
  on public.faqs using btree (is_active, sort_order, created_at desc);

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'faqs' order by ordinal_position;
-- select count(*) from public.faqs;                          -- 기존 행 + 신규 시드 30건 유지되는지 확인
-- select category, count(*) from public.faqs group by 1;     -- 기대: 시드 7개 카테고리(6/5/4/5/4/3/3) + 기존 행은 ''
