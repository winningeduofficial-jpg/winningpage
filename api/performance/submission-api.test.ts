// STEP5 제출·평가·확정 API 3종 계약 회귀 검증.
//
// `submission.ts` / `evaluate.ts` / `finalize.ts`와 `sql/58`은 명세서 §8.6
// 엔드포인트 표 / §8.3 스키마 단정 / §9.3 회차 규칙 / §12.2·§12.4 이식 결정
// 위에 서 있다. 이 계약들은 깨져도 코드가 그대로 돈다 — 차감 한 줄이
// 들어와도, 게이트 순서가 뒤집혀도, 에러 코드가 하나 사라져도 테스트 없이는
// 배포까지 간다. 그래서 다음 4가지를 기계로 못박는다.
//
//   [3] 차감 부재        — 3파일 + sql/58 어디에도 차감 경로가 없는가(§9.3, §12.4)
//   [4] 계약 코드 커버   — §8.6이 정의한 실패 코드가 각 파일에 실재하는가
//   [5] 실패 응답 형태   — `{error:{code,message}}`만 쓰고 외부식 `detail`/
//       `error_message`가 응답 본문에 실리지 않는가(§8.6 L1811)
//   [6] sql/58 불변식    — 부분 UNIQUE 3종 / rag_use 승격 2지점 / EXECUTE 회수 /
//       멱등 분기(already_final · already_finalized_other)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");

const SUBMISSION_API = read("api/performance/submission.ts");
const EVALUATE_API = read("api/performance/evaluate.ts");
const FINALIZE_API = read("api/performance/finalize.ts");
const SQL58 = read("sql/58_performance_submission.sql");

