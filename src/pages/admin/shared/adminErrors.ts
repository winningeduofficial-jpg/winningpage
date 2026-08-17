// error.message 원문 alert 위생(팀 리드 지시, 2026-08-12) — Baseline 실측 WC 코드·
// SQLSTATE 를 짧은 한국어 안내로 치환한다. 매핑에 없는 오류는 일반 실패 문구를
// 보여주고 원문은 console.error 로만 남긴다(alert 로 DB 에러 원문을 그대로
// 노출하지 않기 위함). 19개소(제네릭 저장 경로 두 벌 + 조회 2곳 포함) 전부
// 아래 reportAdminError 경유로 통일한다.

// Supabase PostgrestError 등 message/code를 갖는 임의 오류 객체를 느슨하게 받는다 —
// 호출부가 던지는 값이 항상 Error 인스턴스는 아니다(예: { message, code } 리터럴).
interface AdminErrorLike {
  message?: string;
  code?: string;
}

const ADMIN_ERROR_MESSAGE_MAP: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /refund_not_approved_for_completion|WC035/,
    message: "아직 승인되지 않은 환불 신청입니다.",
  },
  {
    pattern: /refund_completion_not_processable|WC036/,
    message: "지금 상태에서는 환불 완료 처리를 할 수 없습니다.",
  },
  {
    pattern: /order_already_consumed|WC032/,
    message: "이미 사용된 주문이라 환불 완료 처리를 할 수 없습니다.",
  },
  {
    pattern: /refund_amount_exceeds_paid|WC037/,
    message: "환불 금액이 결제 금액을 초과합니다.",
  },
  { pattern: /order_not_pending|WC040/, message: "이미 처리된 주문입니다." },
  {
    pattern: /order_not_paid_for_refund|WC041/,
    message: "결제 완료된 주문만 환불할 수 있습니다.",
  },
  {
    pattern: /refunded_order_immutable|WC039/,
    message: "환불 완료된 주문은 더 이상 수정할 수 없습니다.",
  },
  {
    pattern: /23514/,
    message: "입력값이 저장 조건을 벗어났습니다. 값을 다시 확인해 주세요.",
  },
  {
    pattern: /23502/,
    message: "필수 값이 비어 있습니다. 항목을 모두 입력해 주세요.",
  },
  { pattern: /23505/, message: "이미 등록된 값입니다(중복)." },
];

function mapAdminErrorMessage(
  error: AdminErrorLike | null | undefined,
): string {
  const raw = `${error?.message || ""} ${error?.code || ""}`;
  const hit = ADMIN_ERROR_MESSAGE_MAP.find(({ pattern }) => pattern.test(raw));
  return hit
    ? hit.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function reportAdminError(
  label: string,
  error: AdminErrorLike | null | undefined,
): void {
  console.error(label, error);
  alert(`${label}: ${mapAdminErrorMessage(error)}`);
}
