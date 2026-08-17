// schedule.js 골든 픽스처 회귀 테스트
//
// 기대값은 손계산이 아니라 **원본 코드를 실제로 실행해서** 뽑았다.
// 생성 방법:
//   target/api/student.mjs:7, 130-133, 144-159, 240-242, 743-754, 444-458, 771-795 과
//   target/components/IntakeForm.tsx:967-1038 을 그대로 잘라(타입 주석만 제거) 스크래치
//   하네스(harness.mjs)로 만든 뒤, 아래 입력들을 넣고 출력을 JSON 으로 덤프해 인라인했다.
//
// 이 파일의 목적 절반은 "원본의 병리를 고정"하는 것이다. 아래 NOTE(target-parity) 가 붙은
// 케이스는 버그처럼 보여도 원본 동작이며, 사용자가 그대로 이식하기로 확정했다. 고치지 말 것.

import { expect, test } from "vitest";

import type { AcademySlot, DayPattern } from "./schedule.ts";
import {
  calcAvailableHours,
  calcAvailableHoursApprox,
  calculateWeekSchedule,
  getEffectiveScheduleTarget,
  getStudyMultiplier,
  sumWeeklySchedule,
} from "./schedule.ts";

const EPS = 1e-9;
const near = (a, b, label) =>
  expect(Math.abs(a - b) < EPS, `${label}: ${a} !== ${b}`).toBeTruthy();

// ---------------------------------------------------------------------------
// sumWeeklySchedule
// ---------------------------------------------------------------------------

const d = (ideal, min) => ({ ideal, min });

const SUM_CASES = [
  {
    name: "정상 7요일 — 일요일 값은 무시된다",
    input: {
      monday: d(6, 4),
      tuesday: d(6, 4),
      wednesday: d(6, 4),
      thursday: d(6, 4),
      friday: d(5, 3),
      saturday: d(12, 8),
      sunday: d(99, 99),
    },
    expected: { weekIdeal: 41, weekMin: 27 },
  },
  { name: "null", input: null, expected: { weekIdeal: 0, weekMin: 0 } },
  {
    name: "undefined",
    input: undefined,
    expected: { weekIdeal: 0, weekMin: 0 },
  },
  { name: "빈 객체", input: {}, expected: { weekIdeal: 0, weekMin: 0 } },
  {
    name: "문자열 값",
    input: {
      monday: { ideal: "6.5", min: "4.5" },
      saturday: { ideal: "3.25", min: "1.05" },
    },
    expected: { weekIdeal: 9.8, weekMin: 5.6 },
  },
  {
    name: "음수·NaN·null 섞임 (toNum fallback 0)",
    input: {
      monday: d(-3, -1),
      tuesday: d("abc", null),
      wednesday: d(NaN, undefined),
      thursday: d(Infinity, 2),
    },
    // NOTE(target-parity): 음수 목표도 그대로 더한다. Infinity 는 toNum 이 0 으로 떨군다.
    expected: { weekIdeal: -3, weekMin: 1 },
  },
  {
    name: "부동소수 누적 (0.1 × 6)",
    input: {
      monday: d(0.1, 0.1),
      tuesday: d(0.1, 0.1),
      wednesday: d(0.1, 0.1),
      thursday: d(0.1, 0.1),
      friday: d(0.1, 0.1),
      saturday: d(0.1, 0.1),
    },
    expected: { weekIdeal: 0.6, weekMin: 0.6 },
  },
  {
    name: "일요일만 존재 — 전부 제외",
    input: { sunday: d(10, 10) },
    expected: { weekIdeal: 0, weekMin: 0 },
  },
  {
    name: "ideal/min 키 없는 날",
    input: { monday: {}, tuesday: d(1, 1) },
    expected: { weekIdeal: 1, weekMin: 1 },
  },
  {
    name: "반올림 경계 0.05",
    input: { monday: d(0.05, 0.15), tuesday: d(0.05, 0.15) },
    expected: { weekIdeal: 0.1, weekMin: 0.3 },
  },
];

for (const c of SUM_CASES) {
  test(`sumWeeklySchedule — ${c.name}`, () => {
    const got = sumWeeklySchedule(c.input);
    near(got.weekIdeal, c.expected.weekIdeal, "weekIdeal");
    near(got.weekMin, c.expected.weekMin, "weekMin");
  });
}

// ---------------------------------------------------------------------------
// getEffectiveScheduleTarget
// ---------------------------------------------------------------------------

// 2026-08-10 은 월요일, 2026-08-15 는 토요일, 2026-08-16 은 일요일
const SCHEDULE = {
  monday: d(6, 4),
  tuesday: d(6, 4),
  wednesday: d(6, 4),
  thursday: d(6, 4),
  friday: d(5, 3),
  saturday: d(12, 8),
  sunday: d(99, 99),
};
const STUDENT = { study_schedule: SCHEDULE };

