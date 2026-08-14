import type { FormEvent } from "react";
import { useState } from "react";
import PrimaryButton from "../../auth/PrimaryButton";
import InlineCard from "../chat/InlineCard";

// STEP2 안내문 없이 직접 입력 폼 — docs/수행평가-상세-명세.md §5.8(`3754:3370` 빈 상태 /
// `3754:3431` 입력 완료 상태).
//
// ── 실측 (§5.8 「컴포넌트」)
//   카드      @456,962 596×317 r16 stroke `#d9d9d9` — `InlineCard`가 폭·보더·반경·좌우
//             1.875rem 인셋을 그대로 갖고 있어 그대로 쓴다.
//   내부 스택 gap 0.875rem(14) 균일. 라벨(982, h18) → 0.875rem → textarea(1014, h176)
//             → 0.875rem → CTA(1204, h52)로 실측이 정확히 맞아떨어진다.
//   라벨      `대략적인 수행평가 정보*` 0.875rem/1.125rem w500, **텍스트 전체** `#991e1e`
//             (별표만이 아니다 — §5.5 필수 라벨과 같은 규칙, `performance-required` 토큰)
//   textarea  536×176 → 전폭 × 11rem, r0.5rem, fill `#f8f7f5`(performance-bubble),
//             stroke `#d9d9d9`(performance-line), pad 0.75rem(12), 텍스트 0.875rem/1.125rem
//             w500 `#525252`(ink), placeholder `#d9d9d9`(performance-line)
//   CTA       536×52 r12 → `PrimaryButton` 기본값(h-3.25rem·rounded-xl·fullWidth)이
//             이미 이 치수다. 빈 상태 `#d9d9d9`(비활성) / 입력 시 `#013262`(§11.1 Q5 결정,
//             시안 원본 `#37352f` 아님) — PrimaryButton의 disabled/활성 톤이 그대로 이 값이다.
//
// ── 시안에 없어 만들지 않은 것
//   리사이즈 핸들·글자수 카운터(§5.8 실측 "없음") → `resize-none`, 카운터 없음.
//   176px 초과 입력 시 스크롤/자동 확장, 활성 판정 최소 글자 수는 §5.8 「미정」이다 —
//   높이를 고정하고 넘치면 스크롤(브라우저 기본), 활성 판정은 `trim() !== ''`로 둔다.
//   임의로 "50자 이상" 같은 문턱을 만들지 않는다(시안에 근거가 없다).
//
// ── 문구는 원문 그대로다 (§5.8 「문구 원문」). 손대지 말 것.
//   placeholder가 바로 위 AI 말풍선 문구와 완전히 동일한 것도 §5.8이 단정한 실측이다 —
//   중복으로 보고 줄이면 안 된다.
//
// ── 이 폼이 하지 않는 것
//   제출은 `POST /api/performance/analyze-guide`의 **`{ sessionId, freetext }` 분기**가
//   받는다(§8.6 엔드포인트 표 — 별도 엔드포인트도, `session.js` PATCH도 아니다).
//   그 호출에서 서버가 `guide_input_mode='manual'` + `guide_freetext`를 채운다. 이
//   컴포넌트는 검증을 통과한 원문 문자열만 `onSubmit`으로 넘긴다.

const LABEL = "대략적인 수행평가 정보";
const PLACEHOLDER =
  "수행평가 유형, 제출 형식, 평가 기준, 필수 포함 내용 등을 적어주세요.";
const SUBMIT_LABEL = "주제 추천받기";

const FIELD_ID = "performance-guide-freetext";

type ManualInfoFormProps = {
  /** 검증 통과 후 호출. 앞뒤 공백은 제거된 값이다. */
  onSubmit?: (freetext: string) => void;
  /** true면 버튼이 로딩 상태로 잠기고 입력이 막힌다. */
  submitting?: boolean;
  /** 제출 실패 메시지(서버 응답 등). */
  submitError?: string | null;
};

export default function ManualInfoForm({
  onSubmit,
  submitting = false,
  submitError = null,
}: ManualInfoFormProps) {
  const [value, setValue] = useState("");

  const isValid = value.trim() !== "";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValid || submitting) return;
    onSubmit?.(value.trim());
  }

  return (
    <InlineCard>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-3.5"
      >
        {/* 필수 표시를 색 하나에만 맡기지 않는다(WCAG 1.4.1) — 시각적 `*`는 aria-hidden으로
            두고 스크린리더용 "(필수)"를 sr-only로 덧붙인다(BasicInfoForm과 같은 관례).
            시안 원문이 `정보*`로 붙여 쓰므로 사이에 공백을 넣지 않는다. */}
        <label
          htmlFor={FIELD_ID}
          className="block text-[0.875rem] font-medium leading-[1.125rem] text-performance-required"
        >
          {LABEL}
          <span aria-hidden="true">*</span>
          <span className="sr-only"> (필수)</span>
        </label>

        <textarea
          id={FIELD_ID}
          name="freetext"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={PLACEHOLDER}
          disabled={submitting}
          required
          aria-invalid={submitError ? true : undefined}
          className="h-44 w-full resize-none rounded-lg border border-performance-line bg-performance-bubble p-3 text-[0.875rem] font-medium leading-[1.125rem] text-ink outline-none transition placeholder:text-performance-line focus:border-primary disabled:cursor-not-allowed"
        />

        {/* 에러 표시 UI는 시안에 없다(§11.3 Q39 — 시안에 토스트 컴포넌트 자체가 없다).
            GuideUploadCard·BasicInfoForm과 같은 한 줄 `role="alert"` 관례로 최소한만 만든다. */}
        {submitError && (
          <p
            role="alert"
            className="text-[0.875rem] leading-[1.125rem] text-[#d01c1c]"
          >
            {submitError}
          </p>
        )}

        <PrimaryButton type="submit" disabled={!isValid} loading={submitting}>
          {SUBMIT_LABEL}
        </PrimaryButton>
      </form>
    </InlineCard>
  );
}
