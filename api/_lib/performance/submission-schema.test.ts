// 수행평가 제출 스키마 8종 회귀 검증 (원본 함수 직접 실행 대조).
//
// `submission-schema.ts`는 외부 앱(`/Users/hyunsoo/uwellnow/suhaengpyeong`)
// `index.html:2059-2244`의 인라인 script를 옮긴 것이다(docs/수행평가-상세-명세.md
// §12.2 3행, §10.2 P11). 정규식 하나, 어휘 하나, if 순서 하나가 바뀌어도 코드는
// 그대로 돌고 제출폼 필드만 조용히 달라진다. 그래서 원본 함수를 실제로 실행해
// 대조한다.
//
// 원본은 브라우저 인라인 script라 import가 불가능하다. 그래서 함수 선언 6개만
// 텍스트로 잘라내 `new Function`으로 되살린다. 잘라낸 구간에 예상 밖의 코드가
// 섞이면 즉시 실패한다(앵커 검증).
//
// 외부 앱은 이 저장소에 없는 로컬 경로다. 원본이 없는 환경(CI)에서는 원본
// 대조 구간을 skip하고, 원본이 있는 로컬에서만 실제 대조가 돈다. 경로는
// `SUHAENGPYEONG_DIR`로 덮어쓸 수 있다. 세션 어댑터(§⑪)는 우리 저장소 안의
// 배선만 보므로 원본 유무와 무관하게 항상 실행한다.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import type { StoredSubmissionSchema } from "./submission-schema.js";
import * as ported from "./submission-schema.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR =
  process.env.SUHAENGPYEONG_DIR || "/Users/hyunsoo/uwellnow/suhaengpyeong";
const SOURCE_HTML = path.join(SOURCE_DIR, "index.html");
const SOURCE_FIND = path.join(SOURCE_DIR, "api/find-resources.js");
const PORT_FILE = path.join(CURRENT_DIR, "submission-schema.ts");

const sourceExists = fs.existsSync(SOURCE_HTML);

type OriginalSubmissionField = {
  key: string;
  label: string;
  helper: string;
  rows?: number;
  required: boolean;
};
type OriginalSubmissionSchema = {
  type: string;
  label: string;
  notice: string;
  fields: OriginalSubmissionField[];
};
type OriginalModule = {
  makeSubmissionField: (
    key: string,
    label: string,
    helper: string,
    required?: boolean,
  ) => OriginalSubmissionField;
  defaultSubmissionSchema: () => OriginalSubmissionSchema;
  isRubricLikeQuestion: (text: string) => boolean;
  extractAssessmentQuestions: (text: string) => unknown;
  inferLengthBasedSchema: (raw: string) => OriginalSubmissionSchema | null;
  inferSubmissionSchema: (text: unknown) => OriginalSubmissionSchema;
  normalizeSubmissionSchema: (input: unknown) => OriginalSubmissionSchema;
  buildSubmissionText: (
    topic: unknown,
    schema: OriginalSubmissionSchema,
    fields: Record<string, unknown>,
  ) => string;
};

let original: OriginalModule | undefined;
let portText = "";
let originalSlice = "";
let htmlText = "";

/** §12.2 3행에 따라 `rows`는 폐기했다. 그것이 유일한 차이임을 증명하기 위해,
 * 원본 산출물에서 `rows` 키만 제거한 뒤 완전 일치를 요구한다. */
function stripRows(schema: OriginalSubmissionSchema): ported.SubmissionSchema {
  return {
    ...schema,
    fields: schema.fields.map(({ rows, ...rest }) => rest),
  };
}

function shape(schema: { type: string; fields: { key: string }[] }): string {
  return `${schema.type}(${schema.fields.length}) ${schema.fields.map((f) => f.key).join(",")}`;
}

let sameSchema: (text: unknown) => {
  same: boolean;
  expected: ported.SubmissionSchema;
  actual: ported.SubmissionSchema;
};

