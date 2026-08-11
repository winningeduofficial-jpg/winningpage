// 멘토신청 폼 전용 텍스트 인풋 — docs/mentor-apply-spec.md §6-5 / §6-6 / §폼 명세.
//
// 왜 기존 auth/TextField 를 쓰지 않고 새로 만들었는가:
// 시안이 auth/TextField(로그인·회원가입 리뉴얼 계약)와 세 군데에서 어긋난다(명세 §재사용 매핑 B).
//   ① 라벨   — auth 는 14px 고정(`text-[0.875rem]`), 시안은 16px Medium(`Body/16-Md`).
//   ② 도움말 — auth 는 인풋 "아래", 시안은 라벨과 컨트롤 "사이".
//   ③ 액션   — auth 는 인풋 아래 우측 밑줄 텍스트 링크, 시안 5-2 는 인풋 "옆" 94×34 아웃라인 버튼.
// auth/TextField 를 직접 고치면 로그인/회원가입 전 화면이 회귀하므로 건드리지 않는다.
// 반대로 시안과 일치하는 부분(h 52 / radius 12 / border 1px / px 20 / 포커스링 = border-primary /
// disabled 배경)은 auth/TextField.jsx:91 의 클래스 문자열을 그대로 옮겨와 시각적 일관성을 유지한다.
//
// 에러 메시지 슬롯(명세 확인 항목 ㉕): 시안에 에러 상태 자체가 없다(`Status/Error #EB2626` 변수만
// 정의되고 폼 어디에도 미사용). 슬롯을 조건부 렌더로 두면 검증 실패 시점에 필드 아래로 텍스트가
// 끼어들며 그 아래 모든 필드가 밀리는 레이아웃 시프트가 생긴다. 27개 필수 필드가 한 화면에서
// 동시에 검증되는 폼이라 시프트가 누적되면 사용자가 보고 있던 위치를 잃는다. 그래서
// **에러가 없어도 높이를 차지하는** 고정 슬롯으로 예약한다(min-h). 대가는 필드마다 26px의
// 상시 여백이며, 이는 명세 §6-4 의 필드군 세로 gap 26 과 겹쳐 흡수되도록 mt-2 + min-h 로 나눴다.
import { useId } from 'react';

// auth/TextField.jsx:91 에서 그대로 가져온 컨트롤 공통 클래스(시안 §6-5 와 일치하는 부분).
// h 52 는 인풋 전용이라 여기 넣지 않고 각 컨트롤에서 붙인다(텍스트에어리어는 높이가 가변).
// placeholder 색만 auth(`placeholder:text-ink-sub` #808080)와 다르게 `text-line`(#d7d7d7)을 쓴다 —
// 시안 §6-6 의 placeholder 색이 `Surface/01 #D9D9D9` 이고, 신규 hex 하드코딩 금지 원칙상
// 가장 가까운 기존 토큰이 `line`(#d7d7d7)이다(명세 확인 항목 ㊼ — #D9D9D9 vs #D7D7D7 정본 미확정).
export const MENTOR_CONTROL_CLASS =
  'w-full rounded-xl border border-line bg-white px-5 text-base text-ink outline-none transition placeholder:text-line focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-footer';

// aria-describedby 는 도움말/에러 두 슬롯을 함께 가리켜야 한다.
// 에러 슬롯은 항상 렌더되지만 비어 있을 때 가리키면 스크린리더가 빈 노드를 읽으므로 error 가 있을 때만 연결한다.
export function getMentorFieldDescribedBy(fieldId, { helperText, error } = {}) {
  const ids = [];
  if (helperText) ids.push(`${fieldId}-helper`);
  if (error) ids.push(`${fieldId}-error`);
  return ids.length ? ids.join(' ') : undefined;
}

// 라벨 요소의 id. <label htmlFor> 로 묶을 대상 컨트롤이 없는 그룹 컨트롤(칩 그룹·파일
// 드롭존·약관 블록)이 role="group" + aria-labelledby 로 이 id 를 참조할 때 쓴다
// (groupLabel prop, 리뷰 WARN #3). 공식을 여기 한 곳에 모아 둬서 호출부가 문자열을
// 직접 조립하다 철자가 어긋나는 일을 막는다.
export function getMentorFieldLabelId(fieldId) {
  return `${fieldId}-label`;
}

