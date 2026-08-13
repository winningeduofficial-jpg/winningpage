-- =====================================================================
-- 서비스 > 학습진단 > 상세(ver2) 설문 문항 문구 어드민 전환.
-- Supabase SQL Editor / Management API에서 수동 실행 필요. (idempotent)
--
-- 배경:
--   ver2 설문 문항(src/data/renewalSurveyQuestions.js)은 채점 엔진과 강결합된
--   정적 데이터다 — id/scoringId/optionCodes/type/page 는 배점표(diagnosisScoringTable.js)·
--   서비스 추천 규칙(diagnosisScoring.js SERVICE_RULES)과 키로 조인되므로 어드민이 건드리면
--   침묵 오채점이 난다(diagnosisScoringTable.js 상단 주석 참고). 반면 title/helper/선택지
--   라벨/리커트 문장은 "무엇을 보여주는가"일 뿐 "어떻게 채점하는가"가 아니라 안전하게 어드민화
--   가능하다 — 이 마이그레이션은 그 경계선 안쪽(표시 문구)만 다룬다.
--
-- 포함:
--   1) public.learning_diagnosis_v2_survey_copy 테이블 — 문항/선택지/리커트 문장 문구 키-값
--      (mentor_apply_copy 패턴 그대로: PK는 id uuid 대리키, copy_key는 UNIQUE)
--   2) RLS — 공개 read(anon, authenticated) + 어드민 전권(public.is_winning_admin())
--   3) updated_at 트리거 (공용 public.set_updated_at() 재사용)
--   4) 시드 — 160행. renewalSurveyQuestions.js 원문에서 node 스크립트로 그대로 추출했다
--      (손타이핑 아님 — 라벨 오탈자 위험 차단). 대상:
--        · {questionId}.title            — 21문항 전체
--        · {questionId}.helper           — helper 가 null/빈 문자열이 아닌 13문항만
--        · {questionId}.option.{code}    — optionCodes 보유(scalar 선택지) 14문항, 102개
--        · {questionId}.statement.{key}  — 리커트(q9/q11) 문장 24개
--      (public.schema_migrations 마커 가드로 최초 1회만 적용, 이후 어드민이 편집한 값은
--      재실행으로 덮어쓰지 않는다)
--
-- 스코프 밖(의도적 제외 — 채점/구조 리스크):
--   - scoringId·optionCodes·type·page·category, 배점표 상수, 서비스 추천 규칙, 경계값
--   - q6(grade-grid) 내부 그룹/필드 라벨·placeholder, q15(cascade) 레벨 라벨·placeholder
--   - src/data/diagnosisCopy.js(리포트 문구, 문구 개수 검산 있음) — 별도 착수 예정, 이번 스코프 아님
--
-- 폴백 동작 (중요):
--   이 마이그레이션을 적용하지 않아도 설문 화면은 renewalSurveyQuestions.js 정적 값 그대로
--   동작한다(현재와 동일). 키 단위 폴백이라 특정 행이 없어도 그 키만 정적 값을 쓴다.
--   어드민 화면(learningDiagnosisV2SurveyCopy)은 테이블이 없으면 조회·저장이 실패하므로
--   **어드민 배포 전에 이 파일을 먼저 실행**해야 한다.
--
-- 의존성:
--   - 00_base_schema.sql : public.is_winning_admin(), public.set_updated_at(),
--                          extensions의 gen_random_uuid()
--   - 다른 마이그레이션과 독립 실행 가능
--
-- 주의:
--   - admin 판정은 반드시 public.is_winning_admin()을 쓴다(is_admin() 아님).
--   - 시드 문구는 renewalSurveyQuestions.js 원문을 한 글자도 바꾸지 않고 그대로 옮겼다.
-- =====================================================================

create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- (1) learning_diagnosis_v2_survey_copy — 문항/선택지/리커트 문장 문구 키-값
-- ---------------------------------------------------------------------
create table if not exists public.learning_diagnosis_v2_survey_copy (
    id         uuid primary key default gen_random_uuid(),
    copy_key   text not null unique,         -- 예: 'q1.title', 'q1.option.M3', 'q9.statement.LK1_01'
    copy_value text not null default '',
    label      text not null default '',     -- 어드민 목록/폼에 보여줄 사람이 읽는 이름
    sort_order integer not null default 0,
    updated_at timestamptz not null default now()
);

