// STEP5 평가 후 분기 3버튼 회귀 검증 — scripts/verify-performance-evaluation-report.mjs
// [7] 절 이식(모달 본체는 EvaluationReportModal.test.tsx로 분리).
//   docs/수행평가-상세-명세.md §5.17(`3754:4349` 실측) / §12.2(3분기 확정 의미론).
//
// 무엇을 막는가
// -------------
// §5.17 3버튼의 순서·위계(primary는 `추가 수행평가 진행하기` — 시안 실측이며 §11-Q16이
// 닫히기 전까지 임의로 뒤집지 않는다)와 확정 액션의 결과 고지(`aria-describedby`),
// 잠금이 `disabled`가 아니라 `aria-disabled`로 표현되는지(검토 P11 — `disabled` 버튼은
// 포커스를 못 받아 `aria-describedby`/`aria-busy`가 낭독되지 않는다).
//
// 이식 메모(node:test → Vitest, task 10.8)
// -----------------------------------------
// 이 컴포넌트는 `createPortal`을 쓰지 않아 `renderToStaticMarkup`을 그대로 쓸 수 있다
// (EvaluationReportModal과 달리 esbuild 스텁도 jsdom 포털도 필요 없었다). Vitest가 TSX를
// 직접 변환하므로 컴포넌트를 그대로 import한다.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import EvaluationBranchActions from "./EvaluationBranchActions";

const stripTags = (value: string) => value.replace(/<[^>]*>/g, "").trim();

function collect(html: string, tag: string) {
  const out: { attrs: string; text: string }[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "g");
  for (const m of html.matchAll(re)) {
    out.push({ attrs: m[1] as string, text: stripTags(m[2] as string) });
  }
  return out;
}

function render(props: React.ComponentProps<typeof EvaluationBranchActions>) {
  return renderToStaticMarkup(<EvaluationBranchActions {...props} />);
}

const BRANCH_ORDER = [
  "추가 평가 받기",
  "이대로 확정짓기",
  "추가 수행평가 진행하기",
];

describe("§5.17 분기 3버튼 — 순서·위계·치수", () => {
  const html = render({});
  const buttons = collect(html, "button");

  test("버튼 순서가 §5.17 실측과 같다", () => {
    expect(buttons.map((b) => b.text)).toEqual(BRANCH_ORDER);
  });

  test("primary는 `추가 수행평가 진행하기`다(§5.17 실측 + §11.1 Q5). §11-Q16이 닫히기 전까지 뒤집지 않는다", () => {
    expect(buttons[2]?.attrs).toMatch(/\bbg-primary\b/);
  });

  test("`추가 평가 받기`/`이대로 확정짓기`는 secondary(stroke #d9d9d9)다", () => {
    expect(buttons[0]?.attrs).not.toMatch(/\bbg-primary\b/);
    expect(buttons[1]?.attrs).not.toMatch(/\bbg-primary\b/);
  });

  test.each(buttons.map((b, i) => [i, b] as const))(
    "버튼 %s이 §5.17 실측 16.25rem×3.25rem이다",
    (_i, button) => {
      expect(button.attrs).toMatch(/h-\[3\.25rem\]/);
      expect(button.attrs).toMatch(/w-\[16\.25rem\]/);
    },
  );

  // 확정 2버튼은 결과를 미리 알린다(확인 다이얼로그는 §5.17에 없어 만들지 않았다).
  test("확정 2버튼(`이대로 확정짓기`/`추가 수행평가 진행하기`)에 같은 결과 고지가 걸려 있다", () => {
    const describedBy = buttons
      .slice(1)
      .map((b) => b.attrs.match(/aria-describedby="([^"]+)"/));
    expect(describedBy.every(Boolean)).toBe(true);
    expect(describedBy[0]?.[1]).toBe(describedBy[1]?.[1]);
    const id = describedBy[0]?.[1] as string;
    expect(new RegExp(`id="${id}"`).test(html)).toBe(true);
  });
});

// ⚠ 잠금은 `disabled`가 아니라 `aria-disabled`다(검토 P11 — `SubmissionForm`이 세운 관례).
//   `disabled` 버튼은 ⓐ 방금 누른 버튼에서 포커스가 `<body>`로 떨어지고(확정 실패 경로에는
//   복귀가 없다) ⓑ 포커스를 못 받아 `aria-describedby`/`aria-busy`가 낭독되지 않는다.
//   판정에 `/disabled/`를 쓰면 Tailwind의 `aria-disabled:` variant 클래스에 걸려 항상
//   통과하므로(무증상 무효 검사) 속성 렌더 형태만 본다.
const isLocked = (attrs: string | undefined) =>
  /\saria-disabled="true"/.test(attrs || "");
const hasDisabledAttr = (attrs: string | undefined) =>
  /\sdisabled=""/.test(attrs || "");

describe("확정 진행 중 — 세 버튼 모두 잠금(§12.2 폼 복원 충돌 방지)", () => {
  const html = render({ busyAction: "confirm" });
  const buttons = collect(html, "button");

  test("busyAction 중에는 세 버튼 모두 aria-disabled=true다", () => {
    expect(buttons.every((b) => isLocked(b.attrs))).toBe(true);
  });

  test("진행 중인 액션에 aria-busy가 있다", () => {
    expect(/aria-busy="true"/.test(html)).toBe(true);
  });

  test("분기 버튼에 `disabled` 속성이 되살아나지 않는다", () => {
    expect(buttons.every((b) => !hasDisabledAttr(b.attrs))).toBe(true);
  });
});

describe("재평가 상한(§9.2) — 눌러서 409를 보게 하지 않고 미리 잠근다", () => {
  const html = render({
    reevaluateDisabled: true,
    reevaluateNote: "상한 안내",
  });
  const buttons = collect(html, "button");

  test("reevaluateDisabled면 `추가 평가 받기`가 잠긴다", () => {
    expect(isLocked(buttons[0]?.attrs)).toBe(true);
  });

  test("재평가 상한이 확정 버튼까지 잠그지 않는다(상한과 확정은 다른 축이다)", () => {
    expect(isLocked(buttons[2]?.attrs)).toBe(false);
  });

  test("reevaluateNote가 렌더된다", () => {
    expect(html.includes("상한 안내")).toBe(true);
  });

  test("상한 사유 문구가 `추가 평가 받기` 버튼의 aria-describedby로 연결된다", () => {
    const noteId = buttons[0]?.attrs.match(/aria-describedby="([^"]+)"/);
    expect(Boolean(noteId)).toBe(true);
    expect(
      new RegExp(`id="${noteId?.[1]}"[^>]*>상한 안내`).test(html),
    ).toBe(true);
  });
});
