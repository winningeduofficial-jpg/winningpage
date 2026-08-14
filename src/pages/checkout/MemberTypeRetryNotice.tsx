// 로그인 사용자의 member_type 조회가 실패했을 때(useMemberType 의 error)
// /checkout·/pricing 양쪽에서 재사용하는 재시도 안내. BlockedMemberNotice와
// 레이아웃·톤을 맞춘다(같은 결제 진입 분기라 시각이 갈리면 안 된다) — 다만
// 이 화면은 "회원 유형이 확정된 차단"이 아니라 "조회 자체가 실패한 일시
// 오류"라 재시도 기회를 준다(팀 리드 지시, 2026-08-12 — 조회 실패와
// member_type=NULL 을 같은 차단 문구로 묶으면 일시적 오류까지 "회원 정보를
// 완성해 달라"고 안내해 사용자를 오도한다).
//
// 문구 — "잠시 후 다시 시도해 주세요."/"다시 시도"는 이 화면 전용 신규
// 문구가 아니다. PricingSelling.jsx·StudentEnrollmentRequest.jsx 가 이미
// 상품 조회 실패 시 쓰는 동일 코퍼스를 그대로 재사용한다(신규 문구는
// 제목 한 줄뿐 — new_copy 목록 참고).
type MemberTypeRetryNoticeProps = {
  onRetry?: () => void;
};

export default function MemberTypeRetryNotice({
  onRetry,
}: MemberTypeRetryNoticeProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white pt-16 text-center">
      <h1 className="text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink sm:text-[2rem]">
        회원 정보를 불러오지 못했어요
      </h1>
      <p className="mt-3 text-[0.875rem] font-normal leading-[1.375rem] text-ink-sub sm:text-[1rem]">
        잠시 후 다시 시도해 주세요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-8 rounded-xl bg-primary px-8 py-3.5 text-[0.875rem] font-semibold leading-[1.25rem] text-white transition hover:brightness-125"
      >
        다시 시도
      </button>
    </main>
  );
}
