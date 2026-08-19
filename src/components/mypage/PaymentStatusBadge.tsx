// 결제/환불 상태 배지.
// 시안(3762:18907) 실측 스크린샷 기준 — 둥근 사각형(rounded-md) 칩, 행 높이(32px)를
// 거의 채우는 h-8, 보더 없이 파스텔 배경 + 진한 텍스트.
// 배경 3종(#e7f2fb/#fff3d1/#ffd9d9)은 team-lead가 시안 PNG에서 픽셀 샘플링한 실측
// hex — tailwind.config.js에 대응 토큰이 없어 임의값(bg-[...])으로 쓴다. 텍스트 색은
// 전부 기존 토큰과 정확히 일치해 토큰명을 그대로 썼다(accent #0B84FD / gold #af9364 /
// error #eb2626).
// refund_requests 는 축이 둘이다(sql/68) — status(어드민 처리축)와
// approval_status(학부모 승인축). 배지는 그 조합을 사람이 읽는 한 문장으로
// 눌러 담은 것이다. 조합 → 키 변환은 PaymentsTab.resolveStatus 가 한다.
//
// ⚠ 시안(3661:4082 외)에 있는 배지는 결제완료 / 입금대기 / 환불 진행 중 3종뿐이다.
// 아래 나머지(환불 요청 대기 · 환불 반려 · 환불완료 · 다른 상품으로 결제됨)는
// 시안에 없는 상태라 신규 카피다 — 승인 필요.
const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  // ── 학부모 "결제 내역" 어휘 (3967:3944 실측) ──────────────────────────
  paid: { label: "결제 완료", cls: "bg-[#e9f4ff] text-accent" },
  pending: { label: "입금대기", cls: "bg-[#f5ebcb] text-gold" },
  // 학생이 신청했던 것과 다른 상품 구성으로 학부모가 이미 새로 결제해 이 주문을
  // 대체함(fn_parent_create_enrollment) — "결제 완료"와 같은 색이면 이중결제로
  // 오인하므로 종결/중립 톤(회색)으로 구분한다.
  superseded: {
    label: "다른 상품으로 결제됨",
    cls: "bg-surface-04 text-ink-sub",
  },

  // ── 학생 "신청 내역" 어휘 (3967:3016 실측) ───────────────────────────
  // 학생 화면은 돈이 아니라 **신청·이용** 관점이다. 같은 주문이라도 학부모는
  // '결제 완료', 학생은 '이용 중'으로 읽는다 — 그래서 키를 나눈다.
  student_active: { label: "이용 중", cls: "bg-[#e9f4ff] text-accent" },
  student_waiting_parent: {
    label: "학부모 결제대기",
    cls: "bg-[#f5ebcb] text-gold",
  },
  student_canceled: { label: "신청 취소", cls: "bg-[#d9d9d9] text-[#808080]" },
  student_done: { label: "이용 완료", cls: "bg-[#d9d9d9] text-[#808080]" },
  student_superseded: {
    label: "다른 상품으로 결제됨",
    cls: "bg-[#d9d9d9] text-[#808080]",
  },

  // 학생이 신청했고 학부모가 아직 응답하지 않음(approval_status='requested').
  // 아직 아무도 처리를 시작하지 않았으므로 "진행 중"이 아니다 — 입금대기와
  // 같은 대기 톤(노랑)으로 둔다.
  refund_approval_pending: {
    label: "환불 요청 대기",
    cls: "bg-performance-tag text-gold",
  },

  // 학부모가 반려. status 는 requested 그대로이고 같은 주문으로 재신청할 수
  // 있다(sql/68 설계 확정) — 종결이 아니라는 뜻에서 어드민 반려와 색을 나눈다.
  refund_parent_rejected: {
    label: "학부모 반려",
    cls: "bg-surface-04 text-ink-sub",
  },

  // 승인은 끝났고 어드민이 처리 중(status requested/processing).
  refund_requested: { label: "환불 진행 중", cls: "bg-[#f7dad8] text-error" },
  refund_processing: { label: "환불 진행 중", cls: "bg-[#f7dad8] text-error" },

  refund_completed: { label: "환불 완료", cls: "bg-[#e3f3e8] text-[#2e7d4f]" },
  refund_rejected: { label: "환불 반려", cls: "bg-[#f7dad8] text-error" },

  // 자녀가 보낸 결제 요청에 학부모가 아직 승인/거절을 안 함
  // (approval_status='requested'). refund_approval_pending과 같은 대기 톤(노랑).
  enrollment_requested: {
    label: "승인 필요",
    cls: "bg-performance-tag text-gold",
  },

  // 학부모 승인은 끝났고 결제만 남음(approval_status='approved') — 아직
  // 결제 전이라는 뜻에서 상단 탭 배지("결제 요청 N")·enrollment_requested와
  // 같은 대기 톤(노랑)으로 맞춘다.
  enrollment_approved: {
    label: "결제 대기",
    cls: "bg-performance-tag text-gold",
  },
};

// 시안에 없는 상태(향후 DB에 새 status 값이 추가되는 경우)를 위한 중립 폴백.
const FALLBACK_CLS = "bg-surface-04 text-ink-sub";

type PaymentStatusBadgeProps = {
  status?: string;
  label?: string;
};

export default function PaymentStatusBadge({
  status,
  label,
}: PaymentStatusBadgeProps) {
  const preset = STATUS_STYLES[status || ""];
  const text = label || preset?.label || status || "-";
  const cls = preset?.cls || FALLBACK_CLS;

  return (
    <span
      className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium ${cls}`}
    >
      {text}
    </span>
  );
}
