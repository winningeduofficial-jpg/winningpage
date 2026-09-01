-- 회원탈퇴 하드 삭제(QA #2, 2026-08-22) — api/delete-account.ts(service_role, Bearer
-- 토큰으로 이미 본인 확인을 마친 뒤)만 호출한다. p_user_id 를 인자로 받고
-- auth.uid() 에 기대지 않는 이유는 service_role 클라이언트로 부르면 사용자 JWT
-- 컨텍스트가 없어 auth.uid() 가 항상 NULL 이기 때문 — 그래서 이 함수는
-- service_role 전용으로 EXECUTE 권한을 좁힌다(authenticated/anon 이 부를 수
-- 있으면 임의 계정을 지울 수 있다, check_email_signup_state 와 동일 원칙).
--
-- 판단 지점 — orders/refund_requests/coupon_redemptions:
--   전자상거래법 5년 보존 대상이자(팀 리드 지시) 스키마 실측 결과
--   (baseline.sql:8890-8895/8995-9010/9188-9203) FK가 전부 ON DELETE RESTRICT +
--   NOT NULL + CHECK(orders_user_id_is_parent_check 등 pair 일치)로 걸려 있어
--   프로필을 NULL로 끊을 수도, 지울 수도 없다(NULL 대입 자체가 NOT NULL 위반).
--   이런 참조가 하나라도 남아 있으면 profiles.id 를 지우는 순간 RESTRICT
--   위반으로 트랜잭션이 실패한다 — 그래서 그 경우엔 profiles 행을 지우지 않고
--   개인식별 컬럼만 익명화한 뒤 'anonymized' 를 반환한다. 호출부는 그 값을 보고
--   auth.admin.deleteUser 대신 updateUserById(ban) 로 로그인만 막는다. 참조가
--   전혀 없으면 profiles 까지 지우고 'deleted' 를 반환 — 호출부가 이어서
--   auth.admin.deleteUser 를 호출한다(profiles_id_fkey ON DELETE CASCADE 라
--   이미 지워진 뒤라도 안전하게 재확인만 된다).
--
-- 이 함수가 먼저 정리하는 표(전부 보존 의무 없음, CASCADE/SET NULL 여부와
-- 무관하게 명시적으로 지운다 — profiles/auth.users 를 지우지 않는 익명화
-- 분기에서도 동일하게 정리돼야 하므로 DB의 ON DELETE 트리거에 기대지 않는다):
--   goal_students(profile_id)              → goal_daily_records/goal_mentor_comments/
--                                             goal_plan_tasks/goal_probability_logs/
--                                             goal_schedules/goal_subject_targets/
--                                             goal_timer_sessions/goal_workbooks CASCADE
--   performance_sessions(profile_id)       → performance_attachments/messages/reports/
--                                             submissions/topics/session_vectors/
--                                             credit_ledger(session_id) CASCADE
--   performance_credit_ledger/session_vectors(profile_id) — 세션 미연결 잔여분
--   program_access_grants/program_access/payments(profile_id 또는 공유 PK id)
--   identity_verifications/mentor_applications/phone_verifications(user_id)
--   student_link_codes(student_id), parent_child_links(parent_id/student_id)
--   coupon_grants(user_id), link_code_lookups(actor_id), user_term_agreements(user_id)
--   enrollments(profile_id) — 스키마가 이미 ON DELETE SET NULL 로 "기록 보존 +
--   연결만 해제"를 선언했다(baseline.sql:8900) — 같은 의미로 수동 반영한다.
CREATE OR REPLACE FUNCTION "public"."fn_delete_account"("p_user_id" "uuid")
    RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_has_retained_records boolean;
begin
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22004';
  end if;

  select exists (
    select 1 from public.orders
     where user_id = p_user_id
        or parent_profile_id = p_user_id
        or student_profile_id = p_user_id
    union all
    select 1 from public.refund_requests
     where user_id = p_user_id
        or parent_profile_id = p_user_id
        or student_profile_id = p_user_id
        or requested_by = p_user_id
    union all
    select 1 from public.coupon_redemptions where user_id = p_user_id
  ) into v_has_retained_records;

  delete from public.goal_students where profile_id = p_user_id;
  delete from public.performance_sessions where profile_id = p_user_id;
  delete from public.performance_credit_ledger where profile_id = p_user_id;
  delete from public.performance_session_vectors where profile_id = p_user_id;
  delete from public.program_access_grants where profile_id = p_user_id;
  delete from public.program_access where id = p_user_id;
  delete from public.payments where id = p_user_id;
  delete from public.identity_verifications where user_id = p_user_id;
  delete from public.mentor_applications where user_id = p_user_id;
  delete from public.phone_verifications where user_id = p_user_id;
  delete from public.student_link_codes where student_id = p_user_id;
  delete from public.parent_child_links where parent_id = p_user_id or student_id = p_user_id;
  delete from public.coupon_grants where user_id = p_user_id;
  delete from public.link_code_lookups where actor_id = p_user_id;
  delete from public.user_term_agreements where user_id = p_user_id;
  update public.enrollments set profile_id = null where profile_id = p_user_id;

  if v_has_retained_records then
    update public.profiles
       set name = null,
           phone = null,
           email = null,
           username = null,
           school_type = null,
           school_name = null,
           birth_date = null,
           gender = null,
           landline = null,
           address = null,
           address_detail = null,
           guardian_phone = null,
           memo = null,
           region = null,
           payment_terminal_id = null,
           marketing_agreed = false,
           ads_agreed = false,
           sms_agreed = false,
           guardian_consent = false,
           is_active = false,
           updated_at = now()
     where id = p_user_id;
    return 'anonymized';
  end if;

  delete from public.profiles where id = p_user_id;
  return 'deleted';
end;
$$;

REVOKE ALL ON FUNCTION "public"."fn_delete_account"("uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_delete_account"("uuid") TO "service_role";

COMMENT ON FUNCTION "public"."fn_delete_account"("uuid") IS '회원탈퇴 하드 삭제(QA #2) — api/delete-account.ts(service_role) 전용, authenticated/anon 실행 금지. orders/refund_requests/coupon_redemptions 참조가 있으면(전자상거래법 5년 보존 + FK RESTRICT/NOT NULL) 사용자 소유 데이터만 정리하고 profiles 는 개인식별 필드만 익명화한 뒤 anonymized 를 반환, 참조가 전혀 없으면 profiles 까지 지우고 deleted 를 반환한다 — 호출부는 deleted 일 때만 auth.admin.deleteUser 를 이어서 호출하고, anonymized 일 때는 updateUserById(ban) 로 로그인만 막는다.';
