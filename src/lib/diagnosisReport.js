/**
 * DiagnosisInput → ReportData 조립 — 명세 §7(리포트 컴포넌트 연결) 전담.
 *
 * 계층 규칙(§6.2 · §10 T15/T16 책임 경계)
 *   diagnosisScoring.js      : 코드·수치만 낸다.
 *   diagnosisCopyBinding.js  : 코드 → 문구 조회 + 토큰 치환.
 *   diagnosisReport.js(여기) : 위 둘을 합쳐 컴포넌트가 그대로 렌더할 문자열을 완성한다.
 * 여기에는 채점 규칙·경계값·문구 원문을 다시 쓰지 않는다 — 값이 두 곳에 있으면 한쪽만 고쳐진다.
 * 단위 문자열('점' · '등급' · '/100')은 엔진 쪽 책임이라 여기서 붙인다(§7.4.3 — 컴포넌트는 단위를 모른다).
 *
 * React 를 import 하지 않는 순수 함수 모듈이다. 시계도 읽지 않는다(diagnosedAt 은 입력이 들고 온다).
 * verify 스크립트가 plain node 로 그대로 import 한다.
 *
 * 결측 정책: 예외를 던지지 않는다. 값이 없으면 §5.2/§7.2 가 지정한 폴백으로 떨어뜨리고,
 * 폴백이 지정되지 않은 자리는 문구를 창작하는 대신 해당 요소를 뺀다. 다만 §7.4.3 불변식
 * (learningAxes 6 · readiness.areas 6 · summaryCards 3 · admission 5키 · rows 배열)은 항상 지킨다 —
 * AdmissionSection 은 admission 을 무조건 구조분해하고 rows.map 을 돌기 때문에 null 이면 흰 화면이 된다.
 */

// 확장자 .js 명시 — verify 스크립트가 plain node ESM 으로 직접 import 한다(확장자 생략 해석 불가).
import {
  admissionBand,
  admissionRows,
  classifyStudentType,
  convertToNineScale,
  detectEmotionalSignal,
  levelOf,
  overallScore,
  priorityBadges,
  rankServices,
  scoreAreas,
  sortByScoreAsc,
  stateOf,
  successProbability,
  targetGap,
  toneOf,
  urgencyOf
} from './diagnosisScoring.js';
import {
  areaCopy,
  commonCopy,
  fill,
  levelCopy,
  narrativeCopy,
  serviceCopy,
  templateCopy
} from './diagnosisCopyBinding.js';
import {
  ADMISSION_BAND_COPY,
  ADMISSION_BAND_LABEL,
  COPY_FALLBACK,
  TYPE_COPY,
  URGENCY_COPY
} from '../data/diagnosisCopy.js';
import {
  AREA_CODES,
  AREA_LABEL,
  BADGES,
  LEVEL_LABEL,
  PAGE1_AREAS,
  PAGE2_AREAS,
  SERVICE_LABEL,
  STATE_LABEL,
  STRENGTH_THRESHOLD,
  TARGET_SCORE
} from '../data/diagnosisScoringTable.js';
import { renewalSurveyQuestions } from '../data/renewalSurveyQuestions.js';

/* ================================================================== *
 * 0. 이 파일이 소유하는 최소 상수
 * 문구집·배점표 어디에도 집이 없어 여기 둘 수밖에 없는 값만 남긴다.
 * ================================================================== */

/**
 * 추천 카드 순위 라벨(§7.2 recommendations). 문구집 문자열이 아니라 카드 제목의 구조 라벨이고,
 * BADGES(우선순위 뱃지)와 문자열이 같지만 의미가 달라 재사용하지 않는다 — 뱃지 라벨이 바뀌어도
 * 서비스 순위 표기는 따라가면 안 된다.
 */
const RANK_LABELS = ['1순위', '2순위'];

