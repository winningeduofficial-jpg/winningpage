// [B-1] 회원유형 선택 — docs/login-signup-renewal-spec.md §3.3 B-1, 노드 2393:7714.
// 학생 회원 / 학부모 회원 선택 → SignupContext에 memberType 저장 후 다음 단계로 이동.
// 학생: /signup/student/birth (B-2, 생년월일 입력 → 연령 분기).
// 학부모: /signup/parent (E-1) — §3.3 B-2 주석대로 학부모는 만 19세 이상 전제라 생년월일
// 단계를 거치지 않는다(§5.2 라우트 표에도 /signup/parent/birth 없음).
// icon: Figma 일러스트 에셋(image 282/283)은 T1 단계에서 재추출되지 않아 제공되지 않는다
// (§6.2) — 임시로 lucide-react 아이콘을 자리표시자로 사용. 실제 일러스트 확보 시 교체 필요.
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Users } from 'lucide-react';
import { AuthLayout, AuthTitle, ChoiceCard, TextLinkButton } from '../../components/auth';
import { useSignup } from '../../context/SignupContext';

export default function MemberType() {
  const navigate = useNavigate();
  const { setMemberType } = useSignup();

  function handleSelect(memberType) {
    setMemberType(memberType);

    if (memberType === 'student') {
      navigate('/signup/student/birth');
    } else {
      navigate('/signup/parent');
    }
  }

  return (
    <AuthLayout>
      <AuthTitle
        line1="성공적인 진학의 시작,"
        line1Color="primary"
        line2="위닝에듀에 오신 것을 환영해요"
        line2Color="ink"
      />

      <div className="flex flex-row gap-3">
        <ChoiceCard
          size="lg"
          icon={<GraduationCap className="h-[3.5rem] w-[3.5rem] text-primary" strokeWidth={1.5} />}
          title="학생 회원"
          description="진학 성공을 준비하는 학생이라면"
          onClick={() => handleSelect('student')}
        />

        <ChoiceCard
          size="lg"
          icon={<Users className="h-[3.5rem] w-[3.5rem] text-primary" strokeWidth={1.5} />}
          title="학부모회원"
          description="학생 회원의 자녀가 있다면"
          onClick={() => handleSelect('parent')}
        />
      </div>

      <p className="text-base text-ink">
        위닝에듀 회원이신가요?{' '}
        <TextLinkButton as="link" to="/login" tone="primary" size="md" weight="semibold">
          로그인
        </TextLinkButton>
      </p>
    </AuthLayout>
  );
}