if (sourceExists) {
  htmlText = fs.readFileSync(SOURCE_HTML, "utf8");
  const sliceStart = htmlText.indexOf("function makeSubmissionField");
  const sliceEnd = htmlText.indexOf("function buildSubmissionText");

  if (sliceStart < 0 || sliceEnd < 0 || sliceEnd <= sliceStart) {
    throw new Error(
      "원본에서 제출 스키마 구간을 찾지 못했습니다 (index.html 구조 변경?).",
    );
  }

  originalSlice = htmlText.slice(sliceStart, sliceEnd).trim();
  const declaredFns = [...originalSlice.matchAll(/^function\s+(\w+)/gm)].map(
    (m) => m[1],
  );

  assert.deepStrictEqual(
    declaredFns,
    [
      "makeSubmissionField",
      "defaultSubmissionSchema",
      "isRubricLikeQuestion",
      "extractAssessmentQuestions",
      "inferLengthBasedSchema",
      "inferSubmissionSchema",
      "normalizeSubmissionSchema",
    ],
    `원본 구간 함수 목록이 예상과 다릅니다: ${declaredFns.join(", ")}`,
  );

  // `inferSubmissionSchema`는 전역 `assessmentInfo`를 읽으므로 스코프 안에 그
  // 변수를 만들어 두고 인자로 주입하는 래퍼를 함께 돌려준다.
  // 원본 함수를 텍스트로 잘라 그대로 되살려 실행 대조하는 것이 이 검증의
  // 핵심이다(앵커 검증으로 예상 밖 코드 혼입을 막는다).
  original = new Function(`
    let assessmentInfo = '';
    ${originalSlice}
    return {
      makeSubmissionField,
      defaultSubmissionSchema,
      isRubricLikeQuestion,
      extractAssessmentQuestions,
      inferLengthBasedSchema,
      normalizeSubmissionSchema,
      inferSubmissionSchema: (text) => { assessmentInfo = String(text ?? ''); return inferSubmissionSchema(); },
      buildSubmissionText: (topic, schema, fields) => {
        // index.html:2246-2252 원문. Q35에서 "외부가 실제로 잰 문자열"을 재현하는 데만 쓴다.
        const lines = ['주제: ' + topic, '', '[제출 형식] ' + schema.label];
        schema.fields.forEach((field) => { lines.push('', '[' + field.label + ']', fields[field.key] || ''); });
        return lines.join('\\n').trim();
      }
    };
  `)() as OriginalModule;

  portText = fs.readFileSync(PORT_FILE, "utf8");

  sameSchema = (text: unknown) => {
    const expected = stripRows(original!.inferSubmissionSchema(text));
    const actual = ported.inferSubmissionSchema(text as string);
    return {
      same: JSON.stringify(expected) === JSON.stringify(actual),
      expected,
      actual,
    };
  };
}

