import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { EMAIL_RESEND_COOLDOWN_SECONDS } from "@/lib/signupEmailAuth";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// 아이디·비밀번호 찾기 — 와이어프레임 구조판.
//
// ⚠️ 디자인은 아직 안 나왔다(2026-08-22). 이 파일은 **구조와 플로우만** 맞춰둔
//   것이고, 시안이 나오면 마크업·클래스만 갈아끼우면 되도록 상태와 API 호출을
//   컴포넌트 상단에 모아뒀다. 레이아웃 요소에는 의미 있는 이름만 두고 스타일은
//   최소로 유지한다 — 지금 공들여 꾸미면 내일 전부 버린다.
//
// 구조(와이어프레임): 탭 2개 × 아코디언 2개
//   [아이디 찾기]  ├ 등록된 휴대전화번호로 찾기
//                  └ 등록된 이메일로 찾기
//   [비밀번호 찾기] ├ 등록된 휴대전화번호로 찾기   (+ 아이디 입력)
//                  └ 등록된 이메일로 찾기         (+ 아이디 입력)
//
// 생년월일을 받지 않는다 (사용자 확정 2026-08-22)
//   와이어프레임에는 생년월일 셀렉트가 있지만 profiles.birth_date 가 가입 경로로
//   채워지지 않는다 — complete_signup_profile 인자에 없고(학생은 만 14세 판정에만
//   쓰고 버린다), 학부모 가입은 받지도 않는다. 조회 조건에 넣으면 전 회원이 자기
//   아이디를 못 찾는다. 인증 통과 자체가 본인 확인이라 보안상으로도 충분하다.
//   ⚠️ 시안을 입힐 때 생년월일 필드를 되살리지 말 것 — 되살리려면 가입 흐름부터
//   고쳐야 하고, 그래도 기존 회원은 구제되지 않는다.
//
// 두 채널의 인증 방식이 다르다
//   휴대폰 : /api/send-phone-code → /api/verify-phone-code (purpose='find_account').
//            세션이 생기지 않으므로 결과 조회·비밀번호 변경도 서버 라우트를 쓴다.
//   이메일 : Supabase Auth OTP(Magic Link 템플릿). 통과하면 **세션이 생기므로**
//            비밀번호 변경은 서버를 거칠 필요 없이 supabase.auth.updateUser 로 끝난다.
//
//            ⚠️ 가입 모듈(sendSignupEmailCode)을 재사용하지 않는다. 그쪽은 계정을
//            **만드는** 경로라 이미 가입된 이메일이면 state='taken' 으로 조기
//            반환하고 발송 자체를 하지 않는다 — 찾기는 정확히 그 반대 조건이다.
//            그래서 shouldCreateUser:false 로 직접 부른다(없는 이메일로는 계정이
//            생기지 않는다).
// ---------------------------------------------------------------------------

type TabKey = "id" | "password";
type Channel = "phone" | "email";

const MEMBER_TYPES = [
  { value: "student", label: "학생회원" },
  { value: "parent", label: "학부모회원" },
];

