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
supabase db reset         # 마이그레이션 + seed.sql 전체 재생

# 콘텐츠·카탈로그 데이터 주입 (dev에서 그때그때 추출, 커밋 안 함)
node scripts/seed-from-dev.mjs   # .env.local의 dev service key 필요

# 새 마이그레이션
supabase migration new <설명>    # migrations/에 타임스탬프 파일 생성
supabase db reset                # 로컬에서 재생 검증
```

QA 계정(로컬 전용): `devadmin@gmail.com`/`LocalAdmin2026!`(admin),
`qa-student@winning.test`·`qa-parent@winning.test`/`WinningQA2026!`(연결 승인 상태).

## 반영 경로 (수동 SQL Editor 실행 금지)

- PR: `db-migrations-ci.yml`이 로컬 스택 전체 재생 리허설 (`rehearse-migrations` check)
- dev 브랜치 머지 → `db-push-dev.yml`이 dev DB에 `supabase db push`
- main 브랜치 머지 → `db-push-prod.yml`이 prod DB에 `supabase db push`
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
