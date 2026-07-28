# dev Supabase 서울(ap-northeast-2) 재생성 계획

**✅ 실행 완료 (2026-07-28)** — 신규 dev: `gjowqdiopinhixfivnkx` (ap-northeast-2 서울, PG17). 구 `qxrqwbfjwthwaapikacu`(도쿄) 영구 삭제. 백업: `~/uwellnow/winningpage-dev-backup-2026-07-28/`.

실행 중 계획과 달랐던 점:
- free 한도 충돌: 조직 멤버 kimtaeran4767이 타 조직 free 2개 보유로 생성 차단 → 사용자가 해당 멤버 role을 Developer로 변경 후 해결 (한도는 Owner/Administrator만 검사)
- roles.sql의 `supabase_realtime_admin` GRANT가 신규 프로젝트에 롤 부재로 실패 → 해당 줄 제외 후 복원 성공 (플랫폼 관리 영역)
- 신규 프로젝트에 legacy anon/service_role 키가 여전히 발급됨 (2025-11 중단 정보와 달리 병행 제공) — dev는 신 키 체계(sb_publishable_/sb_secret_) 채택
- `supabase_realtime` publication이 신규 프로젝트에서 비어 있음 → banners, page_contents 수동 추가. **운영도 비어 있는 상태 발견** (운영 realtime 라이브 갱신 미동작 — 별도 이슈, 운영은 무접촉)
- dev admin 실제 이메일은 `devadmin@gmail.com` (기존 기록 teamstronglife2023+devadmin@gmail.com 은 부정확)
- 검증: 복원 105행 dump=live 전수 일치, storage 78 URL 정합·업로드 79건, RLS 차단(42501)·로그인·realtime 수신 전부 통과

잔여 수동 확인: 다음 브랜치 push의 Preview에서 dev DB 조회·/admin 로그인 (Vercel Preview env는 재등록 완료)

작성: 2026-07-28. 근거: 2026-07 웹서치 (Supabase 공식 문서 교차 검증 완료) + 리포 의존성 전수 감사.

## 배경

| 항목 | 값 |
|---|---|
| 운영 | `ucjlcvqvinspmrasvsug` — ap-northeast-1 (도쿄), **유지** |
| dev (폐기 대상) | `winningpage-dev` = `qxrqwbfjwthwaapikacu` — ap-northeast-1, 2026-07-27 생성 |
| 목표 | dev만 ap-northeast-2 (서울)로 폐기 후 재생성 |

Supabase는 기존 프로젝트의 region 변경을 지원하지 않는다(인프라 수준 고정). "Restore to another project" 기능도 같은 region 강제. 재생성 + 마이그레이션이 유일한 경로.

## 핵심 제약 (2026-07 기준 검증됨)

1. **Free 플랜은 활성 프로젝트 2개 제한** (Owner인 전 조직 합산, paused 미포함). 현재 2개 사용 중이므로 free라면 "백업 → 삭제 → 생성" 순서 필수. Paid 조직이면 "생성 → 이전 → 검증 → 삭제" 순서가 더 안전하므로 Phase 0에서 플랜 먼저 확인.
2. **삭제는 영구·비가역** — 자동 백업·PITR 포함 접근 불가. 단 dev는 운영 DB에서 언제든 재복제 가능(docs/env-separation-plan.md Phase 1 절차 보존)하므로 실질 리스크 낮음.
3. **2025-11-01 이후 신규 프로젝트는 legacy `anon`/`service_role` 키 미제공** — `sb_publishable_...` / `sb_secret_...` 체계가 기본. `@supabase/supabase-js` ^2.48은 drop-in 호환(publishable→anon 자리, secret→service_role 자리). env 변수 이름은 유지하고 값만 교체.
4. 생성 API: `POST /v1/projects`의 `region` 필드는 deprecated — `region_selection: {"type":"specific","code":"ap-northeast-2"}` 사용. 서울 region은 공식 지원 목록에 있음. `GET /v1/projects/available-regions`(Beta)로 사전 확인 권장.

## 이전 대상 자산 (감사 결과)

