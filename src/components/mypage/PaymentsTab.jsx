import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatKRW } from '../../data/pricingCatalog';
import PaymentTable from './PaymentTable';
import PaymentStatusBadge from './PaymentStatusBadge';
import StudentRequestDetailModal from './StudentRequestDetailModal';
import RefundRequestModal from './RefundRequestModal';
import RefundNoticeModal from './RefundNoticeModal';
import { formatOrderId, formatApprovedAt, resolveOrderStatus } from './paymentRows';

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
// ⚠ '이용 완료'(만료) 판정은 이 표의 데이터만으로는 할 수 없다. orders 에는
// 이용 기간이 없고, 만료는 program_access_grants.expires_at 이 정본이다
// (MyServicesTab 은 order_name 문자열을 파싱해 근사치를 낸다 — 그 휴리스틱을
// 여기로 복제하지 않았다). 결제가 끝난 건은 일단 '이용 중'으로 두고, 만료
// 표시가 필요해지면 부여 원장을 함께 읽어야 한다.

const STUDENT_HEADERS = {
  id: '신청번호',
  date: '신청일',
  product: '상품',
  amount: '이용금액',
  status: '상태'
};

// 학생 관점의 상태 판정. 환불이 걸린 건은 학부모와 같은 어휘를 쓴다 —
// 환불 진행 상황은 학생도 그대로 알아야 하고, 달리 부를 이름도 없다.
function resolveStudentStatus(order, refunds) {
  if (order.status === 'pending') return 'student_waiting_parent';
  if (order.status === 'canceled' || order.status === 'failed') return 'student_canceled';

  const shared = resolveOrderStatus(order, refunds);
  if (shared === 'paid') return 'student_active';
  return shared;
}

export default function PaymentsTab({ orders = [], refunds = [], onRefundSubmitted }) {
  const [detailOrder, setDetailOrder] = useState(null);
  const [refundOrder, setRefundOrder] = useState(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [names, setNames] = useState({ student: '', parent: '' });

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
        supabase.from('profiles').select('name').eq('id', uid).maybeSingle(),
        supabase.rpc('fn_student_parent')
      ]);

      if (!alive) return;

      // RPC 는 approved 를 먼저 정렬해 돌려준다 — 첫 행만 쓴다.
      const parentRow = Array.isArray(parent.data) ? parent.data[0] : null;
      if (parent.error) console.warn('학부모 조회 실패:', parent.error.message);

      setNames({ student: me.data?.name || '', parent: parentRow?.parent_name || '' });
    })();

    return () => {
      alive = false;
    };
  }, []);

  const detailStatus = detailOrder ? resolveStudentStatus(detailOrder, refunds) : null;

  return (
    <section>
      <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">신청 내역</h2>

      <PaymentTable
        headers={STUDENT_HEADERS}
        emptyText="아직 신청한 서비스가 없어요"
        rows={orders.map((o) => ({
          key: o.id,
          idFull: o.id,
          idText: formatOrderId(o.id),
          // 결제 전 건은 승인일시가 없다 — 신청 시각(created_at)이 이 표의 축이다.
          dateText: formatApprovedAt(o.created_at || o.paid_at),
          productText: o.order_name,
          amountText: formatKRW(o.amount),
          note: o.is_fake_entitlement ? '(개발용)' : null,
          raw: o
        }))}
        onSelect={(row) => setDetailOrder(row.raw)}
        renderStatus={(row) => <PaymentStatusBadge status={resolveStudentStatus(row.raw, refunds)} />}
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
          (detailStatus === 'student_active' || detailStatus === 'refund_parent_rejected')
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
        onStaleData={onRefundSubmitted}
      />

      <RefundNoticeModal open={noticeOpen} asStudent parentName={names.parent} onClose={() => setNoticeOpen(false)} />
    </section>
  );
}
