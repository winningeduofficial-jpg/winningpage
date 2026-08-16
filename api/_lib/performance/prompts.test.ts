// 수행평가 프롬프트·RAG 원문 대조 검증.
//
// `prompts.ts`와 `knowledge.ts`는 외부 앱(`/Users/hyunsoo/uwellnow/suhaengpyeong`)
// 에서 원문 그대로 옮긴 현장 튜닝의 산물이다(docs/수행평가-상세-명세.md §12.1
// 「1바이트도 변경 금지」, §12.3 「문자 단위 원문 이식」). 문제는 이 규정을
// 어겨도 아무 에러가 나지 않는다는 점이다 — 조사 하나, 문장부호 하나가
// 바뀌어도 코드는 그대로 돌고, 모델 출력 품질만 조용히 달라진다. 그래서
// 원본 파일과 직접 대조한다.
//
// 무엇을 대조하는가
//   [1] CORE_PRINCIPLES / CROSS_SUBJECT_CONNECTION_GUIDE — Buffer.equals 완전 일치
//   [2] 주제 추천 system 프롬프트 — §8.4 Q69 예외의 경계를 고정한다. 원문 유지
//       줄은 전부 있어야 하고(byte-equal), 스키마로 대체한 줄은 하나도 없어야
//       하며, 문구를 교체한 2줄은 옛 문장이 사라지고 새 문장이 있어야 한다.
//   [3] 주제 추천 user 메시지 — 작업 지시 8조 원문 + 금지 리터럴 '일반고' 부재
//   [4] RAG 직렬화 문자열 — rowToText/질의문/과거 수행 포맷의 템플릿 원문
//   [5] 설계 리포트 system/user — 16원칙·형식 분기 원문 + CORE_PRINCIPLES 주입 A/B
//   [6] 평가 system/user — 출력 규칙·8항목 채점 축 원문 + Q68 연결 블록의 무손상
//       증명(연결 블록을 끼워 넣고도 원문 두 덩어리가 각각 통짜로 남았는지)
//
// 외부 앱은 이 저장소에 없는 로컬 경로다. CI에서는 조용히 skip하고, 원본이
// 있는 로컬에서만 실제 대조가 돈다. 경로는 `SUHAENGPYEONG_DIR`로 덮어쓸 수
// 있다. 파일 전체가 6개 외부 소스를 골고루 참조하므로(섹션별 분리가 무의미)
// 원본이 하나라도 없으면 파일 전체를 skip한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

import * as ported from "./prompts.js";
// 글자 수 계산의 정본. 한때 prompts.ts에도 동명 함수가 있었지만 시그니처·
// 계산식이 달라 오호출 시 게이트가 조용히 무력화됐다 — 사본을 지우고 여기서
// 정본을 직접 쓴다(검토 P11, prompts.ts의 「글자 수 계산 함수는 이 파일에
// 두지 않는다」 주석).
import * as chars from "./submission-chars.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, "../../..");
const SOURCE_DIR =
  process.env.SUHAENGPYEONG_DIR || "/Users/hyunsoo/uwellnow/suhaengpyeong";

const SOURCE_FILES = {
  config: path.join(SOURCE_DIR, "api/_lib/config.js"),
  recommendTopics: path.join(SOURCE_DIR, "api/recommend-topics.js"),
  dynamicKnowledge: path.join(SOURCE_DIR, "api/_lib/dynamic-knowledge.js"),
  reports: path.join(SOURCE_DIR, "api/_lib/reports.js"),
  findResources: path.join(SOURCE_DIR, "api/find-resources.js"),
  evaluateText: path.join(SOURCE_DIR, "api/evaluate-text.js"),
};

const sourceExists = Object.values(SOURCE_FILES).every((file) =>
  fs.existsSync(file),
);

const read = (file: string) => fs.readFileSync(file, "utf8");
const lines = (file: string) => read(file).split("\n");

/** 1-based 행번호 → 그 줄. 원본이 밀리면 대조 자체가 틀어지므로 행번호로 읽는다. */
function sourceLine(file: string, no: number): string {
  return lines(file)[no - 1] ?? "";
}

function sourceLineRange(file: string, from: number, to: number): string[] {
  return lines(file).slice(from - 1, to);
}

