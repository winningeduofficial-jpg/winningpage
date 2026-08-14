// #11(1920×1730 전면 딤) 구현 — docs/figma-goal/part-04.md #11. 시안엔 딤만 있고 로딩 문구・
// 인디케이터가 없어 신규 정의했다(작업 지시 §확정 사항 3, 추정): 7단계 "다음" 클릭 후 이 딤을
// "학습량 계산 중" 로딩으로 간주해 잠깐 띄운 뒤 대시보드로 이동한다.
// 시안 그대로라면 모달 백드롭일 가능성도 있었으나(part-04 #11 "상태/인터랙션" 두 해석 중 택1),
// 결과/확인 화면이 없고 CTA가 "완료"가 아닌 "다음"인 점을 근거로 계산 로딩으로 확정했다.
// 짧은 전환용 로딩 화면이라 포커스 트랩까지는 과함 — pointer-events만 전부 막는다.
export default function OnboardingCalculatingOverlay() {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-[1rem] bg-[#191D23]/45 backdrop-blur-[1px]"
    >
      <div className="h-[2.5rem] w-[2.5rem] animate-spin rounded-full border-[0.25rem] border-white/40 border-t-white" />
      <p className="text-[1.125rem] font-semibold text-white">
        학습량을 계산하고 있어요
      </p>
      <p className="text-[0.8125rem] text-white/70">
        입력하신 정보로 목표 학습 시간을 산출하는 중이에요
      </p>
    </div>
  );
}