// args 필드를 getEffectiveScheduleTarget 파라미터 튜플로 문맥 타입 지정한다 — 그래야
// 아래 각 케이스의 배열 리터럴이 스프레드 가능한 튜플로 추론된다(순수 타입 지정, 값 불변).
const EFFECTIVE_CASES: {
  name: string;
  args: Parameters<typeof getEffectiveScheduleTarget>;
  expected: { ideal: number; min: number };
}[] = [
  {
    name: "월~일 7일 — 일요일 제외라 월~토와 같다",
    args: [STUDENT, "2026-08-10", "2026-08-16"],
    expected: { ideal: 41, min: 27 },
  },
  {
    name: "월~토 6일",
    args: [STUDENT, "2026-08-10", "2026-08-15"],
    expected: { ideal: 41, min: 27 },
  },
  {
    name: "일요일 하루만 — 0",
    args: [STUDENT, "2026-08-16", "2026-08-16"],
    expected: { ideal: 0, min: 0 },
  },
  {
    name: "수~일 (미니 온보딩 주)",
    args: [STUDENT, "2026-08-12", "2026-08-16"],
    expected: { ideal: 29, min: 19 },
  },
  {
    name: "2주치 14일",
    args: [STUDENT, "2026-08-10", "2026-08-23"],
    expected: { ideal: 82, min: 54 },
  },
  {
    name: "start > end — 빈 구간",
    args: [STUDENT, "2026-08-16", "2026-08-10"],
    expected: { ideal: 0, min: 0 },
  },
  {
    name: "student null",
    args: [null, "2026-08-10", "2026-08-16"],
    expected: { ideal: 0, min: 0 },
  },
  {
    name: "study_schedule 없음",
    args: [{}, "2026-08-10", "2026-08-16"],
    expected: { ideal: 0, min: 0 },
  },
  {
    name: "endDate 빈 문자열 — 루프 진입 안 함",
    args: [STUDENT, "2026-08-10", ""],
    expected: { ideal: 0, min: 0 },
  },
  {
    name: "ISO 타임스탬프 입력 (앞 10자리만 사용)",
    args: [STUDENT, "2026-08-10T09:00:00Z", "2026-08-12T23:00:00Z"],
    expected: { ideal: 18, min: 12 },
  },
  {
    name: "월말 넘어가기 (8/31 월 ~ 9/6 일)",
    args: [STUDENT, "2026-08-31", "2026-09-06"],
    expected: { ideal: 41, min: 27 },
  },
  {
    name: "같은 날 하루 (토)",
    args: [STUDENT, "2026-08-15", "2026-08-15"],
    expected: { ideal: 12, min: 8 },
  },
  {
    name: "문자열 시간값",
    args: [
      { study_schedule: { monday: { ideal: "6.5", min: "4.5" } } },
      "2026-08-10",
      "2026-08-10",
    ],
    expected: { ideal: 6.5, min: 4.5 },
  },
];

for (const c of EFFECTIVE_CASES) {
  test(`getEffectiveScheduleTarget — ${c.name}`, () => {
    const got = getEffectiveScheduleTarget(...c.args);
    near(got.ideal, c.expected.ideal, "ideal");
    near(got.min, c.expected.min, "min");
  });
}

test("getEffectiveScheduleTarget — now 주입이 결과에 영향 없음 (구간이 명시된 경우)", () => {
  const a = getEffectiveScheduleTarget(
    STUDENT,
    "2026-08-10",
    "2026-08-16",
    new Date("2020-01-01T00:00:00Z"),
  );
  const b = getEffectiveScheduleTarget(
    STUDENT,
    "2026-08-10",
    "2026-08-16",
    new Date("2030-12-31T00:00:00Z"),
  );
  expect(a).toEqual(b);
});

// ---------------------------------------------------------------------------
// getStudyMultiplier — 17단 배율표 전체
// ---------------------------------------------------------------------------

