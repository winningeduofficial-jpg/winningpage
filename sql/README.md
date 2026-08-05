# sql/ 실행 순서

Supabase SQL Editor에서 **파일명 접두어 순서대로** 실행합니다. 모든 파일은 idempotent(여러 번 실행해도 안전)하게 작성되어 있습니다.

| 순서 | 파일 | 역할 | 의존성 |
|---|---|---|---|
| 00 | `00_base_schema.sql` | 운영 DB 덤프 기반 기본 스키마: `profiles`, `program_categories`, `home_mentor_strategies`, `banners` 등 + `is_admin()`/`is_winning_admin()`/`handle_new_user()`/`complete_signup_profile()` 함수 + 전체 RLS 정책 | 없음 (최초 실행) |
| 10 | `10_pricing_orders.sql` | 결제 스키마: `products`, `coupons`, `orders`, `order_items`, `refund_requests` + RLS + 상품/쿠폰 시드 | `auth.users`만 의존 (00과 독립적으로도 실행 가능) |
| 20 | `20_landing_renewal.sql` | 랜딩페이지 리뉴얼 스키마: `public.is_admin()` 헬퍼, `university_acceptances` 신규 테이블 + `program_categories.icon_image_url` 컬럼 + `home_mentor_strategies` 시드 | `00_base_schema.sql`의 `profiles`(role 컬럼), `program_categories`, `home_mentor_strategies` 필요 |
| 30 | `30_landing_admin_media.sql` | 랜딩 이미지 관리자 전환: `home_mentor_strategies` 카드 분해 컬럼 5종(badge/title_lines/photo_url/photo_layout/card_width) + 멘토 22건 백필 + `banners` 히어로 969×429 시드 + 구 규격 배너/레거시 멘토 행 정리 (전부 마커 가드) | `00_base_schema.sql`의 `banners`, `20_landing_renewal.sql`의 `schema_migrations` 마커·멘토 시드 필요. **업로드 스크립트(`scripts/seed-landing-storage.mjs`)보다 먼저 실행** |
| 31 | `31_storage_policies.sql` | Storage 정책: `banners` 버킷 public 보정 + `storage.objects` public read/`is_winning_admin()` write 정책 + `university_acceptances` write 판정 `is_winning_admin()` 교체 + `banners` 구식 profiles 서브쿼리 정책 4개 drop | `00_base_schema.sql`의 `is_winning_admin()`, `20_landing_renewal.sql`의 `university_acceptances` 필요 |
| 32 | `32_news_categories.sql` | 랜딩 "소식" 섹션 카테고리 배지(Figma 1907:14893): `company_news`/`notices`에 nullable `category` 컬럼 추가 + dev 테스트 행(Test1~3) 시드 UPDATE(마커 가드) | `00_base_schema.sql`의 `company_news`/`notices` 필요 |
| 33 | `33_drop_mentor_legacy_image.sql` | 멘토 성공전략 구버전 통이미지 완전 제거: `home_mentor_strategies.image_url` 컬럼 drop (되돌릴 수 없음 — 실행 전 백업 권장) | `30_landing_admin_media.sql`의 카드 분해 컬럼(badge/title_lines/photo_url 등)으로 전환 완료된 상태 필요 |
| 34 | `34_menu_navigation_sync.sql` | 헤더/드로어 내비게이션 메뉴 구조 동기화 | `00_base_schema.sql` |
| 35 | `35_landing_service_card_links.sql` | `program_categories`(서비스 카드) 링크를 스텁 `/services`에서 실제 서비스 페이지 경로로 교체 (`is distinct from` 가드로 재실행 시 no-op) | `20_landing_renewal.sql`의 `program_categories` 시드 |
| 40 | `40_auth_signup.sql` | **로그인/회원가입 백엔드 누적 파일.** 회원유형 3종 제약, 약관/동의 이력, 학생 연결코드, 학부모-자녀 연결, 휴대폰 인증, `complete_signup_profile` 확장, 연결 RPC 4종, 가입 이어가기 판정, 연결코드 조회 이력, 본인확인 결과 | `00_base_schema.sql`의 `profiles`·`is_winning_admin()`·`extensions.pgcrypto`, `20_landing_renewal.sql`의 `schema_migrations` |

> `partner_universities`(학교리스트 섹션) 테이블·RLS·시드는 2026-07-27 최종본에서 섹션 자체가 삭제되어 이 파일에서 제거됨. 이미 실행된 운영 DB에 테이블이 남아있다면 별도 `drop table` 정리는 필요 시 수동 진행.

## 재실행 시 데이터 보존 원칙

- `10_pricing_orders.sql`의 products/coupons 시드는 `on conflict (id) do nothing` — 이미 존재하는 id는 재실행으로 절대 덮어쓰지 않는다. `api/create-order.js`가 products를 결제 신뢰값으로 읽으므로, 단종 상품·종료 쿠폰의 가격/노출 상태가 파일 재실행으로 롤백되면 실제 청구 금액이 바뀐다.
- `20_landing_renewal.sql`의 `program_categories` 카피 갱신 UPDATE는 `public.schema_migrations` 마커 테이블로 **최초 1회만** 적용된다. 이후 재실행에서는 관리자가 어드민 화면에서 수정한 값을 그대로 보존한다.
- 신규 설치(빈 DB)에서는 위 가드와 무관하게 최초 시드가 정상적으로 들어간다 (모든 `insert ... where not exists` 블록은 계속 무조건 동작).
- `30_landing_admin_media.sql`의 멘토 22건 백필·히어로 배너 시드·배너 행 정리·레거시 멘토 비활성화도 각각 마커(`30_mentor_card_fields_backfill_v1` / `30_banners_hero_seed_v1` / `30_banners_hero_rows_cleanup_v1` / `30_legacy_mentor_rows_deactivate_v1`)로 **최초 1회만** 적용된다. 시드는 로컬경로(`/images/landing/…`)만 사용하며, Storage publicUrl은 환경별로 다르므로 업로드 스크립트가 환경별로 UPDATE한다.

