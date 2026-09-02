import { useEffect, useEffectEvent, useState } from "react";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import AddWorkbookModal from "@/components/goal/modals/AddWorkbookModal";
import EffortSubjectCard from "@/components/goal/plan/EffortSubjectCard";
import AddSubjectModal from "@/components/goal/study/AddSubjectModal";
import {
  DEFAULT_TIMER_SUBJECTS,
  TIMER_SUBJECT_CATALOG,
} from "@/components/goal/studyRecordOptions";
import {
  getSubjectLabel,
  WORKBOOK_SUBJECT_IDS,
} from "@/components/goal/subjectTokens";
import {
  addGoalTimerSubject,
  createGoalWorkbook,
  deleteGoalWorkbook,
  fetchGoalTimer,
  fetchGoalWorkbooks,
  updateGoalWorkbook,
} from "@/lib/goalApi";

// 나의 노력(#30 빈 / #32 채움) — docs/figma-goal/part-10.md·part-11.md.
// 실데이터 배선(mockEfforts 제거) — src/data/goalPlanMock.js의 mockEfforts/mockEffortsEmpty는
// 더 이상 이 화면이 쓰지 않는다(디자인 참고용으로만 파일에 남겨둔다, 소비처 재확인 후 정리는
// 이번 범위 밖).
//
// 콘텐츠 폭: 문서 실측(#30/#32)은 1368px(85.5rem)로 GoalPageHeader 기본값(83.75rem/1340px,
// 리포트 화면 기준)보다 넓다(00-INDEX.md §7-2 "컨테이너 폭 불일치 주의"). 기존 primitive를
// 수정하지 않고 maxWidthClassName prop으로 넘길 수 있는 기존 토큰 중 1368px을 여유 있게 담는
// `goal-dashboard`(93rem/1488px)를 대신 채택했다.

// QA 행361 — "+ 과목 추가하기"는 예전엔 문제집 등록 모달(AddWorkbookModal)을 여는 스텁이었다
// (part-10 §253에 별도 모달이 없어 임시로 재사용). 2026-08-31 머지된 열공 타이머(#25)의 과목
// 추가 모달(AddSubjectModal + addGoalTimerSubject, QA B9)이 생기면서 "과목을 추가한다"는
// 진짜 동선이 생겼다 — 이 헤더 버튼을 그쪽으로 옮긴다. 카드 목록도 더 이상 4개 고정이 아니라
// 열공 타이머와 같은 노출 과목 목록(GET /api/goal/timer visibleSubjects)을 그대로 따른다 —
// "타이머에 보이는 과목 = 나의노력에 보이는 과목"으로 두 화면의 과목 개념을 하나로 합친다
// (전에는 이 화면만 별도로 4과목 하드코딩이라 타이머에서 5번째 과목을 추가해도 여기 카드가
// 안 늘어났다). 문제집 등록(카드별 "+ 문제집 추가")은 그대로 AddWorkbookModal을 쓴다 — 그
// 동선은 이번 변경과 무관하다.

// api/_lib/goalRepo.js buildWorkbookPayload() 반환 shape.
type Workbook = {
  id: string | number;
  subject: string;
  title: string;
  // goalApi.ts의 GoalWorkbook과 동일하게 null 가능(서버 실값) — 이 파일에서는 상태 저장과
  // 필터링(subject/status)에만 쓰여 null이어도 안전하다.
  totalPages: number | null;
  currentPage: number | null;
  // api/_lib/goalRepo.js computeWorkbookStatus() 반환값 그대로("in_progress"가 아니라
  // "reading" — 이전 주석이 실제 서버 값과 어긋나 있었다).
  status: "reading" | "done" | string;
};

