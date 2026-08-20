-- =====================================================================
-- 학습진단(ver2) 설문 q1 학년 선택지 라벨 "중학교 3학년" → "중학생" (QA시트 행 189)
--
-- 배경: 설문 표시 문구는 learning_diagnosis_v2_survey_copy(sql/72) 오버레이가
-- 정적 정본(renewalSurveyQuestions)을 덮어쓴다. 코드 쪽 라벨은 함께 "중학생"으로
-- 수정했지만(qa-diagnosis 브랜치), 이 테이블에 q1.option.M3 행이 존재하는 한
-- 화면에는 DB 값이 이긴다 — 라벨 변경은 반드시 이 행도 함께 갱신해야 한다.
--
-- 채점 영향 없음: 옵션 코드(M3)와 optionCodes 서수 매핑은 불변이고, 오버레이는
-- 표시 문구만 바꾼다(diagnosisSurveyCopyOverrides.ts 참조). q1은 exclusiveValues
-- 재계산 대상도 아니다.
--
-- 적용 이력: 2026-08-20 dev 적용. prod는 qa 브랜치 배포 시점에 함께 실행할 것.
-- =====================================================================

update public.learning_diagnosis_v2_survey_copy
set copy_value = '중학생'
where copy_key = 'q1.option.M3';

-- 검증:
-- select copy_key, copy_value from public.learning_diagnosis_v2_survey_copy
--  where copy_key = 'q1.option.M3';  -- '중학생' 1행
