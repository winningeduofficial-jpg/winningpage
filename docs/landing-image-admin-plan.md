# 랜딩페이지 이미지 → 관리자 관리 전환 계획

작성: 2026-07-28 · 기준 브랜치: landing-free-diagnosis-renewal · dev DB: qxrqwbfjwthwaapikacu (선행 검증), 운영 DB 직접 쓰기 금지
설계 방식: 3안(MVP/운영자 UX/데이터 모델) 경쟁 → 데이터 모델-first 안 채택 + 타 안 아이디어 이식

## 0. 설계 원칙

- **환경 간 이식 가능한 것만 SQL로**: DDL·RLS·로컬경로 시드는 `sql/*.sql` (dev/운영 동일 실행). Storage publicUrl은 환경별로 다르므로 SQL에 절대 URL 금지 — 업로드 스크립트가 환경별로 URL UPDATE.
- **테이블 통합 안 함**: `services`/`home_acceptance_cards`는 deprecated 표기만. 랜딩 소스는 `banners`/`home_side_banners`/`university_acceptances`/`program_categories`/`home_mentor_strategies` 5개로 고정.
- **이미지 키 불변(immutable)**: 교체 = 새 URL. 고아 파일은 즉시 삭제하지 않고 reconcile 스크립트로 주기 청소.
- **멘토 픽셀 메타데이터는 `photo_layout jsonb` 1컬럼** ({top,left,width,height,crop?}).

## 1. Storage 구조 + 초기 이전

버킷: 기존 `banners` 재사용 (`uploadImage()` Admin.jsx:3096 재사용 극대화). 폴더 격리:

```
banners/
  admin/  notice-files/            (기존 유지)
  landing/
    hero/  acceptance/  services/  (icon-shadow.png는 정적 유지 — 이관 제외)
    mentors/photos/                22장, 키 = <sort_order 2자리>-<로마자>.png (한글 금지)
    mentors/cards/                 폴백 통이미지 22장
```

이전 스크립트 `scripts/seed-landing-storage.mjs` (service_role, `--env dev|prod`):
1. sharp 사전 최적화 (강지후 1.78MB 등 이상치 리사이즈 — 비율 유지 필수, photo_layout은 렌더 px 좌표라 실치수 무관)
2. upload(`cacheControl: '31536000, immutable'`, upsert:false) → publicUrl 수집
3. 각 테이블 `*_url` UPDATE — **`where *_url like '/images/landing/%'` 가드** (관리자 수정값 보존, idempotent)
4. 매핑 JSON을 scratchpad에 보존 (검증·롤백 근거)

미참조 6파일(hero 2, acceptance 4)도 업로드 (관리자 교체용 여분, DB 시드 없음).

## 2. 마이그레이션 SQL

**`sql/30_landing_admin_media.sql`**
- `home_mentor_strategies`: `badge text`, `title_lines jsonb`, `photo_url text`, `photo_layout jsonb`, `card_width int default 210` (전부 if not exists)
- 22건 백필 UPDATE: mentor_name+image_url 이중 매칭, `schema_migrations` 마커 `30_mentor_card_fields_backfill_v1` 가드. photo_url은 로컬경로 시드 → 스크립트가 URL 교체
- banners 히어로 969×429 통이미지 1건 시드 (where not exists)
- **[심사 이식]** 레거시 가로형 멘토 행 비활성화 UPDATE도 마커 가드로 SQL화 (수동 실행 대신 dev 선검증·이력 추적)
- **[갭 보완]** 기존 운영 banners 활성 행(구 1938×858 규격) 정리: 신규 행이 sort_order 최상위가 되도록 재배치 + 구 행 비활성화 (마커 가드). 사전에 `HeroSlider.jsx:66` 등 banners 소비처 전수 확인 — 구 컴포넌트가 살아있으면 규격 충돌 검토

**`sql/31_storage_policies.sql`**
- `banners` 버킷 정책 명문화: public read + `is_winning_admin()` insert/update/delete. **일반 authenticated 유저 write 허용 여부 감사 포함**
- `university_acceptances` write 정책 `is_admin()` → `is_winning_admin()` 통일
- banners 구식 profiles 서브쿼리 정책 4개 drop

## 3. 관리자 UI (CONFIGS 확장 4 + 커스텀 1)

공통 (심사 이식): field config `imageSpec: {width, height, tolerance, maxMB, aspectOnly?}` → `createImageBitmap` 실치수 검증 + 경고 모달. `uploadImage`에 `folder`/`cacheControl` 옵션 추가.