// ── 8종 대표 입력 + 경계 케이스 ─────────────────────────────────────────
// `label`은 사람이 읽는 이름일 뿐이고, 정답은 항상 원본 실행 결과다.
const CASES: { label: string; text: string | null | undefined }[] = [
  {
    label: "1. 문항별 답변형",
    text: [
      "[수행평가 기본 정보]",
      "- 교과/과목: 과학 / 생명과학",
      "",
      "[답변 문항 목록 - 절대 누락 금지]",
      "질문 1: 선택한 주제를 고른 이유는 무엇인가요?",
      "질문 2: 탐구 과정에서 확인한 사실을 서술하시오.",
    ].join("\n"),
  },
  {
    label: "2. 안내문 맞춤 작성형 (4필드 전부)",
    text: [
      "[세부 요구사항]",
      "- 필수 포함 내용: 주제 선정 이유, 탐구 내용, 배우고 느낀 점, 참고 문헌",
      "- 분량: 1000자 이상",
      "질문 목록 없음",
    ].join("\n"),
  },
  {
    label: "3. 카드뉴스·홍보물형",
    text: "[세부 요구사항]\n- 필수 포함 내용: 감염병 예방 카드뉴스 4장 제작\n질문 목록 없음",
  },
  {
    label: "4. 발표·PPT형",
    text: "[수행평가 기본 정보]\n- 수행평가 유형: 조별 발표\n- 제출 형식: PPT 10장 + 발표 대본\n질문 목록 없음",
  },
  {
    label: "5. 칼럼·논술형",
    text: "[세부 요구사항]\n- 사회 문제에 대한 자신의 주장을 담은 칼럼을 작성한다.\n질문 목록 없음",
  },
  {
    label: "6. 독서·서평형",
    text: "[세부 요구사항]\n- 지정 도서를 읽고 서평을 작성한다.\n질문 목록 없음",
  },
  {
    label: "7. 탐구보고서형",
    text: "[수행평가 기본 정보]\n- 수행평가 유형: 실험 결과를 정리한 탐구보고서 제출\n질문 목록 없음",
  },
  {
    label: "8. 기본 보고서형",
    text: "[수행평가 기본 정보]\n- 교과/과목: 국어 / 화법과 언어\n- 제출 기한: 정보 없음\n질문 목록 없음",
  },

  // ── 경계 케이스 (우선순위가 실제로 갈리는 지점)
  {
    // 문항형 ∧ 보고서 — 1번이 7번을 이겨야 한다.
    label: "B1. 문항형 + 탐구보고서 동시 충족",
    text: "[제출 형식] 실험 탐구보고서\n[답변 문항 목록]\n질문 1: 실험 설계에서 통제한 변인은 무엇인가요?",
  },
  {
    // 질문 형식이지만 전부 루브릭 — 문항형이 발동하면 안 된다.
    label: "B2. 질문 형식이지만 전부 루브릭 (문항형 미발동)",
    text: [
      "[평가 기준 및 배점]",
      "질문 1: 도서명, 탐구 주제, 관련 단원을 구체적으로 제시하였는가?",
      "질문 2: 교과 개념과 진로를 논리적으로 연결했는가?",
      "[세부 요구사항]",
      "- 조사 보고서 형태로 제출",
    ].join("\n"),
  },
  {
    // 분량형 ∧ 카드뉴스 — 여기가 설계 리포트 판정과 갈리는 지점이다. 제출
    // 스키마는 분량형(2번)이 카드뉴스(3번)를 이기고, `inferAssessmentStructure`는
    // 카드뉴스가 분량형을 이긴다. 그 사실 자체를 고정한다.
    label: "B3. 분량조건 + 카드뉴스 동시 충족 (설계 판정과 갈리는 지점)",
    text: "카드뉴스 4장을 제작하고 탐구 내용을 800자 이상 정리한다.",
  },
  {
    label: "B4. 카드뉴스 + 발표 + 칼럼 + 독서 + 보고서 동시 충족",
    text: "카드뉴스와 PPT 발표, 칼럼, 독서 감상문을 함께 제출하는 탐구보고서.\n질문 목록 없음",
  },
  {
    label: "B5. 발표 + 칼럼 동시 충족",
    text: "주장하는 글(논설문)을 쓰고 이를 프레젠테이션으로 발표한다.",
  },
  {
    label: "B6. 칼럼 + 독서 동시 충족",
    text: "읽은 책에 대한 비평문을 작성한다.",
  },
  {
    label: "B7. 독서 + 보고서 동시 충족",
    text: "도서를 읽고 조사 보고서를 제출한다.",
  },
  {
    // 분량 조건만 있고 탐구/느낀점이 없으면 분량형 게이트가 열리지 않는다.
    label: "B8. 분량 조건만 (게이트 미충족 → 보고서형으로)",
    text: "보고서를 1200자 이상 작성한다.",
  },
  {
    // 탐구 내용은 있는데 분량 조건이 없으면 게이트가 열리지 않는다.
    label: "B9. 탐구 내용만 (분량 조건 없음 → 기본형으로)",
    text: "탐구 내용을 정리하여 제출한다.",
  },
  { label: "B10. 빈 문자열", text: "" },
  { label: "B11. 공백만", text: "   \n\n\t  " },
  { label: "B12. null 전달", text: null },
  { label: "B13. undefined 전달", text: undefined },
  {
    // "질문 목록 없음" 리터럴이 문항으로 잡히면 안 된다.
    label: "B14. 질문 목록 없음 리터럴",
    text: "[답변 문항 목록 - 절대 누락 금지]\n질문 1: 질문 목록 없음\n[세부 요구사항]\n- 에세이 작성",
  },
  {
    // 개행을 뭉개면 행 앵커가 죽어 문항형이 발동하지 않는다는 사실을 고정한다.
    label: "B15. 개행 없이 한 줄로 뭉갠 안내문 (행 앵커 실패)",
    text: "[답변 문항 목록] 질문 1: 주제 선정 이유는 무엇인가요? 질문 2: 탐구 결과는 무엇인가요?",
  },
  { label: "B16. 대문자 PPT / 소문자 ppt", text: "PPT 자료를 제작한다." },
  {
    label: "B17. 「탐구 내용」 띄어쓰기 변형 + 분량",
    text: "탐구  내용을 500 자 이상 정리하시오.",
  },
  {
    label: "B18. 전각 콜론 문항",
    text: "질문 1：전각 콜론으로 적힌 문항은 무엇을 묻나요?",
  },
  {
    label: "B19. 불릿 접두 문항",
    text: "- 질문 1: 주제를 고른 이유는 무엇인가요?\n• 질문 2: 무엇을 배웠나요?",
  },
];

