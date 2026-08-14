import GoalPageHeader from "../../components/goal/GoalPageHeader";

// 내 정보 수정 — 사이드바 하단 유틸 링크 대상. 시안 프레임 없음(docs/figma-goal §7-3 라우트 제안
// 기준 신규 라우트). 다음 단계에서 학생 정보·목표 재입력 폼으로 채운다.
export default function Profile() {
  return (
    <>
      <GoalPageHeader
        title="내 정보 수정"
        subcopy="학생 정보와 목표 설정을 관리합니다."
      />
      <div className="max-w-goal-content px-[3rem] pb-24">
        <div className="rounded-2xl border border-dashed border-line bg-surface-04 px-6 py-20 text-center text-sm leading-[1.6] text-ink-sub">
          이 화면은 준비 중입니다.
        </div>
      </div>
    </>
  );
}
