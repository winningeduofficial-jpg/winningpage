import { useCallback, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import MyPageModalShell from "./MyPageModalShell";
import ModalFooter from "./modal/ModalFooter";

// 소속코드 입력·수정 모달 — 가입 시 소속코드(profiles.org_code)를 입력하지
// 않은 학생이 나중에 입력/수정할 수 있게 한다(2026-09-01). 입력하면 결제
// 화면에서 소속 한정 특가가 노출된다(products.org_code 매칭,
// supabase/migrations/20260831020402_coupon_org_code.sql 계열).
//
// 이메일·휴대폰 변경 모달과 달리 인증 단계가 없다 — 가입 폼(StudentForm.tsx
// "소속코드 (선택)")과 마찬가지로 검증 규칙이 없는 자유 텍스트라(QA
// 2026-08-22, profiles.org_code 컬럼 코멘트) 본인 확인·OTP 없이 즉시 저장한다.
// RefundRequestModal처럼 폼 단계 하나만 있는 단순 모달 골격을 따른다.
//
// 저장 값은 trim만 한다 — 대문자 정규화(upper)는 강제하지 않는다(팀 리드
// 지시, "검증 규칙 없음"). fn_coupon_org_matches가 비교 시점에 upper(trim())을
// 방어적으로 적용하므로 대소문자가 섞여 저장돼도 매칭에는 영향이 없다.
const ORG_CODE_MAX_LENGTH = 50;

const FIELD_CLASS =
  "h-13 w-full rounded-xl border border-line px-4 text-[0.9375rem] text-ink outline-hidden focus:border-accent";

type OrgCodeModalProps = {
  open: boolean;
  profileId?: string | undefined;
  currentOrgCode?: string | null | undefined;
  onClose: () => void;
  onChanged?: (orgCode: string) => void;
};

export default function OrgCodeModal({
  open,
  profileId,
  currentOrgCode,
  onClose,
  onChanged,
}: OrgCodeModalProps) {
  const [orgCode, setOrgCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setOrgCode(currentOrgCode || "");
    setSaving(false);
    setErrorMsg("");
  }, [open, currentOrgCode]);

  const trimmed = orgCode.trim();
  const canSubmit =
    !saving && profileId !== undefined && trimmed !== (currentOrgCode || "");

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || profileId === undefined) return;
    setSaving(true);
    setErrorMsg("");

    const { error } = await supabase
      .from("profiles")
      .update({
        org_code: trimmed || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    setSaving(false);

    if (error) {
      console.error("소속코드 저장 실패:", error);
      setErrorMsg("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    onChanged?.(trimmed);
    onClose();
  }, [canSubmit, profileId, trimmed, onChanged, onClose]);

  if (!open) return null;

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="sm"
      title="소속코드를 입력해주세요"
      footer={
        <ModalFooter
          buttons={[
            {
              key: "cancel",
              label: "취소",
              variant: "neutral",
              onClick: onClose,
            },
            {
              key: "submit",
              label: saving ? "저장 중..." : "저장",
              variant: "primary",
              disabled: !canSubmit,
              onClick: handleSubmit,
            },
          ]}
        />
      }
    >
      <ScrollArea className="flex-1 px-6">
        <label className="mt-6 block">
          <span className="text-[0.8125rem] font-semibold text-ink">
            소속코드
          </span>
          <input
            type="text"
            value={orgCode}
            onChange={(e) => {
              setOrgCode(e.target.value);
              setErrorMsg("");
            }}
            placeholder="소속코드가 없으면 입력하지 마세요"
            maxLength={ORG_CODE_MAX_LENGTH}
            className={`mt-2 ${FIELD_CLASS}`}
          />
        </label>
        <p className="mt-2 text-xs text-ink-sub">
          소속코드가 없으면 입력하지 마세요
        </p>

        {errorMsg && (
          <p className="mt-4 text-[0.8125rem] text-error">{errorMsg}</p>
        )}
      </ScrollArea>
    </MyPageModalShell>
  );
}
