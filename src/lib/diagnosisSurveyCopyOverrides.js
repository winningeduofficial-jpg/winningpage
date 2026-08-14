// 학습진단(ver2) 설문 문항 문구 어드민 오버레이 — sql/72_learning_diagnosis_v2_survey_copy.sql.
//
// renewalSurveyQuestions.js 는 채점 엔진과 강결합된 정본이라 절대 고치지 않는다. 이 모듈은
// title/helper/선택지 라벨/리커트 문장 **표시 문구만** DB 값으로 덮어씌우는 순수 오버레이 계층이다
// — scoringId/optionCodes/type/page 등 구조 필드는 원본을 그대로 통과시킨다(mentor_apply_copy와
// 같은 키 단위 폴백: 테이블이 없거나 특정 키가 없으면 그 필드만 정적 값을 쓴다).
import { supabase } from "./supabase";

const TABLE = "learning_diagnosis_v2_survey_copy";

/** 조회 실패·0행이면 빈 Map — 호출부는 오버라이드 0건으로 취급해 원본 그대로 렌더한다. */
export async function fetchSurveyCopyOverrides() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("copy_key, copy_value");
  if (error || !data) return new Map();
  return new Map(data.map((row) => [row.copy_key, row.copy_value]));
}

/**
 * questions 배열에 오버라이드를 적용한 새 배열을 돌려준다. overrideMap 이 비어 있으면 원본을
 * 그대로 돌려준다(불필요한 리렌더 방지).
 *
 * exclusiveValues(OptionGroup 배타선택 매칭, §OptionGroup.jsx:71)는 라벨 문자열을 직접 비교하므로
 * 옵션 라벨을 오버라이드하면서 exclusiveCodes 를 경유해 함께 재계산한다 — 안 하면 q10/q12 의
 * "특별히 큰 어려움은 없어요" 류 배타 선택지가 문구 수정 한 번에 조용히 깨진다.
 */
export function applySurveyCopyOverrides(questions, overrideMap) {
  if (!overrideMap || overrideMap.size === 0) return questions;

  return questions.map((question) => {
    const id = question.id;
    let changed = false;
    const next = { ...question };

    const titleOverride = overrideMap.get(`${id}.title`);
    if (titleOverride !== undefined) {
      next.title = titleOverride;
      changed = true;
    }

    // helper 가 원래 null/빈 문자열인 문항은 시드 대상이 아니었다(§72 마이그레이션 스코프) —
    // 오버라이드 키도 존재하지 않으므로 이 분기는 자연히 스킵된다.
    if (question.helper) {
      const helperOverride = overrideMap.get(`${id}.helper`);
      if (helperOverride !== undefined) {
        next.helper = helperOverride;
        changed = true;
      }
    }

    if (
      Array.isArray(question.optionCodes) &&
      question.optionCodes.length > 0
    ) {
      const options = question.options.map((label, i) => {
        const code = question.optionCodes[i];
        if (code == null) return label;
        const override = overrideMap.get(`${id}.option.${code}`);
        return override !== undefined ? override : label;
      });

      if (options.some((label, i) => label !== question.options[i])) {
        next.options = options;
        changed = true;

        if (
          Array.isArray(question.exclusiveCodes) &&
          question.exclusiveCodes.length > 0
        ) {
          next.exclusiveValues = question.exclusiveCodes
            .map((code) => {
              const idx = question.optionCodes.indexOf(code);
              return idx === -1 ? null : options[idx];
            })
            .filter((label) => label !== null);
        }
      }
    }

    if (
      Array.isArray(question.extra?.statements) &&
      question.extra.statements.length > 0
    ) {
      const statements = question.extra.statements.map((statement) => {
        const override = overrideMap.get(`${id}.statement.${statement.key}`);
        return override !== undefined
          ? { ...statement, text: override }
          : statement;
      });

      if (
        statements.some(
          (statement, i) => statement !== question.extra.statements[i],
        )
      ) {
        next.extra = { ...question.extra, statements };
        changed = true;
      }
    }

    return changed ? next : question;
  });
}
