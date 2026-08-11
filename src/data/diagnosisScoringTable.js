/**
 * 학습진단 배점표 상수 — 배점표.xlsx 6시트(00_읽는법 / 01_문항별배점 / 02_영역_구성 /
 * 03_서비스추천 / 04_합격가능성 / 05_예시) 이식본.
 *
 * 정본: docs/학습진단-계산엔진-적용명세.md §3.5(선택지 코드 매핑) · §4.2~§4.6 · §6.1.
 * 이 파일은 상수만 갖는다 — 계산은 src/lib/diagnosisScoring.js, 문구는 src/data/diagnosisCopy.js.
 *
 * 두 가지 원칙을 지킨다.
 * 1) 라벨 문자열을 키로 쓰지 않는다. 선택지 라벨은 시안 오탈자를 코드에서 교정한 문자열이라
 *    (q8 '정체되어' 등) 라벨을 키로 쓰면 문구 1자 수정이 침묵 오채점이 된다.
 *    코드는 renewalSurveyQuestions 의 선택지 **서수**로만 부여한다(§3.5).
 * 2) 모든 경계값의 단일 정의처다. 같은 임계를 두 곳에 적으면 미확정 항목(§9)이 확정될 때
 *    한쪽만 바뀌어 라벨과 색이 어긋난다.
 */

/**
 * DiagnosisInput.meta.schemaVersion (§3.2).
 * 정의처는 renewalSurveyQuestions.js 하나다 — 두 곳에 문자열 리터럴을 적어 두면 값이 갈라지는 순간
 * 리포트가 정상 응답을 조용히 폐기하고 픽스처로 떨어진다(에러가 없어 진단이 어렵다).
 * 설문 UI 는 이 배점표를 import 하지 않으므로 의존 방향을 설문 쪽으로 잡았다(번들 분리 유지).
 */
export { SURVEY_SCHEMA_VERSION as SCHEMA_VERSION } from './renewalSurveyQuestions.js';

/* ------------------------------------------------------------------ *
 * 1. 12영역 — 배점표 02_영역_구성
 * ------------------------------------------------------------------ */

/**
 * 영역 안정 코드 12종. 배열 순서 = §4.2.1 표 순서 = 레이더 축 순서 = 동점 타이브레이커 순서.
 * 한글 라벨은 오탈자 교정 대상이므로 코드가 정본이다(AREA_LABEL 은 표시 전용).
 */
export const PAGE1_AREAS = ['GOAL', 'PLAN', 'EXEC', 'TIME', 'FEEDBACK', 'STABILITY'];
export const PAGE2_AREAS = ['SUBJECT', 'PERFORM', 'INQUIRY', 'ACTIVITY', 'RECORD', 'STRATEGY'];
export const AREA_CODES = [...PAGE1_AREAS, ...PAGE2_AREAS];

export const AREA_LABEL = {
  GOAL: '목표 설정',
  PLAN: '계획 설계',
  EXEC: '실행 지속',
  TIME: '시간 관리',
  FEEDBACK: '학습 피드백',
  STABILITY: '학습 안정',
  SUBJECT: '교과 관리',
  PERFORM: '수행 대응',
  INQUIRY: '탐구 심화',
  ACTIVITY: '활동 연계',
  RECORD: '기록 정리',
  STRATEGY: '입시 전략'
};

/** 영역별 척도 2문장(§4.2.1 '척도 70점' 열). 평균 × 0.7 = 최대 70점. */
export const AREA_SCALE_MAP = {
  GOAL: ['LK1_01', 'LK1_02'],
  PLAN: ['LK1_03', 'LK1_04'],
  EXEC: ['LK1_05', 'LK1_06'],
  TIME: ['LK1_07', 'LK1_08'],
  FEEDBACK: ['LK1_09', 'LK1_10'],
  STABILITY: ['LK1_11', 'LK1_12'],
  SUBJECT: ['LK2_01', 'LK2_02'],
  PERFORM: ['LK2_03', 'LK2_04'],
  INQUIRY: ['LK2_05', 'LK2_06'],
  ACTIVITY: ['LK2_07', 'LK2_08'],
  RECORD: ['LK2_09', 'LK2_10'],
  STRATEGY: ['LK2_11', 'LK2_12']
};

