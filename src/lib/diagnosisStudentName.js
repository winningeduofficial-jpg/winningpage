/**
 * 학습진단 Q-01 — 로그인 학생 이름 조회.
 *
 * 설문 제출 시점(SurveyStepShell)에서만 부른다. 비로그인·조회 실패·profiles.name 결측은
 * 전부 null 을 반환한다 — 예외를 던지지 않는다. normalizeAnswers(diagnosisScoring.js) 가
 * meta.name ?? null 로 이미 익명 폴백을 흡수하므로 이 함수는 "있으면 이름, 없으면 null"만 책임진다.
 *
 * Header.jsx/MyPage.jsx 의 세션 조회 관행(supabase.auth.getSession → profiles 단일 조회)을 따르되,
 * 리드 캡처가 범위 밖(Q-01 문서 결정)이므로 이메일·유저네임 대체 조회 체인은 두지 않는다 —
 * id 매칭 1회로 충분하고, 실패하면 조용히 익명 폴백으로 떨어진다.
 */
import { supabase } from './supabase';

export async function fetchLoggedInStudentName() {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase.from('profiles').select('name').eq('id', userId).maybeSingle();
    if (error) {
      console.error('profiles 이름 조회 실패:', error);
      return null;
    }

    const name = typeof data?.name === 'string' ? data.name.trim() : '';
    return name.length > 0 ? name : null;
  } catch (error) {
    console.error('학습진단 이름 조회 중 예외:', error);
    return null;
  }
}