comment on table public.learning_diagnosis_v2_survey_copy is
    '학습진단(ver2) 설문 문항의 표시 문구(제목/안내문구/선택지 라벨/리커트 문장) 키-값 저장소. scoringId·optionCodes 등 채점 구조 필드는 포함하지 않는다 — 그건 renewalSurveyQuestions.js 가 정본이고 어드민화 대상이 아니다. 공개 읽기 전체 허용, 쓰기는 어드민만. sql/72_learning_diagnosis_v2_survey_copy.sql 참고. 테이블이 없거나 특정 키가 없으면 프론트는 renewalSurveyQuestions.js 해당 필드로 폴백한다.';

drop trigger if exists trg_learning_diagnosis_v2_survey_copy_updated_at on public.learning_diagnosis_v2_survey_copy;
create trigger trg_learning_diagnosis_v2_survey_copy_updated_at
    before update on public.learning_diagnosis_v2_survey_copy
    for each row execute function public.set_updated_at();

alter table public.learning_diagnosis_v2_survey_copy enable row level security;

drop policy if exists "learning_diagnosis_v2_survey_copy public read" on public.learning_diagnosis_v2_survey_copy;
create policy "learning_diagnosis_v2_survey_copy public read" on public.learning_diagnosis_v2_survey_copy
    as permissive for select to anon, authenticated
    using (true);

drop policy if exists "learning_diagnosis_v2_survey_copy admin all" on public.learning_diagnosis_v2_survey_copy;
create policy "learning_diagnosis_v2_survey_copy admin all" on public.learning_diagnosis_v2_survey_copy
    as permissive for all to authenticated
    using (public.is_winning_admin())
    with check (public.is_winning_admin());

