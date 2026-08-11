import { useEffect, useState } from 'react';
import { useSession } from '../../context/SessionContext';
import ChatTimeline from '../../components/performance/chat/ChatTimeline';
import AiLoadingBubble from '../../components/performance/chat/AiLoadingBubble';
import InlineCard from '../../components/performance/chat/InlineCard';
import BasicInfoForm from '../../components/performance/step1/BasicInfoForm';
import GuideUploadCard from '../../components/performance/step2/GuideUploadCard';
import ManualInfoForm from '../../components/performance/step2/ManualInfoForm';
import {
  analyzeGuideUpload,
  submitManualGuide,
  uploadGuidePhotos
} from '../../lib/performance/guideUpload';

// STEP1~STEP2 화면 — docs/수행평가-상세-명세.md §5.5(`3754:3206`) / §5.6(`3754:3261`) /
// §5.7(`3754:3315`) / §5.8(`3754:3370`·`3754:3431`) 문구 원문 조립.
// `App.jsx`의 `/app/performance` 라우트가 `PerformancePlaceholder` 대신 이 컴포넌트를 쓴다.
//
// **이 페이지가 하는 일**: bootstrap으로 인사말에 쓸 이름을 얻고, 타임라인을 단계별로
// 누적하면서 세 개의 서버 호출을 붙인다 —
//   STEP1 제출 → `POST /api/performance/session`
//   STEP2 업로드 분기 → `upload-url` ×N → `uploadToSignedUrl` ×N → `analyze-guide`
//                       (묶음 처리와 실패 롤백은 `src/lib/performance/guideUpload.js`)
//   STEP2 직접 입력 분기 → `analyze-guide`의 `{ sessionId, freetext }` 분기
//
// **타임라인 누적 규칙**(§5.6/§5.8 실측)
//   · STEP1 폼 카드는 세션이 만들어지면 사라지고, 그 자리에 입력 요약 **사용자 말풍선**이
//     들어간다(`3754:3261`에 폼 카드가 없다).
//   · `안내문 없이 시작하기`를 누르면 **업로드 카드가 타임라인에서 제거되고**(축소·비활성
//     잔존이 아니라 노드 자체가 없다) 직전 AI2 말풍선은 그대로 남으며, 사용자 말풍선
//     `안내문 없이 시작할게요` + AI3 + 직접 입력 폼이 이어 붙는다(§5.8 단정).
//
// **이 페이지가 안 하는 일 (다음 슬라이스 몫)**:
//   · §5.3/§5.4 재방문 분기(이어서 하기/새로 시작하기) — P13. 여기서는 `lastSession`/
//     `latestDraft` 유무와 무관하게 항상 STEP1 인사말+폼을 그대로 보여준다.
//   · 이전 값 프리필 — P13. `initialValues`를 비워 둔 채로 `BasicInfoForm`에 넘긴다.
//   · STEP3(주제 추천) — P8. STEP2가 끝나면 완료 안내 한 줄만 남긴다.
//   · §5.9의 "제출 시 폼 카드 + 직전 AI 말풍선까지 제거" 규칙 — 그 노드(`3754:3493`)가
//     STEP3 로딩 화면이라 P8에서 그 화면과 함께 다룬다. 여기서는 카드만 걷는다.

// §5.6 문구 원문. 두 줄로 쓰인 그대로 보존한다(`좋아요.` 뒤 줄바꿈).
const GUIDE_INTRO =
  '좋아요.\n수행평가 안내문 사진을 올리거나, 안내문 없이 직접 정보를 입력해서 시작할 수 있습니다.';

// §5.8 문구 원문. 사용자 말풍선과 AI3 안내 — AI3 문구는 직접 입력 폼의 placeholder와
// 완전히 동일하다(§5.8 단정). 중복으로 보고 줄이지 말 것.
const MANUAL_CHOICE = '안내문 없이 시작할게요';
const MANUAL_INTRO = '수행평가 유형, 제출 형식, 평가 기준, 필수 포함 내용 등을 적어주세요.';

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
      setGuideDone(true);
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
      setGuideDone(true);
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

    messages.push({
      id: 'step2-manual-intro',
      role: 'ai',
      kind: 'text',
      body: MANUAL_INTRO,
      children: guideDone ? null : (
        <ManualInfoForm
          onSubmit={handleManualSubmit}
          submitting={submitting}
          submitError={submitError}
        />
      )
    });
  }

  if (guideDone) {
    // TODO(P8): STEP3(주제 추천) 로딩·3카드 화면이 아직 없다. 안내문 정보는 이미
    // 서버에 저장됐으므로(§8.6 analyze-guide, 무차감) 여기서는 완료 상태만 알린다.
    messages.push({
      id: 'step2-done',
      role: 'ai',
      kind: 'text',
      body: '안내문 정보를 저장했어요. 다음 단계(주제 추천) 화면은 준비 중입니다.'
    });
  }

  return (
    <div className="mt-10">
      <ChatTimeline messages={messages} />
    </div>
  );
}
