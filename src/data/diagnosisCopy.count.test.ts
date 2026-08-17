// diagnosisCopy 문구 데이터 — 문구 개수 검산(§8 CASE-10) · 토큰 스코프(§5.2) · 정적 금지어 스캔(§5.3 ①).
// 원본: scripts/verify-diagnosis-scoring.mjs S11·S12.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  ADMISSION_BAND_COPY,
  ADMISSION_BAND_LABEL,
  AREA_COPY,
  BANNED_PHRASES,
  COMMON_COPY,
  COPY_FALLBACK,
  NARRATIVE_COPY,
  NARRATIVE_STATE_LABEL,
  PAGE_GRADE_COPY,
  SERVICE_COPY,
  SERVICE_TIER_LABEL,
  TEMPLATE_COPY,
  TOKEN_SCOPE,
  TYPE_CODES,
  TYPE_COPY,
  URGENCY_COPY,
} from "@/data/diagnosisCopy.ts";
import {
  AREA_CODES,
  AREA_LABEL,
  BADGES,
  LEVEL_LABEL,
  PAGE1_AREAS,
  PAGE2_AREAS,
  SERVICE_CODES,
  SERVICE_LABEL,
  STATE_LABEL,
} from "@/data/diagnosisScoringTable.ts";
import {
  SAMPLE_REPORT_COPY,
  SCREEN_EXTRAS,
} from "@/data/diagnosisScreenCopy.ts";
import { fill, findBannedPhrases } from "@/lib/diagnosisCopyBinding.ts";
import { SELF_DECIDED } from "@/lib/diagnosisReport.ts";
import { sourceOf } from "@/lib/diagnosisScoringTestFixtures.ts";

/* ================================================================== *
 * S11. §8 CASE-10 — 문구 개수 검산
 * ================================================================== */

const typeCount = TYPE_CODES.reduce((sum, code) => {
  const copy = TYPE_COPY[code];
  return sum + (copy ? 2 + (copy.todos?.length ?? 0) : 0);
}, 0);
test("TYPE_COPY = 8유형 × 5 = 40", () => {
  expect(typeCount).toEqual(40);
});
test("TYPE_CODES 8종", () => {
  expect(TYPE_CODES.length).toEqual(8);
});

const areaCopyCount = AREA_CODES.reduce((sum, area) => {
  const copy = AREA_COPY[area];
  if (!copy) return sum;
  return (
    sum +
    Object.keys(copy.levels ?? {}).length +
    (copy.strength ? 1 : 0) +
    (copy.weakness ? 1 : 0) +
    Object.keys(copy.need ?? {}).length +
    (copy.strategies?.length ?? 0)
  );
}, 0);
test("AREA_COPY = 12영역 × 13 = 156", () => {
  expect(areaCopyCount).toEqual(156);
});