// 라벨 → 도움말 → 컨트롤 → 에러 슬롯의 세로 골격.
// MentorTextField 와 TextareaField 가 동일 구조를 공유해야 해서(명세 §6-5 "라벨 ↔ 도움말 gap 4",
// "(라벨+도움말) ↔ 컨트롤 gap 12") 한 곳에 모아두고 두 컴포넌트가 함께 쓴다.
// gap 은 시안이 8/12/16 으로 혼재하므로(§6-10 결함 4) 다수값인 **12(0.75rem)** 로 통일했다.
export function MentorFieldShell({
  fieldId,
  label,
  required = false,
  helperText,
  error,
  className = '',
  children,
  // 그룹 컨트롤(칩 그룹·파일 드롭존·약관 블록)용. 이 라벨이 가리킬 단일 포커스 대상이
  // 없을 때 true 로 준다 — <label htmlFor> 대신 id 만 가진 <span> 을 그리고, 호출부가
  // getMentorFieldLabelId(fieldId) 로 그 id 를 얻어 그룹 컨테이너의 aria-labelledby 에
  // 연결한다(리뷰 WARN #3). htmlFor 가 존재하지 않는 id 를 가리키면 스크린리더가
  // 아예 이름을 읽지 못하므로, <label htmlFor="없는-id"> 로 방치하는 것보다 낫다.
  groupLabel = false
}) {
  const LabelTag = groupLabel ? 'span' : 'label';

  return (
    <div className={className}>
      {label && (
        <LabelTag
          id={groupLabel ? getMentorFieldLabelId(fieldId) : undefined}
          htmlFor={groupLabel ? undefined : fieldId}
          className="block text-base font-medium leading-[1.4] text-ink"
        >
          {label}
          {/* 필수 표시 `*` — Medium 16 / accent(#0B84FD). 시각 기호이므로 스크린리더에서는 숨기고
              필수 여부는 컨트롤의 required/aria-required 가 전달한다. */}
          {required && (
            <span aria-hidden="true" className="text-accent">
              {' '}
              *
            </span>
          )}
        </LabelTag>
      )}

      {helperText && (
        // 라벨 ↔ 도움말 gap 4(0.25rem). 도움말 굵기는 시안이 Rg/Md 혼재라(§6-10 결함 6)
        // 다수값인 Regular 로 통일했다. 도움말 안의 accent 강조는 호출부가 ReactNode 로 넘긴다.
        <p id={`${fieldId}-helper`} className="mt-1 break-keep text-sm leading-[1.4] text-ink-sub">
          {helperText}
        </p>
      )}

      {/* (라벨+도움말) ↔ 컨트롤 gap 12 */}
      <div className={label || helperText ? 'mt-3' : ''}>{children}</div>

      {/* 에러 슬롯 — 항상 렌더(파일 상단 주석 참고). 비어 있어도 높이를 차지한다(레이아웃
          시프트 방지, 의도된 설계다 — 그대로 유지).
          ⚠ role="alert" 는 여기서 뺐다(리뷰 WARN #2). 이 폼에는 shell 인스턴스가 약 25개라
          전부 assertive live region 이면 제출 실패 시 20개 넘는 노드가 동시에 텍스트를
          갖게 되고, 스크린리더가 진행 중 발화를 끊고 큐를 쌓아 수십 초간 에러만 연달아
          읽는다. 대신 aria-describedby(getMentorFieldDescribedBy)로 이 노드를 인풋과
          연결해 포커스가 이 필드로 옮겨갈 때(제출 실패 시 scrollToField 의 focus)
          자연스럽게 함께 읽히게 하고, 폼 전체의 제출 실패 알림은
          MentorApplyForm.jsx 의 요약 문단 한 곳에서만 assertive 로 발화한다. */}
      <p
        id={`${fieldId}-error`}
        className={`mt-2 min-h-[1.125rem] break-keep text-xs leading-[1.125rem] text-error ${
          error ? 'auth-message-enter' : ''
        }`}
      >
        {error || ''}
      </p>
    </div>
  );
}

export default function MentorTextField({
  id,
  name,
  label,
  required = false,
  helperText,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  // 인풋 "옆"에 붙는 액션 슬롯(ReactNode). 시안 5-2 의 94×34 `인증번호 발송`/`인증번호 확인`
  // 아웃라인 버튼이 여기 들어간다. auth/TextField 의 actionLabel/onAction(인풋 아래 링크)과 달리
  // 버튼 모양·라벨·상태를 호출부가 전부 소유하도록 노드 슬롯으로 열어 뒀다.
  action,
  disabled = false,
  maxLength,
  inputMode,
  autoComplete,
  className = ''
}) {
  const reactId = useId();
  const fieldId = id || name || reactId;

  const control = (
    <input
      id={fieldId}
      name={name}
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      maxLength={maxLength}
      inputMode={inputMode}
      autoComplete={autoComplete}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={getMentorFieldDescribedBy(fieldId, { helperText, error })}
      className={`h-[3.25rem] ${MENTOR_CONTROL_CLASS} ${error ? 'border-error' : ''}`}
    />
  );

  return (
    <MentorFieldShell
      fieldId={fieldId}
      label={label}
      required={required}
      helperText={helperText}
      error={error}
      className={className}
    >
      {action ? (
        // 인풋 + 액션 버튼 한 행. 시안 5-2 의 인풋 370.5 + gap 12 + 버튼 94 구성을
        // 고정폭 대신 flex-1(인풋) / shrink-0(버튼) 로 옮겨 컨테이너 폭 변화에 견디게 했다.
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{control}</div>
          <div className="shrink-0">{action}</div>
        </div>
      ) : (
        control
      )}
    </MentorFieldShell>
  );
}
