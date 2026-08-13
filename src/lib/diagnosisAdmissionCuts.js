/**
 * 학습진단 B-1 — 목표 대학 입결 컷 조회 seam.
 *
 * ⚠️ 저장소 전체에서 "cut50/cut70/finalAvg 를 어디서, 어떤 테이블·컬럼으로 가져오는지" 아는
 * 곳은 이 함수 하나뿐이다. 스텝5 캐스케이드(useAdmissionCascade)·리포트 조립
 * (diagnosisReport.buildReport)·채점 엔진(diagnosisScoring.admissionBand) 어디에도
 * 테이블명·컬럼명을 두지 않는다 — 전부 이 함수가 돌려주는
 * `{ cut50, cut70, finalAvg, year } | null | ADMISSION_FETCH_ERROR` 만 안다.
 *
 * 원본: dev `admission_results`. **2026-08-11 05:23 UTC, 이 작업 세션 도중** 더미 434행에서
 * 정본 `입결_마스터_2개년.xlsx` 43,170행(별도 세션의 입결정보 리뉴얼 작업 산출물)으로 교체됐다.
 * `recruitment_period` 축은 새 스키마에 없다(실측 42703). `main_track` 값도 `'학생부교과'`가
 * 아니라 `'교과'`/`'종합'` 축약형이다 — 값을 하드코딩하지 않고 조회 결과에서 그대로 쓴다.
 *
 * '최종등록자 평균'(finalAvg)은 여전히 존재하지 않는다 — 정본 원본 스크립트
 * (`build_ipgyeol.py`, 사용자 로컬 Downloads)의 열 정의를 실측 대조한 결과:
 *   g50/g70/g85/g90  → grade_50/70/85/90 (stage='최종등록자', kind='cut' — 백분위 컷, 평균 아님)
 *   gavg/gmin        → grade_avg/grade_min (stage='합격자' — 최종등록자가 아니라 합격자 모집단)
 *   g10avg/g10min    → grade_avg10/grade_min10 (stage='합격자', scope='반영 10과목'만)
 *   gavg1            → grade_first_avg (stage='최초합격자' — 충원 전 1단계 합격자)
 * 즉 '최종등록자'축에는 컷(50/70/85/90)만 있고 평균은 애초에 계산되지 않는다 — 문서 B-1 결정
 * ("최종등록자 평균 컬럼은 신설하지 않는다")이 새 스키마에서도 그대로 유효하다. grade_avg 계열
 * 5개 컬럼은 인구 자체가 달라(합격자·최초합격자 ≠ 최종등록자) finalAvg 로 대체 매핑하지 않는다 —
 * 추측이 아니라 원본 스크립트의 stage 정의로 확인된 사실이다.
 */
import { supabase } from './supabase';
import { isUsableNumber } from '../data/diagnosisGradeScale.js';
import { ADMISSION_FETCH_ERROR } from '../data/diagnosisScoringTable.js';

export { ADMISSION_FETCH_ERROR };

/**
 * 같은 (연도, 전형 조합) 에 복수 행이 남는 극소수 사례(dev 43,170행 중 29행, `variant_seq`
 * 0 이 아닌 행)를 위한 결정론적 tie-break. 원본 엑셀에 동일 자연키가 실제로 중복 존재해
 * 생긴 것이라 어느 쪽이 "맞는" 값인지 이 레이어에서 판단할 근거가 없다 — variant_seq 오름차순
 * (0 이 원본 우선)으로 첫 행을 고정 채택해 최소한 호출마다 결과가 흔들리지 않게만 한다.
 * 최신연도 우선은 그대로 유지 — 컷 보유 최신연도를 자동 선택한다(연도별 컷 결측 여부는
 * 조회 결과에서 그대로 드러난다. 하드코딩된 "미래 연도" 가정 없음).
 */
