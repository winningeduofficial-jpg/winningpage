// POST /api/performance/recommend-topics
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { sessionId, round? }
//   → 200 { round, topics[3], quotaRemaining, charged }
//   → 409 { error:{code:'QUOTA_EXHAUSTED'}, quotaRemaining:0, planEndsAt }
//   → 409 { error:{code:'ROUND_LIMIT'} }
//   → 422 { error:{code:'MODEL_CONTRACT_VIOLATION'} }
//   → 503 { error:{code:'MODEL_UNAVAILABLE'} }
//   ROUND_LIMIT / MODEL_CONTRACT_VIOLATION / MODEL_UNAVAILABLE 은 **전부 무차감**이다.
//
// ── 이 파일이 저장소 전체에서 유일한 회차 차감 지점이다 (§9.3)
//    세션 생성·안내문 분석·설계 리포트·평가는 전부 무차감이고, 차감은 여기 "주제 추천
//    최초 성공" 한 곳뿐이다. 외부 앱은 차감 지점이 4곳이었고 전부 **AI 호출 앞**에서
//    돌았다(`suhaengpyeong/api/recommend-topics.js:72` → 호출은 `:207`). 실패해도
//    롤백이 없어 5xx가 그대로 회차를 태웠다. 그 순서는 §9.3이 「이식 금지」로 못박은
//    버그이며, 여기서는 **AI 응답을 파싱·검증해 3건을 확보한 뒤에야** 차감 RPC를 부른다.
//
//    호출 순서는 아래 한 줄이 전부이고, 이 순서가 이 파일의 계약이다:
//      RAG 검색 → Gemini 호출 → 응답 검증 → 차감 RPC → performance_topics 저장 → 응답
//
//    차감 실패는 fail-closed다(§9.3 5항) — RPC가 소진/무권한/오류를 돌려주면 이미 받아둔
//    모델 산출물을 **버리고** 4xx/5xx로 끝낸다. 산출물을 먼저 내보내고 차감을 뒤로 미루면
//    "무료로 주제만 받아 가는" 경로가 열린다.
//
// ── 재추천은 추가 차감이 아니다 (§9.3 「다른 주제 다시 추천 | 없음」)
//    같은 세션이므로 RPC가 `already_charged`를 돌려주고 그것이 정상 경로다. 무차감이
//    코드 규율이 아니라 `performance_credit_ledger.session_id` UNIQUE 제약의 결과라는
//    점이 중요하다(sql/54 결정 ④) — 이 핸들러가 실수로 RPC를 두 번 불러도 이중 차감은
//    구조적으로 불가능하다.
//
// ── 텍스트 파서를 남기지 않는다 (§8.4)
//    외부 앱의 `countRecommendationBlocks`/`normalizeRecommendationHeaders`
//    (`suhaengpyeong/api/recommend-topics.js:15-29`)는 **이식하지 않았다.** 서버 정규식과
//    프론트 정규식이 어긋나 카드가 2장만 뜨던 BLOCK이 거기서 나왔고, §8.4는 "텍스트
//    파서를 폴백으로도 남기지 않는다 — 두 경로가 공존하면 재발한다"고 명시한다.
//    이 파일의 유일한 파싱은 `JSON.parse` 한 줄이며, 형식 강제는 `responseSchema`가 한다.
//
// ── 클라이언트는 프롬프트 입력을 보내지 않는다 (§8.6)
//    외부는 학년·과목·진로·안내문을 요청 바디로 받아(`:56-64`) 그대로 프롬프트에 넣었다 —
//    회차를 태우는 프롬프트를 클라이언트가 조작할 수 있었다. 여기서 바디로 받는 것은
//    `sessionId`와 `round`뿐이고 나머지는 전부 세션 행에서 읽는다.

import { createSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import {
  SERVICE_CONFIGS,
  findProgramAccessRow,
  getBearerToken,
  hasPaidServiceAccess,
  readQuotaSnapshot
} from '../_lib/serviceAccess.js';
import { generateWithRetry, PERFORMANCE_MODEL } from '../_lib/performance/gemini.js';
import {
  buildTopicExclusionBlock,
  buildTopicRecommendationSystem,
  buildTopicRecommendationUser,
  NO_PREVIOUS_TOPIC_TEXT,
  TOPIC_DETAIL_SECTIONS,
  TOPIC_GENERATION_DEFAULTS,
  TOPIC_MAX_OUTPUT_TOKENS_RETRY,
  TOPIC_PROMPT_VERSION,
  TOPIC_RECOMMENDATION_SCHEMA
} from '../_lib/performance/prompts.js';
import {
  formatRelevantStudentSessionsForPrompt,
  loadDynamicAssessmentKnowledge,
  loadRelevantStudentSessions,
  STUDENT_HISTORY_PROMPT_LIMIT,
  TOPIC_MAX_CHARS
} from '../_lib/performance/knowledge.js';

const SERVICE_KEY = 'suhaeng';

/**
 * 라운드 상한(§10.2 P8 「재추천(round 배제 + 상한 3)」).
 *
 * **세는 단위는 "라운드"다** — 최초 추천이 round 1이고 재추천 2회로 round 3까지 간다.
 * §9.2 상한 표의 `주제 재추천 | 3회`를 "재추천만 3회(=총 4라운드)"로 읽으면 같은 절의
 * 단가 근거(`5(vision) + 3(재추천) + 3(설계) + 3(평가)`)와 어긋난다 — 설계·평가가
 * `재생성 2회 = 총 3호출`로 계산된 것과 같은 셈법을 적용하면 주제도 **총 3호출**이다.
 * §10.2 P8의 「상한 3」과 이 단가 근거가 일치하므로 총 3라운드로 확정한다.
 */
const MAX_ROUNDS = 3;

/**
 * 모델 호출 총 예산. `generateWithRetry`의 과부하 재시도와 아래 구조 재시도가 **모두**
 * 이 한 신호를 공유하므로 시한은 시도당이 아니라 총합이다(gemini.js `abortSignal` 주석).
 * 플랫폼이 함수를 죽이기 전에 우리가 502를 만들어 돌려주는 것이 목적이다.
 */
const MODEL_TIMEOUT_MS = 50 * 1000;

/** 구조 실패(절단·파싱 실패·계약 위반) 시 재시도 횟수. §8.4 「1회 재요청 후 실패 처리」. */
const STRUCTURE_RETRY = 1;

/** 카드 부제 — 모델 산출물이 아니라 서버 고정 문자열이다(§8.3 `subtitle`, §13). */
const TOPIC_SUBTITLE = '통합 수행평가 설계 리포트';

/** 태그 4번째 칸 고정 문자열(§5.10 `고1 / 국어/공통국어1 / 의학 / 설계 리포트`). */
const TOPIC_TAG_SUFFIX = '설계 리포트';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_COLUMNS = [
  'id',
  'profile_id',
  'status',
  'current_step',
  'completed_steps',
  'grade_label',
  'semester',
  'school_type',
  'subject_group',
  'subject',
  'career_goal',
  'previous_topic',
  'guide_input_mode',
  'guide_freetext',
  'guide_json'
].join(',');

function fail(res, status, code, message, extra) {
  return res.status(status).json({ error: { code, message }, ...extra });
}

/**
 * 프롬프트에 넣을 안내문 본문. STEP2가 두 갈래(업로드/직접 입력)이므로 세션이 기록한
 * `guide_input_mode`를 정본으로 읽되, 반대편 컬럼도 폴백으로 본다 — 사용자가 업로드 후
 * 직접 입력으로 갈아탄 세션에서 빈 문자열이 프롬프트에 들어가는 것을 막기 위함이다.
 *
 * `guide_json`은 P7 시점에 **평문을 담는 봉투**다(`analyze-guide.js`의 `{mode,text,…}`).
 * §8.4의 안내문 스키마로 승격되면 이 함수가 그 구조를 평문으로 펴는 자리가 된다.
 */
function readAssessmentText(sessionRow) {
  const guideJson = sessionRow.guide_json && typeof sessionRow.guide_json === 'object'
    ? sessionRow.guide_json
    : null;

  const fromUpload = String(guideJson?.text || '').trim();
  const fromManual = String(sessionRow.guide_freetext || '').trim();

  return sessionRow.guide_input_mode === 'manual'
    ? fromManual || fromUpload
    : fromUpload || fromManual;
}

/**
 * STEP3 진입 표시. **`completed_steps`에 3을 넣지 않는다** — 3(주제 추천)이 끝나는
 * 시점은 추천을 받은 순간이 아니라 사용자가 상세 모달에서 주제를 확정하는 순간이고
 * (§5.11, §3.3 활성 스텝 표에서 `3754:4872` 상세 모달까지가 스텝 3이다), 그 확정은
 * `session.js` PATCH / `design-report`(P10)가 기록한다.
 * 여기서 하는 일은 진행을 3보다 앞으로 되돌리지 않는 것뿐이다.
 */
function stepPatch(sessionRow) {
  return {
    status: sessionRow.status === 'draft' ? 'in_progress' : sessionRow.status,
    current_step: Math.max(Number(sessionRow.current_step) || 1, 3)
  };
}

/** 카드 태그 4종. 전부 세션 파생값이며 모델 산출물이 아니다(§8.3 `tags`, §13). */
function buildTags(sessionRow) {
  const subjectText = [sessionRow.subject_group, sessionRow.subject]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('/');

  return [
    String(sessionRow.grade_label || '').trim(),
    subjectText,
    String(sessionRow.career_goal || '').trim(),
    TOPIC_TAG_SUFFIX
  ].filter(Boolean);
}

/**
 * 모델 JSON → `performance_topics.detail`(6요소 고정 배열).
 *
 * 스키마는 `title` + 6필드를 required로 잡고 있으므로 여기서 하는 일은 **순서 고정**과
 * 공백 정리뿐이다. 순서·라벨의 정본은 `TOPIC_DETAIL_SECTIONS`(시안 `3754:4872` 실측)이며
 * 모델이 필드를 어떤 순서로 내든 렌더 순서는 여기서 정해진다.
 */
function buildDetail(topic) {
  return TOPIC_DETAIL_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    text: String(topic[section.id] || '').trim()
  }));
}