// [대학, 학과, 기대 배율] 튜플로 문맥 타입 지정 — 리터럴 배열이라 명시하지 않으면
// TS 가 u/dept 를 `string | number` 로 합쳐 추론한다(순수 타입 지정, 값 불변).
const MULTIPLIER_CASES: [string, string, number][] = [
  // 의예 (topMed 0.90 / 그 외 0.88)
  ["서울대학교", "의예과", 0.9],
  ["울산대학교", "의예과", 0.9],
  ["한양대학교", "의학부", 0.9],
  ["건국대학교", "의예과", 0.88],
  ["가천대학교", "의과대학", 0.88],
  // 치의 / 한의 / 수의
  ["서울대학교", "치의학과", 0.88],
  ["단국대학교", "치의학과", 0.86],
  ["동국대학교", "한의학과", 0.84],
  ["건국대학교", "수의예과", 0.88],
  // 약학
  ["서울대학교", "약학과", 0.88],
  ["중앙대학교", "약학계열", 0.88],
  ["연세대학교", "약학부", 0.88],
  ["성균관대학교", "약학과", 0.88],
  ["이화여자대학교", "약학대학", 0.82],
  // 일반 학과 티어
  ["서울대학교", "경영학과", 0.78],
  ["연세대학교", "경영학과", 0.75],
  ["고려대학교", "경영학과", 0.75],
  ["서강대학교", "경영학과", 0.72],
  ["한양대학교", "기계공학과", 0.72],
  ["성균관대학교", "반도체시스템공학과", 0.72],
  ["중앙대학교", "경영학부", 0.68],
  ["경희대학교", "국어국문학과", 0.68],
  ["한국외국어대학교", "영어학부", 0.68],
  ["서울시립대학교", "세무학과", 0.68],
  ["건국대학교", "건축학과", 0.63],
  ["동국대학교", "경찰행정학부", 0.63],
  ["홍익대학교", "시각디자인과", 0.63],
  ["이화여자대학교", "사회학과", 0.63],
  ["국민대학교", "자동차공학과", 0.59],
  ["숭실대학교", "컴퓨터학부", 0.59],
  ["세종대학교", "호텔경영학과", 0.59],
  ["단국대학교", "문예창작과", 0.59],
  ["광운대학교", "전자공학과", 0.55],
  ["명지대학교", "경영학과", 0.55],
  ["상명대학교", "디자인학과", 0.55],
  ["가톨릭대학교", "간호학과", 0.55],
  ["숙명여자대학교", "경영학부", 0.55],
  ["경북대학교", "전자공학부", 0.52],
  ["부산대학교", "경영학과", 0.52],
  ["인하대학교", "기계공학과", 0.52],
  ["경기대학교", "관광경영학과", 0.52],
  ["인천대학교", "무역학부", 0.52],
  ["충남대학교", "기계공학과", 0.49],
  ["경남대학교", "경영학과", 0.49],
  ["전남대학교", "국어국문학과", 0.49],
  ["강원대학교", "산림과학부", 0.49],
  ["고려대학교(세종)", "경영학부", 0.49],
  ["전북대학교", "전자공학부", 0.49],
  // fallback
  ["한밭대학교", "컴퓨터공학과", 0.46],
  ["", "", 0.46],
  // 앞뒤 공백은 trim 된다
  ["  서울대학교  ", "  의예과  ", 0.9],
];

for (const [u, dept, expected] of MULTIPLIER_CASES) {
  test(`getStudyMultiplier — ${u || "(빈)"} / ${dept || "(빈)"} → ${expected}`, () => {
    near(getStudyMultiplier(u, dept), expected, "multiplier");
  });
}

// NOTE(target-parity): '치의예과'·'한의예과'·'수의예과' 는 문자열상 '의예과' 를 포함하므로
//   isMedical 분기가 먼저 걸린다. 전용 분기(치의 0.88/0.86, 한의 0.88/0.84, 수의 0.88/0.82)에
//   도달하지 못하고 의예 배율이 나온다. 원본 그대로이며, 고치지 말 것.
const SUBSTRING_TRAP_CASES: [string, string, number, string][] = [
  ["경희대학교", "치의예과", 0.9, "치의 전용 0.88 이 아니라 topMed 0.90"],
  ["경희대학교", "한의예과", 0.9, "한의 전용 0.88 이 아니라 topMed 0.90"],
  ["경희대학교", "한의예과/자연", 0.9, "한의 전용 0.88 이 아니라 topMed 0.90"],
  ["서울대학교", "수의예과", 0.9, "수의 전용 0.88 이 아니라 topMed 0.90"],
  ["충북대학교", "수의예과", 0.88, "수의 전용 0.82 가 아니라 의예 0.88"],
  ["가천대학교", "한의예과", 0.88, "한의 전용 0.84 가 아니라 의예 0.88"],
  [
    "서울대학교",
    "자유전공학부(의예과 연계)",
    0.9,
    "학과명에 의예과가 들어가면 의대 취급",
  ],
];

for (const [u, dept, expected, why] of SUBSTRING_TRAP_CASES) {
  test(`getStudyMultiplier — [parity] ${u} / ${dept} → ${expected} (${why})`, () => {
    near(getStudyMultiplier(u, dept), expected, "multiplier");
  });
}

// NOTE(target-parity): topMed 목록에 '카톨릭대학교' 오타가 들어 있다. 실제 표기인
//   '가톨릭대학교' 의예과는 0.90 을 못 받고 0.88 로 떨어진다. 원본 그대로이며, 고치지 말 것.
test("getStudyMultiplier — [parity] 카톨릭/가톨릭 오타 분기", () => {
  near(getStudyMultiplier("카톨릭대학교", "의예과"), 0.9, "오타 표기가 topMed");
  near(
    getStudyMultiplier("가톨릭대학교", "의예과"),
    0.88,
    "정상 표기는 topMed 미포함",
  );
});

// NOTE(target-parity): null/undefined 방어가 없어 TypeError 가 난다. 원본 그대로.
test("getStudyMultiplier — [parity] null 입력이면 TypeError", () => {
  expect(() => getStudyMultiplier(null as unknown as string, "의예과")).toThrow(
    TypeError,
  );
  expect(() =>
    getStudyMultiplier("서울대학교", undefined as unknown as string),
  ).toThrow(TypeError);
});

// ---------------------------------------------------------------------------
// calcAvailableHours (원본 참조 구현)
// ---------------------------------------------------------------------------

const day = (
  wake: string | number,
  sleep: string | number,
  schoolStart: string | number,
  schoolEnd: string | number,
  academies: AcademySlot[] = [],
): DayPattern => ({
  wake,
  sleep,
  schoolStart,
  schoolEnd,
  academies,
});

