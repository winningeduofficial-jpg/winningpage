// 대시보드/서브페이지 진입 모달 3종(과제 추가 · 중요일정 등록 · 모의고사 성적 추가) +
// "오늘의 목표" 카드 퀵칩이 공유하는 선택지 상수.
//
// 원래 옛 목업 파일의 `goalModalOptions`였다(mock 삭제 UoW로 이관, 2026-08-20).
// scheduleTypes·scheduleRanges 두 키는 이관하지 않았다 — 소비처가 없다(중요일정 등록 모달
// AddScheduleFullModal은 src/lib/goal/scheduleCategory.ts의 SCHEDULE_CATEGORIES를 쓴다).
//
// 시안에는 셀렉트 옵션 "목록"이 없고 표시값 1건만 실측돼 있다(예: 예상 소요 시간
// "1시간 30분", 회차 "2026년 9월 모의고사"). 실측 표시값은 그대로 포함하되 목록 구성
// 자체는 통상적인 선택지로 새로 만든 것이라 미확정이다.

import { kstYMD } from "@/lib/goal/calc/index.js";

export const TASK_SUBJECTS = ["국어", "수학", "영어", "탐구", "기타"];

export const TASK_DURATIONS = [
  "30분",
  "1시간",
  "1시간 30분",
  "2시간",
  "2시간 30분",
  "3시간",
];

export const TASK_SCHEDULES = ["오늘만", "이번 주만", "매주 반복"];

/** KST 현재 연도(YYYY). mockExamRounds 파생 전용 — 연도 하드코딩을 피한다. */
function currentKstYear(): number {
  return Number(kstYMD(new Date()).slice(0, 4));
}

// 모의고사 회차 3종 — 9월/6월/3월 순서는 시안(part-08 #22) 그대로 고정하고 연도만
// KST 현재 연도에서 매번 파생한다. AddMockExamGradeModal의 ROUND_OPTIONS[0]는 이
// 배열이 고정 3건이라 "항상 비지 않는다"(그 파일 주석과 정합).
export const MOCK_EXAM_ROUNDS = (() => {
  const year = currentKstYear();
  return [
    `${year}년 9월 모의고사`,
    `${year}년 6월 모의고사`,
    `${year}년 3월 모의고사`,
  ];
})();

// 대시보드 "오늘의 목표" 카드 퀵칩 증분(시간 단위) — + 30분 / + 1시간 / + 2시간.
export const QUICK_ADD_HOURS = [0.5, 1, 2];
