import { forwardRef, useEffect, useRef, useState } from 'react';
import { useSession } from '../../context/SessionContext';
import ChatTimeline from '../../components/performance/chat/ChatTimeline';
import AiLoadingBubble from '../../components/performance/chat/AiLoadingBubble';
import InlineCard from '../../components/performance/chat/InlineCard';
import { PERFORMANCE_LOADING_COPY } from '../../components/performance/chat/loadingCopy';
import BasicInfoForm from '../../components/performance/step1/BasicInfoForm';
import GuideUploadCard from '../../components/performance/step2/GuideUploadCard';
import ManualInfoForm from '../../components/performance/step2/ManualInfoForm';
import TopicCardList from '../../components/performance/step3/TopicCardList';
import TopicDetailModal from '../../components/performance/step3/TopicDetailModal';
import DesignReportModal from '../../components/performance/step4/DesignReportModal';
import EvaluationReportModal from '../../components/performance/step5/EvaluationReportModal';
import EvaluationBranchActions from '../../components/performance/step5/EvaluationBranchActions';
import SubmissionForm from '../../components/performance/step5/SubmissionForm';
import QuotaExhaustedCard from '../../components/performance/quota/QuotaExhaustedCard';
import {
  analyzeGuideUpload,
  submitManualGuide,
  uploadGuidePhotos
} from '../../lib/performance/guideUpload';
import { recommendTopics } from '../../lib/performance/topics';
import { requestDesignReport } from '../../lib/performance/designReport';
import { finalizeSubmission, requestEvaluation } from '../../lib/performance/evaluation';
import { fetchSubmissionForm, saveSubmission } from '../../lib/performance/submission';

// STEP1~STEP3 화면 — docs/수행평가-상세-명세.md §5.5(`3754:3206`) / §5.6(`3754:3261`) /
// §5.7(`3754:3315`) / §5.8(`3754:3370`·`3754:3431`) / §5.9(`3754:3562`·`3754:3493`) /
// §5.10(`3754:3629`·`3754:3746`) / §5.20(시안 없음) 문구 원문 조립.
// `App.jsx`의 `/app/performance` 라우트가 `PerformancePlaceholder` 대신 이 컴포넌트를 쓴다.
//
// **이 페이지가 하는 일**: bootstrap으로 인사말에 쓸 이름을 얻고, 타임라인을 단계별로
// 누적하면서 네 개의 서버 호출을 붙인다 —
//   STEP1 제출 → `POST /api/performance/session`
//   STEP2 업로드 분기 → `upload-url` ×N → `uploadToSignedUrl` ×N → `analyze-guide`
//                       (묶음 처리와 실패 롤백은 `src/lib/performance/guideUpload.js`)
//   STEP2 직접 입력 분기 → `analyze-guide`의 `{ sessionId, freetext }` 분기
//   STEP3 주제 추천 → `POST /api/performance/recommend-topics`
//                     (호출·실패 분류는 `src/lib/performance/topics.js`)
//
// **타임라인 누적 규칙**(§5.6/§5.8/§5.9 실측)
//   · STEP1 폼 카드는 세션이 만들어지면 사라지고, 그 자리에 입력 요약 **사용자 말풍선**이
//     들어간다(`3754:3261`에 폼 카드가 없다).
//   · `안내문 없이 시작하기`를 누르면 **업로드 카드가 타임라인에서 제거되고**(축소·비활성
//     잔존이 아니라 노드 자체가 없다) 직전 AI2 말풍선은 그대로 남으며, 사용자 말풍선
//     `안내문 없이 시작할게요` + AI3 + 직접 입력 폼이 이어 붙는다(§5.8 단정).
//   · STEP2를 제출하면 **직접 입력 경로에 한해** 폼 카드와 **직전 AI3 말풍선까지 함께**
//     타임라인에서 빠진다(§5.9 단정 — `3754:3493`에 둘 다 없다. AI2 안내 말풍선은 남는다).
//     업로드 경로(`3754:3562`)는 애초에 AI3가 없고 업로드 카드만 빠진다.
//   · 제출 결과는 사용자 말풍선으로 남는다 — 업로드 경로는 `안내문 {n}장을 업로드했어요`
//     (§5.9 제안대로 장수 동적 치환), 직접 입력 경로는 입력한 원문 그대로다(`3754:3493`).
//
// **이 페이지가 안 하는 일 (다음 슬라이스 몫)**:
//   · §5.3/§5.4 재방문 분기(이어서 하기/새로 시작하기) — P13. 여기서는 `lastSession`/
//     `latestDraft` 유무와 무관하게 항상 STEP1 인사말+폼을 그대로 보여준다.
//   · 이전 값 프리필 — P13. `initialValues`를 비워 둔 채로 `BasicInfoForm`에 넘긴다.
//   · §5.11 주제 상세 모달은 P9에서 배선했다 — 카드 `onDetail` → `TopicDetailModal` 오픈,
//     `이 주제로 확정하기` → `handleConfirmTopic`.
//   · §5.20 (A) 셸 상단 회차 배너 — 셸(`PerformanceAppLayout`) 소관이라 여기서 만들지 않는다.
//     이 페이지가 담당하는 것은 (B) 인라인 소진 카드뿐이다.
//
// **STEP4(§5.12·§5.13, P10에서 배선)**
//   확정 → `POST /api/performance/design-report`(주제 확정 + 리포트 생성이 서버에서 한
//   트랜잭션) → 성공 시 `DesignReportModal` 자동 오픈. 호출·실패 분류는
//   `src/lib/performance/designReport.js`.

// §5.6 문구 원문. 두 줄로 쓰인 그대로 보존한다(`좋아요.` 뒤 줄바꿈).
const GUIDE_INTRO =
  '좋아요.\n수행평가 안내문 사진을 올리거나, 안내문 없이 직접 정보를 입력해서 시작할 수 있습니다.';

// §5.8 문구 원문. 사용자 말풍선과 AI3 안내 — AI3 문구는 직접 입력 폼의 placeholder와
// 완전히 동일하다(§5.8 단정). 중복으로 보고 줄이지 말 것.
const MANUAL_CHOICE = '안내문 없이 시작할게요';
const MANUAL_INTRO = '수행평가 유형, 제출 형식, 평가 기준, 필수 포함 내용 등을 적어주세요.';

// §5.10 문구 원문 — 추천 결과 AI 말풍선. **두 경로가 서로 다른 문구다.**
//
// 업로드 경로(`3754:3629`) 원문에는 가운데에 `제출 형식은 문항형(문항 1~6)으로
// 확인됩니다.` 한 문장이 더 있다. **그 문장은 옮기지 않았다** — 제출 형식 판정
// (`submission_schema` 8종, §8.3·§12.2)은 아직 배선되지 않았고, 시안의 `문항형(문항 1~6)`은
// 특정 더미 안내문에서 나온 값이다. 값을 모르는 상태에서 저 문장을 그대로 렌더하면 모든
// 사용자에게 "문항형 1~6"이라고 **사실이 아닌 단정**을 하게 된다. 제출 형식이 세션에
// 실리는 슬라이스에서 이 자리에 동적 문장으로 되살릴 것.
const TOPIC_RESULT_UPLOAD =
  '안내문을 분석했어요. 조건과 진로를 반영해 주제 3개를 추천했어요.\n마음에 드는 주제를 선택하면 통합 설계 리포트를 바로 만들어드릴게요.';

// 직접 입력 경로(`3754:3746`) 원문 그대로. 시안 각 줄 끝의 trailing space는 옮기지 않는다
// (보이지 않는 공백을 재현할 근거가 없다 — `buildBasicInfoSummary`와 같은 판단).
const TOPIC_RESULT_MANUAL =
  '수행평가 조건과 진로를 바탕으로 주제 3개를 추천했어요.\n각 주제 아래에 선정 근거와 핵심 정보를 함께 정리했습니다.\n마음에 드는 주제를 선택하면 통합 설계 리포트를 바로 만들어드릴게요.';

// 시안 없음 — 제안. `나중에 하기`(§5.20)로 소진 카드를 닫은 뒤 남는 안내다. 카드만 닫고
// 끝내면 화면에 아무 경로도 남지 않아 사용자가 막힌다. §5.20이 문구로 약속한 "입력 내용은
// 유실되지 않는다"를 여기서도 한 번 더 지킨다.
const QUOTA_DISMISSED_COPY =
  '입력한 내용은 그대로 저장돼 있어요. 이용권을 추가하면 이 자리에서 바로 이어서 진행할 수 있습니다.';

/**
 * §5.12 사용자 확정 말풍선 문구 원문. **곡선 따옴표(“ ”)를 쓴다**(§5.12 단정) — 시안이
 * 직선 따옴표가 아니라 U+201C/U+201D를 썼고, 그것이 실측 대상이다.
 */
function buildConfirmBubble(title) {
  return `“${title}”으로 확정할게요`;
}

// 시안 없음 — 제안. §5.13 모달을 닫으면(`창 닫고 작성하기`) 타임라인으로 돌아오는데,
// STEP5 제출폼(§5.14)은 아직 없다. 그 자리에 아무것도 남기지 않으면 방금 만든 리포트로
// 되돌아갈 길이 사라진다 — 리포트가 준비됐다는 사실과 다시 여는 경로를 남긴다.
const DESIGN_READY_COPY =
  '설계 리포트를 만들었어요. 자료・글 구조・작성 방향을 한 번에 정리했으니 확인하고 작성을 시작해 보세요.';

// 시안 없음 — 제안. 실패해도 사용자가 갇히지 않아야 한다는 요구(§5.12 흐름)의 안내문.
const DESIGN_FAILED_FALLBACK = '설계 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.';

/**
 * §5.14 제출폼 AI 안내 원문(`3754:3992`, 빈 줄 포함 4줄). 같은 문구가 `3754:4119`에는
 * 빈 줄 없이 3줄로 있는데(§5.14 단정, §11-Q14) **폼이 처음 나타나는 시점이 빈 상태**이므로
 * 그 노드(`3754:3992`)의 원문을 정본으로 쓴다.
 */
const SUBMISSION_FORM_INTRO = [
  '설계 리포트를 참고해 아래 제출폼을 채워주세요. 안내문에서 읽어낸 문항 구조와 지시문이 그대로 들어가 있어, 안내문을 다시 꺼내 보지 않아도 됩니다.',
  '',
  '문장은 학생이 직접 씁니다. 서비스는 완성된 결과물을 제공하지 않아요.'
].join('\n');

// 시안 없음 — 제안. 제출폼 재료(`GET /api/performance/submission`)를 못 받은 경우.
// 스키마 없이는 무엇을 쓸 칸인지 화면이 알 수 없으므로(§8.3 — 판정은 서버 소유) 임의
// 기본 폼을 그려서는 안 된다. 다시 불러오는 경로만 남긴다.
const SUBMISSION_LOAD_FAILED_FALLBACK = '제출폼을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';

