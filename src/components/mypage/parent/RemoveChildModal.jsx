import { useCallback, useId, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import MyPageModalShell from '../MyPageModalShell';

// 자녀 삭제(연결 해제) 확인 모달 (Figma 3709:2630).
//
// 실제 처리는 revoke_parent_link RPC(sql/40) — 행을 지우지 않고 status 를
// revoked 로 바꾼다. 그래서 나중에 자녀가 다시 연결코드를 주면 재연결이
// 가능하다. "삭제"라는 라벨은 시안 문구를 따른 것이고, 데이터는 남는다.
export default function RemoveChildModal({ open, child, onClose, onRemoved }) {
  const titleId = useId();
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRemove = useCallback(async () => {
    if (!child?.link_id || saving) return;
    setSaving(true);
    setErrorMsg('');

    const { error } = await supabase.rpc('revoke_parent_link', { p_link_id: child.link_id });
    setSaving(false);

    if (error) {
      console.error('자녀 연결 해제 실패:', error);
      setErrorMsg('삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    onRemoved?.();
  }, [child, saving, onRemoved]);

  if (!open || !child) return null;

  return (
    <MyPageModalShell open={open} onClose={onClose} labelledBy={titleId} className="w-[26rem]">
      <div className="flex flex-col items-center px-6 py-8 text-center">
        <h2 id={titleId} className="break-keep text-[1.125rem] font-bold leading-[1.5] text-ink-title">
          {child.student_name} 학생을 자녀 목록에서
          <br />
          삭제하시겠습니까?
        </h2>
        <p className="mt-3 break-keep text-[0.8125rem] leading-[1.6] text-ink-sub">
          삭제하면 학습 리포트와 진단 결과를 더 이상 볼 수 없어요.
        </p>

        {errorMsg && <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>}

        <div className="mt-7 grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="h-12 rounded-xl bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-line"
          >
            {saving ? '삭제 중...' : '삭제하기'}
          </button>
        </div>
      </div>
    </MyPageModalShell>
  );
}
