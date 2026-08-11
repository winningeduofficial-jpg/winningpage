import { useEffect, useMemo, useState } from 'react';
// admissionResultsQueries.js(다른 세션 소유, recruitment_period 필터가 새 스키마에서 깨져 있다)를
// 재사용하지 않는다 — diagnosisAdmissionMasterQueries.js 헤더 주석 참고.
import {
  fetchAdmissionUniversities,
  fetchAdmissionDepartments,
  fetchAdmissionTrackRows
} from '../lib/diagnosisAdmissionMasterQueries';
import { fetchAdmissionCuts } from '../lib/diagnosisAdmissionCuts';
import {
  NO_SUBJECT_REFLECTION_LABEL,
  deriveAdmissionTracks,
  deriveMainTracks,
  deriveSubjectReflections
} from '../lib/diagnosisAdmissionCascade';

const EMPTY_RESOURCE = { data: [], loading: false, error: null };

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
 * @returns {{ levels: Array, cuts: object|null, admissionMeta: {year: number}|null }}
 */
export function useAdmissionCascade(cascadeValue) {
  const value = cascadeValue ?? {};
  const [universities, setUniversities] = useState(EMPTY_RESOURCE);
  const [departments, setDepartments] = useState(EMPTY_RESOURCE);
  const [trackRows, setTrackRows] = useState(EMPTY_RESOURCE);
  const [cuts, setCuts] = useState(null);

  // 대학 목록. 셸 마운트 1회.
  useEffect(() => {
    let alive = true;
    setUniversities((prev) => ({ ...prev, loading: true, error: null }));
    fetchAdmissionUniversities().then(({ data, error }) => {
      if (alive) setUniversities({ data, loading: false, error });
    });
    return () => {
      alive = false;
    };
  }, []);

  const universityKey = useMemo(
    () => universities.data.find((u) => u.university_name === value.university)?.university_key ?? null,
    [universities.data, value.university]
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
    () => departments.data.find((d) => d.department_name === value.department)?.department_key ?? null,
    [departments.data, value.department]
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
    fetchAdmissionTrackRows(universityKey, departmentKey).then(({ data, error }) => {
      if (alive) setTrackRows({ data, loading: false, error });
    });
    return () => {
      alive = false;
    };
  }, [universityKey, departmentKey]);

  const mainTrackOptions = useMemo(() => deriveMainTracks(trackRows.data), [trackRows.data]);
  const admissionTrackOptions = useMemo(
    () => deriveAdmissionTracks(trackRows.data, value.admissionType),
    [trackRows.data, value.admissionType]
  );
  const subjectReflectionCandidates = useMemo(
    () => deriveSubjectReflections(trackRows.data, value.admissionType, value.detailType),
    [trackRows.data, value.admissionType, value.detailType]
  );

  // 5단째는 후보 2개 이상일 때만 화면에 묻는다(B-1 확정). 1개뿐이면 그 값을 그대로, 0개면 null 을 쓴다.
  const showSubjectReflectionLevel = subjectReflectionCandidates.length >= 2;
  const rawSubjectReflection = showSubjectReflectionLevel
    ? value.subjectReflection || null
    : subjectReflectionCandidates[0] ?? null;
  // seam(fetchAdmissionCuts)은 DB 원본 의미(값 없음=null)를 받는다 — UI 표시용 대체 라벨을 되돌린다.
  const resolvedSubjectReflection = rawSubjectReflection === NO_SUBJECT_REFLECTION_LABEL ? null : rawSubjectReflection;

  // 최종 컷 조회 — 전형 유형+세부 전형명(+반영교과, 후보 2개 이상이면 그것까지)이 전부 정해지면 1회.
  useEffect(() => {
    const cascadeComplete =
      universityKey &&
      departmentKey &&
      value.admissionType &&
      value.detailType &&
      (!showSubjectReflectionLevel || value.subjectReflection);

    if (!cascadeComplete) {
      setCuts(null);
      return undefined;
    }

    let alive = true;
    fetchAdmissionCuts({
      universityKey,
      departmentKey,
      mainTrack: value.admissionType,
      admissionTrack: value.detailType,
      subjectReflection: resolvedSubjectReflection
    }).then((result) => {
      if (alive) setCuts(result);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    universityKey,
    departmentKey,
    value.admissionType,
    value.detailType,
    value.subjectReflection,
    showSubjectReflectionLevel,
    resolvedSubjectReflection
  ]);

  const levels = useMemo(() => {
    const base = [
      {
        key: 'university',
        label: '대학 선택',
        // 정본 마스터(2026-08-11 교체) university_key 표기가 '건국대학교'가 아니라 '건국대'다
        // (전 대학 접미사 '대학교' 없이 '대'로 통일) — 실측값으로 플레이스홀더를 갱신했다.
        placeholder: '건국대',
        options: universities.data.map((u) => u.university_name),
        loading: universities.loading,
        error: universities.error
      },
      {
        key: 'department',
        label: '학과 또는 모집단위',
        placeholder: '경영학과',
        options: departments.data.map((d) => d.department_name),
        loading: departments.loading,
        error: departments.error
      },
      {
        key: 'admissionType',
        label: '전형 유형',
        // main_track 값도 '학생부종합'이 아니라 '종합'(축약형) — 하드코딩하지 않고 조회 결과를
        // 그대로 쓰지만, 플레이스홀더는 예시 텍스트라 실측값으로 맞춘다.
        placeholder: '종합',
        options: mainTrackOptions,
        loading: trackRows.loading,
        error: trackRows.error
      },
      {
        key: 'detailType',
        label: '세부 전형명',
        placeholder: '일반전형',
        options: admissionTrackOptions,
        loading: trackRows.loading,
        error: trackRows.error
      }
    ];

    if (showSubjectReflectionLevel) {
      base.push({
        key: 'subjectReflection',
        label: '반영교과/영역',
        placeholder: '국어·영어·수학',
        options: subjectReflectionCandidates,
        loading: trackRows.loading,
        error: trackRows.error
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
    trackRows.error
  ]);

  return { levels, cuts, admissionMeta: cuts ? { year: cuts.year } : null };
}
