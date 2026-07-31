/**
 * SurveyProgress
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:8975 (잔여 문항 배너, bg #D7D7D7)
 *
 * "N개 문항이 남았어요" 하단 배너. 시안에서 이 배너는 **카드 스택의 형제**로
 * 컬럼 gap 60(3.75rem)을 받는다 — 카드 스택 내부(gap 40)에 두면 안 된다.
 *
 * 시안 실측: 폭 1112(컨테이너 폭 기준) × 60 (3.75rem), bg #D7D7D7, radius 12 (0.75rem),
 *            padding 16·75 (1rem·4.6875rem), 라벨 20px SemiBold #FFFFFF.
 *
 * 남은 문항이 있는 동안은 클릭 대상이 아니라 안내 배너다(`role="status"`).
 * 전 문항 응답 완료(page 5 하단)에서는 제출 CTA(`진단 결과 보기`)로 전환한다 (§9-A4).
 */
export default function SurveyProgress({ remaining, disabled = false, label, onClick }) {
  const bannerClass =
    'flex h-[3.75rem] w-full items-center justify-center rounded-xl px-6 py-4 text-center text-xl font-semibold leading-5 text-white transition-colors duration-150 sm:px-[4.6875rem]';

  if (disabled) {
    return (
      <div role="status" aria-live="polite" className={`${bannerClass} bg-[#D7D7D7]`}>
        {label ?? `${remaining}개 문항이 남았어요`}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${bannerClass} bg-[#013262] hover:bg-[#01274D] active:scale-[0.99] active:bg-[#001C38] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      {label ?? '진단 결과 보기'}
    </button>
  );
}