describe.skipIf(!sourceExists)(
  "원본 실행 대조 (SUHAENGPYEONG_DIR 필요)",
  () => {
    describe("8종 판정 대조 — 대표 입력 + 경계 케이스", () => {
      test.each(CASES)("$label", ({ text }) => {
        const { same, expected, actual } = sameSchema(text);
        expect(
          same,
          `원본 ${JSON.stringify(expected)}\n      이식 ${JSON.stringify(actual)}`,
        ).toBe(true);
      });
    });

    // 8유형 트리거 조각의 부분집합 256가지. if 순서가 하나라도 바뀌면 다수가 즉시 어긋난다.
    test("우선순위 전수 대조 — 트리거 조합 256가지 전건 일치 + 8종 모두 등장", () => {
      const TRIGGERS = [
        "질문 1: 이 주제를 고른 이유는 무엇인가요?", // 1. 문항형
        "탐구 내용을 정리", // 2-a. 분량형 게이트(항목)
        "분량은 500자 이상", // 2-b. 분량형 게이트(분량)
        "카드뉴스 형태로 제작", // 3. 카드뉴스
        "발표 대본을 준비", // 4. 발표
        "칼럼 형식으로 작성", // 5. 칼럼
        "독서 감상문 제출", // 6. 독서
        "탐구보고서로 제출", // 7. 보고서
      ];

      let comboMismatch = 0;
      let comboFirst = "";
      const comboTypes = new Set<string>();

      for (let mask = 0; mask < 1 << TRIGGERS.length; mask += 1) {
        const text = TRIGGERS.filter((_, i) => mask & (1 << i)).join("\n");
        const { same, expected, actual } = sameSchema(text);
        comboTypes.add(expected.type);

        if (!same) {
          comboMismatch += 1;
          if (!comboFirst)
            comboFirst = `입력 ${JSON.stringify(text)}\n      원본 ${shape(expected)} / 이식 ${shape(actual)}`;
        }
      }

      expect(comboMismatch, comboFirst).toBe(0);
      expect(
        comboTypes.size,
        `누락: ${ported.SUBMISSION_SCHEMA_TYPES.filter((t) => !comboTypes.has(t)).join(", ")}`,
      ).toBe(8);
    });

    // §12.2 3행이 「문항형 20개 상한(`:2152`) 유지」로 명시 지정한 지점이다.
    describe("문항형 경계 — 최대 20필드", () => {
      function questionGuide(
        count: number,
        { start = 1, step = 1 }: { start?: number; step?: number } = {},
      ) {
        return Array.from(
          { length: count },
          (_, i) =>
            `질문 ${start + i * step}: ${start + i * step}번 문항은 무엇을 묻나요?`,
        ).join("\n");
      }

      const QUESTION_CASES: {
        label: string;
        text: string;
        expectType?: string;
        expectFields?: number;
      }[] = [
        {
          label: "문항 0개 (질문 줄 자체가 없음 → 보고서형)",
          text: "실험 결과를 정리해 보고서로 제출한다.",
          expectType: "research_report",
        },
        {
          label: "문항 0개 (트리거 어휘도 없음 → 기본형)",
          text: "자유롭게 정리해 제출한다.",
          expectType: "basic_report",
        },
        {
          label: "문항 1개 (임계값 하한 — 1건으로 발동)",
          text: questionGuide(1),
          expectFields: 1,
        },
        { label: "문항 19개", text: questionGuide(19), expectFields: 19 },
        {
          label: "문항 20개 (상한 정확히)",
          text: questionGuide(20),
          expectFields: 20,
        },
        {
          label: "문항 21개 (상한 초과)",
          text: questionGuide(21),
          expectFields: 20,
        },
        {
          label: "문항 25개 (상한 초과)",
          text: questionGuide(25),
          expectFields: 20,
        },
        {
          label: "문항 50개 (상한 초과)",
          text: questionGuide(50),
          expectFields: 20,
        },
        {
          label: "문항 번호 비연속 (11,13,15,…)",
          text: questionGuide(25, { start: 11, step: 2 }),
          expectFields: 20,
        },
        {
          label: "문항 번호 역순 + 중복 (정렬·중복제거 후 3개)",
          text: [
            "질문 3: 후속 탐구 계획을 어떻게 세울 것인가요?",
            "질문 1: 주제를 고른 이유는 무엇인가요?",
            "질문 1: 주제를 고른 이유는 무엇인가요?",
            "질문 2: 탐구 결과는 무엇인가요?",
          ].join("\n"),
          expectFields: 3,
        },
        {
          label: "문항 30개 중 절반이 루브릭 (루브릭 제외 후 15개)",
          text: Array.from({ length: 30 }, (_, i) =>
            i % 2 === 0
              ? `질문 ${i + 1}: ${i + 1}번 문항은 무엇을 묻나요?`
              : `질문 ${i + 1}: 교과 개념을 구체적으로 제시하였는가?`,
          ).join("\n"),
          expectFields: 15,
        },
      ];

      test.each(QUESTION_CASES)(
        "$label",
        ({ text, expectType, expectFields }) => {
          const { same, expected, actual } = sameSchema(text);
          expect(
            same,
            `원본 ${shape(expected)}\n      이식 ${shape(actual)}`,
          ).toBe(true);

          if (expectFields !== undefined) {
            expect(actual.type).toBe("question_based");
            expect(actual.fields.length).toBe(expectFields);
          }
          if (expectType) {
            expect(actual.type).toBe(expectType);
          }
        },
      );

      // 상한 초과 시 번호가 작은 20개가 남고 키가 문항 번호를 따라가는지.
      test("상한 초과 시 번호 오름차순 상위 20개 유지 (question_11 … question_49)", () => {
        const over = ported.inferSubmissionSchema(
          questionGuide(25, { start: 11, step: 2 }),
        );
        expect(over.fields[0]?.key).toBe("question_11");
        expect(over.fields[0]?.label).toBe("문항 11");
        expect(over.fields[19]?.key).toBe("question_49");
        expect(over.fields.length).toBe(20);
        expect(over.fields[0]?.helper).toBe("11번 문항은 무엇을 묻나요?");
      });
    });

    // 4개 후보 필드(motive/exploration/reflection/references)가 조건부라 조합이 16가지다.
    test("분량형 후보 필드 조합 전수 (16가지)", () => {
      const LENGTH_PARTS = [
        "주제 선정 이유를 적는다", // motive
        "탐구 내용을 정리한다", // exploration
        "배우고 느낀 점을 쓴다", // reflection
        "참고 문헌을 밝힌다", // references
      ];

      let lengthMismatch = 0;
      let lengthFirst = "";

      for (let mask = 0; mask < 1 << LENGTH_PARTS.length; mask += 1) {
        const text = `${LENGTH_PARTS.filter((_, i) => mask & (1 << i)).join("\n")}\n분량은 800자 이상`;
        const { same, expected, actual } = sameSchema(text);

        if (!same) {
          lengthMismatch += 1;
          if (!lengthFirst)
            lengthFirst = `입력 ${JSON.stringify(text)}\n      원본 ${shape(expected)} / 이식 ${shape(actual)}`;
        }
      }

      expect(lengthMismatch, lengthFirst).toBe(0);
    });

    // `inferLengthBasedSchema` 단독 대조(게이트 미충족 시 null).
    test("inferLengthBasedSchema 단독 대조 (null 폴백 포함)", () => {
      const LENGTH_DIRECT = [
        "",
        "분량은 500자 이상",
        "탐구 내용을 정리한다",
        "탐구 내용을 500자 이상 정리한다",
        "느낀점을 800자로 쓴다",
        "소감을 띄어쓰기 포함 1000자로 쓴다",
        "활동 내용을 분량에 맞춰 작성",
        "조사 내용과 출처를 1200자 이상",
      ];

      for (const text of LENGTH_DIRECT) {
        const expectedRaw = original!.inferLengthBasedSchema(text);
        const expected = expectedRaw ? stripRows(expectedRaw) : null;
        const actual = ported.inferLengthBasedSchema(text);
        expect(JSON.stringify(actual), `text=${JSON.stringify(text)}`).toBe(
          JSON.stringify(expected),
        );
      }
    });

    test("normalizeSubmissionSchema 대조 (rows 제외)", () => {
      const NORMALIZE_CASES: unknown[] = [
        null,
        undefined,
        {},
        { fields: [] },
        { fields: "not-an-array" },
        {
          type: "question_based",
          label: "X",
          notice: "Y",
          fields: [{ key: "a", label: "A", helper: "h" }],
        },
        { fields: [{}, {}] },
        {
          fields: [{ key: "k1", required: false }, { label: "라벨만" }],
        },
        {
          type: "",
          label: "",
          notice: "",
          fields: [{ key: "", label: "", helper: "" }],
        },
      ];

      for (const input of NORMALIZE_CASES) {
        const expected = stripRows(original!.normalizeSubmissionSchema(input));
        const actual = ported.normalizeSubmissionSchema(
          input as StoredSubmissionSchema | null | undefined,
        );
        expect(JSON.stringify(actual), `input=${JSON.stringify(input)}`).toBe(
          JSON.stringify(expected),
        );
      }
    });

    // 위 대조는 전부 stripRows를 거친다. 그 전제 자체 — 원본 필드가 정확히
    // 5키이고 우리 필드가 정확히 그 4키라는 것 — 을 여기서 못박는다.
    describe("rows 폐기가 유일한 차이인가 — §12.2 3행", () => {
      test("원본 필드 키 = [key,label,helper,rows,required]", () => {
        const sampleOriginal = original!.inferSubmissionSchema(CASES[1]!.text);
        expect(
          sampleOriginal.fields.every(
            (f) =>
              JSON.stringify(Object.keys(f)) ===
              JSON.stringify(["key", "label", "helper", "rows", "required"]),
          ),
        ).toBe(true);
      });

      test("이식 필드 키 = [key,label,helper,required] (rows만 빠짐)", () => {
        const samplePorted = ported.inferSubmissionSchema(
          CASES[1]!.text as string,
        );
        expect(
          samplePorted.fields.every(
            (f) =>
              JSON.stringify(Object.keys(f)) ===
              JSON.stringify(["key", "label", "helper", "required"]),
          ),
        ).toBe(true);
      });

      test("이식본 어디에도 rows가 남아 있지 않다", () => {
        expect(portText.match(/^\s*rows\s*[:,]/m)).toBeNull();
      });
    });

    // 행동이 같아도 리터럴을 "정리"해두면 다음 사람이 판정을 바꾸기 쉬워진다.
    describe("리터럴 원문 대조", () => {
      // 이식 대상 구간에서 isRubricLikeQuestion/extractAssessmentQuestions 본문은
      // 뺀다 — 그 둘은 guide-structure.ts에 이미 있고 여기서 사본을 만들지 않는
      // 것이 규정이다.
      const rubricStart = originalSlice.indexOf(
        "function isRubricLikeQuestion",
      );
      const rubricEnd = originalSlice.indexOf(
        "function inferLengthBasedSchema",
      );
      const portScopeSlice =
        originalSlice.slice(0, rubricStart) + originalSlice.slice(rubricEnd);

      const sourceRegexLiterals = [
        ...portScopeSlice.matchAll(
          /\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*/g,
        ),
      ]
        .map((m) => m[0])
        .filter((literal) => literal.length > 3);

      const sourceStringLiterals = [
        ...portScopeSlice.matchAll(/'((?:[^'\\]|\\.)*)'/g),
      ]
        .map((m) => m[0])
        .filter((literal) => literal.length > 4);

      test("정규식 리터럴 원문 보존 (10개 이상)", () => {
        const missing = sourceRegexLiterals.filter(
          (literal) => !portText.includes(literal),
        );
        expect(sourceRegexLiterals.length).toBeGreaterThanOrEqual(10);
        expect(missing).toEqual([]);
      });

      // 원본은 단일따옴표 문자열이지만 이 저장소는 biome 관례상 이중따옴표로
      // 포맷된다(quoteStyle: "double") — 내용이 원문 그대로인지가 계약이므로
      // 두 따옴표 스타일 모두 인정한다.
      test("문자열 리터럴 원문 보존 (40개 이상 — 라벨·헬퍼·notice 전량)", () => {
        const missing = sourceStringLiterals.filter((literal) => {
          if (portText.includes(literal)) return false;
          const inner = literal.slice(1, -1);
          return !portText.includes(`"${inner}"`);
        });
        expect(sourceStringLiterals.length).toBeGreaterThanOrEqual(40);
        expect(missing).toEqual([]);
      });

      // 리터럴이 보존돼도 행동까지 같은지는 별개다. 대표 입력은 사람이 고른
      // 것이라 어휘 하나가 빠져도(예: `뉴스레터`) 코퍼스에 없으면 통과해
      // 버린다. 그래서 원본 정규식의 alternation 토큰을 전부 뽑아 그 자체를
      // 입력으로 먹인다.
      test("어휘 토큰 단건 판정 일치 (25개 이상)", () => {
        const vocabulary = [
          ...new Set(
            sourceRegexLiterals
              .flatMap((literal) =>
                literal.replace(/^\/|\/[gimsuy]*$/g, "").split("|"),
              )
              .map((token) =>
                token
                  .replace(/^\(|\)$/g, "")
                  .replace(/\\s\*/g, "")
                  .replace(/\\d\+/g, "3")
                  .replace(/\\\?/g, "?"),
              )
              .filter((token) => token && !/[\\[\](){}^$*+?]/.test(token)),
          ),
        ];

        const vocabMismatch = vocabulary.filter(
          (token) => !sameSchema(token).same,
        );
        expect(vocabulary.length).toBeGreaterThanOrEqual(25);
        expect(vocabMismatch).toEqual([]);
      });
    });

    // 외부에는 같은 판정이 클라이언트/서버 두 곳에 복제돼 있다. 우리는
    // guide-structure.ts 것 하나만 쓴다. 그 전제(두 원본이 실제로 같다)를
    // 매번 확인한다.
    describe("루브릭 판별 단일화 — 사본 금지", () => {
      const sourceFindExists = fs.existsSync(SOURCE_FIND);

      test.skipIf(!sourceFindExists)(
        "index.html:2076-2089 == find-resources.js:211-224 (공백 제외 동일) + 행동 3자 일치",
        () => {
          const findText = fs.readFileSync(SOURCE_FIND, "utf8");
          const grab = (src: string, from: string, to: string) => {
            const a = src.indexOf(from);
            return src.slice(a, src.indexOf(to, a)).trim();
          };
          const rubricHtml = grab(
            htmlText,
            "function isRubricLikeQuestion",
            "function extractAssessmentQuestions",
          );
          const rubricApi = grab(
            findText,
            "function isRubricLikeQuestion",
            "function extractAnswerQuestions",
          );
          const strip = (s: string) => s.replace(/\s+/g, "");

          expect(
            strip(rubricHtml) === strip(rubricApi),
            `두 원본이 갈렸습니다. 임의 통합 금지 — 차이를 명세에 올릴 것.\n      html: ${rubricHtml}\n      api : ${rubricApi}`,
          ).toBe(true);

          // 행동 대조까지. 문자열이 같아도 확인 비용이 0이다. 원본 함수를
          // 텍스트로 잘라 그대로 되살려 실행 대조한다.
          const apiRubric = new Function(
            `${rubricApi}\nreturn isRubricLikeQuestion;`,
          )() as (text: string) => boolean;
          const RUBRIC_CORPUS = [
            "",
            "   ",
            "도서명, 탐구 주제, 관련 단원을 구체적으로 제시하였는가?",
            "교과 개념과 진로를 논리적으로 연결했는가",
            "평가 기준: 자료 활용의 적절성",
            "배점 20점",
            "채점 기준표 참고",
            "체크리스트 3",
            "체크 3",
            "주제를 고른 이유는 무엇인가요?",
            "탐구 과정을 구체적으로 서술하시오.",
            "자료를 적절히 활용하여 근거를 제시",
            "자료를 적절히 활용하여 근거를 제시하시오",
            "느낀 점을 구체적으로 작성",
            "탐구 내용을 체계적으로 정리",
            "왜 그런 결과가 나왔는지 명확하게 설명",
            "실험 결과를 정확하게 반영",
            "하 였 는 가",
            "내용을 충실히 포함",
          ];
          const rubricMismatch = RUBRIC_CORPUS.filter((t) => {
            const a = original!.isRubricLikeQuestion(t);
            const b = apiRubric(t);
            const c = ported.isRubricLikeQuestion(t);
            return !(a === b && b === c);
          });
          expect(rubricMismatch).toEqual([]);
        },
      );

      test("이식본에 isRubricLikeQuestion 사본이 없다 (guide-structure.ts 재수출만)", () => {
        expect(/function\s+isRubricLikeQuestion/.test(portText)).toBe(false);
        expect(/from ["']\.\/guide-structure\.js["']/.test(portText)).toBe(
          true,
        );
      });
    });

    // 「임계값 100 유지, 측정 대상만 변경」. 그 변경이 실제로 결과를 바꾸는지 본다.
    describe("글자 수 — Q35: 결합 문자열 → 필드 값 순수 본문 합", () => {
      const basic = ported.inferSubmissionSchema("");

      test("외부 계산식(결합 문자열)은 주제명 붙여넣기를 통과시키지만 우리 계산식은 막는다", () => {
        // §12.2 마지막 행이 지목한 바로 그 오용: 「주제명만 붙여넣고 회차를 태운다」.
        const abuseTopic =
          "의료 정보의 비판적 수용: 건강기능식품 광고의 설득 전략 분석";
        const abuseFields = { intro: abuseTopic, body: "", conclusion: "" };

        const externalLen = original!
          .buildSubmissionText(
            abuseTopic,
            original!.inferSubmissionSchema(""),
            abuseFields,
          )
          .trim().length;
        const ourGate = ported.checkSubmissionMinLength(basic, abuseFields);

        expect(externalLen).toBeGreaterThanOrEqual(ported.SUBMISSION_MIN_CHARS);
        expect(ourGate.total).toBe([...abuseTopic].length);
        expect(ourGate.ok).toBe(false);
      });

      test("본문 0자면 필수 필드 누락이 라벨로 나온다", () => {
        expect(
          ported.checkSubmissionMinLength(basic, {
            intro: "",
            body: "",
            conclusion: "",
          }).missingRequired,
        ).toEqual(["서론", "본론", "결론"]);
      });

      test("공백·개행 패딩은 0자로 접힌다 (오용 차단)", () => {
        expect(ported.countFieldChars("\n".repeat(200))).toBe(0);
        expect(ported.countFieldChars("   \t \n  ")).toBe(0);
        expect(
          ported.checkSubmissionMinLength(basic, {
            intro: " ".repeat(500),
            body: "",
            conclusion: "",
          }).total,
        ).toBe(0);
      });

      test("연속 공백은 1칸으로 접고 단일 공백은 센다", () => {
        expect(ported.countFieldChars("가  나   다")).toBe(5);
        expect(ported.countFieldChars("가 나 다")).toBe(5);
      });

      test("코드 포인트 단위 (이모지 1자)", () => {
        expect(ported.countFieldChars("🙂")).toBe(1);
        expect("🙂".length).toBe(2);
      });

      test("스키마 밖 키는 세지 않는다 (게이트 우회 차단)", () => {
        expect(
          ported.countSubmissionChars(basic, {
            intro: "가",
            junk: "나".repeat(500),
          }).total,
        ).toBe(1);
      });

      test("char_counts는 스키마 전 필드 키를 갖는다 (빈 값도 0으로)", () => {
        expect(
          Object.keys(
            ported.countSubmissionChars(basic, { intro: "가" }).perField,
          ),
        ).toEqual(["intro", "body", "conclusion"]);
      });

      test("임계값 정확히 100자 → 통과 / 99자 → 차단", () => {
        const pass = ported.checkSubmissionMinLength(basic, {
          intro: "가".repeat(40),
          body: "나".repeat(40),
          conclusion: "다".repeat(20),
        });
        expect(pass.total).toBe(100);
        expect(pass.ok).toBe(true);
        expect(pass.threshold).toBe(100);

        const fail99 = ported.checkSubmissionMinLength(basic, {
          intro: "가".repeat(40),
          body: "나".repeat(40),
          conclusion: "다".repeat(19),
        });
        expect(fail99.total).toBe(99);
        expect(fail99.ok).toBe(false);
        expect(fail99.missingRequired).toEqual([]);
      });
    });

    // 원본과 의도적으로 다른 유일한 지점(검토 P11). 원본(index.html:2152)은
    // 문항형 키를 문항 번호로 만들고 extractAnswerQuestions의 중복 제거 키는
    // `${no}:${text}`라, 같은 번호에 본문이 다른 두 줄이 있으면 키가 겹친
    // 스키마가 나온다. 우리는 normalizeSubmissionSchema에서 접미어로 갈라 준다.
    describe("필드 키 유일성 — 원본과 의도적 차이", () => {
      const DUP_GUIDE = [
        "질문 1: 이 주제를 왜 선택했는지 서술하시오",
        "질문 1: 탐구 과정에서 무엇을 알게 되었는지 서술하시오",
      ].join("\n");

      // describe 콜백 몸체는 skipIf 여부와 무관하게 항상 실행되므로(테스트만
      // 골라 skip된다), 원본 함수 호출은 beforeAll 안에서만 해야 한다 — skip된
      // 스위트는 beforeAll도 실행하지 않는다.
      let dupOriginal: OriginalSubmissionSchema;
      let dupPorted: ported.SubmissionSchema;
      let dupNormalized: ported.SubmissionSchema;

      beforeAll(() => {
        dupOriginal = original!.inferSubmissionSchema(DUP_GUIDE);
        dupPorted = ported.inferSubmissionSchema(DUP_GUIDE);
        dupNormalized = ported.normalizeSubmissionSchema(dupPorted);
      });

      test("ㄱ. 원본은 같은 번호의 두 문항에 같은 키를 만든다", () => {
        expect(dupOriginal.fields.map((f) => f.key)).toEqual([
          "question_1",
          "question_1",
        ]);
      });

      test("ㄴ. 판정(유형·라벨·notice·필드 라벨/헬퍼/순서)은 원본과 같다", () => {
        expect(dupPorted.type).toBe(dupOriginal.type);
        expect(dupPorted.label).toBe(dupOriginal.label);
        expect(dupPorted.notice).toBe(dupOriginal.notice);
        expect(
          dupPorted.fields.map((f) => [f.label, f.helper, f.required]),
        ).toEqual(
          dupOriginal.fields.map((f) => [f.label, f.helper, f.required]),
        );
      });

      test("ㄷ-1. 정규화가 뒤에 온 중복 키에만 접미어를 붙인다", () => {
        expect(dupNormalized.fields.map((f) => f.key)).toEqual([
          "question_1",
          "question_1_2",
        ]);
      });

      test("ㄷ-2. 60자 본문 1개가 100자 게이트를 통과하지 못한다 (이중 계상 없음)", () => {
        const gate = ported.checkSubmissionMinLength(dupPorted, {
          question_1: "가".repeat(60),
        });
        expect(gate.total).toBe(60);
        expect(gate.ok).toBe(false);
      });

      test("ㄷ-3. 두 필드를 각각 채우면 그대로 합산된다", () => {
        const counted = ported.countSubmissionChars(dupPorted, {
          question_1: "가".repeat(60),
          question_1_2: "나".repeat(60),
        });
        expect(counted.total).toBe(120);
        expect(Object.keys(counted.perField).length).toBe(2);
      });

      test("ㄷ-4. 정규화 자체가 멱등이다 (접미어가 매번 다시 붙지 않는다)", () => {
        expect(ported.normalizeSubmissionSchema(dupNormalized)).toEqual(
          dupNormalized,
        );
      });

      test("ㄷ-5. 중복이 없는 스키마는 키가 그대로다 (8종 정상 경로 무영향)", () => {
        for (const { text } of CASES) {
          if (text == null) continue;
          const inferred = ported.inferSubmissionSchema(text);
          expect(
            ported.normalizeSubmissionSchema(inferred).fields.map((f) => f.key),
          ).toEqual(inferred.fields.map((f) => f.key));
        }
      });
    });
  },
);

