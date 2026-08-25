import type { RouteObject } from "react-router";
import { AuthCheckingFallback } from "@/components/routeGuards/RouteGuardUi";
import { requireAuthMiddleware } from "@/lib/routeMiddleware";
import Checkout from "@/pages/Checkout";
import Home from "@/pages/Home";
import Legal from "@/pages/Legal";
import PaymentFail from "@/pages/PaymentFail";
import PaymentSuccess from "@/pages/PaymentSuccess";
import Pricing from "@/pages/Pricing";
import FreeDiagnosisReport from "@/pages/renewal/FreeDiagnosisReport";

// 홈/가격/체크아웃/법적 문서 — 마케팅 최상위 정적 페이지 그룹.
const homeRoutes: RouteObject[] = [
  { path: "/", Component: Home },

  { path: "/pricing", Component: Pricing },
  // 비회원 결제 차단(감사 M5, 2026-08-12) 라우트 층 — 진짜 방어선은
  // api/create-order.js 의 서버 거부다. Pricing.jsx의 goCheckout()도
  // 선(先) 가드를 이미 하지만, 북마크·직접 URL 진입은 그걸 우회하므로
  // 여기 후(後) 가드가 필요하다.
  {
    path: "/checkout",
    Component: Checkout,
    middleware: [requireAuthMiddleware],
    HydrateFallback: AuthCheckingFallback,
  },

  // 법적 문서 (카드사·PG 심사 필수) — 본문은 public.terms(code) 단일 원본.
  { path: "/terms", Component: () => <Legal code="service_fulltext" /> },
  { path: "/privacy", Component: () => <Legal code="privacy_policy" /> },
  { path: "/refund", Component: () => <Legal code="refund_policy" /> },
  { path: "/payment-terms", Component: () => <Legal code="payment_terms" /> },
  {
    path: "/payment-consent",
    Component: () => <Legal code="payment_consent" />,
  },
  // 2026-08-24 수령 동의서 2종 — 서비스별 이용 동의서(학업·입시자료/본인인증/녹취/
  // 학부모-학생 연동), 맞춤 추천용 추가 개인정보 수집·이용 동의서. 앱 내 진입 링크는
  // 아직 없고(/refund 등과 같은 직접 URL 열람용) 서비스별 동의 화면은 별도 작업.
  {
    path: "/service-consent",
    Component: () => <Legal code="service_consent" />,
  },
  {
    path: "/privacy-additional",
    Component: () => <Legal code="privacy_additional" />,
  },

  { path: "/payment/success", Component: PaymentSuccess },
  // 결제 실패도 완료와 같은 셸(헤더/푸터 포함)을 쓴다 — 실패 화면에서
  // GNB·문의 연락처가 사라지면 이탈 경로가 없어진다.
  { path: "/payment/fail", Component: PaymentFail },
  {
    path: "/learning-diagnosis/report",
    Component: FreeDiagnosisReport,
  },
];

export default homeRoutes;