// args 를 calcAvailableHours 파라미터 튜플로 문맥 타입 지정한다(순수 타입 지정, 값 불변).
const AVAIL_CASES: {
  name: string;
  args: Parameters<typeof calcAvailableHours>;
  expected: number;
}[] = [
  {
    name: "검증샘플 기상7·취침24·학교8~16·학원17~19",
    args: [day("7", "24", "8", "16", [{ start: "17", end: "19" }]), true],
    expected: 5.5,
  },
  {
    name: "같은 입력 hasSchool=false",
    args: [day("7", "24", "8", "16", [{ start: "17", end: "19" }]), false],
    expected: 12.5,
  },
  {
    name: "학교·학원 없음",
    args: [day("7", "24", "", "", []), false],
    expected: 15.5,
  },
  {
    name: "주말 학원 2건",
    args: [
      day("7", "24", "", "", [
        { start: "10", end: "12" },
        { start: "14", end: "16" },
      ]),
      false,
    ],
    expected: 9.5,
  },
  {
    name: "sleep === wake → 0",
    args: [day("7", "7", "", "", []), false],
    expected: 0,
  },
  {
    name: "sleep < wake → 0",
    args: [day("20", "7", "", "", []), false],
    expected: 0,
  },
  {
    name: "wake 빈문자(NaN) → 0",
    args: [day("", "24", "", "", []), false],
    expected: 0,
  },
  {
    name: "sleep 빈문자(NaN) → 0",
    args: [day("7", "", "", "", []), false],
    expected: 0,
  },
  {
    name: "깨어있는 시간 1h → 음수라 0 clamp",
    args: [day("7", "8", "", "", []), false],
    expected: 0,
  },
  {
    name: "깨어있는 시간 정확히 1.5h → 0",
    args: [day("7", "8.5", "", "", []), false],
    expected: 0,
  },
  {
    name: "schoolEnd === schoolStart → 학교 항 무시",
    args: [day("7", "24", "8", "8", []), true],
    expected: 15.5,
  },
  {
    name: "schoolEnd < schoolStart → 학교 항 무시",
    args: [day("7", "24", "16", "8", []), true],
    expected: 15.5,
  },
  {
    name: "학원 acEnd === acStart → 무시",
    args: [day("7", "24", "", "", [{ start: "17", end: "17" }]), false],
    expected: 15.5,
  },
  {
    name: "학원 3건 과다 → 0 clamp",
    args: [
      day("7", "24", "8", "16", [
        { start: "17", end: "20" },
        { start: "20", end: "22" },
        { start: "22", end: "23.5" },
      ]),
      true,
    ],
    expected: 0,
  },
  {
    name: "소수 시각 7.5~23.5",
    args: [
      day("7.5", "23.5", "8.5", "16.5", [{ start: "17.5", end: "19.25" }]),
      true,
    ],
    expected: 4.8,
  },
  {
    name: "숫자형 입력 (문자열 아님)",
    args: [day(7, 24, 8, 16, [{ start: 17, end: 19 }]), true],
    expected: 5.5,
  },
  {
    name: "반올림 경계 0.05",
    args: [day("7", "8.55", "", "", []), false],
    expected: 0.1,
  },
];

for (const c of AVAIL_CASES) {
  test(`calcAvailableHours — ${c.name}`, () => {
    near(calcAvailableHours(...c.args), c.expected, "available");
  });
}

// NOTE(target-parity): schoolStart 가 wake 보다 이르면 `+ (sStart - wake)` 가 음수가 되어
//   가용시간을 더 깎는다. clamp 이 없다. 원본 그대로이며, 고치지 말 것.
test("calcAvailableHours — [parity] 기상(9시)이 등교(8시)보다 늦으면 가용시간이 더 깎인다", () => {
  // (24-9) -1.5 -(16-8) +(8-9) = 4.5
  near(
    calcAvailableHours(day("9", "24", "8", "16", []), true),
    4.5,
    "available",
  );
  // 기상 8시(등교와 동일)면 가산항이 0이라 (24-8) -1.5 -8 +0 = 6.5
  near(
    calcAvailableHours(day("8", "24", "8", "16", []), true),
    6.5,
    "available",
  );
});

// NOTE(target-parity): day / day.academies 방어가 없어 TypeError 가 난다. 원본 그대로.
test("calcAvailableHours — [parity] day 또는 academies 누락이면 TypeError", () => {
  expect(() =>
    calcAvailableHours(null as unknown as DayPattern, false),
  ).toThrow(TypeError);
  expect(() =>
    calcAvailableHours(
      // academies 필드를 의도적으로 누락한 잘못된 입력 — 런타임 TypeError 를 검증하는
      // 케이스라 값은 그대로 두고 타입만 캐스팅한다.
      {
        wake: "7",
        sleep: "24",
        schoolStart: "",
        schoolEnd: "",
      } as DayPattern,
      false,
    ),
  ).toThrow(TypeError);
});

// ---------------------------------------------------------------------------
// calculateWeekSchedule
// ---------------------------------------------------------------------------

