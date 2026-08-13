// goal_university_cuts 백필(H-2) — 소스 조회 + 순수 집계.
//
// Admin.jsx(어드민 미리보기 패널)와 scripts/run-goal-cuts-backfill.mjs(1회
// 실행 백필 스크립트) 양쪽이 이 모듈을 공유한다. **로직을 두 곳에 복제하지
// 않는다** — 복제하면 두 경로의 산출이 갈라지는 드리프트가 생긴다.
//
// React/JSX 의존 없는 순수 모듈이다. supabase 클라이언트는 인자로
// 주입받는다(호출부가 anon 키든 service role 이든 자유롭게 고르도록).

import { normalizeUniversityName } from './universityNameNormalize.js';

export const GOAL_BACKFILL_SOURCE_TABLE = 'admission_results';

// 🔴 백필 소스 필터의 핵심 축. 기회균형·농어촌·지역인재·특성화고·특수교육은
// **지원 자격이 제한된 전형**이라 일반 학생 기준으로 쓰면 컷이 비현실적으로
// 완화된다. 반면 추천형(학교장추천 등)은 자격제한 전형이 아니고, 일반·교과와
// 둘 다 있는 쌍의 평균 차이가 +0.059등급으로 사실상 동일하다 — 배제하면
// 762쌍이 종합 컷으로 폴백돼 normal 컷이 오히려 느슨해진다(명세 §3-D3).
export const GOAL_BACKFILL_SCREENING_CATEGORIES = ['일반', '추천형'];

export const GOAL_BACKFILL_YEAR_MODES = [
  { value: 'prefer2026', label: '2026 우선(없으면 2025)' },
  { value: 'only2026', label: '2026만' },
  { value: 'only2025', label: '2025만' }
];

// PostgREST 기본 응답 상한과 맞춘 읽기 청크. Admin.jsx 의 GOAL_CUTS_READ_CHUNK
// 와 같은 값이지만, 이 모듈은 React 화면의 다른 테이블 페이지네이션과
// 무관해 독립 상수로 둔다(같은 상수를 억지로 공유하면 결합만 늘어난다).
const BACKFILL_READ_CHUNK = 1000;

// client: supabase-js 클라이언트 인스턴스(호출부 주입 — Admin.jsx 는 anon
// 키 클라이언트, 백필 스크립트는 service role 클라이언트를 넘긴다).
export function buildBackfillSourceQuery(client, yearMode, options = {}) {
  const selectArgs = options.head
    ? ['university_name', { count: 'exact', head: true }]
    : ['university_name, department_name, main_track, grade_70, result_year'];
  let query = client.from(GOAL_BACKFILL_SOURCE_TABLE).select(...selectArgs);
  query = query
    .eq('is_active', true)
    // percentile 은 0행이라 쓸 수 없다. grade_70 이 유일한 소스이고,
    // [1, 9] 밖 값은 goal_university_cuts 의 CHECK 를 위반한다.
    .gte('grade_70', 1)
    .lte('grade_70', 9)
    .in('screening_category', GOAL_BACKFILL_SCREENING_CATEGORIES);
  if (yearMode === 'only2026') query = query.eq('result_year', 2026);
  else if (yearMode === 'only2025') query = query.eq('result_year', 2025);
  else query = query.in('result_year', [2025, 2026]);
  return query;
}

export async function fetchBackfillSourceRows(client, yearMode, onProgress) {
  const { count, error: countError } = await buildBackfillSourceQuery(client, yearMode, { head: true });
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  const all = [];
  for (let from = 0; from < total; from += BACKFILL_READ_CHUNK) {
    const { data, error } = await buildBackfillSourceQuery(client, yearMode)
      // 정렬 없이 .range() 만 반복하면 페이지 경계에서 행이 중복·누락된다.
      .order('id', { ascending: true })
      .range(from, from + BACKFILL_READ_CHUNK - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    onProgress?.({ done: all.length, total });
  }
  return all;
}

export function goalCutAverage(values) {
  if (!values.length) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export function goalCutQuantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)) * 100) / 100;
}

