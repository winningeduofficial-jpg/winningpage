import { useEffect, useState } from 'react';
import { useSession } from '../../context/SessionContext';
import ChatTimeline from '../../components/performance/chat/ChatTimeline';
import AiLoadingBubble from '../../components/performance/chat/AiLoadingBubble';
import InlineCard from '../../components/performance/chat/InlineCard';
import { PERFORMANCE_LOADING_COPY } from '../../components/performance/chat/loadingCopy';
import BasicInfoForm from '../../components/performance/step1/BasicInfoForm';
import GuideUploadCard from '../../components/performance/step2/GuideUploadCard';
import ManualInfoForm from '../../components/performance/step2/ManualInfoForm';
import TopicCardList from '../../components/performance/step3/TopicCardList';
import QuotaExhaustedCard from '../../components/performance/quota/QuotaExhaustedCard';
import {
  analyzeGuideUpload,
  submitManualGuide,
  uploadGuidePhotos
} from '../../lib/performance/guideUpload';
import { recommendTopics } from '../../lib/performance/topics';

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
//   · §5.11 주제 상세 모달 — P9. 카드는 `onDetail` 콜백만 부르고 여는 쪽은 아직 없다.
//   · §5.20 (A) 셸 상단 회차 배너 — 셸(`PerformanceAppLayout`) 소관이라 여기서 만들지 않는다.
//     이 페이지가 담당하는 것은 (B) 인라인 소진 카드뿐이다.

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
  //   'loading'   추천/재추천 진행 중 → `AiLoadingBubble`(§5.9).
  //   'ready'     3카드 렌더(§5.10).
  //   'quota'     `409 QUOTA_EXHAUSTED` → 인라인 소진 카드(§5.20 (B)).
  //   'dismissed' 소진 카드를 `나중에 하기`로 닫은 뒤.
  //   'failed'    소진 외 실패 + 보여 줄 주제가 아직 없음 → 재시도 안내.
  const [topicPhase, setTopicPhase] = useState('idle');
  const [topics, setTopics] = useState([]);
  const [topicRound, setTopicRound] = useState(0);
  const [topicMaxRounds, setTopicMaxRounds] = useState(3);
  const [topicRoundLimited, setTopicRoundLimited] = useState(false);
  const [topicError, setTopicError] = useState(null);
  const [quotaPlanEndsAt, setQuotaPlanEndsAt] = useState(null);

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
   * @param {{isRegenerate?: boolean}} [options] `isRegenerate`면 실패 시 이미 받은 3카드
   *   화면으로 되돌리고 실패 사유만 카드 아래 한 줄로 알린다(있던 결과를 실패로 지우지 않는다).
   */
  async function requestTopics({ isRegenerate = false } = {}) {
    if (!accessToken || !createdSession) return;

    setTopicPhase('loading');
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
   * (§11.1 Q48). 모달 자체는 P9 슬라이스에서 붙는다.
   */
  function handleTopicDetail(topic) {
    // TODO(P9): `TopicDetailModal`을 열고 확정 시 `design-report`로 넘긴다.
    console.info('[performance] TODO(P9) 주제 상세 모달:', topic?.id);
  }

  /** `다른 주제 다시 추천`(§5.10) — 같은 엔드포인트 재호출. 회차는 깎이지 않는다(§9.3). */
  function handleRegenerate() {
    if (topicPhase === 'loading') return;
    void requestTopics({ isRegenerate: true });
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

  if (guideDone && topicPhase === 'ready') {
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
            roundLimited={topicRoundLimited}
            error={topicError}
          />
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
      children: <RetryButton onClick={() => requestTopics()}>주제 추천 다시 시도</RetryButton>
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
        <RetryButton onClick={() => requestTopics()}>주제 추천 다시 시도</RetryButton>
      )
    });
  }

  return (
    <div className="mt-10">
      <ChatTimeline messages={messages} />
    </div>
  );
}

/**
 * 재시도 버튼. 시안에 대응 노드가 없어 §5.10 `다른 주제 다시 추천`(h 2.5rem, r0.625rem,
 * stroke `#d9d9d9`, 라벨 0.875rem w500 `#525252`)의 형태만 빌린다. 폭만 실측(8.125rem)을
 * 따르지 않고 내용에 맡긴다 — 라벨이 더 길어 고정폭에 넣으면 글자가 잘린다.
 */
function RetryButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center justify-center rounded-[0.625rem] border border-performance-line bg-white px-4 text-[0.875rem] font-medium leading-[1.125rem] text-ink transition-colors hover:border-ink-sub"
    >
      {children}
    </button>
  );
}
