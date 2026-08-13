import { useCallback, useEffect, useId, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isValidEmail } from '../../lib/validators';
import MyPageModalShell from './MyPageModalShell';

// 이메일 변경 (Figma 3633:1461 입력 / 3633:1657 인증 / 3633:1853 확인 / 3633:2034 완료).
//
// ── 인증 방식 ────────────────────────────────────────────────────────
// 시안이 "인증번호 보내기 → 이메일 인증번호 입력"이라 이 레포의 가입 플로우와
// 같은 **6자리 이메일 OTP** 를 쓴다. Supabase 는 auth.updateUser({ email }) 을
// 부르면 변경 확인 메일을 보내고, 그 코드를 verifyOtp({ type: 'email_change' })
// 로 검증하면 변경이 확정된다.
//
// ⚠ 대시보드 설정 의존 — Authentication → Emails → **Change Email Address**
// 템플릿이 `{{ .Token }}` 을 써야 이 화면이 성립한다. `{{ .ConfirmationURL }}`
// 만 있으면 사용자가 링크를 눌러 버려서 이 화면으로 돌아오지 않는다(가입
// 플로우가 겪은 것과 같은 함정 — sql/README.md "Supabase Auth 대시보드 설정").
// 또한 "Secure email change"가 켜져 있으면 **기존 주소로도** 확인이 필요해
// 코드가 두 번 온다. 운영 반영 전에 두 설정을 확인할 것.
//
// ⚠ 시안 오타 2건 —
//   · 입력 단계 라벨이 '새 이메일 번호'(→ '새 이메일')
//   · 인증 단계의 새 이메일 값이 '010-4321-4321'(전화번호 변경 화면에서 복사된
//     흔적)이고 안내가 '이메일으로'(→ '이메일로')
//
// profiles.email 도 함께 갱신한다 — 앱은 auth 가 아니라 profiles.email 을
// 읽어 화면에 뿌린다(MyPage.queryProfile). 갱신하지 않으면 변경 후에도 옛
// 주소가 계속 보인다.
const FIELD_CLASS =
  'h-[3.25rem] w-full rounded-xl border border-line px-4 text-[0.9375rem] text-ink outline-none focus:border-accent';

