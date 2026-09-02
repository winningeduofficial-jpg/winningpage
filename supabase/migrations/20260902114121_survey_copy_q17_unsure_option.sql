-- q17 "잘 모르겠어요" 선택지 코드 분리(UNKNOWN → UNSURE, 2026-09-02).
-- 두 선택지가 같은 코드를 공유해 어드민 문구 오버라이드 q17.option.UNKNOWN 이 두 칩에
-- 함께 걸리던 문제의 데이터 쪽 보완 — 새 코드의 문구 행을 추가해 어드민에서 편집 가능하게 한다.
insert into public.learning_diagnosis_v2_survey_copy (copy_key, copy_value, label, sort_order)
values ('q17.option.UNSURE', '잘 모르겠어요', 'q17 · 선택지(UNSURE)', 152)
on conflict (copy_key) do nothing;
