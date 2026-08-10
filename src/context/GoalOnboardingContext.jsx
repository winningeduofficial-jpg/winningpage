// 목표관리 온보딩(7단계 위저드) 전용 상태 컨텍스트 — 작업 지시 "상태 관리" 절.
// src/context/SignupContext.jsx의 구조 관례(Provider + custom hook + 평평한 state + 부분
// 업데이트 함수들)를 그대로 따른다. 다만 온보딩은 서버 저장이 전혀 없는 순수 목업 흐름이라
// (작업 지시 §확정 사항 4) SignupContext처럼 sessionStorage로 동기화하지 않는다 — 즉 새로고침하면
// 그때까지 입력한 값이 전부 유실된다. 이는 의도된 동작이다(온보딩은 완료 시 markOnboardingDone()
// 한 번으로 끝나는 짧은 흐름이라 영속화 비용을 들일 이유가 없다고 판단).
import { createContext, useContext, useMemo, useState } from 'react';
import {
  DAILY_SCHEDULE_FIELDS,
  MOCK_EXAM_ROUNDS,
  MOCK_EXAM_SUBJECTS,
  NAESIN_EXAMS,
  WEEKDAY_OPTIONS
} from '../data/goalOnboardingMock';

function buildInitialNaesin() {
  return Object.fromEntries(NAESIN_EXAMS.map((exam) => [exam.key, { value: '', none: false }]));
}

function buildInitialMockExam() {
  return Object.fromEntries(
    MOCK_EXAM_ROUNDS.map((round) => [
      round.key,
      { none: false, ...Object.fromEntries(MOCK_EXAM_SUBJECTS.map((subject) => [subject.key, ''])) }
    ])
  );
}

function buildInitialStudyHours() {
  return Object.fromEntries(WEEKDAY_OPTIONS.map((day) => [day.key, 0]));
}

function buildInitialDailySchedule() {
  return Object.fromEntries(DAILY_SCHEDULE_FIELDS.map((field) => [field.key, field.defaultValue]));
}

function buildInitialState() {
  return {
    schoolType: null, // 'general' | 'special' | 'middle' | 'elementary' | null
    grade: null, // 'g1' | 'g2' | 'g3' | null — general/special 경로에서만 사용
    upperUniversity: { university: '', department: '' },
    lowerUniversity: { university: '', department: '' },
    naesin: buildInitialNaesin(),
    mockExam: buildInitialMockExam(),
    studyHours: buildInitialStudyHours(),
    dailySchedule: buildInitialDailySchedule()
  };
}

const GoalOnboardingContext = createContext(null);

export function GoalOnboardingProvider({ children }) {
  const [state, setState] = useState(buildInitialState);

  function setSchoolType(schoolType) {
    // 유형을 바꾸면 이전 유형에서 고르던 학년 선택은 더 이상 유효하지 않으므로 함께 초기화한다.
    setState((prev) => ({ ...prev, schoolType, grade: null }));
  }

  function setGrade(grade) {
    setState((prev) => ({ ...prev, grade }));
  }

  function setUpperUniversity(partial) {
    setState((prev) => ({ ...prev, upperUniversity: { ...prev.upperUniversity, ...partial } }));
  }

  function setLowerUniversity(partial) {
    setState((prev) => ({ ...prev, lowerUniversity: { ...prev.lowerUniversity, ...partial } }));
  }

  function updateNaesin(examKey, partial) {
    setState((prev) => ({
      ...prev,
      naesin: { ...prev.naesin, [examKey]: { ...prev.naesin[examKey], ...partial } }
    }));
  }

  function updateMockExam(roundKey, partial) {
    setState((prev) => ({
      ...prev,
      mockExam: { ...prev.mockExam, [roundKey]: { ...prev.mockExam[roundKey], ...partial } }
    }));
  }

  function setStudyHour(dayKey, value) {
    setState((prev) => ({ ...prev, studyHours: { ...prev.studyHours, [dayKey]: value } }));
  }

  function setDailyScheduleField(fieldKey, value) {
    setState((prev) => ({
      ...prev,
      dailySchedule: { ...prev.dailySchedule, [fieldKey]: value }
    }));
  }

  const value = useMemo(
    () => ({
      ...state,
      setSchoolType,
      setGrade,
      setUpperUniversity,
      setLowerUniversity,
      updateNaesin,
      updateMockExam,
      setStudyHour,
      setDailyScheduleField
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state]
  );

  return <GoalOnboardingContext.Provider value={value}>{children}</GoalOnboardingContext.Provider>;
}

export function useGoalOnboarding() {
  const ctx = useContext(GoalOnboardingContext);

  if (!ctx) {
    throw new Error('useGoalOnboarding은 GoalOnboardingProvider 내부에서만 사용할 수 있습니다.');
  }

  return ctx;
}