// ── STEP5(§5.15 평가 로딩 / §5.16 평가 리포트 모달 / §5.17 분기 3버튼) 문구 ──────────────

/**
 * 사용자 제출 말풍선. §5.17(`3754:4349`) 문구 원문이며, §5.15 「정본 타임라인」 3번이
 * 평가 로딩 직전에 이 말풍선을 두라고 지정한 그 노드다(실측 235×61).
 */
const SUBMIT_BUBBLE = '수행평가 제출물을 제출합니다.';

/**
 * §5.17 평가 완료 안내 원문. **점수만 동적으로 채운다** — 시안 `86`은 더미이고, §12.4 5행이
 * 「채팅에 종합 점수 노출(`종합 점수는 86점입니다`)」을 외부 앱에 없던 신규 기능으로
 * 지정했다(외부 응답에는 `score` 필드가 아예 없다). 점수를 못 읽은 경우에는 그 문장만
 * 통째로 빼고 나머지 원문을 그대로 쓴다 — 「종합 점수는 null점입니다」를 만들지 않는다.
 */
function buildEvaluationResultCopy(score) {
  return [
    '평가 리포트를 생성했어요.',
    typeof score === 'number' ? ` 종합 점수는 ${score}점입니다.` : '',
    ' 보완할 점을 반영해 다시 제출하거나, 다음 수행평가를 시작할 수 있어요.'
  ].join('');
}

// 시안 없음 — 제안. 평가 실패 폴백(§5.15에 실패 화면이 없다).
const EVALUATION_FAILED_FALLBACK = '평가 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.';
const FINALIZE_FAILED_FALLBACK = '최종본을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';

/**
 * 시안 없음 — 제안. `추가 평가 받기`(§12.2 「확정 없이 폼을 복원한다」) 뒤 안내.
 * 폼만 조용히 되돌아오면 방금 본 평가 리포트가 왜 사라졌는지 알 수 없다.
 */
const REEVALUATE_RESTORED_COPY =
  '제출폼이 다시 열렸어요. 내용을 보완해 다시 제출하면 새 평가 리포트를 받을 수 있습니다.';

// 시안 없음 — 제안. `이대로 확정짓기` 완료 안내. Q67 결정(확정 뒤에도 재평가 허용, 최종본은
// 1건 고정)을 그대로 문장으로 옮긴 것이라 사용자가 다음에 무엇을 할 수 있는지가 남는다.
const FINALIZE_CONFIRMED_COPY =
  '이 제출본을 최종본으로 저장했어요. 최종본은 수행평가 1건당 하나만 지정되고, 필요하면 ‘추가 평가 받기’로 다시 평가받을 수 있습니다.';

// 시안 없음 — 제안. 최종본 포인터가 **이미 다른 제출본에 고정돼 있던** 경우(§8.6
// `409 ALREADY_FINALIZED_OTHER`, `finalize.js` Q67 주석의 「최종본 포인터는 움직이지 않는다」).
// 확정 자체는 성립했으므로 실패로 알리지 않되, 무엇이 최종본인지는 사실대로 말한다.
const FINALIZE_KEPT_POINTER_COPY =
  '앞서 확정한 제출본이 최종본으로 그대로 유지됩니다. 최종본을 다른 제출본으로 바꾸는 기능은 아직 없어요.';

// 시안 없음 — 제안. `추가 수행평가 진행하기` 뒤 새 수행평가의 첫 안내.
const NEW_ASSESSMENT_STARTED_COPY =
  '이전 수행평가의 제출본을 최종본으로 저장했어요. 새 수행평가를 시작할게요.';
const NEW_ASSESSMENT_KEPT_POINTER_COPY =
  '앞서 확정한 제출본이 최종본으로 유지된 채로 새 수행평가를 시작할게요.';

/**
 * 평가 실패 중 **같은 제출본으로 다시 시도하면 풀릴 수 있는** 코드. 서버 재시도가 멱등
 * (같은 `submissionId` 재요청은 모델을 부르지 않고 저장분을 돌려준다)이라 안전하다.
 */
const EVALUATION_RETRYABLE_CODES = new Set(['MODEL_FAILED', 'NETWORK', 'INTERNAL', 'UNKNOWN']);

/**
 * 제출물을 **고쳐야** 풀리는 코드(§8.6 evaluate 400 3종). 재시도 버튼은 같은 값을 그대로
 * 다시 보내므로 무의미하다 — 폼을 되돌려 주는 것이 유일한 출구다.
 */
const EVALUATION_FIXABLE_CODES = new Set([
  'EMPTY_SUBMISSION',
  'REQUIRED_FIELD_EMPTY',
  'SUBMISSION_TOO_SHORT'
]);

/**
 * STEP1 입력 요약 사용자 말풍선(§5.6 문구 원문).
 *   `학년: 고1 1학기 / 학교 유형: 일반고 / 과목: 국어 / 공통국어 1 / 진로: 의학`
 * 시안 문구 끝에 공백 1칸이 붙어 있으나 조립 규칙이 미확정이라(§5.6 단정) **넣지 않는다** —
 * 보이지 않는 공백을 재현할 근거가 없고, 없어서 어긋나는 실측도 없다.
 * 값이 빈 항목은 절(節)째 뺀다(`school_type`은 프로필 스냅샷이라 null일 수 있다 —
 * `sql/54_performance_app.sql` 결정 ㄱ, 가짜 기본값 `'일반고'`를 넣지 않는다).
 * `previousTopic`은 시안 문구에 없어 넣지 않는다.
 */
function buildBasicInfoSummary(session) {
  if (!session) return '';

  const grade = [session.gradeLabel, session.semester].filter(Boolean).join(' ');
  const subject = [session.subjectGroup, session.subject].filter(Boolean).join(' / ');

  return [
    grade && `학년: ${grade}`,
    session.schoolType && `학교 유형: ${session.schoolType}`,
    subject && `과목: ${subject}`,
    session.careerGoal && `진로: ${session.careerGoal}`
  ]
    .filter(Boolean)
    .join(' / ');
}

