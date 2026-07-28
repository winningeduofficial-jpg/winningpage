# dev/운영 환경 분리 계획

> ⚠️ **이 문서에 실제 시크릿 값 기재 금지** — URL, anon/service key, DB 비밀번호 등 실제 값은 절대 적지 말 것. 키 이름과 스코프(Production/Preview/Development)만 기록한다. 실제 값은 Vercel 대시보드 또는 로컬 `.env.local`(`.env.example` 참고)에만 둔다.

작성: 2026-07-27 · 기준: main 브랜치 · 비용: $0 (Supabase Free 2프로젝트)

## 진행 상태 (2026-07-28)

- [x] **Phase 1** — dev 프로젝트 `winningpage-dev`(qxrqwbfjwthwaapikacu) 생성·복제 완료. public 57개 테이블 + 시드 확인 (mentors 22, universities 26). 리뉴얼 SQL 적용됨
- [x] **Phase 1 보정** — dev 테스트 관리자 계정 생성 완료: `teamstronglife2023+devadmin@gmail.com`, profiles.role='admin'. 비밀번호는 macOS keychain(서비스명 `Winning dev admin`)에 보관
- [x] **Phase 2** — Vercel env 스코프 분리 완료: `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`WINNING_SUPABASE_URL`/`WINNING_SUPABASE_SERVICE_ROLE_KEY` 4종을 Production=운영, Preview/Development=dev로 재등록. Development 스코프는 API로 실값 검증 완료; Production/Preview는 sensitive 타입이라 읽기 검증 불가(등록 소스는 Supabase Management API 실키) → 다음 배포에서 최종 확인 필요
  - `VITE_TOSS_CLIENT_KEY`는 Preview에 아직 운영 키 — 토스 테스트 키 확보 시 교체 (보류)
- [x] **Phase 3** — 로컬 `.env.local` dev 키로 전환 완료 (main·worktree 양쪽). 기존 운영 키는 `.env.local.prod-backup`(gitignored)에 백업
- [ ] **Phase 5** — 검증: 다음 브랜치 push의 Preview에서 dev DB 조회·/admin 로그인 확인, 운영 도메인 재배포 후 정상 확인

> ⚠️ 주의: `vercel env pull`은 sensitive 변수를 `[SENSITIVE]` 리터럴로 기록한다 — pull 결과를 재등록 소스로 쓰지 말 것. 실키는 Supabase Management API(`/v1/projects/:ref/api-keys?reveal=true`)에서 받는다.

## 목표

1. Vercel **Preview** = Supabase **dev** 프로젝트
2. Vercel **Production** = Supabase **운영** 프로젝트

## 현황 (검증 완료)

- Supabase 조직 `winningeduofficial-jpg's Org` = **free 플랜**, 활성 프로젝트 1개 (운영 `ucjlcvqvinspmrasvsug`, ap-northeast-1, Postgres 17, DB 20MB)
- Free 한도: 조직당 활성 프로젝트 2개 → dev 추가 가능, 둘 다 무료
- Vercel 프로젝트 `winningpage` ↔ GitHub `winningeduofficial-jpg/winningpage` Git 연동 — main merge 시 Production 자동 배포, 그 외 브랜치 push 시 Preview 자동 배포

## BP 근거 (2026-07 웹서치)

- Supabase 다중 환경: Free 조건에선 "프로젝트 분리"가 정석 (Pro branching은 유료). 환경 동기화는 마이그레이션 파일 규율로 — dev 먼저 적용·검증 후 같은 파일을 운영에 적용 (스키마 드리프트 방지)
  - https://supabase.com/docs/guides/deployment/managing-environments
  - https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Vercel env: 같은 변수명을 환경 스코프(Production/Preview/Development)별 다른 값으로 등록하는 게 표준. Vite는 `VITE_` prefix 빌드타임 주입
  - https://vercel.com/docs/frameworks/frontend/vite
  - https://envtools.dev/guides/vercel-environment-variables