## RLS admin 판정

`31_storage_policies.sql` 실행 이후 랜딩 테이블 write 판정은 `public.is_winning_admin()` (security definer, admin 4단계 role 체계) 기준으로 통일되어 있다. `university_acceptances`의 admin write 정책과 `storage.objects`(`banners` 버킷) insert/update/delete 정책이 모두 이 함수를 사용한다. `profiles` 테이블 자신의 RLS 정책이 `profiles`를 재참조하는 서브쿼리를 직접 쓰면 42P17 infinite recursion으로 관리자 쓰기가 전부 막히므로, 반드시 이 함수를 통해 판정한다. 새 admin write 정책을 추가할 때도 동일 패턴(`using (public.is_winning_admin())` / `with check (public.is_winning_admin())`)을 따를 것. (구 `public.is_admin()`은 20번 최초 도입 함수이며 31번에서 랜딩 테이블 판정은 `is_winning_admin()`으로 교체되었다.)

## 서버 전용 테이블 (RLS 정책 없음 + 권한 회수)

`40_auth_signup.sql`이 만드는 아래 세 테이블은 **RLS를 켜고 정책을 하나도 두지 않는다.** 정책 없는 RLS는 전면 거부이므로 `service_role`(= `api/` 서버리스 함수)만 접근할 수 있다.

| 테이블 | 담는 것 |
|---|---|
| `phone_verifications` | 휴대폰 인증코드 해시, 시도 횟수 |
| `link_code_lookups` | 연결코드 조회 이력 (한도 판정 + 감사) |
| `identity_verifications` | NICE 본인확인 결과 (CI/DI 포함) |

추가로 각 테이블에 `revoke all on table ... from anon, authenticated`를 건다. **Supabase는 `public` 스키마의 테이블·함수에 `anon`/`authenticated` 권한을 기본 부여하는데, `revoke ... from public`만으로는 지워지지 않는다.** PUBLIC 의사롤이 아니라 각 롤에 직접 걸린 권한이라 롤을 명시해 회수해야 한다. 함수도 같다 — `issue_student_link_code` 등 내부 전용 함수는 `revoke all on function ... from public, anon, authenticated`로 막고 필요한 롤에만 `grant execute` 한다.

> 조회가 안 된다는 이유로 이 테이블들에 select 정책을 추가하지 말 것. 인증코드는 발급한 서버만 알아야 하고, 조회 이력과 CI/DI는 본인조차 볼 이유가 없다.

## Supabase Auth 대시보드 설정 (코드에 없음)

가입 플로우는 **6자리 이메일 OTP**(`verifyOtp({ type: 'signup' })`)를 전제로 하는데, 그걸 성립시키는 설정이 코드가 아니라 대시보드에만 있다. 프로젝트를 새로 만들거나 설정이 되돌아가면 아래를 다시 맞춰야 한다.

| 위치 | 항목 | 값 |
|---|---|---|
| Authentication → Emails → Confirm signup | 템플릿 본문 | `{{ .Token }}` 사용, **`{{ .ConfirmationURL }}` 완전 제거** |
| Authentication → Emails → Magic Link | 템플릿 본문 | 위와 동일 (가입 이어가기 경로가 이 템플릿을 쓴다) |
| Authentication → Providers → Email | Email OTP Length | 6 |
| Authentication → Providers → Email | Email OTP Expiration | 600초 권장 (기본 3600초) |
| Authentication → Emails → SMTP | 커스텀 SMTP | 필수. 내장 메일러는 시간당 2통 수준으로 제한된다 |
| Authentication → Rate Limits | 시간당 발송 수 | 커스텀 SMTP 연결 후 상향 |

**`{{ .ConfirmationURL }}`을 남기면 안 되는 이유**: 매직링크를 누르면 Supabase가 이메일을 확인 처리하고 **세션까지 만들어 Site URL로 보내버린다.** 사용자가 가입 폼으로 돌아오지 않으므로 `complete_signup_profile`이 호출되지 않고, `auth.users`에는 있는데 `profiles`에는 없는 계정이 남는다. 그 이메일로는 재가입도 불가능해진다. 링크를 "추가로" 넣는 것도 같은 우회로를 열어두는 것이라 안 된다.

`40_auth_signup.sql` `[9] check_email_signup_state`가 그렇게 생긴 계정을 `resumable_*`로 판정해 이어서 가입시키지만, 애초에 만들지 않는 편이 낫다.

## 외부 연동 IP 화이트리스트

알리고(알림톡·SMS)와 NICE(본인확인)는 발신 IP를 화이트리스트로 검사한다. `api/` 함수의 외부 호출은 `api/_lib/outbound.js`를 거쳐 고정 IP 프록시(Fixie)로 나가야 하며, **프록시를 경유하지 않으면 벤더가 IP로 거절한다.** Supabase Edge Function에서 호출하면 이 프록시를 타지 않으므로 반드시 이 레포의 `api/`에서 나가야 한다.

Fixie의 아웃바운드 IP가 바뀌면 알림톡과 본인확인이 **동시에** 죽는다. 에러가 "IP 차단"으로만 나와 원인이 잘 안 보이므로, IP를 바꿀 일이 생기면 두 벤더 모두에 재등록할 것.
