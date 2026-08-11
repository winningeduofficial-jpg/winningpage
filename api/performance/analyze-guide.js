// POST /api/performance/analyze-guide
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { sessionId, attachmentIds[] (1~5) }  또는  { sessionId, freetext }
//     — **storage path를 받지 않는다**
//   → 200 { guide, attachments[{attachmentId,deleted}], promptVersion, model, charged:false }
//   → 403 { error:{code:'NOT_ATTACHMENT_OWNER'} }
//   → 404 { error:{code:'ATTACHMENT_GONE'} }
//   → 422 { error:{code:'GUIDE_PARSE_FAILED'} }   (무차감)
//   → 502 { error:{code:'VISION_UPSTREAM_FAILED'} } (무차감)
//
// ── 이 파일이 하는 일 (STEP2 안내문 입력의 종착점)
//    두 분기가 한 엔드포인트로 들어온다 — §8.6 요청 칸이 그렇게 쓰여 있다.
//      ⓐ 업로드 분기: 이미 Storage에 올라간 첨부 N장을 **단일 vision 호출**로 분석해
//         `performance_sessions.guide_json`에 넣는다(`guide_input_mode='upload'`).
//      ⓑ 직접 입력 분기(§5.8): 모델을 호출하지 않는다. 자유서술 원문을 그대로
//         `guide_freetext`에 넣는다(`guide_input_mode='manual'`).
//    둘 다 STEP2 완료로 보고 `current_step`/`completed_steps`를 3/[…,2]로 올린다.
//
// ── IDOR을 막는 방식 (§8.8 BLOCK — 이식 금지 항목)
//    외부 `analyze-assessment-storage.js`는 `image_path`를 요청 본문 그대로 받아(`:41-51`)
//    검증 없이 download(`:68`)·remove(`:120`)하고 내용을 응답(`:136`)했다. 유효한 세션
//    하나만 있으면 버킷 내 임의 경로를 읽어 반출하고 삭제까지 시킬 수 있었다.
//
//    여기서는 **경로 문자열이 클라이언트 → 서버 방향으로 흐르는 통로 자체가 없다.**
//      ① 요청은 `attachmentIds[]`(uuid)만 받는다. `storage_path`/`path`/`mimeType` 같은
//         키가 본문에 섞여 와도 이 핸들러는 꺼내 쓰지 않는다.
//      ② 세션 소유권을 `profile_id = auth.uid()`로 먼저 확인하고,
//      ③ 첨부 조회를 `.eq('session_id', <확인된 세션 id>)`로 **묶어서** 한다. 남의 첨부
//         id를 넣으면 그 행은 애초에 결과에 안 들어오고, 요청 개수와 조회 개수가 어긋나
//         `403 NOT_ATTACHMENT_OWNER`로 떨어진다(존재 여부를 알려주지 않으려고 "없음"과
//         "남의 것"을 같은 코드로 합친다 — upload-url.js의 세션 403과 같은 관례).
//      ④ Storage 접근에 쓰는 경로는 **DB 행의 `storage_path`뿐이다.**
//    `mime_type`도 DB 값만 신뢰한다(§8.3 「업로드 시점 값만 신뢰. 클라이언트가 분석
//    요청에 실어 보내는 값은 무시」).
//
// ── 다중 이미지 = 호출 1회 (§8.8 「다중 분석」 결정)
//    외부는 프론트가 장당 1회씩 호출해(`suhaengpyeong/index.html:1660-1681`) N장 = N회
//    차감이었고, 루프 중간에 실패하면 앞서 성공한 분석과 차감이 모두 유실됐다(`:1690-1694`).
//    여기서는 `contents` 배열에 `inlineData`를 장수만큼 실어 한 번에 보낸다. 실패해도
//    "일부만 분석된 상태"가 생기지 않는다(전부 done이거나 전부 failed).
//    `maxOutputTokens`는 장수 비례다 — 외부 기본 2200은 1장 기준이라 그대로 두면 2장부터
//    출력이 잘린다(§12.3 「비전 호출 파라미터」). 계산은 `api/_lib/performance/gemini.js`가
//    `VISION_MAX_OUTPUT_TOKENS_PER_IMAGE × 장수`로 한다.
//
// ── 원본 이미지를 지우지 않는다 (§8.8 ~~Q52~~ 부결)
//    외부의 `deleteImage`(`:23-32`, 호출 `:120`)는 **이식하지 않는다.** 보관 정본은 90일이고
//    삭제는 `api/performance/cleanup-attachments.js` + Vercel Cron 일 1회의 몫이다.
//    그래서 응답의 `attachments[].deleted`는 이 엔드포인트에서 항상 false다 — 그 값은
//    "이 API가 지웠는가"가 아니라 **행의 `deleted_at` 유무**를 그대로 비춘 것이고, 아직
//    살아 있지 않은 첨부는 아래에서 404로 먼저 걸러진다.
//
// ── 회차는 차감하지 않는다 (§9.2 결정)
//    차감 지점은 주제 추천 최초 성공 1곳뿐이다. 외부는 장당 1회씩 소모해 3장 업로드 =
//    3회가 사라졌다. 응답의 `charged:false`는 그 사실을 계약으로 못박은 것이다.
//    모델 호출이 재시도로 3번 나가도 마찬가지다(재시도는 gemini.js 계층 안, 차감은 밖).

import { createSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import {
  SERVICE_CONFIGS,
  getBearerToken,
  hasPaidServiceAccess
} from '../_lib/serviceAccess.js';
import { callVision, PERFORMANCE_MODEL } from '../_lib/performance/gemini.js';
import {
  GUIDE_EXTRACTION_SYSTEM,
  GUIDE_PROMPT_VERSION,
  buildGuideExtractionUserPrompt
} from '../_lib/performance/prompts.js';
import { BUCKET } from './upload-url.js';

const SERVICE_KEY = 'suhaeng';

/** §8.8 「최대 장수 5장」 — upload-url.js의 상한과 같은 값이다. */
const MAX_ATTACHMENTS = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(res, status, code, message, extra) {
  return res.status(status).json({ error: { code, message }, ...extra });
}

/** STEP2 완료 반영 패치. 이미 더 앞서 있는 세션을 되돌리지 않는다(session.js와 같은 규칙). */
function stepPatch(sessionRow) {
  const completed = new Set(
    Array.isArray(sessionRow.completed_steps) ? sessionRow.completed_steps : []
  );
  completed.add(1);
  completed.add(2);

  return {
    status: sessionRow.status === 'draft' ? 'in_progress' : sessionRow.status,
    current_step: Math.max(sessionRow.current_step || 1, 3),
    completed_steps: Array.from(completed).sort((a, b) => a - b)
  };
}

/** 요청 본문에서 `attachmentIds`를 꺼내 형식 검증한다. 경로 문자열은 쳐다보지도 않는다. */
function readAttachmentIds(body) {
  const raw = body.attachmentIds;
  if (raw === undefined || raw === null) return { present: false };
  if (!Array.isArray(raw) || raw.length === 0) {
    return { present: true, ok: false, message: 'attachmentIds는 1개 이상의 배열이어야 합니다.' };
  }
  if (raw.length > MAX_ATTACHMENTS) {
    return {
      present: true,
      ok: false,
      message: `안내문 사진은 최대 ${MAX_ATTACHMENTS}장까지 분석할 수 있어요.`
    };
  }

  const ids = [];
  for (const value of raw) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!UUID_RE.test(id)) {
      return { present: true, ok: false, message: 'attachmentIds 형식이 올바르지 않습니다.' };
    }
    if (!ids.includes(id)) ids.push(id);
  }

  return { present: true, ok: true, ids };
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
    console.error('performance/analyze-guide 설정 오류:', error);
    return fail(res, 500, 'INTERNAL', '서버 설정이 올바르지 않습니다.');
  }

  // 모델 호출이 터졌을 때 첨부를 failed로 되돌리기 위해 catch 바깥에서 들고 있는다.
  let analyzedIds = null;

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

    // 이용권 재판정 — §8.6 공통 규약. 클라이언트 가드 통과 여부를 신뢰하지 않는다.
    const hasAccess = await hasPaidServiceAccess(supabaseAdmin, userId, SERVICE_CONFIGS[SERVICE_KEY]);
    if (!hasAccess) {
      return fail(res, 403, 'NO_ENTITLEMENT', '유료 이용권을 결제하신 뒤 이용할 수 있습니다.');
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const freetext = typeof body.freetext === 'string' ? body.freetext.trim() : '';
    const attachments = readAttachmentIds(body);

    if (!sessionId) {
      return fail(res, 400, 'MISSING_FIELD', 'sessionId는 필수입니다.', { field: 'sessionId' });
    }

    if (attachments.present && !attachments.ok) {
      return fail(res, 400, 'INVALID_ATTACHMENT_IDS', attachments.message, {
        field: 'attachmentIds'
      });
    }

    // 두 분기는 배타다 — 한 요청이 둘 다 들고 오면 어느 쪽이 세션의 정본인지 계약이
    // 정하지 않으므로 서버가 임의로 고르지 않고 거절한다.
    if (attachments.present && freetext) {
      return fail(
        res,
        400,
        'AMBIGUOUS_INPUT',
        'attachmentIds와 freetext는 함께 보낼 수 없습니다.'
      );
    }

    if (!attachments.present && !freetext) {
      return fail(res, 400, 'MISSING_FIELD', 'attachmentIds 또는 freetext가 필요합니다.');
    }

    // ── 세션 소유권. service_role 클라이언트라 RLS가 통째로 우회되므로 이
    //    `.eq('profile_id', userId)` 조건이 유일한 방어선이다(upload-url.js와 같은 관례).
    //    세션이 없는 경우와 남의 세션인 경우를 같은 403으로 합친다(존재 오라클 방지).
    const { data: sessionRow, error: sessionError } = await supabaseAdmin
      .from('performance_sessions')
      .select('id,status,current_step,completed_steps')
      .eq('id', sessionId)
      .eq('profile_id', userId)
      .maybeSingle();

    if (sessionError) throw new Error(`세션 조회 실패: ${sessionError.message}`);

    if (!sessionRow) {
      return fail(res, 403, 'NOT_SESSION_OWNER', '이 수행평가 세션에 접근할 수 없습니다.');
    }

    // ─────────────────────────────────────────────────────────────
    // ⓑ 직접 입력 분기 (§5.8) — 모델을 호출하지 않는다
    // ─────────────────────────────────────────────────────────────
    // `guide_json`은 **null로 둔다.** §8.3이 그 컬럼에 준 정의는 "안내문 분석 구조화
    // 결과"이고 이 분기에는 분석이 없다. 자유서술 원문의 자리는 `guide_freetext`다.
    // 하류(P8 주제 추천)는 `guide_input_mode`를 보고 어느 컬럼을 읽을지 정한다.
    if (!attachments.present) {
      const { error: manualError } = await supabaseAdmin
        .from('performance_sessions')
        .update({
          guide_input_mode: 'manual',
          guide_freetext: freetext,
          guide_json: null,
          ...stepPatch(sessionRow)
        })
        .eq('id', sessionRow.id);

      if (manualError) throw new Error(`세션 갱신 실패: ${manualError.message}`);

      return res.status(200).json({
        guide: { mode: 'manual', text: freetext },
        attachments: [],
        promptVersion: null, // 모델을 부르지 않았으므로 프롬프트 버전도 없다
        model: null,
        charged: false
      });
    }

    // ─────────────────────────────────────────────────────────────
    // ⓐ 업로드 분기 — 단일 vision 호출
    // ─────────────────────────────────────────────────────────────

    // 첨부 조회는 **세션에 묶어서** 한다. 이 `.eq('session_id', ...)`가 IDOR 차단의 핵심이다.
    // 정렬은 업로드 순서(`created_at`)로 고정한다 — 요청 배열 순서를 따르면 클라이언트가
    // 페이지 순서를 흔들 수 있고, 안내문은 장 순서가 곧 문서 순서다.
    const { data: attachmentRows, error: attachmentError } = await supabaseAdmin
      .from('performance_attachments')
      .select('id,storage_path,mime_type,deleted_at')
      .eq('session_id', sessionRow.id)
      .in('id', attachments.ids)
      .order('created_at', { ascending: true });

    if (attachmentError) throw new Error(`첨부 조회 실패: ${attachmentError.message}`);

    const rows = attachmentRows || [];

    if (rows.length !== attachments.ids.length) {
      // "없는 id"와 "남의 세션 id"를 구분해 알려주지 않는다(존재 오라클 방지).
      return fail(res, 403, 'NOT_ATTACHMENT_OWNER', '이 안내문 사진에 접근할 수 없습니다.');
    }

    // 90일 cron이나 24시간 TTL 스윕이 이미 원본을 지운 행. 경로가 무효 포인터이므로
    // 분석할 대상이 없다(§8.3 `storage_path` nullable 사유).
    if (rows.some((row) => row.deleted_at || !row.storage_path)) {
      return fail(res, 404, 'ATTACHMENT_GONE', '안내문 사진 원본이 이미 삭제되었어요.');
    }

    analyzedIds = rows.map((row) => row.id);

    // ── 다운로드. 경로는 오직 DB 행의 값이다(요청 본문에서 온 문자열이 아니다).
    const images = [];
    for (const row of rows) {
      const { data: blob, error: downloadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .download(row.storage_path);

      if (downloadError || !blob) {
        // 행은 살아 있는데 객체가 없다 = 업로드 토큰만 받고 파일을 올리지 않았거나
        // 버킷 쪽에서 사라진 경우다. 되살릴 수 없으니 failed로 닫고 404로 알린다.
        console.error('performance/analyze-guide 원본 다운로드 실패:', downloadError);
        await markAttachmentsFailed(supabaseAdmin, analyzedIds);
        return fail(res, 404, 'ATTACHMENT_GONE', '안내문 사진 원본을 찾을 수 없어요.');
      }

      images.push({
        data: Buffer.from(await blob.arrayBuffer()),
        // 업로드 시점에 서버가 검증해 저장한 값만 쓴다(§8.3). 요청 본문의 mime은 무시.
        mimeType: row.mime_type || 'image/jpeg'
      });
    }

    // ── 단일 vision 호출. maxOutputTokens는 gemini.js가 장수 비례로 잡는다.
    let text;
    try {
      text = await callVision(
        GUIDE_EXTRACTION_SYSTEM,
        images,
        buildGuideExtractionUserPrompt(images.length)
      );
    } catch (modelError) {
      console.error('performance/analyze-guide vision 호출 실패:', modelError);
      await markAttachmentsFailed(supabaseAdmin, analyzedIds);
      // 무차감이다(§9.2) — 애초에 이 엔드포인트는 차감하지 않는다.
      return fail(res, 502, 'VISION_UPSTREAM_FAILED', '안내문을 분석하지 못했어요. 잠시 후 다시 시도해 주세요.', {
        charged: false
      });
    }

    const guideText = String(text || '').trim();

    if (!guideText) {
      // 호출은 성공했는데 내용이 비었다 — 재시도로 풀릴 문제가 아니므로 422다.
      await markAttachmentsFailed(supabaseAdmin, analyzedIds);
      return fail(res, 422, 'GUIDE_PARSE_FAILED', '안내문에서 정보를 읽지 못했어요. 사진을 다시 확인해 주세요.', {
        charged: false
      });
    }

    // ── 저장. `guide_json`은 지금 단계에서 **평문을 담는 봉투**다.
    //    §8.4의 안내문 스키마(basicInfo/rubric/answerQuestions…)로 승격하는 것은 이후
    //    슬라이스의 구조화 출력 전환 몫이고(P7의 이식 계약은 원본 그대로의 평문이다),
    //    그때 `promptVersion`이 `guide-v1`에서 올라가므로 어느 봉투가 어느 계약으로
    //    만들어졌는지 이 필드 하나로 구분된다.
    const guide = {
      mode: 'upload',
      text: guideText,
      pageCount: images.length,
      promptVersion: GUIDE_PROMPT_VERSION,
      model: PERFORMANCE_MODEL,
      analyzedAt: new Date().toISOString()
    };

    const { error: sessionUpdateError } = await supabaseAdmin
      .from('performance_sessions')
      .update({
        guide_input_mode: 'upload',
        guide_json: guide,
        ...stepPatch(sessionRow)
      })
      .eq('id', sessionRow.id);

    if (sessionUpdateError) throw new Error(`세션 갱신 실패: ${sessionUpdateError.message}`);

    // `ocr_text`는 §8.3이 "장별 원문"으로 정의했지만, 단일 호출 통합(§8.8)에서는 장별로
    // 쪼갠 원문이 존재하지 않는다 — 모델이 N장을 종합해 한 벌을 낸다. 분석에 참여한
    // 모든 행에 같은 통합 텍스트를 남겨(포렌식용) 행 단위 상태와 내용이 어긋나지 않게 한다.
    // 읽기 정본은 어차피 `performance_sessions.guide_json`이다.
    const { error: markError } = await supabaseAdmin
      .from('performance_attachments')
      .update({ ocr_status: 'done', ocr_text: guideText })
      .in('id', analyzedIds);

    if (markError) throw new Error(`첨부 상태 갱신 실패: ${markError.message}`);

    return res.status(200).json({
      guide,
      // `deleted`는 행의 `deleted_at`을 비춘 값이다. 위에서 원본 생존을 이미 확인했으므로
      // 여기서는 전부 false다 — **이 API는 원본을 지우지 않는다**(§8.8, 파일 상단 주석).
      attachments: analyzedIds.map((attachmentId) => ({ attachmentId, deleted: false })),
      promptVersion: GUIDE_PROMPT_VERSION,
      model: PERFORMANCE_MODEL,
      charged: false
    });
  } catch (error) {
    // 원 예외 메시지를 응답에 싣지 않는다(§8.6 공통 규약 「실패 응답」).
    console.error('performance/analyze-guide error:', error);
    if (analyzedIds) await markAttachmentsFailed(supabaseAdmin, analyzedIds);
    return fail(res, 500, 'INTERNAL', '안내문 분석에 실패했습니다.');
  }
}

/**
 * 분석에 실패한 첨부를 `ocr_status='failed'`로 닫는다.
 *
 * **원본 파일은 건드리지 않는다** — 실패는 재시도 여지가 있고, 보관 정책상 삭제 권한은
 * 90일 cron에만 있다(§8.8). 이 갱신이 또 실패해도 사용자에게 돌려줄 응답을 바꾸지
 * 않는다(이미 결정된 실패다). 로그만 남긴다.
 */
async function markAttachmentsFailed(supabaseAdmin, ids) {
  if (!ids?.length) return;

  try {
    const { error } = await supabaseAdmin
      .from('performance_attachments')
      .update({ ocr_status: 'failed' })
      .in('id', ids);

    if (error) throw error;
  } catch (error) {
    console.error('performance/analyze-guide 첨부 failed 마킹 실패:', error);
  }
}