/**
 * 문구집에 대응 문장이 없어 이 파일이 잠정으로 갖는 사용자 노출 문자열.
 * 문구집 개수 검산(341 + 22)에 섞이면 안 되므로 diagnosisCopy 로 옮기지 않고 여기 격리한다.
 * 문구가 발주되면 COPY_FALLBACK 으로 이사한다. export 하지 않는다 — 소비자가 이 파일뿐이다.
 *
 * TODO(Q-04 · Q-28): BAND_VALUE_NODATA 는 입결 자료가 없어 밴드조차 못 낼 때의 값 슬롯이다
 *   (문구집 BAND_NODATA 는 summary 용 장문이라 이 자리에 쓸 수 없다).
 * TODO(Q-01): TRAITS_HEADING_ANON 은 이름 미수집 상태의 section_traits 축약형이다(§5.2 name 결측).
 * TODO(Q-04): PROBABILITY_LABEL 은 admission_headline 에서 '{prob}%' 접두를 잘라 쓰는 경로가
 *   실패했을 때(문구집이 '{prob}% 합격 가능성' 류로 바뀌면 접두가 빈 문자열이 된다) 쓰는 라벨이다.
 */
const REPORT_FALLBACK = {
  BAND_VALUE_NODATA: '자료 없음',
  TRAITS_HEADING_ANON: '주요 학습 특성',
  PROBABILITY_LABEL: '합격 가능성'
};

/**
 * TODO(Q-07): 강점·보완 카드 개수 상한과 강점 집계 대상. 임계(STRENGTH_THRESHOLD)와 달리 개수는
 * 원문에 없고 승인된 픽스처(강점 3 · 보완 4)와 A4 박스 높이에서만 나온 값이라 여기 둔다.
 * 대상 범위도 미확정이다 — §5.1 은 '2페이지 강점'이라 적었으나 강점 문구(AREA_COPY.strength)는
 * 12영역 전부에 있어 현재는 12영역을 채택했다. PAGE2 6영역으로 확정되면 이 상수만 바꾼다.
 */
const STRENGTH_MAX = 3;
const IMPROVEMENT_MAX = 4;
const STRENGTH_SCOPE = AREA_CODES;
const IMPROVEMENT_SCOPE = AREA_CODES;

/** 주요 학습 특성 카드 수(§7.2 traits 3블록). PAGE1 하위 3영역을 쓴다. */
const TRAIT_COUNT = 3;

/**
 * 아직 어느 슬롯에도 바인딩되지 않은 문구 — '누락'이 아니라 '보류'임을 여기 남긴다.
 *   AREA_COPY.levels (12영역 × 5등급 = 60)  : 영역별 등급 서술. §7.2 의 컴포넌트 계약에 대응 슬롯이
 *     없다. 우선순위 표는 status(stateOf)와 need 만 쓰고, 등급(levelOf)은 종합 점수에만 붙는다.
 *   AREA_COPY.strategies (12영역 × 4 = 48)  : 영역별 실행 전략. 2페이지 '먼저 할 일' 리스트가
 *     들어갈 자리인데 승인된 리포트에 그 블록이 없다.
 * TODO(Q-07 · Q-22): 두 묶음의 노출 위치가 정해지면 buildReport 가 조립한다. 지금 임의 슬롯에
 *   밀어 넣으면 승인된 레이아웃이 무너지고, 조립하지 않으면 108개 문구가 조용히 죽는다.
 *   CASE-10 개수 검산(341)이 두 묶음을 계속 세고 있어 사라지지는 않는다.
 */

/* ================================================================== *
 * 1. 조회 · 포맷 유틸
 * ================================================================== */

const QUESTION_BY_ID = new Map(renewalSurveyQuestions.map((question) => [question.id, question]));

/**
 * 코드 → 선택지 라벨 역변환(§7.2 "q1 / q2 라벨 그대로").
 * DiagnosisInput 은 라벨을 보존하지 않으므로 UI 가 렌더한 것과 같은 배열에서 되찾는다 —
 * 라벨 상수를 여기 복사해 두면 문항 문구를 고칠 때 리포트만 옛 문자열로 남는다.
 */
