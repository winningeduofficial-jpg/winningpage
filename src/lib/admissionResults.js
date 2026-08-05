// 입결정보(/admission/results) 수시 입결 데이터의 순수 집계·포맷 로직 모음.
// React/DOM/Supabase 의존 없이 동작해야 하며, 브라우저와 node(스크립트) 양쪽에서
// import 가능해야 한다. (src/lib/admissionParsing.js 관례 동일)
//
// 산식을 DB 뷰가 아니라 클라이언트 순수 함수로 두는 이유:
// 상세 화면은 Q3(admission_results 통합 테이블 원본 행, recruitment_period='수시') 한
// 번으로 필요한 행을 이미 손에 쥐고 있고, 가중평균 기준(모집인원 가중)이 아직 제품
// 미확정이라 산식이 바뀔 때마다 DB 마이그레이션을 돌리고 싶지 않다.

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

// 표 연도 열. AdmissionGuidelines.jsx:79-83의 ACTIVE_ADMISSION_YEAR 상수 고정 관례를
// 따른다 — 응답 순서에 따라 다른 연도가 축으로 덮어써지는 사고를 막는다.
export const RESULT_YEARS = [2023, 2024, 2025, 2026];

// "2026 모집" / "2026 경쟁률" 열의 기준 연도.
// 2026학년도는 결과 미발표 연도라 grade_*가 원리상 전부 null이고,
// 채울 수 있는 값은 quota / competition_rate 둘뿐이다.
export const ACTIVE_RESULT_YEAR = 2026;

// 값이 없는 셀의 표기. "미공개"와 "그해 해당 전형 없음"은 데이터로 구분 불가하므로
// v1은 두 경우 모두 '-' 한 글자로 통일한다(읽는 법 박스에서 합쳐 안내).
export const EMPTY_CELL = '-';

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

