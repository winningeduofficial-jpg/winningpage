// [신규] 새 비밀번호 설정 — QA 지시 2026-08-21, FindPassword.tsx가 보낸 이메일의
// 재설정 링크가 도착하는 화면(redirectTo: `${origin}/login/reset-password`).
//
// Supabase 클라이언트는 이 URL을 열면(detectSessionInUrl 기본값 true) 링크에 담긴
// recovery 토큰을 스스로 감지해 임시 세션을 만들고 'PASSWORD_RECOVERY' 이벤트를
// 쏜다. 그 세션이 있어야만 updateUser({ password })가 통과한다 — 로그인 세션이
// 아니라 이 한 번의 비밀번호 변경만을 위한 임시 세션이다.
//
// 링크가 만료됐거나 이미 사용된 경우 이벤트가 오지 않으므로, 일정 시간 안에
// 세션이 감지되지 않으면 "링크가 유효하지 않다"는 안내로 전환한다.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AuthLayout,
  AuthTitle,
  InfoCard,
  PrimaryButton,
  TextField,
} from "@/components/auth";
import { supabase } from "@/lib/supabase";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
// 이메일 링크 클릭 → 이 페이지 로드 → Supabase가 세션을 만드는 데 걸리는 시간을
// 넉넉히 준다. 이 시간이 지나도 세션이 없으면 링크 자체가 무효한 것으로 본다.
const RECOVERY_WAIT_TIMEOUT_MS = 4000;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const readyRef = useRef(false);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    let cancelled = false;

    // onAuthStateChange 구독 전에 이미 세션이 만들어졌을 수 있어(마운트 타이밍),
    // 초기 상태를 한 번 직접 확인한다.
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    const timer = window.setTimeout(() => {
      if (!cancelled && !readyRef.current) setExpired(true);
    }, RECOVERY_WAIT_TIMEOUT_MS);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const passwordValid = password ? PASSWORD_REGEX.test(password) : null;
  const canSubmit =
    !submitting &&
    password.length > 0 &&
    passwordValid === true &&
    password === passwordConfirm;

  async function handleSubmit() {
    setFormError("");

    if (passwordValid === false) {
      setFormError(
        "비밀번호는 영문, 숫자, 특수문자를 모두 포함해 6자 이상 입력해 주세요.",
      );
      return;
    }

    if (password !== passwordConfirm) {
      setFormError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setFormError(
          error.message || "비밀번호 변경에 실패했습니다. 다시 시도해 주세요.",
        );
        return;
      }

      setDone(true);

      // 재설정에 쓰인 임시 recovery 세션을 남겨두지 않는다 — 방금 정한
      // 비밀번호로 다시 로그인하게 한다(로그인 폼의 signInWithPassword가
      // 세션을 새로 만든다).
      await supabase.auth.signOut();
    } finally {
      setSubmitting(false);
    }
  }

  if (expired) {
    return (
      <AuthLayout>
        <AuthTitle line1="링크가 만료됐어요" />

        <InfoCard variant="info">
          비밀번호 재설정 링크가 만료됐거나 이미 사용됐어요. 다시 요청해 주세요.
        </InfoCard>

        <PrimaryButton onClick={() => navigate("/login/find-password")}>
          재설정 링크 다시 받기
        </PrimaryButton>
      </AuthLayout>
    );
  }

  if (!ready) {
    return (
      <AuthLayout>
        <AuthTitle line1="링크를 확인하고 있어요" />
        <p className="text-center text-sm text-ink-sub">
          잠시만 기다려 주세요...
        </p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <AuthTitle line1="비밀번호가 변경됐어요" />

        <p className="text-center text-sm text-ink">
          새 비밀번호로 다시 로그인해 주세요.
        </p>

        <PrimaryButton onClick={() => navigate("/login")}>
          로그인하러 가기
        </PrimaryButton>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthTitle line1="새 비밀번호를 설정해 주세요" />

      <div className="flex w-full flex-col gap-5">
        <TextField
          label="새 비밀번호"
          id="reset-password"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="새 비밀번호를 입력해 주세요"
          helperText="영문/숫자/특수문자 포함 6자 이상"
          status={
            passwordValid === null
              ? "default"
              : passwordValid
                ? "success"
                : "error"
          }
          autoComplete="new-password"
          required
        />

        <TextField
          label="새 비밀번호 확인"
          id="reset-password-confirm"
          name="passwordConfirm"
          type="password"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          placeholder="새 비밀번호를 한 번 더 입력해 주세요"
          status={
            passwordConfirm.length === 0
              ? "default"
              : passwordConfirm === password
                ? "success"
                : "error"
          }
          autoComplete="new-password"
          required
        />
      </div>

      {formError && (
        <p role="alert" className="w-full text-center text-sm text-error">
          {formError}
        </p>
      )}

      <PrimaryButton
        disabled={!canSubmit}
        loading={submitting}
        onClick={handleSubmit}
      >
        {submitting ? "변경 처리 중..." : "비밀번호 변경하기"}
      </PrimaryButton>
    </AuthLayout>
  );
}