/**
 * 체크 감점 기반 만점(§4.2.1 'base' 열). nonScalePart = max(0, base + Σ감점) + aux.
 * GOAL 은 감점 항목이 없고 나머지 30점이 전부 가산형(q3 진학목표 20 + 이유 10)이라 base 0.
 * 감점 합이 base 를 넘는 영역이 4곳(FEEDBACK −21 / PERFORM −31 / INQUIRY −31 / STRATEGY −31)
 * 있으므로 base 부분만 0으로 clamp 한 뒤 aux 를 더한다.
 */
export const AREA_BASE = {
  GOAL: 0,
  PLAN: 30,
  EXEC: 20,
  TIME: 30,
  FEEDBACK: 20,
  STABILITY: 30,
  SUBJECT: 20,
  PERFORM: 30,
  INQUIRY: 30,
  ACTIVITY: 30,
  RECORD: 30,
  STRATEGY: 30
};

/**
 * 영역별 보조 가산(aux) 출처. scoreAreas 가 이 표를 보고 분기하도록 데이터로 남긴다
 * — 코드에 if 로 흩어 놓으면 §4.2.1 표와 어긋나도 드러나지 않는다.
 * 'GOAL_POINTS' = q3 진학목표 + 목표 선정 이유 / 'TREND' = q8 성적 흐름(각 가산) /
 * 'MOCK_FILL' = q6 모의고사 입력 칸수.
 */
export const AREA_AUX_SOURCE = {
  GOAL: 'GOAL_POINTS',
  PLAN: null,
  EXEC: 'TREND',
  TIME: null,
  FEEDBACK: 'TREND',
  STABILITY: null,
  SUBJECT: 'MOCK_FILL',
  PERFORM: null,
  INQUIRY: null,
  ACTIVITY: null,
  RECORD: null,
  STRATEGY: null
};

/* ------------------------------------------------------------------ *
 * 2. 감점표 — 배점표 01_문항별배점 8번·10번 (§3.5)
 * ------------------------------------------------------------------ */

/**
 * q10(배점표 8번) 학습 방해 요인 13지. 최대 3개, OBS_13 은 배타(감점 0).
 * points 는 전부 음수다 — 부호를 호출부에서 뒤집지 않는다.
 */
export const OBSTACLE_DEDUCTIONS = {
  OBS_01: { area: 'PLAN', points: -15 },
  OBS_02: { area: 'PLAN', points: -15 },
  OBS_03: { area: 'EXEC', points: -12 },
  OBS_04: { area: 'EXEC', points: -8 },
  OBS_05: { area: 'TIME', points: -18 },
  OBS_06: { area: 'FEEDBACK', points: -6 },
  OBS_07: { area: 'FEEDBACK', points: -9 },
  OBS_08: { area: 'FEEDBACK', points: -6 },
  OBS_09: { area: 'TIME', points: -12 },
  OBS_10: { area: 'STABILITY', points: -11 },
  OBS_11: { area: 'STABILITY', points: -8 },
  OBS_12: { area: 'STABILITY', points: -11 },
  OBS_13: { area: null, points: 0 } // 배타 — '특별히 큰 어려움은 없어요'
};

/**
 * q12(배점표 10번) 활동·입시 어려움 14지. 최대 3개, DIF_14 는 배타(감점 0).
 * 주의: DIF_09(논문·학술자료)는 선택지 순서상 활동 연계 사이에 끼어 있지만 영역은 탐구 심화다.
 */
export const DIFFICULTY_DEDUCTIONS = {
  DIF_01: { area: 'SUBJECT', points: -20 },
  DIF_02: { area: 'PERFORM', points: -13 },
  DIF_03: { area: 'PERFORM', points: -9 },
  DIF_04: { area: 'PERFORM', points: -9 },
  DIF_05: { area: 'INQUIRY', points: -9 },
  DIF_06: { area: 'INQUIRY', points: -13 },
  DIF_07: { area: 'ACTIVITY', points: -18 },
  DIF_08: { area: 'ACTIVITY', points: -12 },
  DIF_09: { area: 'INQUIRY', points: -9 },
  DIF_10: { area: 'RECORD', points: -30 },
  DIF_11: { area: 'STRATEGY', points: -9 },
  DIF_12: { area: 'STRATEGY', points: -13 },
  DIF_13: { area: 'STRATEGY', points: -9 },
  DIF_14: { area: null, points: 0 } // 배타 — '현재는 관련 도움이 크게 필요하지 않아요'
};

