// [E-4] 자녀 연결 완료(요약 카드) — docs/login-signup-renewal-spec.md §3.3 E-4, 노드 2393-11191.
// LinkCode(E-3)에서 navigate state로 전달된 child 정보를 받아 렌더한다. 학습 요약 지표
// (주간 진도/학습 시간/모의고사)는 현 스키마에 데이터 소스가 없어(§4.1/§4.2-6 GAP) 시안
// 예시값을 그대로 mock 표시 — 실제 지표 연동은 별도 백엔드 설계 필요.
// 요약 카드 자체는 T1 공용 컴포넌트 목록(§5.1)에 없는 화면 전용 레이아웃이라 이 페이지 안에서
// 직접 구성한다(border-line, radius 20px, 구분선 320px, 지표 3열 gap 66px).
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthTitle, OutlineButton, TextLinkButton } from '../../../components/auth';
import { useSignup } from '../../../context/SignupContext';

// TODO(백엔드): 자녀 학습 요약 지표 데이터 소스 미정 — 시안 예시값을 그대로 mock 표시.
const MOCK_METRICS = [
  { value: '82%', label: '주간 진도' },
  { value: '14시간', label: '학습 시간' },
  { value: '2등급', label: '모의고사' }
];

export default function LinkDone() {
  const navigate = useNavigate();
  const location = useLocation();
  const { memberType, resetSignup } = useSignup();

  const child = location.state?.child || null;

  useEffect(() => {
    if (memberType !== 'parent') {
      navigate('/signup', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberType]);

  function handleGoHome() {
    resetSignup();
    navigate('/');
  }

  return (
    <AuthLayout>
      <AuthTitle
        line1="안녕하세요,"
        line1Color="ink"
        line2={child ? `${child.name} 학부모님` : '학부모님'}
        line2Color="ink"
      />

      <div className="w-full rounded-[1.25rem] border border-line px-8 py-8 text-center">
        <p className="text-xl font-medium text-ink-title">{child?.name}</p>
        <p className="mt-2 text-base text-ink-sub">
          {[child?.grade, child?.school].filter(Boolean).join(' / ')}
        </p>

        <div className="mx-auto my-6 w-[20rem] border-t border-line" />

        <div className="flex flex-row justify-center gap-[4.125rem]">
          {MOCK_METRICS.map((metric) => (
            <div key={metric.label} className="flex flex-col items-center gap-1">
              <p className="text-2xl font-medium text-ink">{metric.value}</p>
              <p className="text-base text-line">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>

      <TextLinkButton
        onClick={() => navigate('/signup/parent/link/add', { state: { childName: child?.name } })}
        tone="primary"
        size="md"
      >
        + 자녀 추가하기
      </TextLinkButton>

      <OutlineButton onClick={handleGoHome} tone="muted" radius="xl">
        홈으로 가기
      </OutlineButton>
    </AuthLayout>
  );
}
