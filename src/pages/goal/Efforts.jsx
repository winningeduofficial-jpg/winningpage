import { useEffect, useState } from "react";
import GoalPageHeader from "../../components/goal/GoalPageHeader";
import EffortSubjectCard from "../../components/goal/plan/EffortSubjectCard";
import AddWorkbookModal from "../../components/goal/modals/AddWorkbookModal";
import {
  createGoalWorkbook,
  fetchGoalWorkbooks,
  updateGoalWorkbook,
} from "../../lib/goalApi";

// 나의 노력(#30 빈 / #32 채움) — docs/figma-goal/part-10.md·part-11.md.
// 실데이터 배선(mockEfforts 제거) — src/data/goalPlanMock.js의 mockEfforts/mockEffortsEmpty는
// 더 이상 이 화면이 쓰지 않는다(디자인 참고용으로만 파일에 남겨둔다, 소비처 재확인 후 정리는
// 이번 범위 밖).
//
// 콘텐츠 폭: 문서 실측(#30/#32)은 1368px(85.5rem)로 GoalPageHeader 기본값(83.75rem/1340px,
// 리포트 화면 기준)보다 넓다(00-INDEX.md §7-2 "컨테이너 폭 불일치 주의"). 기존 primitive를
// 수정하지 않고 maxWidthClassName prop으로 넘길 수 있는 기존 토큰 중 1368px을 여유 있게 담는
// `goal-dashboard`(93rem/1488px)를 대신 채택했다.

// 카드 4장의 과목 정본. subjectTokens.js KNOWN_SUBJECT_IDS 5종 중 "기타(etc)"는 이 화면에
// 카드가 없다 — 헤더 "+ 과목 추가하기"가 5번째 이후 과목 카드를 늘리는 동선인데 시안에 그
// 모달이 따로 없어 기존부터 스텁 처리돼 있었고(part-10 §253), 이번 범위는 그 스텁을 그대로
// 둔 채 기존 4카드 배선만 실데이터로 바꾼다(범위 확대 아님).
const SUBJECT_CARDS = [
  { id: "korean", label: "국어" },
  { id: "math", label: "수학" },
  { id: "english", label: "영어" },
  { id: "science", label: "탐구" },
];

export default function Efforts() {
  const [modalOpen, setModalOpen] = useState(false);
  const [presetSubject, setPresetSubject] = useState(null);
  const [editingWorkbook, setEditingWorkbook] = useState(null);
  const [workbooks, setWorkbooks] = useState([]);
  const [loadError, setLoadError] = useState(false);

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

  useEffect(() => {
    loadWorkbooks();
  }, []);

  function openModal(subjectLabel) {
    setPresetSubject(subjectLabel ?? null);
    setEditingWorkbook(null);
    setModalOpen(true);
  }

  function openEditModal(book) {
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
  }) {
    const outcome = id
      ? await updateGoalWorkbook({
          id,
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
          // `+ 과목 추가하기`(5번째 이후 과목 카드 추가) — 시안에 별도 모달이 없어 스텁 처리한다.
          // 이번 범위 문제집 등록 모달(AddWorkbookModal)만 재사용해 연다(추정, part-10 §253).
          <button
            type="button"
            onClick={() => openModal(null)}
            className="text-[0.875rem] font-medium text-ink-sub underline-offset-2 hover:text-ink-strong hover:underline"
          >
            + 과목 추가하기
          </button>
        }
        maxWidthClassName="max-w-goal-dashboard"
      />

      <div className="max-w-goal-dashboard px-[3rem] pb-24">
        {loadError && (
          <p className="mb-4 text-[0.875rem] text-ink-sub">
            문제집 목록을 불러오지 못했습니다. 새로고침해 주세요.
          </p>
        )}

        <div className="grid grid-cols-4 gap-[2.5rem]">
          {SUBJECT_CARDS.map(({ id, label }) => {
            const subjectBooks = workbooks.filter(
              (book) => book.subject === id,
            );
            const completed = subjectBooks.filter(
              (book) => book.status === "done",
            ).length;
            // 칩 리스트는 "등록(공부 중인 책)"만 담는다 — 완독한 책은 completed 카운터로만
            // 세고 칩 목록에서는 빠진다(goalPlanMock.js 옛 목업 주석의 등록/완독 분리 규약을
            // 그대로 실데이터에 적용, part-11 §183).
            const registeredBooks = subjectBooks.filter(
              (book) => book.status !== "done",
            );

            return (
              <EffortSubjectCard
                key={id}
                subject={label}
                completed={completed}
                books={registeredBooks}
                onAddBook={() => openModal(label)}
                onEditBook={openEditModal}
              />
            );
          })}
        </div>
      </div>

      <AddWorkbookModal
        open={modalOpen}
        onClose={closeModal}
        initialSubject={presetSubject}
        editingWorkbook={editingWorkbook}
        onSubmit={handleModalSubmit}
      />
    </>
  );
}

// 완독 카운트 뱃지(97×32) — 인스턴스 내부 텍스트라 정확한 HEX가 없어 근사 연보라 톤(추정,
// part-10 §219 "연보라 필 + 보라 텍스트(추정)")을 로컬 상수로 둔다.
function CountBadge({ count }) {
  return (
    <span className="inline-flex h-[2rem] items-center justify-center rounded-full bg-[#EFE9F6] px-3 text-[0.8125rem] font-semibold text-[#6B4FA0]">
      총 {count}권 완독
    </span>
  );
}