/** 주석·문자열 리터럴을 지운 코드 본문. "주석에 단어가 있으니 통과"를 막는다. */
function codeOnly(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const SUBMISSION_CODE = codeOnly(SUBMISSION_API);
const EVALUATE_CODE = codeOnly(EVALUATE_API);
const FINALIZE_CODE = codeOnly(FINALIZE_API);

/** `--` 주석을 지운 SQL 본문. 주석에서 원장·이용권을 언급하는 것은 정상이다. */
const SQL58_CODE = SQL58.replace(/^\s*--.*$/gm, " ");

// ─────────────────────────────────────────────────────────────────────
// [3] 차감 부재 (§9.3 / §12.4 — 외부 evaluate-text.js:51 선차감 이식 금지)
// ─────────────────────────────────────────────────────────────────────
describe("[3] 차감 코드 부재", () => {
  test.each([
    ["submission.ts", SUBMISSION_CODE],
    ["evaluate.ts", EVALUATE_CODE],
    ["finalize.ts", FINALIZE_CODE],
  ])(
    "%s — consume_performance_credit 호출 없음 / program_access write 없음",
    (_name, code) => {
      expect(code.includes("consume_performance_credit")).toBe(false);
      expect(/program_access[\s\S]{0,80}update/i.test(code)).toBe(false);
    },
  );

  test("evaluate.ts — 원장은 읽기(select)만 한다", () => {
    expect(
      /performance_credit_ledger[\s\S]{0,120}\.select\(/.test(EVALUATE_API),
    ).toBe(true);
    expect(
      /from\(["']performance_credit_ledger["']\)[\s\S]{0,120}\.(insert|update|upsert|delete)\(/.test(
        EVALUATE_API,
      ),
    ).toBe(false);
  });

  test("sql/58 — 원장·이용권을 읽지도 쓰지도 않는다(주석 언급은 제외)", () => {
    expect(SQL58_CODE.includes("performance_credit_ledger")).toBe(false);
    expect(SQL58_CODE.includes("program_access")).toBe(false);
  });

  test("3파일 모두 응답에 charged:false를 싣는다(§8.6 무차감 명시)", () => {
    const withChargedFalse = [
      SUBMISSION_API,
      EVALUATE_API,
      FINALIZE_API,
    ].filter((src) => src.includes("charged: false"));
    expect(withChargedFalse.length).toBeGreaterThanOrEqual(2);
    expect(EVALUATE_API.includes("charged: false")).toBe(true);
    expect(FINALIZE_API.includes("charged: false")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// [4] §8.6 계약 코드 커버리지
// ─────────────────────────────────────────────────────────────────────
describe("[4] §8.6 엔드포인트 표 실패 코드", () => {
  const CONTRACT_CODES: Record<string, { source: string; codes: string[] }> = {
    "submission.ts": {
      source: SUBMISSION_API,
      codes: ["EMPTY_SUBMISSION", "UNKNOWN_FIELD", "SESSION_FINALIZED"],
    },
    "evaluate.ts": {
      source: EVALUATE_API,
      codes: [
        "SUBMISSION_TOO_SHORT",
        "REQUIRED_FIELD_EMPTY",
        "REEVALUATION_LIMIT",
        "MODEL_FAILED",
      ],
    },
    "finalize.ts": {
      source: FINALIZE_API,
      codes: ["NO_EVALUATION_YET", "ALREADY_FINALIZED_OTHER"],
    },
  };

  for (const [name, { source, codes }] of Object.entries(CONTRACT_CODES)) {
    test.each(codes)(`${name} — %s`, (code) => {
      expect(source.includes(`"${code}"`)).toBe(true);
    });
  }

  test("evaluate.ts — 요청에서 confirm_submit을 읽지 않는다(§8.6 폐기)", () => {
    expect(EVALUATE_CODE.includes("confirm_submit")).toBe(false);
  });
  test("evaluate.ts — 요청에서 fields/submission_text를 읽지 않는다(값은 DB에서 읽는다)", () => {
    expect(
      /body\.(fields|submissionText|submission_text)/.test(EVALUATE_CODE),
    ).toBe(false);
  });
  test("finalize.ts — action 값은 confirm/new_assessment 2종뿐(외부 승계)", () => {
    expect(FINALIZE_API.includes('["confirm", "new_assessment"]')).toBe(true);
  });
  test("submission.ts — mode는 draft/submit 2종", () => {
    expect(SUBMISSION_API.includes('body.mode === "submit"')).toBe(true);
    expect(SUBMISSION_API.includes('body.mode === "draft"')).toBe(true);
  });

  test("evaluate.ts — 제출물 게이트 → 재평가 상한 → 시도 카운터 순서", () => {
    // 게이트 순서: 제출물 형식 게이트가 상한 게이트보다 먼저 와야 한다.
    // 뒤집히면 100자 미달 요청이 재평가 슬롯을 태운다.
    const idxTooShort = EVALUATE_API.indexOf('"SUBMISSION_TOO_SHORT"');
    const idxLimit = EVALUATE_API.indexOf('"REEVALUATION_LIMIT"');
    const idxAttempt = EVALUATE_API.indexOf(
      "evaluation_attempt_count: attemptCount + 1",
    );
    expect(idxTooShort).toBeGreaterThan(0);
    expect(idxLimit).toBeGreaterThan(idxTooShort);
    expect(idxAttempt).toBeGreaterThan(idxLimit);
  });

  // 시도 카운터는 낙관적 잠금(CAS)이어야 한다(검토 P11). 조건 없이
  // `attemptCount + 1`을 덮어쓰면 동시 요청 N건이 전부 같은 스냅샷을 읽고
  // 같은 값을 써서 카운터가 1만 오른다 — 평가는 무차감이라(§9.3) 이 상한이
  // 유일한 방어선인데 병렬성으로 통째로 무력화된다.
  test("evaluate.ts — 시도 카운터가 읽은 값 조건부 update다(CAS)", () => {
    expect(
      /\.update\(\{ evaluation_attempt_count: attemptCount \+ 1 \}\)[\s\S]{0,200}\.eq\("evaluation_attempt_count", attemptCount\)/.test(
        EVALUATE_API,
      ),
    ).toBe(true);
  });
  test("evaluate.ts — CAS가 0행이면 모델을 부르지 않고 429로 끝낸다", () => {
    expect(
      /if \(!attemptRow\) \{[\s\S]{0,400}"EVALUATION_ATTEMPT_LIMIT"/.test(
        EVALUATE_API,
      ),
    ).toBe(true);
  });

  // draft 덮어쓰기는 아직 초안인 행만 대상으로 한다(검토 P11). `is_draft`
  // 조건이 없으면 뒤늦은 draft 저장이 이미 제출·채점된 원고를 덮어써 평가
  // 리포트(점수)와 저장 원고가 서로 다른 글을 가리키게 된다.
  test("submission.ts — updateRevision이 is_draft=true + is_final=false를 함께 본다", () => {
    expect(
      /\.eq\("is_draft", true\)[\s\S]{0,120}\.eq\("is_final", false\)/.test(
        SUBMISSION_API,
      ),
    ).toBe(true);
  });

  // 멱등 재생이 모델 호출보다 앞에 있어야 한다(더블클릭이 모델을 다시 부르면 안 된다).
  test("evaluate.ts — 멱등 재생이 모델 호출보다 먼저다", () => {
    const idxReplay = EVALUATE_API.indexOf("reused: true");
    const idxModel = EVALUATE_API.indexOf("generateWithRetry(");
    expect(idxReplay).toBeGreaterThan(0);
    expect(idxModel).toBeGreaterThan(idxReplay);
  });

  // Gemini 결함 완화 ⓐ~ⓓ (§8.4)
  test("evaluate.ts — MAX_TOKENS면 파싱하지 않고 재시도(ⓒ)", () => {
    expect(EVALUATE_API.includes('finishReason === "MAX_TOKENS"')).toBe(true);
  });
  test("evaluate.ts — responseSchema 강제", () => {
    expect(
      EVALUATE_API.includes("responseSchema: EVALUATION_REPORT_SCHEMA"),
    ).toBe(true);
  });
  test("evaluate.ts — score는 서버가 파싱(ⓐ)", () => {
    expect(EVALUATE_API.includes("parseEvaluationScore")).toBe(true);
  });
  test("evaluate.ts — maxDuration 60 선언", () => {
    expect(EVALUATE_API.includes('runtime: "nodejs", maxDuration: 60')).toBe(
      true,
    );
  });
  test("evaluate.ts — 텍스트 파서 폴백이 없다(JSON.parse 1곳뿐, §12.4)", () => {
    expect((EVALUATE_CODE.match(/JSON\.parse\(/g) || []).length).toBe(1);
  });
  test("evaluate.ts — 평가 단계는 RAG를 부르지 않는다(원문 작업 지시 :151)", () => {
    expect(EVALUATE_CODE.includes("loadDynamicAssessmentKnowledge")).toBe(
      false,
    );
    expect(EVALUATE_CODE.includes("loadRelevantStudentSessions")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// [5] 실패 응답 형태 (§8.6 L1811)
// ─────────────────────────────────────────────────────────────────────
describe("[5] 실패 응답에 원 예외 메시지를 싣지 않는다", () => {
  test.each([
    ["submission.ts", SUBMISSION_API, SUBMISSION_CODE],
    ["evaluate.ts", EVALUATE_API, EVALUATE_CODE],
    ["finalize.ts", FINALIZE_API, FINALIZE_CODE],
  ])(
    "%s — error:{code,message} 형태 / detail·error_message 키 없음 / error.message 미노출",
    (_name, source, code) => {
      expect(source.includes("error: { code, message }")).toBe(true);
      expect(/\b(detail|error_message)\s*:/.test(code)).toBe(false);
      expect(/return\s+fail\([^)]*error\.message/.test(code)).toBe(false);
      expect(/json\(\{[^}]*error\.message/.test(code)).toBe(false);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────
// [6] sql/58 스키마·RPC 불변식
// ─────────────────────────────────────────────────────────────────────
describe("[6] sql/58 스키마·RPC 불변식", () => {
  test("세션당 evaluation 리포트 1행 부분 UNIQUE", () => {
    expect(
      /create unique index if not exists performance_reports_one_evaluation_per_session_idx[\s\S]{0,200}where \(report_type = 'evaluation'\)/.test(
        SQL58,
      ),
    ).toBe(true);
  });
  test("세션당 final_submission 리포트 1행 부분 UNIQUE", () => {
    expect(
      /create unique index if not exists performance_reports_one_final_per_session_idx[\s\S]{0,200}where \(report_type = 'final_submission'\)/.test(
        SQL58,
      ),
    ).toBe(true);
  });
  test("performance_reports.submission_id 추가", () => {
    expect(SQL58.includes("add column if not exists submission_id uuid")).toBe(
      true,
    );
  });
  test("상한 2축 컬럼 추가", () => {
    expect(
      SQL58.includes("add column if not exists evaluation_count integer"),
    ).toBe(true);
    expect(
      SQL58.includes(
        "add column if not exists evaluation_attempt_count integer",
      ),
    ).toBe(true);
  });

  // rag_use 승격이 정확히 2지점(평가 커밋 / 최종 확정)에만 있어야 한다.
  test("rag_use 승격이 정확히 2지점, performance_session_vectors에만 건다", () => {
    const ragPromotions = SQL58.match(/set rag_use = true/g) || [];
    expect(ragPromotions.length).toBe(2);
    expect(
      (SQL58.match(/update public\.performance_session_vectors/g) || []).length,
    ).toBe(2);
  });

  test("평가 커밋 RPC가 is_final을 건드리지 않는다", () => {
    const commitFn =
      /create or replace function public\.commit_performance_evaluation_report[\s\S]*?\$function\$;/.exec(
        SQL58,
      )?.[0];
    expect(commitFn?.includes("is_final = ")).toBe(false);
  });

  test("finalize RPC가 대상 행을 for update로 잠근다", () => {
    expect(
      /finalize_performance_submission[\s\S]*?for update/.test(SQL58),
    ).toBe(true);
  });

  // 대상 제출본만 잠그면 같은 세션의 서로 다른 제출본 2건이 동시에 확정을
  // 시도할 때 잠금이 겹치지 않아 둘 다 "확정된 행 없음"으로 통과하고, 뒤늦은
  // 쪽이 부분 UNIQUE 23505 → 호출부 500이 된다(검토 P11). 세션 행을 함께
  // 잠가 세션 단위로 직렬화한다 — 순서는 반드시 제출본 → 세션이어야
  // commit_performance_evaluation_report(제출본 update → 세션 update)와
  // 교착하지 않는다.
  describe("finalize RPC — 세션 단위 직렬화(제출본 → 세션 잠금 순서)", () => {
    // 파일 상단 목차·주석에도 함수 이름이 나오므로 create or replace에 앵커한다
    // (앵커가 없으면 앞선 RPC의 본문을 잘라 보게 된다).
    const FINALIZE_FN =
      /create or replace function public\.finalize_performance_submission[\s\S]*?\$function\$;/.exec(
        SQL58,
      )?.[0] || "";

    test("finalize RPC가 세션 행도 for update로 잠근다(세션 단위 직렬화)", () => {
      expect(
        /from public\.performance_sessions s\s+where s\.id = p_session_id\s+for update/.test(
          FINALIZE_FN,
        ),
      ).toBe(true);
    });

    test("finalize RPC의 잠금 순서가 제출본 → 세션이다(교착 방지)", () => {
      const submissionLockIndex = FINALIZE_FN.search(
        /from public\.performance_submissions sub/,
      );
      const sessionLockIndex = FINALIZE_FN.search(
        /from public\.performance_sessions s\s+where s\.id = p_session_id\s+for update/,
      );
      expect(submissionLockIndex).toBeGreaterThanOrEqual(0);
      expect(sessionLockIndex).toBeGreaterThan(submissionLockIndex);
    });
  });

  test("finalize RPC 멱등 분기 3종", () => {
    expect(SQL58.includes("'already_final'")).toBe(true);
    expect(SQL58.includes("'already_finalized_other'")).toBe(true);
    expect(SQL58.includes("'no_evaluation'")).toBe(true);
  });

  test("같은 제출본 재확정은 finalize_reason을 덮어쓰지 않는다", () => {
    expect(
      /if v_is_final then[\s\S]{0,600}return jsonb_build_object\(\s*'status', 'already_final'/.test(
        SQL58,
      ),
    ).toBe(true);
  });

  test("두 RPC 모두 EXECUTE를 회수하고 service_role에만 부여", () => {
    expect((SQL58.match(/revoke all on function/g) || []).length).toBe(6);
    expect(
      (
        SQL58.match(
          /grant execute on function[\s\S]{0,200}to service_role;/g,
        ) || []
      ).length,
    ).toBe(2);
  });

  test("두 RPC 모두 security definer + search_path 고정", () => {
    expect((SQL58_CODE.match(/security definer/g) || []).length).toBe(2);
    expect(
      (SQL58_CODE.match(/set search_path to 'public'/g) || []).length,
    ).toBe(2);
  });

  test("오버로드 잔재 drop 가드 존재(42725 방어)", () => {
    expect(SQL58.includes("p.proname in (")).toBe(true);
    expect(SQL58.includes("drop function if exists")).toBe(true);
  });

  // 라우트가 select 하는 컬럼이 sql/58에 실재하는가 — 42703 배포 사고 방지.
  test.each(["evaluation_count", "evaluation_attempt_count"])(
    "evaluate.ts가 select 하는 %s이 sql/58에 있다",
    (column) => {
      expect(EVALUATE_API.includes(column)).toBe(true);
      expect(SQL58.includes(column)).toBe(true);
    },
  );

  test("sql/README.md에 58번 행이 있다", () => {
    expect(
      read("sql/README.md").includes("58_performance_submission.sql"),
    ).toBe(true);
  });
});
