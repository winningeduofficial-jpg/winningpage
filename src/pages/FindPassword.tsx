// [신규] 비밀번호 찾기(재설정 링크 요청) — QA 지시 2026-08-21, 로그인 화면(Login.tsx)
// 하단 "비밀번호 찾기" 링크의 목적지.
//
// Supabase의 resetPasswordForEmail을 그대로 쓴다 — 이메일로 재설정 링크를 보내고,
// 사용자가 그 링크를 열면 /login/reset-password(ResetPassword.tsx)로 이동해 새
// 비밀번호를 정한다.
//
// 계정 존재 여부를 노출하지 않는다
//   Supabase는 존재하지 않는 이메일에 대해서도 성공을 반환하는 것이 기본 동작이지만,
//   혹시 에러가 나더라도 사용자에게는 항상 "보냈다" 톤으로만 안내한다. 계정이
//   있는지 없는지를 이 화면에서 구분해 보여주면 이메일 등록 여부를 추측하는
//   경로가 된다.
import { useState } from "react";
import {
  AuthLayout,
  AuthTitle,
  PrimaryButton,
  TextField,
  TextLinkButton,
} from "@/components/auth";
import { useCooldown } from "@/hooks/useCooldown";
import { supabase } from "@/lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECONDS = 60;

type FieldStatus = "default" | "error" | "success";

export default function FindPassword() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<FieldStatus>("default");
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS);

  async function handleSend() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setMessage("이메일 형식이 올바르지 않습니다.");
      setStatus("error");
      return;
    }

    if (cooldown.active) {
      setMessage(`${cooldown.remaining}초 후에 다시 보낼 수 있어요.`);
      setStatus("error");
      return;
    }

    setSending(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: `${window.location.origin}/login/reset-password` },
      );

      // 계정이 없어도, 발송이 실패해도 사용자에게는 같은 안내만 보여준다
      // (파일 상단 주석). 실패는 콘솔에만 남긴다.
      if (error) console.error("비밀번호 재설정 메일 발송 오류:", error);
    } finally {
      setSending(false);
      cooldown.start();
      setMessage(
        "입력하신 이메일로 비밀번호 재설정 링크를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.",
      );
      setStatus("success");
    }
  }

  return (
    <AuthLayout>
      <AuthTitle
        line1="비밀번호를 잊으셨나요?"
        line2="가입하신 이메일로 재설정 링크를 보내드려요"
        line2Color="ink"
      />

      <div className="flex w-full flex-col gap-5">
        <TextField
          label="이메일"
          id="find-password-email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="가입하신 이메일을 입력해 주세요"
          helperText={message}
          status={status}
          autoComplete="email"
          required
        />

        <PrimaryButton
          onClick={handleSend}
          disabled={sending || cooldown.active}
          loading={sending}
        >
          {cooldown.active
            ? `${cooldown.remaining}초 후 다시 보내기`
            : "재설정 링크 보내기"}
        </PrimaryButton>
      </div>

      <TextLinkButton as="link" to="/login" tone="ink" size="xs" weight="bold">
        로그인으로 돌아가기
      </TextLinkButton>
    </AuthLayout>
  );
}
