import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveAdmissionTracks,
  deriveMainTracks,
  deriveSubjectReflections,
  NO_SUBJECT_REFLECTION_LABEL,
} from "@/lib/diagnosisAdmissionCascade";
import {
  ADMISSION_FETCH_ERROR,
  fetchAdmissionCuts,
} from "@/lib/diagnosisAdmissionCuts";
// admissionResultsQueries.js(다른 세션 소유, recruitment_period 필터가 새 스키마에서 깨져 있다)를
// 재사용하지 않는다 — diagnosisAdmissionMasterQueries.js 헤더 주석 참고.
import {
  fetchAdmissionDepartments,
  fetchAdmissionTrackRows,
  fetchAdmissionUniversities,
} from "@/lib/diagnosisAdmissionMasterQueries";

// diagnosisAdmissionMasterQueries.ts의 UniversityRow/DepartmentRow가 집계 뷰
// 컬럼이라 string | null이다(그쪽 주석 참고) — 그 셰이프를 그대로 좁혀 받는다.
interface UniversityRow {
  university_key: string | null;
  university_name: string | null;
}

interface DepartmentRow {
  department_key: string | null;
  department_name: string | null;
}

interface TrackRow {
  result_year: number;
  main_track?: string | null;
  admission_track?: string | null;
  subject_reflection?: string | null;
  grade_50?: number | null;
  grade_70?: number | null;
}

interface Resource<T> {
  data: T[];
  loading: boolean;
  error: unknown;
}

export interface CascadeValue {
  university?: string;
  department?: string;
  admissionType?: string;
  detailType?: string;
  subjectReflection?: string;
}

interface CutsData {
  cut50: number | null;
  cut70: number | null;
  finalAvg: number | null;
  year: number;
}

const EMPTY_RESOURCE: Resource<never> = {
  data: [],
  loading: false,
  error: null,
};

/**
 * 학습진단 스텝5 q15(목표 대학 입결 조회) 캐스케이드가 필요로 하는 fetch 상태 전부를 소유한다
 * (B-1 확정 — SurveyStepShell 이 옵션 5벌 + loading + error 를 소유하고 AnswerField 를 거쳐
 * CascadingSelect 로 내려보낸다).
 *
 * 대학·학과는 university_name/department_name **문자열 자체**가 답변 값이다(admissionQuery 캡션이
 * 그 문자열을 그대로 쓰므로 유지) — university_key/department_key 는 이 훅 내부에서만 이름→키로
 * 되짚어 다음 단계 조회에 쓴다. 전형 유형(main_track)·세부 전형명(admission_track)·반영교과/영역
 * (subject_reflection)은 대학+학과 선택 시 한 번 받아온 Q3 원본 행에서 파생시킨다(추가 라운드트립 없음).
 *
 * @param {{ university?: string, department?: string, admissionType?: string, detailType?: string,
 *           subjectReflection?: string }} cascadeValue answers.q15 (없으면 빈 캐스케이드)
 * @returns {{ levels: Array, cuts: object|null, cutsError: boolean,
 *             admissionMeta: {year: number}|null,
 *             awaitCuts: () => Promise<{cuts: object|null, cutsError: boolean}> }}
 *
 * cutsError(F-22)는 '지금 못 불러왔다'(일시 오류)를 '이 조합은 원래 자료가 없다'(영구 부재)와
 * 가르는 유일한 신호다. 종전에는 둘이 전부 cuts=null 로 뭉개져 학생 화면이 같았고, 리포트는
 * 일시 오류에도 "공개된 입결 자료가 없어…"라고 **단정**하는 문장을 냈다.
 *
 * awaitCuts(G-1a)는 제출 직전 전용이다. cascadeComplete 직후 아직 fetch 가 안 끝난 채로 제출하면
 * cuts/cutsError state 가 둘 다 이전 값(대개 null/false)이라 '조회 미확정'이 '자료 영구 부재'로
 * 낙관 처리된다 — 호출부는 cuts/cutsError 를 직접 읽는 대신 반드시 이 함수로 확정값을 기다린다.
 */
