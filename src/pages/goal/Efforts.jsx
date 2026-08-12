import { useState } from 'react';
import GoalPageHeader from '../../components/goal/GoalPageHeader';
import EffortSubjectCard from '../../components/goal/plan/EffortSubjectCard';
import AddWorkbookModal from '../../components/goal/modals/AddWorkbookModal';
import { mockEfforts } from '../../data/goalPlanMock';

// 나의 노력(#30 빈 / #32 채움) — docs/figma-goal/part-10.md·part-11.md.
// mockEfforts는 이 3화면 전용 신규 목업이라 src/data/goalPlanMock.js에 두었다(goalMock.js는
// 읽기 전용). 빈 상태(총 0권) 데모는 goalPlanMock.js의 mockEffortsEmpty를 대신 넘기면 된다 —
// EffortSubjectCard는 books:[] 를 이미 처리한다(칩 영역이 비고 선반만 남는 구조).
//
// 콘텐츠 폭: 문서 실측(#30/#32)은 1368px(85.5rem)로 GoalPageHeader 기본값(83.75rem/1340px,
// 리포트 화면 기준)보다 넓다(00-INDEX.md §7-2 "컨테이너 폭 불일치 주의"). 기존 primitive를
// 수정하지 않고 maxWidthClassName prop으로 넘길 수 있는 기존 토큰 중 1368px을 여유 있게 담는
// `goal-dashboard`(93rem/1488px)를 대신 채택했다.
export default function Efforts() {
  const [modalOpen, setModalOpen] = useState(false);
  const [presetSubject, setPresetSubject] = useState(null);

  function openModal(subject) {
    setPresetSubject(subject ?? null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setPresetSubject(null);
  }

  return (
    <>
      <GoalPageHeader
        title="나의 노력"
        meta={<CountBadge count={mockEfforts.totalCompleted} />}
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
        <div className="grid grid-cols-4 gap-[2.5rem]">
          {mockEfforts.subjects.map((item) => (
            <EffortSubjectCard
              key={item.subject}
              subject={item.subject}
              completed={item.completed}
              books={item.books}
              onAddBook={() => openModal(item.subject)}
            />
          ))}
        </div>
      </div>

      <AddWorkbookModal open={modalOpen} onClose={closeModal} initialSubject={presetSubject} />
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