function pickLatestCutRow(rows) {
  const withCuts = (rows ?? []).filter((row) => isUsableNumber(row.grade_50) || isUsableNumber(row.grade_70));
  if (withCuts.length === 0) return null;
  return withCuts.reduce((best, row) => {
    if (row.result_year !== best.result_year) return row.result_year > best.result_year ? row : best;
    return (row.variant_seq ?? 0) < (best.variant_seq ?? 0) ? row : best;
  });
}

/**
 * @param {{ universityKey: string, departmentKey: string, mainTrack: string, admissionTrack: string,
 *           subjectReflection?: string|null }} query subjectReflection 은 DB 원본 의미(값 없으면 null)를
 *           그대로 받는다 — 호출부가 UI 표시용 대체 라벨(NO_SUBJECT_REFLECTION_LABEL)을 쓰고 있다면
 *           여기 넘기기 전에 null 로 되돌려야 한다. 정본 43k 행은 subject_reflection 이 전량 null 이다
 *           (실측 확인) — 그래도 컬럼 자체는 남아 있으므로 필터는 유지한다.
 * @returns {Promise<{ cut50: number|null, cut70: number|null, finalAvg: number|null, year: number }
 *                    | null | typeof ADMISSION_FETCH_ERROR>}
 *
 * **세 값을 구분해 돌려준다(F-22).** 예외는 절대 던지지 않고 실패를 값으로 표현한다.
 *   객체                   조회 성공, 컷 보유
 *   null                   정상 조회했으나 자료가 없다 — 인자 부족(4단 미완주) 포함. **영구 부재**
 *   ADMISSION_FETCH_ERROR  조회 자체가 실패했다(DB error · 네트워크 예외). **일시 오류**
 *
 * 종전에는 셋이 전부 null 로 뭉개져 학생 화면에서 "이 조합은 원래 자료가 없다"(BAND_NODATA)와
 * "지금 못 불러왔다"가 구분되지 않았다. BAND_NODATA 원문이 "공개된 입결 자료가 없어…"라고
 * **단정**하므로, 일시 오류에 그 문장을 쓰는 것은 학생에게 거짓을 말하는 것이다.
 *
 * 호출부는 반드시 참조 비교(`result === ADMISSION_FETCH_ERROR`)로 가른다 — `result == null` 같은
 * 느슨한 비교를 쓰면 센티널이 다시 결측으로 뭉개진다. 자동 재시도·백오프는 넣지 않는다(캐스케이드
 * useEffect 가 의존성 다수로 재발화하는 구조라 중복 쿼리 위험이 크다).
 */
export async function fetchAdmissionCuts(query) {
  // 인자 부족은 실패가 아니다 — 학생이 아직 4단을 다 고르지 않은 정상 경로다.
  if (!query?.universityKey || !query?.departmentKey || !query?.mainTrack || !query?.admissionTrack) {
    return null;
  }

  try {
    let builder = supabase
      .from('admission_results')
      .select('result_year,grade_50,grade_70,variant_seq')
      .eq('is_active', true)
      .eq('university_key', query.universityKey)
      .eq('department_key', query.departmentKey)
      .eq('main_track', query.mainTrack)
      .eq('admission_track', query.admissionTrack);

    builder = query.subjectReflection != null
      ? builder.eq('subject_reflection', query.subjectReflection)
      : builder.is('subject_reflection', null);

    const { data, error } = await builder;
    if (error) {
      console.error('입결 컷 조회 실패:', error);
      return ADMISSION_FETCH_ERROR;
    }

    // 컷 보유 행이 없는 것은 진짜 결측이다 — 여기는 계속 null 이어야 한다.
    const target = pickLatestCutRow(data);
    if (!target) return null;

    return {
      cut50: isUsableNumber(target.grade_50) ? target.grade_50 : null,
      cut70: isUsableNumber(target.grade_70) ? target.grade_70 : null,
      finalAvg: null,
      year: target.result_year
    };
  } catch (caught) {
    // 네트워크 예외 등. 훅의 .catch 에만 맡기면 이 함수의 반환 계약이 두 갈래(값 또는 reject)가 된다.
    console.error('입결 컷 조회 실패:', caught);
    return ADMISSION_FETCH_ERROR;
  }
}