export default function PerformanceChatPage() {
  const { session } = useSession();
  const accessToken = session?.access_token || null;

  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [profileName, setProfileName] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [createdSession, setCreatedSession] = useState(null);

  // STEP2 분기. 'upload' = 업로드 카드, 'manual' = 직접 입력 폼(§5.8).
  const [guideMode, setGuideMode] = useState('upload');
  // STEP2가 끝났는가(업로드 분석 성공 또는 직접 입력 제출 성공).
  const [guideDone, setGuideDone] = useState(false);
  // 제출 결과 사용자 말풍선 재료(§5.9) — 업로드 장수 / 직접 입력 원문.
  const [uploadedCount, setUploadedCount] = useState(0);
  const [manualText, setManualText] = useState('');

  // ── STEP3 상태
  //   'idle'      STEP2 미완료.
  //   'loading'   **최초** 추천 진행 중 → `AiLoadingBubble`(§5.9).
  //   'ready'     3카드 렌더(§5.10).
  //   'quota'     `409 QUOTA_EXHAUSTED` → 인라인 소진 카드(§5.20 (B)).
  //   'dismissed' 소진 카드를 `나중에 하기`로 닫은 뒤.
  //   'failed'    소진 외 실패 + 보여 줄 주제가 아직 없음 → 재시도 안내.
  const [topicPhase, setTopicPhase] = useState('idle');
  // 재추천 전용 플래그. **`topicPhase`를 `'loading'`으로 바꾸지 않는 것이 요점이다** —
  // 그렇게 하면 `step3-topics` 메시지(카드 3장 + `다른 주제 다시 추천` 버튼)가 타임라인에서
  // 통째로 빠지고, 방금 그 버튼을 누른 사용자의 포커스가 `<body>`로 떨어진다. 키보드
  // 사용자는 위치를 잃고 Tab을 처음부터 다시 밟아야 하며, 새 카드가 도착해도 포커스는
  // 돌아오지 않는다. 카드·버튼은 그대로 두고 로딩 버블만 그 아래에 덧붙인다.
  const [topicRegenerating, setTopicRegenerating] = useState(false);
  const [topics, setTopics] = useState([]);
  const [topicRound, setTopicRound] = useState(0);
  const [topicMaxRounds, setTopicMaxRounds] = useState(3);
  const [topicRoundLimited, setTopicRoundLimited] = useState(false);
  const [topicError, setTopicError] = useState(null);
  const [quotaPlanEndsAt, setQuotaPlanEndsAt] = useState(null);

  // ── 주제 상세 모달(§5.11, P9). 열려 있는 주제 1건만 들고 있으면 된다 — 모달은
  //   `topicDetail`이 있을 때만 렌더한다.
  //   **닫기 경로**(ESC/딤/`다른 주제 보기`)는 카드 목록(`topics`)을 그대로 두므로 포커스가
  //   원래 클릭한 카드로 복귀한다(`useModalBehavior`가 담당, 카드는 리렌더로 교체되지 않는다
  //   — `topics` 상태가 이 사이에 바뀌지 않기 때문).
  //   **확정 경로는 다르다.** `handleConfirmTopic`이 `designPhase`를 `'loading'`으로 바꾸면
  //   아래 STEP3 메시지 렌더 조건(`designPhase === 'idle'`)이 카드 목록을 통째로
  //   언마운트한다 — React 18 배치로 카드 언마운트와 모달 언마운트가 같은 커밋에서 일어나므로
  //   `useModalBehavior`의 트리거 복귀 대상은 cleanup 시점에 이미 detach된 노드다(검토 A).
  //   그래서 확정 경로는 자동 복귀에 기대지 않고 `designLoadingRef`로 새 포커스 목적지(STEP4
  //   로딩 버블)를 직접 지정한다 — 아래 `designLoadingRef` 이펙트 참고. **같은 이유로 P10이
  //   추가한 설계 리포트 모달도 닫힐 때 포커스 목적지를 직접 지정한다**(`handleCloseDesignModal`).
  const [topicDetail, setTopicDetail] = useState(null);

  // ── STEP4 설계 리포트(§5.12 로딩 → §5.13 모달, P10에서 완성).
  //   'idle'    주제 미확정 — STEP3 카드가 화면에 있다.
  //   'loading' `design-report` 진행 중 → 로딩 버블(§5.12).
  //   'ready'   리포트 수신 → 모달 자동 오픈 + 타임라인에 다시 열기 경로.
  //   'failed'  실패 → 재시도 / 주제 재선택.
  //
  //   **`'idle'`로 되돌아오는 경로가 실재해야 한다.** P9는 확정 후 이 상태에서 나갈 수
  //   없었고(단방향), 그 미결이 이 슬라이스의 배선으로 닫힌다 — 실패 시 `주제 다시 고르기`가
  //   `'idle'`로 되돌린다. 실패 경로에서는 서버가 아무것도 커밋하지 않으므로(모델 호출 전
  //   게이트는 물론, 커밋 RPC 실패도 주제 확정 없이 끝난다 — `design-report.js` 상단 표)
  //   되돌아가 다른 주제를 고르는 것이 실제로 안전하다.
  const [designPhase, setDesignPhase] = useState('idle');
  const [confirmedTopic, setConfirmedTopic] = useState(null);
  const [designReport, setDesignReport] = useState(null);
  const [designError, setDesignError] = useState(null);
  // 모달 개폐는 `designPhase`와 **별개 축**이다 — 닫아도 리포트는 그대로 남아야 다시 열 수 있다.
  const [designModalOpen, setDesignModalOpen] = useState(false);
  // `designPhase === 'loading'`으로 전이할 때 새로 나타나는 STEP4 로딩 버블로 포커스를 옮기는
  // 데 쓴다(검토 A-2, 위 `topicDetail` 주석 참고). `ChatTimeline`에 이 ref를 `focusRef`로
  // 넘기면 `AiLoadingBubble` 루트에 배선되고, 그 항목의 래퍼가 자동으로 `aria-live="off"`가
  // 되어 `ChatTimeline`의 `aria-live="polite"`와 중복 낭독되지 않는다.
  const designLoadingRef = useRef(null);
  // 모달을 닫을 때 포커스가 갈 자리(`설계 리포트 다시 보기` 버튼). 모달은 로딩 버블이
  // 사라진 커밋에서 자동으로 열리므로 `useModalBehavior`가 기억한 트리거는 이미 detach된
  // 노드다 — 복귀 대상을 여기서 직접 준다.
  const designReopenRef = useRef(null);
  // `designPhase` 전이 3종을 **대칭으로** 다루기 위한 나머지 두 목적지(검토 P10).
  //   · `'loading' → 'failed'`: 로딩 버블이 언마운트되는데 그 버블이 바로 직전에 프로그램적
  //     포커스를 받은 노드다(`designLoadingRef` 이펙트). 배선이 없으면 `<body>`로 떨어져
  //     `설계 리포트 다시 시도`/`주제 다시 고르기`에 도달하려면 Tab을 처음부터 밟아야 한다.
  //   · `'failed' → 'idle'`(`주제 다시 고르기`): 방금 누른 버튼 자신이 언마운트된다.
  // 둘 다 `topicRegenerating` 주석이 이미 지목한 그 함정이라 같은 rAF 패턴으로 막는다.
  const designFailedRef = useRef(null);
  const topicsReturnRef = useRef(null);
  // STEP3 복귀 포커스는 **`주제 다시 고르기`로 되돌아온 경우에만** 필요하다. 항상 배선하면
  // `step3-topics` 항목이 늘 `aria-live="off"`가 되어(포커스 목적지 규약) 최초 추천 결과가
  // 낭독되지 않는다. 그래서 복귀 요청이 있을 때만 켜고, 켜진 뒤에는 그대로 둔다 —
  // 되돌아온 뒤로는 이 항목이 포커스로 낭독되는 쪽이 일관된다.
  const [topicsFocusPending, setTopicsFocusPending] = useState(0);

  // ── STEP5 평가(§5.15 로딩 → §5.16 모달 → §5.17 분기 3버튼)
  //   'idle'    아직 제출하지 않았다 — **§5.14 제출폼이 화면에 있는 상태다.**
  //   'loading' `evaluate` 진행 중 → 로딩 버블(§5.15).
  //   'ready'   리포트 수신 → 모달 자동 오픈(§4 플로우 `EvalLoading --> EvalReport`) +
  //             타임라인에 다시 열기 경로 + 분기 3버튼(§5.17).
  //   'failed'  실패 → 코드에 따라 재시도 / 폼 복원 / 안내만.
  //
  // ⚠️ **제출폼 슬라이스와의 계약**: 폼은 `evaluationPhase === 'idle'`인 동안 렌더된다.
  //   `추가 평가 받기`(§12.2 「확정 없이 폼을 복원한다」)가 이 값을 `'idle'`로 되돌리는 것이
  //   곧 폼 복원이다 — 별도 복원 신호를 두면 두 축이 갈라진다.
  //   폼이 제출에 성공하면 `handleSubmissionEvaluate(submissionId)`를 부른다(아래).
  const [evaluationPhase, setEvaluationPhase] = useState('idle');
  const [evaluationSubmissionId, setEvaluationSubmissionId] = useState(null);
  const [evaluationReport, setEvaluationReport] = useState(null);
  const [evaluationError, setEvaluationError] = useState(null);
  // 모달 개폐는 `evaluationPhase`와 **별개 축**이다(§5.13 모달과 같은 처리) — 닫아도 리포트는
  // 남아야 `평가 리포트 다시 보기`로 돌아올 수 있다.
  const [evaluationModalOpen, setEvaluationModalOpen] = useState(false);
  // 서버가 세는 성공 생성 횟수와 상한(§9.2, 기본 3 = 최초 1 + 재평가 2). 상한에 닿으면
  // `추가 평가 받기`를 눌러도 서버가 `409 REEVALUATION_LIMIT`이라 미리 잠근다.
  const [evaluationCount, setEvaluationCount] = useState(0);
  const [maxEvaluations, setMaxEvaluations] = useState(3);
  // `추가 평가 받기`로 폼이 복원됐음을 알리는 안내를 켜는 카운터(0이면 최초 작성 중이다).
  const [reevaluateRound, setReevaluateRound] = useState(0);

  // ── 확정(§5.17 두 버튼 → `POST /api/performance/finalize`)
  const [finalizeAction, setFinalizeAction] = useState(null); // 진행 중인 action(잠금용)
  const [finalizeResult, setFinalizeResult] = useState(null); // { action, keptPointer }
  const [finalizeError, setFinalizeError] = useState(null); // { action, message }

  // ── `추가 수행평가 진행하기` 이후. 새 세션은 서버가 이미 만들어 두므로(finalize 응답
  //   `nextSessionId`) 이 화면은 **상태만 STEP1로 되돌린다**. 그 뒤 STEP1 제출은
  //   `action:'create'`가 아니라 `'resume'`이어야 한다 — 미차감 세션이 이미 하나 있어
  //   `create`는 `409 UNCHARGED_SESSION_EXISTS`로 막힌다(§9.3 동시 1개 제한).
  const [sessionStartMode, setSessionStartMode] = useState('create');
  const [restartNotice, setRestartNotice] = useState(null);
  const [restartToken, setRestartToken] = useState(0);

  // 포커스 목적지 — 전부 「직전에 포커스를 갖고 있던 노드가 같은 커밋에서 언마운트되는
  // 전이」다(`ChatTimeline`의 `focusRef` 주석과 같은 이유).
  const evaluationLoadingRef = useRef(null); // 폼 → 로딩(폼 카드가 사라진다)
  const evaluationFailedRef = useRef(null); // 로딩 → 실패(로딩 버블이 사라진다)
  const evaluationReopenRef = useRef(null); // 모달 닫기(자동 오픈이라 트리거가 이미 없다)
  const reevaluateNoticeRef = useRef(null); // 분기 버튼 → 폼 복원(누른 버튼이 사라진다)
  const finalizeDoneRef = useRef(null); // 확정 완료 안내
  const restartRef = useRef(null); // 새 수행평가 첫 안내(타임라인이 통째로 갈린다)

  // ── STEP5 제출폼(§5.14) — 스키마·작성값·저장 상태
  //   `submissionSchema`는 **서버가 내려준 값 그대로**다(§8.3 — 8종 판정은 서버 소유이고
  //   화면은 재판정하지 않는다). 없으면 폼을 그리지 않는다: 스키마를 모르는 채 기본 4칸을
  //   그리면 문항형 학생에게 없는 칸을 보여 주고 저장은 `400 UNKNOWN_FIELD`로 죽는다.
  //   `submissionValue`가 **평가 슬라이스와 독립된 축**인 것이 중요하다 — `추가 평가 받기`가
  //   `evaluationPhase`만 `'idle'`로 되돌려도 작성값이 그대로 남아 폼이 복원된다(§12.2 L2372).
  const [submissionSchema, setSubmissionSchema] = useState(null);
  const [submissionValue, setSubmissionValue] = useState({});
  const [submissionLoadError, setSubmissionLoadError] = useState(null);
  const [submissionLoadToken, setSubmissionLoadToken] = useState(0);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingWork, setSubmittingWork] = useState(false);
  const [submissionActionError, setSubmissionActionError] = useState(null);
  const [submissionSavedAt, setSubmissionSavedAt] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!accessToken) return undefined;

    setBootstrapLoading(true);

    (async () => {
      try {
        const response = await fetch('/api/performance/bootstrap', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await response.json().catch(() => null);
        if (!alive) return;
        if (response.ok) setProfileName(data?.profile?.name || null);
      } catch (error) {
        console.error('[performance] bootstrap 조회 실패:', error);
      } finally {
        if (alive) setBootstrapLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [accessToken]);

  // STEP4 로딩 진입 시 포커스 이동(검토 A-2). 카드 목록이 언마운트되며 `useModalBehavior`의
  // 자동 복귀 대상(트리거 카드)도 함께 사라지므로, 여기서 새 목적지를 직접 지정한다. 로딩
  // 버블이 실제로 DOM에 붙은 뒤(같은 렌더 커밋 다음 프레임) 포커스를 옮겨야 하므로
  // `requestAnimationFrame`을 쓴다 — `useModalBehavior`의 "열릴 때 첫 포커서블로 이동" 이펙트와
  // 같은 패턴이다.
  useEffect(() => {
    if (designPhase !== 'loading') return undefined;
    const raf = requestAnimationFrame(() => {
      designLoadingRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [designPhase]);

  // STEP4 실패 진입 — 언마운트되는 로딩 버블에서 실패 안내(재시도 버튼을 품은 항목)로 옮긴다.
  useEffect(() => {
    if (designPhase !== 'failed') return undefined;
    const raf = requestAnimationFrame(() => {
      designFailedRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [designPhase]);

  // `주제 다시 고르기` 복귀 — 다시 나타난 STEP3 카드 묶음으로 옮긴다.
  useEffect(() => {
    if (!topicsFocusPending) return undefined;
    const raf = requestAnimationFrame(() => {
      topicsReturnRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [topicsFocusPending]);

  // ── STEP5 포커스 전이 5종. 위 세 이펙트와 같은 rAF 패턴이라 헬퍼로 묶었다(전이가 늘어난
  //   만큼 같은 6줄을 다섯 번 더 쓰지 않는다). 훅 호출 순서는 고정이다.
  useRafFocus(evaluationPhase === 'loading', evaluationLoadingRef);
  useRafFocus(evaluationPhase === 'failed', evaluationFailedRef);
  useRafFocus(evaluationPhase === 'idle' && reevaluateRound > 0, reevaluateNoticeRef, [
    reevaluateRound
  ]);
  useRafFocus(Boolean(finalizeResult), finalizeDoneRef, [finalizeResult]);
  useRafFocus(Boolean(restartNotice), restartRef, [restartToken]);

  /**
   * STEP5 제출폼 재료 조회(§8.6 표 밖 추가분 — `GET /api/performance/submission`).
   * 설계 리포트가 준비된 시점(§4 `DesignReport --> Step5Form`)에 딱 한 번 돌고,
   * 실패 시 `submissionLoadToken`으로만 다시 돈다.
   *
   * 서버가 스키마와 **이어서 쓸 초안**을 함께 준다. 화면이 이미 값을 들고 있으면 덮어쓰지
   * 않는다 — 재시도 조회가 작성 중인 원고를 서버 스냅샷으로 되돌리면 안 된다.
   */
  useEffect(() => {
    if (designPhase !== 'ready' || !accessToken || !createdSession) return undefined;

    let alive = true;
    setSubmissionLoadError(null);

    (async () => {
      try {
        const data = await fetchSubmissionForm({ accessToken, sessionId: createdSession.id });
        if (!alive) return;
        setSubmissionSchema(data.schema);
        setSubmissionValue((prev) =>
          Object.keys(prev).length ? prev : data.submission?.fields || {}
        );
      } catch (error) {
        if (!alive) return;
        // 서버는 원 예외를 응답에 싣지 않는다(§8.6 공통 규약) — 콘솔에만 코드를 남긴다.
        console.error('[performance] 제출폼 조회 실패:', error?.code, error);
        setSubmissionLoadError(error?.userMessage || SUBMISSION_LOAD_FAILED_FALLBACK);
      }
    })();

    return () => {
      alive = false;
    };
    // 결과 상태(`submissionSchema`)는 의존성에 넣지 않는다 — 넣으면 성공 직후 이펙트가 다시
    // 돌아 같은 GET을 두 번 쏜다. 재조회 트리거는 `submissionLoadToken` 하나뿐이다.
  }, [designPhase, accessToken, createdSession, submissionLoadToken]);

  /** 세션 생성/이어받기 1회. `action`은 `sessionStartMode`가 정한다(아래 주석). */
  async function postSession(values, action) {
    const response = await fetch('/api/performance/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ action, basicInfo: values })
    });

    const data = await response.json().catch(() => null);
    return { response, data };
  }

  async function handleSubmit(values) {
    if (!accessToken || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // 기본은 `'create'`다. `추가 수행평가 진행하기`로 되돌아온 직후에만 `'resume'`인데,
      // 그때는 finalize가 이미 미차감 세션을 하나 준비해 뒀으므로(§9.3 동시 1개 제한 때문에
      // `create`는 `409 UNCHARGED_SESSION_EXISTS`로 막힌다) 그것을 이어받아야 한다.
      let { response, data } = await postSession(values, sessionStartMode);

      // 그 미차감 세션이 그 사이에 사라진 경우(다른 탭에서 소비·폐기)에는 `resume`이
      // `404 NO_UNCHARGED_SESSION`으로 떨어진다 — create로 **한 번만** 되돌린다. 그러지
      // 않으면 새 수행평가를 시작할 길이 화면에서 사라진다.
      if (
        !response.ok &&
        sessionStartMode === 'resume' &&
        data?.error?.code === 'NO_UNCHARGED_SESSION'
      ) {
        ({ response, data } = await postSession(values, 'create'));
      }

      if (!response.ok) {
        if (response.status === 409 && data?.error?.code === 'UNCHARGED_SESSION_EXISTS') {
          setSubmitError(
            '이미 진행 중인(회차를 아직 쓰지 않은) 수행평가가 있어요. 저장 리포트에서 이어서 진행해 주세요.'
          );
        } else {
          setSubmitError(data?.error?.message || '세션을 생성하지 못했어요. 다시 시도해 주세요.');
        }
        return;
      }

      // 이어받기는 1회성이다 — 세션을 손에 넣은 뒤로는 다시 기본값으로 돌린다.
      setSessionStartMode('create');
      setCreatedSession(data.session);
    } catch (error) {
      console.error('[performance] 세션 생성 실패:', error);
      setSubmitError('네트워크 오류로 세션을 생성하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * STEP3 주제 추천 1회. **최초 추천과 재추천이 같은 호출이다**(§8.6) — 다른 점은 실패했을
   * 때 어디로 되돌아가는지뿐이라 그것만 인자로 받는다.
   *
   * 회차 차감은 서버가 AI 성공 이후에만 커밋하고(§9.3) 재추천은 `already_charged`로 무차감
   * 통과하므로, 이 화면은 차감을 예측하거나 표시하지 않는다.
   *
   * @param {{isRegenerate?: boolean}} [options] `isRegenerate`면 ⓐ 진행 중에도 카드·버튼을
   *   화면에 남기고(포커스 유지 — `topicRegenerating` 주석) ⓑ 실패 시 이미 받은 3카드
   *   화면으로 되돌리고 실패 사유만 카드 아래 한 줄로 알린다(있던 결과를 실패로 지우지 않는다).
   */
  async function requestTopics({ isRegenerate = false } = {}) {
    if (!accessToken || !createdSession) return;

    // 최초 추천만 타임라인을 로딩 버블로 교체한다. 재추천은 기존 메시지를 남긴 채
    // 플래그만 켜고, 로딩 버블은 카드 묶음 **아래**에 덧붙는다.
    if (isRegenerate) setTopicRegenerating(true);
    else setTopicPhase('loading');
    setTopicError(null);

    try {
      const data = await recommendTopics({
        accessToken,
        sessionId: createdSession.id
      });

      setTopics(Array.isArray(data?.topics) ? data.topics : []);
      setTopicRound(Number(data?.round) || 1);
      if (Number(data?.maxRounds) > 0) setTopicMaxRounds(Number(data.maxRounds));
      setTopicRoundLimited(false);
      setTopicPhase('ready');
    } catch (error) {
      // 서버는 원 예외·모델 원문을 응답에 싣지 않는다(§8.6 공통 규약) — `userMessage`는
      // 그대로 화면에 띄워도 되는 문구다. 콘솔에만 코드를 남긴다.
      console.error('[performance] 주제 추천 실패:', error?.code, error);

      if (error?.code === 'QUOTA_EXHAUSTED') {
        // 재추천 경로에서는 정상적으로 도달하지 않는다 — 같은 세션이라 서버 RPC가
        // `already_charged`를 돌려주는 것이 정상이고(§9.3), 소진이 막는 것은 새 세션
        // 시작뿐이다(§5.20/Q54). 그래도 오면 소진 카드로 수렴시킨다.
        setQuotaPlanEndsAt(error.planEndsAt || null);
        setTopicPhase('quota');
        return;
      }

      if (error?.code === 'ROUND_LIMIT') {
        // 다른 탭에서 이미 상한까지 쓴 경우에도 여기로 온다 — 버튼 비활성 안내로 수렴시킨다.
        if (Number(error.maxRounds) > 0) setTopicMaxRounds(Number(error.maxRounds));
        setTopicRoundLimited(true);
        setTopicPhase(isRegenerate ? 'ready' : 'failed');
        if (!isRegenerate) setTopicError(error.userMessage);
        return;
      }

      setTopicError(error?.userMessage || '주제를 추천하지 못했어요. 잠시 후 다시 시도해 주세요.');
      setTopicPhase(isRegenerate ? 'ready' : 'failed');
    } finally {
      if (isRegenerate) setTopicRegenerating(false);
    }
  }

  /**
   * 업로드 분기 — 전처리까지 끝난 파일 배열을 받아 업로드 → 분석까지 간다.
   * 업로드가 중간에 실패하면 `uploadGuidePhotos`가 이번 시도의 첨부를 회수하므로
   * 사용자는 5장 상한에 막히지 않고 그대로 다시 시도할 수 있다.
   */
  async function handleGuideSubmit(files) {
    if (!accessToken || !createdSession || submitting || !files.length) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const attachmentIds = await uploadGuidePhotos({
        accessToken,
        sessionId: createdSession.id,
        files
      });

      await analyzeGuideUpload({ accessToken, sessionId: createdSession.id, attachmentIds });
      setUploadedCount(attachmentIds.length);
      setGuideDone(true);
      // STEP2가 끝나면 곧바로 STEP3로 이어진다(§5.9 — 로딩 카드가 바로 붙는다).
      // `requestTopics`는 자체적으로 모든 실패를 흡수하므로 여기서 await하지 않는다.
      void requestTopics();
    } catch (error) {
      console.error('[performance] 안내문 업로드·분석 실패:', error);
      // `guideUpload.js`가 화면에 그대로 띄울 수 있는 문구를 달아 던진다.
      setSubmitError(error?.userMessage || '안내문을 분석하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  /** 직접 입력 분기(§5.8) — 같은 `analyze-guide`의 `{ sessionId, freetext }` 분기다. */
  async function handleManualSubmit(freetext) {
    if (!accessToken || !createdSession || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitManualGuide({ accessToken, sessionId: createdSession.id, freetext });
      setManualText(freetext);
      setGuideDone(true);
      void requestTopics();
    } catch (error) {
      console.error('[performance] 안내문 직접 입력 제출 실패:', error);
      setSubmitError(error?.userMessage || '입력한 정보를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  /** `안내문 없이 시작하기` — 업로드 카드를 걷고 직접 입력 분기로 넘어간다(§5.8). */
  function handleSkipGuide() {
    if (submitting) return;
    setSubmitError(null);
    setGuideMode('manual');
  }

  /**
   * 카드 클릭 → 주제 상세 모달(§5.11 `3754:4872`). **이것이 카드의 유일한 진입점이다** —
   * 확정(`이 주제로 확정하기`)은 모달 하단에만 있고 카드에서 바로 확정하는 경로는 없다
   * (§11.1 Q48).
   */
  function handleTopicDetail(topic) {
    setTopicDetail(topic);
  }

  /** ESC·딤 클릭·`다른 주제 보기` 공통 핸들러 — 모달만 닫는다(카드 목록은 그대로). */
  function handleCloseTopicDetail() {
    setTopicDetail(null);
  }

  /**
   * 설계 리포트 1회 요청. **주제 확정과 리포트 생성이 서버에서 한 트랜잭션이다**(§8.6 —
   * 외부 앱의 2회 왕복 결함 회피). 그래서 "확정만 하는" 호출은 존재하지 않는다.
   *
   * 회차는 이 단계에서 깎이지 않는다(§9.3 「설계 리포트 생성·재생성 | 없음」) — 서버 응답도
   * `charged:false` 고정이라 이 화면은 차감을 예측하지도 표시하지도 않는다.
   *
   * **재시도는 `regenerate`를 보내지 않는다.** 같은 `topicId` 재요청은 서버에서 멱등 재생
   * (모델 미호출)이라, 응답만 유실된 경우에는 저장된 리포트를 그대로 복구하고 아니면 새로
   * 만든다. `regenerate:true`는 재생성 예산(2회)을 태우는 별개 행동이다.
   */
  async function requestDesign(topic) {
    if (!accessToken || !createdSession || !topic) return;

    setDesignPhase('loading');
    setDesignError(null);

    try {
      const data = await requestDesignReport({
        accessToken,
        sessionId: createdSession.id,
        topicId: topic.id
      });

      setDesignReport(data);
      setDesignPhase('ready');
      // §5.13 흐름도(`DesignLoading --> DesignReport`)대로 완성 즉시 모달을 연다.
      setDesignModalOpen(true);
    } catch (error) {
      // 서버는 원 예외·모델 원문을 응답에 싣지 않는다(§8.6 공통 규약) — `userMessage`는
      // 그대로 화면에 띄워도 되는 문구다. 콘솔에만 코드를 남긴다.
      console.error('[performance] 설계 리포트 생성 실패:', error?.code, error);
      setDesignError({
        code: error?.code || 'UNKNOWN',
        message: error?.userMessage || DESIGN_FAILED_FALLBACK,
        // `TOPIC_ALREADY_CONFIRMED`에서만 실린다 — 복구 경로(아래 `step4-design-failed`)가 쓴다.
        confirmedTopicId: error?.confirmedTopicId || null
      });
      setDesignPhase('failed');
    }
  }

  /**
   * `이 주제로 확정하기`(§5.11 하단, 모달의 유일한 확정 진입점). 주제 상세 모달을 닫고
   * STEP4로 넘어간다(§5.12 — 카드 3장·재추천 버튼이 타임라인에서 제거되고 확정 말풍선 +
   * 로딩 버블만 남는다).
   */
  function handleConfirmTopic(topic) {
    setConfirmedTopic(topic);
    setTopicDetail(null);
    void requestDesign(topic);
  }

  /** 실패 후 재시도 — 같은 주제로 다시 요청한다(멱등 재생 또는 신규 생성). */
  function handleRetryDesign() {
    if (designPhase === 'loading') return;
    void requestDesign(confirmedTopic);
  }

  /**
   * 실패 후 `주제 다시 고르기` — STEP3 카드 화면으로 되돌린다. **이 경로가 P9의 단방향
   * 미결을 닫는 지점이다.** 실패 경로에서는 서버가 주제 확정도 리포트도 커밋하지 않으므로
   * (`design-report.js` 「실패 경로별 잔여 상태」 — 남는 것은 `design_attempt_count` 뿐)
   * 다른 주제를 골라도 서버 상태와 어긋나지 않는다.
   */
  function handleBackToTopics() {
    setDesignPhase('idle');
    setConfirmedTopic(null);
    setDesignError(null);
    // 이 버튼 자신이 같은 커밋에서 언마운트된다 — 다시 나타난 STEP3 카드 묶음으로 포커스를
    // 넘긴다(위 `topicsFocusPending` 주석).
    setTopicsFocusPending((n) => n + 1);
  }

  /**
   * `TOPIC_ALREADY_CONFIRMED` 전용 복구 — 다른 탭에서(또는 이전 방문에서) 이미 다른 주제로
   * 확정된 세션이다. 이 코드에서는 **재시도도 주제 재선택도 통하지 않는다**(무엇을 보내든
   * 같은 409로 돌아온다). 유일하게 통하는 것은 서버가 알려준 확정 주제(`confirmedTopicId`)로
   * 요청하는 것이고, 그러면 멱등 재생 경로로 저장된 리포트가 그대로 열린다(모델 미호출).
   * @param {{id: string, title: string|null}} topic
   */
  function handleResumeConfirmedTopic(topic) {
    if (designPhase === 'loading' || !topic?.id) return;
    setConfirmedTopic(topic);
    void requestDesign(topic);
  }

  /**
   * §5.13 `창 닫고 작성하기`·ESC·딤 클릭 공통. 리포트는 상태에 남겨 다시 열 수 있게 한다.
   * 포커스는 `useModalBehavior`의 자동 복귀에 기대지 않고 `설계 리포트 다시 보기` 버튼으로
   * 직접 옮긴다 — 모달을 연 트리거(STEP4 로딩 버블)는 같은 커밋에서 이미 언마운트됐다.
   */
  function handleCloseDesignModal() {
    setDesignModalOpen(false);
    requestAnimationFrame(() => designReopenRef.current?.focus());
  }

  function handleReopenDesignModal() {
    setDesignModalOpen(true);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP5 — 평가(§5.15·§5.16) / 분기 3버튼(§5.17)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 평가 리포트 1회. **회차는 깎이지 않는다**(§9.3 「제출 → 평가 리포트 생성 | 없음」,
   * 「`추가 평가 받기` | 없음(상한 2회)」) — 차감 지점은 `recommend-topics` 최초 성공
   * 1곳뿐이고 서버 응답도 `charged:false` 고정이라 이 화면은 차감을 예측하지도 표시하지도
   * 않는다.
   *
   * **재시도는 같은 `submissionId`를 그대로 다시 보낸다.** 서버가 멱등 재생(모델 미호출)이라
   * 응답만 유실된 경우에는 저장된 리포트를 그대로 복구하고, 아니면 새로 만든다.
   */
  async function runEvaluation(targetSubmissionId) {
    if (!accessToken || !createdSession || !targetSubmissionId) return;

    setEvaluationSubmissionId(targetSubmissionId);
    setEvaluationPhase('loading');
    setEvaluationError(null);
    setFinalizeError(null);

    try {
      const data = await requestEvaluation({
        accessToken,
        sessionId: createdSession.id,
        submissionId: targetSubmissionId
      });

      setEvaluationReport(data?.report || null);
      if (Number(data?.evaluationCount) > 0) setEvaluationCount(Number(data.evaluationCount));
      if (Number(data?.maxEvaluations) > 0) setMaxEvaluations(Number(data.maxEvaluations));
      // 이전 평가로 확정해 둔 결과가 있으면 새 평가와 함께 지운다 — 어느 제출본을 확정했다는
      // 안내가 새 리포트 옆에 남아 있으면 무엇이 최종본인지 화면이 거짓말을 하게 된다.
      setFinalizeResult(null);
      setEvaluationPhase('ready');
      // §4 플로우 `EvalLoading --> EvalReport : 3754:4512`(명세 L332) — 완성 즉시 모달을 연다.
      setEvaluationModalOpen(true);
    } catch (error) {
      // 서버는 원 예외·모델 원문을 응답에 싣지 않는다(§8.6 공통 규약) — `userMessage`는
      // 그대로 화면에 띄워도 되는 문구다. 콘솔에만 코드를 남긴다.
      console.error('[performance] 평가 리포트 생성 실패:', error?.code, error);
      setEvaluationError({
        code: error?.code || 'UNKNOWN',
        message: error?.userMessage || EVALUATION_FAILED_FALLBACK
      });
      setEvaluationPhase('failed');
    }
  }

  /**
   * `중간 저장`(§5.14 secondary). §4 상태도가 STEP5를 `Empty --> Filled : 입력` /
   * `Filled --> Filled : 중간 저장`(L328) 두 전이로만 그리고 명세 어디에도 자동 저장 규정이
   * 없어 **디바운스 자동 저장을 만들지 않았다** — 명시적 저장 하나뿐이다.
   *
   * 실패해도 `submissionValue`를 건드리지 않는다(작성 내용 유실 금지). 다중 탭 경합은
   * 서버가 `409 SESSION_FINALIZED`/`REEVALUATION_LIMIT`으로 갈라 주므로 문구만 띄운다.
   */
  async function handleSaveDraft(fields) {
    if (!accessToken || !createdSession || savingDraft || submittingWork) return;

    setSavingDraft(true);
    setSubmissionActionError(null);

    try {
      const data = await saveSubmission({
        accessToken,
        sessionId: createdSession.id,
        fields,
        mode: 'draft'
      });
      setSubmissionSavedAt(data.savedAt || new Date().toISOString());
    } catch (error) {
      console.error('[performance] 중간 저장 실패:', error?.code, error);
      setSubmissionActionError(error?.userMessage || '중간 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSavingDraft(false);
    }
  }

  /**
   * `제출하고 평가 리포트 받기`(§5.14 primary → §5.15). **저장과 평가는 별개 호출이다** —
   * §8.6 `evaluate`는 `{sessionId, submissionId}`만 받고 값은 DB에서 읽는다(클라이언트가
   * 평문 결합 텍스트를 조립해 보내지 않는다). 그래서 여기서 먼저 `mode:'submit'`으로
   * 저장하고, 받은 `submissionId`를 평가 슬라이스의 단일 진입점에 넘긴다.
   *
   * 회차는 이 경로에서 깎이지 않는다(§9.3 — 차감 지점은 `recommend-topics` 1곳뿐).
   */
  async function handleSubmitWork(fields) {
    if (!accessToken || !createdSession || savingDraft || submittingWork) return;

    setSubmittingWork(true);
    setSubmissionActionError(null);

    try {
      const data = await saveSubmission({
        accessToken,
        sessionId: createdSession.id,
        fields,
        mode: 'submit'
      });
      setSubmissionSavedAt(data.savedAt || null);
      handleSubmissionEvaluate(data.submissionId);
    } catch (error) {
      console.error('[performance] 제출 실패:', error?.code, error);
      // 게이트 실패(`SUBMISSION_TOO_SHORT`/`REQUIRED_FIELD_EMPTY`)는 **초안이 저장된 채로**
      // 돌아온다 — 서버가 게이트를 저장 이후에 보기 때문이다(`api/performance/submission.js`).
      // 학생이 쓰던 글은 남아 있으므로 문구만 알리고 폼은 그대로 둔다.
      if (error?.saved?.savedAt) setSubmissionSavedAt(error.saved.savedAt);
      setSubmissionActionError(error?.userMessage || '제출하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmittingWork(false);
    }
  }

  /** 제출폼 재료 조회 실패 후 재시도. 값·스키마를 비우지 않는다(있으면 그대로 유지). */
  function handleRetrySubmissionLoad() {
    setSubmissionLoadToken((n) => n + 1);
  }

  /**
   * **제출폼 슬라이스가 부르는 유일한 진입점**(§5.14 폼 → §5.15 로딩). 폼이
   * `PUT /api/performance/submission` `mode:'submit'`으로 받은 `submissionId`를 그대로 넘긴다.
   */
  function handleSubmissionEvaluate(submissionId) {
    if (evaluationPhase === 'loading') return;
    void runEvaluation(submissionId);
  }

  /** 실패 후 재시도 — 같은 제출본으로 다시 요청한다(멱등 재생 또는 신규 생성). */
  function handleRetryEvaluation() {
    if (evaluationPhase === 'loading') return;
    void runEvaluation(evaluationSubmissionId);
  }

  function handleReopenEvaluationModal() {
    setEvaluationModalOpen(true);
  }

  /**
   * §5.16 `다음 단계 선택하기`·ESC·딤 클릭 공통. 리포트는 상태에 남겨 다시 열 수 있게 한다.
   * 포커스는 `useModalBehavior`의 자동 복귀에 기대지 않고 `평가 리포트 다시 보기` 버튼으로
   * 직접 옮긴다 — 모달을 연 트리거(STEP5 로딩 버블)는 같은 커밋에서 이미 언마운트됐다.
   */
  function handleCloseEvaluationModal() {
    setEvaluationModalOpen(false);
    requestAnimationFrame(() => evaluationReopenRef.current?.focus());
  }

  /**
   * `추가 평가 받기`(§5.17). **확정하지 않는다** — §12.2 L2372 「'추가 평가 받기'만 확정 없이
   * 폼을 복원한다」. 서버 호출도 없다: 복원된 폼의 다음 저장이 자연스럽게 새 revision을 연다
   * (`api/performance/submission.js` 「draft upsert」).
   */
  function handleReevaluate() {
    if (finalizeAction) return;
    setEvaluationPhase('idle');
    setEvaluationModalOpen(false);
    setEvaluationError(null);
    setFinalizeError(null);
    setReevaluateRound((n) => n + 1);
  }

  /**
   * `이대로 확정짓기`(`confirm`) / `추가 수행평가 진행하기`(`new_assessment`) 공통.
   * §12.2 L2372 정본: 「둘 다 마지막 제출본을 최종본으로 확정 저장한다」 — 그래서 두 버튼이
   * 같은 엔드포인트를 `action`만 달리해 부른다. 이 호출도 무차감이다(§9.3 — 새 세션의 회차는
   * 그 세션의 다음 주제 추천이 성공할 때 든다).
   */
  async function runFinalize(action) {
    if (!accessToken || !createdSession || !evaluationSubmissionId || finalizeAction) return;

    setFinalizeAction(action);
    setFinalizeError(null);

    let keptPointer = false;

    try {
      let data;
      try {
        data = await finalizeSubmission({
          accessToken,
          sessionId: createdSession.id,
          submissionId: evaluationSubmissionId,
          action
        });
      } catch (error) {
        // `409 ALREADY_FINALIZED_OTHER` — 확정 뒤 재평가한 제출본으로 다시 확정하려는 경우다
        // (Q67이 열어 둔 경로). 최종본 포인터를 옮기는 계약이 §8.6에 없으므로 서버가 알려준
        // **이미 확정된 제출본**으로 한 번 더 부른다: 그 요청은 `already_final` 200이라
        // 사용자는 막히지 않고(특히 `new_assessment`는 새 세션까지 받는다), 대신 무엇이
        // 최종본인지는 아래 안내로 사실대로 말한다.
        if (error?.code !== 'ALREADY_FINALIZED_OTHER' || !error.finalSubmissionId) throw error;
        keptPointer = true;
        data = await finalizeSubmission({
          accessToken,
          sessionId: createdSession.id,
          submissionId: error.finalSubmissionId,
          action
        });
      }

      if (action === 'new_assessment') {
        // 서버가 `nextSessionId`(기존 미차감 세션 재사용 또는 신규 draft)를 준비해 뒀다.
        // 준비에 실패해 null이어도 확정은 이미 성립했으므로 그대로 STEP1로 되돌린다 —
        // `handleSubmit`의 `resume → create` 폴백이 두 경우를 모두 흡수한다.
        resetForNextAssessment({ keptPointer, hasNextSession: Boolean(data?.nextSessionId) });
        return;
      }

      setFinalizeResult({ action, keptPointer });
    } catch (error) {
      console.error('[performance] 최종본 확정 실패:', error?.code, error);
      setFinalizeError({ action, message: error?.userMessage || FINALIZE_FAILED_FALLBACK });
    } finally {
      setFinalizeAction(null);
    }
  }

  function handleConfirmSubmission() {
    void runFinalize('confirm');
  }

  function handleNewAssessment() {
    void runFinalize('new_assessment');
  }

  /**
   * `추가 수행평가 진행하기` 성공 후 화면을 STEP1로 되돌린다. 세션은 서버가 이미 만들어
   * 뒀으므로 여기서 만들지 않고, STEP1 제출만 `'resume'`으로 보내게 표시해 둔다.
   *
   * ⚠️ **STEP5 제출폼 상태(§5.14)도 여기서 함께 비운다.** 빠뜨리면 새 수행평가의 STEP5에서
   *   이전 수행평가의 원고가 그대로 프리필된다 — `추가 평가 받기`가 작성값을 **남기는**
   *   것과 정반대의 요구다(그쪽은 같은 세션의 폼 복원, 여기는 다른 세션의 시작이다).
   */
  function resetForNextAssessment({ keptPointer, hasNextSession }) {
    setSessionStartMode(hasNextSession ? 'resume' : 'create');
    setCreatedSession(null);
    setSubmitError(null);

    setGuideMode('upload');
    setGuideDone(false);
    setUploadedCount(0);
    setManualText('');

    setTopicPhase('idle');
    setTopicRegenerating(false);
    setTopics([]);
    setTopicRound(0);
    setTopicRoundLimited(false);
    setTopicError(null);
    setQuotaPlanEndsAt(null);
    setTopicDetail(null);
    setTopicsFocusPending(0);

    setDesignPhase('idle');
    setConfirmedTopic(null);
    setDesignReport(null);
    setDesignError(null);
    setDesignModalOpen(false);

    setSubmissionSchema(null);
    setSubmissionValue({});
    setSubmissionLoadError(null);
    setSubmissionActionError(null);
    setSubmissionSavedAt(null);

    setEvaluationPhase('idle');
    setEvaluationSubmissionId(null);
    setEvaluationReport(null);
    setEvaluationError(null);
    setEvaluationModalOpen(false);
    setEvaluationCount(0);
    setReevaluateRound(0);
    setFinalizeResult(null);
    setFinalizeError(null);

    setRestartNotice(keptPointer ? NEW_ASSESSMENT_KEPT_POINTER_COPY : NEW_ASSESSMENT_STARTED_COPY);
    setRestartToken((n) => n + 1);
  }

  /** `다른 주제 다시 추천`(§5.10) — 같은 엔드포인트 재호출. 회차는 깎이지 않는다(§9.3). */
  function handleRegenerate() {
    if (topicPhase === 'loading' || topicRegenerating) return;
    void requestTopics({ isRegenerate: true });
  }

  /**
   * 소진-해제(`dismissed`)·실패(`failed`) 카드의 `주제 추천 다시 시도` 버튼 공통 핸들러.
   * `handleRegenerate`와 같은 가드를 쓴다 — 리렌더 전 연타로 `requestTopics`가 중복
   * 발사되면 모델이 2회 호출되고 `topic_attempt_count`가 이중으로 오른다.
   */
  function handleRetryTopics() {
    if (topicPhase === 'loading' || topicRegenerating) return;
    void requestTopics();
  }

  /** `나중에 하기`(§5.20) — 카드만 닫는다. 세션도 입력값도 건드리지 않는다. */
  function handleQuotaDismiss() {
    setTopicPhase('dismissed');
  }

  // 인사말 — §5.5 문구 원문. 이름을 모르면(§bootstrap 조회 실패 등) "님" 절을 통째로
  // 빼지, 가짜 이름을 채우지 않는다(bootstrap.js/PerformanceSidebar와 같은 관례).
  const greetingBody = bootstrapLoading
    ? undefined
    : [
        profileName ? `반갑습니다, ${profileName}님. 첫 수행평가를 함께 시작해볼게요.` : '반갑습니다! 첫 수행평가를 함께 시작해볼게요.',
        '',
        '주제 추천부터 자료 · 글 구조 설계, 제출 후 평가까지 이 채팅에서 진행됩니다. 먼저 학년, 과목, 이전 주제, 희망 진로를 입력해주세요.'
      ].join('\n');

  if (bootstrapLoading) {
    return (
      <div className="mt-10">
        <AiLoadingBubble title="정보를 불러오는 중입니다." subtitle="잠시만 기다려 주세요." />
      </div>
    );
  }

  const messages = [];

  if (restartNotice) {
    // `추가 수행평가 진행하기` 직후(§5.17). 새 수행평가의 **첫** 메시지 자리라 인사말보다
    // 앞에 온다 — 직전 수행평가에서 무슨 일이 있었는지(최종본 저장)를 여기서 한 번만 말한다.
    // 타임라인이 통째로 갈리는 전이라 포커스 목적지이기도 하다.
    messages.push({
      id: 'step5-new-assessment',
      role: 'ai',
      kind: 'text',
      body: restartNotice,
      focusRef: restartRef
    });
  }

  messages.push({
    id: 'step1-greeting',
    role: 'ai',
    kind: 'text',
    body: greetingBody,
    // 세션이 만들어지면 폼 카드는 사라진다(§5.6 — `3754:3261`에 폼 카드가 없다).
    children: createdSession ? null : (
      <InlineCard>
        <BasicInfoForm onSubmit={handleSubmit} submitting={submitting} submitError={submitError} />
      </InlineCard>
    )
  });

  if (createdSession) {
    messages.push({
      id: 'step1-summary',
      role: 'user',
      kind: 'text',
      body: buildBasicInfoSummary(createdSession)
    });

    messages.push({
      id: 'step2-intro',
      role: 'ai',
      kind: 'text',
      body: GUIDE_INTRO,
      // 업로드 카드는 ⓐ 직접 입력으로 넘어갔거나 ⓑ STEP2가 끝나면 타임라인에서 빠진다.
      // 말풍선 자체는 두 경로 모두에서 남는다(`3754:3562`/`3754:3493` 둘 다 @626에 있다).
      children:
        guideMode === 'upload' && !guideDone ? (
          <GuideUploadCard
            onSubmit={handleGuideSubmit}
            onSkip={handleSkipGuide}
            submitting={submitting}
            submitError={submitError}
          />
        ) : null
    });
  }

  if (createdSession && guideMode === 'manual') {
    messages.push({
      id: 'step2-manual-choice',
      role: 'user',
      kind: 'text',
      body: MANUAL_CHOICE
    });

    // AI3 안내 말풍선 + 직접 입력 폼은 제출과 동시에 **함께** 사라진다(§5.9 단정 —
    // `3754:3493`에 둘 다 없다). 그래서 카드만 걷는 것이 아니라 메시지를 통째로 뺀다.
    if (!guideDone) {
      messages.push({
        id: 'step2-manual-intro',
        role: 'ai',
        kind: 'text',
        body: MANUAL_INTRO,
        children: (
          <ManualInfoForm
            onSubmit={handleManualSubmit}
            submitting={submitting}
            submitError={submitError}
          />
        )
      });
    }
  }

  if (guideDone) {
    // 제출 결과 사용자 말풍선(§5.9) — 업로드 경로는 장수 요약, 직접 입력 경로는 원문 그대로.
    messages.push(
      guideMode === 'manual'
        ? { id: 'step2-manual-text', role: 'user', kind: 'text', body: manualText }
        : {
            id: 'step2-upload-summary',
            role: 'user',
            kind: 'text',
            body: `안내문 ${uploadedCount}장을 업로드했어요`
          }
    );
  }

  if (guideDone && topicPhase === 'loading') {
    // 문구는 `loadingCopy.js`의 3쌍 중 주제 추천 쌍을 그대로 쓴다(§5.9, `3754:3493` 원문).
    messages.push({
      id: 'step3-loading',
      kind: 'loading',
      payload: PERFORMANCE_LOADING_COPY.topicRecommendation
    });
  }

  // 주제를 확정한 뒤(`designPhase !== 'idle'`)에는 이 메시지가 통째로 빠진다 — §5.12 단정
  // 「추천 주제 카드 3장 + 재추천 버튼이 타임라인에서 **완전히 제거**되고, 사용자 확정
  // 말풍선 + AI 로딩 말풍선만 남는다」. P9는 카드·버튼만 걷고 AI 안내 말풍선을 남겨
  // 뒀는데(§5.12 본편이 P10 몫이었다) 이번에 말풍선까지 건다. 걷지 않으면 로딩 중에도
  // 카드를 눌러 모달을 다시 열거나 재추천을 누를 수 있어 "이미 확정한 주제로 리포트를
  // 만드는 중"이라는 상태와 화면이 어긋난다. 실패 후 `주제 다시 고르기`로 `'idle'`이 되면
  // 그대로 되돌아온다.
  if (guideDone && topicPhase === 'ready' && designPhase === 'idle') {
    messages.push({
      id: 'step3-topics',
      role: 'ai',
      kind: 'text',
      body: guideMode === 'manual' ? TOPIC_RESULT_MANUAL : TOPIC_RESULT_UPLOAD,
      // `주제 다시 고르기`로 되돌아온 뒤에만 포커스 목적지가 된다(위 `topicsFocusPending`).
      focusRef: topicsFocusPending ? topicsReturnRef : undefined,
      children: (
        // §5.10 실측은 말풍선 하단 → 첫 카드 상단이 1.25rem(20)인데 `AiMessage` 컬럼의
        // 기본 gap은 1rem(16)이다(라벨↔말풍선·말풍선↔폼 카드가 전부 16이라 그렇게 고정됐다).
        // 카드 묶음에만 0.25rem을 더해 실측 20을 맞춘다.
        <div className="w-full pt-1">
          <TopicCardList
            topics={topics}
            round={topicRound}
            maxRounds={topicMaxRounds}
            onDetail={handleTopicDetail}
            onRegenerate={handleRegenerate}
            regenerating={topicRegenerating}
            roundLimited={topicRoundLimited}
            error={topicError}
          />
        </div>
      )
    });
  }

  if (guideDone && topicPhase === 'ready' && topicRegenerating && designPhase === 'idle') {
    // 재추천 진행 표시. 최초 추천과 달리 카드 묶음을 **대체하지 않고** 그 아래에 붙는다 —
    // 카드·버튼이 남아 있어야 방금 버튼을 누른 사용자의 포커스가 유지된다.
    // 문구는 최초 추천과 같은 쌍을 쓴다(같은 작업이다).
    messages.push({
      id: 'step3-regenerating',
      kind: 'loading',
      payload: PERFORMANCE_LOADING_COPY.topicRecommendation
    });
  }

  if (confirmedTopic?.title && designPhase !== 'idle') {
    // §5.12 사용자 확정 말풍선. 로딩·완료·실패 어느 상태에서도 남는다 — 확정은 되돌리지 않는
    // 사실이고(되돌리는 것은 실패 후 `주제 다시 고르기`뿐이며 그때는 `confirmedTopic`째
    // 비운다), 로딩 버블만 있고 무엇을 확정했는지 없는 화면은 §5.12 실측과 다르다.
    // 제목을 모르는 복구 경로(`handleResumeConfirmedTopic`의 fallback)에서는 말풍선을
    // 생략한다 — 빈 따옴표만 남은 문장을 만들지 않는다.
    messages.push({
      id: 'step4-confirm',
      role: 'user',
      kind: 'text',
      body: buildConfirmBubble(confirmedTopic.title)
    });
  }

  if (designPhase === 'loading' && confirmedTopic) {
    // STEP4 로딩(§5.12) — 로딩 버블을 재사용한다(`AiLoadingBubble` + `loadingCopy.js`
    // `designReport` 쌍, 새 로딩 UI를 만들지 않는다).
    messages.push({
      id: 'step4-design-loading',
      kind: 'loading',
      payload: PERFORMANCE_LOADING_COPY.designReport,
      // 검토 A-2 — 이 항목이 나타나는 시점에 포커스를 옮긴다(위 `designLoadingRef` 이펙트).
      focusRef: designLoadingRef
    });
  }

  if (designPhase === 'ready') {
    // 모달이 자동으로 열리므로(§5.13 흐름도) 이 말풍선은 **모달을 닫은 뒤** 보이는 화면이다.
    // STEP5 제출폼(§5.14)이 아직 없어 여기서 흐름이 끝나므로, 최소한 리포트로 되돌아갈 길은
    // 남긴다. 다시 열기 버튼은 모달 닫기의 포커스 목적지이기도 하다(`handleCloseDesignModal`).
    messages.push({
      id: 'step4-design-ready',
      role: 'ai',
      kind: 'text',
      body: DESIGN_READY_COPY,
      children: (
        <RetryButton ref={designReopenRef} onClick={handleReopenDesignModal}>
          설계 리포트 다시 보기
        </RetryButton>
      )
    });
  }

  if (designPhase === 'failed') {
    // 실패해도 갇히지 않는다. 두 갈래로 나뉜다:
    //   · `TOPIC_ALREADY_CONFIRMED` — 무엇을 보내도 같은 409다. 유일한 출구는 서버가 알려준
    //     확정 주제로 요청해 저장된 리포트를 여는 것(`handleResumeConfirmedTopic`).
    //     제목은 현재 카드 목록에서 찾아 붙이고, 없으면(다른 라운드의 주제) null로 둔다 —
    //     그러면 확정 말풍선을 생략한다(가짜 제목을 지어내지 않는다).
    //   · 그 외 — 재시도(같은 주제, 멱등)와 주제 재선택.
    const alreadyConfirmedId =
      designError?.code === 'TOPIC_ALREADY_CONFIRMED' ? designError.confirmedTopicId : null;
    const resumeTopic = alreadyConfirmedId
      ? topics.find((topic) => topic.id === alreadyConfirmedId) || { id: alreadyConfirmedId, title: null }
      : null;

    messages.push({
      id: 'step4-design-failed',
      role: 'ai',
      kind: 'text',
      body: designError?.message || DESIGN_FAILED_FALLBACK,
      // 로딩 버블(직전 포커스 보유자)이 언마운트되는 전이라 목적지를 직접 지정한다.
      // 안내 문구와 출구 버튼을 함께 품은 래퍼가 목적지다 — 버튼 하나만 잡으면 "무엇이
      // 일어났는지"(문구)를 건너뛴 채 낭독된다.
      focusRef: designFailedRef,
      children: (
        <div className="flex flex-wrap gap-3">
          {resumeTopic ? (
            <RetryButton onClick={() => handleResumeConfirmedTopic(resumeTopic)}>
              확정한 주제의 리포트 열기
            </RetryButton>
          ) : (
            <>
              <RetryButton onClick={handleRetryDesign}>설계 리포트 다시 시도</RetryButton>
              <RetryButton onClick={handleBackToTopics}>주제 다시 고르기</RetryButton>
            </>
          )}
        </div>
      )
    });
  }

  // ── STEP5 (§5.15 로딩 → §5.16 모달 → §5.17 분기 3버튼) ─────────────────────────────
  //
  // §5.15 「정본 타임라인」 4·5항: **제출폼 카드는 제출과 동시에 타임라인에서 제거하되
  // 사용자 제출 말풍선은 남긴다**(§5.9/§5.12에서 이미 확립된 규칙). 폼 제거는 폼 슬라이스가
  // `evaluationPhase === 'idle'`을 렌더 조건으로 삼는 것으로 성립하고, 남기는 쪽이 여기다.
  if (evaluationPhase !== 'idle') {
    messages.push({ id: 'step5-submit', role: 'user', kind: 'text', body: SUBMIT_BUBBLE });
  }

  if (evaluationPhase === 'loading') {
    // §5.15 로딩 카드 — `AiLoadingBubble` + `loadingCopy.js`의 평가 쌍 그대로(새 로딩 UI를
    // 만들지 않는다). 폼 카드가 사라지는 전이라 포커스 목적지이기도 하다.
    messages.push({
      id: 'step5-eval-loading',
      kind: 'loading',
      payload: PERFORMANCE_LOADING_COPY.evaluationReport,
      focusRef: evaluationLoadingRef
    });
  }

  if (evaluationPhase === 'failed') {
    // 실패해도 갇히지 않는다. 출구는 코드에 따라 갈린다 —
    //   · 상류 장애·네트워크(`MODEL_FAILED` 등) → 같은 제출본으로 재시도(서버가 멱등이다).
    //   · 제출물 게이트(400 3종)          → 재시도는 같은 값을 다시 보내는 것이라 무의미하다.
    //                                        폼을 되돌리는 것이 유일한 출구다.
    //   · 상한·소유권 계열                 → 다시 눌러도 같은 결과라 재시도를 권하지 않는다.
    //                                        이전 리포트가 남아 있으면 그것만이라도 열어 준다.
    const failedCode = evaluationError?.code;
    const canRetry = EVALUATION_RETRYABLE_CODES.has(failedCode);
    const canFixForm = EVALUATION_FIXABLE_CODES.has(failedCode);
    const canReopenReport = !canRetry && !canFixForm && Boolean(evaluationReport);

    messages.push({
      id: 'step5-eval-failed',
      role: 'ai',
      kind: 'text',
      body: evaluationError?.message || EVALUATION_FAILED_FALLBACK,
      // 로딩 버블(직전 포커스 보유자)이 언마운트되는 전이라 목적지를 직접 지정한다. 버튼
      // 하나만 잡으면 "무엇이 일어났는지"(문구)를 건너뛴 채 낭독된다 — 래퍼가 목적지다.
      focusRef: evaluationFailedRef,
      children:
        canRetry || canFixForm || canReopenReport ? (
          <div className="flex flex-wrap gap-3">
            {canRetry ? (
              <RetryButton onClick={handleRetryEvaluation}>평가 다시 시도</RetryButton>
            ) : null}
            {canFixForm ? (
              <RetryButton onClick={handleReevaluate}>제출폼 다시 열기</RetryButton>
            ) : null}
            {canReopenReport ? (
              <RetryButton onClick={handleReopenEvaluationModal}>평가 리포트 다시 보기</RetryButton>
            ) : null}
          </div>
        ) : null
    });
  }

  if (evaluationPhase === 'ready' && evaluationReport) {
    // §5.17 평가 완료 안내 + 분기 3버튼. 모달은 완성 즉시 자동으로 열리므로(§4 플로우)
    // 이 말풍선은 **모달을 닫은 뒤** 보이는 화면이다.
    //
    // **모달 진입점 결정** — §5.17 단정 「평가 리포트 상세 모달(`3754:4512`)을 여는 진입점이
    // 이 화면에 없다」. 진입점을 두 개 둔다:
    //   ① 평가 완료 즉시 자동 오픈(§4 플로우 `EvalLoading --> EvalReport`가 명시한 전이).
    //   ② 이 `평가 리포트 다시 보기` 버튼 — §5.13 설계 리포트가 `설계 리포트 다시 보기`로
    //      만든 관례 그대로이며, 모달 닫기의 포커스 목적지이기도 하다.
    // ②는 §5.17 실측 스택(260×180 = 3버튼 정확히) **바깥**에 둔다. 스택 안에 넣으면 실측
    // 치수가 깨지고, 무엇보다 "다시 보기"는 분기 선택이 아니라 열람이라 위계가 다르다.
    // 그래서 크기도 분기 버튼(3.25rem)이 아니라 `RetryButton`(2.5rem)을 쓴다.
    const evaluationScore =
      typeof evaluationReport.score === 'number' && Number.isFinite(evaluationReport.score)
        ? evaluationReport.score
        : null;
    const reevaluateExhausted = evaluationCount >= maxEvaluations;

    messages.push({
      id: 'step5-eval-ready',
      role: 'ai',
      kind: 'text',
      body: buildEvaluationResultCopy(evaluationScore),
      children: (
        <div className="flex w-full flex-col gap-4 pt-1">
          <RetryButton ref={evaluationReopenRef} onClick={handleReopenEvaluationModal}>
            평가 리포트 다시 보기
          </RetryButton>
          <EvaluationBranchActions
            onReevaluate={handleReevaluate}
            onConfirm={handleConfirmSubmission}
            onNewAssessment={handleNewAssessment}
            busyAction={finalizeAction}
            reevaluateDisabled={reevaluateExhausted}
            // 상한은 서버가 `409 REEVALUATION_LIMIT`으로 막는다(§9.2 상한 = 최초 1 + 재평가 2).
            // 눌러서 실패를 보게 하지 않고 미리 잠그되, 왜 잠겼는지는 말한다.
            reevaluateNote={
              reevaluateExhausted
                ? `평가는 최대 ${Math.max(maxEvaluations - 1, 0)}번까지 다시 받을 수 있어요.`
                : ''
            }
          />
        </div>
      )
    });
  }

  if (finalizeResult) {
    // `이대로 확정짓기` 완료. 분기 버튼은 **그대로 남긴다** — Q67 결정대로 확정 뒤에도
    // 재평가가 열려 있고(같은 세션이라 무료다), 세션을 잠그면 오확정을 되돌릴 수 없다.
    messages.push({
      id: 'step5-finalize-done',
      role: 'ai',
      kind: 'text',
      body: finalizeResult.keptPointer ? FINALIZE_KEPT_POINTER_COPY : FINALIZE_CONFIRMED_COPY,
      focusRef: finalizeDoneRef
    });
  }

  if (finalizeError) {
    messages.push({
      id: 'step5-finalize-failed',
      role: 'ai',
      kind: 'text',
      body: finalizeError.message,
      children: (
        <RetryButton onClick={() => void runFinalize(finalizeError.action)}>다시 시도</RetryButton>
      )
    });
  }

  if (evaluationPhase === 'idle' && reevaluateRound > 0) {
    // `추가 평가 받기` 뒤. 폼(폼 슬라이스가 `'idle'`에서 렌더한다)이 조용히 돌아오기만 하면
    // 방금 본 리포트가 왜 사라졌는지 알 수 없다. 분기 버튼이 통째로 언마운트되는 전이라
    // 포커스 목적지이기도 하다.
    messages.push({
      id: 'step5-reevaluate',
      role: 'ai',
      kind: 'text',
      body: REEVALUATE_RESTORED_COPY,
      focusRef: reevaluateNoticeRef
    });
  }

  // ── STEP5 제출폼(§5.14 `3754:3992`/`3754:4119`) ──────────────────────────────────
  //
  // §4 플로우 `DesignReport --> Step5Form : 창 닫고 작성하기`(L323) — 설계 리포트가
  // 준비되면 폼이 타임라인에 붙는다(모달은 그 위에 겹쳐 열려 있고, 닫으면 이 폼이 남는다).
  // **제출과 동시에 사라진다**(§5.15 정본 타임라인 4항)는 것이 `evaluationPhase === 'idle'`
  // 조건이고, `추가 평가 받기`가 그 값을 되돌리면 작성값(`submissionValue`)이 그대로 남아
  // 있으므로 폼이 그대로 복원된다(§12.2 L2372 — 별도 복원 신호를 두지 않는 이유).
  //
  // **이 블록이 마지막인 이유**: `추가 평가 받기` 복원 안내(`step5-reevaluate`)가 폼보다
  // 먼저 와야 "왜 폼이 다시 열렸는지"를 읽고 폼에 닿는다.
  if (designPhase === 'ready' && evaluationPhase === 'idle') {
    messages.push({
      id: 'step5-form',
      role: 'ai',
      kind: 'text',
      body: SUBMISSION_FORM_INTRO,
      children: submissionSchema ? (
        <SubmissionForm
          schema={submissionSchema}
          value={submissionValue}
          onChange={setSubmissionValue}
          onSaveDraft={handleSaveDraft}
          onSubmit={handleSubmitWork}
          // §5.14 `주제*` 칸은 확정 주제 prefill이다 — 제출 필드가 아니라 표시값이고,
          // 서버는 `performance_sessions.selected_topic_id`로 직접 읽는다(§8.3).
          topicTitle={confirmedTopic?.title || null}
          saving={savingDraft}
          submitting={submittingWork}
          error={submissionActionError}
          savedAt={submissionSavedAt}
        />
      ) : submissionLoadError ? (
        // 스키마 없이 임의의 기본 폼을 그리지 않는다(위 `SUBMISSION_LOAD_FAILED_FALLBACK`).
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-[0.875rem] leading-[1.125rem] text-error">
            {submissionLoadError}
          </p>
          <RetryButton onClick={handleRetrySubmissionLoad}>제출폼 다시 불러오기</RetryButton>
        </div>
      ) : null
    });
  }

  if (guideDone && topicPhase === 'quota') {
    // §5.20 (B): 모달이 아니라 타임라인 안, **AI 말풍선과 같은 정렬**로 넣는다. 말풍선 없이
    // 아바타·발신자 라벨만 두고 카드를 그 컬럼에 붙이면 정렬이 그대로 맞는다.
    messages.push({
      id: 'step3-quota',
      role: 'ai',
      kind: 'text',
      children: <QuotaExhaustedCard planEndsAt={quotaPlanEndsAt} onDismiss={handleQuotaDismiss} />
    });
  }

  if (guideDone && topicPhase === 'dismissed') {
    messages.push({
      id: 'step3-quota-dismissed',
      role: 'ai',
      kind: 'text',
      body: QUOTA_DISMISSED_COPY,
      // 다른 탭에서 이용권을 결제하고 돌아오는 경로가 실제로 있다 — 그때 새로고침 없이
      // 이어갈 수 있게 재시도 버튼을 남긴다. 회차가 그대로면 다시 소진 카드로 돌아간다.
      children: <RetryButton onClick={handleRetryTopics}>주제 추천 다시 시도</RetryButton>
    });
  }

  if (guideDone && topicPhase === 'failed') {
    messages.push({
      id: 'step3-failed',
      role: 'ai',
      kind: 'text',
      body: topicError || '주제를 추천하지 못했어요. 잠시 후 다시 시도해 주세요.',
      // 상한(`ROUND_LIMIT`)에 걸린 실패는 다시 눌러도 같은 결과라 재시도를 권하지 않는다.
      children: topicRoundLimited ? null : (
        <RetryButton onClick={handleRetryTopics}>주제 추천 다시 시도</RetryButton>
      )
    });
  }

  return (
    <div className="mt-10">
      <ChatTimeline messages={messages} />
      <TopicDetailModal
        open={Boolean(topicDetail)}
        topic={topicDetail}
        onClose={handleCloseTopicDetail}
        onConfirm={handleConfirmTopic}
      />
      <DesignReportModal
        open={designModalOpen}
        report={designReport}
        topicTitle={confirmedTopic?.title}
        onClose={handleCloseDesignModal}
      />
      <EvaluationReportModal
        open={evaluationModalOpen}
        report={evaluationReport}
        topicTitle={confirmedTopic?.title}
        onClose={handleCloseEvaluationModal}
      />
    </div>
  );
}

/**
 * "이 조건이 켜지는 순간 이 노드로 포커스를 옮긴다"를 한 줄로 쓰는 헬퍼. 새로 나타난 노드가
 * DOM에 붙은 뒤(같은 렌더 커밋 다음 프레임) 옮겨야 하므로 `requestAnimationFrame`을 쓴다 —
 * `useModalBehavior`의 "열릴 때 첫 포커서블로 이동" 이펙트와 같은 패턴이다.
 *
 * 쓰는 이유는 전부 같다: **직전에 포커스를 갖고 있던 노드가 같은 커밋에서 언마운트되는
 * 전이**라 브라우저 기본 동작(`<body>`로 떨어짐)에 맡기면 키보드 사용자가 위치를 잃는다.
 *
 * @param {boolean} active 포커스를 옮겨야 하는 상태인가.
 * @param {import('react').RefObject<HTMLElement>} ref 목적지(`ChatTimeline`의 `focusRef`).
 * @param {unknown[]} [retriggers] `active`가 켜진 채 유지되지만 **다시** 옮겨야 하는 경우의
 *   추가 의존성(예: 재평가 라운드가 한 번 더 돌 때). 없으면 켜지는 순간에만 옮긴다.
 */
function useRafFocus(active, ref, retriggers = []) {
  useEffect(() => {
    if (!active) return undefined;
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ref, ...retriggers]);
}

/**
 * 재시도 버튼. 시안에 대응 노드가 없어 §5.10 `다른 주제 다시 추천`(h 2.5rem, r0.625rem,
 * stroke `#d9d9d9`, 라벨 0.875rem w500 `#525252`)의 형태만 빌린다. 폭만 실측(8.125rem)을
 * 따르지 않고 내용에 맡긴다 — 라벨이 더 길어 고정폭에 넣으면 글자가 잘린다.
 *
 * `ref`를 받는 이유는 포커스 관리다 — 설계 리포트 모달을 닫을 때 복귀할 자리가 이 버튼이다
 * (`handleCloseDesignModal`). 나머지 호출부는 ref를 넘기지 않는다.
 */
const RetryButton = forwardRef(function RetryButton({ children, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="flex h-10 items-center justify-center rounded-[0.625rem] border border-performance-line bg-white px-4 text-[0.875rem] font-medium leading-[1.125rem] text-ink transition-colors hover:border-ink-sub"
    >
      {children}
    </button>
  );
});