| 섹션 | 작업 |
|---|---|
| banners | guideText 969×429 갱신 + imageSpec, button_link 라벨 명시("배너 클릭 시 이동 URL"), "최상위 1건만 노출" 안내 |
| sideBanners | imageSpec 321×429, mobile_image_url 필드 + 도움말 |
| universityAcceptances | track select + subtitle + imageSpec(정방형 aspectOnly 200px+) |
| programCategories | icon_image_url image 필드 추가, description 줄바꿈 안내, **[갭 보완]** "랜딩은 최대 6건 노출" 안내 문구 |
| mentorStrategies | 필드 확장 + **라이브 프리뷰**: MentorSection 카드 렌더를 `src/components/landing/MentorCard.jsx`로 추출, 관리자 폼과 공개 페이지가 동일 컴포넌트 사용 (프리뷰=실렌더 보장). 프리셋 3종(표준 311×400 / 와이드 230 / 크롭형) 버튼 + 고급 섹션에 top/left/width/height 숫자 입력. **[심사 이식]** 필드 미비 시 "구버전 통이미지로 노출 중" 폴백 배지 |

범위 제외: 드래그 정렬, 인라인 토글, webp 변환, 즉시 파일 삭제.

## 4. 프론트 전환

1. `MentorCard.jsx` 추출 (스크린샷 diff로 렌더 동일성 검증)
2. `Home.jsx` mentors normalize: `photo_layout`→`photo` 매핑, `title_lines` 방어 파싱 (컴포넌트 무수정)
3. 히어로 첫 배너 `fetchpriority="high"` (LCP 완화)
4. `LANDING_PREVIEW = false` — 마지막 커밋. 픽스처는 fetch 실패 폴백으로 1릴리스 존치
5. `public/images/landing/**` 삭제는 운영 URL 교체 검증 후 별도 커밋

## 5. 작업 순서 + 검증 (dev 선행)

worktree 신규 브랜치 (`git worktree add -b landing-admin-media ../winningpage-landing-admin main` + `.env.local` cp).

| 단계 | 작업 | 검증 |
|---|---|---|
| 1 | 30/31 SQL 작성 → dev 실행 ×2회 | 컬럼·정책·마커 확인, 백필 22건 count, 멱등 확인 |
| 2 | 업로드 스크립트 dev 실행 | Storage 79키, `*_url like '/images/landing/%'` = 0, URL 샘플 curl 200 |
| 3 | MentorCard 추출 + normalize + fetchpriority | LANDING_PREVIEW=true 상태 스크린샷 diff (무변화) |
| 4 | Admin config 확장 + 멘토 프리뷰 | dev CRUD 왕복 5시나리오 (규격 경고·교체 반영·프리셋 등록·폴백 배지·압축) |
| 5 | LANDING_PREVIEW=false (dev DB) | Playwright 전 섹션 — 김성훈 crop·김무경 230 개별 확인, 네트워크 전부 Storage URL |
| 6 | **[갭 보완] 운영 대상 테이블 5개 사전 스냅샷** (`create table _bak_YYYYMMDD_<t> as select *`) → PR 머지 → 운영 SQL 실행(사용자 승인 하에) → 스크립트 `--env prod` → 배포 | 실사이트 5섹션 + 관리자 왕복 1건. 롤백: 코드=LANDING_PREVIEW 복귀, 데이터=스냅샷 역UPDATE |
| 7 | 1주 관찰 후 정적 파일·dead fixture 정리 | `like '/images/landing/%'` 전 테이블 0건 재확인 |

**[갭 보완] 운영 절차 규칙**: 관리자 저장 = 즉시 공개이므로, 신규 콘텐츠는 `is_active=false`로 저장 → 확인 → 활성화 순서를 관리자 guideText에 명시.

## 6. 공수

| 항목 | 시간 |
|---|---|
| SQL 30/31 + dev 검증 | 3h |
| 업로드 스크립트 | 4h |
| MentorCard 추출 + normalize | 2h |
| Admin config 4종 + uploadImage 옵션화 + imageSpec 검증 | 4h |
| 멘토 커스텀 프리뷰 + 프리셋 | 5h |
| dev 통합 검증 | 3h |
| 운영 이행 + 스냅샷 + 후속 | 3h |
| **합계** | **~24h (버퍼 포함 3일)** |

## 7. 핵심 리스크

| 리스크 | 완화 |
|---|---|
| 멘토 좌표 UX — 운영자가 카드 못 맞춤 | 공용 MentorCard 라이브 프리뷰 + 프리셋 + imageSpec 비율 검증 + 폴백 배지. 안 되면 "사진만 교체, 좌표는 개발 지원" 규칙 |
| 환경 간 URL 오염 | SQL엔 로컬경로만, URL은 환경별 스크립트 + like 가드 |
| 백필/URL UPDATE 오실행 | 마커 가드(재실행 차단) + 운영 사전 스냅샷(1회 오실행 롤백) |
| 기존 운영 banners 행·HeroSlider 충돌 | 소비처 전수 확인 + 구 행 비활성/재배치 SQL |
| 정적 파일 조기 삭제 | 7단계 순서 엄수 (URL 0건 확인 후) |
| LANDING_PREVIEW=false 후 fetch 실패 | 픽스처 폴백 1릴리스 존치 |
</content>
