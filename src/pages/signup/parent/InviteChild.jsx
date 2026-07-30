// [E-6] 자녀 초대 입력 — docs/login-signup-renewal-spec.md §3.3 E-6, 노드 2393:11541.
// 다른 화면(py 100/gap 40)과 달리 py 200/gap 80(spacingY/gap override) — 스펙 명시값 그대로 적용.
// 헬퍼 텍스트의 "발생돼요"/"링크를직접" 오탈자는 §6.3 이슈 목록에 원문 그대로 기록된 문구를
// 그대로 재현("Figma 문구는 오타 포함 원문 그대로 인용한다" 원칙).
// 초대 대상은 학부모 본인 계정 정보(SignupContext.formData)와 무관한 자녀 개인 정보이므로
// 컨텍스트에 넣지 않고 이 페이지 로컬 상태로만 관리한다.
// TODO(백엔드 §4.2-3): 초대 레코드 생성/SMS 발송은 전부 신규 백엔드 — mockApi.sendChildInvite는
// placeholder. 초대 링크는 토큰 딥링크(`/join/:code`)가 아니라 공통 가입 링크 발송으로
// 확정(2026-07-30 기획 결정).
// NOTE: 공통 링크 방식에서는 아래 "자동으로 연결돼요" 문구가 가리키는 가입-연결 자동화가
// 토큰 없이는 불가능함 — 실제로는 가입 후 연결코드로 연결하는 흐름이 되어야 하며 이 동작은
// 백엔드/기획 확정 필요(문구 자체는 Figma 시안 원문이라 수정하지 않음).
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthTitle, TextField, PrimaryButton, InfoCard } from '../../../components/auth';
import { useSignup } from '../../../context/SignupContext';
import { sendChildInvite } from './mockApi';

const PHONE_REGEX = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;

export default function InviteChild() {
  const navigate = useNavigate();
  const location = useLocation();
  const { memberType, parentSignupCompleted } = useSignup();

  // memberType 단독 가드는 실제 가입 완료 없이도 URL 직접 진입으로 뚫릴 수 있어
  // parentSignupCompleted(ParentForm 가입 성공 시에만 true)를 함께 요구한다.
  useEffect(() => {
    if (memberType !== 'parent' || !parentSignupCompleted) {
      navigate('/signup', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberType, parentSignupCompleted]);

  const [name, setName] = useState(location.state?.childName || '');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);

  const canSubmit = name.trim() && PHONE_REGEX.test(phone);

  async function handleSubmit() {
    if (!canSubmit || sending) return;

    setSending(true);
    const { inviteUrl } = await sendChildInvite({ name, phone });
    setSending(false);

    navigate('/signup/parent/invite/done', { state: { childName: name, inviteUrl } });
  }

  return (
    <AuthLayout spacingY="12.5rem" gap="5rem">
      <div className="flex flex-col items-center gap-3 text-center">
        <AuthTitle line1="아직 회원이 아닌 자녀에게" line2="초대를 보낼게요" />
        <p className="text-xl font-medium text-ink">
          초대 링크로 자녀가 직접 가입하면 자동으로 연결돼요
        </p>
      </div>

      <div className="flex w-full flex-col gap-5">
        <TextField
          label="자녀 이름"
          id="childName"
          name="childName"
          size="lg"
          value={name}
          onChange={setName}
          placeholder="이름을 입력 해주세요"
          required
        />

        <TextField
          label="자녀 전화번호"
          id="childPhone"
          name="childPhone"
          type="tel"
          size="lg"
          value={phone}
          onChange={setPhone}
          placeholder="전화번호를 입력 해주세요"
          helperText="입력한 번호로 초대 문자가 발생돼요. 링크를직접 복사해 전달할 수도 있어요."
          required
        />

        <InfoCard variant="info" radius="lg">
          💡 만 14세 미만 자녀는 개인정보보호법에 따라 가입 시 법정대리인(보호자) 동의가
          필요해요. 자녀가 링크로 가입할 때 동의 절차가 함께 진행돼요.
        </InfoCard>

        <PrimaryButton size="lg" onClick={handleSubmit} disabled={!canSubmit || sending}>
          문자로 초대 보내기
        </PrimaryButton>
      </div>
    </AuthLayout>
  );
}
