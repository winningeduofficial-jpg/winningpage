// 멘토 지원서 §5-3 약관 동의 블록 — docs/mentor-apply-spec.md § 폼 명세 섹션 5 / § 재사용 매핑 B.
//
// src/components/auth/AgreementList.jsx + AgreementRow.jsx 를 그대로 본떴다(마크업 구조,
// role="checkbox" + aria-checked 패턴, "모두 동의" 시 index 기반 stagger 팝인까지 동일).
// 그런데도 재사용이 아니라 신규 파일인 이유는 회귀 위험 때문이다 — auth 쪽 두 파일은 로그인·
// 회원가입 플로우(학생 6항목 / 학부모 4항목)가 쓰고 있어서 우측 어포던스를 바꾸면 그 화면들이
// 같이 깨진다. 데이터 계약(`[{ key, label, required, to }]`)은 완전히 동일하므로 MENTOR_AGREEMENTS
// 를 그대로 넘길 수 있다.
//
// auth 판과 다른 점은 시안(3386:4538)이 요구하는 표현 3가지뿐이다.
//   ① 우측 어포던스: ChevronRight 아이콘 → `내용보기` 밑줄 텍스트(14 Medium ink.sub, 폭 140)
//   ② 전체동의 행: 보더 있는 독립 박스(radius 8) + 항목 리스트는 보더 없는 별도 컨테이너
//   ③ 체크 상태 관리 주체: auth 판은 `items[].checked` 를 받지만 이쪽은 지시된 props 계약대로
//      `values` 맵에서 읽는다(폼 전체 상태가 하나의 객체이므로 items 를 매 렌더 재조립하지 않게 함)
//
// `내용보기` 는 모달이 아니라 풀페이지 라우트 이동이다(명세 확인 항목 30에서 라우트로 확정 —
// 근거: Figma 주석 노드 2393:6156 + AgreementRow 의 기존 `<Link to>` 관례). `to` 는
// MENTOR_AGREEMENTS 가 /terms/student/* 로 이미 매핑해 둔 기존 라우트를 가리킨다.

import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AGREEMENT_COPY } from "../../data/mentorApply";

// 시안 색은 필수 #0B84FD(accent) / 선택 #D9D9D9 다. 선택 배지에 #D9D9D9(=line 토큰) 을 그대로
// 쓰면 흰 배경 대비 1.38:1 로 판독이 불가능해, AgreementRow.jsx 의 선례("text-line은 대비
// 1.38:1로 판독 불가라 상향")를 따라 ink.sub(#808080)로 올렸다.
const BADGE_CLASSES = {
  required: "text-accent",
  optional: "text-ink-sub",
};

type AgreementItem = {
  key: string;
  label: string;
  required: boolean;
  to?: string;
};

type MentorAgreementBlockProps = {
  /** [{ key, label, required, to }] — src/data/mentorApply.js MENTOR_AGREEMENTS */
  items?: AgreementItem[];
  /** { [key]: boolean } */
  values?: Record<string, boolean>;
  onToggle?: (key: string) => void;
  onToggleAll?: () => void;
  /** 필수 항목 미동의 시 표시할 메시지(시안에 에러 상태 없음 — 확인 항목 25) */
  error?: string;
};

