// [D-2] 14세 미만 회원가입 폼(학생 정보+학부모 정보+약관 동의) —
// docs/login-signup-renewal-spec.md §3.3 D-2, 노드 2393-8759=2393-9007(중복 프레임).
//
// C-1(14세 이상 폼)과의 차이(§3.3 D-2 "C-1과의 차이"):
//  - 전화번호 필드에 인증 링크 없음. 대신 체크박스 "학생 명의의 핸드폰이 없어요".
//  - 전화번호 인증번호 필드 없음.
//  - "학부모 정보 (필수)" 섹션 추가(전화번호 + 수집 안내 + 법정대리인 동의 체크).
// 약관 동의 항목은 D-2 전용 차이가 스펙에 기록돼 있지 않아 C-1(학생 6항목 중 필수3/선택2 —
// 7825 정본 채택분)과 동일 구성으로 채택한다.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import {
  AuthLayout,
  AuthTitle,
  TextField,
  SelectField,
  PrimaryButton,
  InfoCard,
  AgreementList
} from '../../components/auth';
import { useSignup } from '../../context/SignupContext';
// AS-IS Signup.jsx(§2.2)의 17개 시도 + '기타' select 관례를 StudentForm(C-1)과 공유한다
// (§3.3 C-1 예시 데이터 "울산"과 표기 형식 일치 — "울산광역시"가 아닌 "울산").
import { REGION_OPTIONS } from './StudentForm';

// AS-IS 재학구분 enum(§2.2: "초·중·고·N수생·기타") 그대로 채택.
const SCHOOL_TYPE_OPTIONS = ['초등학교', '중학교', '고등학교', 'N수생', '기타'];

// §3.3 C-1 약관 6행 중 7825 정본 기준(본인 인증을 위한 정보 수집) — §5.2 약관 라우트 표
// (/terms/student/{service|privacy|identity|marketing|promotion}) 그대로 매핑.
const STUDENT_AGREEMENT_ITEMS = [
  { key: 'service', label: '위닝에듀 이용약관', required: true, to: '/terms/student/service' },
  { key: 'privacyRequired', label: '개인정보 수집 및 이용', required: true, to: '/terms/student/privacy' },
  { key: 'identityRequired', label: '본인 인증을 위한 정보 수집', required: true, to: '/terms/student/identity' },
  { key: 'marketing', label: '마케팅 목적의 개인정보 수집 및 이용', required: false, to: '/terms/student/marketing' },
  { key: 'ads', label: '광고성 정보 수신 동의', required: false, to: '/terms/student/promotion' }
];

