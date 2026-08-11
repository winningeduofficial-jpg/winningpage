import { useEffect, useState } from 'react';
import { useSession } from '../../context/SessionContext';
import ChatTimeline from '../../components/performance/chat/ChatTimeline';
import AiLoadingBubble from '../../components/performance/chat/AiLoadingBubble';
import InlineCard from '../../components/performance/chat/InlineCard';
import BasicInfoForm from '../../components/performance/step1/BasicInfoForm';

// STEP1 화면의 뼈대 — docs/수행평가-상세-명세.md §5.5(`3754:3206`) 문구 원문 조립.
// `App.jsx`의 `/app/performance` 라우트가 `PerformancePlaceholder` 대신 이 컴포넌트를 쓴다.
//
// **이 페이지가 하는 일**: bootstrap으로 인사말에 쓸 이름을 얻고, AI 인사말 + 폼 카드
// 한 세트를 `ChatTimeline`에 올린 뒤 제출을 `POST /api/performance/session`으로 넘긴다.
//
// **이 페이지가 안 하는 일 (다음 슬라이스 몫)**:
//   · §5.3/§5.4 재방문 분기(이어서 하기/새로 시작하기) — P13. 여기서는 `lastSession`/
//     `latestDraft` 유무와 무관하게 항상 STEP1 인사말+폼을 그대로 보여준다.
//   · 이전 값 프리필 — P13. `initialValues`를 비워 둔 채로 `BasicInfoForm`에 넘긴다.
//   · 제출 성공 후 STEP2(안내문 업로드) 전이 — P7. 아직 그 화면·라우트가 없으므로
//     세션 생성 성공 상태만 인라인으로 보여주고 실제 이동은 TODO로 남긴다.
export default function PerformanceChatPage() {
  const { session } = useSession();
  const accessToken = session?.access_token || null;

  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [profileName, setProfileName] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [createdSession, setCreatedSession] = useState(null);

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

  return (
    <div className="mt-10">
      <ChatTimeline
        messages={[
          {
            id: 'step1-greeting',
            role: 'ai',
            kind: 'text',
            body: greetingBody,
            children: (
              <InlineCard>
                {createdSession ? (
                  // TODO(P7): 안내문 업로드(STEP2) 화면·라우트가 아직 없다. 세션은 이미
                  // 만들어졌으니(§9.3 「세션 생성 | 없음」 — 회차 미차감) 여기서는 성공
                  // 상태만 보여주고 실제 다음 화면 전이는 P7에서 배선한다.
                  <p className="text-[1rem] font-medium leading-[1.3125rem] text-ink">
                    기본 정보가 저장됐어요. 다음 단계(안내문 업로드) 화면은 준비 중입니다.
                  </p>
                ) : (
                  <BasicInfoForm onSubmit={handleSubmit} submitting={submitting} submitError={submitError} />
                )}
              </InlineCard>
            )
          }
        ]}
      />
    </div>
  );
}
