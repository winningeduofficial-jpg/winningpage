// [E-3] 자녀 연결코드 입력 — docs/login-signup-renewal-spec.md §3.3 E-3.
// 노드 3상태: 2393:10864(빈) / 2393-10969(코드 입력·자녀 인식) / 2393-11078(자녀 선택·활성).
// 6자리 입력이 완성되면 mockApi.findChildByLinkCode로 자동 조회(→ found 상태, 입력 필드
// border-primary + 미리보기 카드 노출), 카드를 클릭하면 selected 상태로 전환되며 그때만
// "연결하기" 버튼이 활성화된다("§3.3 미해결: 자녀 인식 후 카드 클릭이 선택 상호작용인지" —
// 별도 상호작용으로 채택, 카드 클릭=선택으로 구현).
// 버튼 빈 상태 라벨의 선행 공백(" 코드 6자리를 입력하세요")은 §6.3 이슈 목록에 원본 그대로
// 기록된 문구를 그대로 재현한 것.
// TODO(백엔드 §4.2-3): 연결코드 발급/조회 RPC, 보호자-자녀 관계 테이블 미구현 — mockApi.js
// 의 findChildByLinkCode/connectChild는 전부 placeholder.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AuthLayout,
  AuthTitle,
  TextField,
  PrimaryButton,
  ChildPreviewCard
} from '../../../components/auth';
import { useSignup } from '../../../context/SignupContext';
import { findChildByLinkCode, connectChild } from './mockApi';

export default function LinkCode() {
  const navigate = useNavigate();
  const { memberType } = useSignup();

  useEffect(() => {
    if (memberType !== 'parent') {
      navigate('/signup', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberType]);

  const [code, setCode] = useState('');
  const [child, setChild] = useState(null);
  const [selected, setSelected] = useState(false);
  const [looking, setLooking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (code.length !== 6) {
      setChild(null);
      setSelected(false);
      setNotFound(false);
      return;
    }

    let cancelled = false;
    setLooking(true);
    setNotFound(false);

    findChildByLinkCode(code).then((result) => {
      if (cancelled) return;
      setLooking(false);

      if (result) {
        setChild(result);
        setSelected(false);
      } else {
        setChild(null);
        setSelected(false);
        setNotFound(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code]);

  function handleChange(value) {
    setCode(value.replace(/\D/g, '').slice(0, 6));
  }

  async function handleConnect() {
    if (!selected || connecting) return;

    setConnecting(true);
    await connectChild(code);
    setConnecting(false);

    navigate('/signup/parent/link/done', { state: { child } });
  }

  const buttonLabel = child || code.length === 6 ? '연결하기' : ' 코드 6자리를 입력하세요';

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-3 text-center">
        <AuthTitle line1="자녀의 연결코드를 입력해 주세요" />
        <p className="text-xl font-medium text-ink">
          자녀 마의페이지 &gt; 연결코드에서
          <br />
          6자리 숫자를 확인할 수 있어요
        </p>
      </div>

      <div className="flex w-full flex-col gap-5">
        <TextField
          id="linkCode"
          name="linkCode"
          size="lg"
          value={code}
          onChange={handleChange}
          placeholder="6자리 연결코드를 입력해 주세요"
          active={!!child}
          helperText={notFound ? '일치하는 연결코드를 찾을 수 없습니다' : undefined}
          status={notFound ? 'error' : 'default'}
        />

        {child && (
          <ChildPreviewCard
            name={child.name}
            grade={child.grade}
            school={child.school}
            selected={selected}
            avatarSize={selected ? 'lg' : 'default'}
            onClick={() => setSelected((prev) => !prev)}
          />
        )}

        <PrimaryButton
          size="lg"
          radius="lg"
          onClick={handleConnect}
          disabled={!selected || connecting || looking}
        >
          {buttonLabel}
        </PrimaryButton>
      </div>
    </AuthLayout>
  );
}