// 외부는 단일따옴표·trailing comma 없음이지만 이 저장소는 biome 관례상
// 문자열 리터럴을 이중따옴표로, 여러 줄 배열/객체는 trailing comma를 붙여
// 포맷한다(quoteStyle: "double", trailingCommas: "all") — 코드 조각을 원문
// 그대로 대조할 때는 이 두 가지 포맷 차이가 아니라 내용이 같은지가
// 계약이므로, 비교 직전에만 정규화한다.
function normalizeCodeForCompare(code: string): string {
  return code.replace(/'/g, '"').replace(/,(\s*[\])])/g, "$1");
}

function containsCodeSnippet(haystack: string, codeSnippet: string): boolean {
  return normalizeCodeForCompare(haystack).includes(
    normalizeCodeForCompare(codeSnippet),
  );
}

/** `export const NAME = \`…\`.trim();` 의 백틱 안쪽 원문. */
function extractTemplate(file: string, name: string): string {
  const text = read(file);
  const startMarker = `export const ${name} = \``;
  const start = text.indexOf(startMarker);

  if (start < 0)
    throw new Error(`${name} 을(를) ${file} 에서 찾지 못했습니다.`);

  const bodyStart = start + startMarker.length;
  const end = text.indexOf("`.trim();", bodyStart);

  if (end < 0) throw new Error(`${name} 의 닫는 백틱을 찾지 못했습니다.`);

  return text.slice(bodyStart, end).trim();
}

describe.skipIf(!sourceExists)(
  "프롬프트·RAG 원문 대조 (SUHAENGPYEONG_DIR 필요)",
  () => {
    const FR = SOURCE_FILES.findResources;
    const ET = SOURCE_FILES.evaluateText;

    // describe 콜백 몸체는 skipIf 여부와 무관하게 항상 실행되므로(테스트만
    // 골라 skip된다), 원본 파일 읽기는 beforeAll 안에서만 해야 한다 — skip된
    // 스위트는 beforeAll도 실행하지 않는다. ported.* 호출은 fs를 건드리지
    // 않으므로 아래 각 섹션에서 직접 호출해도 안전하다.
    let knowledgeSource = "";
    let SYSTEM = "";
    let USER = "";
    let guideStructureTypes: (string | undefined)[] = [];
    let DESIGN_V2 = "";
    let DESIGN_V1 = "";
    let designV2Lines: string[] = [];
    let DESIGN_QUESTION = "";
    let DESIGN_USER = "";
    let DESIGN_USER_EMPTY = "";
    let EVAL_SYSTEM = "";
    let evalSystemLines: string[] = [];
    let EVAL_USER = "";
    let EVAL_USER_EMPTY = "";

    const designArgs = {
      structureType: "기본 보고서형",
      structureReason: "<<REASON>>",
      writingFrame: "<<FRAME>>",
      resourceKnowledgeText: "<<RESOURCE_RAG>>",
      allowedResources: [{ id: "R1", title: "자료 하나" }],
      studentHistoryText: "<<HISTORY>>",
    };

    beforeAll(() => {
      knowledgeSource = read(
        path.join(REPO_ROOT, "api/_lib/performance/knowledge.ts"),
      );

      SYSTEM = ported.buildTopicRecommendationSystem({
        topicKnowledgeText: "<<KNOWLEDGE>>",
        studentHistoryText: "<<HISTORY>>",
      });
      USER = ported.buildTopicRecommendationUser({
        gradeLabel: "고1",
        semester: "1학기",
        schoolType: "자율형 사립고",
        subjectGroup: "국어",
        subject: "공통국어1",
        career: "의학",
        previousTopic: "",
        assessmentText: "<<GUIDE>>",
      });

      // 분기 매핑 키는 inferAssessmentStructure(:241-299)의 type 리터럴 그대로
      guideStructureTypes = [248, 256, 264, 272, 280, 288, 295].map(
        (no) => sourceLine(FR, no).match(/type: '(.+)'/)?.[1],
      );

      DESIGN_V2 = ported.buildDesignReportSystem({
        ...designArgs,
        promptVersion: ported.DESIGN_PROMPT_VERSIONS.WITH_CORE,
      });
      DESIGN_V1 = ported.buildDesignReportSystem({
        ...designArgs,
        promptVersion: ported.DESIGN_PROMPT_VERSIONS.WITHOUT_CORE,
      });
      designV2Lines = DESIGN_V2.split("\n");
      DESIGN_QUESTION = ported.buildDesignReportSystem({
        ...designArgs,
        structureType: "문항별 답변형",
      });

      DESIGN_USER = ported.buildDesignReportUser({
        selectedTopic: "<<TOPIC>>",
        selectedTopicDetail: "<<DETAIL>>",
        gradeLabel: "고2",
        semester: "1학기",
        schoolType: "자율형 사립고",
        subjectGroup: "과학",
        subject: "고급 생명과학",
        career: "의학",
        assessmentText: "<<GUIDE>>",
      });
      DESIGN_USER_EMPTY = ported.buildDesignReportUser({});

      EVAL_SYSTEM = ported.buildEvaluationSystem({
        structureType: "문항별 답변형",
        structureReason: "<<REASON>>",
        writingFrame: "<<FRAME>>",
      });
      evalSystemLines = EVAL_SYSTEM.split("\n");

      EVAL_USER = ported.buildEvaluationUser({
        assessmentText: "<<GUIDE>>",
        selectedTopic: "<<TOPIC>>",
        career: "의학",
        gradeLabel: "고1",
        semester: "1학기",
        schoolType: "자율형 사립고",
        subjectGroup: "국어",
        subject: "공통국어1",
        previousTopic: "<<PREV>>",
        submissionText: "<<SUBMISSION>>",
      });
      EVAL_USER_EMPTY = ported.buildEvaluationUser({});
    });

    // ---------------------------------------------------------------------
    // [1] 프롬프트 상수 — 바이트 완전 일치
    // ---------------------------------------------------------------------
    describe("[1] 프롬프트 상수 바이트 대조", () => {
      test.each(["CORE_PRINCIPLES", "CROSS_SUBJECT_CONNECTION_GUIDE"] as const)(
        "%s byte-equal",
        (name) => {
          const original = Buffer.from(
            extractTemplate(SOURCE_FILES.config, name),
            "utf8",
          );
          const mine = Buffer.from(ported[name], "utf8");

          expect(
            original.equals(mine),
            `원본 ${original.length}B / 이식본 ${mine.length}B`,
          ).toBe(true);
        },
      );
    });

    // ---------------------------------------------------------------------
    // [2] 주제 추천 system 프롬프트 — 예외의 경계
    // ---------------------------------------------------------------------
    describe("[2] 주제 추천 system 프롬프트 (§8.4 Q69 예외 경계)", () => {
      // ⓐ 원문 그대로 유지해야 하는 행 (recommend-topics.js 1-based 행번호)
      const RETAINED_SYSTEM_LINES = [
        115,
        116,
        117, // 역할 3줄
        119,
        122,
        125, // RAG 소스 주입 블록 헤더 3개
        128,
        129,
        130,
        131, // 다른 과목 활용 규칙 헤더 + 1~3조
        135,
        136,
        137,
        138,
        139,
        140,
        141,
        142,
        143, // 2022 개정 교육과정 8조 + 헤더
        145, // `출력 규칙:` 헤더
      ];

      test.each(RETAINED_SYSTEM_LINES)("원문 유지 :%i", (no) => {
        const line = sourceLine(SOURCE_FILES.recommendTopics, no);
        expect(
          SYSTEM.split("\n").includes(line),
          `누락된 원문 줄: ${JSON.stringify(line)}`,
        ).toBe(true);
      });

      // 출력 규칙 의미 규칙 5개 — 번호만 1~5로 재부여(§12.1)했으므로 번호를 뗀
      // 본문으로 대조한다.
      const SEMANTIC_OUTPUT_RULES = [146, 147, 148, 149, 151];
      const stripNumber = (line: string) => line.replace(/^\d+\.\s*/, "");

      test.each(SEMANTIC_OUTPUT_RULES)("출력 규칙 의미 규칙 :%i", (no) => {
        const original = sourceLine(SOURCE_FILES.recommendTopics, no);
        const body = stripNumber(original);
        const systemLinesNoNumber = SYSTEM.split("\n").map(stripNumber);

        expect(
          systemLinesNoNumber.includes(body),
          `누락: ${JSON.stringify(body)}`,
        ).toBe(true);
      });

      test("출력 규칙 번호가 1~5로 연속 재부여됐다", () => {
        expect(
          /출력 규칙:\n1\. .+\n2\. .+\n3\. .+\n4\. .+\n5\. .+$/.test(SYSTEM),
        ).toBe(true);
      });

      test("마크다운 금지 조항이 살아 있다 (§8.4·§12.1 명시 예외 — 폐기 금지)", () => {
        expect(
          SYSTEM.includes(
            stripNumber(sourceLine(SOURCE_FILES.recommendTopics, 146)),
          ),
        ).toBe(true);
      });

      // ⓑ JSON 계약 전환으로 문구를 교체한 2줄
      const REPLACED = [
        {
          no: 132,
          to: "4. 사용한 경우 cross_subject 필드에 어떤 과목의 어떤 흐름을 현재 과목 방식으로 바꾸었는지 설명한다.",
        },
        {
          no: 133,
          to: "5. 연계하지 않는 경우 cross_subject 필드에 정확히 '연계하지 않음'만 적는다.",
        },
      ];

      test.each(REPLACED)("문구 교체 :$no", ({ no, to }) => {
        const original = sourceLine(SOURCE_FILES.recommendTopics, no);
        expect(SYSTEM.includes(original)).toBe(false);
        expect(SYSTEM.split("\n").includes(to)).toBe(true);
      });

      // ⓒ responseSchema로 대체해 삭제한 것
      const REMOVED_SYSTEM_LINES = [
        150, // 종료 마커
        152, // 3블록 필수 마커
        153, // `추천 n:` 헤더 형식 강제
        155, // `반드시 아래 형식으로 3개 추천:`
      ];

      test.each(REMOVED_SYSTEM_LINES)(
        "스키마 대체 :%i — 프롬프트에서 제거됨",
        (no) => {
          const line = sourceLine(SOURCE_FILES.recommendTopics, no);
          expect(
            SYSTEM.includes(line.trim()),
            `남아 있는 포맷 강제 줄: ${JSON.stringify(line)}`,
          ).toBe(false);
        },
      );

      test("출력 뼈대(:157-182)가 전부 제거됐다", () => {
        // 번호 뼈대 3벌의 항목 줄이 하나도 남지 않아야 한다
        const SKELETON_LINES = [
          ...new Set(sourceLineRange(SOURCE_FILES.recommendTopics, 157, 182)),
        ]
          .map((line) => line.trim())
          .filter(Boolean);

        const remaining = SKELETON_LINES.filter((line) =>
          SYSTEM.includes(line),
        );
        expect(remaining, remaining.join(" / ")).toEqual([]);
      });

      test("스키마가 뼈대를 대신한다 (3건 고정 + 필드 7개 required)", () => {
        expect(
          ported.TOPIC_RECOMMENDATION_SCHEMA.properties.topics.minItems,
        ).toBe(3);
        expect(
          ported.TOPIC_RECOMMENDATION_SCHEMA.properties.topics.maxItems,
        ).toBe(3);
        expect(
          ported.TOPIC_RECOMMENDATION_SCHEMA.properties.topics.items.required
            .length,
        ).toBe(7);
      });

      test("스키마 필드 순서 = 시안 3754:4872 섹션 순서(§5.11)", () => {
        expect(
          ported.TOPIC_RECOMMENDATION_SCHEMA.properties.topics.items
            .propertyOrdering,
        ).toEqual(["title", ...ported.TOPIC_DETAIL_SECTIONS.map((s) => s.id)]);
      });
    });

    // ---------------------------------------------------------------------
    // [3] 주제 추천 user 메시지
    // ---------------------------------------------------------------------
    describe("[3] 주제 추천 user 메시지", () => {
      // 작업 지시 8조 + 블록 라벨 — 원문 그대로
      test.each([186, 193, 196, 197, 198, 199, 200, 201, 202, 203, 204])(
        "원문 유지 :%i",
        (no) => {
          const line = sourceLine(SOURCE_FILES.recommendTopics, no);
          expect(
            USER.split("\n").includes(line),
            `누락: ${JSON.stringify(line)}`,
          ).toBe(true);
        },
      );

      // 보간 줄은 라벨 접두어까지가 원문 계약이다
      test.each([187, 189, 190, 191])("필드 라벨 원문 :%i", (no) => {
        const prefix =
          sourceLine(SOURCE_FILES.recommendTopics, no).split("${")[0] ?? "";
        expect(
          USER.split("\n").some((line) => line.startsWith(prefix)),
          `누락 접두어: ${JSON.stringify(prefix)}`,
        ).toBe(true);
      });

      test("학교 유형 하드코딩 '일반고'가 이식되지 않았다 (:188, §8.3 결정 ②)", () => {
        expect(USER.includes("일반고")).toBe(false);
        expect(ported.buildTopicRecommendationUser({}).includes("일반고")).toBe(
          false,
        );
      });

      test("값이 없으면 '미입력'을 렌더한다 (평가 프롬프트와 통일)", () => {
        expect(
          ported
            .buildTopicRecommendationUser({})
            .includes("- 학교 유형: 미입력"),
        ).toBe(true);
      });

      test("previousTopic 기본 리터럴 '없음'이 유지된다 (지시 2조가 의존)", () => {
        expect(
          ported
            .buildTopicRecommendationUser({})
            .includes(
              `- 같은 과목에서 이전에 한 주제: ${ported.NO_PREVIOUS_TOPIC_TEXT}`,
            ),
        ).toBe(true);
        expect(ported.NO_PREVIOUS_TOPIC_TEXT).toBe("없음");
      });
    });

    // ---------------------------------------------------------------------
    // [4] RAG 직렬화 — 문자 단위 원문 (§12.3)
    // ---------------------------------------------------------------------
    describe("[4] RAG 질의문·직렬화 원문", () => {
      // 위닝DB 경로: 질의문 6줄(:227-234) + rowToText 본문(:154-164) + 라벨 2종(:255-257)
      const KNOWLEDGE_SNIPPETS = [
        { label: "벡터 질의문 6줄 + 안내문 2500자 절단", from: 228, to: 233 },
        { label: "rowToText 템플릿", from: 155, to: 163 },
        { label: "유사도 줄 포맷", from: 151, to: 151 },
        { label: "레거시 과목 후보 조립", from: 282, to: 289 },
        { label: "레거시 키워드 조립", from: 291, to: 297 },
      ];

      test.each(KNOWLEDGE_SNIPPETS)(
        "$label (dynamic-knowledge.js:$from-$to)",
        ({ from, to }) => {
          const snippet = sourceLineRange(
            SOURCE_FILES.dynamicKnowledge,
            from,
            to,
          ).join("\n");
          expect(
            containsCodeSnippet(knowledgeSource, snippet),
            `원문 조각이 knowledge.ts 에 없음:\n${snippet}`,
          ).toBe(true);
        },
      );

      // 원본(:255-257)은 `const label = knowledgeType === '...' ? '...' :
      // '...';`을 한 줄 대입으로 적었지만, 이 저장소는 biome이 긴 삼항
      // 대입식을 조건/분기마다 줄바꿈한다 — 줄바꿈 위치가 아니라 조건과 두
      // 분기 문자열이 원문 그대로인지가 계약이다.
      test("검색 라벨 2종 (dynamic-knowledge.js:255-257, 줄바꿈 재배치 허용)", () => {
        const snippet = sourceLineRange(
          SOURCE_FILES.dynamicKnowledge,
          255,
          257,
        ).join("\n");
        const condition = snippet.match(
          /knowledgeType === (['"]verified_resource['"])/,
        )?.[1];
        const [, trueLabel, falseLabel] =
          snippet.match(/\?\s*(['"].+?['"])\s*:\s*(['"].+?['"]);/) ?? [];

        expect(condition).toBeTruthy();
        expect(trueLabel).toBeTruthy();
        expect(falseLabel).toBeTruthy();
        expect(
          knowledgeSource.includes('knowledgeType === "verified_resource"'),
        ).toBe(true);
        for (const label of [trueLabel, falseLabel]) {
          const inner = label?.slice(1, -1) ?? "";
          expect(knowledgeSource.includes(`"${inner}"`)).toBe(true);
        }
      });

      test("threshold 상수 = 원문 튜닝값 (topic 0.50 / resource 0.48 / 과거 수행 0.48)", () => {
        const pairs: [string, number][] = [
          ["TOPIC_MATCH_THRESHOLD", 0.5],
          ["RESOURCE_MATCH_THRESHOLD", 0.48],
          ["STUDENT_HISTORY_MATCH_THRESHOLD", 0.48],
        ];
        for (const [name, value] of pairs) {
          const re = new RegExp(`export const ${name} = ([0-9.]+);`);
          expect(Number(knowledgeSource.match(re)?.[1])).toBe(value);
        }
      });

      test("match_count = max(maxItems * 2, 10) 유지", () => {
        expect(
          knowledgeSource.includes("match_count: Math.max(maxItems * 2, 10)"),
        ).toBe(true);
      });

      test("maxChars 상한 = topic 4500 / resource 8000", () => {
        expect(/TOPIC_MAX_CHARS = 4500/.test(knowledgeSource)).toBe(true);
        expect(/RESOURCE_MAX_CHARS = 8000/.test(knowledgeSource)).toBe(true);
      });

      test("packRows break 동작 유지 (상한 초과 시 이후 조각 버림)", () => {
        expect(
          knowledgeSource.includes(
            "if (total + piece.length > maxChars) break;",
          ),
        ).toBe(true);
      });

      // 학생 과거 수행 경로: 질의문 5줄(:174-180, 2000자 절단) + 포맷(:227-234)
      const REPORT_SNIPPETS = [
        { label: "과거 수행 질의문 5줄 + 2000자 절단", from: 175, to: 179 },
        { label: "과거 수행 프롬프트 포맷 라벨", from: 228, to: 230 },
      ];

      test.each(REPORT_SNIPPETS)(
        "$label (reports.js:$from-$to)",
        ({ from, to }) => {
          const snippet = sourceLineRange(SOURCE_FILES.reports, from, to).join(
            "\n",
          );
          expect(
            containsCodeSnippet(knowledgeSource, snippet),
            `원문 조각이 knowledge.ts 에 없음:\n${snippet}`,
          ).toBe(true);
        },
      );

      test("과거 수행 없음 문구 원문 유지", () => {
        expect(ported.NO_STUDENT_HISTORY_TEXT).toBe(
          "관련 학생 과거 수행 기록 없음",
        );
        expect(ported.NO_KNOWLEDGE_TEXT).toBe("관련 위닝DB 항목 없음");
      });

      test("compactText 900자 절단 유지", () => {
        expect(
          knowledgeSource.includes("compactText(r.summary_text, 900)"),
        ).toBe(true);
      });
    });

    // ---------------------------------------------------------------------
    // [5] 설계 리포트 system 프롬프트 — 16원칙 + 6섹션 뼈대 (§12.1)
    // ---------------------------------------------------------------------
    describe("[5] 설계 리포트 system 프롬프트 (§12.1 설계 리포트 행)", () => {
      // ⓐ 원문 그대로 유지해야 하는 행 (find-resources.js 1-based 행번호)
      //    405 `- 우선 작성 틀:` 까지 포함. 보간 줄(403/404/406/409/412/417)은
      //    접두어로 따로 본다.
      const RETAINED_DESIGN_LINES = [
        378, // 역할 1줄
        380,
        381,
        382, // 목표 3줄
        384, // `중요 원칙:`
        385,
        386,
        387,
        388,
        389,
        390,
        391,
        392, // 16원칙 1~8
        393,
        394,
        395,
        396,
        397,
        398,
        399,
        400, // 16원칙 9~16 (398 = 마크다운 금지)
        402,
        405, // [안내문 구조 판정] 라벨
        408, // [홈페이지 위닝 수행 자료 DB]
        411, // [사용 허용 자료명 목록]  ← 헤더는 원문 유지
        416, // [학생 과거 수행 RAG]
        419,
        421, // `출력 방식:` + 형식 분기 지시
        424,
        425,
        426,
        427, // 최종 주제 하위 키
        430,
        431, // 추천 자료 항목 설명 2줄
        434,
        435,
        436,
        437, // 안내문 요구 형식 분석 하위 키
        440,
        441,
        442,
        443, // 수행평가 전체 방향 하위 키
        486,
        487,
        488,
        489,
        490, // 체크리스트 하위 키
      ];

      // 존재만이 아니라 배치도 계약이다 — §12.1의 「1바이트도 변경 금지」는
      // 내용과 순서를 함께 뜻하고, 프롬프트 조항의 순서 자체가 의미를 갖는다
      // (이 이식이 CORE→BRIDGE→본문 순서로 충돌을 해소한 것이 그 증거다).
      // 집합 포함 검사만 하면 16원칙을 뒤섞거나 [안내문 구조 판정] 블록을
      // [학생 과거 수행 RAG] 뒤로 옮겨도 전부 통과한다. 그래서 원문 행번호가
      // 커질수록 산출물에서의 위치도 커지는지(단조 증가) 함께 본다.
      let lastDesignLineIndex = -1;

      test.each(RETAINED_DESIGN_LINES)("원문 유지 + 순서 :%i", (no) => {
        const line = sourceLine(FR, no);
        // fromIndex가 필수다 — 없으면 원문에 같은 문자열이 두 번 나올 때 항상
        // 첫 등장만 보게 되어 이동을 놓치거나 거짓 실패한다(검토 P11).
        const index = designV2Lines.indexOf(line, lastDesignLineIndex + 1);

        expect(
          designV2Lines.includes(line),
          `누락된 원문 줄: ${JSON.stringify(line)}`,
        ).toBe(true);
        expect(
          index,
          `배치가 원문 순서와 어긋난다: :${no}이 산출물 ${index}행에 있는데 직전 원문 줄은 ${lastDesignLineIndex}행이다`,
        ).toBeGreaterThan(lastDesignLineIndex);

        if (index > lastDesignLineIndex) lastDesignLineIndex = index;
      });

      // 보간 줄은 라벨 접두어까지가 원문 계약이다
      test.each([403, 404])("필드 라벨 원문 :%i", (no) => {
        const prefix = sourceLine(FR, no).split("${")[0] ?? "";
        expect(
          designV2Lines.some((line) => line.startsWith(prefix)),
          `누락 접두어: ${JSON.stringify(prefix)}`,
        ).toBe(true);
      });

      test("마크다운 금지 조항(16원칙 14)이 살아 있다 (§12.1 명시 — 폐기 금지)", () => {
        expect(DESIGN_V2.includes(sourceLine(FR, 398))).toBe(true);
      });

      test("빈 값 문구 원문 유지 (:409 / :357)", () => {
        expect(ported.NO_RESOURCE_KNOWLEDGE_TEXT).toBe(
          "사용 가능한 내부 자료 없음",
        );
        expect(ported.NO_ALLOWED_RESOURCE_TEXT).toBe("없음");
        expect(ported.buildAllowedResourceList([])).toBe("없음");
      });

      // ⓑ-1 `[사용 허용 자료명 목록]`의 값이 자료명 나열이 아니라 id 목록이다(Q63)
      test("ⓑ-1 사용 허용 자료 목록이 `id | 자료명` 형태다 (Q63)", () => {
        expect(
          ported.buildAllowedResourceList([{ id: "R1", title: "자료 하나" }]),
        ).toBe("- R1 | 자료 하나");
        expect(DESIGN_V2.includes("- R1 | 자료 하나")).toBe(true);
      });

      // ⓑ-2 `:414` 주의 문장 — 옛 문장 부재 / 새 문장 존재
      const CAUTION_414_NEW =
        "주의: chosen_resources 필드에는 위 [사용 허용 자료명 목록]에 있는 자료 id만 쓸 수 있다. 목록이 '없음'이면 id를 만들지 말고 chosen_resources를 빈 배열로 두며, 학생용 표현으로 자료 확인이 필요하다고만 정리하라. 학생에게 보이는 출력에는 DB, 내부 자료, RAG, 검증 자료 부족이라는 표현을 쓰지 마라.";

      test("ⓑ-2 문구 교체 :414 — 옛 문장 부재 / 새 문장 존재", () => {
        expect(DESIGN_V2.includes(sourceLine(FR, 414))).toBe(false);
        expect(designV2Lines.includes(CAUTION_414_NEW)).toBe(true);
      });
      test("ⓑ-2 뒷문장(시스템 내부 표현 금지)은 원문 그대로 남았다", () => {
        const tail =
          "학생에게 보이는 출력에는 DB, 내부 자료, RAG, 검증 자료 부족이라는 표현을 쓰지 마라.";
        expect(CAUTION_414_NEW.endsWith(tail)).toBe(true);
        expect(sourceLine(FR, 414).endsWith(tail)).toBe(true);
      });

      // ⓒ 스키마로 대체해 삭제한 것
      test("스키마 대체 :420 — 번호 뼈대 참조 줄이 제거됐다", () => {
        expect(DESIGN_V2.includes(sourceLine(FR, 420).trim())).toBe(false);
      });
      test("스키마 대체 :446 — 분기 선택 지시가 제거됐다 (분기 1개만 주입)", () => {
        expect(DESIGN_V2.includes(sourceLine(FR, 446).trim())).toBe(false);
      });

      // 섹션 제목 6줄: 번호 접두어만 빠지고 문자열은 그대로여야 한다
      const SECTION_TITLE_LINES = [423, 429, 433, 439, 445, 485];

      test.each(SECTION_TITLE_LINES.map((no, index) => ({ no, index })))(
        "섹션 제목 :$no — 번호 제거 + 문자열 유지",
        ({ no, index }) => {
          const original = sourceLine(FR, no);
          const title = original.replace(/^\d+\.\s*/, "");

          expect(
            designV2Lines.includes(title) && !DESIGN_V2.includes(original),
            `원본 ${JSON.stringify(original)} / 기대 ${JSON.stringify(title)}`,
          ).toBe(true);
          expect(ported.DESIGN_REPORT_SECTIONS[index]?.label).toBe(title);
        },
      );

      // 형식별 3분기 — 원문 바이트 일치 + 판정 결과 분기만 주입(§12.1)
      const BRANCH_RANGES = [
        { key: "question", from: 448, to: 461 },
        { key: "report", from: 463, to: 479 },
        { key: "other", from: 481, to: 483 },
      ] as const;

      test.each(BRANCH_RANGES)(
        "작성 구조 분기 $key byte-equal (:$from-$to)",
        ({ key, from, to }) => {
          const original = Buffer.from(
            sourceLineRange(FR, from, to).join("\n").trim(),
            "utf8",
          );
          const mine = Buffer.from(ported.DESIGN_WRITING_BRANCHES[key], "utf8");

          expect(
            original.equals(mine),
            `원본 ${original.length}B / 이식본 ${mine.length}B`,
          ).toBe(true);
        },
      );

      test("보고서형 판정 → report 분기만 주입된다", () => {
        expect(DESIGN_V2.includes(ported.DESIGN_WRITING_BRANCHES.report)).toBe(
          true,
        );
        expect(
          DESIGN_V2.includes(ported.DESIGN_WRITING_BRANCHES.question),
        ).toBe(false);
        expect(DESIGN_V2.includes(ported.DESIGN_WRITING_BRANCHES.other)).toBe(
          false,
        );
      });

      test("문항별 답변형 판정 → question 분기만 주입된다", () => {
        expect(
          DESIGN_QUESTION.includes(ported.DESIGN_WRITING_BRANCHES.question),
        ).toBe(true);
        expect(
          DESIGN_QUESTION.includes(ported.DESIGN_WRITING_BRANCHES.report),
        ).toBe(false);
      });

      // 분기 매핑 키는 inferAssessmentStructure(:241-299)의 type 리터럴 그대로
      test.each([248, 256, 264, 272, 280, 288, 295])(
        "구조 판정 유형 원문 :%i",
        (no) => {
          const type = sourceLine(FR, no).match(/type: '(.+)'/)?.[1];
          expect(Boolean(type)).toBe(true);
          expect(
            type
              ? Object.hasOwn(
                  ported.DESIGN_WRITING_BRANCH_BY_STRUCTURE_TYPE,
                  type,
                )
              : false,
          ).toBe(true);
        },
      );
    });

    // ---------------------------------------------------------------------
    // [6] CORE_PRINCIPLES 주입 A/B (§11 Q83, 명세 L1620)
    // ---------------------------------------------------------------------
    describe("[6] 설계 리포트 A/B 배선 (design-v1 / design-v2)", () => {
      test("v2 = CORE_PRINCIPLES + 연결 문장 + v1 (단일 변수 비교)", () => {
        expect(DESIGN_V2.endsWith(DESIGN_V1)).toBe(true);
        expect(DESIGN_V2.startsWith(ported.CORE_PRINCIPLES)).toBe(true);
        expect(DESIGN_V2.includes(ported.CORE_PRINCIPLES_DESIGN_BRIDGE)).toBe(
          true,
        );
      });

      test("v1은 CORE_PRINCIPLES 미주입 = 외부 동작 재현 (외부 원문에도 없다)", () => {
        expect(DESIGN_V1.includes("[AI 수행평가 코치 핵심 원칙]")).toBe(false);
        expect(DESIGN_V1.includes(ported.CORE_PRINCIPLES_DESIGN_BRIDGE)).toBe(
          false,
        );
        expect(read(FR).includes("CORE_PRINCIPLES")).toBe(false);
      });

      test("연결 문장이 충돌 3건 + 우선순위를 모두 다룬다", () => {
        for (const fragment of [
          "다시 선정하거나 바꾸지 않는다",
          "그대로 쓰지 않는다",
          "중요 원칙 8~13",
          "아래 중요 원칙을 따른다",
        ]) {
          expect(ported.CORE_PRINCIPLES_DESIGN_BRIDGE.includes(fragment)).toBe(
            true,
          );
        }
      });

      test("기본값이 design-v2(주입) 고정이다", () => {
        expect(ported.DESIGN_PROMPT_VERSION_DEFAULT).toBe("design-v2");
        expect(
          ported
            .buildDesignReportSystem(designArgs)
            .startsWith(ported.CORE_PRINCIPLES),
        ).toBe(true);
      });

      test("버전 스위치는 서버 환경변수 한 곳뿐이고, 알 수 없는 값은 v2로 떨어진다", () => {
        expect(ported.resolveDesignPromptVersion({})).toBe("design-v2");
        expect(
          ported.resolveDesignPromptVersion({
            PERFORMANCE_DESIGN_PROMPT_VERSION: "",
          }),
        ).toBe("design-v2");
        expect(
          ported.resolveDesignPromptVersion({
            PERFORMANCE_DESIGN_PROMPT_VERSION: "design-v3",
          }),
        ).toBe("design-v2");
        expect(
          ported.resolveDesignPromptVersion({
            PERFORMANCE_DESIGN_PROMPT_VERSION: "DESIGN-V1",
          }),
        ).toBe("design-v2");
        expect(
          ported.resolveDesignPromptVersion({
            PERFORMANCE_DESIGN_PROMPT_VERSION: " design-v1 ",
          }),
        ).toBe("design-v1");
      });

      test("알 수 없는 promptVersion도 주입본으로 떨어진다 (스위치 오설정이 v1을 켜지 않는다)", () => {
        expect(
          ported
            .buildDesignReportSystem({
              ...designArgs,
              promptVersion: "design-v9",
            })
            .startsWith(ported.CORE_PRINCIPLES),
        ).toBe(true);
      });

      test("resolveDesignPromptVersion은 요청 객체를 받지 않는다 (클라이언트 지정 불가)", () => {
        expect(ported.resolveDesignPromptVersion.length).toBeLessThanOrEqual(1);
      });
    });

    // ---------------------------------------------------------------------
    // [7] 설계 리포트 user 메시지
    // ---------------------------------------------------------------------
    describe("[7] 설계 리포트 user 메시지", () => {
      // 블록 라벨 + 작업 지시 4줄 — 원문 그대로
      test.each([494, 497, 500, 507, 510, 511, 512, 513, 514])(
        "원문 유지 :%i",
        (no) => {
          const line = sourceLine(FR, no);
          expect(
            DESIGN_USER.split("\n").includes(line),
            `누락: ${JSON.stringify(line)}`,
          ).toBe(true);
        },
      );

      test.each([501, 502, 503, 504, 505])("필드 라벨 원문 :%i", (no) => {
        const prefix = sourceLine(FR, no).split("${")[0] ?? "";
        expect(
          DESIGN_USER.split("\n").some((line) => line.startsWith(prefix)),
          `누락 접두어: ${JSON.stringify(prefix)}`,
        ).toBe(true);
      });

      test("하드코딩 폴백 3종('고등학생'/'일반고'/'국어')이 이식되지 않았다 (:339-341)", () => {
        for (const literal of ["고등학생", "일반고", "국어"]) {
          expect(DESIGN_USER_EMPTY.includes(literal), DESIGN_USER_EMPTY).toBe(
            false,
          );
        }
      });

      test("값이 없으면 '미입력'을 렌더한다", () => {
        expect(DESIGN_USER_EMPTY.includes("- 학교 유형: 미입력")).toBe(true);
        expect(DESIGN_USER_EMPTY.includes("- 학년/학기: 미입력")).toBe(true);
        expect(DESIGN_USER_EMPTY.includes("- 선택 과목: 미입력")).toBe(true);
      });

      test("원문 리터럴 '없음'/'안내문 정보 없음'이 유지된다 (:498, :505, :508)", () => {
        expect(DESIGN_USER_EMPTY.includes("- 이전 주제: 없음")).toBe(true);
        expect(DESIGN_USER_EMPTY.includes("[선택 주제 상세]\n없음")).toBe(true);
        expect(
          DESIGN_USER_EMPTY.includes(
            "[수행평가 안내문 요약]\n안내문 정보 없음",
          ),
        ).toBe(true);
      });
    });

    // ---------------------------------------------------------------------
    // [8] 설계 리포트 responseSchema · 섹션 상수 (§8.4 완화책 ⓐ / §8.5 / §5.13)
    // ---------------------------------------------------------------------
    describe("[8] 설계 리포트 responseSchema · 섹션 상수", () => {
      test("number 타입 필드가 하나도 없다 (§8.4 완화책 ⓐ)", () => {
        const json = JSON.stringify(ported.DESIGN_REPORT_SCHEMA);
        expect(json.includes('"number"')).toBe(false);
        expect(json.includes('"integer"')).toBe(false);
      });

      test("섹션 순서·라벨 = 시안 3754:4722 실측 (§5.13)", () => {
        expect(
          ported.DESIGN_REPORT_SECTIONS.map((section) => section.label),
        ).toEqual([
          "최종 주제",
          "추천 자료 및 활용 포인트",
          "안내문 요구 형식 분석",
          "수행평가 전체 방향",
          "작성 구조 설계",
          "학생 작성 체크리스트",
        ]);
      });

      test("추천 자료 섹션만 서버 조립이고 모델 스키마에 없다 (:430 원문 선언)", () => {
        const serverSections = ported.DESIGN_REPORT_SECTIONS.filter(
          (section) => section.authoredBy === "server",
        ).map((section) => section.id);
        expect(serverSections.join()).toBe("recommended_resources");
        expect(
          Object.hasOwn(
            ported.DESIGN_REPORT_SCHEMA.properties,
            "recommended_resources",
          ),
        ).toBe(false);
      });

      test("모델 작성 섹션 5종이 스키마 required와 1:1이다", () => {
        expect(
          ported.DESIGN_REPORT_SECTIONS.filter(
            (section) => section.authoredBy === "model",
          ).map((section) => section.id),
        ).toEqual(
          ported.DESIGN_REPORT_SCHEMA.required.filter(
            (key) => key !== "chosen_resources",
          ),
        );
      });

      test("체크리스트 5건 고정 (:486-490) / chosen_resources 최대 3건 (§8.4)", () => {
        expect(ported.DESIGN_REPORT_SCHEMA.properties.checklist.minItems).toBe(
          5,
        );
        expect(ported.DESIGN_REPORT_SCHEMA.properties.checklist.maxItems).toBe(
          5,
        );
        expect(
          ported.DESIGN_REPORT_SCHEMA.properties.chosen_resources.maxItems,
        ).toBe(3);
      });

      // 섹션 행 라벨 = 원문 하위 키 줄(`- 라벨:`)에서 뽑은 문자열
      const ROW_LABEL_RANGES = [
        { id: "final_topic", from: 424, to: 427 },
        { id: "required_format", from: 434, to: 437 },
        { id: "overall_direction", from: 440, to: 443 },
      ] as const;

      test.each(ROW_LABEL_RANGES)(
        "행 라벨 원문 $id (:$from-$to)",
        ({ id, from, to }) => {
          const original = sourceLineRange(FR, from, to).map((line) =>
            line.replace(/^-\s*/, "").replace(/:$/, ""),
          );
          expect(
            ported.DESIGN_SECTION_ROW_LABELS[id].map((row) => row.label),
            `원본 ${JSON.stringify(original)}`,
          ).toEqual(original);
        },
      );

      test("자료 카드 필드 6종 라벨 = 시안 §5.13 / 원문 :166-171", () => {
        expect(
          ported.DESIGN_RESOURCE_CARD_FIELDS.map((field) => field.label),
        ).toEqual([
          "자료명",
          "출처 정보",
          "출처 링크",
          "핵심 개념",
          "활용 포인트",
          "작성 시 주의",
        ]);
      });

      test("자료 0건 폴백 3줄 원문 유지 (:155-157)", () => {
        const emptyResourceSource = sourceLineRange(FR, 155, 157).join("\n");
        for (const row of ported.DESIGN_EMPTY_RESOURCE_ROWS) {
          expect(
            emptyResourceSource.includes(`- ${row.label}: ${row.content}`),
            emptyResourceSource,
          ).toBe(true);
        }
      });

      test("자료 카드 필드 기본 문구 원문 유지 (:167-171)", () => {
        const resourceFallbackSource = sourceLineRange(FR, 167, 171).join("\n");
        for (const value of Object.values(
          ported.DESIGN_RESOURCE_FIELD_FALLBACKS,
        )) {
          expect(resourceFallbackSource.includes(value)).toBe(true);
        }
      });

      // 마무리(결론) 기본 문구 4줄 — 문구는 원문, 번호 접두어 `7.`은 제거(§12.1)
      test("마무리 기본 문구 4줄 원문 유지 (:25-28) + 번호 접두어 제거", () => {
        const conclusionSource = sourceLineRange(FR, 25, 28).join("\n");
        for (const row of ported.DESIGN_CONCLUSION_DEFAULT_ROWS) {
          expect(
            conclusionSource.includes(`- ${row.label}: ${row.content}`),
            conclusionSource,
          ).toBe(true);
        }
        const json = JSON.stringify(ported.DESIGN_CONCLUSION_DEFAULT_ROWS);
        expect(json.includes("7.")).toBe(false);
        expect(json.includes("마무리 구성 방향")).toBe(false);
      });

      test("생성 파라미터 temperature는 원문 0.25 그대로 (:519)", () => {
        expect(ported.DESIGN_GENERATION_DEFAULTS.temperature).toBe(0.25);
        expect(sourceLine(FR, 519).includes("temperature: 0.25")).toBe(true);
      });

      test("maxOutputTokens는 원문 5200에서 상향됐다 (§12.3 실측 재조정 + JSON 오버헤드)", () => {
        expect(sourceLine(FR, 518).includes("maxOutputTokens: 5200")).toBe(
          true,
        );
        expect(
          ported.DESIGN_GENERATION_DEFAULTS.maxOutputTokens,
        ).toBeGreaterThan(5200);
        expect(ported.DESIGN_MAX_OUTPUT_TOKENS_RETRY).toBeGreaterThan(
          ported.DESIGN_GENERATION_DEFAULTS.maxOutputTokens,
        );
      });
    });

    // ---------------------------------------------------------------------
    // [9] 평가 system 프롬프트 (§12.1 「평가 system 프롬프트」 행 + Q68)
    // ---------------------------------------------------------------------
    describe("[9] 평가 system 프롬프트 (§8.4 Q69 예외 경계 + Q68 연결 블록)", () => {
      test("구조 판정 7유형을 원본에서 전부 읽어냈다 (Q68 판정 값의 출처)", () => {
        expect(guideStructureTypes.length).toBe(7);
        expect(guideStructureTypes.every(Boolean)).toBe(true);
      });

      // ⓐ 원문 그대로 유지해야 하는 행 (evaluate-text.js 1-based 행번호)
      const RETAINED_EVAL_LINES = [
        65,
        66,
        67, // 역할 3줄
        69, // `출력 규칙:` 헤더
        83, // `평가 형식:` 헤더
        86,
        87,
        88, // 1번 3분할 하위 키
        91,
        92,
        93, // 2번
        96,
        97,
        98, // 3번
        101,
        102,
        103, // 4번
        106,
        107,
        108, // 5번
        111, // 6번 표절 하위 키
        114,
        115,
        116,
        117, // 7번 누적 기록용 요약 4키
        121, // 8번 `- 총평:`
      ];

      // 존재만이 아니라 배치도 계약이다(P10 [5]와 같은 단조 증가 검사).
      let lastEvalLineIndex = -1;

      test.each(RETAINED_EVAL_LINES)("원문 유지 + 순서 :%i", (no) => {
        const line = sourceLine(ET, no);
        const index = evalSystemLines.indexOf(line, lastEvalLineIndex + 1);

        expect(
          evalSystemLines.includes(line),
          `누락된 원문 줄: ${JSON.stringify(line)}`,
        ).toBe(true);
        expect(
          index,
          `배치가 원문 순서와 어긋난다: :${no}이 산출물에서 ${index}행이고 직전 원문 줄은 ${lastEvalLineIndex}행이다`,
        ).toBeGreaterThan(lastEvalLineIndex);

        if (index > lastEvalLineIndex) lastEvalLineIndex = index;
      });

      // ⓑ-1 출력 규칙 — 번호만 1~9로 재부여(§12.1, P8 관례). 번호를 뗀 본문으로 대조한다.
      const EVAL_OUTPUT_RULES = [70, 73, 74, 75, 76, 77, 78, 79, 80];
      const stripEvalNumber = (line: string) => line.replace(/^\d+\.\s*/, "");

      test.each(EVAL_OUTPUT_RULES)("출력 규칙 :%i", (no) => {
        const body = stripEvalNumber(sourceLine(ET, no));
        const evalLinesNoNumber = evalSystemLines.map(stripEvalNumber);
        expect(
          evalLinesNoNumber.includes(body),
          `누락: ${JSON.stringify(body)}`,
        ).toBe(true);
      });

      test("출력 규칙 번호가 1~9로 연속 재부여됐다", () => {
        expect(
          /출력 규칙:\n1\. .+\n2\. .+\n3\. .+\n4\. .+\n5\. .+\n6\. .+\n7\. .+\n8\. .+\n9\. .+\n/.test(
            `${EVAL_SYSTEM}\n`,
          ),
        ).toBe(true);
      });

      test("마크다운 금지 조항(출력규칙 1)이 살아 있다 (§12.1 명시 — 폐기 금지)", () => {
        expect(evalSystemLines.includes(sourceLine(ET, 70))).toBe(true);
        expect(EVAL_SYSTEM.includes("마크다운 기호를 쓰지 않는다.")).toBe(true);
      });

      test("제출물 부족 판정(출력규칙 8, :77)과 전문교과 예외(출력규칙 11, :80)가 살아 있다", () => {
        const evalLinesNoNumber = evalSystemLines.map(stripEvalNumber);
        expect(
          evalLinesNoNumber.includes(stripEvalNumber(sourceLine(ET, 77))),
        ).toBe(true);
        expect(
          evalLinesNoNumber.includes(stripEvalNumber(sourceLine(ET, 80))),
        ).toBe(true);
      });

      // ⓑ-2 평가 형식 항목 제목 8개 — 번호 접두어만 제거, 축 이름은 그대로
      const EVAL_AXIS_LINES = [85, 90, 95, 100, 105, 110, 113, 119];

      test.each(EVAL_AXIS_LINES)(
        "채점 축 :%i — 번호 제거 + 문자열 유지",
        (no) => {
          const original = sourceLine(ET, no);
          const title = original.replace(/^\d+\.\s*/, "");
          expect(
            evalSystemLines.includes(title) && !EVAL_SYSTEM.includes(original),
            `원본 ${JSON.stringify(original)} / 기대 ${JSON.stringify(title)}`,
          ).toBe(true);
        },
      );

      // 8항목 → 카드1 + sections 7 매핑 (§8.5, 명세 L1787)
      test("항목 1 `종합 평가 점수`는 sections가 아니라 score/summary 카드로 승격됐다", () => {
        expect(sourceLine(ET, 119).replace(/^\d+\.\s*/, "")).toBe("종합 평가");
        expect(ported.EVALUATION_SCORE_CARD_LABELS.score).toBe(
          "종합 평가 점수",
        );
        expect(ported.EVALUATION_SCORE_CARD_LABELS.summary).toBe("총평");
        expect(
          ported.EVALUATION_REPORT_SECTIONS.some(
            (s) => s.label === "종합 평가 점수",
          ),
        ).toBe(false);
      });

      test("sections는 7개이고 라벨·순서가 원문 항목 2~8 = §5.16 실측과 일치한다", () => {
        expect(ported.EVALUATION_REPORT_SECTIONS.map((s) => s.label)).toEqual(
          [85, 90, 95, 100, 105, 110, 113].map((no) =>
            sourceLine(ET, no).replace(/^\d+\.\s*/, ""),
          ),
        );
      });

      test("kind 분기 = 3분할 5 + 노트 1 + 키값 1 (§8.4 — 7·8번에 3분할을 강제하지 않는다)", () => {
        expect(ported.EVALUATION_REPORT_SECTIONS.map((s) => s.kind)).toEqual([
          "triad",
          "triad",
          "triad",
          "triad",
          "triad",
          "note",
          "keyValue",
        ]);
      });

      test("3분할 행 라벨 3종 = 원문 :86-88", () => {
        expect(
          ported.EVALUATION_TRIAD_ROW_LABELS.map((row) => `- ${row.label}:`),
        ).toEqual(sourceLineRange(ET, 86, 88));
      });

      test("누적 기록용 요약 4키 = 원문 :114-117 (순서 포함)", () => {
        expect(
          ported.EVALUATION_RECORD_SUMMARY_ROW_LABELS.map(
            (row) => `- ${row.label}:`,
          ),
        ).toEqual(sourceLineRange(ET, 114, 117));
      });

      // ⓒ 스키마로 대체해 삭제한 것 — 출력 포맷 강제 지시뿐
      const REMOVED_EVAL_LINES = [
        71, // 「항목은 숫자 번호로 구분한다」
        72, // 「반드시 1번부터 8번까지 …」
        81, // 종료 마커 「평가 리포트 종료」
      ];

      test.each(REMOVED_EVAL_LINES)(
        "스키마 대체 :%i — 프롬프트에서 제거됨",
        (no) => {
          const body = stripEvalNumber(sourceLine(ET, no));
          expect(
            EVAL_SYSTEM.includes(body),
            `남아 있는 포맷 강제 줄: ${JSON.stringify(body)}`,
          ).toBe(false);
        },
      );

      test("종료 마커 문자열 '평가 리포트 종료'가 어디에도 없다 (§12.1 명시 폐기)", () => {
        expect(EVAL_SYSTEM.includes("평가 리포트 종료")).toBe(false);
      });

      // ⓓ 문구 교체 1줄 — `:120` 예상 점수 → score 필드 지시
      test("문구 교체 :120 — 옛 문장 부재 / score 필드 지시로 대체됐다 (§12.1)", () => {
        expect(EVAL_SYSTEM.includes(sourceLine(ET, 120))).toBe(false);
        expect(
          evalSystemLines.some((line) =>
            line.startsWith("- 예상 점수: score 필드에"),
          ),
        ).toBe(true);
        expect(EVAL_SYSTEM.includes("0부터 100 사이의 정수")).toBe(true);
      });

      // CORE_PRINCIPLES 주입은 외부 :63 그대로 계승 — 맨 앞
      test("CORE_PRINCIPLES가 원문 :63과 같은 자리(맨 앞)에 주입된다", () => {
        expect(EVAL_SYSTEM.startsWith(ported.CORE_PRINCIPLES)).toBe(true);
        // biome-ignore lint/suspicious/noTemplateCurlyInString: 원본 소스 63행에
        // 남아있는 미해석 플레이스홀더 문자열 자체를 검증하는 리터럴 비교다.
        expect(sourceLine(ET, 63)).toBe("${CORE_PRINCIPLES}");
      });
    });

    // ---------------------------------------------------------------------
    // [10] Q68 제출 형식 연결 블록 — 원문 무손상 증명
    // ---------------------------------------------------------------------
    describe("[10] Q68 제출 형식 연결 블록 (원문 무손상)", () => {
      // 핵심 증명: 연결 블록을 원문 사이에 끼웠는데도 원문 두 덩어리가 각각
      // 연속된 통짜로 남아 있는가. 원문에서 인접했던 줄이 산출물에서도
      // 인접해야 한다.
      const EVAL_CONTIGUOUS_RUNS = [
        { name: "역할 3줄 (:65-67)", from: 65, to: 67 },
        { name: "3분할 하위 키 1번 (:86-88)", from: 86, to: 88 },
        { name: "3분할 하위 키 2번 (:91-93)", from: 91, to: 93 },
        { name: "3분할 하위 키 3번 (:96-98)", from: 96, to: 98 },
        { name: "3분할 하위 키 4번 (:101-103)", from: 101, to: 103 },
        { name: "3분할 하위 키 5번 (:106-108)", from: 106, to: 108 },
        { name: "누적 기록용 요약 4키 (:114-117)", from: 114, to: 117 },
      ];

      test.each(EVAL_CONTIGUOUS_RUNS)(
        "원문 연속 블록 무손상 — $name",
        ({ from, to }) => {
          const run = sourceLineRange(ET, from, to).join("\n");
          expect(EVAL_SYSTEM.includes(run), `끊긴 블록: ${run}`).toBe(true);
        },
      );

      // 위 목록은 하위 키 묶음만 본다(from이 전부 86/91/…). 즉 항목 제목
      // (`평가 기준 충족도`)과 첫 하위 키(`- 잘한 점:`) 사이에 줄을 끼워
      // 넣어도 전부 통과한다 — 「원문 무손상」 주장의 구멍이었다(검토 P11).
      // 그래서 `평가 형식:`(:83)부터 `- 총평:`(:121)까지 39줄을 통짜로 한
      // 번 더 대조한다. 이 블록의 유일한 변형 2가지만 반영한다:
      //   · 항목 제목 8줄의 번호 접두어 제거(§12.1 P8 관례)
      //   · :120 한 줄만 score 필드 지시로 교체(위 ⓓ가 그 내용을 따로
      //     검증한다 — 여기서는 그 줄이 정확히 그 자리에 있는지만 본다)
      test("`평가 형식:` 블록 39줄이 원문 :83-:121과 통짜로 일치 (번호 접두어 제거 + :120 교체만)", () => {
        const stripEvalNumber = (line: string) => line.replace(/^\d+\.\s*/, "");
        const evalScoreLine = evalSystemLines.find((line) =>
          line.startsWith("- 예상 점수: "),
        );
        const EVAL_FORMAT_BLOCK = sourceLineRange(ET, 83, 121)
          .map((line, offset) =>
            83 + offset === 120 ? evalScoreLine : stripEvalNumber(line),
          )
          .join("\n");

        expect(Boolean(evalScoreLine)).toBe(true);
        expect(
          EVAL_SYSTEM.includes(EVAL_FORMAT_BLOCK),
          "평가 형식 블록에 원문에 없는 줄이 끼었거나 항목 제목↔하위 키 인접성이 깨졌다",
        ).toBe(true);
      });

      test("연결 블록이 출력 규칙 뒤 / `평가 형식:` 앞에 끼워졌다", () => {
        expect(EVAL_SYSTEM.indexOf(sourceLine(ET, 80))).toBeLessThan(
          EVAL_SYSTEM.indexOf("[제출 형식 컨텍스트]"),
        );
        expect(EVAL_SYSTEM.indexOf("[제출 형식 컨텍스트]")).toBeLessThan(
          EVAL_SYSTEM.indexOf(sourceLine(ET, 83)),
        );
      });

      test("연결 블록은 어느 원문에도 없는 신규 자산이다 (외부 원문에 문자열 부재)", () => {
        expect(read(ET).includes("[제출 형식 컨텍스트]")).toBe(false);
        expect(read(FR).includes("[제출 형식 컨텍스트]")).toBe(false);
        for (const line of ported.EVALUATION_FORMAT_BRIDGE_RULES.split("\n")) {
          expect(read(ET).includes(line)).toBe(false);
        }
      });

      test("연결 블록이 축 불변 + 형식 특성 반영 + 보고서 구조 강요 금지 + 우선순위를 모두 다룬다", () => {
        for (const fragment of [
          "전부 그대로 적용한다",
          "위 제출 형식의 특성을 기준으로 본다",
          "보고서 구조를 갖추라고 요구하지 않는다",
          "안내문의 평가 기준을 따른다",
        ]) {
          expect(ported.EVALUATION_FORMAT_BRIDGE_RULES.includes(fragment)).toBe(
            true,
          );
        }
      });

      test("판정 값이 guide-structure.ts의 7유형 그대로 흘러들어간다", () => {
        for (const type of guideStructureTypes) {
          expect(
            ported
              .buildEvaluationSystem({
                structureType: type ?? "",
                structureReason: "r",
                writingFrame: "f",
              })
              .includes(`- 판정 유형: ${type}`),
          ).toBe(true);
        }
      });

      test("판정 값이 비면 '미입력'을 렌더한다 (P10 [안내문 구조 판정] 블록과 동일 규칙)", () => {
        expect(ported.buildEvaluationFormatBridge({})).toBe(
          `[제출 형식 컨텍스트]\n- 판정 유형: 미입력\n- 판정 근거: 미입력\n- 안내문이 요구한 작성 틀:\n미입력\n${ported.EVALUATION_FORMAT_BRIDGE_RULES}`,
        );
      });

      test("채점 축 8개는 형식이 바뀌어도 하나도 달라지지 않는다 (원문 훼손 방지)", () => {
        const strip = (text: string) => text.slice(text.indexOf("평가 형식:"));
        const base = strip(
          ported.buildEvaluationSystem({ structureType: "기본 보고서형" }),
        );

        for (const type of guideStructureTypes) {
          expect(
            strip(ported.buildEvaluationSystem({ structureType: type ?? "" })),
          ).toBe(base);
        }
      });
    });

    // ---------------------------------------------------------------------
    // [11] 평가 user 메시지
    // ---------------------------------------------------------------------
    describe("[11] 평가 user 메시지 (컨텍스트 8블록)", () => {
      // 블록 라벨 8개 + 작업 지시 3줄 — 원문 그대로, 순서까지
      const EVAL_USER_LINES = [
        125, 128, 131, 134, 137, 140, 143, 146, 149, 150, 151,
      ];
      let lastEvalUserIndex = -1;

      test.each(EVAL_USER_LINES)("원문 유지 + 순서 :%i", (no) => {
        const line = sourceLine(ET, no);
        const index = EVAL_USER.split("\n").indexOf(
          line,
          lastEvalUserIndex + 1,
        );

        expect(
          EVAL_USER.split("\n").includes(line),
          `누락: ${JSON.stringify(line)}`,
        ).toBe(true);
        expect(index, `배치 어긋남: :${no}`).toBeGreaterThan(lastEvalUserIndex);

        if (index > lastEvalUserIndex) lastEvalUserIndex = index;
      });

      test("⚠ 내부 위닝DB 사용 금지 지시(:151)가 살아 있다 — 평가는 설계와 정반대 계약", () => {
        expect(EVAL_USER.includes(sourceLine(ET, 151))).toBe(true);
        expect(EVAL_USER.includes("내부 위닝DB 자료는 사용하지 말고")).toBe(
          true,
        );
      });

      test("buildEvaluationUser는 RAG 텍스트 인자를 받지 않는다 (시그니처가 계약)", () => {
        expect(
          /knowledgeText|historyText|resourceKnowledge/i.test(
            ported.buildEvaluationUser.toString().slice(0, 400),
          ),
        ).toBe(false);
      });

      test("하드코딩 폴백 '일반고'가 이식되지 않았다 (:49 — §8.3·§12.1)", () => {
        expect(sourceLine(ET, 49).includes("'일반고'")).toBe(true);
        expect(EVAL_USER_EMPTY.includes("일반고")).toBe(false);
      });

      test("값이 없으면 '미입력'을 렌더한다 (§12.1 — 리터럴 통일)", () => {
        expect(EVAL_USER_EMPTY.includes("[선택 주제]\n미입력")).toBe(true);
        expect(EVAL_USER_EMPTY.includes("[희망 진로]\n미입력")).toBe(true);
        expect(EVAL_USER_EMPTY.includes("[학년/학기]\n미입력")).toBe(true);
        expect(EVAL_USER_EMPTY.includes("[학교 유형]\n미입력")).toBe(true);
        expect(EVAL_USER_EMPTY.includes("[선택 과목]\n미입력")).toBe(true);
      });

      test("원문 리터럴 '없음'(:144) / '평가 기준 정보 없음'(:59)이 유지된다", () => {
        expect(EVAL_USER_EMPTY.includes("[이전에 했던 주제]\n없음")).toBe(true);
        expect(ported.NO_ASSESSMENT_CRITERIA_TEXT).toBe("평가 기준 정보 없음");
        expect(sourceLine(ET, 59).includes("'평가 기준 정보 없음'")).toBe(true);
        expect(
          EVAL_USER_EMPTY.includes("[평가 기준]\n평가 기준 정보 없음"),
        ).toBe(true);
      });

      test("학년/학기·선택 과목은 분리 컬럼을 결합해 렌더한다 (Q10 / §8.3)", () => {
        expect(EVAL_USER.includes("[학년/학기]\n고1 1학기")).toBe(true);
        expect(EVAL_USER.includes("[선택 과목]\n국어 / 공통국어1")).toBe(true);
      });
    });

    // ---------------------------------------------------------------------
    // [12] 평가 responseSchema · 최소 길이 · 생성 파라미터
    // ---------------------------------------------------------------------
    describe("[12] 평가 responseSchema · score 승격 · 생성 파라미터", () => {
      test("number/integer 타입 필드가 하나도 없다 (§8.4 완화책 ⓐ)", () => {
        const json = JSON.stringify(ported.EVALUATION_REPORT_SCHEMA);
        expect(json.includes('"number"')).toBe(false);
        expect(json.includes('"integer"')).toBe(false);
      });

      test("score는 string + pattern '^\\\\d{1,3}$' (§8.4 표 · 명세 L1619)", () => {
        expect(ported.EVALUATION_REPORT_SCHEMA.properties.score.type).toBe(
          "string",
        );
        expect(ported.EVALUATION_REPORT_SCHEMA.properties.score.pattern).toBe(
          "^\\d{1,3}$",
        );
      });

      test("스키마 required = score + summary + 7섹션 필드 (1항목 승격 + sections 7)", () => {
        expect(ported.EVALUATION_REPORT_SCHEMA.required).toEqual([
          "score",
          "summary",
          ...ported.EVALUATION_REPORT_SECTIONS.map((s) => s.id),
        ]);
      });

      test("propertyOrdering = required 순서 (원문 항목 1 → 2~8)", () => {
        expect(ported.EVALUATION_REPORT_SCHEMA.propertyOrdering).toEqual(
          ported.EVALUATION_REPORT_SCHEMA.required,
        );
      });

      test("3분할 5종만 good/bad/improve를 갖고, 7·8번은 갖지 않는다 (§8.4)", () => {
        const triadSections = ported.EVALUATION_REPORT_SECTIONS.filter(
          (s) => s.kind === "triad",
        );
        for (const section of triadSections) {
          expect(
            ported.EVALUATION_REPORT_SCHEMA.properties[section.id].required,
          ).toEqual(["good", "bad", "improve"]);
        }
        expect(ported.EVALUATION_REPORT_SCHEMA.properties.plagiarism.type).toBe(
          "string",
        );
        expect(
          ported.EVALUATION_REPORT_SCHEMA.properties.record_summary.required
            .length,
        ).toBe(4);
      });

      test("3분할 5종이 서로 다른 객체다 (한 곳을 고치면 다섯 곳이 같이 바뀌지 않는다)", () => {
        const triadSchemas = new Set(
          ported.EVALUATION_REPORT_SECTIONS.filter(
            (s) => s.kind === "triad",
          ).map((s) => ported.EVALUATION_REPORT_SCHEMA.properties[s.id]),
        );
        expect(triadSchemas.size).toBe(5);
      });

      test("record_summary 필드명이 라벨 상수의 key와 1:1이다", () => {
        expect(
          ported.EVALUATION_REPORT_SCHEMA.properties.record_summary
            .propertyOrdering,
        ).toEqual(
          ported.EVALUATION_RECORD_SUMMARY_ROW_LABELS.map((row) => row.key),
        );
      });

      test("parseEvaluationScore: 0~100 정수만 통과, 그 외는 null (텍스트 폴백 없음 §12.4)", () => {
        expect(ported.parseEvaluationScore("86")).toBe(86);
        expect(ported.parseEvaluationScore("0")).toBe(0);
        expect(ported.parseEvaluationScore("100")).toBe(100);
        expect(ported.parseEvaluationScore(" 86 ")).toBe(86);
        expect(ported.parseEvaluationScore("101")).toBeNull();
        expect(ported.parseEvaluationScore("86점")).toBeNull();
        expect(ported.parseEvaluationScore("86/100")).toBeNull();
        expect(ported.parseEvaluationScore("")).toBeNull();
        expect(ported.parseEvaluationScore(86)).toBeNull();
        expect(ported.parseEvaluationScore(null)).toBeNull();
      });

      test("최소 길이 임계값 100이 원문 :37 그대로다", () => {
        expect(ported.SUBMISSION_MIN_CHARS).toBe(100);
        expect(sourceLine(ET, 37).includes("length < 100")).toBe(true);
      });

      test("거절 문구가 원문 :39 / :34 그대로다", () => {
        expect(
          sourceLine(ET, 39).includes(ported.SUBMISSION_TOO_SHORT_MESSAGE),
        ).toBe(true);
        expect(
          sourceLine(ET, 34).includes(ported.EMPTY_SUBMISSION_MESSAGE),
        ).toBe(true);
      });

      test("Q35 — 라벨·주제가 아니라 스키마 선언 필드 값의 순수 본문 합을 센다", () => {
        // 스키마에 선언된 것은 intro·body 둘뿐. topic은 제출 필드가 아니라
        // 표시값이므로 값이 실려 와도 세지 않는다(그러지 않으면 주제명만으로
        // 게이트가 뚫린다).
        const schemaFields = [
          { key: "intro", label: "서론", helper: "", required: true },
          { key: "body", label: "본론", helper: "", required: true },
        ];
        const { total, perField } = chars.countFieldsChars(schemaFields, {
          topic: "  가나다  ",
          intro: "라마바사",
          body: "",
        }) as { total: number; perField: Record<string, number> };

        expect(total).toBe(4);
        expect(perField.intro).toBe(4);
        expect(perField.body).toBe(0);
        expect("topic" in perField).toBe(false);
      });

      test("프롬프트 모듈에 글자 수 계산 사본이 없다 (같은 이름·다른 계산식 금지)", () => {
        expect((ported as Record<string, unknown>).countSubmissionChars).toBe(
          undefined,
        );
        expect(typeof chars.countFieldsChars).toBe("function");
        expect(chars.SUBMISSION_MIN_CHARS).toBe(ported.SUBMISSION_MIN_CHARS);
      });

      test("생성 파라미터 temperature는 원문 0.25 그대로 (:155)", () => {
        expect(ported.EVALUATION_GENERATION_DEFAULTS.temperature).toBe(0.25);
        expect(sourceLine(ET, 155).includes("temperature: 0.25")).toBe(true);
      });

      test("maxOutputTokens는 원문 5200에서 상향됐다 (§12.3 실측 재조정 + JSON 오버헤드)", () => {
        expect(sourceLine(ET, 156).includes("maxOutputTokens: 5200")).toBe(
          true,
        );
        expect(
          ported.EVALUATION_GENERATION_DEFAULTS.maxOutputTokens,
        ).toBeGreaterThan(5200);
        expect(ported.EVALUATION_MAX_OUTPUT_TOKENS_RETRY).toBeGreaterThan(
          ported.EVALUATION_GENERATION_DEFAULTS.maxOutputTokens,
        );
      });

      test("평가 프롬프트 버전 문자열이 있다 (§8.3 performance_reports.prompt_version)", () => {
        expect(ported.EVALUATION_PROMPT_VERSION).toBe("eval-v1");
      });
    });
  },
);