/* ------------------------------------------------------------------ *
 * 3. 가산 배점 — 배점표 01_문항별배점 3·5·6·11번 (§4.2.2)
 * 모든 조회는 POINTS[code] ?? 0 폴백을 거친다. undefined/NaN 을 내면
 * 영역 → 종합 → 뱃지 → gap → 긴급도까지 그대로 전파된다.
 * ------------------------------------------------------------------ */

/** q3 진학 목표(0~20). 목표 설정 aux 의 앞부분. */
export const GOAL_LEVEL_POINTS = {
  BOTH: 20,
  UNIV_ONLY: 14,
  MAJOR_ONLY: 14,
  TIER_ONLY: 8,
  UNDECIDED_MULTI: 4,
  NONE: 0
};

/**
 * q3-target-reason 목표 선정 이유(0~10). 목표 설정 aux 의 뒷부분.
 * goal.reason == null 은 상시 경로다(q3 '아직 구체적인 목표가 없어요' → 이유 문항 미노출) → 0 가산.
 */
export const GOAL_REASON_POINTS = {
  APTITUDE: 10,
  JOB: 10,
  REPUTATION: 5,
  SCORE_FIT: 4,
  PARENT: 3,
  LOCATION: 4,
  UNKNOWN: 0
};

/**
 * q8 최근 성적 흐름. EXEC·FEEDBACK 에 '각' 가산한다.
 * 실치역은 {2,3,5,8,10} — 6지 전부 2점 이상이고 gradeTrend 는 필수라 '미응답 0' 경로가 없다.
 */
export const TREND_POINTS = {
  UP_MOST: 10,
  UP_PART: 8,
  FLAT: 5,
  DOWN_PART: 3,
  VOLATILE: 2,
  NO_DATA: 5
};

/**
 * q6 모의고사 입력 칸수 → 교과 관리 aux. 미입력 5점이 기준점이고 채울수록 올라간다(감점 아님).
 * Q-09 확정(2026-08-11) — 배점표 원문 앵커는 0·2·4·6칸뿐이라 홀수(1·3·5칸)는 인접 앵커
 * 선형보간으로 채운다. 앵커 4개(0/2/4/6)는 원문 그대로이고 홀수 칸만 보간값이다.
 * 주의: 「채울수록 올라갑니다」는 이 aux 기준으로만 항상 참이다. scoreAreas 가 최종 점수를
 * roundHalfUp(...,0) 으로 정수화하므로(§4.2.2) 화면 표시 점수 기준으로는 3칸→4칸처럼 일부
 * 구간에서 정수 반올림 후 동점이 발생할 수 있다 — 이는 구조적 결과이며 버그가 아니다.
 */
export const MOCK_FILL_POINTS = { 0: 5, 1: 6, 2: 7, 3: 7.5, 4: 8, 5: 9, 6: 10 };

/** q13 임박 일정 → 긴급도 기본 점수(§4.4 E). */
export const SCHEDULE_POINTS = {
  PA_7D: 30,
  EXAM_2W: 20,
  MONTH_1: 10,
  SUSI: 30,
  NONE: 0,
  UNKNOWN: 5
};

/* ------------------------------------------------------------------ *
 * 4. 선택지 서수 → 코드 매핑 (§3.5) — 단방향
 * 배열 인덱스 = renewalSurveyQuestions[qN].options 인덱스. 라벨은 키가 아니다.
 * 인덱스 계약이 깨지면 조용히 오채점되므로 적재 검증식(§3.5)을 verify 스크립트 첫 항목에 둔다.
 * ------------------------------------------------------------------ */

