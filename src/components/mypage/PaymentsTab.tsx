import { useEffect, useState } from "react";
import { formatKRW } from "@/data/pricingCatalog";
import { supabase } from "@/lib/supabase";
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
import StudentRequestDetailModal from "./StudentRequestDetailModal";

// 학생 "신청 내역" 탭 — 확정 디자인 3967:3016(목록) / 3967:2757(빈 상태).
//
// 학부모의 "결제 내역"과 같은 표를 쓰지만 관점이 다르다. 학생은 돈이 아니라
// **신청과 이용**을 본다:
//   · 열 라벨   신청번호 / 신청일 / 상품 / 이용금액 / 상태
//   · 상태 어휘 이용 중 / 학부모 결제대기 / 신청 취소 / 이용 완료
//   · 상세 모달 신청 상세 내역(금액 없음, 신청자·결제담당을 보여준다)
// 금액을 학생에게 노출하지 않는 것은 2026-08-13 확정 사항이다 — 환불 금액도
// 학부모 확인 화면에서만 보여준다.
//
// '이용 완료'(만료·소진) 판정은 orders 만으로는 못 한다 — 이용 기간·잔여 회차의
// 정본은 부여 원장(program_access_grants)과 소비 원장(performance_credit_ledger)
// 이다. 둘 다 학생 본인 행이 RLS 로 열려 있어(*_select_own) 직접 읽는다.
// MyServicesTab 이 쓰는 order_name 문자열 파싱 휴리스틱은 복제하지 않았다.

const STUDENT_HEADERS = {
  id: "신청번호",
  date: "신청일",
  product: "상품",
  amount: "이용금액",
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
  is_fake_entitlement?: boolean;
  order_items?: { name: string }[];
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

// 학생 관점의 상태 판정. 환불이 걸린 건은 학부모와 같은 어휘를 쓴다 —
// 환불 진행 상황은 학생도 그대로 알아야 하고, 달리 부를 이름도 없다.
function resolveStudentStatus(
  order: Order,
  refunds: Refund[],
  finishedByOrder: Record<string, boolean> = {},
) {
  // 학부모가 다른 상품 구성으로 새로 결제하며 이 주문을 대체한 경우다.
  // status 는 canceled 로 같이 떨어지므로 아래 신청 취소 분기보다 먼저 걸러야 한다.
  if (order.approval_status === "superseded") return "student_superseded";
  if (order.status === "pending") return "student_waiting_parent";
  if (order.status === "canceled" || order.status === "failed")
    return "student_canceled";

  const shared = resolveOrderStatus(order, refunds);
  if (shared !== "paid") return shared;

  // 환불이 걸리지 않은 결제 건만 이용 상태로 갈린다.
  return finishedByOrder[order.id] === true ? "student_done" : "student_active";
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
  // orderId → true(이용 완료). 부여 원장이 없는 주문은 키가 없다(판정 보류).
  const [finishedByOrder, setFinishedByOrder] = useState<
    Record<string, boolean>
  >({});

  // 신청 상세 모달이 "신청자 / 결제담당"을 보여주려면 두 이름이 필요하다.
  // 본인 이름은 profiles 에서 바로 읽지만, 학부모 이름은 못 읽는다 —
  // profiles_select_own 이 본인 행만 열어 주기 때문이다. 그래서 학부모는
  // fn_student_parent(sql/77)로 받는다(fn_parent_children 의 반대 방향).
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session?.session?.user?.id;
      if (!uid) return;

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
  }, []);

  // 이용 완료 판정 — 그 주문의 살아있는 부여가 하나도 남지 않았으면 완료다.
  //   기간권: expires_at 이 지났으면 만료(배타 상한 — sql/64).
  //   회차권: 사용 회차가 부여 회차를 채웠으면 소진.
  //   revoked_at: 환불 등으로 회수된 부여는 애초에 세지 않는다.
  // 부여가 한 줄도 없는 주문(무료 성격·부여 실패)은 판정하지 않고 비워 둔다 —
  // 근거 없이 '이용 완료'라고 하면 멀쩡한 이용권을 끝난 것처럼 보이게 한다.
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session?.session?.user?.id;
      if (!uid) return;

      const [grants, ledger] = await Promise.all([
        supabase
          .from("program_access_grants")
          .select("id, order_id, expires_at, granted_sessions, revoked_at")
          .eq("profile_id", uid),
        supabase
          .from("performance_credit_ledger")
          .select("grant_id, delta")
          .eq("profile_id", uid),
      ]);

      if (!alive || grants.error) {
        if (grants.error)
          console.warn("부여 원장 조회 실패:", grants.error.message);
        return;
      }

      const usedByGrant: Record<string, number> = {};
      for (const row of ledger.data || []) {
        usedByGrant[row.grant_id] =
          (usedByGrant[row.grant_id] || 0) + -Number(row.delta || 0);
      }

      const now = Date.now();
      const byOrder: Record<string, boolean> = {};
      for (const g of grants.data || []) {
        if (!g.order_id) continue;
        if (g.revoked_at) continue;

        const expired = g.expires_at
          ? new Date(g.expires_at).getTime() <= now
          : false;
        const exhausted =
          g.granted_sessions !== null &&
          (usedByGrant[g.id] || 0) >= g.granted_sessions;

        const live = !expired && !exhausted;
        // 하나라도 살아 있으면 그 주문은 아직 이용 중이다.
        byOrder[g.order_id] = byOrder[g.order_id] === false ? false : !live;
        if (live) byOrder[g.order_id] = false;
      }

      setFinishedByOrder(byOrder);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const detailStatus = detailOrder
    ? resolveStudentStatus(detailOrder, refunds, finishedByOrder)
    : null;

  return (
    <section>
      <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
        신청 내역
      </h2>

      <PaymentTable
        headers={STUDENT_HEADERS}
        emptyText="아직 신청한 서비스가 없어요"
        rows={orders.map((o) => ({
          key: o.id,
          idFull: o.id,
          idText: formatOrderId(o.id),
          // 결제 전 건은 승인일시가 없다 — 신청 시각(created_at)이 이 표의 축이다.
          dateText: formatApprovedAt(o.created_at || o.paid_at),
          productText: formatProductNames(o),
          amountText: formatKRW(o.amount),
          ...(o.is_fake_entitlement && { note: "(개발용)" }),
          raw: o,
        }))}
        onSelect={(row) => setDetailOrder(row.raw as Order)}
        renderStatus={(row) => (
          <PaymentStatusBadge
            status={resolveStudentStatus(
              row.raw as Order,
              refunds,
              finishedByOrder,
            )}
          />
        )}
      />

      <StudentRequestDetailModal
        open={!!detailOrder}
        order={detailOrder}
        studentName={names.student}
        parentName={names.parent}
        // 환불은 결제가 끝난 건에만. 학부모 반려 건은 재신청이 열려 있다
        // (sql/68 미종결 판정에서 rejected 를 뺀 이유).
        canRequestRefund={
          !detailOrder?.is_fake_entitlement &&
          (detailStatus === "student_active" ||
            detailStatus === "refund_parent_rejected")
        }
        onClose={() => setDetailOrder(null)}
        onRequestRefund={() => {
          const target = detailOrder;
          setDetailOrder(null);
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
