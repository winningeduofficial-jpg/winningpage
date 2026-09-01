import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthProvider";
import { supabase } from "@/lib/supabase";
import PaymentDetailModal from "./PaymentDetailModal";
import PaymentStatusBadge from "./PaymentStatusBadge";
import PaymentTable from "./PaymentTable";
import {
  formatApprovedAt,
  formatOrderId,
  formatProductNames,
  resolveOrderStatus,
} from "./paymentRows";
import RefundNoticeModal from "./RefundNoticeModal";
import RefundRequestModal from "./RefundRequestModal";

// 학생 "신청 내역" 탭 — 확정 디자인 3967:3016(목록) / 3967:2757(빈 상태).
//
// ── 학부모 결제 내역과 형식 통일(2026-09-01, B안) ──
// 예전엔 학생 전용 표(열 라벨 신청번호/신청일/이용금액/상태, 상태 어휘 이용
// 중/학부모 결제대기/신청 취소/이용 완료)와 학생 전용 상세 모달
// (StudentRequestDetailModal)을 따로 뒀다. 사용자 확정으로 "형식만 통일,
// 금액 정책은 유지" — 표 열 라벨(주문번호/일시/상품/상태, 금액 열은 제외)과
// 상태 배지 어휘를 학부모(ParentPaymentsTab)와 완전히 같은 것으로 바꾸고,
// 상세 모달도 학부모 PaymentDetailModal을 asStudent 모드로 공유한다(그 안에서
// 금액 관련 행·금액 분해·영수증 버튼만 빠진다 — PaymentDetailModal.tsx 상단
// 주석 참고). 금액을 학생에게 노출하지 않는 원칙 자체는 그대로다(2026-08-13
// 확정) — 환불 금액도 여전히 학부모 확인 화면에서만 보여준다.
//
// 상태 판정은 resolveOrderStatus(paymentRows.ts)를 그대로 위임한다 —
// ParentPaymentsTab의 historyOrders와 정확히 같은 함수라 같은 주문이 두
// 화면에서 다른 배지로 보일 수 없다. order.status==='pending'(학부모 결제
// 대기, 아직 승인/거절 전)만 학생 고유 분기다 — resolveOrderStatus는 이
// 상태를 다루지 않는다(학부모 쪽도 그 상태는 별도 pendingOrders 섹션에서
// enrollment_requested/enrollment_approved로 배지를 단다).
//
// '이용 완료'(만료·소진) 판정 — B안 통일로 학생 배지에서는 더 이상 안
// 쓴다(파싱 시절과 달리 grants 원장으로 정확히 알 수 있게 됐지만, 통일 대상인
// 학부모 배지 자체가 이 구분을 안 한다). program_access_grants 원장 조회도
// 함께 걷어냈다 — 더 쓰는 곳이 없다.

const STUDENT_HEADERS = {
  id: "주문번호",
  date: "일시",
  product: "상품",
  status: "상태",
};

type Order = {
  id: string;
  order_name?: string;
  amount: number;
  created_at?: string;
  paid_at?: string;
  status?: string;
  approval_status?: string;
  reject_reason?: string | null;
  is_fake_entitlement?: boolean;
  order_items?: { name: string; product_id?: string | null }[];
};

type Refund = {
  id: string;
  order_id?: string;
  order_name?: string;
  amount?: number;
  gross_amount?: number | null;
  status?: string;
  approval_status?: string;
  student_profile_id?: string;
  created_at?: string;
};

// 학부모 배지 상태 매핑 재사용(위 파일 상단 주석 참고). order.status==='pending'
// (아직 학부모 승인/거절 전, 결제 자체가 시작되지 않음)만 학생 고유 분기다.
function resolveStudentStatus(order: Order, refunds: Refund[]) {
  if (order.status === "pending") {
    return order.approval_status === "approved"
      ? "enrollment_approved"
      : "enrollment_requested";
  }
  return resolveOrderStatus(order, refunds);
}

type PaymentsTabProps = {
  orders?: Order[];
  refunds?: Refund[];
  onRefundSubmitted?: () => void;
};

