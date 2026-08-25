import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import MyPageModalShell from "./MyPageModalShell";

// 학부모 연결 해제 재확인 모달 — QA 요구(2026-08-22)로 추가. 기존에는 "연결 해제"
// 버튼 클릭 즉시 revoke_parent_link RPC를 호출했는데, 되돌리기 번거로운 조작이라
// 비밀번호 재확인 한 단계를 끼운다.
//
// 비밀번호 확인 방법은 ChangePasswordModal.tsx와 동일하다 — supabase.auth.updateUser는
// 현재 비밀번호를 검사하지 않으므로, 같은 계정으로 signInWithPassword를 한 번 태워서
// 맞는지 확인한다(성공해도 같은 사용자의 세션이 갱신될 뿐 로그인 상태는 깨지지 않는다).
const FIELD_CLASS =
  "h-13 w-full rounded-xl border border-line px-4 text-[0.9375rem] text-ink outline-hidden focus:border-accent";

type UnlinkParentModalProps = {
  open: boolean;
  linkId: string | null;
  onClose: () => void;
  /** RPC 성공 후 ProfileTab의 parentLink 상태를 즉시 갱신하도록 알린다. */
  onSuccess: () => void;
};

export default function UnlinkParentModal({
  open,
  linkId,
  onClose,
  onSuccess,
}: UnlinkParentModalProps) {
  const titleId = useId();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 닫힐 때마다 입력을 초기화한다(다음에 열었을 때 이전 비밀번호·에러가 남지 않도록).
  useEffect(() => {
    if (!open) return;
    setPassword("");
    setSubmitting(false);
    setErrorMsg("");
  }, [open]);

  const submit = useCallback(async () => {
    if (submitting || !linkId || !password) return;
    setSubmitting(true);
    setErrorMsg("");

    // 1) 현재 비밀번호 재인증. 로그인 이메일은 세션에서 직접 읽는다 — 상위가 넘겨주는
    //    값은 profiles.email(프로필 미러)이라 auth 로그인 이메일과 다를 수 있고, 다르면
    //    비밀번호가 맞아도 잘못된 안내를 하게 된다(ChangePasswordModal.tsx와 같은 이유).
    const { data: sessionUser } = await supabase.auth.getUser();
    const authEmail = sessionUser?.user?.email;

    if (!authEmail) {
      setSubmitting(false);
      setErrorMsg("로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.");
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });
    if (authError) {
      console.error("연결 해제 전 비밀번호 확인 실패:", authError);
      setSubmitting(false);
      setErrorMsg("비밀번호가 올바르지 않습니다.");
      return;
    }

    // 2) 실제 연결 해제 — sql/40_auth_signup.sql의 revoke_parent_link RPC(본인 소유
    //    링크만 revoked 처리, 실제 삭제 아님·재요청 가능)를 그대로 호출한다.
    const { error } = await supabase.rpc("revoke_parent_link", {
      p_link_id: linkId,
    });
    setSubmitting(false);
    if (error) {
      console.error("학부모 연결 해제 실패:", error);
      setErrorMsg("연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    onSuccess();
    onClose();
  }, [submitting, linkId, password, onSuccess, onClose]);

  if (!open) return null;

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="w-104"
    >
      <div className="flex-1 overflow-y-auto px-6 pt-8">
        <h2
          id={titleId}
          className="text-center text-[1.25rem] font-bold leading-[1.4] text-ink-title"
        >
          학부모 연결을 해제할까요?
        </h2>
        <p className="mt-4 whitespace-pre-line break-keep text-center text-[0.875rem] leading-[1.6] text-ink-sub">
          연결을 해제하면 부모님과의 연동이 해제되며, 리포트 등의 정보를 공유할
          수 없습니다.
        </p>

        <label className="mt-7 block">
          <span className="text-[0.8125rem] font-semibold text-ink">
            현재 비밀번호
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrorMsg("");
            }}
            placeholder="현재 비밀번호를 입력해주세요"
            className={`mt-2 ${FIELD_CLASS}`}
          />
        </label>

        {errorMsg && (
          <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
        )}
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
          onClick={submit}
          disabled={submitting || !password}
          className={`h-12 rounded-xl text-[0.875rem] font-semibold text-white transition ${
            submitting || !password
              ? "cursor-not-allowed bg-line"
              : "bg-primary hover:opacity-90"
          }`}
        >
          {submitting ? "해제 중..." : "연결 해제"}
        </button>
      </div>
    </MyPageModalShell>
  );
}
