import { useId } from "react";
import MyPageModalShell from "./MyPageModalShell";

// 학생 "신청 상세 내역" 모달 (Figma 3967:3571, 583×376).
//
// 학부모의 결제 상세 모달(PaymentDetailModal)과 **다른 화면**이다. 학생은
// 금액을 보지 않는다(2026-08-13 확정) — 결제 금액·부가세·영수증이 전부 없고,
// 대신 "누가 신청했고 누가 결제했는가"를 보여준다.
//
// 시안 행 4개: 신청일 / 신청자 / 결제담당 / 결제완료일.
// 버튼 2개: 닫기 / 환불 신청.
//
// 결제담당(학부모 이름)은 학생이 직접 읽을 수 없다 — profiles_select_own 은
// 자기 행만 열어 준다. 상위(PaymentsTab)가 parent_child_links 로 얻은 이름을
// parentName 으로 내려준다. 이름을 모르면 일반 라벨로 떨어뜨린다(지어내지 않는다).

function formatStamp(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}. ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function StudentRequestDetailModal({
  open,
  order,
  studentName,
  parentName,
  canRequestRefund = false,
  onClose,
  onRequestRefund,
}) {
  const titleId = useId();

  if (!open || !order) return null;

  const rows = [
    { label: "신청일", value: formatStamp(order.created_at) },
    {
      label: "신청자",
      value: studentName ? `${studentName}(학생)` : "학생 본인",
    },
    {
      label: "결제담당",
      value: parentName ? `${parentName} 학부모님` : "학부모님",
    },
    // 결제 전이면 아직 없다 — 대시로 둔다(0원·미정 같은 값을 만들지 않는다).
    {
      label: "결제완료일",
      value: order.paid_at ? formatStamp(order.paid_at) : "-",
    },
  ];

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="w-[33.75rem]"
    >
      <div className="flex-1 overflow-y-auto px-[2.1875rem] pt-[2.5rem]">
        <h2
          id={titleId}
          className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-strong"
        >
          신청 상세 내역
        </h2>

        <dl className="mt-[1.875rem] flex flex-col pb-[1.875rem]">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 border-b border-line/60 py-[0.9375rem]"
            >
              <dt className="shrink-0 text-[0.875rem] text-ink-sub">
                {row.label}
              </dt>
              <dd className="truncate text-right text-[0.875rem] text-ink-strong">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex justify-center gap-[0.75rem] border-t border-[#F0F0F0] px-[2.1875rem] py-[1.5625rem]">
        <button
          type="button"
          onClick={onClose}
          className="h-[2.5rem] w-[8.25rem] rounded-lg border border-[#E3E3E3] text-[0.875rem] font-medium text-ink-sub transition-colors hover:bg-surface-04"
        >
          닫기
        </button>
        {canRequestRefund && (
          <button
            type="button"
            onClick={onRequestRefund}
            className="h-[2.5rem] w-[8.25rem] rounded-lg bg-primary text-[0.875rem] font-semibold text-white transition-colors hover:opacity-90"
          >
            환불 신청
          </button>
        )}
      </div>
    </MyPageModalShell>
  );
}