## Phase 1 — Supabase dev 프로젝트 생성·복제 (~30분)

1. 같은 조직에 `winningpage-dev` 생성 (region: ap-northeast-1, 운영과 동일). Management API 자동화 가능 — DB 비밀번호는 생성 즉시 별도 보관
2. 운영 복제 (CLI 덤프 3종 → 복원):
   ```bash
   supabase db dump --db-url "$PROD_DB_URL" -f roles.sql --role-only
   supabase db dump --db-url "$PROD_DB_URL" -f schema.sql
   supabase db dump --db-url "$PROD_DB_URL" -f data.sql --data-only
   psql "$DEV_DB_URL" -f roles.sql -f schema.sql -f data.sql
   ```
   - Postgres 메이저 버전 일치 확인 (양쪽 17)
3. 복제에서 빠지는 것 보정:
   - **auth 스키마 미복제** → dev에서 테스트 계정 신규 가입 후 `profiles.role='admin'` 설정. 대응하는 auth.users가 없는 profiles 잔여 row는 정리
   - Storage 파일 미복제 → 이미지 URL이 운영 Storage를 가리키므로 렌더는 정상
4. `sql/10_pricing_orders.sql` → `sql/20_landing_renewal.sql` 순서로 **dev에 먼저 실행** (실행 순서·의존관계는 `sql/README.md` 참고, 리뉴얼 스키마 첫 검증 무대)

## Phase 2 — Vercel env 스코프 설정 (~15분)

| 변수 | Production | Preview | Development |
|---|---|---|---|
| `VITE_SUPABASE_URL` | 운영 URL | **dev URL** | dev URL |
| `VITE_SUPABASE_ANON_KEY` | 운영 key | **dev key** | dev key |
| `VITE_TOSS_CLIENT_KEY` | 운영 키 | 테스트 키 권장 | 테스트 키 |

- 기존 변수가 "All Environments"로 등록돼 있으면 스코프 분리로 재등록 (대시보드 또는 `vercel env add <name> <scope>`)
- `VITE_ADMIN_BYPASS`는 Vercel에 **등록 금지** — 로컬 `.env.local` 전용 (dev 서버 이중 조건이라 프로덕션 빌드에 무해하지만 원칙 유지)

## Phase 3 — 로컬 개발 규약

- `.env.local`은 `vercel env pull`(Development 스코프)로 생성 → 로컬은 항상 dev DB
- 로컬에서 운영 키 제거 — 실수로 운영 데이터를 만질 경로 차단

## Phase 4 — 스키마 변경 워크플로 (상시 규칙)

```
sql/ 마이그레이션 파일 작성 (idempotent)
 → dev에 적용 + 로컬/Preview 검증
 → 코드와 함께 브랜치 push → Preview URL(=dev DB)에서 검수
 → main merge (Vercel Production 자동 배포)
 → 같은 SQL을 운영에 적용 — 배포와 짝으로, 순서는 "SQL 먼저"
```

- 현 규모: Supabase SQL Editor 수동 적용
- 향후 옵션: GitHub Actions로 마이그레이션 자동 적용 (BP 권장, 현재는 과잉)

## Phase 5 — 검증 체크리스트

1. 아무 브랜치 push → Preview URL이 dev DB 데이터를 보는지 (dev에만 마커 데이터 1건 넣어 확인)
2. 운영 도메인은 운영 DB 그대로인지
3. dev 테스트 계정으로 `/admin` 로그인 → CRUD → Preview 반영 확인

## 운영 수칙

- dev는 7일 무요청 시 자동 일시정지 → 대시보드에서 재개 (한도 무영향)
- dev에 실고객 민감정보 미보관 (Preview URL은 외부 공유 가능)
- 분기 1회 운영→dev 재복제로 데이터 신선도 유지

## 리스크

- 운영에는 읽기(pg_dump)만 수행 — 무중단·무영향
- 총 소요 약 1시간
