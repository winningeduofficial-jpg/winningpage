import { Link, useSearchParams } from 'react-router-dom';

export default function PaymentFail() {
  const [params] = useSearchParams();
  const code = params.get('code');
  const message = params.get('message');

  // 시안에 결제 실패 프레임이 없어 문구·구성은 코드 정본을 유지하고 팔레트만 정리했다.
  // 배경은 결제 플로우 3화면(상품선택/주문서/주문완료)과 동일한 흰색으로 통일하고,
  // 임의 slate 계열을 토큰으로 치환한다 — 타이틀 ink.title, 본문 ink, 보조 ink.sub,
  // CTA 는 브랜드 네이비 primary. 실패 사유는 사용자 귀책(취소)인 경우가 많아
  // error(#eb2626) 로 붉게 강조하지 않는다(이모지도 제거).
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
          <h1 className="text-3xl font-black tracking-[-0.02em] text-ink-title">결제 실패</h1>
          <p className="mt-3 break-keep text-ink">{message ?? '결제가 취소되었거나 실패했습니다.'}</p>
          {code && <p className="mt-1 text-xs text-ink-sub">오류코드: {code}</p>}

          <Link
            to="/pricing"
            className="mt-8 inline-block rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white transition hover:brightness-125"
          >
            다시 시도하기
          </Link>
        </div>
      </div>
    </main>
  );
}