const weekOf = (weekday, weekend) => ({
  monday: weekday,
  tuesday: weekday,
  wednesday: weekday,
  thursday: weekday,
  friday: weekday,
  saturday: weekend,
  sunday: weekend,
});
const selfStudyAll = (v) => ({
  monday: v,
  tuesday: v,
  wednesday: v,
  thursday: v,
  friday: v,
  saturday: v,
  sunday: v,
});

const WEEKDAY_DAY = day("7", "24", "8", "16", [{ start: "17", end: "19" }]); // 가용 5.5
const WEEKEND_DAY = day("7", "24", "", "", [{ start: "10", end: "12" }]); // 가용 12.5
const WEEKEND_NO_ACADEMY = day("7", "24", "", "", []); // 가용 15.5

const WEEK_CASES = [
  {
    name: "기본 — 이상 서울대 경영(0.78) / 최소 부산대 경영(0.52), 자습 미입력",
    form: {
      idealUniv: "서울대학교",
      idealDept: "경영학과",
      minUniv: "부산대학교",
      minDept: "경영학과",
      weekSchedule: weekOf(WEEKDAY_DAY, WEEKEND_DAY),
      selfStudyHours: selfStudyAll(""),
    },
    expected: {
      monday: { ideal: 4.3, min: 2.9 },
      tuesday: { ideal: 4.3, min: 2.9 },
      wednesday: { ideal: 4.3, min: 2.9 },
      thursday: { ideal: 4.3, min: 2.9 },
      friday: { ideal: 4.3, min: 2.9 },
      saturday: { ideal: 9.8, min: 6.5 },
      sunday: { ideal: 9.8, min: 6.5 },
    },
  },
  {
    name: "자습 5h — 평일은 오버라이드(+0.5/+1.0), 주말은 계산값 유지",
    form: {
      idealUniv: "서울대학교",
      idealDept: "경영학과",
      minUniv: "부산대학교",
      minDept: "경영학과",
      weekSchedule: weekOf(WEEKDAY_DAY, WEEKEND_DAY),
      selfStudyHours: selfStudyAll("5"),
    },
    expected: {
      monday: { ideal: 6, min: 5.5 },
      tuesday: { ideal: 6, min: 5.5 },
      wednesday: { ideal: 6, min: 5.5 },
      thursday: { ideal: 6, min: 5.5 },
      friday: { ideal: 6, min: 5.5 },
      saturday: { ideal: 9.8, min: 6.5 },
      sunday: { ideal: 9.8, min: 6.5 },
    },
  },
  {
    name: "자습이 min~ideal 사이 — 중간 분기(min 만 +0.5, ideal 은 조건부)",
    form: {
      idealUniv: "서울대학교",
      idealDept: "경영학과",
      minUniv: "한밭대학교",
      minDept: "컴퓨터공학과",
      weekSchedule: weekOf(WEEKDAY_DAY, WEEKEND_DAY),
      selfStudyHours: selfStudyAll("4"),
    },
    expected: {
      monday: { ideal: 5, min: 4.5 },
      tuesday: { ideal: 5, min: 4.5 },
      wednesday: { ideal: 5, min: 4.5 },
      thursday: { ideal: 5, min: 4.5 },
      friday: { ideal: 5, min: 4.5 },
      saturday: { ideal: 9.8, min: 5.8 },
      sunday: { ideal: 9.8, min: 5.8 },
    },
  },
  {
    name: "자습이 정확히 calcMin(2.9) — 경계, 오버라이드 없음",
    form: {
      idealUniv: "서울대학교",
      idealDept: "경영학과",
      minUniv: "부산대학교",
      minDept: "경영학과",
      weekSchedule: weekOf(WEEKDAY_DAY, WEEKDAY_DAY),
      selfStudyHours: selfStudyAll("2.9"),
    },
    expected: {
      monday: { ideal: 4.3, min: 2.9 },
      tuesday: { ideal: 4.3, min: 2.9 },
      wednesday: { ideal: 4.3, min: 2.9 },
      thursday: { ideal: 4.3, min: 2.9 },
      friday: { ideal: 4.3, min: 2.9 },
      saturday: { ideal: 9.8, min: 6.5 },
      sunday: { ideal: 9.8, min: 6.5 },
    },
  },
  {
    name: "자습 음수 — 오버라이드 미발동",
    form: {
      idealUniv: "서울대학교",
      idealDept: "경영학과",
      minUniv: "부산대학교",
      minDept: "경영학과",
      weekSchedule: weekOf(WEEKDAY_DAY, WEEKEND_DAY),
      selfStudyHours: selfStudyAll("-3"),
    },
    expected: {
      monday: { ideal: 4.3, min: 2.9 },
      tuesday: { ideal: 4.3, min: 2.9 },
      wednesday: { ideal: 4.3, min: 2.9 },
      thursday: { ideal: 4.3, min: 2.9 },
      friday: { ideal: 4.3, min: 2.9 },
      saturday: { ideal: 9.8, min: 6.5 },
      sunday: { ideal: 9.8, min: 6.5 },
    },
  },
  {
    name: "자습 문자열 쓰레기 — parseFloat NaN → 0",
    form: {
      idealUniv: "서울대학교",
      idealDept: "경영학과",
      minUniv: "부산대학교",
      minDept: "경영학과",
      weekSchedule: weekOf(WEEKDAY_DAY, WEEKEND_DAY),
      selfStudyHours: selfStudyAll("abc"),
    },
    expected: {
      monday: { ideal: 4.3, min: 2.9 },
      tuesday: { ideal: 4.3, min: 2.9 },
      wednesday: { ideal: 4.3, min: 2.9 },
      thursday: { ideal: 4.3, min: 2.9 },
      friday: { ideal: 4.3, min: 2.9 },
      saturday: { ideal: 9.8, min: 6.5 },
      sunday: { ideal: 9.8, min: 6.5 },
    },
  },
  {
    name: "가용 0 + 자습 0 → 전부 0",
    form: {
      idealUniv: "서울대학교",
      idealDept: "경영학과",
      minUniv: "부산대학교",
      minDept: "경영학과",
      weekSchedule: weekOf(
        day("7", "7", "", "", []),
        day("7", "7", "", "", []),
      ),
      selfStudyHours: selfStudyAll("0"),
    },
    expected: {
      monday: { ideal: 0, min: 0 },
      tuesday: { ideal: 0, min: 0 },
      wednesday: { ideal: 0, min: 0 },
      thursday: { ideal: 0, min: 0 },
      friday: { ideal: 0, min: 0 },
      saturday: { ideal: 0, min: 0 },
      sunday: { ideal: 0, min: 0 },
    },
  },
  {
    name: "요일마다 다른 자습시간 (시안 #9 샘플 월0/화0/수0/목0/금3/토12/일12)",
    form: {
      idealUniv: "연세대학교",
      idealDept: "경영학과",
      minUniv: "충남대학교",
      minDept: "기계공학과",
      weekSchedule: weekOf(WEEKDAY_DAY, WEEKEND_NO_ACADEMY),
      selfStudyHours: {
        monday: "0",
        tuesday: "0",
        wednesday: "0",
        thursday: "0",
        friday: "3",
        saturday: "12",
        sunday: "12",
      },
    },
    expected: {
      monday: { ideal: 4.1, min: 2.7 },
      tuesday: { ideal: 4.1, min: 2.7 },
      wednesday: { ideal: 4.1, min: 2.7 },
      thursday: { ideal: 4.1, min: 2.7 },
      friday: { ideal: 4.1, min: 3.5 },
      saturday: { ideal: 13, min: 12.5 },
      sunday: { ideal: 13, min: 12.5 },
    },
  },
];