function optionLabelOf(questionId, code) {
  if (code == null) return null;
  const question = QUESTION_BY_ID.get(questionId);
  const index = question?.optionCodes?.indexOf(code) ?? -1;
  if (index === -1) return null;
  const option = question.options?.[index];
  return typeof option === 'string' ? option : (option?.label ?? option?.value ?? null);
}

/** 값이 없으면 '미입력'(§7.2 가 명시한 유일한 노출 폴백). 빈 문자열이 화면에 나가지 않게 하는 관문이다. */
function orMissing(value) {
  return value == null || value === '' ? COPY_FALLBACK.VALUE_MISSING : value;
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 전체 평균 내신 표기(§7.2). **원값을 표기한다** — 9등급 환산값(§4.1)은 입결 비교 전용이라
 * 여기에 쓰면 중학생 87.5점이 '2.75등급'으로 둔갑한다.
 */
function formatGpa(gradeSystem, raw) {
  if (!isNumber(raw)) return COPY_FALLBACK.VALUE_MISSING;
  switch (gradeSystem) {
    case 'NINE':
      return `${raw.toFixed(2)}등급(9등급제)`;
    case 'FIVE':
      return `${raw.toFixed(2)}등급(5등급제)`;
    case 'MIDDLE_AVG':
      return `${raw.toFixed(1)}점`;
    default:
      // UNKNOWN — 체계를 모르면 단위를 붙일 수 없다. '3.24'만 내면 등급인지 점수인지 알 수 없다.
      return COPY_FALLBACK.VALUE_MISSING;
  }
}

/** 제출 시각 → 'YYYY.MM.DD'(§7.2). 파싱 실패는 null 로 떨어뜨려 호출부가 '미입력'을 쓰게 한다. */
function formatDiagnosedAt(value) {
  if (typeof value !== 'string' || value === '') return null;
  const matched = value.match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
  if (matched) return `${matched[1]}.${matched[2]}.${matched[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}.${month}.${day}`;
}

/* ================================================================== *
 * 2. 페이지 1 섹션
 * ================================================================== */

/**
 * 헤드라인(§5.2 headline · §7.2).
 * 유형 판정이 미확정(Q-05)이라 head 는 상시 null 이고, 그때는 PAGE1 종합 등급 문구로 떨어진다.
 * 이름도 미수집(Q-01)이라 '{name} 학생, ' 접두는 통째로 빠진다 — 토큰 원문이 화면에 도달하면 안 된다.
 */
function buildHeadlineLines(input, areaScores, page1Level) {
  const type = classifyStudentType(input, areaScores);
  const head = type ? TYPE_COPY[type]?.head : null;
  const name = input.profile?.name ?? null;

  if (head && name) return [fill(templateCopy('headline'), { name, head }, 'headline')];
  if (head) return [head];
  return [levelCopy(1, page1Level)].filter((line) => line != null);
}

/**
 * 학습 6축(§7.2 learningAxes). 배열 순서는 PAGE1_AREAS 고정 = 레이더 축 순서다.
 * PriorityTable 은 ReportPageOne 이 이 배열을 오름차순 정렬해 받으므로, badge 는 정렬 결과와
 * 반드시 일치해야 한다 — 그래서 뱃지는 직접 세지 않고 priorityBadges() 결과를 인덱싱한다.
 */
function buildLearningAxes(areaScores) {
  const badgeByCode = new Map(priorityBadges(areaScores).map((row) => [row.code, row.badge]));
  const keepBadge = BADGES[BADGES.length - 1]; // '유지' — need.keep 분기 조건(§5.1 · Q-06)

  return PAGE1_AREAS.map((code) => {
    const score = areaScores[code] ?? 0;
    const badge = badgeByCode.get(code);
    const need = areaCopy(code)?.need;
    return {
      name: AREA_LABEL[code],
      score,
      badge,
      status: STATE_LABEL.page1[stateOf(score)],
      tone: toneOf(score),
      need: (badge === keepBadge ? need?.keep : need?.improve) ?? COPY_FALLBACK.VALUE_MISSING
    };
  });
}

/** 요약 카드 3장(§7.2). label 이 React key 라 3개가 유일해야 한다(문구집 title 3종이 서로 다르다). */
function buildSummaryCards(page1Overall, page2Overall, gap) {
  return [
    {
      label: templateCopy('card_exec.title'),
      value: `${page1Overall}점`,
      sub: fill(templateCopy('card_exec.sub'), { target: TARGET_SCORE }, 'card_exec.sub')
    },
    {
      label: templateCopy('card_school.title'),
      value: `${page2Overall}점`,
      sub: fill(
        templateCopy('card_school.sub'),
        { grade: LEVEL_LABEL[levelOf(page2Overall)] },
        'card_school.sub'
      )
    },
    {
      label: templateCopy('card_urgent.title'),
      value: gap.lowestName,
      // gap <= 0 이면 '목표까지 0점 부족'이 렌더된다 — 문구집에 대응 문장이 없어 폴백으로 막는다(A5 · Q-29).
      sub: gap.reached
        ? COPY_FALLBACK.URGENT_GOAL_REACHED
        : fill(templateCopy('card_urgent.sub'), { gap: gap.gap }, 'card_urgent.sub')
    }
  ];
}

/**
 * 주요 학습 특성 3블록(§7.2 traits) — PAGE1 점수 오름차순 하위 3영역.
 * 조회 키는 화면 라벨이 아니라 상태 코드다(§5.1 매핑표 — narrativeCopy 가 코드만 받는다).
 * 문구가 없는 조합은 빈 카드를 만들지 않고 제외한다(창작 금지).
 */
function buildTraits(areaScores) {
  return sortByScoreAsc(PAGE1_AREAS, areaScores)
    .slice(0, TRAIT_COUNT)
    .map((code) => narrativeCopy(code, stateOf(areaScores[code] ?? 0)))
    .filter((copy) => copy != null)
    .map((copy) => ({ title: copy.title, body: copy.body }));
}

/* ================================================================== *
 * 3. 페이지 2 섹션
 * ================================================================== */

/**
 * 2페이지 요약 줄(§5.2 page2_summary 결측·경계 분기).
 * 최고·최저가 같거나 최고점 자체가 저득점이면 "{high} 영역은 안정적으로 관리되고 있으나"가 사실과
 * 어긋난다 → 종합 등급 문구 단독으로 대체한다. 저득점 판정은 stateOf 에서 파생시켜 Q-32 확정 시
 * 임계가 한 곳만 움직이게 한다(별도 상수를 두면 경계가 두 벌이 된다).
 */
function buildReadinessSummary(areaScores, page2Overall) {
  const sorted = sortByScoreAsc(PAGE2_AREAS, areaScores);
  const lowCode = sorted[0];
  const highCode = sorted[sorted.length - 1];
  const lowScore = areaScores[lowCode] ?? 0;
  const highScore = areaScores[highCode] ?? 0;
  const highState = stateOf(highScore);
  const fallback = [levelCopy(2, levelOf(page2Overall))].filter((line) => line != null);

  // 동점 판정은 **점수**로 한다. 코드 동일성(highCode === lowCode)은 원소가 6개라 절대 성립하지
  // 않는 죽은 분기였고, 그 탓에 6영역이 모두 같은 점수인 응답에서 두 영역을 우열로 서술했다.
  if (highScore === lowScore || (highState !== 'TOP' && highState !== 'MID')) return fallback;

  const line = fill(
    templateCopy('page2_summary'),
    { high: AREA_LABEL[highCode], low: AREA_LABEL[lowCode] },
    'page2_summary'
  );
  return line ? [line] : fallback;
}

/** 6영역 바 그래프(§7.2 readiness.areas) — **정렬 주체가 엔진**이다(PAGE1 과 달리 컴포넌트가 정렬하지 않는다). */
function buildReadinessAreas(areaScores) {
  return sortByScoreAsc(PAGE2_AREAS, areaScores).map((code) => {
    const score = areaScores[code] ?? 0;
    return {
      name: AREA_LABEL[code],
      score,
      tone: toneOf(score),
      status: STATE_LABEL.page2[stateOf(score)]
    };
  });
}

/**
 * 강점 리스트(§5.1 강점 개수 분기 B-04).
 * 0개·1개 분기가 문구집에 있는데 InsightColumns 에는 캡션 슬롯이 없다 → 리스트 첫 항목으로 흡수한다
 * (컴포넌트를 고치지 않고 문구도 창작하지 않는 유일한 경로).
 */
function buildStrengths(areaScores) {
  const items = [...STRENGTH_SCOPE]
    .sort(
      (a, b) =>
        (areaScores[b] ?? 0) - (areaScores[a] ?? 0) ||
        STRENGTH_SCOPE.indexOf(a) - STRENGTH_SCOPE.indexOf(b)
    )
    .filter((code) => (areaScores[code] ?? 0) >= STRENGTH_THRESHOLD)
    .slice(0, STRENGTH_MAX)
    .map((code) => areaCopy(code)?.strength)
    .filter((text) => typeof text === 'string');

  if (items.length === 0) return [commonCopy('STR_NONE')].filter((text) => text != null);
  if (items.length === 1) return [commonCopy('STR_ONE'), items[0]].filter((text) => text != null);
  return items;
}

/** 보완 리스트(§5.1) — 하위 영역의 weakness. 임계·개수·대상은 미확정(Q-07)이라 하위 N개 고정이다. */
function buildImprovements(areaScores) {
  return sortByScoreAsc(IMPROVEMENT_SCOPE, areaScores)
    .slice(0, IMPROVEMENT_MAX)
    .map((code) => areaCopy(code)?.weakness)
    .filter((text) => typeof text === 'string');
}

/**
 * 입결 비교 섹션(§4.6 · §7.2 B-13).
 *
 * AdmissionSection 은 5키를 무조건 구조분해하고 rows.map 을 돈다 — 입결 마스터가 연결되지 않은
 * 현재(ctx.cuts 부재)에도 admission 객체와 rows: [] 는 반드시 존재해야 한다.
 * 행 라벨·'0.91등급 부족' 문자열화는 여기 몫이다(엔진은 key/value/diff 구조만 낸다).
 */
function buildAdmission(input, ctx) {
  const cuts = ctx.cuts ?? {};
  const mine = convertToNineScale(input.gradeSystem, input.scores?.naesinOverall);
  const band = admissionBand(mine, cuts);
  const probability = successProbability(input, band);

  // TODO(Q-04): 확률 비노출이 확정되면 라벨은 '합격 가능성'이 된다. 지금은 문구집 원문에서 접두를
  // 잘라 쓴다 — 문자열을 새로 쓰지 않으면서 '{prob}%' 슬롯만 밴드 4글자로 대체하는 경로다.
  // 접두가 비면(문구집이 '{prob}% 합격 가능성' 류로 바뀌면) 라벨이 화면에서 조용히 사라진다.
  const headlineTpl = templateCopy('admission_headline') ?? '';
  const probabilityLabel = headlineTpl.split('{prob}')[0].trim() || REPORT_FALLBACK.PROBABILITY_LABEL;

  const query = input.admissionQuery;
  const year = ctx.admissionMeta?.year ?? null;
  // 토큰이 하나라도 비면 '{university} {major}' 원문이 그대로 노출된다 → 상시 노출 대상인
  // ADMISSION_NOTE 로 대체한다(§2.3 이 요구하는 안내가 이 단일 캡션 슬롯을 함께 쓴다).
  const caption =
    query && year
      ? fill(
          templateCopy('admission_source'),
          { university: query.university, major: query.department, type: query.admissionType, year },
          'admission_source'
        )
      : commonCopy('ADMISSION_NOTE');

  const rows = admissionRows(mine, cuts).map((row) => ({
    label: templateCopy(`cut_labels.${row.key}`),
    grade: `${row.value.toFixed(2)}등급`,
    gap: formatAdmissionDiff(row),
    emphasis: row.emphasis
  }));

  return {
    probabilityLabel,
    probabilityValue:
      probability != null
        ? `${probability}%`
        : (ADMISSION_BAND_LABEL[band] ?? REPORT_FALLBACK.BAND_VALUE_NODATA),
    summary: (band ? ADMISSION_BAND_COPY[band]?.text : commonCopy('BAND_NODATA')) ?? commonCopy('BAND_NODATA'),
    caption,
    rows
  };
}

/** diff > 0 이면 내 등급 숫자가 더 커서 '부족', 음수면 '우위'. 내 성적 행과 동률은 '기준점'이다. */
function formatAdmissionDiff(row) {
  if (row.key === 'mine' || row.diff == null || row.diff === 0) return templateCopy('diff_base');
  const key = row.diff > 0 ? 'diff_short' : 'diff_over';
  return fill(templateCopy(key), { v: Math.abs(row.diff).toFixed(2) }, key);
}

/**
 * 추천 서비스 카드(§4.5 · §7.2).
 * 전 서비스 fit < 50 이면 SVC_NONE 을 노출할 캡션 슬롯이 없어 안내 카드 1장으로 흡수한다
 * (rank·name 을 비워 카드 제목 줄만 접는다 — 컴포넌트 수정도 문구 창작도 하지 않는다).
 */
function buildRecommendations(input, areaScores) {
  const { rank1, rank2 } = rankServices(input, areaScores);
  const picked = [rank1, rank2].filter((service) => service != null);

  if (picked.length === 0) {
    return [{ rank: '', name: '', desc: commonCopy('SVC_NONE') ?? '', chips: [] }];
  }

  return picked.map((service, index) => {
    const copy = serviceCopy(service.code, service.tier);
    return {
      rank: RANK_LABELS[index],
      name: SERVICE_LABEL[service.code] ?? service.name ?? '',
      desc: copy?.text ?? rankPrefix(index, service),
      chips: copy?.tags ?? []
    };
  });
}

/**
 * 서비스 카드 본문 폴백. SERVICE_COPY 키가 SERVICE_CODES 와 어긋나면 copy 가 null 이 되어 본문이
 * 통째로 빈다(실제로 PERFORM_SUPPORT ↔ PERFORM_CARE 로 어긋나 있었다) → 순위 캡션으로 대체한다.
 *
 * SVC_RANK2_PREFIX 는 COMMON_COPY 중 유일하게 토큰({영역})을 갖는다. 그대로 렌더하면 화면에
 * '{영역}' 리터럴이 노출되므로 반드시 fill 을 한 번 더 태운다(§5.2 가 명시적으로 경고한 경로다).
 * 치환값은 rankServices 가 이미 산출한 lowestLinkedAreaName 이다.
 */
function rankPrefix(index, service) {
  const generic = commonCopy('SVC_RANK1_PREFIX') ?? '';
  // 치환값이 없으면 토큰이 남으므로 아예 토큰 없는 1순위 캡션으로 떨어뜨린다.
  if (index === 0 || service.lowestLinkedAreaName == null) return generic;
  return fill(
    commonCopy('SVC_RANK2_PREFIX') ?? '',
    { 영역: service.lowestLinkedAreaName },
    'SVC_RANK2_PREFIX'
  );
}

/**
 * 긴급도 블록(§4.4 E · §5.1 "긴급도 문구 = URGENCY_COPY[urgencyLevel]").
 *
 * 승인된 리포트 컴포넌트에는 아직 이 문장을 놓을 슬롯이 없다(요약 카드 ③은 targetGap 이지
 * urgencyOf 가 아니다). 그렇다고 조립하지 않으면 §4.4 E 와 문구 4종이 통째로 죽은 코드가 되므로,
 * ReportData 에는 싣고 렌더는 슬롯이 생길 때 붙인다.
 * TODO(Q-07): 노출 슬롯 위치 확정 대기. 확정 전까지 화면에는 나오지 않는다.
 */
function buildUrgency(input, areaScores) {
  const urgency = urgencyOf(input, areaScores);
  return {
    level: urgency.level,
    score: urgency.score,
    lowAreaCount: urgency.lowAreaCount,
    message: URGENCY_COPY[urgency.level] ?? null
  };
}

/**
 * 고정 안내 문구(§5.1 "조건 없음, 항상") + 조건부 안내.
 *
 * 컴포넌트에 슬롯이 없는 것은 긴급도와 같은 사정이지만, §2.3 이 ADMISSION_NOTE 를 상시 노출로
 * 못박았고 REPORT_BASIS·REPORT_LIMIT 도 리포트 신뢰성 고지라 누락과 보류를 구분해 둘 필요가 있다.
 * 값이 없는(=조건 미충족) 항목은 키를 두되 null 로 남긴다.
 *
 * TODO(Q-16): SINCERITY_* 4종은 불성실 응답(직선 응답) 판정 규칙이 없어 조립하지 않는다.
 * TODO(Q-22): 이 블록을 렌더할 컴포넌트 슬롯(배너·캡션 2줄화)은 리포트 레이아웃 개편 범위다.
 */
function buildNotices(input) {
  const likert = { ...(input.likert1 ?? {}), ...(input.likert2 ?? {}) };
  const likertKeys = Object.keys(likert);
  const hasSkipped = likertKeys.length > 0 && likertKeys.some((key) => likert[key] == null);

  return {
    traitIntro: commonCopy('TRAIT_INTRO'),
    hexCaption: commonCopy('HEX_CAPTION'),
    goalCompare: commonCopy('GOAL_COMPARE'),
    reportBasis: commonCopy('REPORT_BASIS'),
    reportLimit: commonCopy('REPORT_LIMIT'),
    probNote: commonCopy('PROB_NOTE'),
    admissionNote: commonCopy('ADMISSION_NOTE'),
    // 배점표 1번이 후보를 2종으로 제한하는 학년에만 붙는 안내다.
    serviceLimit: input.profile?.gradeLevel === 'M3' ? commonCopy('SVC_M3_LIMIT') : null,
    // 리커트를 건너뛴 문장이 있으면 해당 영역이 남은 응답만으로 산출됐음을 알린다(§4.2 결측).
    skipNote: hasSkipped ? commonCopy('SKIP_NOTE') : null
  };
}

/* ================================================================== *
 * 4. 조립
 * ================================================================== */

/**
 * DiagnosisInput → ReportData (§7.1 · §7.2 · §7.4.3).
 *
 * @param {object} input normalizeAnswers() 결과
 * @param {{ cuts?: { cut50: number|null, cut70: number|null, finalAvg: number|null },
 *           admissionMeta?: { year: string|number|null } }} [ctx] 입결 마스터 조회 결과.
 *          미연결이면 입결 섹션은 BAND_NODATA 로 조립된다(섹션 자체를 없애지 않는다 — 컴포넌트 계약).
 * @returns {object} renewalReportSample 과 동일 shape + traitsHeading
 */
export function buildReport(input, ctx = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const areaScores = scoreAreas(safeInput);
  const page1Overall = overallScore(areaScores, 1);
  const page2Overall = overallScore(areaScores, 2);
  const gap = targetGap(areaScores);
  const name = safeInput.profile?.name ?? null;

  return {
    student: {
      name,
      // StudentInfoBlock 의 이름 행. 이름 미수집(Q-01) 상태에서 컴포넌트가 `${name} 학생` 을 조립하면
      // '학생'만 남으므로 조립을 여기로 올렸다 — 빈 문자열이어도 행 높이(h-6)가 고정이라 레이아웃은 그대로다.
      nameLine: name ? `${name} 학생` : '',
      grade: orMissing(optionLabelOf('q1', safeInput.profile?.gradeLevel)),
      schoolType: orMissing(optionLabelOf('q2', safeInput.profile?.schoolType)),
      desiredMajor: orMissing(safeInput.goal?.targetMajor),
      gpa: formatGpa(safeInput.gradeSystem, safeInput.scores?.naesinOverall),
      // TODO(Q-17): 축약 라벨 매핑이 없어 q8 원문 라벨을 그대로 쓴다(w-[12.5rem] 에서 잘릴 수 있다 — Q-33).
      gradeTrend: orMissing(optionLabelOf('q8', safeInput.gradeTrend)),
      diagnosedAt: orMissing(formatDiagnosedAt(safeInput.meta?.diagnosedAt))
    },

    // §5.2 name 결측 폴백 — '{name} 학생의 주요 학습 특성'에서 접두를 제거한 축약형.
    // ReportPageOne 이 컴포넌트 안에서 조립하던 문자열을 여기로 올렸다(이름이 null 이면 '학생'만 남는다).
    traitsHeading: name
      ? fill(templateCopy('section_traits'), { name }, 'section_traits')
      : REPORT_FALLBACK.TRAITS_HEADING_ANON,

    headlineLines: buildHeadlineLines(safeInput, areaScores, levelOf(page1Overall)),
    learningAxes: buildLearningAxes(areaScores),
    summaryCards: buildSummaryCards(page1Overall, page2Overall, gap),
    traits: buildTraits(areaScores),

    readiness: {
      scoreLabel: `${page2Overall}/100`,
      summaryLines: buildReadinessSummary(areaScores, page2Overall),
      areas: buildReadinessAreas(areaScores)
    },
    strengths: buildStrengths(areaScores),
    improvements: buildImprovements(areaScores),
    admission: buildAdmission(safeInput, ctx ?? {}),
    recommendations: buildRecommendations(safeInput, areaScores),

    // 아래 두 블록은 아직 렌더 슬롯이 없다(각 함수의 TODO 참조). 컴포넌트는 알지 못하는 키를
    // 무시하므로 추가해도 안전하고, 슬롯이 생기면 배선만 하면 된다.
    urgency: buildUrgency(safeInput, areaScores),
    notices: buildNotices(safeInput),

    // §4.5 원문 17번 감지 신호(Q-36 해소, 사용자 확정 2026-08-11) — urgency·notices와 달리
    // "슬롯이 아직 없다"가 아니라 **의도적으로 렌더하지 않는다**. 문구집 06_금지어의 진단·낙인
    // 경계에 걸리고, 오탐 상태에서 본인에게 되돌려주면 피해가 크다(조정자 판단). 저장 페이로드와
    // 어드민 조회 전용이다 — A4 두 페이지의 어떤 컴포넌트도 이 키를 읽으면 안 된다.
    signals: {
      emotional: detectEmotionalSignal(safeInput.freeText)
    }
  };
}

// 저장 키(DIAGNOSIS_INPUT_STORAGE_KEY)·직렬화·스키마 검증은 src/lib/diagnosisInputStorage.js 가
// 단독으로 소유한다. 여기 두면 설문 셸이 이 모듈을 import 하게 되어 제출 한 번을 위해 문구집과
// 리포트 조립 코드가 통째로 설문 번들에 끌려오고, 리터럴이 두 벌로 갈라질 자리도 생긴다.

export default buildReport;