export const OPTION_CODES = {
  Q1_GRADE_LEVEL: ['M3', 'H1', 'H2', 'H3', 'RETAKE'],
  Q2_SCHOOL_TYPE: ['GENERAL', 'AUTONOMOUS', 'SPECIAL', 'VOCATIONAL', 'ETC', 'NONE'],
  Q3_LEVEL: ['BOTH', 'UNIV_ONLY', 'MAJOR_ONLY', 'TIER_ONLY', 'UNDECIDED_MULTI', 'NONE'],
  Q3_REASON: ['APTITUDE', 'JOB', 'REPUTATION', 'SCORE_FIT', 'PARENT', 'LOCATION', 'UNKNOWN'],
  // 3번째 선택지는 T2 에서 '성취평가제 중심' → '중학생 평균'으로 교체된다(§2.2). 서수는 불변.
  Q4_SYSTEM: ['NINE', 'FIVE', 'MIDDLE_AVG', 'UNKNOWN'],
  Q8_TREND: ['UP_MOST', 'UP_PART', 'FLAT', 'DOWN_PART', 'VOLATILE', 'NO_DATA'],
  // 점수에는 쓰이지 않지만(trendSubject 는 표시 전용) 코드로 정규화한다 — 이 값은 sessionStorage 에
  // 영속화되므로 라벨을 그대로 담으면 문항 1자 수정이 과거 응답을 미지 값으로 만든다(§3.5).
  Q8_FOLLOWUP: ['KOREAN', 'MATH', 'ENGLISH', 'SOCIAL', 'SCIENCE', 'INQUIRY', 'MULTIPLE', 'UNKNOWN'],
  OBSTACLE: [
    'OBS_01', 'OBS_02', 'OBS_03', 'OBS_04', 'OBS_05', 'OBS_06', 'OBS_07',
    'OBS_08', 'OBS_09', 'OBS_10', 'OBS_11', 'OBS_12', 'OBS_13'
  ],
  DIFFICULTY: [
    'DIF_01', 'DIF_02', 'DIF_03', 'DIF_04', 'DIF_05', 'DIF_06', 'DIF_07',
    'DIF_08', 'DIF_09', 'DIF_10', 'DIF_11', 'DIF_12', 'DIF_13', 'DIF_14'
  ],
  SCHEDULE: ['PA_7D', 'EXAM_2W', 'MONTH_1', 'SUSI', 'NONE', 'UNKNOWN'],
  WISH: [
    'WISH_01', 'WISH_02', 'WISH_03', 'WISH_04', 'WISH_05',
    'WISH_06', 'WISH_07', 'WISH_08', 'WISH_09', 'WISH_10'
  ],
  Q16: ['HIGH', 'BORDER', 'HARD', 'NONE', 'UNKNOWN'],
  Q17: ['CONNECTED', 'UNLINKED', 'GRADE_OK', 'INQUIRY_OK', 'AVERAGE', 'UNKNOWN'],
  Q18: ['CONFIDENT', 'BASIC', 'RECORD_WEAK', 'NOT_STARTED', 'NO_INTERVIEW', 'UNKNOWN']
};

/** OPTION_CODES 각 키가 어느 문항의 options 를 참조하는지 — 적재 검증식(§3.5)이 쓴다. */
export const OPTION_SOURCE_QUESTION = {
  Q1_GRADE_LEVEL: 'q1',
  Q2_SCHOOL_TYPE: 'q2',
  Q3_LEVEL: 'q3',
  Q3_REASON: 'q3-target-reason',
  Q4_SYSTEM: 'q4',
  Q8_TREND: 'q8',
  Q8_FOLLOWUP: 'q8-followup',
  OBSTACLE: 'q10',
  DIFFICULTY: 'q12',
  SCHEDULE: 'q13',
  WISH: 'q14',
  Q16: 'q16',
  Q17: 'q17',
  Q18: 'q18'
};

/** 리커트 안정 키(§3.3). LK1_nn = q9.statements[nn-1], LK2_nn = q11.statements[nn-1]. */
export const LIKERT1_KEYS = Array.from({ length: 12 }, (_, i) => `LK1_${String(i + 1).padStart(2, '0')}`);
export const LIKERT2_KEYS = Array.from({ length: 12 }, (_, i) => `LK2_${String(i + 1).padStart(2, '0')}`);

/** 배타 선택지 — 고르면 같은 문항의 다른 선택이 해제되고 감점이 0이 된다. */
export const EXCLUSIVE_CODES = { OBSTACLE: 'OBS_13', DIFFICULTY: 'DIF_14' };

/* ------------------------------------------------------------------ *
 * 5. 입력 도메인 — §3.4
 *
 * 입력 허용 범위·마스크 표는 여기 두지 않는다. renewalSurveyQuestions.js 의
 * GRADE_SYSTEM_INPUT_RULES 가 정본이고, 여기 사본을 두면 두 표가 갈라져
 * "화면에서 통과한 값이 채점에서 정의역 밖으로 떨어지는" 사고가 난다(그 사본은 소비자가 0건이었다).
 * 등급 체계별로 숨겨지는 칸(중학생 평균의 모의고사·최근시험)도 문항 데이터의
 * group.hiddenWhenGradeSystem 이 정본이며, normalizeAnswers 가 그 선언을 그대로 읽는다.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 6. 서비스 추천 — 배점표 03_서비스추천 (§4.5)
 * ------------------------------------------------------------------ */