for (const c of WEEK_CASES) {
  test(`calculateWeekSchedule — ${c.name}`, () => {
    const got = calculateWeekSchedule(c.form);
    for (const key of Object.keys(c.expected)) {
      near(got[key]!.ideal, c.expected[key]!.ideal, `${key}.ideal`);
      near(got[key]!.min, c.expected[key]!.min, `${key}.min`);
    }
  });
}

// --- 알려진 병리 ① 목표 역전 ---------------------------------------------------
// NOTE(target-parity): 이상/최소 배율을 독립 조회하므로, 최소 목표 대학의 배율이 더 높으면
//   ideal < min 으로 목표가 역전된다. 원본 동작이며 사용자가 그대로 이식하기로 확정했다.
//   "버그다" 하고 clamp/스왑을 넣지 말 것.
test("calculateWeekSchedule — [parity] 병리① 목표 역전 (이상 0.46 < 최소 0.90)", () => {
  const got = calculateWeekSchedule({
    idealUniv: "한밭대학교", // 0.46
    idealDept: "컴퓨터공학과",
    minUniv: "서울대학교", // 의예과 → 0.90
    minDept: "의예과",
    weekSchedule: weekOf(WEEKDAY_DAY, WEEKEND_DAY),
    selfStudyHours: selfStudyAll(""),
  });

  const expected = {
    monday: { ideal: 2.5, min: 5 },
    tuesday: { ideal: 2.5, min: 5 },
    wednesday: { ideal: 2.5, min: 5 },
    thursday: { ideal: 2.5, min: 5 },
    friday: { ideal: 2.5, min: 5 },
    saturday: { ideal: 5.8, min: 11.3 },
    sunday: { ideal: 5.8, min: 11.3 },
  };

  for (const key of Object.keys(expected)) {
    near(got[key]!.ideal, expected[key]!.ideal, `${key}.ideal`);
    near(got[key]!.min, expected[key]!.min, `${key}.min`);
    expect(
      got[key]!.ideal < got[key]!.min,
      `${key}: 역전이 유지돼야 한다`,
    ).toBeTruthy();
  }
});

