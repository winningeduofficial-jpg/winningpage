/**
 * 성실도 배너(F-15) — 리포트 **최상단**(A4 시트 1장 위, 시트 밖) 화면 전용 경고.
 *
 * 자리가 최상단이어야 하는 이유: '이번 결과는 실제 상태와 다를 수 있다'는 경고가 리포트 2장을
 * 다 읽은 뒤에 나오면 아무 기능도 하지 못한다. 시트 안 최상단이 아니라 시트 **밖**인 이유는
 * 승인된 A4 레이아웃의 첫 요소(페이지 라벨)를 밀어내지 않기 위해서다.
 *
 * UI 계약은 message 문자열 하나다 — 판정 임계(엔진 sincerityOf)를 UI 가 알지 않는다.
 * 오탐이 보고되면 되돌릴 곳이 엔진 상수 한 곳이어야 한다. 문구가 없으면 빈 배너를 그리지 않는다.
 *
 * 문구는 문구집 05_구간_공통 원문 그대로 쓰고 재작성하지 마라 — '실제 상태와 다를 수 있습니다'는
 * 06_금지어 '진단·낙인'을 피하려고 고른 표현이다(학생을 비난하지 않는다).
 */
type ReportSincerityBannerProps = {
  message?: string | null;
};

export default function ReportSincerityBanner({
  message,
}: ReportSincerityBannerProps) {
  if (!message) return null;

  /*
   * 색은 StatusBadge 의 amber 쌍(bg rgba(255,233,155,0.8) / text #736123)을 그대로 쓴다 —
   * 이 리포트에서 '주의'를 뜻하는 이미 승인된 표면이라 새 색을 만들지 않는다.
   * 결정문은 왼쪽 한 변만 굵은 색 보더를 지정했으나, 흰 카드(시트) 위 문서에서 그 형태는
   * 표면이 아니라 장식으로 읽힌다 → 같은 색 계열의 옅은 면 + 1px 테두리로 바꿨다
   * (색 출처·위계·경고 강도는 동일, 장식만 뺐다).
   */
  return (
    <section className="fd-screen-only w-full max-w-[70rem] rounded-xl border border-[#736123]/40 bg-[rgba(255,233,155,0.35)] px-5 py-4">
      <p className="break-keep text-base leading-[1.5] text-[#525252]">
        {message}
      </p>
    </section>
  );
}
