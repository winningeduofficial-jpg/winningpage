import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Layers3,
  LockKeyhole,
  Route,
  Sparkles,
  Target,
  UsersRound
} from 'lucide-react';

const SCHOOL_TYPES = ['일반고', '특목고', '자사고'];
const GRADE_LEVELS = ['최상위권', '상위권', '중상위권', '중위권', '중하위권', '하위권'];

const REASONS = [
  '공부할 시간이 부족해서',
  '공부 방법을 잘 몰라서',
  '어떻게 시작해야 할지를 잘 몰라서'
];

const PRIORITIES = [
  '수행평가와 세특 완성도',
  '내신 공부 루틴',
  '학습 관리와 피드백',
  '입시 방향 설정'
];

function optionClass(active) {
  return `rounded-2xl border px-5 py-4 text-left text-sm font-black leading-6 transition ${
    active
      ? 'border-[#0D1B2A] bg-[#0D1B2A] text-white shadow-[0_16px_34px_rgba(13,27,42,0.22)]'
      : 'border-[#0D1B2A]/10 bg-white text-[#0D1B2A] hover:border-[#B88737] hover:bg-[#FFF8E8]'
  }`;
}

function SectionTitle({ step, title, desc }) {
  return (
    <div className="mb-5">
      <p className="text-sm font-black text-[#B88737]">QUESTION {step}</p>
      <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-[#0D1B2A]">
        {title}
      </h2>
      {desc && <p className="mt-2 text-sm font-bold leading-6 text-slate-500">{desc}</p>}
    </div>
  );
}

export default function FreeDiagnosis() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [started, setStarted] = useState(false);
  const [authNotice, setAuthNotice] = useState(false);

  const [schoolType, setSchoolType] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [reasons, setReasons] = useState([]);
  const [priority, setPriority] = useState('');
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data?.session || null);
      setAuthReady(true);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthReady(true);
    });

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  const isLoggedIn = !!session?.user;
  const canSubmit = schoolType && gradeLevel && reasons.length > 0;

  const resultTypes = useMemo(() => {
    const hasTimeIssue = reasons.includes('공부할 시간이 부족해서');
    const hasDirectionIssue =
      reasons.includes('공부 방법을 잘 몰라서') ||
      reasons.includes('어떻게 시작해야 할지를 잘 몰라서');

    const types = [];
    if (hasTimeIssue) types.push('performance');
    if (hasDirectionIssue) types.push('management');
    return types;
  }, [reasons]);

  function startDiagnosis() {
    if (!authReady) return;

    if (!isLoggedIn) {
      setAuthNotice(true);
      setStarted(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setAuthNotice(false);
    setStarted(true);
    setShowResult(false);
    window.setTimeout(() => {
      document.getElementById('diagnosis-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function toggleReason(reason) {
    setReasons((prev) => {
      if (prev.includes(reason)) {
        return prev.filter((item) => item !== reason);
      }
      return [...prev, reason];
    });
    setShowResult(false);
  }

  function submitDiagnosis() {
    if (!canSubmit) return;
    setShowResult(true);
    window.setTimeout(() => {
      document.getElementById('diagnosis-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  return (
    <>
      <Header />

      <main className="min-h-screen bg-[#F8F7F3] pt-[84px]">
        <section className="relative isolate overflow-hidden bg-[#0D1B2A] px-6 py-20 text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_20%,rgba(214,176,106,0.22),transparent_32%),radial-gradient(circle_at_84%_8%,rgba(255,255,255,0.12),transparent_26%)]" />
          <div className="mx-auto grid max-w-[1500px] items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-black text-[#D6B06A] backdrop-blur">
                <Sparkles size={17} />
                무료 진단 서비스
              </div>

              <h1 className="mt-7 break-keep text-4xl font-black leading-[1.18] tracking-[-0.055em] md:text-6xl">
                나에게 맞는 서비스 확인하기
              </h1>

              <p className="mt-6 max-w-[760px] break-keep text-lg font-bold leading-9 text-white/78">
                학교 유형, 현재 성적대, 성적이 정체되는 이유를 선택하면 지금 학생에게 먼저 필요한 위닝에듀 서비스를 바로 확인할 수 있습니다.
              </p>

              <div className="mt-9 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={startDiagnosis}
                  className="inline-flex h-14 items-center gap-2 rounded-2xl bg-white px-7 text-base font-black text-[#0D1B2A] shadow-[0_18px_40px_rgba(0,0,0,0.22)] transition hover:bg-[#F2EBDD]"
                >
                  지금 바로 무료진단하기
                  <ArrowRight size={20} />
                </button>

                <Link
                  to="/signup"
                  className="inline-flex h-14 items-center gap-2 rounded-2xl border border-white/22 bg-white/8 px-7 text-base font-black text-white backdrop-blur transition hover:border-white/45 hover:bg-white/14"
                >
                  회원가입 먼저 하기
                </Link>
              </div>
            </div>

            <div className="rounded-[34px] border border-white/14 bg-white/10 p-7 shadow-[0_28px_90px_rgba(0,0,0,0.26)] backdrop-blur">
              <div className="rounded-[26px] bg-white p-7 text-[#0D1B2A]">
                <p className="text-sm font-black text-[#B88737]">DIAGNOSIS FLOW</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">3단계로 확인하는 맞춤 추천</h2>

                <div className="mt-6 grid gap-4">
                  {[
                    [SchoolIcon, '학교 유형', '일반고·특목고·자사고 기준으로 출발점을 확인합니다.'],
                    [BarChart3, '현재 성적대', '최상위권부터 하위권까지 현재 위치를 기준으로 봅니다.'],
                    [Route, '성적 정체 이유', '시간 부족, 방법 부재, 시작점 부재를 중복 선택합니다.']
                  ].map(([Icon, title, desc]) => (
                    <div key={title} className="flex gap-4 rounded-2xl border border-[#0D1B2A]/8 bg-[#F8F7F3] p-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0D1B2A] text-white">
                        <Icon size={22} />
                      </div>
                      <div>
                        <p className="font-black">{title}</p>
                        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {authNotice && (
          <section className="mx-auto max-w-[1500px] px-6 pt-10">
            <div className="rounded-[28px] border border-[#D6B06A]/45 bg-white p-7 shadow-[0_22px_55px_rgba(13,27,42,0.10)]">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white">
                    <LockKeyhole size={23} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-[-0.04em] text-[#0D1B2A]">
                      무료 진단은 회원가입 후 이용할 수 있습니다.
                    </h2>
                    <p className="mt-2 break-keep text-sm font-bold leading-6 text-slate-600">
                      진단 결과를 학생 정보와 연결해 관리하기 위해 로그인 또는 회원가입이 필요합니다.
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-3">
                  <Link
                    to="/signup"
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0D1B2A] px-6 text-sm font-black text-white transition hover:bg-[#162A40]"
                  >
                    회원가입하기
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-[#0D1B2A]/18 bg-white px-6 text-sm font-black text-[#0D1B2A] transition hover:bg-[#FFF8E8]"
                  >
                    로그인하기
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {started && (
          <section id="diagnosis-form" className="mx-auto max-w-[1500px] px-6 py-14">
            <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
              <aside className="h-fit rounded-[30px] border border-[#0D1B2A]/10 bg-white p-7 shadow-[0_18px_45px_rgba(13,27,42,0.07)]">
                <p className="text-sm font-black text-[#B88737]">FREE CHECK</p>
                <h2 className="mt-2 break-keep text-3xl font-black leading-tight tracking-[-0.05em] text-[#0D1B2A]">
                  선택이 끝나면 학생에게 먼저 필요한 서비스가 정리됩니다.
                </h2>
                <div className="mt-7 space-y-3 text-sm font-bold leading-6 text-slate-600">
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-[#B88737]" size={18} /> 성적이 정체되는 이유는 중복 선택할 수 있습니다.</p>
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-[#B88737]" size={18} /> 시간 부족과 방법 문제를 함께 선택하면 두 추천이 같이 표시됩니다.</p>
                  <p className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-[#B88737]" size={18} /> 선택 결과는 상담 전 학생 상태를 빠르게 파악하는 용도로 활용할 수 있습니다.</p>
                </div>
              </aside>

              <div className="space-y-6">
                <div className="rounded-[30px] border border-[#0D1B2A]/10 bg-white p-7 shadow-[0_18px_45px_rgba(13,27,42,0.07)]">
                  <SectionTitle step="01" title="학교 유형을 선택하세요." />
                  <div className="grid gap-3 md:grid-cols-3">
                    {SCHOOL_TYPES.map((item) => (
                      <button key={item} type="button" onClick={() => { setSchoolType(item); setShowResult(false); }} className={optionClass(schoolType === item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[30px] border border-[#0D1B2A]/10 bg-white p-7 shadow-[0_18px_45px_rgba(13,27,42,0.07)]">
                  <SectionTitle step="02" title="현재 성적대를 선택하세요." />
                  <div className="grid gap-3 md:grid-cols-3">
                    {GRADE_LEVELS.map((item) => (
                      <button key={item} type="button" onClick={() => { setGradeLevel(item); setShowResult(false); }} className={optionClass(gradeLevel === item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[30px] border border-[#0D1B2A]/10 bg-white p-7 shadow-[0_18px_45px_rgba(13,27,42,0.07)]">
                  <SectionTitle
                    step="03"
                    title="성적이 잘 오르지 않는 이유를 선택하세요."
                    desc="여러 개를 함께 선택할 수 있습니다."
                  />
                  <div className="grid gap-3 md:grid-cols-3">
                    {REASONS.map((item) => (
                      <button key={item} type="button" onClick={() => toggleReason(item)} className={optionClass(reasons.includes(item))}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[30px] border border-[#0D1B2A]/10 bg-white p-7 shadow-[0_18px_45px_rgba(13,27,42,0.07)]">
                  <SectionTitle
                    step="04"
                    title="가장 먼저 보완하고 싶은 영역을 선택하세요."
                    desc="선택하지 않아도 결과 확인은 가능합니다."
                  />
                  <div className="grid gap-3 md:grid-cols-4">
                    {PRIORITIES.map((item) => (
                      <button key={item} type="button" onClick={() => { setPriority(item); setShowResult(false); }} className={optionClass(priority === item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={submitDiagnosis}
                  disabled={!canSubmit}
                  className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[#0D1B2A] text-base font-black text-white shadow-[0_20px_45px_rgba(13,27,42,0.20)] transition hover:bg-[#162A40] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  무료진단 결과 확인하기
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
          </section>
        )}

        {showResult && (
          <section id="diagnosis-result" className="mx-auto max-w-[1500px] px-6 pb-20">
            <div className="rounded-[34px] border border-[#0D1B2A]/10 bg-white p-7 shadow-[0_26px_70px_rgba(13,27,42,0.12)] md:p-9">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-black text-[#B88737]">DIAGNOSIS RESULT</p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[#0D1B2A]">
                    무료 진단 결과
                  </h2>
                  <p className="mt-3 break-keep text-sm font-bold leading-6 text-slate-600">
                    {schoolType} · {gradeLevel} 학생 기준으로 현재 선택한 고민에 맞는 서비스를 추천합니다.
                    {priority ? ` 우선 보완 영역은 ‘${priority}’입니다.` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowResult(false);
                    setStarted(true);
                    window.setTimeout(() => document.getElementById('diagnosis-form')?.scrollIntoView({ behavior: 'smooth' }), 80);
                  }}
                  className="h-12 rounded-xl border border-[#0D1B2A]/14 bg-[#F8F7F3] px-5 text-sm font-black text-[#0D1B2A] transition hover:bg-[#FFF8E8]"
                >
                  다시 선택하기
                </button>
              </div>

              <div className="mt-8 grid gap-5 lg:grid-cols-2">
                {resultTypes.includes('performance') && (
                  <article className="rounded-[28px] border border-[#D6B06A]/45 bg-[#FFF8E8] p-7">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white">
                      <BookOpenCheck size={27} />
                    </div>
                    <p className="mt-5 text-sm font-black text-[#B88737]">추천 서비스 01</p>
                    <h3 className="mt-1 text-2xl font-black tracking-[-0.04em] text-[#0D1B2A]">
                      위닝 AI 수행평가 서비스
                    </h3>
                    <p className="mt-4 break-keep text-base font-bold leading-8 text-[#334155]">
                      생기부의 중요성이 커지면서 수행평가에 요구되는 수준도 함께 높아졌습니다. 공부 시간을 확보하면서 내신 점수와 탐구의 심화성을 모두 놓치고 싶지 않다면, 먼저 필요한 선택은 위닝 AI 수행평가 서비스입니다.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link to="/page/services-ai-performance" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#0D1B2A] px-5 text-sm font-black text-white transition hover:bg-[#162A40]">
                        서비스 확인하기 <ArrowRight size={17} />
                      </Link>
                      <Link to="/pricing" className="inline-flex h-12 items-center rounded-xl border border-[#0D1B2A]/15 bg-white px-5 text-sm font-black text-[#0D1B2A] transition hover:bg-[#F8F7F3]">
                        수강신청 보기
                      </Link>
                    </div>
                  </article>
                )}

                {resultTypes.includes('management') && (
                  <article className="rounded-[28px] border border-[#0D1B2A]/10 bg-[#F8F7F3] p-7">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white">
                      <Target size={27} />
                    </div>
                    <p className="mt-5 text-sm font-black text-[#B88737]">추천 서비스 02</p>
                    <h3 className="mt-1 text-2xl font-black tracking-[-0.04em] text-[#0D1B2A]">
                      위닝 목표관리·학습관리 서비스
                    </h3>
                    <p className="mt-4 break-keep text-base font-bold leading-8 text-[#334155]">
                      서울대·의대 학생들의 학습 경험과 위닝에듀의 관리 노하우를 담아 만들었습니다. 학생에게 필요한 방향, 노력의 양, 매주 해야 할 일을 정리하고 관리까지 이어집니다. 앞으로 학생이 할 일은 정해진 길을 따라가며 실행하는 것입니다.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link to="/page/services-goal" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#0D1B2A] px-5 text-sm font-black text-white transition hover:bg-[#162A40]">
                        서비스 확인하기 <ArrowRight size={17} />
                      </Link>
                      <Link to="/learning-analysis" className="inline-flex h-12 items-center rounded-xl border border-[#0D1B2A]/15 bg-white px-5 text-sm font-black text-[#0D1B2A] transition hover:bg-white">
                        학습분석 보기
                      </Link>
                    </div>
                  </article>
                )}
              </div>

              <div className="mt-7 grid gap-4 rounded-[26px] border border-[#0D1B2A]/8 bg-[#0D1B2A] p-6 text-white md:grid-cols-3">
                {[
                  [Clock3, '시간 확보', '불필요한 시행착오를 줄여 실제 공부 시간을 확보합니다.'],
                  [Layers3, '방향 설정', '학생 상황에 맞는 우선순위와 실행 순서를 정리합니다.'],
                  [UsersRound, '관리 연결', '진단에서 끝나지 않고 관리와 피드백으로 이어집니다.']
                ].map(([Icon, title, desc]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/7 p-5">
                    <Icon className="text-[#D6B06A]" size={24} />
                    <p className="mt-3 font-black">{title}</p>
                    <p className="mt-2 text-sm font-bold leading-6 text-white/72">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function SchoolIcon(props) {
  return <GraduationCap {...props} />;
}
