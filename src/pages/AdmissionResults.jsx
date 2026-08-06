import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchSusiDepartments,
  fetchSusiUniversities,
  fetchTrendingDepartments
} from '../lib/admissionResultsQueries';
import SearchView from './admissionResults/SearchView';
import { LoadingBlock } from './admissionResults/StateBlocks';
import { CONTAINER, formatDeptCount, formatTrackTags } from './admissionResults/constants';

// 상세 뷰는 검색 화면에서 즉시 필요하지 않고 표·스파크라인까지 들고 있어 무겁다.
// 이 저장소에서 lazy는 Admin(App.jsx:35)만 쓰지만, 여기는 같은 라우트 안의 두 번째 화면이라
// 검색 진입 비용을 늘리지 않기 위해 코드 스플릿한다.
const DetailView = lazy(() => import('./admissionResults/DetailView'));

/**
 * 입결정보 — /admission/results
 *
 * 이 파일은 셸이다: 쿼리스트링으로 검색/상세 뷰를 스위치하고, 검색 뷰가 쓰는
 * Q1(대학 목록)·Q2(모집단위 목록)·Q4(뜨고 있는 학과)를 페칭한다.
 * 순수 집계는 src/lib/admissionResults.js, 조회는 src/lib/admissionResultsQueries.js가 담당한다.
 *
 * 라우팅(명세 §2.1): 하위 라우트를 만들지 않고 `?u=<university_key>&d=<department_key>`로
 * 상세 상태를 표현한다. src/App.jsx:112-113의 catch-all(/admission/:category)과 충돌하지 않고,
 * 한글 키 경로 인코딩 문제도 피하며, 조회 결과 URL이 공유·북마크 가능해진다.
 * ※ useSearchParams는 이 저장소 첫 사용이다(기존 AdmissionBoard는 useLocation pathname 파싱).
 *
 * 헤더/푸터는 SiteLayout이 렌더한다 — 이 페이지는 개별 import하지 않는다.
 *
 * 페칭 규율은 AdmissionGuidelines.jsx:1007-1039 그대로: `let alive = true` 가드,
 * 리소스별 xxx/xxxLoading/xxxError 3-state, 실패 시 빈 배열 리셋 + 재시도 버튼.
 */