export default function Efforts() {
  const [modalOpen, setModalOpen] = useState(false);
  const [presetSubject, setPresetSubject] = useState<string | null>(null);
  const [editingWorkbook, setEditingWorkbook] = useState<Workbook | null>(null);
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  // 노출 과목 목록 — GET /api/goal/timer visibleSubjects(열공 타이머와 동일 소스, QA
  // 행361). 로딩 중엔 Timer.tsx와 같은 기본 4과목으로 잠깐 보여준다.
  const [visibleSubjects, setVisibleSubjects] = useState<string[]>(
    DEFAULT_TIMER_SUBJECTS,
  );

  async function loadWorkbooks() {
    const outcome = await fetchGoalWorkbooks();
    if (outcome.kind === "success") {
      setWorkbooks(outcome.workbooks);
      setLoadError(false);
      return;
    }
    // no-session/not-allowed는 RequireGoalAccess가 라우트 진입 전에 이미 걸러낸다
    // (App.jsx:198/318 — 이 페이지는 그 게이트 안쪽에서만 렌더된다). 여기 도달했다면
    // 세션 만료 등 방어적 상황이라 재시도 안내만 하고 화면을 비우지 않는다.
    console.error("[Efforts] 문제집 목록 조회 실패:", outcome);
    setLoadError(true);
  }

  async function loadVisibleSubjects() {
    const result = await fetchGoalTimer();
    if (result.kind === "success" && result.summary?.visibleSubjects?.length) {
      setVisibleSubjects(result.summary.visibleSubjects);
    }
  }

  const onMountLoadWorkbooks = useEffectEvent(() => {
    loadWorkbooks();
    loadVisibleSubjects();
  });

  useEffect(() => {
    onMountLoadWorkbooks();
  }, []);

  const canAddMoreSubjects =
    visibleSubjects.length < TIMER_SUBJECT_CATALOG.length;

  // "나의 노력" 카드는 열공 타이머의 8종 노출 목록이 아니라 goal_workbooks가 실제로
  // 지원하는 5종(WORKBOOK_SUBJECT_IDS)만 그린다 — goal_plan_tasks/goal_subject_targets/
  // goal_timer_sessions 세 테이블만 8종으로 넓어졌고(QA B9) goal_workbooks_subject_check는
  // 그대로 5종이라, 8종 그리드를 그대로 쓰면 6~8번째 카드에서 "+ 문제집 추가" 시 서버가
  // 400을 돌려주는 잠재 결함이 있었다(QA 행298 비고). "+ 과목 추가하기" 버튼(canAddMoreSubjects
  // 등)은 여전히 타이머 8종 카탈로그를 그대로 따른다 — 타이머 노출 여부와 별개로 워크북 카드는
  // 이 5종을 넘지 않는다.
  const cardSubjects = visibleSubjects.filter((id) =>
    WORKBOOK_SUBJECT_IDS.includes(id),
  );

  // AddSubjectModal의 onAdd 계약(Timer.tsx와 동일) — 성공하면 노출 목록을 다시
  // 불러와 카드 그리드를 즉시 갱신한다.
  async function handleAddSubject(subject: string) {
    const result = await addGoalTimerSubject(subject);
    if (result.kind !== "success") {
      throw new Error(`add-subject-failed:${result.kind}`);
    }
    await loadVisibleSubjects();
  }

  function openModal(subjectLabel: string | null) {
    setPresetSubject(subjectLabel ?? null);
    setEditingWorkbook(null);
    setModalOpen(true);
  }

  function openEditModal(book: Workbook) {
    setEditingWorkbook(book);
    setPresetSubject(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setPresetSubject(null);
    setEditingWorkbook(null);
  }

  // AddWorkbookModal의 onSubmit 계약: id가 있으면 진도 수정(PUT), 없으면 신규 등록(POST).
  // false를 돌려주면 모달이 닫히지 않는다(제출 실패 시 입력을 잃지 않도록).
  async function handleModalSubmit({
    id,
    subject,
    title,
    currentPage,
    totalPage,
  }: {
    id?: string | number;
    subject: string;
    title: string;
    currentPage: number;
    totalPage: number;
  }) {
    const outcome = id
      ? await updateGoalWorkbook({
          // GoalWorkbook.id는 항상 DB 숫자 PK다 — 모달이 재사용 목적으로 넓게 잡은
          // string|number 타입만 여기서 좁힌다.
          id: id as number,
          title,
          currentPage,
          totalPages: totalPage,
        })
      : await createGoalWorkbook({
          subject,
          title,
          totalPages: totalPage,
          currentPage,
        });

    if (outcome.kind !== "success") {
      console.error("[Efforts] 문제집 저장 실패:", outcome);
      return false;
    }

    await loadWorkbooks();
    return true;
  }

  // AddWorkbookModal의 onDelete 계약 — deleteGoalWorkbook과 동일하게 실패 시 false를
  // 돌려줘 모달이 닫히지 않게 한다(handleModalSubmit과 동일 규약, QA 행321).
  async function handleDeleteWorkbook(id: string | number) {
    // GoalWorkbook.id는 항상 DB 숫자 PK다(handleModalSubmit의 동일 주석 참고).
    const outcome = await deleteGoalWorkbook(id as number);
    if (outcome.kind !== "success") {
      console.error("[Efforts] 문제집 삭제 실패:", outcome);
      return false;
    }

    await loadWorkbooks();
    return true;
  }

  const totalCompleted = workbooks.filter(
    (book) => book.status === "done",
  ).length;

  return (
    <>
      <GoalPageHeader
        title="나의 노력"
        meta={<CountBadge count={totalCompleted} />}
        subcopy="완독한 책들이 차곡차곡 쌓여갑니다. 성적이 아닌 실행 자체를 봅니다."
        actions={
          // `+ 과목 추가하기` — 열공 타이머(#25)와 같은 AddSubjectModal을 연다(QA 행361).
          // 카탈로그 8종을 이미 다 노출 중이면 더 고를 게 없어 숨긴다(Timer.tsx
          // canAddMoreSubjects와 동일 조건).
          canAddMoreSubjects && (
            <button
              type="button"
              onClick={() => setAddSubjectOpen(true)}
              className="text-[0.875rem] font-medium text-ink-sub underline-offset-2 hover:text-ink-strong hover:underline"
            >
              + 과목 추가하기
            </button>
          )
        }
        maxWidthClassName="max-w-goal-dashboard"
      />

      <div className="max-w-goal-dashboard px-12 pb-24">
        {loadError && (
          <p className="mb-4 text-[0.875rem] text-ink-sub">
            문제집 목록을 불러오지 못했습니다. 새로고침해 주세요.
          </p>
        )}

        <div className="grid grid-cols-4 gap-10">
          {cardSubjects.map((id) => {
            const label = getSubjectLabel(id);
            const subjectBooks = workbooks.filter(
              (book) => book.subject === id,
            );
            // 완독 책은 completed 카운터 + BookStack 시각화(completedBooks) 두 군데서
            // 쓴다(QA 행282).
            const completedBooks = subjectBooks.filter(
              (book) => book.status === "done",
            );
            // 목록은 "등록(공부 중인 책)"만 담는다 — 완독한 책은 completed 카운터/
            // completedBooks로만 세고 진행 중 목록에서는 빠진다(goalPlanMock.js 옛 목업
            // 주석의 등록/완독 분리 규약을 그대로 실데이터에 적용, part-11 §183).
            const registeredBooks = subjectBooks.filter(
              (book) => book.status !== "done",
            );

            return (
              <EffortSubjectCard
                key={id}
                subject={label}
                completed={completedBooks.length}
                books={registeredBooks}
                completedBooks={completedBooks}
                onAddBook={() => openModal(label)}
                onEditBook={openEditModal}
              />
            );
          })}
        </div>
      </div>

      <AddSubjectModal
        open={addSubjectOpen}
        onClose={() => setAddSubjectOpen(false)}
        visibleSubjects={visibleSubjects}
        onAdd={handleAddSubject}
      />

      <AddWorkbookModal
        open={modalOpen}
        onClose={closeModal}
        initialSubject={presetSubject}
        editingWorkbook={editingWorkbook}
        onSubmit={handleModalSubmit}
        onDelete={handleDeleteWorkbook}
      />
    </>
  );
}

// 완독 카운트 뱃지(97×32) — 인스턴스 내부 텍스트라 정확한 HEX가 없어 근사 연보라 톤(추정,
// part-10 §219 "연보라 필 + 보라 텍스트(추정)")을 로컬 상수로 둔다.
function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex h-8 items-center justify-center rounded-full bg-[#EFE9F6] px-3 text-[0.8125rem] font-semibold text-[#6B4FA0]">
      총 {count}권 완독
    </span>
  );
}
