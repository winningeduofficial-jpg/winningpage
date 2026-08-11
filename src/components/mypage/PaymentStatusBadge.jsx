// 결제/환불 상태 배지.
// 시안(3762:18907) 실측 스크린샷 기준 — 둥근 사각형(rounded-md) 칩, 행 높이(32px)를
// 거의 채우는 h-8, 보더 없이 파스텔 배경 + 진한 텍스트.
// 배경 3종(#e7f2fb/#fff3d1/#ffd9d9)은 team-lead가 시안 PNG에서 픽셀 샘플링한 실측
// hex — tailwind.config.js에 대응 토큰이 없어 임의값(bg-[...])으로 쓴다. 텍스트 색은
// 전부 기존 토큰과 정확히 일치해 토큰명을 그대로 썼다(accent #0B84FD / gold #af9364 /
// error #eb2626).
const STATUS_STYLES = {
  paid: { label: '결제완료', cls: 'bg-[#e7f2fb] text-accent' },
  pending: { label: '입금대기', cls: 'bg-[#fff3d1] text-gold' },
  refund_requested: { label: '환불 진행 중', cls: 'bg-[#ffd9d9] text-error' },
  refund_processing: { label: '환불 진행 중', cls: 'bg-[#ffd9d9] text-error' },
  // 환불완료는 시안 실측 대상에 없어 중립 슬레이트 톤으로 폴백.
  refund_completed: { label: '환불완료', cls: 'bg-slate-100 text-slate-600' },
  refund_rejected: { label: '환불 반려', cls: 'bg-[#ffd9d9] text-error' }
};

// 시안에 없는 상태(향후 DB에 새 status 값이 추가되는 경우)를 위한 중립 폴백.
const FALLBACK_CLS = 'bg-surface-04 text-ink-sub';

export default function PaymentStatusBadge({ status, label }) {
  const preset = STATUS_STYLES[status];
  const text = label || preset?.label || status || '-';
  const cls = preset?.cls || FALLBACK_CLS;

  return (
    <span className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium ${cls}`}>
      {text}
    </span>
  );
}
