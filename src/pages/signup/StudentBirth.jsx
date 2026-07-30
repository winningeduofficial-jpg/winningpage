// [B-2] 학생 생년월일 입력 — docs/login-signup-renewal-spec.md §3.3 B-2, 노드 2393:10073.
// 생년월일 8자리 입력 → SignupContext.setBirthDate로 저장(만 14세 판정은 컨텍스트가 계산)
// → 만 14세 이상이면 /signup/student(C-1), 미만이면 /signup/student/under14/verify(D-1)로 이동.
//
// 연령 판정은 setBirthDate 호출 후 컨텍스트 state 갱신을 기다리지 않고(setState는 비동기),
// 이 파일 안에 SignupContext.jsx의 computeIsUnder14와 동일한 규칙을 복제해 제출 시점에
// 즉시 분기 판단에 사용한다(§3.3 B-2: "생일이 지나지 않은 경우 만 14세 미만으로 처리").
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout, AuthTitle, TextField, PrimaryButton } from '../../components/auth';
import { useSignup } from '../../context/SignupContext';

function computeIsUnder14(birthDate8) {
  if (!birthDate8 || birthDate8.length !== 8) return null;

  const year = Number(birthDate8.slice(0, 4));
  const month = Number(birthDate8.slice(4, 6));
  const day = Number(birthDate8.slice(6, 8));

  if (!year || !month || !day) return null;

  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();

  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());

  if (!hasHadBirthdayThisYear) age -= 1;

  return age < 14;
}

export default function StudentBirth() {
  const navigate = useNavigate();
  const { memberType, birthDate, setBirthDate } = useSignup();
  const [value, setValue] = useState(birthDate || '');
  const [error, setError] = useState('');

  // memberType 없이(예: 새로고침 전 이탈, 직접 URL 진입) 이 화면에 들어온 경우 첫 단계로 되돌림.
  useEffect(() => {
    if (memberType !== 'student') {
      navigate('/signup', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberType]);

  function handleChange(next) {
    setValue(next.replace(/\D/g, '').slice(0, 8));
    if (error) setError('');
  }

  function handleContinue() {
    if (value.length !== 8) {
      setError('생년월일 8자리를 정확히 입력해 주세요.');
      return;
    }

    const isUnder14 = computeIsUnder14(value);

    if (isUnder14 === null) {
      setError('올바른 생년월일을 입력해 주세요.');
      return;
    }

    setBirthDate(value);
    navigate(isUnder14 ? '/signup/student/under14/verify' : '/signup/student');
  }

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-3 text-center">
        <AuthTitle line1="학생의 생년월일을 입력해 주세요" />
        <p className="text-xl font-medium text-ink">
          만 14세 미만은 보호자(법정대리인) 동의가 필요해요
        </p>
      </div>

      <div className="flex w-full flex-col gap-5">
        <TextField
          id="birthDate"
          name="birthDate"
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="생년월일 8자리 입력"
          helperText={error || undefined}
          status={error ? 'error' : 'default'}
          autoComplete="off"
          required
        />

        <PrimaryButton onClick={handleContinue}>계속하기</PrimaryButton>
      </div>
    </AuthLayout>
  );
}