export const SERVICE_CODES = [
  'GOAL_CARE',
  'PERFORM_SUPPORT',
  'DEEP_INQUIRY',
  'SELF_REVIEW',
  'GROWTH_DESIGN',
  'CALL_MENTOR'
];

export const SERVICE_LABEL = {
  GOAL_CARE: '위닝 목표관리',
  PERFORM_SUPPORT: '위닝 수행평가',
  DEEP_INQUIRY: '위닝 심화탐구',
  SELF_REVIEW: '위닝 자기평가서',
  GROWTH_DESIGN: '위닝 성장설계',
  CALL_MENTOR: '위닝 콜멘토'
};

/**
 * 적합도 100점 = 어려움 50 + 희망 20 + 영역 30.
 * threshold 는 "n개 체크 시 50점"의 n — 자기평가서만 1이다.
 * 1·2개 체크 시 배분 규칙은 원문에 없다(미확정 Q-14, 현재 비례 배분 가정).
 * SERVICE_CODES 순서 = 동점 타이브레이커 순서.
 */
export const SERVICE_RULES = {
  GOAL_CARE: {
    items: ['OBS_01', 'OBS_02', 'OBS_03', 'OBS_04', 'OBS_05', 'OBS_06', 'OBS_07', 'OBS_08', 'OBS_09'],
    threshold: 3,
    wishOptions: ['WISH_01', 'WISH_02', 'WISH_03', 'WISH_04'],
    linkedAreas: ['PLAN', 'EXEC', 'TIME', 'FEEDBACK']
  },
  PERFORM_SUPPORT: {
    items: ['DIF_02', 'DIF_03', 'DIF_04'],
    threshold: 3,
    wishOptions: ['WISH_05'],
    linkedAreas: ['PERFORM']
  },
  DEEP_INQUIRY: {
    items: ['DIF_05', 'DIF_06', 'DIF_09'],
    threshold: 3,
    wishOptions: ['WISH_06'],
    linkedAreas: ['INQUIRY']
  },
  SELF_REVIEW: {
    items: ['DIF_10'],
    threshold: 1,
    wishOptions: ['WISH_07'],
    linkedAreas: ['RECORD']
  },
  GROWTH_DESIGN: {
    items: ['DIF_07', 'DIF_08', 'DIF_11', 'DIF_12', 'DIF_13'],
    threshold: 3,
    wishOptions: ['WISH_01', 'WISH_08', 'WISH_09'],
    linkedAreas: ['ACTIVITY', 'STRATEGY']
  },
  CALL_MENTOR: {
    items: ['OBS_10', 'OBS_11', 'OBS_12'],
    threshold: 3,
    wishOptions: ['WISH_08', 'WISH_09', 'WISH_10'],
    linkedAreas: ['STABILITY']
  }
};

/**
 * q19 자유 서술 감지 단어 18개(배점표 17번 원문 "위닝 콜멘토 어려움 +10점").
 *
 * 확정(Q-36 해소, 사용자 확정 2026-08-11): 이 목록으로 만든 가산 +10은 콜멘토 적합도 **점수에서
 * 제거했다**. 판정이 `freeText.includes(keyword)` 부분 문자열 매칭이라 오탐이 구조적이다 —
 * '울' → '서울대 가고 싶어요' · '울산에서 통학해요' 가 걸리고, '비교'·'혼자' 는 부정문
 * ('비교하지 않으려 해요' · '혼자 있는 시간이 좋아요')에서 걸린다. 추천 구간 경계(80/65/50)를
 * 한 칸 넘겨 1순위 서비스를 바꿀 수 있는데, 한 문장 키워드 매칭은 그 정도 권한을 정당화할 근거가
 * 못 된다는 것이 결정 사유다.
 *
 * 목록 자체(감지 대상)는 배점표 원문 그대로 유지한다 — 감지는 계속하고, `detectEmotionalSignal()`
 * (diagnosisScoring.js)이 `{ hit, matchedKeywords }` 구조로 뽑아 점수와 분리된 신호로만 낸다.
 * 실제 배점은 후속 작업(LLM 분류 또는 어드민 수동 배점, docs/학습진단-마무리-항목.md B절) 몫이다.
 * 원래 가산치는 10 이었다(§4.5 원문) — 후속 배점 작업에서 값을 되살릴 때 참조한다.
 */
