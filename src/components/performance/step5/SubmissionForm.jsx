import { memo, useCallback, useId, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import CharCounter from "./CharCounter";
import {
  SUBMISSION_MIN_CHARS,
  checkFieldsMinLength,
  countFieldChars,
} from "../../../lib/performance/submission";

// STEP5 수행평가 제출폼 — docs/수행평가-상세-명세.md §5.14(`3754:3992` 빈 상태 /
// `3754:4119` 작성 완료) / §6.1 컴포넌트 표(props `schema`·`value`·`onChange`·
// `onSaveDraft`·`onSubmit`, 상태 empty/filled/saving/submitting) / §7.1·§7.2(토큰) /
// §8.3·§8.6(스키마·저장 계약) / §12.2 Q35(글자 수).
//
// ─────────────────────────────────────────────────────────────────────
// 1. 동적 스키마 — **4필드 고정 폼이 아니다**
// ─────────────────────────────────────────────────────────────────────
// §6.1: 「`schema`는 4필드 고정이 아니라 8종 동적 스키마(문항형 최대 20필드)」. 시안은
// 기본 보고서형(서론·본론·결론) 변형만 그리지만(§11-Q71) 그건 8종 중 하나의 스냅샷이다.
// 필드 개수·키·라벨·헬퍼·순서·필수 여부는 전부 **서버 소유**이고(§8.3
// `performance_sessions.submission_schema`) 이 컴포넌트는 받은 대로 렌더한다. 유형별
// 분기(`if type === 'cardnews'` 같은 것)를 여기 만들면 서버가 스키마를 고칠 때마다 화면이
// 갈라진다 — 그런 분기는 하나도 없다.
//
// **20필드에서 무너지지 않게 한 것**(§5.14 시안은 4필드 기준이라 근거가 없는 구간이다.
// 새 레이아웃을 발명하지 않고, 시안 리듬을 그대로 반복시키면서 깨지는 축만 막았다):
//   ⓐ 세로: 필드 1개 = 라벨(18) + 12 + 텍스트영역(160) + 12 + 카운터(18) = 220px 고정.
//      자동 확장을 쓰지 않으므로(§5.14 제안 「높이 10rem 고정 + 내부 스크롤. 자동 확장은
//      채팅 스크롤 위치가 튄다」) 20필드여도 높이가 예측 가능하게 선형으로만 늘어난다.
//      카드에 `max-height + overflow`를 씌우는 선택지는 **채택하지 않았다** — 채팅
//      타임라인 안의 카드가 자체 스크롤을 가지면 스크롤 컨테이너가 이중이 되고
//      (`ChatTimeline`의 자동 스크롤이 어느 쪽을 움직일지 불명확해진다) 시안에 근거도 없다.
//   ⓑ 렌더 비용: 필드 행을 `memo`로 감싸고 변경 핸들러를 **단 하나의 안정된 함수**로
//      유지한다(아래 `handleFieldChange`). 이게 없으면 한 글자 칠 때마다 textarea 20개가
//      전부 리렌더된다(각각 값·카운터 재계산). 실제로 문항형은 20개가 상한이라 이 비용이
//      항상 최악치로 걸린다.
//   ⓒ 카운터·게이트 계산은 O(전체 글자수)라 타이핑마다 도는 것이 맞다 — 20필드×수천 자
//      수준에서 체감 비용이 없고, 값과 표시가 어긋나지 않는 것이 더 중요하다.
//
// ─────────────────────────────────────────────────────────────────────
// 2. 100자 게이트 (§12.2 Q35) — 판정 함수를 **서버와 공유**한다
// ─────────────────────────────────────────────────────────────────────
// `checkFieldsMinLength`/`countFieldChars`는 `api/_lib/performance/submission-chars.js`
// 원본 그대로다(`src/lib/performance/submission.js`가 재수출). 사본을 만들면 "카운터는
// 통과인데 서버가 400"이 생긴다 — §8.3이 「시안 카운터와 동일 계산식 공유」를 요구하는
// 이유가 정확히 그것이다.
//
// **클라이언트 검증은 UX이고 권위는 서버다.** 여기서 막는 것은 서버 왕복 한 번을 아끼는
// 일일 뿐이고, 서버 게이트(`checkSubmissionMinLength`)는 그대로 살아 있다.
//
// ─────────────────────────────────────────────────────────────────────
// 3. 자동 저장을 만들지 않았다
// ─────────────────────────────────────────────────────────────────────
// §4 상태도가 STEP5를 `Empty --> Filled : 입력` / `Filled --> Filled : 중간 저장` 두
// 전이로만 그리고(L328), §5.14 버튼도 명시적 `중간 저장` 하나다. 명세 어디에도 자동
// 저장·디바운스 규정이 없다. 임의로 넣으면 ⓐ 타이핑 중 `PUT`이 계속 나가 다중 탭
// revision 규칙과 얽히고 ⓑ 학생이 "저장했다"고 인지하는 시점이 흐려진다. 대신 저장
// **실패로 작성 내용을 잃지 않는다** — 값은 호출부(`PerformanceChatPage`)가 들고 있고
// 이 컴포넌트는 실패해도 입력을 비우거나 잠그지 않는다.
//
// ─────────────────────────────────────────────────────────────────────
// 4. 접근성
// ─────────────────────────────────────────────────────────────────────
//   · 모든 입력에 `htmlFor`로 연결된 `<label>`. placeholder는 라벨 대용이 아니다.
//   · 헬퍼(시안에서 placeholder 자리 — §5.14 「placeholder `#d9d9d9` → 값 `#525252`」)는
//     placeholder로 두되 **같은 문장을 sr-only로도 넣어 `aria-describedby`에 연결**한다.
//     placeholder는 값이 채워지면 사라져 지시문이 증발하기 때문이다.
//     ⚠️ 시안 placeholder 색 `#d9d9d9`는 입력 배경(`#f8f7f5`) 대비 1.32:1로 WCAG AA
//        미달이다. 기존 인앱 폼(`ManualInfoForm`·`GuideUploadCard`)이 이미 시안대로
//        `placeholder:text-performance-line`을 쓰고 있어 **여기서만 색을 바꾸면 폼끼리
//        갈라진다** — 색은 시안/저장소 관례를 따르고, 정보 접근성은 위 sr-only 설명으로
//        보전한다(저대비 텍스트에만 담긴 정보가 없게 만든다). 색 자체는 §5.14/§7.2를
//        고치는 결정이 먼저다.
//   · 카운터는 live region이 아니다(`CharCounter` 주석) — 필드의 `aria-describedby`에
//     들어가 포커스 시 1회 읽힌다. 타이핑마다 낭독되지 않는다.
//   · 게이트 문구도 live region이 아니다(숫자가 매 글자 바뀐다). 대신 **임계값을 넘는
//     순간에만** 바뀌는 sr-only `aria-live="polite"` 한 줄을 따로 둔다 — 문자열이 불리언
//     하나에서 파생되므로 상태가 뒤집힐 때만 announce된다.
//   · ⚠️ 위 두 줄이 성립하려면 **루트에 `aria-live="off"`가 있어야 한다**(검토 P11).
//     이 폼은 `ChatTimeline`의 항목으로 렌더되는데 그 루트가 `aria-live="polite"`라
//     (`ChatTimeline.jsx:102`), ARIA 규정상 live region은 자기 서브트리의 텍스트 변경을
//     전부 announce한다 — 아무 조치도 하지 않으면 카운터(`{n}자`)와 게이트 문구
//     (`현재 N자예요`)가 **타이핑 한 글자마다** 낭독된다. `ChatTimeline`은 `focusRef`가
//     붙은 항목에만 `aria-live="off"`를 내려주는데 이 폼 항목에는 `focusRef`가 없다.
//     그래서 무효화를 컴포넌트가 직접 건다 — 어느 호출부에 붙어도 계약이 성립하고,
//     아래 sr-only `aria-live="polite"`·`role="status"`·`role="alert"`는 각자 명시적
//     live 의미론을 가지므로 그대로 살아남는다(자식이 조상을 그 서브트리에 한해 덮는다).
//   · 두 버튼은 `disabled` 대신 `aria-disabled`다(`TopicCardList`가 세운 관례).
//     ⓐ `disabled` 버튼은 포커스를 못 받아 `aria-describedby`가 **영원히 읽히지 않는다** —
//        "왜 못 누르는지"를 프로그램적으로 전달하라는 요구와 정면으로 충돌한다.
//     ⓑ 방금 누른 버튼이 처리 중 `disabled`가 되면 포커스가 `<body>`로 떨어진다.
//     대신 핸들러에서 직접 막는다(`if (locked) return`).
//   · 대비(직접 계산, 흰 카드 배경 기준): 라벨 `performance-required`(#991e1e) 8.21:1 /
//     본문·입력값 `ink`(#525252) 7.82:1 / 카운터·보조문 `ink-sub`(#6b6b6b) 5.33:1 /
//     primary 버튼 흰 글자 on #013262 12.86:1 / 처리중 흰 글자 on `bg-primary/80`
//     (흰 카드 위 합성 #345b81) 7.15:1 / secondary 라벨 `ink-sub` on 흰색 5.33:1 /
//     **비활성 primary `ink`(#525252) on `performance-line`(#d9d9d9) 5.54:1**.
//     전부 AA(4.5:1) 충족. (예외는 위 placeholder 항.)
//     ⚠️ 비활성 primary는 원래 흰 글자였고 #d9d9d9 대비 **1.41:1**이었다(검토 P11). 빈
//     상태가 이 폼의 **기본 상태**라 학생이 폼을 처음 만나는 순간 라벨이 판독되지 않았고,
//     `aria-disabled`라 실제로 포커스·클릭이 가능한 컨트롤이라 「비활성 컴포넌트」 예외
//     (WCAG 1.4.3)에 기대기도 어렵다. **면 색(§5.8 실측 `#d9d9d9`)은 그대로 두고 글자색만**
//     `ink`로 내렸다 — §5.14 버튼 표가 기록한 것은 활성 fill `#013262` 하나뿐이라
//     비활성 글자색은 시안 실측이 아니라 관례에서 빌려 온 값이었다(고칠 근거가 있다).
//     `ink-sub`(#6b6b6b)는 같은 배경에서 3.78:1로 여전히 미달이라 쓰지 않는다.
//   · 모션은 저장소 관례 그대로 `active:scale-[0.97] motion-reduce:active:scale-100`.

/** §5.14 카드 본문 원문. 제목·`안내문 분석 결과:` 접두는 시안 문자열 그대로다. */
const CARD_TITLE = "수행평가 제출폼";
const SCHEMA_LABEL_PREFIX = "안내문 분석 결과: ";

/** §5.14 필드 표 — 주제 칸은 확정 주제 prefill이다(제출 필드가 아니다, 아래 주석). */
const TOPIC_LABEL = "주제";

const SAVE_LABEL = "중간 저장";
const SUBMIT_LABEL = "제출하고 평가 리포트 받기";

/**
 * 필드 1개. `memo`로 감싼 이유는 문항형 20필드다(파일 상단 ⓑ) — `field`는 스키마 객체라
 * 참조가 안정적이고, `value`는 문자열, `onChange`는 호출부에서 단 한 번 만들어진 함수라
 * 실제로 "그 필드만" 리렌더된다.
 */
const SubmissionField = memo(function SubmissionField({
  field,
  value,
  onChange,
  idPrefix,
  readOnly,
}) {
  const id = `${idPrefix}-${field.key}`;
  const helperId = field.helper ? `${id}-helper` : null;
  const counterId = `${id}-counter`;
  const count = countFieldChars(value);

  return (
    // 라벨↔컨트롤 0.75rem(12), 컨트롤↔카운터 0.75rem(12) — §5.14 실측이 같은 값이라
    // 컬럼 gap 하나로 둘 다 맞는다.
    <div className="flex flex-col gap-3">
      <label
        htmlFor={id}
        className={[
          "text-[0.875rem] font-medium leading-[1.125rem]",
          field.required ? "text-performance-required" : "text-ink-sub",
        ].join(" ")}
      >
        {field.label}
        {/* 필수를 색 하나에만 맡기지 않는다(WCAG 1.4.1) — 시안 `서론*` 표기를 그대로 쓰되
            별표는 aria-hidden, 스크린리더에는 "(필수)"를 준다(BasicInfoForm·ManualInfoForm
            과 동일 관례). 선택 필드는 눈에 보이는 "(선택)"을 붙인다. */}
        {field.required ? (
          <>
            <span aria-hidden="true">*</span>
            <span className="sr-only"> (필수)</span>
          </>
        ) : (
          <span> (선택)</span>
        )}
      </label>

      {/* §5.14: 46.375rem×10rem 고정 + 내부 스크롤(자동 확장 미채택). r0.5rem,
          fill `#f8f7f5`, stroke `#d9d9d9`, 값 0.875rem/1.125rem w500 `#525252`. */}
      <textarea
        id={id}
        name={field.key}
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
        placeholder={field.helper || undefined}
        readOnly={readOnly}
        aria-describedby={[helperId, counterId].filter(Boolean).join(" ")}
        className="h-40 w-full resize-none overflow-y-auto rounded-lg border border-performance-line bg-performance-bubble p-3 text-[0.875rem] font-medium leading-[1.125rem] text-ink outline-none transition placeholder:text-performance-line focus:border-primary"
      />

      {/* 값이 채워지면 사라지는 placeholder를 대신할 항구적 지시문(파일 상단 4). */}
      {helperId && (
        <span id={helperId} className="sr-only">
          {field.helper}
        </span>
      )}

      <CharCounter id={counterId} count={count} />
    </div>
  );
});

/**
 * @param {{type:string, label:string, notice:string,
 *   fields:{key:string,label:string,helper:string,required:boolean}[]}} schema
 *   **서버가 내려준 값 그대로**(`GET /api/performance/submission`의 `schema`). 화면이
 *   판정하거나 보정하지 않는다.
 * @param {Record<string,string>} value 필드 키 → 작성 값. 호출부가 소유한다(제출 실패·
 *   재평가 복원에서 같은 값을 다시 쓰기 때문).
 * @param {(next: Record<string,string>) => void} onChange 값 전체를 새 객체로 돌려준다.
 * @param {(fields: Record<string,string>) => void} onSaveDraft `중간 저장`.
 * @param {(fields: Record<string,string>) => void} onSubmit `제출하고 평가 리포트 받기`.
 *   **클라이언트 게이트를 통과한 경우에만 호출된다**(서버 검증은 그대로 살아 있다).
 * @param {string|null} [topicTitle] 확정 주제. §5.14 `주제*` 칸의 prefill 표시값이고
 *   **제출 필드가 아니다** — 확정 주제는 `performance_sessions.selected_topic_id`가 들고
 *   있어 서버가 직접 읽는다(§8.3). 그래서 읽기 전용이고 `fields`에 실리지 않는다.
 * @param {boolean} [saving] 중간 저장 진행 중(§6.1 상태 `saving`).
 * @param {boolean} [submitting] 제출 진행 중(§6.1 상태 `submitting`).
 * @param {string|null} [error] 저장/제출 실패 문구(서버가 준 한국어 문구 그대로).
 * @param {string|null} [savedAt] 마지막 중간 저장 시각(ISO). 저장 성공 피드백에만 쓴다.
 */
export default function SubmissionForm({
  schema,
  value,
  onChange,
  onSaveDraft,
  onSubmit,
  topicTitle = null,
  saving = false,
  submitting = false,
  error = null,
  savedAt = null,
}) {
  const reactId = useId();
  const idPrefix = `performance-submission${reactId}`;
  const gateId = `${idPrefix}-gate`;
  const errorId = `${idPrefix}-error`;

  const fields = Array.isArray(schema?.fields) ? schema.fields : [];

  // 변경 핸들러를 **한 번만** 만든다(파일 상단 ⓑ). `value`/`onChange`를 의존성으로 넣으면
  // 매 타이핑마다 새 함수가 되어 `memo`가 전부 무력화된다 — 최신 값은 ref로 읽는다.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleFieldChange = useCallback((key, next) => {
    onChangeRef.current?.({ ...valueRef.current, [key]: next });
  }, []);

  // 게이트·카운터는 서버와 같은 함수로 잰다(파일 상단 2).
  const gate = useMemo(
    () => checkFieldsMinLength(fields, value),
    [fields, value],
  );

  const busy = saving || submitting;
  const isEmpty = gate.total === 0;

  // §6.1 상태 4종을 그대로 표현한다.
  //   empty      → 두 버튼 모두 잠김(빈 저장은 서버가 `400 EMPTY_SUBMISSION`으로 거절한다)
  //   filled     → `중간 저장` 열림, `제출`은 게이트 통과 시에만
  //   saving     → 두 버튼 잠김 + `중간 저장`에 스피너/`aria-busy`
  //   submitting → 두 버튼 잠김 + `제출`에 스피너/`aria-busy`, 입력은 읽기 전용
  const saveLocked = isEmpty || busy;
  const submitLocked = !gate.ok || busy;

  // §5.14에 없는 표면이라 최소한만 만든다(§11.3 Q39 — 시안에 토스트가 없다).
  // **필드 카운터에 기준선을 얹지 않는 대신** 폼 전체 게이트를 여기 한 줄로 말하고, 두
  // 버튼이 이 문장을 `aria-describedby`로 가리킨다(비활성 사유의 프로그램적 전달).
  let gateMessage;
  if (isEmpty) {
    gateMessage =
      "아직 작성한 내용이 없어요. 내용을 입력하면 저장하거나 제출할 수 있어요.";
  } else if (gate.missingRequired.length) {
    gateMessage = `필수 항목을 모두 작성해야 제출할 수 있어요. 남은 항목: ${gate.missingRequired.join(", ")} (현재 ${gate.total}자)`;
  } else if (gate.total < SUBMISSION_MIN_CHARS) {
    gateMessage = `제출하려면 전체 ${SUBMISSION_MIN_CHARS}자 이상 작성해야 해요. 현재 ${gate.total}자예요.`;
  } else {
    gateMessage = `전체 ${gate.total}자를 작성했어요. 지금 제출할 수 있어요.`;
  }

  // 두 버튼이 함께 가리키는 설명 — 게이트 사유 + (있다면) 서버 실패 문구.
  const describedBy = [gateId, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  function handleSaveDraft() {
    if (saveLocked) return;
    onSaveDraft?.(value);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (submitLocked) return;
    onSubmit?.(value);
  }

  return (
    // §5.14 카드 실측: 49.125rem(786) 폭, r16, stroke `#d9d9d9`, 인셋 좌 1.25rem(20) /
    // 우 1.5rem(24) → 콘텐츠 46.375rem(742, **정본**). `InlineCard`를 쓰지 않는 이유는
    // 그쪽이 `max-w-perf-bubble`(596)과 `px-[1.875rem]`을 고정하고 있어서다 — className
    // 으로 덮으면 `max-w-*` 두 개가 겹쳐 어느 쪽이 이길지 예측 불가다(AiMessage 주석의
    // 그 함정). 카드 모양만 같은 토큰으로 다시 짓는다.
    // `aria-live="off"` — 파일 상단 4의 ⚠️ 항. `ChatTimeline` 루트의 `polite`를 이
    // 서브트리에 한해 무효화해 카운터·게이트 문구가 타이핑마다 낭독되지 않게 한다.
    <div
      aria-live="off"
      className="w-full max-w-[49.125rem] rounded-2xl border border-performance-line bg-white py-5 pl-5 pr-6"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h3 className="text-[1rem] font-semibold leading-[1.3125rem] text-ink">
            {CARD_TITLE}
          </h3>
          {/* §5.14 카드 본문 2·3행. 유형 라벨·안내문은 **서버 스키마 값**이라 8종에 따라
              바뀐다(시안의 `기본 보고서형`은 그중 하나다). */}
          <p className="text-[0.875rem] font-medium leading-[1.125rem] text-ink-sub">
            {SCHEMA_LABEL_PREFIX}
            {schema?.label}
          </p>
          {schema?.notice && (
            <p className="text-[0.875rem] font-normal leading-[1.125rem] text-ink-sub">
              {schema.notice}
            </p>
          )}
        </div>

        {/* 필드 스택 gap 1.25rem(20) — §5.14 실측. */}
        <div className="flex flex-col gap-5">
          {/* 주제 — 읽기 전용 prefill(§5.14 「확정 주제 prefill(`#525252`)」). 단일행
              46.375rem×2.625rem(42) r0.5rem. 제출 필드가 아니므로 `fields`에 없다. */}
          <div className="flex flex-col gap-3">
            <label
              htmlFor={`${idPrefix}-topic`}
              className="text-[0.875rem] font-medium leading-[1.125rem] text-performance-required"
            >
              {TOPIC_LABEL}
              <span aria-hidden="true">*</span>
              <span className="sr-only">
                {" "}
                (필수 — 확정한 주제이며 수정할 수 없습니다)
              </span>
            </label>
            <input
              id={`${idPrefix}-topic`}
              type="text"
              value={topicTitle || ""}
              readOnly
              className="h-[2.625rem] w-full cursor-default rounded-lg border border-performance-line bg-performance-bubble px-3 text-[0.875rem] font-medium leading-[1.125rem] text-ink outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </div>

          {fields.map((field) => (
            <SubmissionField
              key={field.key}
              field={field}
              value={value?.[field.key] ?? ""}
              onChange={handleFieldChange}
              idPrefix={idPrefix}
              // 제출 중에는 값이 바뀌면 안 되지만 `disabled`를 걸면 포커스가 날아간다 —
              // `readOnly`는 포커스를 유지한 채 편집만 막는다.
              readOnly={submitting}
            />
          ))}
        </div>

        {/* 게이트 문구(비활성 사유). live region이 아니다 — 숫자가 매 글자 바뀐다. */}
        <p
          id={gateId}
          className="text-[0.875rem] font-normal leading-[1.125rem] text-ink-sub"
        >
          {gateMessage}
        </p>

        {/* 임계값을 넘나드는 순간에만 문자열이 바뀌므로 그때만 announce된다. */}
        <p aria-live="polite" className="sr-only">
          {gate.ok ? "제출할 수 있는 분량이 되었어요." : ""}
        </p>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-[0.875rem] leading-[1.125rem] text-[#d01c1c]"
          >
            {error}
          </p>
        )}

        {/* 저장 성공 피드백. `role="status"`라 `savedAt`이 갱신될 때만 1회 읽힌다. */}
        {savedAt && !error && (
          <p
            role="status"
            className="text-[0.875rem] font-normal leading-[1.125rem] text-ink-sub"
          >
            {formatSavedAt(savedAt)}에 중간 저장했어요.
          </p>
        )}

        {/* 버튼 행 — §5.14 실측 33.25rem×3.25rem gap 0.75rem, 카드 안에서 가운데 정렬
            (카드 786 안 532px 블록의 좌표 581이 중앙 583과 2px 차이). 각 16.25rem×3.25rem
            r0.75rem. `PrimaryButton`/`OutlineButton`을 쓰지 않은 이유는 둘 다 `disabled`
            속성만 노출하고 `aria-disabled`/`aria-describedby`를 받지 못해서다(파일 상단 4) —
            로그인·회원가입이 함께 쓰는 컴포넌트라 그 계약을 이 화면 사정으로 넓히지 않는다.
            치수·색·모션 클래스는 그 두 컴포넌트와 동일하게 맞췄다. */}
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            aria-disabled={saveLocked}
            aria-busy={saving || undefined}
            aria-describedby={describedBy}
            className={[
              "flex h-[3.25rem] w-[16.25rem] items-center justify-center gap-2 rounded-xl border border-performance-line text-[1rem] font-medium leading-[1.25rem] transition active:scale-[0.97] motion-reduce:active:scale-100",
              // 비활성 표현은 opacity가 아니라 :388(제출 버튼)과 동일한 실제 배경/글자색
              // 조합으로 한다 — `aria-disabled`라 진짜 disabled가 아니고(여전히 포커스·클릭
              // 가능) opacity는 WCAG 비활성 컨트롤 대비 예외를 못 받아 2.2:1로 미달이었다.
              saveLocked
                ? "cursor-not-allowed bg-performance-line text-ink"
                : "bg-white text-ink-sub hover:border-ink-sub",
            ].join(" ")}
          >
            {saving && (
              <Loader2
                size={18}
                strokeWidth={2.5}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {SAVE_LABEL}
          </button>

          <button
            type="submit"
            aria-disabled={submitLocked}
            aria-busy={submitting || undefined}
            aria-describedby={describedBy}
            className={[
              "flex h-[3.25rem] w-[16.25rem] items-center justify-center gap-2 rounded-xl text-[1rem] font-semibold leading-[1.25rem] transition active:scale-[0.97] motion-reduce:active:scale-100",
              // 비활성 **면 색**은 §5.8 실측(「빈 상태 `#d9d9d9`(비활성) / 입력 시 `#013262`」)과
              // `PrimaryButton`의 disabled 톤을 그대로 따른다 — 처리중(`bg-primary/80`)과
              // 비활성을 시각적으로 구분하는 것도 그 컴포넌트의 관례다.
              // **글자색만** 비활성에서 `ink`로 내린다(파일 상단 4 대비 항의 ⚠️).
              submitting
                ? "cursor-progress bg-primary/80 text-white"
                : submitLocked
                  ? "cursor-not-allowed bg-performance-line text-ink"
                  : "bg-primary text-white hover:bg-primary/90",
            ].join(" ")}
          >
            {submitting && (
              <Loader2
                size={18}
                strokeWidth={2.5}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {SUBMIT_LABEL}
          </button>
        </div>
      </form>
    </div>
  );
}

/** `2026. 08. 12. 14:03` 같은 절대 시각 대신 시:분만 — 같은 세션 안의 피드백이다. */
function formatSavedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "방금";
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
