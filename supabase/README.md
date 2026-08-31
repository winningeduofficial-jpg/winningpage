# supabase/ — DB 마이그레이션 체계

2026-08-21 전환. 구 `sql/` 수동 넘버링 체계는 폐기됐다(89개 파일을 dev 스키마 스냅샷으로
스쿼시). 추적은 supabase CLI가 `supabase_migrations.schema_migrations`로 전담한다.

## 구조

| 경로 | 역할 |
|---|---|
| `config.toml` | 로컬 Docker 스택 설정 (PG 17, 포트 54321/54322) |
| `migrations/` | 타임스탬프 마이그레이션. `20260821000000_baseline.sql`이 스쿼시 스냅샷(테이블 83·함수 63·RLS 정책 164) |
| `seed.sql` | 로컬 전용 QA 계정 3종 + 학부모-학생 연결. **실계정 비밀번호 커밋 금지** |

## 개발 흐름

```bash
# 로컬 스택 (Docker 필요)
supabase start            # 첫 기동 시 이미지 다운로드

# 로컬 DB를 dev와 정합시키기 — reset(마이그레이션+seed.sql 재생) 후 dev 데이터 주입
npm run db:reseed

# 개별 실행이 필요하면
supabase db reset                # 마이그레이션 + seed.sql 전체 재생
node scripts/seed-from-dev.mjs   # 콘텐츠·카탈로그만 dev에서 추출 주입(커밋 안 함)

# 새 마이그레이션
supabase migration new <설명>    # migrations/에 타임스탬프 파일 생성
supabase db reset                # 로컬에서 재생 검증
```

### 마이그레이션 파일명 규칙 (CI `Check new migration timestamps` 강제)

- 파일명은 **반드시 `supabase migration new <설명>`으로 생성** — 접두사는 실제 생성 시각(UTC, `YYYYMMDDHHMMSS`).
  손으로 번호를 매기지 말 것. 특히 **미래 날짜·`000000` 같은 가짜 시각 금지**.
- 새 파일의 타임스탬프는 베이스 브랜치의 마지막 마이그레이션보다 커야 한다. 베이스가 앞서갔으면
  베이스 최신화 후 파일을 다시 생성(내용 복사)한다.
- 왜: 2026-08-24에 한 브랜치가 다음 날 접두사(`20260825…`)를 먼저 적용시키자, 같은 날 다른 브랜치의
  정상 번호(`20260824000007/8`)가 원격 마지막 버전보다 작아져 `supabase db push`가 거부했고 이후
  모든 push가 연쇄 실패했다. push 워크플로는 이제 `--include-all`로 순서 역전도 적용하지만,
  파일명은 여전히 생성 시각과 일치시켜 재발을 막는다.

QA 계정(로컬 전용): `devadmin@gmail.com`/`LocalAdmin2026!`(admin),
`qa-student@winning.test`·`qa-parent@winning.test`/`WinningQA2026!`(연결 승인 상태).

## 반영 경로 (수동 SQL Editor 실행 금지)

- PR: `db-migrations-ci.yml`이 로컬 스택 전체 재생 리허설 (`rehearse-migrations` check)
- dev 브랜치 머지 → `db-push-dev.yml`이 dev DB에 `supabase db push --include-all`
- main 브랜치 머지 → `db-push-prod.yml`이 prod DB에 `supabase db push --include-all`
- 필요 secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD_DEV`, `SUPABASE_DB_PASSWORD_PROD` (등록 완료)

앱 배포(Vercel)와 DB push는 같은 push 이벤트에 병렬로 돌므로, 파괴적 변경(컬럼 삭제·
rename)은 expand-contract 2단계로 나눠서 이전 코드가 새 스키마와 공존하게 할 것.

## 주의

- pg_dump 기반 baseline은 public 스키마 전용 — storage 쪽 객체는 별도 마이그레이션
  (`..._storage.sql`)으로 관리한다.
- **auth.users 트리거 2종(profiles 자동 upsert, 가입 쿠폰 자동 발급)은 의도적 드리프트**:
  dev·로컬에만 존재하고 **prod에는 절대 적용 금지**(사용자 확정 2026-08-21). 마이그레이션이
  아닌 `seed.sql`에서 생성하는 이유다. prod로 가는 마이그레이션에 이 트리거를 넣지 말 것.
- 시드 화이트리스트(`scripts/seed-from-dev.mjs`)에 유저 데이터 테이블 추가 금지.
- `db:reseed`의 dev 접속 정보는 **`.env.seed.local`**(gitignore됨)에 둔다 —
  `SUPABASE_URL=https://<dev>.supabase.co`와 `SUPABASE_SERVICE_ROLE_KEY=<dev service key>`
  두 줄. 이 파일이 없으면 `.env.local`을 읽는데, 기본 상태(로컬 블록 활성)에서는
  안전 가드에 걸려 시드가 중단된다.
- **로컬 스택은 워크트리별로 격리되지 않는 공유 자원**이다. `supabase db reset`(=
  `db:reseed`의 첫 단계)은 다른 워크트리·세션이 로컬 DB에 만들어 둔 데이터까지 전부
  지운다 — 병렬 작업 중에는 실행 전에 반드시 확인할 것(2026-08-24 광역 피해 사례).