// goal_university_cuts_key(cut_type, university_key, department_key)와 같은 축.
// \u0000(NUL) 로 잇는 이유는 그 문자가 값에 섞일 수 없기 때문이다('::' 는 학과명에
// 나타날 수 있다).
export function goalCutConflictKey(cutType, universityKey, departmentKey) {
  return `${cutType}\u0000${universityKey}\u0000${departmentKey}`;
}

// 입결 소스 행 → 백필 payload + 미리보기 통계. 순수 함수다(DB 접근 없음).
//
// 유도 규칙(명세 §3-D3 확정):
//   - (btrim(대학명), btrim(학과명)) 별로 묶는다.
//   - 연도 폴백: 2026 행이 하나라도 있으면 2026 만, 없으면 2025.
//   - normal = 교과 avg(grade_70), 교과가 없으면 종합 avg.
//   - special = 종합 avg(grade_70), 종합이 없으면 교과 avg.
//     (일반고는 학생부교과, 특목·자사고는 학생부종합이 주 전형이다.
//      둘 다 있는 2,531쌍에서 종합 컷이 평균 +0.679등급 완화된다.)
//   - 소수 2자리 반올림. min/max 는 체계적 비관·낙관 편향을 준다.
//
// payload 에 싣는 키는 정확히 8개이고 **모든 행이 동일**하다 — PostgREST
// 는 배열 안 객체들의 키 집합이 다르면 누락 키를 default/null 로 해석한다.
// 🔴 is_active 와 note 는 싣지 않는다: 신규 행은 DB DEFAULT 를 받고, 기존
// 행은 관리자가 설정한 노출·메모가 그대로 남는다. 백필이 관리자 조치를
// 되돌리면 guideText 의 약속("노출을 끄면 온보딩에서도 사라집니다")을
// 백필이 깨는 셈이 된다(명세 §4-2-H-2 2단계).
export function computeGoalCutBackfill(sourceRows, yearMode) {
  const byPair = new Map();
  (sourceRows || []).forEach((r) => {
    const uni = normalizeUniversityName(String(r.university_name ?? '').trim());
    const dept = String(r.department_name ?? '').trim();
    if (!uni) return;
    const grade = Number(r.grade_70);
    if (!Number.isFinite(grade)) return;
    const year = Number(r.result_year);
    const pairKey = `${uni}\u0000${dept}`;
    let entry = byPair.get(pairKey);
    if (!entry) {
      entry = { uni, dept, years: new Map() };
      byPair.set(pairKey, entry);
    }
    let buckets = entry.years.get(year);
    if (!buckets) {
      buckets = { gyogwa: [], jonghap: [] };
      entry.years.set(year, buckets);
    }
    const track = String(r.main_track ?? '').trim();
    if (track === '교과') buckets.gyogwa.push(grade);
    else if (track === '종합') buckets.jonghap.push(grade);
  });

  let excludedStarPairs = 0;
  let excludedEmptyPairs = 0;
  let excludedNoTrackPairs = 0;
  let year2026Pairs = 0;
  let year2025Pairs = 0;
  const rawPayloads = [];

  byPair.forEach((entry) => {
    // 학과명 정제 — 아래에 해당하면 행을 만들지 않는다(명세 §4-2-H-2 3단계).
    // 현재 데이터에서 둘 다 실효 0건이지만, 입결 재적재 대비 방어로 남긴다.
    if (entry.dept.includes('(*)')) {
      excludedStarPairs += 1;
      return;
    }
    if (!entry.dept) {
      excludedEmptyPairs += 1;
      return;
    }

    // 연도 선택은 "그 연도에 행이 있는가"가 아니라 **"그 연도에 교과·종합
    // 행이 있는가"**로 판정한다. 전자로 두면 2026 에 논술·실기 행만 있고
    // 2025 에 교과가 있는 조합이 폴백을 잃고 통째로 버려진다(2026 을 고른
    // 뒤 아래 normal/special 이 둘 다 null 이 되어 excludedNoTrackPairs 로
    // 빠진다). dev 실측으로 지금은 해당 조합 0건이지만(전체 6,641쌍 중
    // lost_fallback 0), 입결 재적재 때 실재하게 되는 잠복 결함이라 여기서
    // 막는다. 현재 데이터에서는 산출 결과가 바뀌지 않는다.
    const hasTrackRows = (year) => {
      const b = entry.years.get(year);
      return !!b && (b.gyogwa.length > 0 || b.jonghap.length > 0);
    };

    let usedYear = null;
    if (yearMode === 'only2026') usedYear = hasTrackRows(2026) ? 2026 : null;
    else if (yearMode === 'only2025') usedYear = hasTrackRows(2025) ? 2025 : null;
    else if (hasTrackRows(2026)) usedYear = 2026;
    else if (hasTrackRows(2025)) usedYear = 2025;
    if (usedYear === null) {
      // 어느 연도에도 교과·종합이 없는 쌍(논술·실기뿐). 연도 자체가 없어
      // 대상 밖인 쌍(only2026 모드에서 2026 행이 없는 등)과 구분해 센다.
      const inScope =
        yearMode === 'only2026'
          ? entry.years.has(2026)
          : yearMode === 'only2025'
            ? entry.years.has(2025)
            : entry.years.size > 0;
      if (inScope) excludedNoTrackPairs += 1;
      return;
    }

    const buckets = entry.years.get(usedYear);
    const gyogwa = goalCutAverage(buckets.gyogwa);
    const jonghap = goalCutAverage(buckets.jonghap);
    const normal = gyogwa ?? jonghap;
    const special = jonghap ?? gyogwa;
    if (normal === null || special === null) {
      // main_track 이 논술·실기뿐인 쌍. 현재 데이터에서는 0건이다.
      excludedNoTrackPairs += 1;
      return;
    }

    if (usedYear === 2026) year2026Pairs += 1;
    else year2025Pairs += 1;

    // university_key := university_name, department_key := department_name.
    // 두 유일성 인덱스를 동치로 유지해야 upsert 가 안전하다(명세 §3-D5).
    [
      ['normal', normal],
      ['special', special]
    ].forEach(([cutType, avgCut]) => {
      rawPayloads.push({
        cut_type: cutType,
        university_key: entry.uni,
        university_name: entry.uni,
        department_key: entry.dept,
        department_name: entry.dept,
        avg_cut: avgCut,
        source: 'admission_results',
        source_year: usedYear
      });
    });
  });

  // payload dedupe — 청크를 만들기 직전에 최종 중복을 병합한다. 한 청크
  // 안에 같은 (cut_type, university_key, department_key)가 두 번 들어가면
  // Postgres 가 21000 "ON CONFLICT DO UPDATE command cannot affect row a
  // second time" 로 **청크 전체를 실패시킨다**(dev 실측 확인). 현재
  // 데이터로는 충돌 0이지만 입결 재적재로 표기 변형이 들어오는 즉시
  // 재현되므로 방어를 둔다. 나중 항목이 앞 항목을 덮는다.
  const merged = new Map();
  let mergedCount = 0;
  rawPayloads.forEach((p) => {
    const key = goalCutConflictKey(p.cut_type, p.university_key, p.department_key);
    if (merged.has(key)) mergedCount += 1;
    merged.set(key, p);
  });
  const payloads = Array.from(merged.values());

  const cutValues = payloads.map((p) => p.avg_cut).sort((a, b) => a - b);
  const universities = new Set(payloads.map((p) => p.university_key));
  const pairs = new Set(payloads.map((p) => `${p.university_key}\u0000${p.department_key}`));
  const samples = payloads
    .slice()
    .sort(
      (a, b) =>
        a.university_name.localeCompare(b.university_name) ||
        a.department_name.localeCompare(b.department_name) ||
        a.cut_type.localeCompare(b.cut_type)
    )
    .slice(0, 20);

  return {
    payloads,
    stats: {
      universityCount: universities.size,
      pairCount: pairs.size,
      totalRows: payloads.length,
      normalCount: payloads.filter((p) => p.cut_type === 'normal').length,
      specialCount: payloads.filter((p) => p.cut_type === 'special').length,
      year2026Pairs,
      year2025Pairs,
      excludedStarPairs,
      excludedEmptyPairs,
      excludedNoTrackPairs,
      mergedCount,
      distribution: {
        min: cutValues[0] ?? null,
        p25: goalCutQuantile(cutValues, 0.25),
        median: goalCutQuantile(cutValues, 0.5),
        p75: goalCutQuantile(cutValues, 0.75),
        max: cutValues[cutValues.length - 1] ?? null
      },
      samples
    }
  };
}
