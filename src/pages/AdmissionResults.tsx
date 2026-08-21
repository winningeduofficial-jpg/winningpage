import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router";
import type { ComboOption } from "./admissionResults/ComboField";
import {
  CONTAINER,
  formatDeptCount,
  formatTrackTags,
} from "./admissionResults/constants";
import SearchView from "./admissionResults/SearchView";
import { LoadingBlock } from "./admissionResults/StateBlocks";
import {
  useSusiDepartments,
  useSusiUniversities,
  useTrendingDepartments,
} from "./admissionResults/useSusiIndexes";

// SearchView.tsx(수정 범위 밖)의 로컬(비export) TrendingItem과 구조가 같은
// 이 셸 전용 사본이다 — export되지 않은 타입이라 import할 수 없다.
interface TrendingItem {
  key: string;
  label: string;
  // trendingItems 계산부(.filter 뒤 .map)가 string | undefined 필드를 그대로
  // 실어 보낸다 — exactOptionalPropertyTypes라 옵셔널 표기만으로는 안 받아진다.
  universityKey?: string | undefined;
  departmentKey?: string | undefined;
  logoUrl?: string;
}

// 상세 뷰는 검색 화면에서 즉시 필요하지 않고 표·스파크라인까지 들고 있어 무겁다.
// 이 저장소에서 lazy는 Admin(App.jsx:35)만 쓰지만, 여기는 같은 라우트 안의 두 번째 화면이라
// 검색 진입 비용을 늘리지 않기 위해 코드 스플릿한다.
const DetailView = lazy(() => import("./admissionResults/DetailView"));