/**
 * 구조화 응답 검증. 통과 기준은 **3건 + 각 건의 title·6필드가 전부 비어 있지 않을 것**
 * 하나뿐이다. 정규식도, 헤더 보정도, 블록 카운팅도 없다(§8.4).
 *
 * 빈 문자열을 통과시키지 않는 이유: `responseSchema`의 required는 **키의 존재**만
 * 보장하고 값이 `""`인 것을 막지 못한다. 빈 값이 통과하면 상세 모달에 라벨만 있고 본문이
 * 없는 섹션이 뜬다 — 회차를 태운 뒤에 발견되는 종류의 하자라 차감 **전에** 걸러야 한다.
 *
 * @returns {{ok: true, topics: object[]} | {ok: false, reason: string}}
 */
function validateTopicsPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'not-an-object' };
  }

  const topics = payload.topics;
  if (!Array.isArray(topics) || topics.length !== 3) {
    return { ok: false, reason: `topics-length:${Array.isArray(topics) ? topics.length : 'none'}` };
  }

  const keys = ['title', ...TOPIC_DETAIL_SECTIONS.map((section) => section.id)];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    if (!topic || typeof topic !== 'object') {
      return { ok: false, reason: `topic-${i + 1}:not-an-object` };
    }

    for (const key of keys) {
      if (!String(topic[key] || '').trim()) {
        return { ok: false, reason: `topic-${i + 1}:empty-${key}` };
      }
    }
  }

  return { ok: true, topics };
}