// "학생 명의의 핸드폰이 없어요"(16px 아이콘/12px 텍스트) / "법정대리인 정보를 학부모 정보로
// 수집합니다"(#7a7a7a) 두 곳에서만 쓰는 단독 체크 문구라 공용 컴포넌트로 승격하지 않고
// 이 파일 안에 비공개로 둔다(AS-IS Signup.jsx의 파일 내부 CheckBox 관례와 동일).
function InlineCheckbox({ checked, onToggle, children }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left">
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          checked ? 'border-primary bg-primary text-white' : 'border-line bg-white text-transparent'
        }`}
      >
        <Check size={11} strokeWidth={3} />
      </span>
      {/* #7a7a7a는 신규 토큰에 없어 가장 근접한 ink-sub(#808080)로 대체 — 임의 hex 금지 규칙 준수. */}
      <span className="text-xs text-ink-sub">{children}</span>
    </button>
  );
}

export default function Under14Form() {
  const navigate = useNavigate();
  const {
    memberType,
    verification,
    formData,
    agreements,
    updateFormData,
    updateAgreements,
    setAllAgreements
  } = useSignup();

  // §3.2 흐름: S1(생년월일) -> U0(PASS 안내) -> U1(이 화면). 학생 유형이 아니거나 법정대리인
  // PASS 인증을 아직 마치지 않은 상태로 직접 URL 진입 시 순서대로 되돌린다.
  useEffect(() => {
    if (memberType !== 'student') {
      navigate('/signup', { replace: true });
      return;
    }
    if (!verification.pass.verified) {
      navigate('/signup/student/under14/verify', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberType, verification.pass.verified]);

  const requiredKeys = useMemo(
    () => STUDENT_AGREEMENT_ITEMS.map((item) => item.key),
    []
  );
  const allChecked = useMemo(
    () => STUDENT_AGREEMENT_ITEMS.every((item) => agreements[item.key]),
    [agreements]
  );

  // TODO: 버튼 활성화 조건이 시안에 명시돼 있지 않음(§3.3 D-2: "빈 폼 기본만 존재... 확인
  // 필요"). 필수 필드 전부 입력 + 필수 약관 전부 동의를 임시 기준으로 채택 — 실제 검증 규칙은
  // 디자이너/기획 확인 후 교체할 것. noOwnPhone 체크 시 전화번호 필수 여부도 시안에 없어
  // 보수적으로 "체크 시 면제"로만 처리했다.
  const isNextEnabled =
    formData.name.trim() !== '' &&
    (formData.noOwnPhone || formData.phone.trim() !== '') &&
    formData.email.trim() !== '' &&
    formData.emailCode.trim() !== '' &&
    formData.password.trim() !== '' &&
    formData.region !== '' &&
    formData.schoolType !== '' &&
    formData.schoolName.trim() !== '' &&
    formData.guardianPhone.trim() !== '' &&
    formData.guardianConsent &&
    STUDENT_AGREEMENT_ITEMS.filter((item) => item.required).every((item) => agreements[item.key]);

  const [showNextComingSoon, setShowNextComingSoon] = useState(false);

  // TODO(다음 단계 미확정): §3.3 D-2 "U1 -> U2 다음 단계(화면 데이터 없음 — 확인 필요)".
  // 실제 다음 라우트/제출 시퀀스가 정해지기 전까지 스텁으로 남겨두되, ParentForm의 "준비
  // 중" 안내 패턴과 동일하게 클릭 시 사용자에게 안내 문구를 노출한다.
  function handleNext() {
    setShowNextComingSoon(true);
  }

  return (
    <AuthLayout>
      {/* TODO: C-1/D-2 두 화면 모두 스펙에 타이틀 원문이 명시돼 있지 않음(§3.3 C-1/D-2에
          타이틀 문구 인용 없음) — 동일 역할의 E-1(학부모 폼) 타이틀 "회원가입 정보를
          입력해주세요"를 임시로 재사용. 디자이너 확인 후 교체할 것. */}
      <AuthTitle line1="회원가입 정보를 입력해주세요" />

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">
          학생 정보 <span className="text-primary">(필수)</span>
        </h2>

        <TextField
          label="이름"
          id="under14-name"
          name="name"
          size="lg"
          value={formData.name}
          onChange={(v) => updateFormData({ name: v })}
          placeholder="이름을 입력 해주세요"
        />

        <div className="flex flex-col gap-2">
          <TextField
            label="전화번호"
            id="under14-phone"
            name="phone"
            size="lg"
            value={formData.phone}
            onChange={(v) => updateFormData({ phone: v })}
            placeholder="전화번호를 입력 해주세요"
            disabled={formData.noOwnPhone}
          />

          {/* C-1과 달리 인증번호 발송 링크 대신 체크박스 — 체크/해제 시 UI 변화는 시안에
              정의돼 있지 않아(§3.3 D-2 "확인 필요") 필드 비활성화만 임시로 연결했다. */}
          <InlineCheckbox
            checked={formData.noOwnPhone}
            onToggle={() => updateFormData({ noOwnPhone: !formData.noOwnPhone })}
          >
            학생 명의의 핸드폰이 없어요
          </InlineCheckbox>
        </div>

        <TextField
          label="아이디(이메일)"
          id="under14-email"
          name="email"
          type="email"
          size="lg"
          value={formData.email}
          onChange={(v) => updateFormData({ email: v })}
          placeholder="이메일을 입력 해주세요"
          actionLabel="인증번호 보내기"
          onAction={() => {
            // TODO: 이메일 인증코드 발송 연동(기존 Supabase OTP 시퀀스 재사용 — §5.5 순서 5).
          }}
        />

        <TextField
          label="이메일 인증코드"
          id="under14-email-code"
          name="emailCode"
          size="lg"
          value={formData.emailCode}
          onChange={(v) => updateFormData({ emailCode: v })}
          placeholder="이메일 인증코드 6자리를 입력해주세요"
        />

        <TextField
          label="비밀번호"
          id="under14-password"
          name="password"
          type="password"
          size="lg"
          value={formData.password}
          onChange={(v) => updateFormData({ password: v })}
          placeholder="비밀번호를 입력 해주세요"
          helperText="영문/숫자/특수문자 포함 6자 이상"
          autoComplete="new-password"
        />

        <SelectField
          label="지역"
          id="under14-region"
          name="region"
          size="lg"
          value={formData.region}
          onChange={(v) => updateFormData({ region: v })}
          options={REGION_OPTIONS}
          placeholder="지역을 선택해주세요"
        />

        <SelectField
          label="재학 구분"
          id="under14-school-type"
          name="schoolType"
          size="lg"
          value={formData.schoolType}
          onChange={(v) => updateFormData({ schoolType: v })}
          options={SCHOOL_TYPE_OPTIONS}
          placeholder="재학 구분 선택"
        />

        <TextField
          label="재학 중인 학교"
          id="under14-school-name"
          name="schoolName"
          size="lg"
          value={formData.schoolName}
          onChange={(v) => updateFormData({ schoolName: v })}
          placeholder="학교명 입력"
        />
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">
          학부모 정보 <span className="text-primary">(필수)</span>
        </h2>

        <TextField
          label="전화번호"
          id="under14-guardian-phone"
          name="guardianPhone"
          size="lg"
          value={formData.guardianPhone}
          onChange={(v) => updateFormData({ guardianPhone: v })}
          placeholder="전화번호를 입력 해주세요"
        />

        <InfoCard variant="info">
          [학부모 휴대폰번호 수집 안내] 위닝에듀 서비스 이용에 필요한 안내와 공지사항을 제공하기
          위해 학부모(법정대리인)의 휴대폰번호를 수집합니다.
        </InfoCard>

        <InlineCheckbox
          checked={formData.guardianConsent}
          onToggle={() => updateFormData({ guardianConsent: !formData.guardianConsent })}
        >
          법정대리인 정보를 학부모 정보로 수집합니다.
        </InlineCheckbox>
      </section>

      <section className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-medium text-ink">약관 동의</h2>

        <AgreementList
          items={STUDENT_AGREEMENT_ITEMS.map((item) => ({ ...item, checked: agreements[item.key] }))}
          allChecked={allChecked}
          onToggleAll={() => setAllAgreements(!allChecked, requiredKeys)}
          onToggleItem={(key) => updateAgreements({ [key]: !agreements[key] })}
        />
      </section>

      {showNextComingSoon && (
        <InfoCard variant="info">다음 단계 준비 중입니다. 잠시 후 다시 시도해 주세요.</InfoCard>
      )}

      {/* §3.3 D-2: "다음" 버튼 400×52px(C-1/D-1과 달리 이 버튼은 사이즈 매트릭스 불일치가
          기록돼 있지 않아 스펙에 명시된 52px/default 그대로 사용 — D-1 PASS 버튼과는 별개 판단). */}
      <PrimaryButton size="default" radius="default" disabled={!isNextEnabled} onClick={handleNext}>
        다음
      </PrimaryButton>
    </AuthLayout>
  );
}