export default function PaymentsTab({
  orders = [],
  refunds = [],
  onRefundSubmitted,
}: PaymentsTabProps) {
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [names, setNames] = useState({ student: "", parent: "" });

  // 세션은 AuthProvider(전역 단일 구독)에서 읽는다(명세 B-3 §4).
  const { userId: uid } = useAuth();

  // 신청 상세 모달이 "신청자 / 결제담당"을 보여주려면 두 이름이 필요하다.
  // 본인 이름은 profiles 에서 바로 읽지만, 학부모 이름은 못 읽는다 —
  // profiles_select_own 이 본인 행만 열어 주기 때문이다. 그래서 학부모는
  // fn_student_parent(sql/77)로 받는다(fn_parent_children 의 반대 방향).
  useEffect(() => {
    let alive = true;
    if (!uid) return undefined;

    (async () => {
      const [me, parent] = await Promise.all([
        supabase.from("profiles").select("name").eq("id", uid).maybeSingle(),
        supabase.rpc("fn_student_parent"),
      ]);

      if (!alive) return;

      // RPC 는 approved 를 먼저 정렬해 돌려준다 — 첫 행만 쓴다.
      const parentRow = Array.isArray(parent.data) ? parent.data[0] : null;
      if (parent.error) console.warn("학부모 조회 실패:", parent.error.message);

      setNames({
        student: me.data?.name || "",
        parent: parentRow?.parent_name || "",
      });
    })();

    return () => {
      alive = false;
    };
  }, [uid]);

  const detailOrderStatus = detailOrder
    ? resolveStudentStatus(detailOrder, refunds)
    : undefined;

  return (
    <section>
      <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
        신청 내역
      </h2>

      <PaymentTable
        headers={STUDENT_HEADERS}
        showAmount={false}
        emptyText="아직 신청한 서비스가 없어요"
        rows={orders.map((o) => ({
          key: o.id,
          idFull: o.id,
          idText: formatOrderId(o.id),
          // 결제 전 건은 승인일시가 없다 — 신청 시각(created_at)이 이 표의 축이다.
          dateText: formatApprovedAt(o.created_at || o.paid_at),
          productText: formatProductNames(o),
          ...(o.is_fake_entitlement && { note: "(개발용)" }),
          raw: o,
        }))}
        onSelect={(row) => setDetailOrder(row.raw as Order)}
        renderStatus={(row) => (
          <PaymentStatusBadge
            status={resolveStudentStatus(row.raw as Order, refunds)}
          />
        )}
      />

      <PaymentDetailModal
        open={!!detailOrder}
        order={detailOrder}
        asStudent
        studentName={names.student}
        parentName={names.parent}
        {...(detailOrderStatus && { status: detailOrderStatus })}
        onClose={() => setDetailOrder(null)}
        onRequestRefund={() => {
          const target = detailOrder;
          setDetailOrder(null);
          // 로컬 QA 가짜 이용권 주문은 실제 order_id가 DB에 없다 — 환불을
          // 걸면 존재하지 않는 order_id가 refund_requests에 저장된다
          // (ParentPaymentsTab.handleRequestRefund와 같은 가드).
          if (target?.is_fake_entitlement) return;
          setRefundOrder(target);
        }}
      />

      <RefundRequestModal
        open={!!refundOrder}
        order={refundOrder}
        // 학생 요청 모드 — 금액을 숨기고 문구를 "요청"으로 바꾼다(3967:3561).
        asStudent
        parentName={names.parent}
        onClose={() => setRefundOrder(null)}
        onSubmitted={() => {
          setRefundOrder(null);
          setNoticeOpen(true);
          onRefundSubmitted?.();
        }}
        // onStaleData는 optional(exactOptionalPropertyTypes) — onRefundSubmitted가
        // undefined면 키 자체를 생략한다(동작 동일, onStaleData?.() 호출부가 처리).
        {...(onRefundSubmitted && { onStaleData: onRefundSubmitted })}
      />

      <RefundNoticeModal
        open={noticeOpen}
        asStudent
        parentName={names.parent}
        onClose={() => setNoticeOpen(false)}
      />
    </section>
  );
}
