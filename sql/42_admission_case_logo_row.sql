-- =====================================================================
-- 수시정시 합격사례 히어로 대학 로고 표시 줄(1행/2행) 수동 지정.
-- Supabase SQL Editor에서 수동 실행 필요. (idempotent — 여러 번 실행해도 안전)
--
-- 배경: 히어로 로고 줄은 기존에 admission_case_logos 정렬 순서를
-- Math.ceil(n/2)로 균등 절반 분할해 두 줄로 나눴다. 시안(Figma
-- 1882:6520)은 1행이 좁은 로고 7개, 2행이 넓은 로고 5개인 7/5 비대칭
-- 구성이라 균등 분할로는 재현할 수 없다. 어느 로고를 어느 줄에 둘지는
-- 편집 판단이므로 컬럼으로 빼 어드민(Admin.jsx의 admissionCaseLogos
-- 섹션)에서 로고별로 지정하게 한다.
-- =====================================================================

alter table public.admission_case_logos
  add column if not exists row_no smallint not null default 1;

alter table public.admission_case_logos
  drop constraint if exists admission_case_logos_row_no_range;
alter table public.admission_case_logos
  add constraint admission_case_logos_row_no_range check (row_no = 1 or row_no = 2);

create index if not exists admission_case_logos_row_no_idx
  on public.admission_case_logos using btree (row_no);

-- =====================================================================
-- 검증용 SELECT (실행 후 수동 확인용 — 주석 해제하고 실행)
-- =====================================================================
-- select name, row_no, sort_order from public.admission_case_logos order by row_no, sort_order;
