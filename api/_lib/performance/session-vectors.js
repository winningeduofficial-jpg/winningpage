// performance_session_vectors 메타데이터 쓰기 레이어(P14 슬라이스).
//
// **이 파일은 임베딩을 실행하지 않는다.** Gemini 호출은 별도 비동기 배치의 책임이다.
// 여기서 하는 일은 세션 산출물을 (검색용 텍스트 + 콘텐츠 해시 + 비정규화 메타)로
// 조립해 `performance_session_vectors`에 upsert하는 것뿐이다 — 배치가 나중에
// `embedding_status='pending'`인 행을 골라 임베딩을 채운다(sql/54_performance_app.sql
// (1-8) 참고).
//
// **왜 원문 이식이 아닌지.** `performance_session_vectors`는 §8.3이 새로 도입한
// 층이라 이식할 원문이 없다. 외부 원본 `suhaengpyeong` 저장소의
// `api/_lib/reports.js:9-23`에 있던 9줄 조립식(학생코드·학생명 2줄 제외한 나머지)과
// 표면적으로 비슷해 보이지만, 그 식은 `report_type`/`title`/`report_content`/
// `submission_text`/`evaluation_result`처럼 리포트 3종을 개별 필드로 쪼갰던 옛
// 스키마 기준이고, 이 저장소는 그 3종을 `summary_text` 컬럼 하나로 이미 스키마
// 단계에서 합쳤다(설계 근거는 sql/54_performance_app.sql 자체와 명세서 §8.3 표에
// 있다). 그래서 `buildSessionVectorSearchText`가 정하는 6줄 공식이 새 정본이다.
// **PII(학생코드·학생명)는 애초에 파라미터에 존재하지 않는다** — 함수 시그니처
// 자체가 그 규율을 강제한다.

import { createHash } from "crypto";