// F-21(2026-08-12 확정, W7 종결) — AREA_COPY.levels 60문구(12영역×5등급) 전수 재검수. 낙관적
// 서술이 하위 구간(L4·L5)에 섞이면 학생이 실제 학습 상태를 실제보다 낫게 오해한다(폴백 명세
// §3 오인 위험 최고 등급). 60문구를 직접 읽어 부정 서술 강도가 L1→L5 로 단조 증가함(낙관적
// 서술이 하위 구간에 없음)을 확인했고, 그 결과를 회귀 방지 단언으로 고정한다.
//
// 방식: 60문구를 실제로 읽고 고른 마커 사전이다(범용 감성사전이 아니다) — L4·L5 각 텍스트에
// 반드시 하나는 있어야 하는 곤란·정체 표현과, 같은 사전이 L1·L2 에는 없어야 함을 함께 본다.
// 이 목록을 넓혀야 통과하는 신규 문구가 생기면, 넓히는 근거를 실제 문구 재검토로 남겨야 한다
// — 통과시키려고 목록만 넓히면 이 섹션이 하는 일이 없어진다.
const DIFFICULTY_MARKERS = [
  "어렵",
  "어려",
  "부족",
  "밀리",
  "미뤄",
  "흔들",
  "막혀",
  "않고 있",
  "않은 상태",
  "않는 상태",
  "없는 상태",
  "없습니다",
  "못했습니다",
  "늦어지고",
  "확보되지 않",
  "고정되어",
  "벌어지고",
  "낮아지고",
  "않습니다",
  "걸리고 있습니다",
  "흩어져",
];
const areaLevelMismatches: string[] = [];
AREA_CODES.forEach((area) => {
  const levels = AREA_COPY[area]?.levels ?? {};
  ["L4", "L5"].forEach((level) => {
    const text = levels[level] ?? "";
    if (!DIFFICULTY_MARKERS.some((marker) => text.includes(marker))) {
      areaLevelMismatches.push(
        `${area}.${level} 곤란 표현 없음(낙관적 서술 의심): "${text}"`,
      );
    }
  });
  ["L1", "L2"].forEach((level) => {
    const text = levels[level] ?? "";
    if (DIFFICULTY_MARKERS.some((marker) => text.includes(marker))) {
      areaLevelMismatches.push(
        `${area}.${level} 상위 구간인데 곤란 표현이 섞여 있음: "${text}"`,
      );
    }
  });
});
test("F-21 — AREA_COPY.levels 60문구 전수 재검수: 문구-점수 상충 0건", () => {
  expect(areaLevelMismatches).toEqual([]);
});
test("F-21 전수검사가 12영역 전부를 돌았다(경로 오타로 조용히 0건이 되지 않는다)", () => {
  expect(AREA_CODES.length === 12).toBe(true);
});

const narrativeCount = PAGE1_AREAS.reduce((sum, area) => {
  const copy = NARRATIVE_COPY[area] ?? {};
  return (
    sum +
    Object.values(NARRATIVE_STATE_LABEL).reduce((inner, label) => {
      const entry = copy[label];
      return inner + (entry?.title ? 1 : 0) + (entry?.body ? 1 : 0);
    }, 0)
  );
}, 0);
test("NARRATIVE_COPY = P1 6영역 × 4상태 × 2 = 48", () => {
  expect(narrativeCount).toEqual(48);
});
// PAGE2 6영역은 03 시트에 없다. 만들어 넣으면 원본에 없는 문구를 창작한 것이다.
test("PAGE2 6영역은 진단 서술이 없다", () => {
  expect(PAGE2_AREAS.every((area) => NARRATIVE_COPY[area] === undefined)).toBe(
    true,
  );
});

const serviceCopyCount = SERVICE_CODES.reduce((sum, code) => {
  const copy = SERVICE_COPY[code];
  if (!copy) return sum;
  return sum + Object.keys(copy.tiers ?? {}).length + (copy.tags?.length ?? 0);
}, 0);
test("SERVICE_COPY = 6×3강도 + 6×4태그 = 42", () => {
  expect(serviceCopyCount).toEqual(42);
});

const sheet05Count =
  Object.keys(ADMISSION_BAND_COPY).length +
  Object.keys(PAGE_GRADE_COPY.page1).length +
  Object.keys(PAGE_GRADE_COPY.page2).length +
  Object.keys(URGENCY_COPY).length +
  Object.keys(COMMON_COPY).length +
  Object.keys(TEMPLATE_COPY).length;
// Q-29 확정(2026-08-11)으로 TEMPLATE_COPY 가 18 → 20 (card_goal_met.title/sub 신설).
// F-22 해소(2026-08-11)로 COMMON_COPY 가 19 → 20 (ADMISSION_FETCH_FAIL 신설 — 조회 실패를
// BAND_NODATA('자료가 없어…' 단정)로 표시하지 않기 위한 신규 문구. 자체 결정, 2026-08-12 확정).
test("05_구간_공통 = 4 + 10 + 4 + 20 + 20 = 58", () => {
  expect(sheet05Count).toEqual(58);
});
test("01~05 합계 = 344", () => {
  expect(
    typeCount +
      areaCopyCount +
      narrativeCount +
      serviceCopyCount +
      sheet05Count,
  ).toEqual(344);
});