export const CALL_MENTOR_KEYWORDS = [
  '불안', '걱정', '무섭', '막막', '답답', '우울', '힘들', '지치', '포기',
  '의욕', '자신감', '비교', '눈치', '부담', '스트레스', '혼자', '외로', '울'
];

/** 적합도 버킷 상한(§4.5). 합이 100이라 fit <= 100 불변식의 근거가 된다. */
export const SERVICE_PART_CAPS = { difficulty: 50, wish: 20, area: 30 };

/**
 * 학년별 후보 제한(배점표 1번). null 이면 6종 전부.
 * 미확정 Q-13 — 고3 "6월 이후 가입은 2종"의 기준일·판정 소스가 원문에 없어 현재는 6종 전부로 둔다.
 */
export const SERVICE_GRADE_FILTER = {
  M3: ['GOAL_CARE', 'CALL_MENTOR'],
  H1: null,
  H2: null,
  H3: null,
  RETAKE: ['GOAL_CARE', 'CALL_MENTOR']
};

/* ------------------------------------------------------------------ *
 * 7. 경계값 — 모든 임계의 단일 정의처 (§4.4 · §6.1)
 * ------------------------------------------------------------------ */

/** 5단계 등급(§4.4 A). 상단 포함(>=)으로 통일 — 원문은 '80+'만 명시(Q-11). */
export const SCORE_BANDS = { L1: 80, L2: 70, L3: 60, L4: 45 };

/**
 * {grade} 라벨 5종(§5.2). levelOf 전용이며 STATE_LABEL(stateOf)과 절대 혼용하지 않는다.
 * L5 는 배점표 02 표기 '우선 보완 필요'를 채택했다. 문구집 02 구분 문자열은 'L5 우선 보완',
 * STATE_LABEL.page2.WEAK 는 '우선 보완'이라 셋의 문자열이 서로 다르다 — 미확정 Q-34.
 */
export const LEVEL_LABEL = {
  L1: '안정',
  L2: '양호',
  L3: '점검 필요',
  L4: '보완 필요',
  L5: '우선 보완 필요'
};

/**
 * 확정: 배점표 02_영역_구성 "영역 상태 … (70·60·45 기준)" (Q-32 해소, 사용자 확정 2026-08-11).
 * 승인된 디자인 샘플(renewalReportSample)이 함의하던 40/50/70 경계는 폐기됐다 — 배점표 원문이
 * 직접 명시한 70/60/45 가 정본이다.
 * stateOf 라벨과 toneOf 색이 **둘 다** 여기서 파생된다(STATE_TONE 참조).
 */
export const AREA_BAND_THRESHOLDS = { TOP: 70, MID: 60, LOW: 45 };

/** 영역 상태 화면 라벨(§4.4 B). 03_진단서술 조회 키는 이게 아니다 — diagnosisCopy 의 NARRATIVE_STATE_LABEL. */
export const STATE_LABEL = {
  page1: { TOP: '상위', MID: '보통', LOW: '보완 필요', WEAK: '취약' },
  page2: { TOP: '양호', MID: '점검 필요', LOW: '보완 필요', WEAK: '우선 보완' }
};

/** 상태 → tone(§7.3). 별도 임계를 두지 않는다 — Q-32 를 뒤집으면 라벨과 색이 함께 움직여야 한다. */
export const STATE_TONE = { TOP: 'blue', MID: 'blue', LOW: 'amber', WEAK: 'red' };

/** 우선순위 뱃지(§4.4 C). PAGE1 6영역 점수 오름차순. 정확히 6개 — 불변식으로 검사한다. */
export const BADGES = ['1순위', '2순위', '3순위', '4순위', '점검', '유지'];

/** 목표 점수(§4.4 D). gap = TARGET_SCORE − PAGE1 최저 영역 점수. */
export const TARGET_SCORE = 75;

/** 서비스 추천 구간(§4.5). LOW 미만이면 리포트에서 제외한다. */
export const SERVICE_BANDS = { HIGH: 80, MID: 65, LOW: 50 };

/** 2순위 노출 조건 — "65점 이상이고 1순위와 20점 이내면 함께 노출"(배점표 03). */
export const SERVICE_RANK2_MIN_FIT = 65;
export const SERVICE_RANK2_MAX_DIFF = 20;

/** 긴급도 구간(§4.4 E). 0~19 낮음 / 20~34 보통 / 35~49 높음 / 50 이상 매우 높음. */
export const URGENCY_BANDS = { L4: 50, L3: 35, L2: 20 };