/** 요약 압축. `knowledge.js:compactText`와 같은 방식(로컬 정의, export 안 함). */
function compactText(text, max = 1200) {
  const value = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

/**
 * design-report.js `buildReportEnvelope`가 만드는 저장 봉투의 `sections` 배열
 * (`[{id,label,blocks:[...]}, ...]`)을 사람이 읽는 압축 텍스트로 평탄화한다.
 *
 * block은 3종류를 인식한다:
 *   - `{kind:'keyValue', rows:[{label,content,href?}]}` → 각 row의 `content`만
 *   - `{kind:'plainList', ordered?, items:[{type:'bullet',text}]}` → 각 item의 `text`만
 *   - `{kind:'group', title, children:[block,...]}` → children을 재귀 평탄화(title은 버림)
 *
 * **다른 kind가 나오면 방어적으로 건너뛴다(throw 금지)** — 미래에 block kind가
 * 늘어나도 이 함수가 전체 임베딩 파이프라인을 깨뜨리면 안 된다.
 *
 * 섹션별로 뽑은 텍스트 조각은 공백으로 join, 섹션 간에는 개행으로 join.
 *
 * @param {Array<object>} sections
 * @returns {string} 입력이 배열이 아니거나 비어있으면 빈 문자열.
 */
export function flattenReportSectionsToText(sections = []) {
  if (!Array.isArray(sections) || sections.length === 0) return "";

  function flattenBlock(block) {
    if (!block || typeof block !== "object") return [];

    switch (block.kind) {
      case "keyValue":
        return (Array.isArray(block.rows) ? block.rows : [])
          .map((row) => String(row?.content || "").trim())
          .filter(Boolean);
      case "plainList":
        return (Array.isArray(block.items) ? block.items : [])
          .map((item) => String(item?.text || "").trim())
          .filter(Boolean);
      case "group":
        return (Array.isArray(block.children) ? block.children : []).flatMap(
          flattenBlock,
        );
      default:
        // 모르는 kind는 방어적으로 건너뛴다.
        return [];
    }
  }

  return sections
    .map((section) =>
      (Array.isArray(section?.blocks) ? section.blocks : [])
        .flatMap(flattenBlock)
        .join(" "),
    )
    .join("\n");
}

/**
 * `embeddings.js:buildKnowledgeSearchText`와 같은 라벨-줄 패턴으로 임베딩 입력을 조립한다.
 */
export function buildSessionVectorSearchText({
  gradeLabel,
  subjectGroup,
  subject,
  careerGoal,
  topicTitle,
  summaryText,
} = {}) {
  return [
    `학년: ${gradeLabel || ""}`,
    `교과군: ${subjectGroup || ""}`,
    `과목: ${subject || ""}`,
    `진로: ${careerGoal || ""}`,
    `주제: ${topicTitle || ""}`,
    `내용: ${summaryText || ""}`,
  ].join("\n");
}

/**
 * 무변경 재임베딩 스킵 판정용 캐시 키. 보안 용도가 아니다(단순 콘텐츠 지문).
 */
export function computeContentHash(text) {
  return createHash("sha256")
    .update(String(text || ""))
    .digest("hex");
}

/**
 * `performance_session_vectors` 행을 upsert한다. 임베딩 자체는 하지 않는다 —
 * 내용이 바뀌었을 때만 `embedding_status`를 `pending`으로 되돌려 별도 배치가
 * 재임베딩하도록 신호만 남긴다.
 *
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase
 * @param {string} params.sessionId
 * @param {string} params.profileId
 * @param {string} [params.gradeLabel]
 * @param {string} [params.subjectGroup]
 * @param {string} [params.subject]
 * @param {string} [params.careerGoal]
 * @param {string} [params.topicTitle]
 * @param {string} [params.summaryText]
 */
export async function upsertSessionVectorMetadata({
  supabase,
  sessionId,
  profileId,
  gradeLabel,
  subjectGroup,
  subject,
  careerGoal,
  topicTitle,
  summaryText,
}) {
  // 1600자 기준: 설계+평가 2개 리포트를 합치므로 knowledge.js의 단일 리포트 압축
  // 기준(1200자)보다 여유를 둔 것이다.
  //
  // 호출부(evaluate.js)가 이미 압축해서 넘겼을 수도, 안 넘겼을 수도 있다 — 호출부가
  // 압축 여부를 결정하지 못했을 가능성이 있으니 여기서 한 번 더 압축해 안전망을 둔다.
  const compactedSummaryText = compactText(summaryText, 1600);

  const searchText = buildSessionVectorSearchText({
    gradeLabel,
    subjectGroup,
    subject,
    careerGoal,
    topicTitle,
    summaryText: compactedSummaryText,
  });
  const contentHash = computeContentHash(searchText);

  const { data: existing, error: selectError } = await supabase
    .from("performance_session_vectors")
    .select("content_hash")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (selectError) {
    throw new Error(
      `performance_session_vectors 조회 실패: ${selectError.message}`,
    );
  }

  const patch = {
    session_id: sessionId,
    profile_id: profileId,
    grade_label: gradeLabel || null,
    subject_group: subjectGroup || null,
    subject: subject || null,
    career_goal: careerGoal || null,
    topic_title: topicTitle || null,
    summary_text: compactedSummaryText || null,
    search_text: searchText,
    content_hash: contentHash,
  };

  // 기존 행이 없거나 콘텐츠가 실제로 바뀌었을 때만 재임베딩을 신호한다. 내용이
  // 그대로면 이미 `done` 상태를 건드리지 않아 불필요한 재임베딩을 막는다.
  if (!existing || existing.content_hash !== contentHash) {
    patch.embedding_status = "pending";
    patch.embedding = null;
    patch.embedding_error = null;
    patch.embedded_at = null;
  }

  // **`rag_use`는 patch에 절대 넣지 않는다.** supabase-js `.upsert(patch,
  // {onConflict:'session_id'})`는 PostgREST를 거쳐
  // `INSERT ... ON CONFLICT (session_id) DO UPDATE SET <patch에 있는 컬럼만>`을
  // 생성한다 — patch에 없는 컬럼은 충돌(update) 경로에서 건드려지지 않고 기존
  // 값이 보존된다(신규 insert 경로에서만 테이블 컬럼 default `false`가 적용된다).
  // [검증 필요: 이 "부분 컬럼 upsert가 나머지 컬럼을 보존한다"는 전제는 검증팀이
  // WebSearch로 재확인할 예정이다.]
  //
  // rag_use 승격은 오직 `sql/58_performance_submission.sql`의 RPC 2개
  // (`commit_performance_evaluation_report`/`finalize_performance_submission`)만
  // 하는 것이 설계 원칙이다 — 이 함수가 손대면 그 단일 승격 지점 원칙이 깨진다.

  const { error: upsertError } = await supabase
    .from("performance_session_vectors")
    .upsert(patch, { onConflict: "session_id" });

  if (upsertError) {
    throw new Error(
      `performance_session_vectors upsert 실패: ${upsertError.message}`,
    );
  }
}