- **DB**: public 57개 테이블 + 시드 (mentors 22, universities 26). 리뉴얼 SQL(`sql/00`→`10`→`20`→`30`→`31`) 적용 상태. `schema_migrations` 마커 존재
- **auth**: dev 관리자 `teamstronglife2023+devadmin@gmail.com` — `--data-only` 덤프에 auth.users가 포함되므로 비밀번호 해시째 이전됨 (keychain `Winning dev admin` 그대로 유효)
- **storage**: bucket `banners` 단일. 파일은 이전하지 않음 — `scripts/seed-landing-storage.mjs` 재실행으로 재구성
- **realtime**: `postgres_changes` 구독 2곳 (HeroSlider, Header) — 코드 변경 불요, env만 교체되면 동작
- **코드 수정 필요 지점 유일**: `scripts/seed-landing-storage.mjs:65` `DEV_PROJECT_REF` 하드코딩(안전가드) → 새 ref로 갱신

## Phase 0 — 사전 확인 (~10분)

- [ ] 조직(`nxdgsavniegqcctcdbbs`) 플랜 확인 → free면 아래 순서 그대로, paid면 Phase 3을 Phase 2보다 먼저
- [ ] `GET /v1/projects/available-regions`로 `ap-northeast-2` 가용 확인 (토큰: keychain `Supabase CLI`)
- [ ] 현 dev DB 비밀번호 확보 (Phase 1 덤프에 필요)
- [ ] Vault/컬럼 암호화 미사용 확인 (사용 시 root key 별도 절차 — 현재 해당 없음 추정)

## Phase 1 — 현 dev 백업 (~15분)

```bash
DEV_DB_URL="postgresql://postgres:<pw>@db.qxrqwbfjwthwaapikacu.supabase.co:5432/postgres"  # pw는 percent-encode

supabase db dump --db-url "$DEV_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DEV_DB_URL" -f schema.sql
supabase db dump --db-url "$DEV_DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes" \
  -x "storage.objects" -x "storage.buckets" -x "storage.prefixes"
```

- storage 데이터를 제외하는 이유: 파일 미이전이라 orphan row 방지. bucket/정책은 `sql/31_storage_policies.sql`로 재생성
- 덤프 검증 후 다음 단계: 파일 크기 확인 + `grep`으로 핵심 행 존재 확인 (mentors 22건 등). **검증 전 삭제 금지**

## Phase 2 — 구 dev 삭제 (사용자 최종 확인 후 실행)

- ref 3중 확인: 삭제 대상은 `qxrqwbfjwthwaapikacu` (운영 `ucjlcvqvinspmrasvsug` 절대 아님)
- `supabase projects delete qxrqwbfjwthwaapikacu` 또는 `DELETE /v1/projects/qxrqwbfjwthwaapikacu`
- 삭제 즉시 billing 중지. free 슬롯 반환은 사실상 즉시(명시 문구는 없음 — 생성 시 limit 에러 나면 잠시 대기)

## Phase 3 — 서울 재생성 (~5분 + 프로비저닝 대기)

- 새 DB 비밀번호 생성 → keychain 보관 (서비스명 예: `Winning dev db`)

```bash
curl -X POST https://api.supabase.com/v1/projects \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name": "winningpage-dev",
    "organization_slug": "nxdgsavniegqcctcdbbs",
    "db_pass": "<새 비밀번호>",
    "region_selection": {"type": "specific", "code": "ap-northeast-2"}
  }'
```

- (대안: `supabase projects create winningpage-dev --org-id nxdgsavniegqcctcdbbs --region ap-northeast-2 --db-password ...`)
- Postgres 17 기본 확인 (구 dev도 17 — 버전 일치)
- `ACTIVE_HEALTHY` 될 때까지 대기 후 새 ref 기록