export default function MentorAgreementBlock({
  items, // [{ key, label, required, to }] — src/data/mentorApply.js MENTOR_AGREEMENTS
  values, // { [key]: boolean }
  onToggle, // (key) => void
  onToggleAll, // () => void
  error, // 필수 항목 미동의 시 표시할 메시지(시안에 에러 상태 없음 — 확인 항목 25)
}: MentorAgreementBlockProps) {
  const list = items || [];
  const allChecked =
    list.length > 0 && list.every((item) => Boolean(values?.[item.key]));

  // AgreementList.jsx 와 동일한 batch stagger — "모두 동의합니다"로 한꺼번에 체크될 때만
  // 행마다 40ms 씩 밀어 체크마크를 순차 팝인시킨다(개별 클릭은 그 행만 즉시 반응).
  const [batchAnimating, setBatchAnimating] = useState(false);

  useEffect(() => {
    if (!batchAnimating) return undefined;

    const timer = window.setTimeout(
      () => setBatchAnimating(false),
      list.length * 40 + 260,
    );
    return () => window.clearTimeout(timer);
  }, [batchAnimating, list.length]);

  function handleToggleAll() {
    setBatchAnimating(true);
    onToggleAll?.();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 전체동의 박스 — 753×62, bg 흰색 / border 1px / radius 8(0.5rem) / padding 20(1.25rem).
          시안 보더는 #D9D9D9 지만 신규 hex 하드코딩 금지 규칙에 따라 tailwind `line`(#d7d7d7)
          토큰으로 스냅했다(명세 확인 항목 47).
          ⚠ 시안에는 이 행 우측에 20×20 chevron(3397:4860)이 있으나 벡터 fill 이 없는 빈
          프레임이고 역할(접기/펼치기 vs 장식)이 미확정이다 — 명세 확인 항목 29.
          TODO(mentor-apply): 확인 항목 29 확정 후 chevron 노출/동작 결정. 임의로 아코디언을
          만들면 되돌리기 어려우므로 지금은 렌더하지 않는다. */}
      <label className="flex cursor-pointer items-center gap-5 rounded-lg border border-line bg-white p-5 text-left md:gap-10">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={handleToggleAll}
          className="sr-only"
        />
        <CheckBox checked={allChecked} />
        <span className="text-base font-semibold leading-[1.4] text-ink">
          {AGREEMENT_COPY.agreeAllLabel}
        </span>
      </label>

      {/* 항목 리스트 — 753×220, 보더/배경 없음, 컨테이너 padding 20 + 행 간 gap 20. */}
      <div className="flex flex-col gap-5 p-5">
        {list.map((item, index) => {
          const checked = Boolean(values?.[item.key]);

          return (
            <div key={item.key} className="flex items-center gap-3">
              <label className="-my-2 flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-left">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle?.(item.key)}
                  className="sr-only"
                />
                <CheckBox
                  checked={checked}
                  index={index}
                  popping={batchAnimating && checked}
                />

                {/* 체크 → gap 12 → 배지 → gap 40 → 항목명 (시안 auto-layout gap 그대로). */}
                <span className="flex min-w-0 items-center gap-5 md:gap-10">
                  <span
                    className={`shrink-0 text-sm font-medium leading-[1.4] ${
                      item.required
                        ? BADGE_CLASSES.required
                        : BADGE_CLASSES.optional
                    }`}
                  >
                    {item.required
                      ? AGREEMENT_COPY.requiredBadge
                      : AGREEMENT_COPY.optionalBadge}
                  </span>
                  <span className="min-w-0 text-sm font-medium leading-[1.4] text-ink">
                    {item.label}
                  </span>
                </span>
              </label>

              {item.to && (
                <Link
                  to={item.to}
                  aria-label={`${item.label} ${AGREEMENT_COPY.detailLinkLabel}`}
                  className="shrink-0 text-right text-sm font-medium leading-[1.4] text-ink-sub underline md:w-[8.75rem]"
                >
                  {AGREEMENT_COPY.detailLinkLabel}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="auth-message-enter text-sm font-medium leading-[1.4] text-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}

type CheckBoxProps = {
  checked: boolean;
  index?: number;
  popping?: boolean;
};

// 20×20 체크 아이콘 — 시안 §6-9 #5(체크박스 체크 아이콘 20×20, 전체동의 1 + 항목 5).
// AgreementRow.jsx 의 체크 박스와 동일 규격(h-5 w-5 / lucide Check 14 / strokeWidth 3)이다.
function CheckBox({ checked, index = 0, popping = false }: CheckBoxProps) {
  return (
    <span
      aria-hidden="true"
      style={
        popping
          ? ({
              animationDelay: "calc(var(--i) * 40ms)",
              "--i": index,
            } as CSSProperties)
          : undefined
      }
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
        checked
          ? "border-accent bg-accent text-white"
          : "border-line bg-white text-transparent"
      } ${popping ? "auth-check-pop" : ""}`}
    >
      <Check size={14} strokeWidth={3} />
    </span>
  );
}