export function useAdmissionCascade(cascadeValue?: CascadeValue | null) {
  const value = cascadeValue ?? {};
  const [universities, setUniversities] =
    useState<Resource<UniversityRow>>(EMPTY_RESOURCE);
  const [departments, setDepartments] =
    useState<Resource<DepartmentRow>>(EMPTY_RESOURCE);
  const [trackRows, setTrackRows] =
    useState<Resource<TrackRow>>(EMPTY_RESOURCE);
  // cuts 자체는 항상 데이터 또는 null이다 — ADMISSION_FETCH_ERROR 센티널은 cutsError로 갈라져
  // 별도 불리언 상태로 빠지므로 여기엔 절대 담기지 않는다(applyOutcome 참고).
  const [cuts, setCuts] = useState<CutsData | null>(null);
  const [cutsError, setCutsError] = useState(false);
  // G-1a(2026-08-12) — 제출 경합 방지. 캐스케이드가 막 완주돼 fetch 가 아직 안 끝난 채로 제출
  // 버튼을 누르면 cuts=null·cutsError=false(둘 다 초기값)로 읽혀 '조회 미확정'이 '자료 영구
  // 부재'로 낙관 처리된다(3회 중 2회 재현 — 실측). cutsOutcomeRef 는 상태와 항상 동기인 최신
  // 결과를, cutsSettleRef 는 진행 중인 조회가 끝나는 시점을 들고 있다 — awaitCuts() 가 제출
  // 직전 그 시점을 기다려 상태 대신 **확정된 값**을 직접 돌려준다(리렌더 타이밍에 기대지 않는다).
  const cutsOutcomeRef = useRef<{ cuts: CutsData | null; cutsError: boolean }>({
    cuts: null,
    cutsError: false,
  });
  const cutsSettleRef = useRef(Promise.resolve());

  // 대학 목록 재조회 트리거. 대학 조회는 마운트 1회(deps=[])라, 최초 조회가 실패하면
  // 다른 단계(학과·전형)처럼 선택 변경으로 자연히 다시 호출될 경로가 없다 — 새로고침만이
  // 유일한 복구였다. nonce 를 올려 effect 를 재실행시키는 명시적 재시도 경로를 둔다.
  const [universitiesNonce, setUniversitiesNonce] = useState(0);
  const retryUniversities = useCallback(
    () => setUniversitiesNonce((n) => n + 1),
    [],
  );

  // 대학 목록. 셸 마운트 1회 + 재시도 시.
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) universitiesNonce는 effect 안에서 읽지 않는 재시도 트리거 전용 값이다(위 주석).
  useEffect(() => {
    let alive = true;
    setUniversities((prev) => ({ ...prev, loading: true, error: null }));
    fetchAdmissionUniversities().then(({ data, error }) => {
      if (alive) setUniversities({ data, loading: false, error });
    });
    return () => {
      alive = false;
    };
  }, [universitiesNonce]);

  const universityKey = useMemo(
    () =>
      universities.data.find((u) => u.university_name === value.university)
        ?.university_key ?? null,
    [universities.data, value.university],
  );

  // 학과 목록. 대학 선택 시.
  useEffect(() => {
    if (!universityKey) {
      setDepartments(EMPTY_RESOURCE);
      return undefined;
    }
    let alive = true;
    setDepartments((prev) => ({ ...prev, loading: true, error: null }));
    fetchAdmissionDepartments(universityKey).then(({ data, error }) => {
      if (alive) setDepartments({ data, loading: false, error });
    });
    return () => {
      alive = false;
    };
  }, [universityKey]);

  const departmentKey = useMemo(
    () =>
      departments.data.find((d) => d.department_name === value.department)
        ?.department_key ?? null,
    [departments.data, value.department],
  );

  // 전형 유형·세부 전형명·반영교과 파생용 원본 행. 학과 선택 시 1회 — 이후 3단계 옵션을 전부
  // 이 응답 하나에서 파생시켜 추가 라운드트립을 늘리지 않는다.
  useEffect(() => {
    if (!universityKey || !departmentKey) {
      setTrackRows(EMPTY_RESOURCE);
      return undefined;
    }
    let alive = true;
    setTrackRows((prev) => ({ ...prev, loading: true, error: null }));
    fetchAdmissionTrackRows(universityKey, departmentKey).then(
      ({ data, error }) => {
        if (alive) setTrackRows({ data, loading: false, error });
      },
    );
    return () => {
      alive = false;
    };
  }, [universityKey, departmentKey]);

  const mainTrackOptions = useMemo(
    () => deriveMainTracks(trackRows.data),
    [trackRows.data],
  );
  const admissionTrackOptions = useMemo(
    () => deriveAdmissionTracks(trackRows.data, value.admissionType),
    [trackRows.data, value.admissionType],
  );
  const subjectReflectionCandidates = useMemo(
    () =>
      deriveSubjectReflections(
        trackRows.data,
        value.admissionType,
        value.detailType,
      ),
    [trackRows.data, value.admissionType, value.detailType],
  );

  // 5단째는 후보 2개 이상일 때만 화면에 묻는다(B-1 확정). 1개뿐이면 그 값을 그대로, 0개면 null 을 쓴다.
  const showSubjectReflectionLevel = subjectReflectionCandidates.length >= 2;
  const rawSubjectReflection = showSubjectReflectionLevel
    ? value.subjectReflection || null
    : (subjectReflectionCandidates[0] ?? null);
  // seam(fetchAdmissionCuts)은 DB 원본 의미(값 없음=null)를 받는다 — UI 표시용 대체 라벨을 되돌린다.
  const resolvedSubjectReflection =
    rawSubjectReflection === NO_SUBJECT_REFLECTION_LABEL
      ? null
      : rawSubjectReflection;

  // 최종 컷 조회 — 전형 유형+세부 전형명(+반영교과, 후보 2개 이상이면 그것까지)이 전부 정해지면 1회.
  useEffect(() => {
    const cascadeComplete =
      universityKey &&
      departmentKey &&
      value.admissionType &&
      value.detailType &&
      (!showSubjectReflectionLevel || value.subjectReflection);

    // 상태(setCuts/setCutsError)와 ref(cutsOutcomeRef)를 항상 같은 값으로 갱신한다 — 리렌더는
    // 화면용, ref 는 awaitCuts() 가 즉시 읽는 동기 스냅샷용이다.
    const applyOutcome = (
      nextCuts: CutsData | null,
      nextCutsError: boolean,
    ) => {
      cutsOutcomeRef.current = { cuts: nextCuts, cutsError: nextCutsError };
      setCuts(nextCuts);
      setCutsError(nextCutsError);
    };

    if (!cascadeComplete) {
      // 선택이 바뀌면 반드시 함께 리셋한다 — 안 하면 한 번 실패한 뒤 다른 대학을 골라도
      // 계속 에러 화면이 남는다.
      applyOutcome(null, false);
      cutsSettleRef.current = Promise.resolve();
      return undefined;
    }

    let alive = true;
    const settle = fetchAdmissionCuts({
      universityKey,
      departmentKey,
      // cascadeComplete가 truthy를 보장하므로 admissionType/detailType은 항상 존재.
      mainTrack: value.admissionType!,
      admissionTrack: value.detailType!,
      subjectReflection: resolvedSubjectReflection,
    })
      .then((result) => {
        if (!alive) return;
        // **반드시 참조 비교다.** `result == null` 같은 느슨한 비교를 쓰면 센티널이 다시 결측으로
        // 뭉개져 F-22 가 통째로 무의미해진다. 또 센티널을 cuts 에 그대로 넣어서도 안 된다 —
        // 이 값은 sessionStorage 로 직렬화돼 리포트 페이지까지 가는데, JSON 왕복에서 참조
        // 동일성이 사라져 저쪽에서는 판별이 불가능해진다. 여기서 불리언으로 바꿔 올린다.
        if (result === ADMISSION_FETCH_ERROR) {
          applyOutcome(null, true);
          return;
        }
        // 위 참조 비교로 센티널 분기를 이미 걸러냈지만, TS는 객체 참조 동일성 비교로 유니온을
        // 좁히지 못한다 — 나머지 가지는 CutsData 뿐이라는 걸 코드가 이미 보장한다.
        applyOutcome(result as CutsData, false);
      })
      // fetchAdmissionCuts 는 예외를 값으로 정규화하지만, 그 계약이 깨져도 unhandled rejection 으로
      // 흘러 cuts 가 조용히 null 로 남는 일이 없게 마지막 관문을 둔다.
      .catch(() => {
        if (!alive) return;
        applyOutcome(null, true);
      });
    cutsSettleRef.current = settle;
    return () => {
      alive = false;
    };
  }, [
    universityKey,
    departmentKey,
    value.admissionType,
    value.detailType,
    value.subjectReflection,
    showSubjectReflectionLevel,
    resolvedSubjectReflection,
  ]);

  // G-1a — 제출 직전 호출 전용. 진행 중인 컷 조회가 있으면 끝날 때까지 기다린 뒤(=settle) 그
  // 순간의 확정 결과를 돌려준다. cuts/cutsError state 를 읽지 않는 이유는 상태 갱신이 다음
  // 렌더까지 반영되지 않아 awaitCuts 호출 직후에도 낡은 값을 볼 수 있기 때문이다.
  const awaitCuts = useCallback(async () => {
    await cutsSettleRef.current;
    return cutsOutcomeRef.current;
  }, []);

  const levels = useMemo(() => {
    const base = [
      {
        key: "university",
        label: "대학 선택",
        // 정본 마스터(2026-08-11 교체) university_key 표기가 '건국대학교'가 아니라 '건국대'다
        // (전 대학 접미사 '대학교' 없이 '대'로 통일) — 실측값으로 플레이스홀더를 갱신했다.
        placeholder: "건국대",
        options: universities.data.map((u) => u.university_name),
        loading: universities.loading,
        error: universities.error,
        // 대학 단계에만 재시도를 준다 — 하위 단계는 상위 선택을 바꾸면 자연히 재조회된다.
        onRetry: retryUniversities,
      },
      {
        key: "department",
        label: "학과 또는 모집단위",
        placeholder: "경영학과",
        options: departments.data.map((d) => d.department_name),
        loading: departments.loading,
        error: departments.error,
      },
      {
        key: "admissionType",
        label: "전형 유형",
        // main_track 값도 '학생부종합'이 아니라 '종합'(축약형) — 하드코딩하지 않고 조회 결과를
        // 그대로 쓰지만, 플레이스홀더는 예시 텍스트라 실측값으로 맞춘다.
        placeholder: "종합",
        options: mainTrackOptions,
        loading: trackRows.loading,
        error: trackRows.error,
      },
      {
        key: "detailType",
        label: "세부 전형명",
        placeholder: "일반전형",
        options: admissionTrackOptions,
        loading: trackRows.loading,
        error: trackRows.error,
      },
    ];

    if (showSubjectReflectionLevel) {
      base.push({
        key: "subjectReflection",
        label: "반영교과/영역",
        placeholder: "국어·영어·수학",
        options: subjectReflectionCandidates,
        loading: trackRows.loading,
        error: trackRows.error,
      });
    }

    return base;
  }, [
    universities,
    departments,
    mainTrackOptions,
    admissionTrackOptions,
    subjectReflectionCandidates,
    showSubjectReflectionLevel,
    trackRows.loading,
    trackRows.error,
    retryUniversities,
  ]);

  return {
    levels,
    cuts,
    cutsError,
    admissionMeta: cuts ? { year: cuts.year } : null,
    awaitCuts,
  };
}