/**
 * 긴급도 카운트 임계 40. 다른 모든 경계(45/60/70/80)와 어긋나는 유일한 값이지만 원문 그대로다.
 * AREA_BAND_THRESHOLDS 와 별도 상수로 유지한다 — Q-32 확정과 무관하게 40은 따라가지 않는다(Q-12 해소).
 */
export const URGENCY_AREA_THRESHOLD = 40;

/**
 * 확정: 배점표 산식은 "11번 점수 + (40점 미만 영역 수 × 10)"이고 영역 범위를 별도로 제한하지
 * 않는다(Q-12 해소, 사용자 확정 2026-08-11). 배점표가 정의하는 영역은 PAGE1 6개 + PAGE2 6개 =
 * 12개뿐이므로 ALL_12 가 곧 "문서가 정의하는 전체 영역"이다. 05_예시("40점 미만 영역 3개")는
 * PAGE1 6영역만으로는 1개뿐이라 이 해석에서만 재현된다.
 */
export const URGENCY_SCOPE = 'ALL_12'; // 'ALL_12' | 'PAGE1'

/** 2페이지 강점 임계(§5.1). STR_NONE 문구에서 역산한 값이라 임계·개수·대상 모두 미확정 Q-07. */
export const STRENGTH_THRESHOLD = 60;

/* ------------------------------------------------------------------ *
 * 8. 합격 가능성 — 배점표 04_합격가능성 · 14~16번 (§4.6)
 * ------------------------------------------------------------------ */

/** 소신/안정 판정의 등급 여유폭. 9등급 스케일 등급 차 0.30. */
export const ADMISSION_MARGIN = 0.30;

/** 입결 비교표 행 키. 값이 null 인 행은 표에서 자동 제외한다(배점표 04 주석). */
export const ADMISSION_ROW_KEYS = ['cut50', 'cut70', 'avg', 'mine'];

/**
 * 미확정 Q-28 — 사용자 확정 시 이 값만 바꾸면 된다.
 * A4: 50% 컷만 있고 70% 컷이 없는 대학의 구간 판정 규칙이 원문에 없다. null(=BAND_NODATA 폴백)을
 * 내고 값을 창작하지 않는다. rev.1 코드는 이 경로에서 안정권 학생을 무조건 '위험'으로 표시했다.
 */
export const BAND_NODATA = null;

/**
 * 미확정 Q-35 — 사용자 확정 시 이 분기를 실제 조회에 연결한다.
 * A6: 자율형·사립고/특목고는 별도 입결 마스터를 쓴다고만 적혀 있고 데이터 출처·조회 규칙이 없다.
 * 현재는 키만 산출하고 조회는 일반 마스터 단일 경로로 간다.
 */
export const ADMISSION_MASTER_KEYS = { GENERAL: 'GENERAL', SPECIAL: 'SPECIAL_TODO' };
export const ADMISSION_SPECIAL_SCHOOL_TYPES = ['AUTONOMOUS', 'SPECIAL'];

/** 확률 가감(%p) — 배점표 14·15·16번. 합의 범위는 −25 ~ +15. */
export const CSAT_MIN_DELTA = { HIGH: 5, BORDER: -5, HARD: -15, NONE: 0, UNKNOWN: -5 };
export const JONGHAP_DELTA = { CONNECTED: 5, UNLINKED: 0, GRADE_OK: 0, INQUIRY_OK: 0, AVERAGE: 0, UNKNOWN: -5 };
export const INTERVIEW_DELTA = { CONFIDENT: 5, BASIC: 0, RECORD_WEAK: -5, NOT_STARTED: -10, NO_INTERVIEW: 0, UNKNOWN: -5 };

/**
 * 미확정 Q-03 — 사용자 확정 시 이 값만 바꾸면 된다.
 * A7: 확률 기준값이 두 원본 어디에도 없다. null 인 동안 successProbability 는 항상 null 을 반환하고
 * 화면은 밴드 4글자(안정/적정/소신/위험)로 떨어진다. 값을 창작하지 않는다.
 */
export const BASE_PROBABILITY = null;

/**
 * 확률 정의역. 상한은 반드시 100 미만이어야 한다 — 100이 되면 렌더 문자열이
 * '합격 가능성 예측 100%'가 되어 06_금지어 '결과 단정'의 "100%"와 문자 그대로 일치한다.
 */
export const PROB_MIN = 5;
export const PROB_MAX = 95;

