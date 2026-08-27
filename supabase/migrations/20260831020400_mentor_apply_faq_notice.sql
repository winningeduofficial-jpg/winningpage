-- QA C8 (2026-08-27) — 멘토신청 FAQ에 "공지" 구분을 추가한다.
--
-- 왜 컬럼 추가인가 —
--   공지성 FAQ(예: 모집 일정 변경 안내)는 sort_order와 무관하게 항상 목록 맨 위에
--   노출돼야 한다. is_notice 플래그로 표시해 공개 페이지 조회 시 이 컬럼을 먼저
--   기준으로 정렬하고, 어드민에서는 "공지"/"일반" 구분으로 편집한다.
--
-- 기본값 false는 기존 행 전체가 일반 FAQ로 유지된다는 뜻이라 마이그레이션 직후
-- 노출 순서가 바뀌지 않는다.

alter table public.mentor_apply_faqs
  add column if not exists is_notice boolean not null default false;

comment on column public.mentor_apply_faqs.is_notice is
  '공지 FAQ 표식 — 공개 페이지에서 일반 FAQ보다 항상 위에 노출, QA C8 2026-08-27';
