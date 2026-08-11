-- =====================================================================
-- 55. 수행평가 안내문 첨부 하드닝 — 54번(P7) 검토 지적 3건 반영
--
--   실행 순서: 54_performance_app.sql 이후. 이 파일 단독으로도 idempotent다
--   (전부 `drop policy if exists` / `add column if not exists`).
--
--   대상 3건
--     (1) storage.objects의 소유자 insert/update 정책 철회
--     (2) performance_attachments.cleanup_attempts / cleanup_last_error_at 추가
--     (3) performance_sessions.guide_analysis_count 추가
--
--   ⚠ 54번 파일 쪽도 함께 고쳐 두었다((1)의 두 정책 생성문을 제거). 즉
--     · 새 DB      : 54번이 애초에 만들지 않는다.
--     · 기존 DB    : 이미 만들어진 정책을 이 파일이 drop한다.
--     두 경로 모두 같은 상태(select 정책만 존재)로 수렴한다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) storage.objects — `performance guides owner insert` / `owner update` 철회
--
--   왜 지우는가 (검토 지적)
--     두 정책은 `to authenticated` + `(storage.foldername(name))[1] = auth.uid()::text`
--     뿐이라, **로그인만 했으면 이용권이 없어도** 자기 uid 하위의 임의 경로에
--     supabase-js로 직접 업로드할 수 있었다. 그 경로에는
--       · 세션당 5장 상한          (api/performance/upload-url.js)
--       · 세션 합계 25MB 상한       (같은 파일)
--       · performance_attachments 행 자체
--     가 하나도 적용되지 않는다. 그리고 cleanup 잡은 `performance_attachments`
--     행을 순회하므로 **DB 행이 없는 객체는 90일 cron·24시간 스윕 어느 쪽에도
--     잡히지 않아 영구 잔존**한다 — 업로드 카드에 띄우는 `90일 후 자동 삭제`
--     고지가 이 경로에서만 성립하지 않고 스토리지가 무한히 불어난다.
--
--   지워도 정상 업로드는 그대로다
--     업로드는 `api/performance/upload-url.js`가 발급한 signed upload URL로만
--     이뤄지고, 그 토큰은 service_role이 만든다 — RLS를 타지 않는다. 54번
--     파일의 정책 주석이 이미 "정책 없이도 통과한다"고 적어 두었던 그대로다.
--     같은 저장소의 선례도 이를 뒷받침한다: `mentor-applications` 버킷은
--     signed upload URL 방식이면서 **insert 정책이 아예 없고**(sql/52 (4)
--     「anon/authenticated insert 정책은 만들지 않는다」) 운영에서 정상 동작한다.
--
--   select 정책은 남긴다 — 읽기는 열람용 서명 URL(service_role 발급)이 정본이나,
--   남겨 두어도 "본인 경로만" 이상을 열어주지 않고 새 잔존물을 만들지도 않는다.
--   delete 정책은 54번과 동일하게 만들지 않는다(삭제 권한은 cron/서버 전용).
-- ---------------------------------------------------------------------
drop policy if exists "performance guides owner insert" on storage.objects;
drop policy if exists "performance guides owner update" on storage.objects;


-- ---------------------------------------------------------------------
-- (2) performance_attachments — cleanup 재시도 계량
--
--   왜 필요한가 (검토 지적 — head-of-line blocking)
--     `api/performance/cleanup-attachments.js`의 runSweep은 항상
--     `deleted_at is null` + `created_at` 오름차순 + `limit(batch+1)`로 뜨고,
--     Storage remove가 실패한 묶음은 (의도적으로) `deleted_at`을 찍지 않는다.
--     실패 횟수를 기록할 자리도, backoff도, 건너뛸 장치도 없어서 **영구적
--     이유로 계속 실패하는 오래된 묶음이 배치 앞자리를 영원히 점유**하고
--     그 뒤의 만기분은 배치 상한 안에 절대 들어오지 못한다. 90일 삭제 약속이
--     조용히 멈추는데 `hasMore`는 계속 true라 정상 적체와 구분도 되지 않는다.
--
--   이 두 컬럼으로 cleanup 잡이
--     · remove/update 실패 시 해당 행의 `cleanup_attempts`를 +1 하고
--       `cleanup_last_error_at`을 찍는다,
--     · 조회에서 `cleanup_attempts < 5`인 행만 집어 실패분이 배치를 막지 않게 하고,
--     · 임계를 넘긴 행 수를 응답의 `stuck`으로 노출해 운영이 알아채게 한다.
--
--   인덱스는 새로 만들지 않는다. 54번의 두 부분 인덱스
--   (`performance_attachments_pending_sweep_idx` / `..._retention_idx`, 둘 다
--   `where deleted_at is null`)가 여전히 선두 조건을 담당하고,
--   `cleanup_attempts`는 그 위에 얹히는 잔여 필터다 — 만기 대상 자체가 배치
--   상한(수백 건) 규모라 인덱스를 하나 더 늘릴 이득이 쓰기 비용을 넘지 않는다.
-- ---------------------------------------------------------------------
alter table public."performance_attachments"
    add column if not exists cleanup_attempts integer default 0 not null;

alter table public."performance_attachments"
    add column if not exists cleanup_last_error_at timestamp with time zone;

comment on column public."performance_attachments".cleanup_attempts is
    'cleanup 잡(api/performance/cleanup-attachments.js)이 Storage 원본 삭제/장부 마감에 실패한 누적 횟수. 임계(5)를 넘으면 배치 대상에서 제외되고 응답의 stuck 카운트로만 보고된다.';
comment on column public."performance_attachments".cleanup_last_error_at is
    'cleanup 잡이 마지막으로 이 행 처리에 실패한 시각. 조사용이며 조회 조건에는 쓰지 않는다.';


-- ---------------------------------------------------------------------
-- (3) performance_sessions — 안내문 vision 분석 호출 횟수
--
--   왜 필요한가 (검토 지적 — 무차감 엔드포인트의 비용 증폭)
--     `POST /api/performance/analyze-guide`는 §9.2에 따라 **무차감**이다
--     (차감 지점은 주제 추천 최초 성공 1곳뿐). 그래서 회차가 남용 억제
--     수단이 되지 못하고, 이용권 보유 계정 하나로 5장짜리 vision 호출을
--     무제한 반복시킬 수 있었다(호출당 최대 11k maxOutputTokens + 최대 25MB
--     다운로드, 429/503 시 최대 3회 시도).
--
--   차감을 늘리는 대신(그건 §9.2 위반이다) **호출 횟수 자체에 세션당 상한**을
--   둔다. 이 컬럼은 서버(service_role)만 갱신한다 — 8테이블 전부 클라이언트
--   write 정책이 없다(54번 (2)).
--
--   멱등 단축(요청 첨부가 전부 done이고 guide_json.mode='upload'면 모델을
--   부르지 않고 저장분을 반환)은 이 카운터를 올리지 않는다. 카운터가 오르는
--   것은 **실제로 모델을 부르는 경로뿐**이다.
-- ---------------------------------------------------------------------
alter table public."performance_sessions"
    add column if not exists guide_analysis_count integer default 0 not null;

comment on column public."performance_sessions".guide_analysis_count is
    '안내문 vision 분석(api/performance/analyze-guide.js)을 실제로 호출한 누적 횟수. 무차감 엔드포인트(§9.2)라 회차 대신 이 값으로 세션당 상한을 건다. 멱등 단축 반환은 올리지 않는다.';