export default function AdmissionResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const detailUniversityKey = searchParams.get('u') ?? '';
  const detailDepartmentKey = searchParams.get('d') ?? '';
  const isDetail = Boolean(detailUniversityKey && detailDepartmentKey);

  // 선택 상태는 키만 들고 있고, 표시 라벨은 목록에서 파생한다.
  // 딥링크(?u=&d=)로 들어왔다가 검색으로 돌아와도 셀렉터가 채워져 있게 쿼리에서 씨앗을 받는다.
  const [universityKey, setUniversityKey] = useState(detailUniversityKey);
  const [departmentKey, setDepartmentKey] = useState(detailDepartmentKey);
  const [openField, setOpenField] = useState(null);

  const [universities, setUniversities] = useState([]);
  const [universitiesLoading, setUniversitiesLoading] = useState(true);
  const [universitiesError, setUniversitiesError] = useState(false);
  const [universitiesReloadToken, setUniversitiesReloadToken] = useState(0);

  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [departmentsError, setDepartmentsError] = useState(false);
  const [departmentsReloadToken, setDepartmentsReloadToken] = useState(0);

  const [trending, setTrending] = useState([]);

  const detailRef = useRef(null);

  // Q1 — 대학 목록
  // isDetail 가드: 딥링크(?u=&d=)로 바로 상세에 진입해도 검색 뷰 전용 목록 쿼리가
  // 무조건 실행되던 문제(SearchView는 렌더조차 안 되는데 응답을 기다림)를 막는다.
  // isDetail이 나중에 false로 바뀌면(onBack) 그때 다시 실행된다.
  useEffect(() => {
    if (isDetail) return undefined;

    let alive = true;
    async function loadUniversities() {
      setUniversitiesLoading(true);
      setUniversitiesError(false);
      const { data, error } = await fetchSusiUniversities();
      if (!alive) return;
      setUniversities(data);
      setUniversitiesError(Boolean(error));
      setUniversitiesLoading(false);
    }
    loadUniversities();
    return () => {
      alive = false;
    };
  }, [universitiesReloadToken, isDetail]);

  // Q2 — 모집단위 목록 (대학 선택 시)
  useEffect(() => {
    if (isDetail || !universityKey) {
      setDepartments([]);
      setDepartmentsError(false);
      setDepartmentsLoading(false);
      return undefined;
    }

    let alive = true;
    async function loadDepartments() {
      setDepartmentsLoading(true);
      setDepartmentsError(false);
      const { data, error } = await fetchSusiDepartments(universityKey);
      if (!alive) return;
      setDepartments(data);
      setDepartmentsError(Boolean(error));
      setDepartmentsLoading(false);
    }
    loadDepartments();
    return () => {
      alive = false;
    };
  }, [universityKey, departmentsReloadToken, isDetail]);

  // Q4 — 지금 뜨고 있는 학과. 실패하면 섹션을 통째로 감춘다(부가 정보라 에러 UI를 띄우지 않는다).
  useEffect(() => {
    if (isDetail) return undefined;

    let alive = true;
    async function loadTrending() {
      const { data } = await fetchTrendingDepartments();
      if (!alive) return;
      setTrending(data);
    }
    loadTrending();
    return () => {
      alive = false;
    };
  }, [isDetail]);

  const universityOptions = useMemo(
    () =>
      universities.map((row) => ({
        key: row.university_key,
        label: row.university_name || row.university_key,
        meta: formatDeptCount(row.dept_count)
      })),
    [universities]
  );

  const departmentOptions = useMemo(
    () =>
      departments.map((row) => ({
        key: row.department_key,
        label: row.department_name || row.department_key,
        meta: formatTrackTags(row.tracks)
      })),
    [departments]
  );

  const trendingItems = useMemo(
    () =>
      trending.map((row, index) => ({
        key: `${row.university_key ?? 'x'}:${row.department_key ?? 'x'}:${index}`,
        label: `${row.university_name ?? ''} ${row.department_name ?? ''}`.trim(),
        universityKey: row.university_key ?? '',
        departmentKey: row.department_key ?? '',
        logoUrl: row.logo_url ?? ''
      })),
    [trending]
  );

  // 목록이 아직 없어도(딥링크 직후) 필드에 키라도 보여 준다.
  const university = useMemo(() => {
    if (!universityKey) return null;
    return (
      universityOptions.find((option) => option.key === universityKey) ?? {
        key: universityKey,
        label: universityKey
      }
    );
  }, [universityKey, universityOptions]);

  const department = useMemo(() => {
    if (!departmentKey) return null;
    return (
      departmentOptions.find((option) => option.key === departmentKey) ?? {
        key: departmentKey,
        label: departmentKey
      }
    );
  }, [departmentKey, departmentOptions]);

  // 대학을 바꾸면 모집단위 선택을 반드시 비운다
  // (AdmissionGuidelines.jsx:1257-1280 필터 초기화 규율과 동일).
  const handleSelectUniversity = useCallback((option) => {
    setUniversityKey(option.key);
    setDepartmentKey('');
  }, []);

  const handleSelectDepartment = useCallback((option) => {
    setDepartmentKey(option.key);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!universityKey || !departmentKey) return;
    setOpenField(null);
    setSearchParams({ u: universityKey, d: departmentKey });
  }, [universityKey, departmentKey, setSearchParams]);

  const handleSelectTrending = useCallback(
    (item) => {
      if (!item.universityKey || !item.departmentKey) return;
      setUniversityKey(item.universityKey);
      setDepartmentKey(item.departmentKey);
      setOpenField(null);
      setSearchParams({ u: item.universityKey, d: item.departmentKey });
    },
    [setSearchParams]
  );

  const handleBackToSearch = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  // ScrollToTop(src/App.jsx:50)은 pathname 변경에만 반응하므로 쿼리 전환 시 스크롤이 남는다.
  // 상세로 넘어갈 때만 상세 영역 상단으로 직접 옮긴다(AdmissionGuidelines.jsx:1286-1289 규율).
  useEffect(() => {
    if (!isDetail) return;
    detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [isDetail, detailUniversityKey, detailDepartmentKey]);

  const selector = {
    university,
    department,
    universityOptions,
    departmentOptions,
    universityLoading: universitiesLoading,
    universityError: universitiesError,
    departmentLoading: departmentsLoading,
    departmentError: departmentsError,
    onRetryUniversities: () => setUniversitiesReloadToken((token) => token + 1),
    onRetryDepartments: () => setDepartmentsReloadToken((token) => token + 1),
    openField,
    onOpenFieldChange: setOpenField,
    onSelectUniversity: handleSelectUniversity,
    onSelectDepartment: handleSelectDepartment,
    onSubmit: handleSubmit
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="pt-16">
        {isDetail ? (
          <div ref={detailRef} className="scroll-mt-24">
            {/* DetailView는 uncontrolled 모드로 쓴다 — Q3(fetchSusiResultRows) 페칭과
                buildDetailModel 집계를 자기가 수행한다. 셸은 쿼리스트링 파싱과 뷰 스위치,
                그리고 로딩 중 히어로에 쓸 이름 폴백만 넘긴다. */}
            <Suspense
              fallback={
                <section className={`${CONTAINER} pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pt-[6.25rem]`}>
                  <LoadingBlock />
                </section>
              }
            >
              <DetailView
                universityKey={detailUniversityKey}
                departmentKey={detailDepartmentKey}
                universityName={university?.label ?? ''}
                departmentName={department?.label ?? ''}
                onBack={handleBackToSearch}
              />
            </Suspense>
          </div>
        ) : (
          <SearchView
            selector={selector}
            trending={trendingItems}
            onSelectTrending={handleSelectTrending}
          />
        )}
      </main>

      {/* 페이지 전용 CSS는 JSX 끝 <style> 블록 관례(AdmissionGuidelines.jsx:1616~). */}
      <style>{`
        .ar-popover-scroll {
          scrollbar-width: thin;
          scrollbar-color: #d7d7d7 transparent;
        }
        .ar-popover-scroll::-webkit-scrollbar {
          width: 0.625rem;
        }
        .ar-popover-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .ar-popover-scroll::-webkit-scrollbar-thumb {
          background: #d7d7d7;
          border-radius: 6.25rem;
        }
      `}</style>
    </div>
  );
}
