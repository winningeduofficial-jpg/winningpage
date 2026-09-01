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

/**
 * "서버가 못 보낸 것"인지 판정한다. 계정 존재 여부와 무관한 실패만 true 다.
 *
 * 왜 구분하나 — 실제로 당한 사고 (2026-08-23)
 *   dev 의 SMTP 자격증명이 틀어져 `/auth/v1/recover` 가 **500** 을 뱉고 있었는데,
 *   이 화면은 실패를 통째로 삼키고 "보냈어요"만 띄웠다. 메일은 한 통도 안 나갔는데
 *   사용자는 오지 않는 메일을 기다리며 스팸함만 뒤지게 된다 — 실제 사용자였으면
 *   계정을 영영 못 찾는다.
 *
 *   "계정이 없다"는 계속 숨겨야 맞다(그걸 구분해 보여주면 이메일 등록 여부를
 *   캐는 경로가 된다). 하지만 5xx 는 **어떤 계정 정보도 담고 있지 않으므로**
 *   사실대로 알려도 그 원칙이 깨지지 않는다.
 *
 * AuthRetryableFetchError 는 auth-js 가 네트워크 오류와 500·501·502·503·504,
 * Cloudflare 520~530 을 묶어 던지는 타입이다. status 를 못 읽는 경우까지 덮으려고
 * 이름과 status 둘 다 본다.
 */
export function isServerFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; status?: number };
  if (candidate.name === "AuthRetryableFetchError") return true;
  return typeof candidate.status === "number" && candidate.status >= 500;
}

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

    let serverFailed = false;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: `${window.location.origin}/login/reset-password` },
      );

      // 계정이 없는 경우에는 실패를 숨긴다(파일 상단 주석). 서버 장애는 숨기지
      // 않는다 — 아래 isServerFailure 주석 참고.
      if (error) {
        console.error("비밀번호 재설정 메일 발송 오류:", error);
        serverFailed = isServerFailure(error);
      }
    } finally {
      setSending(false);

      if (serverFailed) {
        // 쿨다운을 걸지 않는다 — 아예 발송되지 않았으므로 60초를 기다리게 할
        // 이유가 없다. 남용은 Supabase 쪽 rate limit 이 계속 막는다.
        setMessage(
          "지금은 메일을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요. 계속되면 고객센터로 문의해 주세요.",
        );
        setStatus("error");
      } else {
        cooldown.start();
        setMessage(
          "입력하신 이메일로 비밀번호 재설정 링크를 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.",
        );
        setStatus("success");
      }
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
