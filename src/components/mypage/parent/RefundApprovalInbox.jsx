import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { formatKRW } from '../../../data/pricingCatalog';

// 학부모 환불 승인 인박스 (docs/mypage-payment-handoff.md 작업 4).
//
// 학생이 환불을 신청하면 refund_requests.approval_status='requested' 로 학부모
// 응답을 기다린다(fn_request_refund, sql/72). 이 화면이 없으면 그 요청은 영원히
// 대기 상태로 남는다 — 어드민은 approval_status='approved' 인 건만 처리할 수
// 있기 때문이다(fn_complete_refund WC035).
//
// ⚠ 시안 없음 — 학부모 마이페이지 프레임 어디에도 환불 승인 화면이 없다.
// 같은 탭의 결제요청 인박스(EnrollmentInbox)와 같은 카드 형태로 맞췄다.
// 노출 문구는 전부 신규 카피라 승인이 필요하다.
//
// 승인축(approval_status)과 처리축(status)은 별개다 — 여기서 승인해도
// status 는 'requested' 그대로이고, 실제 환불 실행은 어드민이 한다
// (fn_complete_refund). 그래서 승인 후 카드는 "어드민 처리 대기"로 사라진다.

// fn_respond_refund(sql/68) 의 거부 사유. ⚠ 신규 카피 — 승인 필요.
const RESPOND_ERROR_TEXT = {
  WC026: '이미 처리된 환불 신청입니다.',
  WC027: '이 환불 신청에 응답할 권한이 없습니다.',
  WC028: '이미 응답한 환불 신청입니다.',
  WC029: '반려 사유를 입력해 주세요.'
};
const RESPOND_UNKNOWN_ERROR_TEXT = '처리에 실패했습니다. 잠시 후 다시 시도해 주세요.';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function RefundApprovalInbox({ onResponded }) {
  const [rows, setRows] = useState(null);
  const [nameById, setNameById] = useState({});
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const reload = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) {
      setRows([]);
      return;
    }

    const [reqs, children] = await Promise.all([
      supabase
        .from('refund_requests')
        .select('id, order_id, order_name, amount, gross_amount, reason, policy_code, status, approval_status, student_profile_id, created_at')
        .eq('parent_profile_id', uid)
        .eq('approval_status', 'requested')
        .order('created_at', { ascending: false }),
      // 학부모는 자녀 profiles 를 직접 못 읽는다(sql/73 주석) — 이름은 이 RPC 로만.
      supabase.rpc('fn_parent_children')
    ]);

    if (reqs.error) {
      console.error('환불 신청 조회 실패:', reqs.error);
      setRows([]);
      return;
    }

    if (!children.error && Array.isArray(children.data)) {
      const map = {};
      for (const child of children.data) map[child.student_profile_id] = child.student_name;
      setNameById(map);
    }

    setRows(reqs.data || []);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function respond(row, approve) {
    if (savingId) return;
    const reason = approve ? null : rejectReason.trim();
    if (!approve && !reason) {
      setErrorMsg(RESPOND_ERROR_TEXT.WC029);
      return;
    }

    setSavingId(row.id);
    setErrorMsg('');

    const { error } = await supabase.rpc('fn_respond_refund', {
      p_refund_request_id: row.id,
      p_approve: approve,
      p_reject_reason: reason
    });

    setSavingId(null);

    if (error) {
      console.error('환불 신청 응답 실패:', error);
      setErrorMsg(RESPOND_ERROR_TEXT[error.code] || RESPOND_UNKNOWN_ERROR_TEXT);
      return;
    }

    setRejectingId(null);
    setRejectReason('');
    await reload();
    onResponded?.();
  }

  if (rows === null || rows.length === 0) return null;

  return (
    <section className="mb-[4rem]">
      <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
        환불 승인이 필요한 신청 <span className="text-accent">{rows.length}</span>
      </h2>

      {errorMsg && (
        <p className="mt-4 rounded-lg bg-[#FCEAEE] px-4 py-3 text-[0.8125rem] text-[#D6336C]">{errorMsg}</p>
      )}

      <div className="mt-[1.5rem] flex flex-col gap-3">
        {rows.map((row) => {
          const childName = nameById[row.student_profile_id];
          const fee = Number(row.gross_amount || 0) - Number(row.amount || 0);
          const busy = savingId === row.id;

          return (
            <div key={row.id} className="rounded-xl border border-line px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {childName && (
                      <span className="text-[0.875rem] font-semibold text-ink">{childName}</span>
                    )}
                    <span className="rounded-full bg-[#ffd9d9] px-2 py-0.5 text-[0.75rem] font-semibold text-error">
                      환불 신청
                    </span>
                    <span className="text-[0.75rem] text-ink-sub">{formatDate(row.created_at)}</span>
                  </div>
                  <p className="mt-1 truncate text-[0.875rem] text-ink-sub" title={row.order_name}>
                    {row.order_name}
                  </p>
                  {row.reason && (
                    <p className="mt-1 break-keep text-[0.8125rem] text-ink-sub">사유 · {row.reason}</p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  {/* gross_amount 는 sql/72 이전 행에는 없다(NULL) — 그때는 수수료를
                      계산할 근거가 없으므로 환불액만 보여준다. */}
                  {row.gross_amount ? (
                    <>
                      <p className="text-[0.75rem] text-ink-sub">
                        결제 {formatKRW(row.gross_amount)}
                        {fee > 0 && ` · 수수료 ${formatKRW(fee)}`}
                      </p>
                      <p className="text-[1rem] font-semibold text-ink-strong">
                        환불 {formatKRW(row.amount)}
                      </p>
                    </>
                  ) : (
                    <p className="text-[1rem] font-semibold text-ink-strong">{formatKRW(row.amount)}</p>
                  )}
                </div>
              </div>

              {rejectingId === row.id ? (
                <div className="mt-4 flex flex-col gap-2">
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="반려 사유를 입력해 주세요."
                    className="w-full resize-none rounded-lg border border-line px-3 py-2 text-[0.875rem] text-ink outline-none focus:border-accent"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason('');
                        setErrorMsg('');
                      }}
                      className="h-[2.25rem] rounded-lg border border-line px-4 text-[0.8125rem] text-ink-sub"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => respond(row, false)}
                      disabled={busy}
                      className="h-[2.25rem] rounded-lg bg-error px-4 text-[0.8125rem] font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? '처리 중...' : '반려하기'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingId(row.id);
                      setRejectReason('');
                      setErrorMsg('');
                    }}
                    disabled={busy}
                    className="h-[2.5rem] rounded-lg border border-line px-4 text-[0.875rem] font-medium text-ink-sub transition hover:bg-surface-04 disabled:opacity-60"
                  >
                    반려
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(row, true)}
                    disabled={busy}
                    className="h-[2.5rem] rounded-lg bg-primary px-5 text-[0.875rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {busy ? '처리 중...' : '환불 승인'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
