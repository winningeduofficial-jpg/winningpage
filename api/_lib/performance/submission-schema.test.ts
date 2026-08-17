// 수행평가 제출 스키마 — 세션 어댑터 회귀 검증.
//
// `resolveSessionSubmissionSchema`는 우리 저장소에만 있는 세션 배선이다.
// upload/manual 모드에 따라 어느 컬럼을 판정에 넘기는지, 영속화된
// `submission_schema`가 있으면 재판정하지 않는지를 고정한다.
import { describe, expect, test } from "vitest";
import * as ported from "./submission-schema.js";

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