const bannedCount = BANNED_PHRASES.reduce(
  (sum, group) => sum + group.phrases.length,
  0,
);
test("BANNED_PHRASES = 6유형", () => {
  expect(BANNED_PHRASES.length).toEqual(6);
});
test("금지표현 = 22", () => {
  expect(bannedCount).toEqual(22);
});

// 식별자(문구 아님) 개수 — 344 검산에 섞이면 안 되는 것들의 형태를 함께 못박는다.
test("NARRATIVE_STATE_LABEL 4상태", () => {
  expect(Object.keys(NARRATIVE_STATE_LABEL).length).toEqual(4);
});
test("NARRATIVE_STATE_LABEL.LOW = '보완' (화면 라벨 '보완 필요' 아님)", () => {
  expect(NARRATIVE_STATE_LABEL.LOW).toEqual("보완");
});
test("SERVICE_TIER_LABEL 3강도", () => {
  expect(Object.keys(SERVICE_TIER_LABEL).length).toEqual(3);
});
test("ADMISSION_BAND_LABEL 4구간", () => {
  expect(Object.keys(ADMISSION_BAND_LABEL).length).toEqual(4);
});

/* ================================================================== *
 * S12. §5.2 토큰 스코프 · §5.3 ① 정적 금지어 스캔
 * ================================================================== */

// 토큰이 있는 문구 키는 반드시 TOKEN_SCOPE 에 등재돼야 한다. 빠지면 fill 이 전부 원문으로
// 남겨 화면에 '{gap}' 리터럴이 노출된다.
const tokenPattern = /\{(\w+|영역)\}/g;
const tokenBearing = Object.entries({
  ...TEMPLATE_COPY,
  ...COMMON_COPY,
}).filter(([, text]) => typeof text === "string" && text.match(tokenPattern));
tokenBearing.forEach(([key, text]) => {
  const tokens = [...text.matchAll(tokenPattern)].map((match) => match[1]);
  const scope = TOKEN_SCOPE[key] ?? [];
  test(`TOKEN_SCOPE['${key}'] 가 토큰 전량을 덮는다`, () => {
    expect(tokens.every((token) => scope.includes(token))).toBe(true);
  });
});
test("스코프 밖 토큰은 치환하지 않는다", () => {
  expect(
    fill(
      "{name} 학생, {head}",
      { name: "홍길동", head: "x", gap: 9 },
      "section_traits",
    ),
  ).toEqual("홍길동 학생, {head}");
});
test("값이 없으면 원문을 남긴다", () => {
  expect(fill("목표까지 {gap}점 부족", {}, "card_urgent.sub")).toEqual(
    "목표까지 {gap}점 부족",
  );
});
test("미등재 키는 전부 원문", () => {
  expect(fill("{v}등급 부족", { v: 0.68 }, "diff_short")).toEqual(
    "0.68등급 부족",
  );
});

// 검사 대상은 '화면에 노출되는 모든 문자열'이다(§5.3 ①). BANNED_PHRASES 자신은 금지어 목록이라
// 스캔 대상에서 뺀다 — 넣으면 22건이 자기 자신에 걸려 항상 붉어진다.
//
// SELF_DECIDED · SCREEN_EXTRAS · SAMPLE_REPORT_COPY 는 폴백 명세 §8 NIT 5 가 지적한 구멍이었다
// (2026-08-12 이전에는 셋 다 여기 없었다) — 14건의 자체 결정 확정 문구(§7.5)가 정적 스캔 밖에서
// 살고 있었다는 뜻이다. 세 상수를 확정으로 승격하면서 함께 걸어 회귀 방어선을 채운다.
const scanTargets = {
  TYPE_COPY,
  AREA_COPY,
  NARRATIVE_COPY,
  NARRATIVE_STATE_LABEL,
  SERVICE_COPY,
  SERVICE_TIER_LABEL,
  ADMISSION_BAND_COPY,
  ADMISSION_BAND_LABEL,
  PAGE_GRADE_COPY,
  URGENCY_COPY,
  COMMON_COPY,
  TEMPLATE_COPY,
  COPY_FALLBACK,
  AREA_LABEL,
  SERVICE_LABEL,
  STATE_LABEL,
  BADGES,
  LEVEL_LABEL,
  SELF_DECIDED,
  SCREEN_EXTRAS,
  SAMPLE_REPORT_COPY,
};
const bannedHits = findBannedPhrases(scanTargets);
test("정적 금지어 위반 0건", () => {
  expect(
    bannedHits.map((hit) => `${hit.phrase} @ ${hit.text.slice(0, 24)}`),
  ).toEqual([]);
});

