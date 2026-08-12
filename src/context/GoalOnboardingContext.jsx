// 목표관리 온보딩(7단계 위저드) 전용 상태 컨텍스트 — 작업 지시 "상태 관리" 절.
// src/context/SignupContext.jsx의 구조 관례(Provider + custom hook + 평평한 state + 부분
// 업데이트 함수들 + sessionStorage 영속)를 그대로 따른다. 회원가입과 마찬가지로
// sessionStorage('goal-onboarding-flow')로 스텝 간 입력을 동기화한다 — 온보딩은
// /app/goal/onboarding/step-1~7로 스텝별 라우트가 쪼개져 있어, React state만으로는
// 새로고침하거나 URL로 직접 진입할 때 이전 단계 입력이 전부 유실되기 때문이다.
//
// localStorage가 아니라 sessionStorage를 쓰는 이유도 회원가입(SignupContext.jsx:1-6)과
// 동일하다: 온보딩 입력에는 내신 성적·목표대학처럼 민감할 수 있는 개인 학업 정보가
// 들어가는데, localStorage는 탭을 닫아도 남아 공용 PC에서 다음 사용자에게 노출될 위험이
// 있다. sessionStorage는 탭 종료 시 자동으로 사라진다.
//
// 민감 필드 제외 검토(SignupContext.jsx:121의 SENSITIVE_FORM_KEYS와 같은 판단): 온보딩
// 입력 항목(학교유형/학년/목표대학/내신/모의고사/공부시간/일과)에는 비밀번호·인증코드 같은
// 항목이 없다. 전부 위저드 진행에 반드시 필요한 값이라 제외 없이 그대로 저장한다.
//
// 완료 판정(markOnboardingDone(), src/lib/goalOnboarding.js)과는 별개의 저장소다 — 그건
// localStorage 플래그로 "온보딩을 끝냈는지"만 기억하고, 여기 sessionStorage는 "입력 중이던
// 값"을 기억한다. 온보딩 완료 시 이 플로우 저장소는 resetOnboardingFlow()로 비운다
// (src/pages/goal/Onboarding.jsx의 handleFinish 참고). QA가 온보딩을 처음부터 다시 보려면
// 완료 플래그(resetOnboarding(), lib/goalOnboarding.js)와 이 입력값 저장소
// (clearOnboardingFlow(), 이 파일) 둘 다 지워야 한다 — 하나만 지우면 RequireGoalAccess의
// 3단계 판정이나 위저드 복구 로직이 이전 상태를 다시 불러온다.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DAILY_SCHEDULE_FIELDS,
  MOCK_EXAM_ROUNDS,
  MOCK_EXAM_SUBJECTS,
  NAESIN_EXAMS,
  WEEKDAY_OPTIONS
} from '../data/goalOnboardingMock';

const STORAGE_KEY = 'goal-onboarding-flow';

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

// 저장소가 비어있거나(최초 진입) 초기화(resetOnboardingFlow)할 때 쓰는 기본값. 매번 새
// 객체를 만들어 반환한다 — 스텝 컴포넌트들이 참조를 공유해 서로 오염시키지 않도록.
function buildDefaultState() {
  return {
    schoolType: null, // 'general' | 'special' | 'middle' | 'elementary' | null
    grade: null, // 'g1' | 'g2' | 'g3' | null — general/special 경로에서만 사용
    upperUniversity: { university: '', department: '' },
    lowerUniversity: { university: '', department: '' },
    naesin: buildInitialNaesin(),
    // 내신 4회차가 "전부 없음"일 때만 의미를 갖는 이전 학년까지의 내신 평균 등급(1~9, 문자열).
    // 고1이면 중학교 평균, 고2면 고1까지, 고3이면 고2까지의 누적 평균이며 한 칸을 공유한다.
    // 다른 성적 입력(naesin[key].value)과 같게 문자열로 두고 숫자 변환은 서버가 한 번만 한다.
    // 반드시 여기(defaults)에 있어야 sessionStorage 복구 병합(buildInitialState)에서 살아남는다.
    priorNaesinGrade: '',
    mockExam: buildInitialMockExam(),
    studyHours: buildInitialStudyHours(),
    dailySchedule: buildInitialDailySchedule()
  };
}

function readStoredFlow() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    // JSON 파싱 실패, 또는 사파리 프라이빗 모드 등으로 sessionStorage 접근 자체가 막힌
    // 경우 모두 여기로 떨어진다 — SignupContext.jsx:108-119와 동일한 방어 수준.
    console.error('goal-onboarding-flow 세션 저장소 읽기 오류:', error);
    return null;
  }
}

function writeStoredFlow(state) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('goal-onboarding-flow 세션 저장소 쓰기 오류:', error);
  }
}

function clearStoredFlow() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('goal-onboarding-flow 세션 저장소 초기화 오류:', error);
  }
}

