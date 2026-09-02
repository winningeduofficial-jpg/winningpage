-- QA 223 — 관리자웹 "프리미엄책자관리"에서 [적용] 클릭 시
-- "원본PDF업로드 실패-적용중단 … mime type application/pdf is not supported"로 실패.
--
-- 근거(dev 로컬 실측). banners 버킷은 원래 배너 이미지 전용으로 만들어졌고, 이
-- 리포의 어떤 마이그레이션도 banners 버킷의 allowed_mime_types 컬럼을 건드린
-- 적이 없다(20260821000001_storage.sql:9-14 upsert는 id/name/public 3컬럼만
-- 다루고, on conflict do update도 public만 갱신한다). 즉 이 버킷이 대시보드 등
-- 다른 경로로 먼저 만들어지며 이미지 MIME으로 제한돼 있었다면 그 제한이 지금도
-- 그대로 남아 있어야 한다. 로컬에서 allowed_mime_types를 이미지 전용
-- (image/png, image/jpeg, image/webp, image/gif)으로 재현한 뒤
-- PremiumBookAdmin.handleApply의 원본 PDF 업로드를 그대로 재현하면
-- StorageApiError statusCode "415" / message
-- "mime type application/pdf is not supported"가 정확히 재현된다 — QA가 본
-- 오류 문구와 일치한다.
--
-- 조치 범위(docs/premium-apply-book-spec.md §D3b가 이미 명시한 원칙을 따른다):
-- allowed_mime_types 전체 해제가 아니라 application/pdf 1종만 추가한다.
--   - allowed_mime_types가 NULL(무제한)이면 손대지 않는다 — 굳이 화이트리스트를
--     새로 만들어 이미지 업로드 경로까지 제한할 이유가 없다.
--   - 값이 있는데 application/pdf가 빠져 있을 때만 추가한다.
-- 재실행 안전(idempotent) — 이미 포함돼 있으면 조건이 걸려 아무 것도 하지 않는다.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'application/pdf')
where id = 'banners'
  and allowed_mime_types is not null
  and not ('application/pdf' = any (allowed_mime_types));

-- 같은 사고 계열 — 원본 PDF(문서상 16p, 19.4MB, docs/premium-apply-book-spec.md:5)가
-- 이미지 배너용으로 잡혀 있었을 file_size_limit 상한에 걸릴 가능성을 미리 차단한다.
-- file_size_limit이 NULL(무제한)이면 손대지 않고, 값이 있는데 50MB(52428800bytes)
-- 미만이면 50MB로 올린다 — 이미 50MB 이상이면 그대로 둔다(임의로 낮추지 않는다).
-- 재실행 안전(idempotent).
update storage.buckets
set file_size_limit = 52428800
where id = 'banners'
  and file_size_limit is not null
  and file_size_limit < 52428800;