// G-3(NIT 5, 2026-08-12) — 워터마크 정의처를 CSS 리터럴에서 SAMPLE_REPORT_COPY.WATERMARK 로
// 옮겼다. CSS 는 이제 `content: attr(data-watermark)` 로 값을 **주입**만 받는다(속성은
// ReportSheetA4.jsx 가 내려보낸다). SAMPLE_REPORT_COPY 가 이미 scanTargets 에 있어(위) WATERMARK
// 문자열은 그 findBannedPhrases 스캔에 포함된다 — 여기서는 CSS 가 리터럴로 되돌아가지 않았는지
// (=다시 스캔 밖으로 새지 않았는지) 구조만 확인한다.
const printCss = readFileSync(
  join(process.cwd(), "src/styles/report-print.css"),
  "utf8",
);
test("report-print.css 워터마크는 attr(data-watermark) 주입만 쓴다(CSS 리터럴 재도입 없음)", () => {
  expect(
    /\.fd-report-sample[\s\S]*?content:\s*attr\(data-watermark\)/.test(
      printCss,
    ),
  ).toBe(true);
});
test("SAMPLE_REPORT_COPY.WATERMARK 가 정의돼 있다(정의처 단일화)", () => {
  expect(
    typeof SAMPLE_REPORT_COPY.WATERMARK === "string" &&
      SAMPLE_REPORT_COPY.WATERMARK.trim() !== "",
  ).toBe(true);
});
const sheetSource = sourceOf("components/renewal/report/ReportSheetA4.tsx");
test("ReportSheetA4 가 data-watermark 속성으로 SAMPLE_REPORT_COPY.WATERMARK 를 주입한다", () => {
  expect(
    sheetSource.includes("data-watermark") &&
      sheetSource.includes("SAMPLE_REPORT_COPY.WATERMARK"),
  ).toBe(true);
});

// F-08 확정(2026-08-11) — '취약'은 자체 결정이 아니라 원본이 지정한 라벨이다. 근거 3중:
//   ① 배점표.txt 204행이 영역 상태 4단계를 '상위·보통·보완 필요·취약'으로 직접 정의한다.
//   ② 문구집 03_진단서술 시트가 상태 열에 '취약'을 12영역 전반에 반복 사용한다.
//   ③ 시안 2967:8140 · 8150 에 '취약'이 실제로 그려져 있다.
// 06_금지어 '진단·낙인'이 막는 것은 학생의 인격·의지·능력을 단정하는 서술('의지가 약합니다' 등)이고,
// 이 라벨이 붙는 대상은 학생이 아니라 12개 학습 영역의 점수 구간(<45)이라 지시 대상이 다르다.
//
// WARN 을 유지하지 않는 이유가 핵심이다: warn 은 stats.warn 만 올리고 종료코드에 반영되지 않아
// 누군가 라벨을 조용히 바꿔도 CI 가 절대 붉어지지 않았다(폴백 명세 §4 가 지목한 '고착' 구조).
// check 로 승격하면 무단 변경은 FAIL 로 잡히고, 정식 교체 시에는 이 단언을 함께 고치도록 강제된다.
// 법무 반려 시 대체 후보(문서 기록용, 미적용): '보완 시급' — page2 의 '우선 보완'과 어휘 계열이 같다.
test("STATE_LABEL.page1.WEAK 확정 = '취약'(배점표 204행 · 문구집 03 시트 · 시안 2967:8140)", () => {
  expect(STATE_LABEL.page1.WEAK).toEqual("취약");
});