// PostgREST의 numeric 컬럼은 보통 JSON number로 내려오지만, 드라이버/버전에 따라
// 문자열로 오는 경우까지 방어한다. 빈 문자열·NaN·Infinity는 전부 null 취급.
function toNumber(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function trimmed(value) {
  return String(value ?? '').trim();
}

// admission_track이 null/빈 문자열인 행도 표에서는 한 덩어리로 묶여야 하므로
// 그룹 키를 하나로 정규화한다(null 그룹 1개 = 표 1행).
function groupKeyOf(value) {
  const text = trimmed(value);
  return text === '' ? ' __null__' : text;
}

function isNullGroupKey(key) {
  return key === ' __null__';
}

// 표 연도 축(RESULT_YEARS, 기본값) 밖의 행을 걸러낸다. 조회 단계(admissionResultsQueries.js
// .in('result_year', RESULT_YEARS))가 1차 방어이고, 이 함수는 buildDetailModel 진입부와
// buildTableRows / buildTrackSummaries 양쪽에서 각각 다시 호출하는 이중 방어다.
// 축 밖 행이 하나라도 평균·가중평균 집계에 섞이면 화면에 보이는 셀로 평균을 검산했을 때
// 절대 맞지 않는 사고가 난다(QA 결함 a).
function filterToYears(rows, years) {
  const yearSet = new Set(years);
  return (rows ?? []).filter((row) => yearSet.has(toNumber(row.result_year)));
}

// ---------------------------------------------------------------------------
// (a) 표시 등급과 컷 라벨 — "2.24 (70)"
// ---------------------------------------------------------------------------

// 읽는 법 원문: "표시값은 최종등록자 교과등급으로, 50%컷을 우선 사용하고 없을 때
// 70%컷을 사용합니다." → 괄호 안 숫자는 고정 라벨이 아니라 실제 사용된 컷의 동적 표기다.
// grade_85 / grade_90은 v1에서 사용하지 않는다(시안에 대응 표기 없음).
export function pickGrade(row) {
  if (!row) return { value: null, cut: null };
  const g50 = toNumber(row.grade_50);
  if (g50 != null) return { value: g50, cut: 50 };
  const g70 = toNumber(row.grade_70);
  if (g70 != null) return { value: g70, cut: 70 };
  return { value: null, cut: null };
}

// 표 셀 문자열. 소수 자리는 항상 2자리 고정(시안 전 사례가 2자리).
export function formatGradeCell(row) {
  const { value, cut } = pickGrade(row);
  if (value == null) return EMPTY_CELL;
  return `${value.toFixed(2)} (${cut})`;
}

// 가중평균 값처럼 컷 라벨이 없는 등급 수치용 포맷.
export function formatGradeValue(value) {
  const num = toNumber(value);
  return num == null ? EMPTY_CELL : num.toFixed(2);
}

// "2026 모집" 셀.
export function formatQuota(value) {
  const num = toNumber(value);
  return num == null ? EMPTY_CELL : String(num);
}

// "2026 경쟁률" 셀. 시안 표기 "8.71 : 1".
export function formatCompetitionRate(value) {
  const num = toNumber(value);
  return num == null ? EMPTY_CELL : `${num.toFixed(2)} : 1`;
}

// ---------------------------------------------------------------------------
// (b) 가중평균 — 표 "평균" 열 & 요약 카드 대형 수치
// ---------------------------------------------------------------------------

// 산식: 모집인원(quota) 가중평균. 등급이 null인 행은 분자·분모 양쪽에서 제외한다.
//   weightedGrade = Σ( pickGrade(row).value × w(row) ) / Σ( w(row) )
//   w(row) = row.quota ?? 1   (quota 미기재 행은 가중치 1로 참여)
//
// sampleN / years를 반드시 함께 반환한다 — 표본 1건짜리 평균을 "가중평균"으로
// 표기하면 오정보이므로, 호출부가 라벨을 동적으로 만들 수 있어야 한다.
export function weightedGrade(rows) {
  let numerator = 0;
  let denominator = 0;
  let sampleN = 0;
  const years = new Set();

  for (const row of rows ?? []) {
    const { value } = pickGrade(row);
    if (value == null) continue;

    // quota가 0이거나 음수면 가중치로 쓸 수 없다(분모를 갉아먹거나 0이 된다) → 1로 대체.
    const rawWeight = toNumber(row.quota);
    const weight = rawWeight != null && rawWeight > 0 ? rawWeight : 1;

    numerator += value * weight;
    denominator += weight;
    sampleN += 1;

    const year = toNumber(row.result_year);
    if (year != null) years.add(year);
  }

  if (denominator === 0) return { value: null, sampleN: 0, years: [] };

  return {
    value: Math.round((numerator / denominator) * 100) / 100,
    sampleN,
    years: [...years].sort((a, b) => a - b)
  };
}

// 요약 카드 라벨. 표본이 1개년뿐일 때 "가중평균" 단어를 쓰지 않는 것이 핵심 규칙.
export function summaryCardLabel(track, years) {
  const name = trimmed(track);
  const list = years ?? [];
  if (list.length >= 2) return `${name} · ${list.length}개년 가중평균`;
  if (list.length === 1) return `${name} · ${list[0]}학년도`;
  return name;
}

// ---------------------------------------------------------------------------
// (c) 전형 카테고리 분류 — 탭 (일반 / 추천형 / 농어촌 / 기회균형 / 논술)
// ---------------------------------------------------------------------------

// admission_results 통합 테이블에는 screening_category 컬럼(일반|추천형|농어촌|기회균형|
// 논술|기타)이 직접 실려 있다. 있으면 그 값을 그대로 신뢰하고(추측하지 않는다), 없을 때만
// (null) 아래 정규식 규칙으로 admission_track/main_track 문자열을 추론한다.
// 정규식 규칙은 screening_category가 비어 있는 레거시 잔존 행을 위한 fallback으로만 쓴다.
// 우선순위 순서대로 최초 매치를 채택한다.
export const CATEGORY_RULES = [
  {
    key: 'nonsul',
    label: '논술',
    // 논술만 main_track 축이라 두 컬럼을 합쳐 검사한다.
    test: (row) => /논술/.test(`${trimmed(row.main_track)} ${trimmed(row.admission_track)}`)
  },
  {
    key: 'nongeochon',
    label: '농어촌',
    test: (row) => /농[·ㆍ・]?어촌/.test(trimmed(row.admission_track))
  },
  {
    key: 'opportunity',
    label: '기회균형',
    test: (row) =>
      /기회균형|고른기회|사회통합|사회배려|기초생활|특수교육|국가보훈/.test(
        trimmed(row.admission_track)
      )
  },
  {
    key: 'recommend',
    label: '추천형',
    test: (row) => /추천/.test(trimmed(row.admission_track))
  }
];

export const FALLBACK_CATEGORY = { key: 'general', label: '일반' };
export const ETC_CATEGORY = { key: 'etc', label: '기타' };

// screening_category 컬럼값 → 탭 키 매핑. 컬럼값을 그대로 신뢰하는 유일한 경로다.
// '기타'는 정규식 규칙으로는 도달할 수 없다 — screening_category 컬럼으로만 온다.
const SCREENING_CATEGORY_MAP = {
  일반: FALLBACK_CATEGORY,
  추천형: { key: 'recommend', label: '추천형' },
  농어촌: { key: 'nongeochon', label: '농어촌' },
  기회균형: { key: 'opportunity', label: '기회균형' },
  논술: { key: 'nonsul', label: '논술' },
  기타: ETC_CATEGORY
};

// 탭 노출 순서 고정 (시안 순서 + 기타는 맨 뒤). 행이 없는 카테고리는 탭 자체를 만들지 않는다.
export const CATEGORY_ORDER = [
  'general',
  'recommend',
  'nongeochon',
  'opportunity',
  'nonsul',
  'etc'
];

const CATEGORY_LABELS = {
  [FALLBACK_CATEGORY.key]: FALLBACK_CATEGORY.label,
  [ETC_CATEGORY.key]: ETC_CATEGORY.label,
  ...CATEGORY_RULES.reduce((acc, rule) => ({ ...acc, [rule.key]: rule.label }), {})
};

export function categorize(row) {
  if (!row) return FALLBACK_CATEGORY;

  const screening = trimmed(row.screening_category);
  if (screening) {
    const mapped = SCREENING_CATEGORY_MAP[screening];
    // 매핑에 있는 값이면 그대로 신뢰하고 끝낸다. 도메인 밖 오타 등 매핑에 없는 값만
    // 정규식 fallback으로 내려간다(screening_category가 아예 없는 행과 동일하게 취급).
    if (mapped) return mapped;
  }

  const matched = CATEGORY_RULES.find((rule) => rule.test(row));
  return matched ? { key: matched.key, label: matched.label } : FALLBACK_CATEGORY;
}

// fallback 감시용. "미분류"가 아니라 "screening_category가 없거나 매핑 밖 값이라 전형명
// 추론으로 대신 분류함"의 감시다 — screening_category 컬럼값을 정상적으로 신뢰한 행(정상
// 적으로 '일반'으로 분류된 행 포함)은 여기 잡히지 않는다. 실데이터 적재 후 이 목록을 보고
// screening_category 적재 누락 여부나 CATEGORY_RULES 보정 필요 여부를 판단한다.
export function collectFallbackAdmissionTracks(rows) {
  const seen = new Set();
  for (const row of rows ?? []) {
    if (!row) continue;
    const screening = trimmed(row.screening_category);
    if (screening && SCREENING_CATEGORY_MAP[screening]) continue; // 컬럼값을 그대로 신뢰한 행
    const track = trimmed(row.admission_track);
    if (track) seen.add(track);
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// 상세 화면 집계 모델
// ---------------------------------------------------------------------------

// 요약 카드 — main_track 별 대표 등급.
// 하드코딩 라벨 금지: 데이터에 실제로 존재하는 main_track 값을 그대로 라벨로 쓴다.
// 행 수 상위 2개만 렌더하고, 가중평균이 null인 track의 카드는 만들지 않는다.
export function buildTrackSummaries(rows, { limit = 2, years = RESULT_YEARS } = {}) {
  const scoped = filterToYears(rows, years); // 축 밖 연도 방어 (이중 방어 — buildDetailModel 진입부와 함께)
  const buckets = new Map();

  for (const row of scoped) {
    const track = trimmed(row.main_track);
    if (!track) continue; // 라벨을 만들 수 없는 행은 카드 대상에서 제외
    if (!buckets.has(track)) buckets.set(track, { track, rows: [], order: buckets.size });
    buckets.get(track).rows.push(row);
  }

  const cards = [];
  for (const bucket of buckets.values()) {
    const summary = weightedGrade(bucket.rows);
    if (summary.value == null) continue; // 카드를 렌더하지 않는다
    cards.push({
      track: bucket.track,
      value: summary.value,
      displayValue: formatGradeValue(summary.value),
      sampleN: summary.sampleN,
      years: summary.years,
      label: summaryCardLabel(bucket.track, summary.years),
      rowCount: bucket.rows.length,
      // 스파크라인용 연도별 등급 시계열 (등급이 없는 연도는 value null)
      series: buildTrackSeries(bucket.rows, { years }),
      order: bucket.order
    });
  }

  return cards
    .sort((a, b) => b.rowCount - a.rowCount || a.order - b.order)
    .slice(0, limit)
    .map(({ order: _order, ...card }) => card);
}

// 연도축 시계열. 한 연도에 여러 전형 행이 있으면 그 연도의 가중평균을 쓴다.
export function buildTrackSeries(rows, { years = RESULT_YEARS } = {}) {
  return years.map((year) => {
    const yearRows = (rows ?? []).filter((row) => toNumber(row.result_year) === year);
    const { value } = weightedGrade(yearRows);
    return { year, value, displayValue: formatGradeValue(value) };
  });
}

// 전형(admission_track) 1개 = 표 1행. 연도별 셀 + 2026 모집/경쟁률 + 4개년 가중평균.
export function buildTableRows(rows, { years = RESULT_YEARS } = {}) {
  const scoped = filterToYears(rows, years); // 축 밖 연도 방어 (이중 방어 — buildDetailModel 진입부와 함께)
  const buckets = new Map();

  for (const row of scoped) {
    const key = groupKeyOf(row.admission_track);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  // Q3가 admission_track → result_year 순으로 정렬해 내려주므로 최초 등장 순서를 그대로 보존한다.
  return [...buckets.entries()].map(([key, groupRows]) => {
    const average = weightedGrade(groupRows);
    const activeRow =
      groupRows.find((row) => toNumber(row.result_year) === ACTIVE_RESULT_YEAR) ?? null;
    const mainTrack = groupRows.map((row) => trimmed(row.main_track)).find(Boolean) ?? '';
    const subjectReflection =
      groupRows.map((row) => trimmed(row.subject_reflection)).find(Boolean) ?? '';

    return {
      key: isNullGroupKey(key) ? '' : key,
      admissionType: isNullGroupKey(key) ? EMPTY_CELL : key,
      mainTrack,
      subjectReflection: subjectReflection || EMPTY_CELL,
      cells: years.map((year) => {
        const yearRows = groupRows.filter((row) => toNumber(row.result_year) === year);
        // 같은 연도에 행이 여럿이면 등급이 실제로 있는 행을 우선 채택한다.
        const target = yearRows.find((row) => pickGrade(row).value != null) ?? yearRows[0] ?? null;
        const { value, cut } = pickGrade(target);
        return { year, value, cut, display: target ? formatGradeCell(target) : EMPTY_CELL };
      }),
      activeQuota: activeRow ? toNumber(activeRow.quota) : null,
      activeQuotaDisplay: formatQuota(activeRow?.quota),
      activeCompetitionRate: activeRow ? toNumber(activeRow.competition_rate) : null,
      activeCompetitionRateDisplay: formatCompetitionRate(activeRow?.competition_rate),
      averageValue: average.value,
      averageDisplay: formatGradeValue(average.value),
      averageSampleN: average.sampleN,
      averageYears: average.years,
      rows: groupRows
    };
  });
}

// 탭 = 행이 1개 이상 존재하는 카테고리만. count는 admission_track distinct 개수
// (= 그 탭의 표 행 수)다.
export function buildCategories(rows, { years = RESULT_YEARS } = {}) {
  const buckets = new Map();

  for (const row of rows ?? []) {
    const { key } = categorize(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  return CATEGORY_ORDER.filter((key) => (buckets.get(key)?.length ?? 0) > 0).map((key) => {
    const categoryRows = buckets.get(key);
    const tableRows = buildTableRows(categoryRows, { years });
    return {
      key,
      label: CATEGORY_LABELS[key],
      count: tableRows.length,
      rows: categoryRows,
      tableRows
    };
  });
}

// 초기 활성 탭 = 건수가 가장 많은 카테고리, 동률이면 CATEGORY_ORDER 상 앞선 것.
export function pickInitialCategoryKey(categories) {
  const list = categories ?? [];
  if (list.length === 0) return null;
  return list.reduce((best, current) => (current.count > best.count ? current : best), list[0]).key;
}

// 상세 화면이 필요로 하는 집계 전체를 한 번에 만든다. 탭 전환 시 재요청 없이
// 이 결과를 useMemo로 잡아 두고 클라이언트에서 필터한다.
export function buildDetailModel(rows, { years = RESULT_YEARS, summaryLimit = 2 } = {}) {
  // 축 밖 연도 방어 — 조회 단계(.in('result_year', RESULT_YEARS))와 이중 방어.
  // 여기서 한 번 걸러 두면 이어지는 buildTrackSummaries/buildCategories/buildTableRows가
  // 전부 이미 걸러진 리스트를 받는다(각 함수 내부에도 filterToYears를 한 번 더 건다).
  const list = filterToYears(rows, years);
  const categories = buildCategories(list, { years });

  return {
    rowCount: list.length,
    isEmpty: list.length === 0,
    // 딥링크(?u=&d=)로 바로 들어온 경우 셀렉터 목록이 손에 없어도 히어로 h1을
    // 그릴 수 있도록 Q3가 university_name / department_name을 함께 받아 온다.
    universityName: list.map((row) => trimmed(row.university_name)).find(Boolean) ?? '',
    departmentName: list.map((row) => trimmed(row.department_name)).find(Boolean) ?? '',
    trackSummaries: buildTrackSummaries(list, { limit: summaryLimit, years }),
    categories,
    initialCategoryKey: pickInitialCategoryKey(categories),
    fallbackAdmissionTracks: collectFallbackAdmissionTracks(list),
    years
  };
}