export default function FindAccount() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab: TabKey =
    searchParams.get("tab") === "password" ? "password" : "id";
  const [channel, setChannel] = useState<Channel>("phone");

  const [memberType, setMemberType] = useState("student");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{
    username: string;
    joinedAt: string;
  } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  function switchTab(next: TabKey) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("tab", next);
      return params;
    });
    reset();
  }

  function reset() {
    setCodeSent(false);
    setVerified(false);
    setCode("");
    setMessage("");
    setResult(null);
    setNewPassword("");
    setNewPasswordConfirm("");
  }

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      if (channel === "phone") {
        const digits = phone.replace(/[^0-9]/g, "");
        const response = await fetch("/api/send-phone-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: digits, purpose: "find_account" }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(data?.detail || "발송에 실패했습니다.");
        setCodeSent(true);
        setMessage("인증번호를 발송했습니다.");
      } else {
        // shouldCreateUser:false — 없는 이메일을 넣어도 계정이 생기지 않는다.
        // (있는지 없는지를 응답으로 구분해주지도 않는다 — 계정 존재 여부가
        //  새는 걸 막는 Supabase 기본 동작이라 그대로 둔다.)
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false },
        });
        if (error) throw new Error(error.message);
        setCodeSent(true);
        setMessage(
          `인증번호를 발송했습니다. ${EMAIL_RESEND_COOLDOWN_SECONDS}초 후 재발송할 수 있습니다.`,
        );
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      if (channel === "phone") {
        const digits = phone.replace(/[^0-9]/g, "");
        const response = await fetch("/api/verify-phone-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: digits,
            code: code.trim(),
            purpose: "find_account",
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.verified) {
          throw new Error(data?.detail || "인증번호가 올바르지 않습니다.");
        }
      } else {
        // 기존 계정에 보낸 OTP 는 Magic Link 템플릿이라 type 이 'email' 이다
        // (가입 확인 메일의 'signup' 과 다르다).
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code.trim(),
          type: "email",
        });
        if (error) throw new Error(error.message);
      }

      setVerified(true);
      setMessage("인증되었습니다.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function findId() {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // 이메일 경로는 인증이 곧 세션이다 — 그 토큰이 본인 증명이 된다.
      if (channel === "email") {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("이메일 인증이 만료되었습니다.");
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch("/api/find-account", {
        method: "POST",
        headers,
        body: JSON.stringify({
          channel,
          memberType,
          name: name.trim(),
          phone: phone.replace(/[^0-9]/g, ""),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || "조회에 실패했습니다.");

      setResult({ username: data.username, joinedAt: data.joinedAt });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword() {
    if (busy) return;

    if (newPassword.length < 6) {
      setMessage("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setMessage("비밀번호가 일치하지 않습니다.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      if (channel === "email") {
        // 세션이 있으므로 클라이언트가 바로 바꾼다(서버 라우트 불필요).
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (error) throw new Error(error.message);
        // 재설정 후에는 로그인 화면으로 보낸다 — 인증용으로 생긴 세션을 그대로
        // 두면 "비밀번호를 바꿨는데 이미 로그인돼 있는" 어정쩡한 상태가 된다.
        await supabase.auth.signOut();
      } else {
        const response = await fetch("/api/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: phone.replace(/[^0-9]/g, ""),
            username: username.trim(),
            password: newPassword,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || "비밀번호 변경에 실패했습니다.");
        }
      }

      alert("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.");
      navigate("/login", { replace: true });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isPassword = tab === "password";

  return (
    <main className="mx-auto w-full max-w-[640px] px-5 py-12">
      {/* 탭 */}
      <div className="flex border-b">
        {[
          { key: "id" as const, label: "아이디 찾기" },
          { key: "password" as const, label: "비밀번호 찾기" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => switchTab(item.key)}
            className={`flex-1 py-3 text-sm font-bold ${
              tab === item.key
                ? "border-b-2 border-[#2348ff] text-[#2348ff]"
                : "text-gray-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 아이디 찾기 결과 — 인증을 통과했으므로 아이디를 전부 보여준다. */}
      {result ? (
        <div className="mt-8 border p-6 text-center">
          <p className="text-sm text-gray-600">
            입력한 정보와 일치하는 아이디입니다.
          </p>
          <p className="mt-3 text-xl font-black">{result.username}</p>
          <p className="mt-2 text-xs text-gray-500">
            가입일 {new Date(result.joinedAt).toLocaleDateString("ko-KR")}
          </p>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="flex-1 border py-3 text-sm font-bold"
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                switchTab("password");
              }}
              className="flex-1 bg-[#2348ff] py-3 text-sm font-bold text-white"
            >
              비밀번호 재설정
            </button>
          </div>
        </div>
      ) : verified && isPassword ? (
        // 비밀번호 재설정 폼
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-black">비밀번호 재설정</h2>

          <label className="block">
            <span className="text-sm font-bold">비밀번호</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full border px-3 py-2 text-sm"
              placeholder="영문/특수문자 조합 6자 이상"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold">비밀번호 재입력</span>
            <input
              type="password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              className="mt-1 w-full border px-3 py-2 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={submitNewPassword}
            disabled={busy}
            className="w-full bg-[#2348ff] py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            변경하기
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {/* 아코디언 2개 — 채널 선택 */}
          <div className="flex gap-2">
            {[
              { key: "phone" as const, label: "등록된 휴대전화번호로 찾기" },
              { key: "email" as const, label: "등록된 이메일로 찾기" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setChannel(item.key);
                  reset();
                }}
                className={`flex-1 border py-2 text-sm font-bold ${
                  channel === item.key
                    ? "border-[#2348ff] text-[#2348ff]"
                    : "text-gray-500"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* 회원구분 */}
          <div>
            <span className="text-sm font-bold">회원구분</span>
            <div className="mt-1 flex gap-2">
              {MEMBER_TYPES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMemberType(item.value)}
                  className={`flex-1 border py-2 text-sm font-bold ${
                    memberType === item.value
                      ? "border-[#2348ff] bg-[#2348ff] text-white"
                      : "text-gray-600"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-bold">이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border px-3 py-2 text-sm"
              placeholder="한글만 입력 가능"
            />
          </label>

          {/* 비밀번호 찾기에서만 아이디를 받는다 — 한 번호에 학생·학부모 계정이
              따로 있을 수 있어 대상이 특정되어야 한다. */}
          {isPassword && (
            <label className="block">
              <span className="text-sm font-bold">아이디</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full border px-3 py-2 text-sm"
                placeholder="공백 없이 영문/숫자 6~15자"
              />
            </label>
          )}

          <div>
            <span className="text-sm font-bold">
              {channel === "phone" ? "휴대전화번호" : "이메일 주소"}
            </span>
            <div className="mt-1 flex gap-2">
              <input
                value={channel === "phone" ? phone : email}
                onChange={(e) =>
                  channel === "phone"
                    ? setPhone(e.target.value)
                    : setEmail(e.target.value)
                }
                className="flex-1 border px-3 py-2 text-sm"
                placeholder={
                  channel === "phone"
                    ? "(-) 없이 지역번호 포함 숫자"
                    : "이메일 주소를 입력하세요."
                }
              />
              <button
                type="button"
                onClick={sendCode}
                disabled={busy}
                className="whitespace-nowrap border border-[#2348ff] px-4 text-sm font-bold text-[#2348ff] disabled:opacity-50"
              >
                인증번호 전송
              </button>
            </div>
          </div>

          {codeSent && !verified && (
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="flex-1 border px-3 py-2 text-sm"
                placeholder="인증번호"
              />
              <button
                type="button"
                onClick={verifyCode}
                disabled={busy}
                className="whitespace-nowrap border px-4 text-sm font-bold disabled:opacity-50"
              >
                확인
              </button>
            </div>
          )}

          {message && <p className="text-sm text-[#B88737]">{message}</p>}

          {!isPassword && (
            <button
              type="button"
              onClick={findId}
              disabled={busy || !verified}
              className="w-full bg-[#2348ff] py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              아이디 찾기
            </button>
          )}
        </div>
      )}
    </main>
  );
}