export default function ChangeEmailModal({ open, currentEmail, profileId, onClose, onChanged }) {
  const titleId = useId();
  const [step, setStep] = useState('form'); // form | verify | confirm | done
  const [nextEmail, setNextEmail] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep('form');
    setNextEmail('');
    setCode('');
    setSaving(false);
    setErrorMsg('');
    setSent(false);
  }, [open]);

  const emailValid = isValidEmail(nextEmail) && nextEmail.trim().toLowerCase() !== String(currentEmail || '').toLowerCase();

  // 인증번호 발송 — updateUser({ email }) 이 곧 발송 트리거다.
  const sendCode = useCallback(async () => {
    if (saving || !emailValid) return;
    setSaving(true);
    setErrorMsg('');

    const { error } = await supabase.auth.updateUser({ email: nextEmail.trim() });
    setSaving(false);

    if (error) {
      console.error('이메일 변경 요청 실패:', error);
      setErrorMsg(
        /already|registered|exists/i.test(error.message || '')
          ? '이미 사용 중인 이메일이에요.'
          : '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.'
      );
      return;
    }

    setSent(true);
    setStep('verify');
  }, [saving, emailValid, nextEmail]);

  // 코드 검증 → 변경 확정.
  const verify = useCallback(async () => {
    if (saving || code.trim().length === 0) return;
    setSaving(true);
    setErrorMsg('');

    const { error } = await supabase.auth.verifyOtp({
      email: nextEmail.trim(),
      token: code.trim(),
      type: 'email_change'
    });

    if (error) {
      console.error('이메일 인증 실패:', error);
      setSaving(false);
      setErrorMsg('인증번호가 올바르지 않거나 만료됐어요.');
      return;
    }

    // profiles.email 미러 갱신(위 주석). 실패해도 auth 쪽 변경은 끝났으므로
    // 흐름을 막지 않고 경고만 남긴다 — 다음 로그인 때 화면이 옛 주소를 보일 수
    // 있어 콘솔에 남겨 추적 가능하게 한다.
    if (profileId) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ email: nextEmail.trim().toLowerCase(), updated_at: new Date().toISOString() })
        .eq('id', profileId);
      if (profileError) console.warn('profiles.email 갱신 실패:', profileError.message);
    }

    setSaving(false);
    setStep('done');
    onChanged?.(nextEmail.trim());
  }, [saving, code, nextEmail, profileId, onChanged]);

  if (!open) return null;

  if (step === 'done') {
    return (
      <MyPageModalShell open={open} onClose={onClose} labelledBy={titleId} className="w-[26rem]">
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <h2 id={titleId} className="text-[1.25rem] font-bold leading-[1.4] text-ink-title">
            변경이 완료됐어요
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="mt-7 h-[2.5rem] w-[9.375rem] rounded-lg bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90"
          >
            확인
          </button>
        </div>
      </MyPageModalShell>
    );
  }

  if (step === 'confirm') {
    return (
      <MyPageModalShell open={open} onClose={onClose} labelledBy={titleId} className="w-[26rem]">
        <div className="flex flex-col items-center px-6 py-9 text-center">
          <h2 id={titleId} className="text-[1.25rem] font-bold leading-[1.4] text-ink-title">
            정말 변경하시겠어요?
          </h2>
          <p className="mt-4 break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
            이메일이 {nextEmail.trim()}으로 변경돼요.
          </p>

          {errorMsg && <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>}

          <div className="mt-7 grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStep('verify')}
              className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
            >
              취소
            </button>
            <button
              type="button"
              onClick={verify}
              disabled={saving}
              className="h-12 rounded-xl bg-primary text-[0.875rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? '변경 중...' : '변경할게요'}
            </button>
          </div>
        </div>
      </MyPageModalShell>
    );
  }

  const isVerifyStep = step === 'verify';

  return (
    <MyPageModalShell open={open} onClose={onClose} labelledBy={titleId} className="w-[26rem]">
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2 id={titleId} className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-title">
          이메일을 변경해요
        </h2>
        <p className="mt-3 text-center text-[0.8125rem] leading-[1.6] text-ink-sub">
          결제 영수증이 이 주소로 발송돼요.
        </p>

        <div className="mt-7">
          <span className="text-[0.8125rem] font-semibold text-ink">현재 이메일</span>
          <div className={`mt-2 ${FIELD_CLASS} flex items-center bg-surface-footer text-ink-sub`}>
            {currentEmail || '-'}
          </div>
        </div>

        <label className="mt-5 block">
          {/* 시안 라벨 '새 이메일 번호' → 복붙 오타로 판단해 고쳤다(상단 주석). */}
          <span className="text-[0.8125rem] font-semibold text-ink">새 이메일</span>
          <div className="mt-2 flex gap-2">
            <input
              type="email"
              autoComplete="email"
              value={nextEmail}
              onChange={(e) => {
                setNextEmail(e.target.value);
                setErrorMsg('');
              }}
              readOnly={isVerifyStep}
              placeholder="example@email.com"
              className={`${FIELD_CLASS} ${isVerifyStep ? 'bg-surface-footer text-ink-sub' : ''}`}
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={!emailValid || saving}
              className={`h-[3.25rem] shrink-0 whitespace-nowrap rounded-xl px-4 text-[0.8125rem] font-semibold transition ${
                emailValid && !saving
                  ? 'bg-primary text-white hover:opacity-90'
                  : 'cursor-not-allowed bg-line text-white'
              }`}
            >
              {sent ? '다시 보내기' : '인증번호 보내기'}
            </button>
          </div>
        </label>

        {isVerifyStep && (
          <label className="mt-5 block">
            <span className="text-[0.8125rem] font-semibold text-ink">이메일 인증번호</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setErrorMsg('');
              }}
              placeholder="이메일로 보낸 인증번호를 입력해주세요"
              className={`mt-2 ${FIELD_CLASS}`}
            />
          </label>
        )}

        {errorMsg && <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2 px-6 py-5">
        <button
          type="button"
          onClick={onClose}
          className="h-12 rounded-xl bg-surface-footer text-[0.875rem] font-semibold text-ink-sub transition hover:bg-line/30"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => setStep('confirm')}
          disabled={!isVerifyStep || code.trim().length === 0 || saving}
          className={`h-12 rounded-xl text-[0.875rem] font-semibold text-white transition ${
            isVerifyStep && code.trim().length > 0 && !saving
              ? 'bg-primary hover:opacity-90'
              : 'cursor-not-allowed bg-line'
          }`}
        >
          변경하기
        </button>
      </div>
    </MyPageModalShell>
  );
}