-- ---------------------------------------------------------------------
-- (2) 시드 — 최초 1회만(마커 '72_learning_diagnosis_v2_survey_copy_seed_v1' 가드).
--     renewalSurveyQuestions.js 원문을 그대로 옮겼다(node 스크립트 추출, 160행).
-- ---------------------------------------------------------------------
insert into public.learning_diagnosis_v2_survey_copy (copy_key, copy_value, label, sort_order)
select v.copy_key, v.copy_value, v.label, v.sort_order
from (
  values
    ('q1.title', '현재 학년을 선택해 주세요', 'q1 · 제목', 1),
    ('q1.helper', '하나만 선택해 주세요.', 'q1 · 안내문구', 2),
    ('q1.option.M3', '중학교 3학년', 'q1 · 선택지(M3)', 3),
    ('q1.option.H1', '고등학교 1학년', 'q1 · 선택지(H1)', 4),
    ('q1.option.H2', '고등학교 2학년', 'q1 · 선택지(H2)', 5),
    ('q1.option.H3', '고등학교 3학년', 'q1 · 선택지(H3)', 6),
    ('q1.option.RETAKE', 'N수생', 'q1 · 선택지(RETAKE)', 7),
    ('q2.title', '현재 재학 중인 학교 유형을 선택해 주세요.', 'q2 · 제목', 8),
    ('q2.helper', '하나만 선택해 주세요.', 'q2 · 안내문구', 9),
    ('q2.option.GENERAL', '일반고', 'q2 · 선택지(GENERAL)', 10),
    ('q2.option.AUTONOMOUS', '자율형・사립고', 'q2 · 선택지(AUTONOMOUS)', 11),
    ('q2.option.SPECIAL', '특목고', 'q2 · 선택지(SPECIAL)', 12),
    ('q2.option.VOCATIONAL', '특성화고', 'q2 · 선택지(VOCATIONAL)', 13),
    ('q2.option.ETC', '기타', 'q2 · 선택지(ETC)', 14),
    ('q2.option.NONE', '해당 없음', 'q2 · 선택지(NONE)', 15),
    ('q3.title', '현재 진학 목표는 어느 정도 정해져 있나요?', 'q3 · 제목', 16),
    ('q3.helper', '하나만 선택해 주세요.', 'q3 · 안내문구', 17),
    ('q3.option.BOTH', '목표 대학과 학과가 모두 정해져 있어요', 'q3 · 선택지(BOTH)', 18),
    ('q3.option.UNIV_ONLY', '목표 대학만 정해져 있어요', 'q3 · 선택지(UNIV_ONLY)', 19),
    ('q3.option.MAJOR_ONLY', '희망 학과나 계열만 정해져 있어요', 'q3 · 선택지(MAJOR_ONLY)', 20),
    ('q3.option.TIER_ONLY', '대략적인 대학 수준만 생각하고 있어요', 'q3 · 선택지(TIER_ONLY)', 21),
    ('q3.option.UNDECIDED_MULTI', '여러 목표 사이에서 고민하고 있어요', 'q3 · 선택지(UNDECIDED_MULTI)', 22),
    ('q3.option.NONE', '아직 구체적인 목표가 없어요', 'q3 · 선택지(NONE)', 23),
    ('q3-target-university.title', '목표대학', 'q3-target-university · 제목', 24),
    ('q3-target-major.title', '희망 학과 또는 모집단위', 'q3-target-major · 제목', 25),
    ('q3-target-reason.title', '목표 선정 이유', 'q3-target-reason · 제목', 26),
    ('q3-target-reason.option.APTITUDE', '해당 분야에 관심과 적성이 있어서', 'q3-target-reason · 선택지(APTITUDE)', 27),
    ('q3-target-reason.option.JOB', '희망 직업과 연결되어 있어서', 'q3-target-reason · 선택지(JOB)', 28),
    ('q3-target-reason.option.REPUTATION', '대학의 인지도나 선호도가 높아서', 'q3-target-reason · 선택지(REPUTATION)', 29),
    ('q3-target-reason.option.SCORE_FIT', '현재 성적으로 지원할 수 있을 거 같아서', 'q3-target-reason · 선택지(SCORE_FIT)', 30),
    ('q3-target-reason.option.PARENT', '부모님이나 주변의 권유로', 'q3-target-reason · 선택지(PARENT)', 31),
    ('q3-target-reason.option.LOCATION', '지역이나 통학 조건이 적합해서', 'q3-target-reason · 선택지(LOCATION)', 32),
    ('q3-target-reason.option.UNKNOWN', '아직 충분히 알아보지 못했어요', 'q3-target-reason · 선택지(UNKNOWN)', 33),
    ('q4.title', '현재 적용되는 내신 등급 체계를 선택해 주세요.', 'q4 · 제목', 34),
    ('q4.helper', '하나만 선택해 주세요.', 'q4 · 안내문구', 35),
    ('q4.option.NINE', '9등급제', 'q4 · 선택지(NINE)', 36),
    ('q4.option.FIVE', '5등급제', 'q4 · 선택지(FIVE)', 37),
    ('q4.option.MIDDLE_AVG', '중학생 평균', 'q4 · 선택지(MIDDLE_AVG)', 38),
    ('q4.option.UNKNOWN', '잘 모르겠어요', 'q4 · 선택지(UNKNOWN)', 39),
    ('q6.title', '현재 성적을 입력해 주세요', 'q6 · 제목', 40),
    ('q6.helper', '내신 전체 평균은 전 과목 평균 기준으로 입력해 주세요.', 'q6 · 안내문구', 41),
    ('q8.title', '최근 성적은 어떤 흐름을 보이고 있나요?', 'q8 · 제목', 42),
    ('q8.helper', '하나만 선택해 주세요.', 'q8 · 안내문구', 43),
    ('q8.option.UP_MOST', '대부분의 과목이 상승하고 있어요', 'q8 · 선택지(UP_MOST)', 44),
    ('q8.option.UP_PART', '일부 과목은 상승하고 일부는 비슷해요', 'q8 · 선택지(UP_PART)', 45),
    ('q8.option.FLAT', '큰 변화 없이 정체되어 있어요', 'q8 · 선택지(FLAT)', 46),
    ('q8.option.DOWN_PART', '일부 과목이 하락하고 있어요', 'q8 · 선택지(DOWN_PART)', 47),
    ('q8.option.VOLATILE', '과목마다 성적 변동이 큰 편이에요', 'q8 · 선택지(VOLATILE)', 48),
    ('q8.option.NO_DATA', '아직 비교할 시험 결과가 부족해요', 'q8 · 선택지(NO_DATA)', 49),
    ('q8-followup.title', '성적 변화가 가장 큰 과목', 'q8-followup · 제목', 50),
    ('q8-followup.option.KOREAN', '국어', 'q8-followup · 선택지(KOREAN)', 51),
    ('q8-followup.option.MATH', '수학', 'q8-followup · 선택지(MATH)', 52),
    ('q8-followup.option.ENGLISH', '영어', 'q8-followup · 선택지(ENGLISH)', 53),
    ('q8-followup.option.SOCIAL', '사회', 'q8-followup · 선택지(SOCIAL)', 54),
    ('q8-followup.option.SCIENCE', '과학', 'q8-followup · 선택지(SCIENCE)', 55),
    ('q8-followup.option.INQUIRY', '탐구', 'q8-followup · 선택지(INQUIRY)', 56),
    ('q8-followup.option.MULTIPLE', '여러 과목', 'q8-followup · 선택지(MULTIPLE)', 57),
    ('q8-followup.option.UNKNOWN', '잘 모르겠어요', 'q8-followup · 선택지(UNKNOWN)', 58),
    ('q9.title', '다음 문장이 현재 자신의 모습과 얼마나 가까운지 선택해 주세요.', 'q9 · 제목', 59),
    ('q9.statement.LK1_01', '다음 시험에서 달성하고 싶은 성적이나 등급이 구체적으로 정해져 있다', 'q9 · 문장(LK1_01)', 60),
    ('q9.statement.LK1_02', '목표를 위해 어떤 과목과 단원을 먼저 공부해야 하는지 알고 있다', 'q9 · 문장(LK1_02)', 61),
    ('q9.statement.LK1_03', '해야 할 공부를 주간 또는 일간 단위의 구체적인 분량으로 나누고 있다', 'q9 · 문장(LK1_03)', 62),
    ('q9.statement.LK1_04', '시험, 수행평가, 학교 일정까지 고려해 계획을 조정하고 있다', 'q9 · 문장(LK1_04)', 63),
    ('q9.statement.LK1_05', '세운 계획의 70% 이상을 실제로 완료하는 편이다', 'q9 · 문장(LK1_05)', 64),
    ('q9.statement.LK1_06', '해야 할 공부를 미루지 않고 정해진 시간에 시작하는 편이다', 'q9 · 문장(LK1_06)', 65),
    ('q9.statement.LK1_07', '평일과 주말에 일정한 공부 시간을 확보하고 있다', 'q9 · 문장(LK1_07)', 66),
    ('q9.statement.LK1_08', '취약 과목과 중요한 과목에 시간을 우선 배분하고 있다', 'q9 · 문장(LK1_08)', 67),
    ('q9.statement.LK1_09', '틀린 문제의 원인을 구분해 다시 확인하고 있다', 'q9 · 문장(LK1_09)', 68),
    ('q9.statement.LK1_10', '시험 결과를 보고 공부 방법이나 계획을 수정한다', 'q9 · 문장(LK1_10)', 69),
    ('q9.statement.LK1_11', '성적이 기대보다 낮아도 학습 리듬을 비교적 빠르게 회복한다', 'q9 · 문장(LK1_11)', 70),
    ('q9.statement.LK1_12', '해야 할 일이 많거나 불안할 때도 공부를 시작할 수 있다', 'q9 · 문장(LK1_12)', 71),
    ('q10.title', '최근 학습을 가장 자주 방해하는 요인은 무엇인가요?', 'q10 · 제목', 72),
    ('q10.helper', '최대 3개를 선택해 주세요', 'q10 · 안내문구', 73),
    ('q10.option.OBS_01', '무엇부터 공부해야 할지 모르겠어요', 'q10 · 선택지(OBS_01)', 74),
    ('q10.option.OBS_02', '계획을 너무 크게 세워 자주 밀려요', 'q10 · 선택지(OBS_02)', 75),
    ('q10.option.OBS_03', '계획은 있지만 시작을 자주 미뤄요', 'q10 · 선택지(OBS_03)', 76),
    ('q10.option.OBS_04', '휴대전화나 영상 때문에 집중이 끊겨요', 'q10 · 선택지(OBS_04)', 77),
    ('q10.option.OBS_05', '학교와 학원 일정 때문에 자습 시간이 부족해요', 'q10 · 선택지(OBS_05)', 78),
    ('q10.option.OBS_06', '특정 과목의 공부 방법을 모르겠어요', 'q10 · 선택지(OBS_06)', 79),
    ('q10.option.OBS_07', '문제를 풀고도 오답 정리를 하지 못해요', 'q10 · 선택지(OBS_07)', 80),
    ('q10.option.OBS_08', '공부한 시간에 비해 성적이 잘 오르지 않아요', 'q10 · 선택지(OBS_08)', 81),
    ('q10.option.OBS_09', '수행평가와 시험 준비가 자주 겹쳐요', 'q10 · 선택지(OBS_09)', 82),
    ('q10.option.OBS_10', '성적과 입시에 대한 불안이 커요', 'q10 · 선택지(OBS_10)', 83),
    ('q10.option.OBS_11', '주변 학생과 비교하면서 자신감이 떨어져요', 'q10 · 선택지(OBS_11)', 84),
    ('q10.option.OBS_12', '공부에 대한 의욕이 많이 줄었어요', 'q10 · 선택지(OBS_12)', 85),
    ('q10.option.OBS_13', '특별히 큰 어려움은 없어요', 'q10 · 선택지(OBS_13)', 86),
    ('q11.title', '다음 문장이 현재 자신의 모습과 얼마나 가까운지 선택해 주세요.', 'q11 · 제목', 87),
    ('q11.statement.LK2_01', '과목별 성적과 학습 상태를 비교해 강점과 약점을 알고 있다', 'q11 · 문장(LK2_01)', 88),
    ('q11.statement.LK2_02', '취약 과목을 보완하기 위한 구체적인 학습 방법이 있다', 'q11 · 문장(LK2_02)', 89),
    ('q11.statement.LK2_03', '수행평가 안내문에서 평가 기준과 제출 조건을 파악할 수 있다', 'q11 · 문장(LK2_03)', 90),
    ('q11.statement.LK2_04', '수행평가를 시험 준비와 겹치지 않게 미리 준비하는 편이다', 'q11 · 문장(LK2_04)', 91),
    ('q11.statement.LK2_05', '교과에서 배운 개념을 탐구 주제로 발전시킬 수 있다', 'q11 · 문장(LK2_05)', 92),
    ('q11.statement.LK2_06', '신뢰할 수 있는 자료를 활용해 단순 조사 이상의 분석을 만들 수 있다', 'q11 · 문장(LK2_06)', 93),
    ('q11.statement.LK2_07', '이전에 한 활동을 새로운 탐구로 심화하거나 확장할 수 있다', 'q11 · 문장(LK2_07)', 94),
    ('q11.statement.LK2_08', '교과 활동과 진로 관심을 자연스럽게 연결할 수 있다', 'q11 · 문장(LK2_08)', 95),
    ('q11.statement.LK2_09', '활동에서 맡은 역할과 실제 수행 과정을 구체적으로 설명할 수 있다', 'q11 · 문장(LK2_09)', 96),
    ('q11.statement.LK2_10', '활동을 통해 배운 점과 성장한 점을 자기평가서로 정리할 수 있다', 'q11 · 문장(LK2_10)', 97),
    ('q11.statement.LK2_11', '희망 대학과 학과에서 중요하게 보는 요소를 알고 있다', 'q11 · 문장(LK2_11)', 98),
    ('q11.statement.LK2_12', '현재 성적과 학생부를 기준으로 앞으로 보완할 부분을 알고 있다', 'q11 · 문장(LK2_12)', 99),
    ('q12.title', '학교 활동이나 입시 준비에서 현재 가장 어려운 부분은 무엇인가요?', 'q12 · 제목', 100),
    ('q12.helper', '최대 3개를 선택해 주세요', 'q12 · 안내문구', 101),
    ('q12.option.DIF_01', '과목별 성적을 어떻게 관리해야 할지 모르겠어요', 'q12 · 선택지(DIF_01)', 102),
    ('q12.option.DIF_02', '수행평가 안내문을 해석하기 어려워요', 'q12 · 선택지(DIF_02)', 103),
    ('q12.option.DIF_03', '수행평가 주제를 정하기 어려워요', 'q12 · 선택지(DIF_03)', 104),
    ('q12.option.DIF_04', '자료를 찾고 글의 구조를 구성하기 어려워요', 'q12 · 선택지(DIF_04)', 105),
    ('q12.option.DIF_05', '기본적인 보고서는 쓸 수 있지만 깊이가 부족해요', 'q12 · 선택지(DIF_05)', 106),
    ('q12.option.DIF_06', '교과 내용을 심화 탐구로 발전시키기 어려워요', 'q12 · 선택지(DIF_06)', 107),
    ('q12.option.DIF_07', '진로와 교과 활동을 연결하기 어려워요', 'q12 · 선택지(DIF_07)', 108),
    ('q12.option.DIF_08', '이전에 했던 활동과 겹치지 않는 주제를 만들기 어려워요', 'q12 · 선택지(DIF_08)', 109),
    ('q12.option.DIF_09', '논문이나 학술자료를 활용하기 어려워요', 'q12 · 선택지(DIF_09)', 110),
    ('q12.option.DIF_10', '활동 후 자기평가서를 작성하기 어려워요', 'q12 · 선택지(DIF_10)', 111),
    ('q12.option.DIF_11', '학생부의 강점과 부족한 점을 모르겠어요', 'q12 · 선택지(DIF_11)', 112),
    ('q12.option.DIF_12', '목표 대학의 입결과 전형을 해석하기 어려워요', 'q12 · 선택지(DIF_12)', 113),
    ('q12.option.DIF_13', '지원 대학의 도전·적정·안정 범위를 모르겠어요', 'q12 · 선택지(DIF_13)', 114),
    ('q12.option.DIF_14', '현재는 관련 도움이 크게 필요하지 않아요', 'q12 · 선택지(DIF_14)', 115),
    ('q13.title', '현재 준비 중인 일정 중 가장 가까운 것은 무엇인가요?', 'q13 · 제목', 116),
    ('q13.helper', '하나만 선택해 주세요.', 'q13 · 안내문구', 117),
    ('q13.option.PA_7D', '7일 이내 수행평가', 'q13 · 선택지(PA_7D)', 118),
    ('q13.option.EXAM_2W', '2주 이내 시험 또는 수행평가', 'q13 · 선택지(EXAM_2W)', 119),
    ('q13.option.MONTH_1', '한 달 이내 중요한 일정', 'q13 · 선택지(MONTH_1)', 120),
    ('q13.option.SUSI', '수시 원서 접수 준비', 'q13 · 선택지(SUSI)', 121),
    ('q13.option.NONE', '당장 급한 일정 없음', 'q13 · 선택지(NONE)', 122),
    ('q13.option.UNKNOWN', '잘 모르겠어요', 'q13 · 선택지(UNKNOWN)', 123),
    ('q14.title', '어떤 방식의 도움을 받을 때 가장 잘 실천할 수 있을 것 같아요?', 'q14 · 제목', 124),
    ('q14.helper', '최대 2개를 선택해 주세요.', 'q14 · 안내문구', 125),
    ('q14.option.WISH_01', '성적과 문제점 분석', 'q14 · 선택지(WISH_01)', 126),
    ('q14.option.WISH_02', '주 1회 계획 점검', 'q14 · 선택지(WISH_02)', 127),
    ('q14.option.WISH_03', '매일 공부량 관리', 'q14 · 선택지(WISH_03)', 128),
    ('q14.option.WISH_04', '과목별 공부 방법 피드백', 'q14 · 선택지(WISH_04)', 129),
    ('q14.option.WISH_05', '수행평가 집중 지원', 'q14 · 선택지(WISH_05)', 130),
    ('q14.option.WISH_06', '심화탐구 설계', 'q14 · 선택지(WISH_06)', 131),
    ('q14.option.WISH_07', '자기평가서 정리', 'q14 · 선택지(WISH_07)', 132),
    ('q14.option.WISH_08', '지원 가능 대학 분석', 'q14 · 선택지(WISH_08)', 133),
    ('q14.option.WISH_09', '수시전략 상담', 'q14 · 선택지(WISH_09)', 134),
    ('q14.option.WISH_10', '멘토와 고민 상담', 'q14 · 선택지(WISH_10)', 135),
    ('q15.title', '목표 대학 입결 조회', 'q15 · 제목', 136),
    ('q16.title', '수능 최저 예상은 어떠신가요?', 'q16 · 제목', 137),
    ('q16.helper', '하나만 선택해 주세요.', 'q16 · 안내문구', 138),
    ('q16.option.HIGH', '충족 가능성이 높아요', 'q16 · 선택지(HIGH)', 139),
    ('q16.option.BORDER', '경계 수준이에요', 'q16 · 선택지(BORDER)', 140),
    ('q16.option.HARD', '충족하기 어려워요', 'q16 · 선택지(HARD)', 141),
    ('q16.option.NONE', '수능최저가 없어요', 'q16 · 선택지(NONE)', 142),
    ('q16.option.UNKNOWN', '잘 모르겠어요', 'q16 · 선택지(UNKNOWN)', 143),
    ('q17.title', '학생부종합 준비 상태는 어떠신가요?', 'q17 · 제목', 144),
    ('q17.helper', '하나만 선택해 주세요.', 'q17 · 안내문구', 145),
    ('q17.option.CONNECTED', '여러 학년에 걸쳐 이어져 있어요', 'q17 · 선택지(CONNECTED)', 146),
    ('q17.option.UNLINKED', '활동은 있지만 연결되지 않아요', 'q17 · 선택지(UNLINKED)', 147),
    ('q17.option.GRADE_OK', '성적은 괜찮지만 탐구가 부족해요', 'q17 · 선택지(GRADE_OK)', 148),
    ('q17.option.INQUIRY_OK', '탐구는 많지만 성적이 부족해요', 'q17 · 선택지(INQUIRY_OK)', 149),
    ('q17.option.AVERAGE', '모두 평균적인 수준이에요', 'q17 · 선택지(AVERAGE)', 150),
    ('q17.option.UNKNOWN', '강점과 부족한 점을 모르겠어요', 'q17 · 선택지(UNKNOWN)', 151),
    ('q18.title', '면접 준비 상태는 어떠신가요?', 'q18 · 제목', 152),
    ('q18.helper', '하나만 선택해 주세요.', 'q18 · 안내문구', 153),
    ('q18.option.CONFIDENT', '충분히 연습했고 자신 있어요', 'q18 · 선택지(CONFIDENT)', 154),
    ('q18.option.BASIC', '기본은 말할 수 있지만 후속이 어려워요', 'q18 · 선택지(BASIC)', 155),
    ('q18.option.RECORD_WEAK', '학생부 정리가 부족해요', 'q18 · 선택지(RECORD_WEAK)', 156),
    ('q18.option.NOT_STARTED', '준비를 시작하지 못했어요', 'q18 · 선택지(NOT_STARTED)', 157),
    ('q18.option.NO_INTERVIEW', '면접이 없는 전형이에요', 'q18 · 선택지(NO_INTERVIEW)', 158),
    ('q18.option.UNKNOWN', '잘 모르겠어요', 'q18 · 선택지(UNKNOWN)', 159),
    ('q19.title', '최근 공부나 입시와 관련하여 가장 답답했던 상황을 한 문장으로 적어 주세요.', 'q19 · 제목', 160)
) as v(copy_key, copy_value, label, sort_order)
where not exists (
  select 1 from public.schema_migrations
  where version = '72_learning_diagnosis_v2_survey_copy_seed_v1'
);

insert into public.schema_migrations (version)
select '72_learning_diagnosis_v2_survey_copy_seed_v1'
where not exists (
  select 1 from public.schema_migrations
  where version = '72_learning_diagnosis_v2_survey_copy_seed_v1'
);

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select count(*) from public.learning_diagnosis_v2_survey_copy;  -- 160행이 정상(최초 실행 직후)
-- select policyname, cmd, roles from pg_policies where tablename = 'learning_diagnosis_v2_survey_copy';  -- public read 1개 + admin all 1개
-- select conname, contype from pg_constraint where conrelid = 'public.learning_diagnosis_v2_survey_copy'::regclass;  -- p(id) 1개 + u(copy_key) 1개
