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
import QuotaExhaustedCard from '../../components/performance/quota/QuotaExhaustedCard';
import {
  analyzeGuideUpload,
  submitManualGuide,
  uploadGuidePhotos
} from '../../lib/performance/guideUpload';
import { recommendTopics } from '../../lib/performance/topics';
import { requestDesignReport } from '../../lib/performance/designReport';

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

  async function handleSubmit(values) {
    if (!accessToken || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/performance/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ action: 'create', basicInfo: values })
      });

      const data = await response.json().catch(() => null);

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

  const messages = [
    {
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
    }
  ];

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
    </div>
  );
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