/* ------------------------------------------------------------------ *
 * 9. 문구 폴백 — 이 파일에 두지 않는다
 * COPY_FALLBACK 의 정의처는 src/data/diagnosisCopy.js 하나다(Q-29 확정으로 VALUE_MISSING 만 남았다).
 * 여기서 재수출하면 엔진(diagnosisScoring → 이 파일)이 문구 모듈을 전이 import 하게 되어
 * "엔진은 문구 모듈을 import 하지 않는다"(§6.2 계층 계약)가 깨진다.
 * 소비자(diagnosisReport)는 diagnosisCopy.js 에서 직접 가져간다.
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 10. 검산 픽스처 — 배점표 05_예시 (§8 CASE-01~05)
 * verify 스크립트가 소비한다. pending: true 는 실패가 아니라 WARN 으로만 출력하고
 * 종료코드에 반영하지 않는다 — 재현 불가가 확정된 케이스이기 때문이다.
 * ------------------------------------------------------------------ */

export const EXAMPLE_CASES = [
  {
    id: 'EX-01',
    spec: 'CASE-01',
    title: '계획 설계 단일 영역 (05_예시 ①~④)',
    pending: false,
    input: {
      likert1: { LK1_03: 50, LK1_04: 25 }, // '보통이다' / '별로 그렇지 않다'
      obstacles: ['OBS_02']
    },
    expected: {
      scaleMean: 37.5,
      scalePart: 26.25, // 배점표 표기는 26.3이지만 중간값이라 반올림하지 않는다
      nonScalePart: 15,
      areaScore: { PLAN: 41 }
    }
  },
  {
    id: 'EX-02',
    spec: 'CASE-02',
    title: '종합·등급·시급 영역·목표 부족분·뱃지 (05_예시)',
    pending: false,
    input: {
      areaScores: { GOAL: 77, PLAN: 41, EXEC: 39, TIME: 56, FEEDBACK: 60, STABILITY: 65 }
    },
    expected: {
      page1Overall: 56.3, // 338 / 6 = 56.333
      level: 'L4',
      lowestArea: 'EXEC',
      lowestScore: 39,
      gap: 36, // 75 − 39
      badges: { EXEC: '1순위', PLAN: '2순위', TIME: '3순위', FEEDBACK: '4순위', STABILITY: '점검', GOAL: '유지' }
    }
  },
  {
    id: 'EX-03',
    spec: 'CASE-03',
    title: '긴급도 (05_예시)',
    // Q-12 해소(사용자 확정) — URGENCY_SCOPE = ALL_12 가 정본이다. PAGE2 값은 05_예시 원문에
    // 없어 합성했지만, 집계 범위 자체는 03_서비스추천 산식이 12영역 전체를 전제하므로 가정이 아니다.
    pending: false,
    input: { schedule: 'EXAM_2W', lowAreaCount: 3 },
    expected: { urgencyScore: 50, urgencyLevel: 'L4' }
  },
  {
    id: 'EX-04',
    spec: 'CASE-05',
    title: '서비스 1순위 (05_예시)',
    // Q-14 해소(사용자 확정) — 05_예시의 "목표관리 73점"은 문서 오기다. 산식(어려움 50 + 희망 20 +
    // 영역 30)대로 계산하면 85.3 이 정답이다: 어려움 50(OBS_01~03 3/3 체크) + 희망 20(WISH_02) +
    // 영역 15.3(30 × (100 − mean(41,39,56,60)=49)/100). fit=85.3 은 SERVICE_BANDS.HIGH(80) 이상이라
    // tier 도 MID 가 아니라 HIGH 다.
    pending: false,
    input: { areaScores: { PLAN: 41, EXEC: 39, TIME: 56, FEEDBACK: 60 } },
    expected: { service: 'GOAL_CARE', fit: 85.3, tier: 'HIGH' }
  },
  {
    id: 'EX-05',
    spec: 'CASE-04',
    title: '합격 가능성 (05_예시)',
    pending: false,
    input: { mine: 3.24, cuts: { cut50: null, cut70: 2.56, finalAvg: null } },
    expected: {
      band: 'RISK', // 3.24 > 2.56 + 0.30
      rows: [
        { key: 'cut70', value: 2.56, diff: 0.68 },
        { key: 'mine', value: 3.24, diff: null }
      ]
    }
  }
];

/** 비-pending 단언이 이 수 아래로 떨어지면 verify 스크립트가 공허하게 통과한 것이다. */
export const EXAMPLE_CASES_MIN_ASSERTIONS = 5;
