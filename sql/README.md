# sql/ 실행 순서

Supabase SQL Editor에서 **파일명 접두어 순서대로** 실행합니다. 모든 파일은 idempotent(여러 번 실행해도 안전)하게 작성되어 있습니다.

| 순서 | 파일 | 역할 | 의존성 |
|---|---|---|---|
| 00 | `00_base_schema.sql` (아직 없음) | 운영 DB 덤프 기반 기본 스키마: `profiles`, `program_categories`, `home_mentor_strategies` 등. dev/신규 프로젝트에 운영과 동일한 베이스를 재현하기 위한 자리 — 사용자가 운영 `pg_dump` 결과로 채울 예정 | 없음 (최초 실행) |
| 10 | `10_pricing_orders.sql` | 결제 스키마: `products`, `coupons`, `orders`, `order_items`, `refund_requests` + RLS + 상품/쿠폰 시드 | `auth.users`만 의존 (00과 독립적으로도 실행 가능) |
| 20 | `20_landing_renewal.sql` | 랜딩페이지 리뉴얼 스키마: `public.is_admin()` 헬퍼, `university_acceptances` 신규 테이블 + `program_categories.icon_image_url` 컬럼 + `home_mentor_strategies` 시드 | `00_base_schema.sql`의 `profiles`(role 컬럼), `program_categories`, `home_mentor_strategies` 필요 |
| 30 | `30_landing_admin_media.sql` | 랜딩 이미지 관리자 전환: `home_mentor_strategies` 카드 분해 컬럼 5종(badge/title_lines/photo_url/photo_layout/card_width) + 멘토 22건 백필 + `banners` 히어로 969×429 시드 + 구 규격 배너/레거시 멘토 행 정리 (전부 마커 가드) | `00_base_schema.sql`의 `banners`, `20_landing_renewal.sql`의 `schema_migrations` 마커·멘토 시드 필요. **업로드 스크립트(`scripts/seed-landing-storage.mjs`)보다 먼저 실행** |
| 31 | `31_storage_policies.sql` | Storage 정책: `banners` 버킷 public 보정 + `storage.objects` public read/`is_winning_admin()` write 정책 + `university_acceptances` write 판정 `is_winning_admin()` 교체 + `banners` 구식 profiles 서브쿼리 정책 4개 drop | `00_base_schema.sql`의 `is_winning_admin()`, `20_landing_renewal.sql`의 `university_acceptances` 필요 |
| 32 | `32_news_categories.sql` | 랜딩 "소식" 섹션 카테고리 배지(Figma 1907:14893): `company_news`/`notices`에 nullable `category` 컬럼 추가 + dev 테스트 행(Test1~3) 시드 UPDATE(마커 가드) | `00_base_schema.sql`의 `company_news`/`notices` 필요 |
| 33 | `33_drop_mentor_legacy_image.sql` | 멘토 성공전략 구버전 통이미지 완전 제거: `home_mentor_strategies.image_url` 컬럼 drop (되돌릴 수 없음 — 실행 전 백업 권장) | `30_landing_admin_media.sql`의 카드 분해 컬럼(badge/title_lines/photo_url 등)으로 전환 완료된 상태 필요 |

> `partner_universities`(학교리스트 섹션) 테이블·RLS·시드는 2026-07-27 최종본에서 섹션 자체가 삭제되어 이 파일에서 제거됨. 이미 실행된 운영 DB에 테이블이 남아있다면 별도 `drop table` 정리는 필요 시 수동 진행.

## 재실행 시 데이터 보존 원칙

- `10_pricing_orders.sql`의 products/coupons 시드는 `on conflict (id) do nothing` — 이미 존재하는 id는 재실행으로 절대 덮어쓰지 않는다. `api/create-order.js`가 products를 결제 신뢰값으로 읽으므로, 단종 상품·종료 쿠폰의 가격/노출 상태가 파일 재실행으로 롤백되면 실제 청구 금액이 바뀐다.
- `20_landing_renewal.sql`의 `program_categories` 카피 갱신 UPDATE는 `public.schema_migrations` 마커 테이블로 **최초 1회만** 적용된다. 이후 재실행에서는 관리자가 어드민 화면에서 수정한 값을 그대로 보존한다.
- 신규 설치(빈 DB)에서는 위 가드와 무관하게 최초 시드가 정상적으로 들어간다 (모든 `insert ... where not exists` 블록은 계속 무조건 동작).
- `30_landing_admin_media.sql`의 멘토 22건 백필·히어로 배너 시드·배너 행 정리·레거시 멘토 비활성화도 각각 마커(`30_mentor_card_fields_backfill_v1` / `30_banners_hero_seed_v1` / `30_banners_hero_rows_cleanup_v1` / `30_legacy_mentor_rows_deactivate_v1`)로 **최초 1회만** 적용된다. 시드는 로컬경로(`/images/landing/…`)만 사용하며, Storage publicUrl은 환경별로 다르므로 업로드 스크립트가 환경별로 UPDATE한다.

## RLS admin 판정

`31_storage_policies.sql` 실행 이후 랜딩 테이블 write 판정은 `public.is_winning_admin()` (security definer, admin 4단계 role 체계) 기준으로 통일되어 있다. `university_acceptances`의 admin write 정책과 `storage.objects`(`banners` 버킷) insert/update/delete 정책이 모두 이 함수를 사용한다. `profiles` 테이블 자신의 RLS 정책이 `profiles`를 재참조하는 서브쿼리를 직접 쓰면 42P17 infinite recursion으로 관리자 쓰기가 전부 막히므로, 반드시 이 함수를 통해 판정한다. 새 admin write 정책을 추가할 때도 동일 패턴(`using (public.is_winning_admin())` / `with check (public.is_winning_admin())`)을 따를 것. (구 `public.is_admin()`은 20번 최초 도입 함수이며 31번에서 랜딩 테이블 판정은 `is_winning_admin()`으로 교체되었다.)