// 세션 어댑터는 우리 저장소 안의 배선만 보므로 원본 유무와 무관하게 항상 실행한다.
describe("세션 어댑터", () => {
  test("upload 모드 → guide_json.text로 판정 + inferred:true", () => {
    const r = ported.resolveSessionSubmissionSchema({
      guide_input_mode: "upload",
      guide_json: {
        mode: "upload",
        text: "질문 1: 주제를 고른 이유는 무엇인가요?",
      },
    });
    expect(r.inferred).toBe(true);
    expect(r.schema.type).toBe("question_based");
  });

  test("manual 모드 → guide_freetext로 판정", () => {
    expect(
      ported.resolveSessionSubmissionSchema({
        guide_input_mode: "manual",
        guide_freetext: "카드뉴스 4장을 제작한다.",
      }).schema.type,
    ).toBe("cardnews");
  });

  test("영속화된 submission_schema가 있으면 재판정하지 않는다 (inferred:false)", () => {
    const r = ported.resolveSessionSubmissionSchema({
      guide_input_mode: "manual",
      guide_freetext: "카드뉴스 4장을 제작한다.",
      submission_schema: {
        type: "basic_report",
        label: "기본 보고서형",
        notice: "n",
        fields: [{ key: "intro", label: "서론", helper: "" }],
      },
    });
    expect(r.inferred).toBe(false);
    expect(r.schema.type).toBe("basic_report");
    expect(r.schema.fields.length).toBe(1);
  });

  test("입력 없음 → 기본 보고서형 (throw 없음)", () => {
    expect(ported.resolveSessionSubmissionSchema({}).schema.type).toBe(
      "basic_report",
    );
    expect(ported.resolveSessionSubmissionSchema().schema.type).toBe(
      "basic_report",
    );
  });
});