// 저장된 값 중 defaults에 없는 키(예: 저장 이후 NAESIN_EXAMS/MOCK_EXAM_ROUNDS 등 데이터
// 정의가 바뀌어 시험/과목 구성이 달라진 경우)는 버리고, defaults 키 기준으로만 한 겹 병합한다.
// 스키마 드리프트로 더 이상 존재하지 않는 키가 되살아나는 걸 막기 위한 방어다.
function mergeKeyedObject(defaults, stored) {
  if (!stored || typeof stored !== 'object') return defaults;

  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => {
      const storedValue = stored[key];
      if (!storedValue || typeof storedValue !== 'object') return [key, defaultValue];
      return [key, { ...defaultValue, ...storedValue }];
    })
  );
}

function buildInitialState(stored) {
  const defaults = buildDefaultState();
  if (!stored) return defaults;

  return {
    ...defaults,
    ...stored,
    upperUniversity: { ...defaults.upperUniversity, ...(stored.upperUniversity || {}) },
    lowerUniversity: { ...defaults.lowerUniversity, ...(stored.lowerUniversity || {}) },
    naesin: mergeKeyedObject(defaults.naesin, stored.naesin),
    mockExam: mergeKeyedObject(defaults.mockExam, stored.mockExam),
    studyHours: { ...defaults.studyHours, ...(stored.studyHours || {}) },
    dailySchedule: { ...defaults.dailySchedule, ...(stored.dailySchedule || {}) }
  };
}

// QA/디버깅 전용 — 저장된 "입력값"만 지운다. 완료 플래그(localStorage)는 별개 저장소라
// lib/goalOnboarding.js의 resetOnboarding()이 따로 관리한다. 온보딩을 처음부터 다시
// 보려면 두 함수를 함께 호출해야 한다(하나만 지우면 RequireGoalAccess의 완료 판정 또는
// 이 컨텍스트의 복구 로직이 이전 상태를 다시 불러온다). Provider 마운트 여부와 무관하게
// 콘솔 등에서도 바로 호출할 수 있도록 모듈 레벨 함수로 export한다.
export function clearOnboardingFlow() {
  clearStoredFlow();
}

const GoalOnboardingContext = createContext(null);

export function GoalOnboardingProvider({ children }) {
  const [state, setState] = useState(() => buildInitialState(readStoredFlow()));

  useEffect(() => {
    writeStoredFlow(state);
  }, [state]);

  function setSchoolType(schoolType) {
    // 유형을 바꾸면 이전 유형에서 고르던 학년 선택은 더 이상 유효하지 않으므로 함께 초기화한다.
    setState((prev) => ({ ...prev, schoolType, grade: null }));
  }

  function setGrade(grade) {
    // 학년을 바꾸면 priorNaesinGrade 도 함께 비운다(setSchoolType 이 grade 를 비우는 것과 같은
    // 연쇄 무효화). 같은 한 칸이 학년마다 다른 의미를 갖기 때문이다 — 고1에서 "중학교 평균"으로
    // 넣은 값이 고2로 바꾸면 화면 라벨만 "고1까지 누적"으로 바뀐 채 그대로 제출되고, 서버 분기도
    // '중3' 치환(페널티 +0.10)에서 remainingNaesin=6 오버라이드로 통째로 뒤집힌다.
    // 실제로 바뀔 때만 비운다 — 같은 학년을 다시 눌렀다고 입력을 날리지 않는다.
    setState((prev) => (prev.grade === grade ? prev : { ...prev, grade, priorNaesinGrade: '' }));
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

  // 내신 전 회차 "없음" 특례 입력. 4회차 중 하나라도 "없음"이 해제되면 Step4가 ''로 비운다.
  function setPriorNaesinGrade(value) {
    setState((prev) => ({ ...prev, priorNaesinGrade: value }));
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

  // 온보딩 완료(7단계 "다음") 시 호출한다 — 저장된 입력값을 비우고 컨텍스트 state도
  // 초기값으로 되돌린다. src/pages/goal/Onboarding.jsx의 handleFinish가
  // submitGoalIntake()가 성공(200)/이미 완료(409)를 반환한 직후 이 함수를 호출하도록
  // 배선돼 있다(SignupContext의 resetSignup()과 같은 역할). 2026-08-11 이전엔
  // markOnboardingDone() 직후 호출이었으나, 이제 완료 판정은 서버(goal_students)가
  // 정본이라 클라이언트 완료 플래그를 세우는 절차 자체가 없어졌다.
  function resetOnboardingFlow() {
    clearStoredFlow();
    setState(buildDefaultState());
  }

  const value = useMemo(
    () => ({
      ...state,
      setSchoolType,
      setGrade,
      setUpperUniversity,
      setLowerUniversity,
      updateNaesin,
      setPriorNaesinGrade,
      updateMockExam,
      setStudyHour,
      setDailyScheduleField,
      resetOnboardingFlow
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