// 쿼리스트링에서 읽은 키 1개를 DB 키 표기(NFC · 앞뒤 공백 없음)로 맞춘다.
function normalizeParamKey(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFC")
    .trim();
}

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
  // 키는 한글이다(Q3 확정). URLSearchParams가 직렬화/역직렬화를 대칭으로 처리하므로
  // `?u=건국대(글로컬)&d=기계·로봇·자동차공학부`는 percent-encoding 왕복이 깨지지 않는다.
  // 다만 macOS에서 복사한 주소는 한글이 NFD로 분해돼 오는 경우가 있어(키는 NFC 정본)
  // 읽는 지점에서 한 번 NFC로 접는다 — 이걸 빼면 눈에 같아 보이는 링크가 빈 상세로 떨어진다.
  // 그 밖의 잘못된 키는 Q3가 0행을 돌려주고 DetailView의 DetailEmptyBlock
  // ("다른 모집단위 선택하기")이 받는다.
  const detailUniversityKey = normalizeParamKey(searchParams.get("u"));
  const detailDepartmentKey = normalizeParamKey(searchParams.get("d"));
  const isDetail = Boolean(detailUniversityKey && detailDepartmentKey);

  // 선택 상태는 키만 들고 있고, 표시 라벨은 목록에서 파생한다.
  // 딥링크(?u=&d=)로 들어왔다가 검색으로 돌아와도 셀렉터가 채워져 있게 쿼리에서 씨앗을 받는다.
  const [universityKey, setUniversityKey] = useState(detailUniversityKey);
  const [departmentKey, setDepartmentKey] = useState(detailDepartmentKey);
  const [openField, setOpenField] = useState<string | null>(null);

  const detailRef = useRef<HTMLDivElement>(null);

  // QA 시트 반영으로 SearchView(폼)가 이제 isDetail 여부와 무관하게 항상 렌더된다
  // (조회 결과는 폼 아래에 이어 붙는다) — 그래서 목록 쿼리도 더 이상 isDetail로
  // skip하지 않는다. 예전엔 딥링크(?u=&d=)로 바로 상세에 진입하면 SearchView 자체가
  // 렌더조차 안 됐기 때문에 skip이 의미가 있었다.
  const {
    universities,
    loading: universitiesLoading,
    error: universitiesError,
    retry: retryUniversities,
  } = useSusiUniversities(false);

  const {
    departments,
    loading: departmentsLoading,
    error: departmentsError,
    retry: retryDepartments,
  } = useSusiDepartments(universityKey, false);

  // 실패하면 섹션을 통째로 감춘다(부가 정보라 에러 UI를 띄우지 않는다).
  const { trending } = useTrendingDepartments(false);

  const universityOptions = useMemo(
    () =>
      universities.map((row) => ({
        key: row.university_key,
        label: row.university_name || row.university_key,
        meta: formatDeptCount(row.dept_count),
      })),
    [universities],
  );

  const departmentOptions = useMemo(
    () =>
      departments.map((row) => ({
        key: row.department_key,
        label: row.department_name || row.department_key,
        meta: formatTrackTags(row.tracks),
      })),
    [departments],
  );

  const universityKeySet = useMemo(
    () => new Set(universities.map((row) => row.university_key)),
    [universities],
  );
  const universitiesUnavailable =
    universitiesLoading || universitiesError || universityKeySet.size === 0;

  // 큐레이션 칩(trending_departments)은 키 체계가 슬러그 → 한글(Q3 확정)로 바뀌기 전에
  // 입력된 행이 남아 있을 수 있다. 키가 살아 있는지 보지 않고 존재만 확인하면
  // 눌러도 빈 상세로 떨어지는 칩이 정상 칩처럼 보이므로, 대학 인덱스에 없는 키는 칩째 내린다.
  // 모집단위 키까지는 여기서 못 본다(대학별 추가 조회가 필요) — 그쪽은 상세 화면의
  // DetailEmptyBlock("다른 모집단위 선택하기")이 받는다.
  // 목록 로딩 중에는 아예 렌더하지 않는다. 먼저 그렸다가 걷어내면 깜빡임이 되고,
  // 트렌딩은 부가 정보라 조금 늦게 나타나는 편이 낫다.
  const trendingItems = useMemo(() => {
    if (universitiesUnavailable) return [];
    return trending
      .filter(
        (row) =>
          row.university_key &&
          row.department_key &&
          universityKeySet.has(row.university_key),
      )
      .map((row, index) => ({
        key: `${row.university_key}:${row.department_key}:${index}`,
        label:
          `${row.university_name ?? ""} ${row.department_name ?? ""}`.trim(),
        universityKey: row.university_key,
        departmentKey: row.department_key,
        logoUrl: row.logo_url ?? "",
      }));
  }, [trending, universityKeySet, universitiesUnavailable]);

  // 목록이 아직 없어도(딥링크 직후) 필드에 키라도 보여 준다.
  const university = useMemo(() => {
    if (!universityKey) return null;
    return (
      universityOptions.find((option) => option.key === universityKey) ?? {
        key: universityKey,
        label: universityKey,
      }
    );
  }, [universityKey, universityOptions]);

  const department = useMemo(() => {
    if (!departmentKey) return null;
    return (
      departmentOptions.find((option) => option.key === departmentKey) ?? {
        key: departmentKey,
        label: departmentKey,
      }
    );
  }, [departmentKey, departmentOptions]);

  // 목록에 없는 키(수명이 끝난 공유 링크, 손댄 쿼리스트링, 큐레이션에 남은 옛 슬러그)를
  // 그대로 들고 있으면 필드에 정규화 키가 그대로 찍히고 모집단위는 영영 빈 목록이 된다.
  // 목록이 도착한 뒤에만 판정한다 — 로딩 중에는 "없는 키"와 "아직 안 온 키"를 구분할 수 없다.
  useEffect(() => {
    if (universitiesUnavailable) return;
    if (!universityKey || universityKeySet.has(universityKey)) return;
    setUniversityKey("");
    setDepartmentKey("");
  }, [universitiesUnavailable, universityKeySet, universityKey]);

  useEffect(() => {
    if (departmentsLoading || departmentsError || departments.length === 0)
      return;
    if (!departmentKey) return;
    if (departments.some((row) => row.department_key === departmentKey)) return;
    setDepartmentKey("");
  }, [departmentsLoading, departmentsError, departments, departmentKey]);

  // 대학을 바꾸면 모집단위 선택을 반드시 비운다
  // (AdmissionGuidelines.jsx:1257-1280 필터 초기화 규율과 동일).
  const handleSelectUniversity = useCallback((option: ComboOption) => {
    setUniversityKey(option.key);
    setDepartmentKey("");
  }, []);

  const handleSelectDepartment = useCallback((option: ComboOption) => {
    setDepartmentKey(option.key);
  }, []);

  // 입력형 combobox라 "고른 값을 지우는" 경로가 생겼다. 검색어 자체는 ComboField가
  // 들고 있고(셸이 알 필요가 없다), 셸은 선택 해제만 받는다.
  // 대학을 지우면 모집단위도 함께 비운다 — 대학 종속이라 남겨 두면 유령 선택이 된다.
  const handleClearUniversity = useCallback(() => {
    setUniversityKey("");
    setDepartmentKey("");
  }, []);

  const handleClearDepartment = useCallback(() => {
    setDepartmentKey("");
  }, []);

  const handleSubmit = useCallback(() => {
    if (!universityKey || !departmentKey) return;
    setOpenField(null);
    setSearchParams({ u: universityKey, d: departmentKey });
  }, [universityKey, departmentKey, setSearchParams]);

  const handleSelectTrending = useCallback(
    (item: TrendingItem) => {
      if (!item.universityKey || !item.departmentKey) return;
      setUniversityKey(item.universityKey);
      setDepartmentKey(item.departmentKey);
      setOpenField(null);
      setSearchParams({ u: item.universityKey, d: item.departmentKey });
    },
    [setSearchParams],
  );

  const handleBackToSearch = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  // ScrollToTop(src/App.jsx:50)은 pathname 변경에만 반응하므로 쿼리 전환 시 스크롤이 남는다.
  // 상세로 넘어갈 때만 상세 영역 상단으로 직접 옮긴다(AdmissionGuidelines.jsx:1286-1289 규율).
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) detailUniversityKey/detailDepartmentKey는 effect 안에서 읽지 않는 트리거 전용 값 — 상세 대상이 바뀔 때마다 다시 스크롤하기 위한 재실행 신호다.
  useEffect(() => {
    if (!isDetail) return;
    detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
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
    onRetryUniversities: retryUniversities,
    onRetryDepartments: retryDepartments,
    openField,
    onOpenFieldChange: setOpenField,
    onSelectUniversity: handleSelectUniversity,
    onSelectDepartment: handleSelectDepartment,
    onClearUniversity: handleClearUniversity,
    onClearDepartment: handleClearDepartment,
    onSubmit: handleSubmit,
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="pt-16">
        {/* QA 시트(입시정보 카테고리) 반영 — 조회 버튼을 눌러도 페이지를 이동하지 않고
            검색 폼은 그대로 둔 채 그 아래에 결과를 이어 붙인다. 딥링크(?u=&d=) 호환을 위해
            라우트/쿼리스트링 계약은 그대로 유지하고, 뷰를 서로 바꿔치기하던 기존 삼항연산자만
            "폼 + 조건부 결과"로 바꿨다. */}
        <SearchView
          selector={selector}
          trending={trendingItems}
          onSelectTrending={handleSelectTrending}
        />

        {isDetail && (
          <div ref={detailRef} className="scroll-mt-24">
            {/* DetailView는 uncontrolled 모드로 쓴다 — Q3(fetchSusiResultRows) 페칭과
                buildDetailModel 집계를 자기가 수행한다. 셸은 쿼리스트링 파싱과 뷰 스위치,
                그리고 로딩 중 히어로에 쓸 이름 폴백만 넘긴다. */}
            <Suspense
              fallback={
                <section
                  className={`${CONTAINER} pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pt-25`}
                >
                  <LoadingBlock />
                </section>
              }
            >
              {/* key로 대학·모집단위 조합이 바뀔 때마다 새로 마운트해 연속 조회 시
                  이전 결과의 잔여 상태(스크롤·탭 선택 등) 없이 결과가 완전히 교체되게 한다. */}
              <DetailView
                key={`${detailUniversityKey}::${detailDepartmentKey}`}
                universityKey={detailUniversityKey}
                departmentKey={detailDepartmentKey}
                universityName={university?.label ?? ""}
                departmentName={department?.label ?? ""}
                onBack={handleBackToSearch}
              />
            </Suspense>
          </div>
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
