import { Link, useSearchParams } from "react-router-dom";

export default function PaymentFail() {
  const [params] = useSearchParams();
  const code = params.get("code");
  const message = params.get("message");

  // 시안에 결제 실패 프레임이 없어 문구·구성은 코드 정본을 유지하고 팔레트·타입만 정리했다.
  // 배경은 결제 플로우 3화면(상품선택/주문서/주문완료)과 동일한 흰색으로 통일하고,
  // 임의 slate 계열을 토큰으로 치환한다. 실패 사유는 사용자 귀책(취소)인 경우가 많아
  // error(#eb2626) 로 붉게 강조하지 않는다(이모지도 제거).
  //
  // 타입 스케일 — 시안이 없으므로 주문서(3437:2974 / 1882:13552) 실측 스케일에서만 고른다.
  // · H1: 주문서 H1(390 32 / 1920 50)을 카드 폭 650px 화면에 그대로 쓰면 과하므로,
  //   사이트 지배 헤딩인 섹션 H2 스케일(390 24 / 1920 32, w600 lh1.4 ls-0.02em)로 한 단
  //   낮춰 빈 장바구니 화면(Checkout.jsx)과 동일하게 맞췄다. 색은 본문 기본 ink(#525252) —
  //   ink.title(#181d24)은 시안이 실제로 그 색을 쓴 로그인 H1 전용이라 여기서는 쓰지 않는다.
  // · 본문: 주문서 상품 설명문 16px w400 lh22, 390 은 한 단 아래 14px.
  // · 오류코드: 주문서 최소 크기 12px w400 #808080(= ink.sub).
  // · CTA: 주문서 CTA 와 동일한 390 14 / 1920 20 w600, 배경 primary.
  //
  // 셸: SiteLayout 안(헤더 fixed 4rem)이라 PaymentSuccess 와 같은 관용구를 쓴다 —
  // 바깥 main 은 min-h-screen + pt-16(=4rem, 헤더 높이 보정), 수직 센터링은
  // min-h-[60vh] 인 안쪽 블록이 맡는다. main 자체에 justify-center 를 두면
  // 헤더 보정분(4rem)만큼 넘쳐서 푸터가 밀리고 스크롤이 생긴다.
  // 콘텐츠 폭은 완료 화면 카드와 동일한 650px(=40.625rem)로 맞춰 형제로 보이게 한다.
  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 py-12 text-center sm:px-6 sm:py-16">
        <div className="mx-auto w-full max-w-[40.625rem]">
          <h1 className="text-[1.5rem] font-semibold leading-[1.4] tracking-[-0.02em] text-ink sm:text-[2rem]">
            결제 실패
          </h1>
          <p className="mt-3 break-keep text-[0.875rem] font-normal leading-[1.375rem] text-ink sm:text-[1rem]">
            {message ?? "결제가 취소되었거나 실패했습니다."}
          </p>
          {code && (
            <p className="mt-1 text-[0.75rem] font-normal leading-[1.4] text-ink-sub">
              오류코드: {code}
            </p>
          )}

          <Link
            to="/pricing"
            className="mt-8 inline-block rounded-xl bg-primary px-6 py-3 text-[0.875rem] font-semibold leading-[1.25rem] text-white transition hover:brightness-125 sm:text-[1.25rem] sm:leading-[1.75rem]"
          >
            다시 시도하기
          </Link>
        </div>
      </div>
    </main>
  );
}
