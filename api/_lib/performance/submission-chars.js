// 제출물 글자 수 판정 — **서버와 STEP5 제출폼이 함께 읽는 유일한 정본.**
//
// 근거 문서: docs/수행평가-상세-명세.md §8.3(`char_counts` 「시안 카운터(`356자`)와 동일
//            계산식 공유」), §12.2 마지막 행 Q35(「임계값 100 유지, 측정 대상만 변경」),
//            §5.14(카운터 실측 `{n}자`), §9.3.
//
// ─────────────────────────────────────────────────────────────────────
// 왜 `submission-schema.js`에서 이 네 개만 떼어냈나
// ─────────────────────────────────────────────────────────────────────
// §8.3이 요구하는 것은 「시안 카운터와 최소 길이 판정이 **같은 계산식**」이다. 그런데
// 카운터는 브라우저에서 돌고 게이트는 서버에서 돈다. 규칙이 한 벌이려면 둘 중 하나다 —
// ⓐ 클라이언트가 사본을 갖거나(=조용히 갈라진다. `src/lib/validators.js` 상단이 전화번호
//    규칙을 두고 정확히 이 이유로 사본을 금지한다),
// ⓑ 같은 모듈을 양쪽이 import 한다.
// ⓑ를 택하되 **`submission-schema.js` 통째로를 브라우저 번들에 끌고 오지는 않는다** —
// 저쪽은 안내문 판별 정규식·8종 스키마 문구까지 들고 있고(519행), 앞으로 서버 전용
// 의존(DB·env)이 하나만 들어와도 클라이언트 빌드가 깨진다. 그래서 **의존이 0인 잎 모듈**
// 로 내리고, `submission-schema.js`는 이 파일을 import 해 기존 공개 API를 그대로 유지한다
// (`countSubmissionChars`/`checkSubmissionMinLength`는 여전히 거기 있고 시그니처도 같다 —
//  스키마 정규화를 먼저 태운 뒤 여기로 위임할 뿐이다).
//
// **이 파일에 import를 추가하지 마라.** 추가하는 순간 위 보장이 사라진다.
//
// ─────────────────────────────────────────────────────────────────────
// 무엇을 재는가 (Q35 결정 — 원문 근거는 `submission-schema.js` 하단 주석에 그대로 있다)
// ─────────────────────────────────────────────────────────────────────
//   · **스키마에 선언된 필드의 값만** 센다. 주제·라벨·헬퍼·`notice`는 세지 않는다.
//     외부(`api/evaluate-text.js:38`)는 라벨과 주제가 섞인 결합 문자열을 재서, 본문을 한
//     글자도 안 써도 게이트를 통과했다.
//   · 정규화는 `replace(/\s+/g, ' ').trim()` — 개행 100번으로 게이트가 뚫리면 안 된다.
//   · 길이는 `[...s].length`(코드 포인트) — 이모지 1개가 2자로 세어지지 않게.

/** 제출물 최소 길이(§12.2 Q35 — 임계값 100은 외부 `evaluate-text.js:38`에서 유지). */
export const SUBMISSION_MIN_CHARS = 100;

/** 필드 값 1개의 글자 수. 시안 카운터가 그대로 렌더하는 수(`{n}자`)다. */
export function countFieldChars(value) {
  return [...String(value ?? '').replace(/\s+/g, ' ').trim()].length;
}

/**
 * 필드 목록에 선언된 키만 골라 필드별·합계 글자 수를 낸다.
 *
 * `schemaFields`는 **이미 정규화된** 필드 배열이다(서버는 `normalizeSubmissionSchema`를
 * 통과시킨 뒤, 클라이언트는 서버가 내려준 스키마를 그대로 넘긴다 — GET/PUT 응답의
 * `schema`는 항상 정규화를 거친 값이다). 그래도 배열이 아닌 값이 오면 빈 배열로 떨어뜨려
 * 화면이 죽지 않게 한다.
 *
 * 반환 `perField`는 그대로 `performance_submissions.char_counts`에 들어가는 모양이고
 * (선언된 키는 값이 비어도 `0`으로 존재한다 — 화면이 카운터를 그리려면 키가 있어야 한다),
 * `total`은 최소 길이 판정 입력이다.
 *
 * ⚠️ **같은 키가 두 번 나오면 한 번만 센다**(검토 P11). 정본 경로에서는
 * `normalizeSubmissionSchema`가 이미 키를 유일하게 만들어 주지만, 이 함수는 브라우저가
 * 서버에서 받은 배열을 그대로 넘겨 부르는 잎 모듈이라 **선언 배열을 신뢰하지 않는다** —
 * 키가 겹치면 같은 값이 total에 두 번 더해져 100자 게이트가 실제로는 50자가 된다.
 * `perField`는 어차피 객체라 키가 하나로 접히므로, total만 그 모양과 어긋나던 것을 맞춘다.
 */
export function countFieldsChars(schemaFields, values = {}) {
  const fields = Array.isArray(schemaFields) ? schemaFields : [];
  const source = values && typeof values === 'object' ? values : {};
  const perField = {};
  let total = 0;

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(perField, field.key)) continue;
    const count = countFieldChars(source[field.key]);
    perField[field.key] = count;
    total += count;
  }

  return { perField, total };
}

/**
 * 제출 게이트 — 필수 필드 누락 + 최소 길이(§9.3/§12.2 Q35).
 *
 * 순서는 **필수 누락 먼저** — 학생에게 "무엇을 안 썼는지"가 "몇 자 모자라는지"보다 먼저
 * 필요한 정보다. `missingRequired`는 라벨 배열이라 그대로 안내 문구에 넣을 수 있다.
 *
 * 반환만 하고 throw 하지 않는다. HTTP 응답 형태(§8.6 L1811 `{ error:{code,message} }`)는
 * 엔드포인트가 정하고, 화면 문구는 제출폼이 정한다.
 */
export function checkFieldsMinLength(schemaFields, values = {}) {
  const fields = Array.isArray(schemaFields) ? schemaFields : [];
  const { perField, total } = countFieldsChars(fields, values);

  const missingRequired = fields
    .filter((field) => field.required && perField[field.key] === 0)
    .map((field) => field.label);

  return {
    ok: missingRequired.length === 0 && total >= SUBMISSION_MIN_CHARS,
    total,
    perField,
    threshold: SUBMISSION_MIN_CHARS,
    missingRequired
  };
}