## Phase 4 — 복원 (~15분)

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DEV_DB_URL"
```

- `session_replication_role = replica`: 복원 중 트리거 비활성화 (공식 절차)
- 검증: 테이블 57개, mentors 22, universities 26, `schema_migrations` 마커, auth.users에 devadmin 존재
- 커스텀 LOGIN 롤이 있다면 비밀번호 재설정 필요 (현재 없음 추정)

## Phase 5 — Storage 재구성 (~20분)

1. `sql/31_storage_policies.sql` 실행 — `banners` bucket 생성 + 정책 4종 (SQL Editor 42501 실패 시 대시보드 수동 생성 폴백, 파일 내 명시됨)
2. `scripts/seed-landing-storage.mjs:65` `DEV_PROJECT_REF`를 새 ref로 수정 (코드 1줄)
3. **⚠️ 구 publicUrl 잔존 처리**: 복원된 5개 테이블(banners, home_side_banners, university_acceptances, program_categories, home_mentor_strategies)의 image_url이 구 ref(`qxrqwbfjwthwaapikacu`) publicUrl을 가리킴. seed 스크립트는 `/images/landing/%` 로컬경로만 UPDATE하므로 이 row들은 안 잡힌다. 복원 직후 일괄 치환 SQL 실행:
   ```sql
   -- 각 대상 테이블·컬럼에 대해
   UPDATE <table> SET <col> = replace(<col>, 'qxrqwbfjwthwaapikacu', '<새 ref>')
   WHERE <col> LIKE '%qxrqwbfjwthwaapikacu%';
   ```
4. `SEED_SUPABASE_URL`(새 URL)/`SEED_SERVICE_ROLE_KEY`(새 secret 키)로 `node scripts/seed-landing-storage.mjs --env dev` 실행 — landing 이미지 업로드 (URL은 3에서 이미 치환됐으므로 업로드 결과와 정합 확인)

## Phase 6 — 키·환경 전환 (~15분)

- `GET /v1/projects/<새 ref>/api-keys?reveal=true` → `sb_publishable_...`, `sb_secret_...` 확보
- Vercel env 재등록 — **Preview·Development 스코프만** (Production 절대 건드리지 않기):
  - `VITE_SUPABASE_URL` / `WINNING_SUPABASE_URL` = 새 URL
  - `VITE_SUPABASE_ANON_KEY` = publishable 키
  - `WINNING_SUPABASE_SERVICE_ROLE_KEY` = secret 키
- `.env.local` 교체 (main 체크아웃 + worktree 양쪽). `.env.local.prod-backup`은 그대로
- ⚠️ `vercel env pull` 결과를 재등록 소스로 쓰지 말 것 (sensitive 변수 `[SENSITIVE]` 오염 — 2026-07-28 사고 전례)

## Phase 7 — 검증 (기존 env-separation Phase 5 통합)

- [ ] 로컬 `pnpm dev`: 홈 데이터 로드, 이미지 렌더 (새 storage publicUrl)
- [ ] `/admin` 로그인 — devadmin 계정 (비밀번호 keychain `Winning dev admin` 그대로), CRUD, 이미지 업로드
- [ ] realtime: banners 수정 시 HeroSlider 실시간 갱신
- [ ] 브랜치 push → Preview가 새 dev DB 조회 (dev 전용 마커 데이터로 확인)
- [ ] api/ 서버리스 (create-order 등) Preview에서 동작 (secret 키 경유)
- [ ] 운영 도메인 무영향 확인 (Production env 무변경)

## Phase 8 — 마무리

- `docs/env-separation-plan.md` 갱신 (새 ref, region, 키 체계)
- `docs/landing-image-admin-plan.md` 헤더 ref 갱신
- 메모리 갱신

## 리스크 요약

| 리스크 | 완화 |
|---|---|
| 삭제 비가역 | 덤프 검증 후 삭제 + 최악 시 운영에서 재복제 경로 존재 |
| 신규 키 체계 첫 적용 | supabase-js ^2.48 drop-in 호환 확인됨. env 이름 불변, 값만 교체 |
| free 슬롯 반환 지연 가능성 | 생성 limit 에러 시 대기 후 재시도 |
| 구 publicUrl 잔존 row | Phase 5-3 일괄 치환 SQL |
| Toss Preview 키 | 기존 이슈 그대로 (`VITE_TOSS_CLIENT_KEY` Preview=운영 키, 이번 범위 아님) |

**예상 공수: 약 1.5시간** (프로비저닝 대기 포함). 실행 순서 요약: 확인 → 백업 → (검증) → 삭제 → 생성(서울) → 복원 → storage 재구성 → 키 전환 → 검증 → 문서화.