// --- 알려진 병리 ② 가용시간 초과 ------------------------------------------------
// NOTE(target-parity): 현재자습 오버라이드에 상한이 없다. 현재자습이 가용시간에 육박하면
//   목표(min/ideal)가 가용시간을 넘어선다. 원본 동작이며 사용자가 그대로 이식하기로 확정했다.
//   clamp 를 넣지 말 것.
test("calculateWeekSchedule — [parity] 병리② 목표가 가용시간을 초과 (주말 가용 15.5h · 자습 15h → ideal 16h)", () => {
  const weekSchedule = weekOf(WEEKDAY_DAY, WEEKEND_NO_ACADEMY);
  const got = calculateWeekSchedule({
    idealUniv: "서울대학교",
    idealDept: "경영학과",
    minUniv: "부산대학교",
    minDept: "경영학과",
    weekSchedule,
    selfStudyHours: selfStudyAll("15"),
  });

  for (const key of ["monday", "saturday", "sunday"]) {
    near(got[key]!.ideal, 16, `${key}.ideal`);
    near(got[key]!.min, 15.5, `${key}.min`);
  }

  // 실제로 가용시간을 넘는지 확인 — 주말 가용은 15.5h 인데 목표 ideal 은 16h
  const weekendAvail = calcAvailableHours(WEEKEND_NO_ACADEMY, false);
  near(weekendAvail, 15.5, "weekendAvail");
  expect(
    got.saturday!.ideal > weekendAvail,
    "이상 목표가 가용시간을 초과해야 한다(병리 유지)",
  ).toBeTruthy();

  // 평일은 가용 5.5h 인데 목표가 16h — 초과폭이 훨씬 크다
  const weekdayAvail = calcAvailableHours(WEEKDAY_DAY, true);
  near(weekdayAvail, 5.5, "weekdayAvail");
  expect(
    got.monday!.ideal > weekdayAvail,
    "평일도 초과해야 한다(병리 유지)",
  ).toBeTruthy();
});

// ---------------------------------------------------------------------------
// calcAvailableHoursApprox — 우리 온보딩 근사 (원본에 없음)
// ---------------------------------------------------------------------------

// args 를 calcAvailableHoursApprox 파라미터 튜플로 문맥 타입 지정한다(순수 타입 지정, 값 불변).
const APPROX_CASES: {
  name: string;
  args: Parameters<typeof calcAvailableHoursApprox>;
  expected: number;
}[] = [
  {
    name: "온보딩 기본값 7/24/8/2 — 평일",
    args: [
      { wakeUpHour: 7, sleepHour: 24, schoolStayHours: 8, academyHours: 2 },
      true,
    ],
    expected: 7,
  },
  {
    name: "온보딩 기본값 — 주말(학교체류 미차감)",
    args: [
      { wakeUpHour: 7, sleepHour: 24, schoolStayHours: 8, academyHours: 2 },
      false,
    ],
    expected: 15,
  },
  {
    name: "학교·학원 0",
    args: [
      { wakeUpHour: 7, sleepHour: 24, schoolStayHours: 0, academyHours: 0 },
      true,
    ],
    expected: 17,
  },
  {
    name: "과다 차감 → 0 clamp",
    args: [
      { wakeUpHour: 7, sleepHour: 12, schoolStayHours: 8, academyHours: 4 },
      true,
    ],
    expected: 0,
  },
  {
    name: "취침 === 기상 → 0",
    args: [
      { wakeUpHour: 7, sleepHour: 7, schoolStayHours: 0, academyHours: 0 },
      true,
    ],
    expected: 0,
  },
  {
    name: "취침 < 기상 → 0",
    args: [
      { wakeUpHour: 23, sleepHour: 7, schoolStayHours: 0, academyHours: 0 },
      true,
    ],
    expected: 0,
  },
  { name: "null → 0", args: [null, true], expected: 0 },
  { name: "undefined → 0", args: [undefined, true], expected: 0 },
  { name: "빈 객체 → 0", args: [{}, true], expected: 0 },
  {
    name: "문자열 입력 7/23.5/7.5/1.25",
    args: [
      {
        wakeUpHour: "7",
        sleepHour: "23.5",
        schoolStayHours: "7.5",
        academyHours: "1.25",
      },
      true,
    ],
    expected: 7.8,
  },
  {
    name: "음수 학원시간 — 가용이 오히려 늘어난다(방어 없음, 원본과 같은 태도)",
    args: [
      { wakeUpHour: 7, sleepHour: 24, schoolStayHours: 8, academyHours: -2 },
      true,
    ],
    expected: 11,
  },
  {
    name: "학교체류 NaN → 항 무시",
    args: [
      { wakeUpHour: 7, sleepHour: 24, schoolStayHours: "", academyHours: 2 },
      true,
    ],
    expected: 15,
  },
  {
    name: "상한 초과 학교체류 24 → 0 clamp",
    args: [
      { wakeUpHour: 7, sleepHour: 24, schoolStayHours: 24, academyHours: 0 },
      true,
    ],
    expected: 0,
  },
  {
    name: "hasSchool 기본값은 true",
    args: [
      { wakeUpHour: 7, sleepHour: 24, schoolStayHours: 8, academyHours: 2 },
    ],
    expected: 7,
  },
];

for (const c of APPROX_CASES) {
  test(`calcAvailableHoursApprox — ${c.name}`, () => {
    near(calcAvailableHoursApprox(...c.args), c.expected, "approx");
  });
}