/** 응답에 실을 주제 카드 1장. DB 행과 같은 모양이라 저장 전/후 형태가 갈리지 않는다. */
function toClientTopic(row) {
  return {
    id: row.id,
    round: row.round,
    idx: row.idx,
    title: row.title,
    subtitle: row.subtitle,
    tags: Array.isArray(row.tags) ? row.tags : [],
    detail: Array.isArray(row.detail) ? row.detail : [],
    selected: row.selected === true
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return fail(res, 405, 'METHOD_NOT_ALLOWED', 'POST만 허용됩니다.');
  }

  res.setHeader('Cache-Control', 'no-store');

  let supabaseAdmin;
  try {
    supabaseAdmin = createSupabaseAdmin();
  } catch (error) {
    console.error('performance/recommend-topics 설정 오류:', error);
    return fail(res, 500, 'INTERNAL', '서버 설정이 올바르지 않습니다.');
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return fail(res, 401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return fail(res, 401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
    }

    const userId = userData.user.id;

    // ── 이용권 재판정(§8.6 공통 규약). 클라이언트 가드 통과 여부를 신뢰하지 않는다.
    //    회차 **잔여**는 여기서 보지 않는다 — 잔여 판정과 차감은 RPC가 한 트랜잭션에서
    //    같이 해야 두 탭 경쟁에서 갈리지 않는다(§9.3 「멱등 차감」).
    const hasAccess = await hasPaidServiceAccess(supabaseAdmin, userId, SERVICE_CONFIGS[SERVICE_KEY]);
    if (!hasAccess) {
      return fail(res, 403, 'NO_ENTITLEMENT', '유료 이용권을 결제하신 뒤 이용할 수 있습니다.');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';

    if (!UUID_RE.test(sessionId)) {
      return fail(res, 400, 'INVALID_SESSION_ID', 'sessionId가 올바르지 않습니다.');
    }

    // ── 세션 소유권. 없는 세션과 남의 세션을 같은 응답으로 묶어 id 존재 여부가 새지
    //    않게 한다(RPC 단계 1과 같은 취지).
    const { data: sessionRow, error: sessionError } = await supabaseAdmin
      .from('performance_sessions')
      .select(SESSION_COLUMNS)
      .eq('id', sessionId)
      .eq('profile_id', userId)
      .maybeSingle();

    if (sessionError) throw new Error(`세션 조회 실패: ${sessionError.message}`);
    if (!sessionRow) {
      return fail(res, 403, 'NOT_SESSION_OWNER', '세션을 찾을 수 없습니다.');
    }

    // ── STEP1/STEP2 선행 조건. 여기서 막지 않으면 `미입력`투성이 프롬프트가 회차를
    //    태우고 쓸모없는 주제 3건을 돌려준다. 둘 다 **무차감**이다.
    const missingBasic = ['grade_label', 'semester', 'subject_group', 'subject', 'career_goal']
      .find((column) => !String(sessionRow[column] || '').trim());

    if (missingBasic) {
      return fail(res, 400, 'SESSION_INCOMPLETE', '기본 정보를 먼저 입력해 주세요.', {
        step: 1,
        field: missingBasic,
        charged: false
      });
    }

    const assessmentText = readAssessmentText(sessionRow);
    if (!assessmentText) {
      return fail(res, 400, 'GUIDE_REQUIRED', '수행평가 안내문을 먼저 입력해 주세요.', {
        step: 2,
        charged: false
      });
    }

    // ── 라운드 결정. 기존 라운드를 세어 다음 값을 정한다. 클라이언트가 `round`를 보내면
    //    **의도 확인용으로만** 쓴다(§8.6 계약의 `round?`):
    //      · 이미 있는 라운드 → 그 라운드의 저장된 결과를 그대로 돌려준다(재요청 멱등).
    //        더블클릭·새로고침이 모델을 다시 부르지 않게 하는 것이 목적이다.
    //      · 그 밖의 값 → 400. 서버가 정한 다음 라운드와 어긋나는 요청은 거부한다.
    const { data: existingTopics, error: existingError } = await supabaseAdmin
      .from('performance_topics')
      .select('id,round,idx,title,subtitle,tags,detail,selected')
      .eq('session_id', sessionRow.id)
      .order('round', { ascending: true })
      .order('idx', { ascending: true });

    if (existingError) throw new Error(`기존 주제 조회 실패: ${existingError.message}`);

    const priorTopics = existingTopics || [];
    const lastRound = priorTopics.reduce((max, row) => Math.max(max, Number(row.round) || 0), 0);
    const nextRound = lastRound + 1;

    const requestedRoundRaw = body.round;
    let requestedRound = null;
    if (requestedRoundRaw !== undefined && requestedRoundRaw !== null && requestedRoundRaw !== '') {
      requestedRound = Number(requestedRoundRaw);
      if (!Number.isInteger(requestedRound) || requestedRound < 1) {
        return fail(res, 400, 'INVALID_ROUND', 'round 값이 올바르지 않습니다.', { charged: false });
      }
    }

    if (requestedRound !== null && requestedRound <= lastRound) {
      // 이미 만든 라운드 재요청 = 모델 미호출·미차감 재생(replay).
      const replay = priorTopics
        .filter((row) => Number(row.round) === requestedRound)
        .map(toClientTopic);

      // 차감 RPC를 부르지 않는 경로라 잔여 회차는 읽기 전용 스냅샷으로 채운다.
      // 여기서 null을 돌려주면 §5.20 배너가 "정보 없음"으로 떨어진다.
      let quota = readQuotaSnapshot(null);
      try {
        quota = readQuotaSnapshot(
          await findProgramAccessRow(supabaseAdmin, userId, SERVICE_CONFIGS[SERVICE_KEY])
        );
      } catch (quotaError) {
        console.error('performance/recommend-topics quota lookup 실패(무시):', quotaError);
      }

      return res.status(200).json({
        round: requestedRound,
        topics: replay,
        quotaRemaining: quota.quotaRemaining,
        charged: false,
        reused: true,
        maxRounds: MAX_ROUNDS
      });
    }

    if (requestedRound !== null && requestedRound !== nextRound) {
      return fail(res, 400, 'INVALID_ROUND', '요청한 회차가 진행 상태와 맞지 않습니다.', {
        expectedRound: nextRound,
        charged: false
      });
    }

    // ── 상한(§9.2 상한 표 · §10.2 P8). **무차감**이다 — 남용 방지는 회차를 더 깎는 대신
    //    거부로 처리한다(§9.2 「과금과 남용 방지를 분리한다」).
    if (nextRound > MAX_ROUNDS) {
      return fail(res, 409, 'ROUND_LIMIT', `주제 추천은 최대 ${MAX_ROUNDS}회까지 받을 수 있어요.`, {
        round: lastRound,
        maxRounds: MAX_ROUNDS,
        charged: false
      });
    }

    const previousTopic = String(sessionRow.previous_topic || '').trim() || NO_PREVIOUS_TOPIC_TEXT;
    const gradeLabel = String(sessionRow.grade_label || '').trim();
    const subject = String(sessionRow.subject || '').trim();
    const career = String(sessionRow.career_goal || '').trim();

    // ── RAG 2소스. 둘 다 **프롬프트 보조 입력**이라 비어도 진행한다(dev 지식베이스가
    //    0행이면 `관련 위닝DB 항목 없음`이 렌더되는 것이 정상이다).
    //    `loadRelevantStudentSessions`는 내부에서 검색 실패를 빈 배열로 흡수하지만
    //    `profileId` 누락은 프로그래밍 오류로 던지므로 여기서만 감싼다.
    const knowledge = await loadDynamicAssessmentKnowledge({
      supabase: supabaseAdmin,
      grade: gradeLabel,
      subject,
      career,
      selectedTopic: previousTopic,
      assessmentInfo: assessmentText,
      purpose: 'topic',
      maxItems: 6,
      maxChars: TOPIC_MAX_CHARS,
      // 다른 과목 후보가 검색 결과에 들어와야 CROSS_SUBJECT_CONNECTION_GUIDE 11조와
      // 「다른 과목 선배 데이터 활용 규칙」 5조가 사문이 되지 않는다(knowledge.js 주석).
      includeOtherSubjects: true
    });

    let studentSessions = [];
    try {
      studentSessions = await loadRelevantStudentSessions({
        supabase: supabaseAdmin,
        profileId: userId,
        grade: gradeLabel,
        subject,
        career,
        selectedTopic: previousTopic,
        assessmentInfo: assessmentText
      });
    } catch (historyError) {
      console.error('performance/recommend-topics 과거 수행 RAG 실패(무시):', historyError);
    }

    const system = buildTopicRecommendationSystem({
      topicKnowledgeText: knowledge.text,
      studentHistoryText: formatRelevantStudentSessionsForPrompt(
        studentSessions.slice(0, STUDENT_HISTORY_PROMPT_LIMIT),
        subject
      )
    });

    // ── 재추천이면 이전 라운드 주제명을 배제 블록으로 덧붙인다(§8.3 `round` 정의).
    //    원문 작업 지시 8조는 손대지 않고 뒤에 블록만 붙인다 — round 1 프롬프트는
    //    원문과 바이트 동일하다(prompts.js `buildTopicExclusionBlock` 주석).
    const excludedTitles = Array.from(
      new Set(
        priorTopics
          .map((row) => String(row.title || '').trim())
          .filter(Boolean)
      )
    );

    const baseUser = buildTopicRecommendationUser({
      gradeLabel,
      semester: sessionRow.semester,
      schoolType: sessionRow.school_type,
      subjectGroup: sessionRow.subject_group,
      subject,
      career,
      previousTopic,
      assessmentText
    });

    const exclusionBlock = buildTopicExclusionBlock(excludedTitles);
    const userMsg = exclusionBlock ? `${baseUser}\n\n${exclusionBlock}` : baseUser;

    // ── 모델 호출. 실패 형태가 3가지라 각각 다르게 다룬다(§8.4 완화책 ⓑ·ⓒ·ⓓ):
    //      ⓑ maxOutputTokens를 원문 4200에서 상향(prompts.js 근거 주석)
    //      ⓒ finishReason === 'MAX_TOKENS' → **파싱을 시도하지 않고** 재시도
    //      ⓓ 파싱 실패 시 모델 원문을 응답에 싣지 않는다(서버 로그에만 남긴다)
    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), MODEL_TIMEOUT_MS);

    let validated = null;
    let lastFailure = 'unknown';

    try {
      for (let attempt = 0; attempt <= STRUCTURE_RETRY; attempt++) {
        const isRetry = attempt > 0;

        let response;
        try {
          response = await generateWithRetry({
            model: PERFORMANCE_MODEL,
            contents: userMsg,
            config: {
              systemInstruction: system,
              // 재시도는 원문 재시도와 같은 취지로 온도를 낮춘다
              // (`suhaengpyeong/api/recommend-topics.js:221` — 0.25 → 0.2).
              temperature: isRetry ? 0.2 : TOPIC_GENERATION_DEFAULTS.temperature,
              // 같은 상한으로 다시 부르면 같은 자리에서 다시 잘린다 → 올려서 재시도.
              maxOutputTokens: isRetry
                ? TOPIC_MAX_OUTPUT_TOKENS_RETRY
                : TOPIC_GENERATION_DEFAULTS.maxOutputTokens,
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
              responseSchema: TOPIC_RECOMMENDATION_SCHEMA,
              abortSignal: abortController.signal
            }
          });
        } catch (modelError) {
          // 과부하 재시도(700ms×2^n, 2회)는 generateWithRetry가 이미 소진했다.
          // 여기까지 오면 상류가 실제로 죽었거나 우리 시한이 끝난 것이다. **무차감**.
          console.error('performance/recommend-topics 모델 호출 실패:', modelError);
          return fail(res, 503, 'MODEL_UNAVAILABLE', '주제를 추천하지 못했어요. 잠시 후 다시 시도해 주세요.', {
            charged: false
          });
        }

        const finishReason = response?.candidates?.[0]?.finishReason;

        // ⓒ — 절단된 응답은 파싱하지 않는다. 결함 ①(숫자 리터럴 반복 루프)과
        //      ②(무작위 중간 절단)의 공통 징후이며, 반쯤 온 JSON을 어떻게든 살리려는
        //      시도가 곧 §8.4가 금지한 텍스트 수술이다.
        if (finishReason === 'MAX_TOKENS') {
          lastFailure = 'finish-reason:MAX_TOKENS';
          console.warn(`performance/recommend-topics MAX_TOKENS 절단 (attempt ${attempt + 1})`);
          continue;
        }

        if (finishReason && finishReason !== 'STOP') {
          lastFailure = `finish-reason:${finishReason}`;
          console.warn(`performance/recommend-topics 비정상 종료 ${finishReason} (attempt ${attempt + 1})`);
          continue;
        }

        const rawText = String(response?.text || '').trim();
        if (!rawText) {
          lastFailure = 'empty-response';
          continue;
        }

        let parsed;
        try {
          // 유일한 파싱이다. `responseMimeType:'application/json'`이 형식을 보장하므로
          // 코드펜스 제거·헤더 보정 같은 전처리를 두지 않는다(§8.4).
          parsed = JSON.parse(rawText);
        } catch (parseError) {
          lastFailure = 'json-parse-failed';
          // ⓓ — 원문은 서버 로그에만 남긴다. 응답 본문에는 싣지 않는다.
          console.error('performance/recommend-topics JSON 파싱 실패:', parseError?.message, rawText.slice(0, 400));
          continue;
        }

        const check = validateTopicsPayload(parsed);
        if (!check.ok) {
          lastFailure = `contract:${check.reason}`;
          console.warn(`performance/recommend-topics 계약 위반 ${check.reason} (attempt ${attempt + 1})`);
          continue;
        }

        validated = check.topics;
        break;
      }
    } finally {
      clearTimeout(abortTimer);
    }

    if (!validated) {
      // 재시도까지 실패. **무차감**이다(§8.4 「검증 실패 시 1회 재요청 후 실패 처리,
      // 회차는 차감하지 않는다」). 사용자에게는 모델 원문 대신 안내만 준다(ⓓ).
      console.error(`performance/recommend-topics 계약 위반 확정: ${lastFailure}`);
      return fail(res, 422, 'MODEL_CONTRACT_VIOLATION', '주제를 정리하지 못했어요. 다시 시도해 주세요.', {
        charged: false
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // 여기부터가 차감 구간이다. 위에서 3건을 확보한 **뒤에만** 도달한다.
    // ─────────────────────────────────────────────────────────────────
    const { data: creditRaw, error: creditError } = await supabaseAdmin.rpc(
      'consume_performance_credit',
      {
        p_session_id: sessionRow.id,
        p_profile_id: userId,
        p_reason: 'recommend-topics:first-success'
      }
    );

    if (creditError) {
      // fail-closed(§9.3 5항) — 차감을 커밋하지 못했으면 산출물을 내보내지 않는다.
      console.error('performance/recommend-topics 차감 RPC 실패:', creditError);
      return fail(res, 500, 'INTERNAL', '주제 추천 처리에 실패했습니다.');
    }

    const credit = creditRaw && typeof creditRaw === 'object' ? creditRaw : {};
    const creditStatus = String(credit.status || '');

    if (creditStatus === 'quota_exhausted') {
      // §5.20 (B) 인라인 소진 카드가 이 응답을 받아 AiLoadingBubble을 대체한다.
      // 표현은 사용량이 아니라 **잔여량** 기준이다(§9.3 「소진 응답 계약」).
      return fail(res, 409, 'QUOTA_EXHAUSTED', '이용 가능한 횟수를 모두 사용했어요.', {
        quotaRemaining: 0,
        planEndsAt: credit.plan_ends_at ?? null,
        charged: false
      });
    }

    if (creditStatus === 'no_entitlement') {
      return fail(res, 403, 'NO_ENTITLEMENT', '유료 이용권을 결제하신 뒤 이용할 수 있습니다.', {
        charged: false
      });
    }

    if (creditStatus === 'entitlement_expired') {
      // RPC가 돌려주는 5번째 상태다(sql/54 (4) 단계 6). 이용권 기간 만료·환불·정지는
      // "권한 없음"과 원인이 다르므로 코드를 갈라 §5.20이 다른 문구를 쓸 수 있게 한다.
      return fail(res, 403, 'ENTITLEMENT_EXPIRED', '이용권 사용 기간이 끝났어요.', {
        planEndsAt: credit.plan_ends_at ?? null,
        charged: false
      });
    }

    if (creditStatus === 'session_not_found') {
      return fail(res, 403, 'NOT_SESSION_OWNER', '세션을 찾을 수 없습니다.', { charged: false });
    }

    // `charged` = 이번 요청이 실제로 회차를 깎았는가.
    // `already_charged`는 **재추천의 정상 경로**다(§9.3) — 같은 세션의 원장 행이 이미
    // 있다는 뜻이고, 그 멱등성은 `performance_credit_ledger.session_id` UNIQUE가 보장한다.
    if (creditStatus !== 'charged' && creditStatus !== 'already_charged') {
      console.error('performance/recommend-topics 알 수 없는 차감 상태:', creditStatus);
      return fail(res, 500, 'INTERNAL', '주제 추천 처리에 실패했습니다.');
    }

    const charged = credit.charged === true;
    const quotaRemaining = credit.quota_remaining ?? null;

    // ── 저장. 라운드당 3행이며 `(session_id, round, idx)` UNIQUE가 재시도로 인한
    //    중복 저장을 막는다(sql/54 1-4).
    const rows = validated.map((topic, index) => ({
      session_id: sessionRow.id,
      round: nextRound,
      idx: index + 1,
      title: String(topic.title || '').trim(),
      subtitle: TOPIC_SUBTITLE,
      tags: buildTags(sessionRow),
      detail: buildDetail(topic),
      selected: false
    }));

    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from('performance_topics')
      .insert(rows)
      .select('id,round,idx,title,subtitle,tags,detail,selected');

    if (insertError) throw new Error(`주제 저장 실패: ${insertError.message}`);

    const { error: sessionUpdateError } = await supabaseAdmin
      .from('performance_sessions')
      .update(stepPatch(sessionRow))
      .eq('id', sessionRow.id);

    // 진행 표시 갱신 실패로 이미 차감된 요청을 실패로 뒤집지 않는다. 주제는 저장됐고
    // 재방문 시 `deriveStep`(P13)이 실제 데이터로 단계를 다시 계산한다.
    if (sessionUpdateError) {
      console.error('performance/recommend-topics 세션 단계 갱신 실패(무시):', sessionUpdateError);
    }

    return res.status(200).json({
      round: nextRound,
      topics: (insertedRows || [])
        .sort((a, b) => a.idx - b.idx)
        .map(toClientTopic),
      quotaRemaining,
      charged,
      maxRounds: MAX_ROUNDS,
      promptVersion: TOPIC_PROMPT_VERSION,
      model: PERFORMANCE_MODEL,
      knowledge: {
        source: knowledge.source,
        hitCount: knowledge.hitCount,
        degraded: knowledge.degraded,
        studentHistoryCount: Math.min(studentSessions.length, STUDENT_HISTORY_PROMPT_LIMIT)
      }
    });
  } catch (error) {
    // 원 예외 메시지를 응답에 싣지 않는다(§8.6 공통 규약 「실패 응답」).
    console.error('performance/recommend-topics error:', error);
    return fail(res, 500, 'INTERNAL', '주제 추천에 실패했습니다.');
  }
}
