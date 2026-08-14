// 멘토신청 폼 전용 텍스트에어리어 — docs/mentor-apply-spec.md §6-5 / §폼 명세 2-7 · 4-2 · 4-6~4-10.
//
// 라벨/도움말/에러 슬롯 골격은 MentorTextField 와 완전히 동일해야 한다(같은 폼 카드 안에서
// 두 컨트롤이 번갈아 나오므로 라벨 위치·gap·에러 슬롯 높이가 어긋나면 바로 눈에 띈다).
// 그래서 골격은 MentorFieldShell 을 공유하고 이 파일은 컨트롤만 바꾼다 — 복제하지 않는다.
//
// 글자수 카운터(명세 확인 항목 ㉝ — 미확정): 시안은 placeholder 안 `(600자 이내)` 문구로만
// 안내하고 화면 어디에도 카운터를 그리지 않았다. 노출 여부가 사용자 확정 전이므로
// `showCounter` prop 을 열어 두되 **기본값 false**(= 시안 그대로)로 둔다.
// 확정되면 호출부에서 showCounter 만 켜면 되고 이 파일은 다시 손대지 않아도 된다.
import { useId } from "react";

import {
  getMentorFieldDescribedBy,
  MENTOR_CONTROL_CLASS,
  MentorFieldShell,
} from "./MentorTextField";

export default function TextareaField({
  id,
  name,
  label,
  required = false,
  helperText,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  // 시안의 고정 높이 128 / 150 / 172 는 rows 로 근사한다(폰트·행간에 따라 실제 높이가
  // 달라지므로 픽셀 고정 대신 rows 로 두고, 정확한 높이가 필요하면 className 으로 덮는다).
  rows = 5,
  maxLength,
  showCounter = false,
  className = "",
}) {
  const reactId = useId();
  const fieldId = id || name || reactId;
  const length = String(value ?? "").length;

  return (
    <MentorFieldShell
      fieldId={fieldId}
      label={label}
      required={required}
      helperText={helperText}
      error={error}
      className={className}
    >
      <textarea
        id={fieldId}
        name={name}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        rows={rows}
        maxLength={maxLength}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={getMentorFieldDescribedBy(fieldId, {
          helperText,
          error,
        })}
        // 좌우 패딩은 MENTOR_CONTROL_CLASS 의 px-5(20px)를 그대로 쓰고 상하 20px 을 더한다.
        // resize 는 세로만 허용 — 가로 리사이즈는 2컬럼 카드 레이아웃을 깨뜨린다.
        className={`resize-y py-5 leading-[1.4] ${MENTOR_CONTROL_CLASS} ${error ? "border-error" : ""}`}
      />

      {showCounter && maxLength ? (
        // 카운터 노출은 미확정 옵션(파일 상단 주석). 켜졌을 때는 스크린리더가 타이핑마다
        // 읽어 방해가 되므로 aria-hidden 으로 두고, 상한 초과는 error 메시지가 담당한다.
        <p
          aria-hidden="true"
          className="mt-2 text-right text-xs leading-[1.125rem] text-ink-sub"
        >
          {length} / {maxLength}
        </p>
      ) : null}
    </MentorFieldShell>
  );
}
