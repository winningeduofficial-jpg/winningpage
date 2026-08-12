import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { formatKRW } from '../../../data/pricingCatalog';

// 학부모 결제요청 인박스 (docs/mypage-payment-handoff.md 작업 1·2).
//
// 학생이 만든 결제요청(orders.status='pending')을 학부모가 **발견하는 유일한
// 경로**다. 이 화면이 없던 동안 학부모는 /checkout?order=<id> 직링크를 누가
// 알려주지 않으면 요청이 있는지조차 알 수 없었다.
//
// ⚠ 시안 없음 — 이 섹션은 Figma 어디에도 그려져 있지 않다(학부모 마이페이지
// 프레임 29장 전부 확인). 학생 결제내역 표의 타이포·간격 관례를 따라 최소
// 구성으로 만들었다. 노출 문구는 전부 신규 카피라 승인이 필요하다.
//
// ── 두 가지 상태를 함께 싣는 이유 (작업 2, 설계 갭) ────────────────────
//   requested + pending  = 아직 수락 전. /checkout 진입 게이트를 통과한다.
//   approved  + pending  = 학부모가 수락(fn_respond_enrollment 성공)까지 했는데
//                          토스 결제창만 닫은 상태. 쿠폰 귀속까지 끝나 있다.
//
//   둘 다 /checkout?order=<id> 로 보낸다. 후자는 ParentCheckout 이 재개 모드로
//   받아 쿠폰 단계를 건너뛰고 확정된 금액으로 토스만 다시 부른다(2026-08-13,
//   handoff 작업 2 해소 — 그 전에는 진입 게이트가 requested 만 통과시켜서
//   수락 후 결제창을 닫으면 되살릴 방법이 없었다).
const STATUS_META = {
  requested: { label: '수락 대기', cls: 'bg-[#fff3d1] text-gold' },
  approved: { label: '결제 대기', cls: 'bg-[#e7f2fb] text-accent' }
};

export default function EnrollmentInbox() {
  const [rows, setRows] = useState(null);
  const [nameById, setNameById] = useState({});

  const reload = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) {
      setRows([]);
      return;
    }

    const [orders, children] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_name, amount, discount_amount, status, approval_status, student_profile_id, created_at')
        .eq('parent_profile_id', uid)
        .eq('status', 'pending')
        .in('approval_status', ['requested', 'approved'])
        .order('created_at', { ascending: false }),
      // 학부모는 자녀 profiles 를 직접 못 읽는다 — 이름은 이 RPC 로만 얻는다
      // (sql/73). 인박스 행에 "누구의 요청인지"를 쓰려면 반드시 필요하다.
      supabase.rpc('fn_parent_children')
    ]);

    if (orders.error) {
      console.error('결제요청 조회 실패:', orders.error);
      setRows([]);
      return;
    }

    if (!children.error && Array.isArray(children.data)) {
      const map = {};
      for (const child of children.data) map[child.student_profile_id] = child.student_name;
      setNameById(map);
    }

    setRows(orders.data || []);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (rows === null || rows.length === 0) return null;

  return (
    <section className="mb-[4rem]">
      <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
        결제를 기다리는 요청 <span className="text-accent">{rows.length}</span>
      </h2>

      <div className="mt-[1.5rem] flex flex-col gap-3">
        {rows.map((row) => {
          const meta = STATUS_META[row.approval_status] || STATUS_META.requested;
          const childName = nameById[row.student_profile_id];

          return (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {childName && (
                    <span className="shrink-0 text-[0.875rem] font-semibold text-ink">{childName}</span>
                  )}
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1 truncate text-[0.875rem] text-ink-sub" title={row.order_name}>
                  {row.order_name}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-4">
                <span className="text-[1rem] font-semibold text-ink-strong">
                  {formatKRW(row.amount)}
                </span>
                <Link
                  to={`/checkout?order=${encodeURIComponent(row.id)}`}
                  className="inline-flex h-[2.5rem] items-center justify-center rounded-lg bg-primary px-5 text-[0.875rem] font-semibold text-white transition hover:opacity-90"
                >
                  결제하기
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
