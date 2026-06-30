import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import { supabase } from '../lib/supabase';
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Clock3,
  GraduationCap,
  Layers3,
  LockKeyhole,
  Route,
  Sparkles,
  Target,
  UsersRound
} from 'lucide-react';

const ICONS = {
  target: Target,
  book: BookOpenCheck,
  chart: BarChart3,
  route: Route
};

function normalizeProgramIds(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function optionClass(active) {
  return `rounded-2xl border px-5 py-4 text-left text-sm font-black leading-6 transition ${
    active
      ? 'border-[#0D1B2A] bg-[#0D1B2A] text-white shadow-[0_16px_34px_rgba(13,27,42,0.22)]'
      : 'border-[#0D1B2A]/10 bg-white text-[#0D1B2A] hover:border-[#B88737] hover:bg-[#FFF8E8]'
  }`;
}



export default function FreeDiagnosis() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [started, setStarted] = useState(false);
  const [authNotice, setAuthNotice] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState('');

  const [questions, setQuestions] = useState([]);
  const [options, setOptions] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [selected, setSelected] = useState({});
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

  useEffect(() => {
    let alive = true;

    async function loadDiagnosisConfig() {
      setLoadingConfig(true);
      setConfigError('');

      const [questionRes, optionRes, programRes] = await Promise.all([
        supabase
          .from('free_diagnosis_questions')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('free_diagnosis_options')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('free_diagnosis_programs')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
      ]);

      if (!alive) return;
      setLoadingConfig(false);

      const error = questionRes.error || optionRes.error || programRes.error;
      if (error) {
        setConfigError('무료진단 설정을 불러오지 못했습니다. 관리자에서 무료진단 테이블 설정을 확인해 주세요.');
        setQuestions([]);
        setOptions([]);
        setPrograms([]);
        return;
      }

      setQuestions(questionRes.data || []);
      setOptions(
        (optionRes.data || []).map((option) => ({
          ...option,
          program_ids: normalizeProgramIds(option.program_ids)
        }))
      );
      setPrograms(programRes.data || []);
    }

    loadDiagnosisConfig();

    return () => {
      alive = false;
    };
  }, []);

  const isLoggedIn = !!session?.user;

  const optionsByQuestion = useMemo(() => {
    const grouped = {};
    options.forEach((option) => {
      if (!grouped[option.question_id]) grouped[option.question_id] = [];
      grouped[option.question_id].push(option);
    });
    return grouped;
  }, [options]);

  const programById = useMemo(() => {
    const map = new Map();
    programs.forEach((program) => map.set(String(program.id), program));
    return map;
  }, [programs]);

  const requiredQuestions = useMemo(
    () => questions.filter((question) => question.is_required),
    [questions]
  );

  const canSubmit = useMemo(() => {
    if (questions.length === 0) return false;
    return requiredQuestions.every((question) => (selected[question.id] || []).length > 0);
  }, [questions.length, requiredQuestions, selected]);

  const selectedOptions = useMemo(() => {
    const selectedIds = new Set(Object.values(selected).flat().map(String));
    return options.filter((option) => selectedIds.has(String(option.id)));
  }, [options, selected]);

  const resultPrograms = useMemo(() => {
    const orderedIds = [];
    const seen = new Set();

    selectedOptions.forEach((option) => {
      normalizeProgramIds(option.program_ids).forEach((programId) => {
        const id = String(programId);
        if (!seen.has(id) && programById.has(id)) {
          seen.add(id);
          orderedIds.push(id);
        }
      });
    });

    return orderedIds
      .map((id) => programById.get(id))
      .filter(Boolean)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }, [programById, selectedOptions]);

  const selectedSummary = useMemo(() => {
    return questions
      .map((question) => {
        const ids = new Set((selected[question.id] || []).map(String));
        const labels = (optionsByQuestion[question.id] || [])
          .filter((option) => ids.has(String(option.id)))
          .map((option) => option.label);

        if (labels.length === 0) return null;
        return `${question.title}: ${labels.join(', ')}`;
      })
      .filter(Boolean);
  }, [optionsByQuestion, questions, selected]);

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

  function toggleOption(question, optionId) {
    setSelected((prev) => {
      const current = prev[question.id] || [];
      const id = String(optionId);

      if (question.input_type === 'multiple') {
        const exists = current.map(String).includes(id);
        return {
          ...prev,
          [question.id]: exists ? current.filter((item) => String(item) !== id) : [...current, id]
        };
      }

      return {
        ...prev,
        [question.id]: current.map(String).includes(id) ? [] : [id]
      };
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
                현재 상황에 맞는 질문에 답하면 지금 학생에게 먼저 필요한 위닝에듀 서비스를 바로 확인할 수 있습니다.
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
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">맞춤 질문 기반 추천</h2>

                <div className="mt-6 grid gap-4">
                  {[
                    [SchoolIcon, '질문 선택', '관리자에서 설정한 질문과 답변이 화면에 노출됩니다.'],
                    [BarChart3, '중복 선택', '질문별로 단일 선택 또는 중복 선택을 적용할 수 있습니다.'],
                    [Route, '추천 결과', '선택한 답변에 연결된 추천 프로그램이 자동으로 표시됩니다.']
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
    <div className="space-y-6">
      {loadingConfig && (
        <div className="rounded-[30px] border border-[#0D1B2A]/10 bg-white p-10 text-center text-sm font-black text-slate-500 shadow-[0_18px_45px_rgba(13,27,42,0.07)]">
          무료진단 문항을 불러오는 중입니다.
        </div>
      )}

      {configError && (
        <div className="rounded-[30px] border border-red-200 bg-white p-7 text-sm font-black leading-7 text-red-600 shadow-[0_18px_45px_rgba(13,27,42,0.07)]">
          {configError}
        </div>
      )}

      {!loadingConfig && !configError && questions.length === 0 && (
        <div className="rounded-[30px] border border-[#0D1B2A]/10 bg-white p-10 text-center text-sm font-black text-slate-500 shadow-[0_18px_45px_rgba(13,27,42,0.07)]">
          등록된 무료진단 질문이 없습니다. 관리자에서 질문을 추가해 주세요.
        </div>
      )}

      {questions.map((question, index) => {
        const questionOptions = optionsByQuestion[question.id] || [];
        const selectedIds = new Set((selected[question.id] || []).map(String));
        const isMultiple = question.input_type === 'multiple';

        return (
          <div
            key={question.id}
            className="rounded-[30px] border border-[#0D1B2A]/10 bg-white p-7 shadow-[0_18px_45px_rgba(13,27,42,0.07)]"
          >
            <div className="mb-5">
              <p className="text-sm font-black text-[#B88737]">
                QUESTION {String(index + 1).padStart(2, '0')}
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black tracking-[-0.04em] text-[#0D1B2A]">
                  {question.title}
                </h2>

                {isMultiple && (
                  <span className="rounded-full bg-[#FFF1CC] px-3 py-1 text-xs font-black text-[#B88737]">
                    중복선택가능
                  </span>
                )}
              </div>

              {question.description && (
                <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                  {question.description}
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {questionOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleOption(question, option.id)}
                  className={optionClass(selectedIds.has(String(option.id)))}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {questionOptions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#0D1B2A]/15 bg-[#F8F7F3] p-6 text-center text-sm font-black text-slate-500">
                이 질문에는 아직 등록된 답변이 없습니다.
              </div>
            )}
          </div>
        );
      })}

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
                  <div className="mt-3 space-y-1 break-keep text-sm font-bold leading-6 text-slate-600">
                    {selectedSummary.length > 0 ? (
                      selectedSummary.map((item) => <p key={item}>{item}</p>)
                    ) : (
                      <p>선택한 답변 기준으로 필요한 서비스를 추천합니다.</p>
                    )}
                  </div>
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

              {resultPrograms.length > 0 ? (
                <div className="mt-8 grid gap-5 lg:grid-cols-2">
                  {resultPrograms.map((program, index) => {
                    const Icon = ICONS[program.icon] || Target;

                    return (
                      <article
                        key={program.id}
                        className={`rounded-[28px] border p-7 ${
                          index % 2 === 0
                            ? 'border-[#D6B06A]/45 bg-[#FFF8E8]'
                            : 'border-[#0D1B2A]/10 bg-[#F8F7F3]'
                        }`}
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D1B2A] text-white">
                          <Icon size={27} />
                        </div>
                        <p className="mt-5 text-sm font-black text-[#B88737]">{program.badge || `추천 서비스 ${index + 1}`}</p>
                        <h3 className="mt-1 text-2xl font-black tracking-[-0.04em] text-[#0D1B2A]">
                          {program.title}
                        </h3>
                        <p className="mt-4 break-keep text-base font-bold leading-8 text-[#334155]">
                          {program.description}
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                          {program.primary_button_link && (
                            <Link to={program.primary_button_link} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#0D1B2A] px-5 text-sm font-black text-white transition hover:bg-[#162A40]">
                              {program.primary_button_text || '서비스 확인하기'} <ArrowRight size={17} />
                            </Link>
                          )}
                          {program.secondary_button_link && (
                            <Link to={program.secondary_button_link} className="inline-flex h-12 items-center rounded-xl border border-[#0D1B2A]/15 bg-white px-5 text-sm font-black text-[#0D1B2A] transition hover:bg-[#F8F7F3]">
                              {program.secondary_button_text || '자세히 보기'}
                            </Link>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-8 rounded-[28px] border border-[#0D1B2A]/10 bg-[#F8F7F3] p-7 text-sm font-black leading-7 text-slate-600">
                  선택한 답변에 연결된 추천 프로그램이 없습니다. 관리자에서 해당 답변에 추천 프로그램을 연결해 주세요.
                </div>
              )}

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

