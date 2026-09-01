import { useCallback, useEffect, useState } from "react";
import {
  fetchSusiDepartments,
  fetchSusiUniversities,
  fetchTrendingDepartments,
} from "@/lib/admissionResultsQueries";

// admissionResultsQueries.js(수정 범위 밖의 JSDoc 없는 .js)가 돌려주는 행 모양을
// 이 셸이 실제로 읽는 필드만 좁혀서 적는다.
export interface UniversityIndexRow {
  university_key: string;
  university_name?: string;
  dept_count?: number;
  [key: string]: unknown;
}

export interface DepartmentIndexRow {
  department_key: string;
  department_name?: string;
  // admissionResultsQueries.ts의 DepartmentIndexRow.tracks가 string[] | null이라
  // (undefined가 아니라 null) 그 셰이프를 그대로 좁혀 받는다.
  tracks?: string[] | null;
  [key: string]: unknown;
}

export interface TrendingDepartmentRow {
  university_key?: string;
  department_key?: string;
  university_name?: string;
  department_name?: string;
  // admissionResultsQueries.ts의 TrendingDepartmentRow.logo_url이 string | null이다.
  logo_url?: string | null;
  [key: string]: unknown;
}

// Q1 — 대학 목록. 페칭 규율은 AdmissionGuidelines.jsx:1007-1039 그대로:
// `let alive = true` 가드, xxx/xxxLoading/xxxError 3-state, 실패 시 빈 배열 리셋 + 재시도.
// skip: 상세 뷰(딥링크 ?u=&d=)로 바로 진입해 검색 뷰가 렌더조차 안 될 때 호출을 막는다.
export function useSusiUniversities(skip: boolean) {
  const [universities, setUniversities] = useState<UniversityIndexRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) reloadToken은 effect 안에서 읽지 않는 재시도 트리거 전용 카운터다.
  useEffect(() => {
    if (skip) return undefined;

    let alive = true;
    async function load() {
      setLoading(true);
      setError(false);
      const { data, error } = await fetchSusiUniversities();
      if (!alive) return;
      setUniversities(data);
      setError(Boolean(error));
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [reloadToken, skip]);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  return { universities, loading, error, retry };
}

// Q2 — 모집단위 목록 (대학 선택 시). universityKey가 비어 있으면 즉시 빈 목록으로 리셋한다.
export function useSusiDepartments(universityKey: string, skip: boolean) {
  const [departments, setDepartments] = useState<DepartmentIndexRow[]>([]);
  // departments가 실제로 어느 universityKey에 대해 조회된 것인지 표시한다(QA 리뷰 — B3).
  // universityKey가 A→B로 바뀌면 이 훅의 fetch effect는 커밋 이후에야 실행되므로,
  // 그 사이 최소 한 렌더는 "universityKey=B인데 departments는 아직 A의 목록"인 상태가
  // 남는다. 소비처(AdmissionResults.tsx)가 이 지연을 모르고 "departments에 없는
  // department_key"를 즉시 무효로 판단하면, URL 동기화로 university+department를 함께
  // 세팅한 직후 아직 안 갈아치워진 A의 목록을 기준으로 B의 department_key를 오판·제거한다.
  // departmentsKey === universityKey일 때만 departments가 신뢰할 수 있는 스냅샷이다.
  const [departmentsKey, setDepartmentsKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) reloadToken은 effect 안에서 읽지 않는 재시도 트리거 전용 카운터다.
  useEffect(() => {
    if (skip || !universityKey) {
      setDepartments([]);
      setDepartmentsKey(universityKey);
      setError(false);
      setLoading(false);
      return undefined;
    }

    let alive = true;
    async function load() {
      setLoading(true);
      setError(false);
      const { data, error } = await fetchSusiDepartments(universityKey);
      if (!alive) return;
      setDepartments(data);
      setDepartmentsKey(universityKey);
      setError(Boolean(error));
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [universityKey, reloadToken, skip]);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  return { departments, departmentsKey, loading, error, retry };
}

// Q4 — 지금 뜨고 있는 학과. 실패하면 섹션을 통째로 감춘다(부가 정보라 에러 UI를 띄우지 않는다).
// 반환 shape은 위 두 훅(useSusiUniversities/useSusiDepartments)과 통일해
// { trending }으로 감싼다 — loading/error가 없는 건 의도된 설계 차이(에러 UI 없음)지,
// 데이터 자체를 배열로 노출할 이유는 아니다.
export function useTrendingDepartments(skip: boolean) {
  const [trending, setTrending] = useState<TrendingDepartmentRow[]>([]);

  useEffect(() => {
    if (skip) return undefined;

    let alive = true;
    async function load() {
      const { data } = await fetchTrendingDepartments();
      if (!alive) return;
      setTrending(data);
    }
    load();
    return () => {
      alive = false;
    };
  }, [skip]);

  return { trending };
}