// --- 근사 vs 원본: 오차 방향 고정 -------------------------------------------------
//
// 오차 = 근사 − 원본 = 1.5(식사공제) + (유효 학원 건수 × 1h 이동시간) − 등교전자습시간
//
// 아래 표의 orig/approx 값은 원본 하네스와 이 모듈을 실제로 실행해 뽑았다.
// calc-spec.md §2.2-(8) 은 이 식을 `등교전자습 − 1.5 − (학원건수 × 1)` 로 적었는데 **부호가 반대**다
// (같은 문서의 수치 예시 "+1.5h 과대추정"·결론 서술과도 어긋난다). 문서 쪽이 틀렸다.
const ERROR_DIRECTION_CASES = [
  {
    name: "검증샘플(학원1건, 등교전 1h) — 근사가 +1.5h 과대추정",
    day: day("7", "24", "8", "16", [{ start: "17", end: "19" }]),
    steppers: {
      wakeUpHour: 7,
      sleepHour: 24,
      schoolStayHours: 8,
      academyHours: 2,
    },
    hasSchool: true,
    academyCount: 1,
    preSchoolHours: 1,
    orig: 5.5,
    approx: 7,
    err: 1.5,
  },
  {
    name: "학원 0건, 등교전 1h → +0.5h",
    day: day("7", "24", "8", "16", []),
    steppers: {
      wakeUpHour: 7,
      sleepHour: 24,
      schoolStayHours: 8,
      academyHours: 0,
    },
    hasSchool: true,
    academyCount: 0,
    preSchoolHours: 1,
    orig: 8.5,
    approx: 9,
    err: 0.5,
  },
  {
    name: "학원 2건, 등교전 1h → +2.5h (학원이 많을수록 과대추정 확대)",
    day: day("7", "24", "8", "16", [
      { start: "17", end: "19" },
      { start: "20", end: "21" },
    ]),
    steppers: {
      wakeUpHour: 7,
      sleepHour: 24,
      schoolStayHours: 8,
      academyHours: 3,
    },
    hasSchool: true,
    academyCount: 2,
    preSchoolHours: 1,
    orig: 3.5,
    approx: 6,
    err: 2.5,
  },
  {
    name: "이른 기상(등교전 3h), 학원 0건 → −1.5h (방향이 뒤집혀 과소추정)",
    day: day("5", "23", "8", "16", []),
    steppers: {
      wakeUpHour: 5,
      sleepHour: 23,
      schoolStayHours: 8,
      academyHours: 0,
    },
    hasSchool: true,
    academyCount: 0,
    preSchoolHours: 3,
    orig: 11.5,
    approx: 10,
    err: -1.5,
  },
  {
    name: "기상 = 등교시각(등교전 0h), 학원 0건 → +1.5h",
    day: day("8", "24", "8", "16", []),
    steppers: {
      wakeUpHour: 8,
      sleepHour: 24,
      schoolStayHours: 8,
      academyHours: 0,
    },
    hasSchool: true,
    academyCount: 0,
    preSchoolHours: 0,
    orig: 6.5,
    approx: 8,
    err: 1.5,
  },
  {
    name: "주말 학원 1건 → +2.5h",
    day: day("7", "24", "", "", [{ start: "10", end: "12" }]),
    steppers: {
      wakeUpHour: 7,
      sleepHour: 24,
      schoolStayHours: 0,
      academyHours: 2,
    },
    hasSchool: false,
    academyCount: 1,
    preSchoolHours: 0,
    orig: 12.5,
    approx: 15,
    err: 2.5,
  },
  {
    name: "주말 학원 0건 → +1.5h (식사 공제 −1.5h 만큼 그대로)",
    day: day("7", "24", "", "", []),
    steppers: {
      wakeUpHour: 7,
      sleepHour: 24,
      schoolStayHours: 0,
      academyHours: 0,
    },
    hasSchool: false,
    academyCount: 0,
    preSchoolHours: 0,
    orig: 15.5,
    approx: 17,
    err: 1.5,
  },
];

for (const c of ERROR_DIRECTION_CASES) {
  test(`근사 오차 방향 — ${c.name}`, () => {
    const orig = calcAvailableHours(c.day, c.hasSchool);
    const approx = calcAvailableHoursApprox(c.steppers, c.hasSchool);

    near(orig, c.orig, "orig");
    near(approx, c.approx, "approx");
    near(Math.round((approx - orig) * 10) / 10, c.err, "err");

    // 오차 = 1.5 + (학원 건수 × 1) − 등교전자습시간
    const predicted = 1.5 + c.academyCount * 1 - c.preSchoolHours;
    near(c.err, predicted, "오차 공식");
  });
}

test("근사 오차 방향 — [문서오류] calc-spec.md §2.2-(8) 의 오차식은 부호가 반대다", () => {
  // 문서식: 오차 = 등교전자습 − 1.5 − (학원건수 × 1)
  // 실제식: 오차 = 1.5 + (학원건수 × 1) − 등교전자습
  for (const c of ERROR_DIRECTION_CASES) {
    const docFormula = c.preSchoolHours - 1.5 - c.academyCount * 1;
    const actual = c.err;
    near(docFormula, -actual, "문서식은 실제 오차의 부호 반대값이다");
  }
});
