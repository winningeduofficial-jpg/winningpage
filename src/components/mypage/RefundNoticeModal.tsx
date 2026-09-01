import MyPageModalShell from "./MyPageModalShell";
import ModalFooter from "./modal/ModalFooter";

// 환불 신청 접수 완료 모달 (Figma 3762:19708) — 확인 버튼 1개짜리 단순 안내 모달.
//
// 예전엔 AppModal(취소/저장 2버튼 고정)과 footer 형태가 달라 ESC/포커스 트랩/
// 배경 스크롤 잠금을 직접 구현한 수제 오버레이였다. 결제 탭 모달 6종 통일
// 작업(2026-09)으로 그 수동 구현을 걷어내고 MyPageModalShell(shadcn
// Dialog/Base UI 내장 동작)로 옮긴다.

type RefundNoticeModalProps = {
  open: boolean;
  asStudent?: boolean;
  parentName?: string;
  onClose?: () => void;
};

export default function RefundNoticeModal({
  open,
  asStudent = false,
  parentName = "",
  onClose,
}: RefundNoticeModalProps) {
  if (!open) return null;

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="md"
      title={asStudent ? "환불 요청을 보냈어요" : "환불 신청이 접수됐어요"}
      footer={
        <ModalFooter
          buttons={[
            {
              key: "confirm",
              label: "확인",
              variant: "primary",
              onClick: onClose,
            },
          ]}
        />
      }
    >
      <div className="px-8.75 pb-2.5 text-center">
        {/* 학생 완료 문구는 확정 디자인 3967:3933 실측. 학생 요청은 곧바로
            환불되지 않고 학부모 확인을 거치므로 안내가 달라야 한다. */}
        {asStudent ? (
          <p className="mt-3.75 break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
            {parentName ? `${parentName} ` : ""}학부모님께 환불 요청이
            전달됐어요.
            <br />
            학부모님이 확인하고 환불을 진행하면 알림으로 알려드릴게요.
          </p>
        ) : (
          <p className="mt-3.75 break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
            영업일 기준 1~2일 안에 검토 후
            <br />
            결제하신 수단으로 환급해드려요.
            <br />
            진행 상황은 결제 내역에서 확인할 수 있어요.
          </p>
        )}
      </div>
    </MyPageModalShell>
  );
}
