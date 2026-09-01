// 개인정보 반출 게이트의 검증·적재 회귀 테스트 (QA 268·270·228·223·271·269).
//
// 이 게이트가 지켜야 하는 계약은 넷이다:
//   1. 비밀번호는 **세션의 auth 이메일**로 확인한다. profiles.email 미러를 쓰면
//      이메일 변경 직후 본인인데 실패한다(전례가 있어 명시적으로 잠근다).
//   2. 사유는 공백만으로 통과하지 못한다 — "사유 필수 기재"가 요구의 핵심이다.
//   3. 적재에 실패하면 ok:false 다. 호출부가 실제 동작을 진행하지 않으므로,
//      남기지 못한 반출은 일어나지 않는다(fail-closed).
//   4. 적재 payload 는 로그인한 본인 id/이메일로 채운다 — RLS 의 with check
//      (profile_id = auth.uid()) 와 어긋나면 통째로 거부된다.

import { expect, test } from "vitest";
import {
  type AdminAccessLogClient,
  verifyAdminPassword,
  writeAdminAccessLog,
} from "./adminAccessLog";

type Recorded = {
  signIn: { email: string; password: string }[];
  inserted: Record<string, unknown>[];
};

function fakeClient(options: {
  user?: { id?: string; email?: string } | null;
  signInError?: unknown;
  insertError?: unknown;
}): { client: AdminAccessLogClient; recorded: Recorded } {
  const recorded: Recorded = { signIn: [], inserted: [] };

  const client: AdminAccessLogClient = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === undefined ? null : options.user },
        error: null,
      }),
      signInWithPassword: async (credentials) => {
        recorded.signIn.push(credentials);
        return { error: options.signInError ?? null };
      },
    },
    from: () => ({
      insert: async (values) => {
        recorded.inserted.push(values);
        return { error: options.insertError ?? null };
      },
    }),
  };

  return { client, recorded };
}

test("비밀번호는 세션의 auth 이메일로 확인한다", async () => {
  const { client, recorded } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
  });

  const result = await verifyAdminPassword("hunter2", client);

  expect(result).toEqual({ ok: true });
  expect(recorded.signIn).toEqual([
    { email: "session@winning.test", password: "hunter2" },
  ]);
});

test("빈 비밀번호는 재검증을 부르지 않고 즉시 막는다", async () => {
  const { client, recorded } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
  });

  const result = await verifyAdminPassword("", client);

  expect(result.ok).toBe(false);
  expect(recorded.signIn).toHaveLength(0);
});

test("비밀번호가 틀리면 스토리지 원문 대신 안내 문구를 낸다", async () => {
  const { client } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
    signInError: { message: "Invalid login credentials" },
  });

  const result = await verifyAdminPassword("wrong", client);

  expect(result).toEqual({
    ok: false,
    message: "비밀번호가 일치하지 않습니다.",
  });
});

test("공백만 적은 사유는 적재하지 않는다", async () => {
  const { client, recorded } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
  });

  const result = await writeAdminAccessLog(
    { action: "download", resourceKey: "members", reason: "   " },
    client,
  );

  expect(result.ok).toBe(false);
  expect(recorded.inserted).toHaveLength(0);
});

test("적재 payload 는 본인 id·이메일과 다듬은 사유로 채운다", async () => {
  const { client, recorded } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
  });

  const result = await writeAdminAccessLog(
    {
      action: "download",
      resourceKey: "mentorApplications",
      reason: "  제휴 심사 자료 요청  ",
      rowCount: 12,
    },
    client,
  );

  expect(result).toEqual({ ok: true });
  expect(recorded.inserted).toEqual([
    {
      profile_id: "u-1",
      actor_email: "session@winning.test",
      action: "download",
      resource_key: "mentorApplications",
      reason: "제휴 심사 자료 요청",
      row_count: 12,
      target_id: null,
    },
  ]);
});

test("마스킹 해제는 대상 id 를 남기고 건수는 비운다", async () => {
  const { client, recorded } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
  });

  await writeAdminAccessLog(
    {
      action: "unmask",
      resourceKey: "members",
      reason: "환불 문의 응대",
      targetId: "member-9",
    },
    client,
  );

  expect(recorded.inserted[0]).toMatchObject({
    action: "unmask",
    target_id: "member-9",
    row_count: null,
  });
});

test("적재가 실패하면 ok:false — 호출부가 실제 동작을 진행하지 않는다", async () => {
  const { client } = fakeClient({
    user: { id: "u-1", email: "session@winning.test" },
    insertError: { message: "new row violates row-level security policy" },
  });

  const result = await writeAdminAccessLog(
    { action: "download", resourceKey: "revenue", reason: "정산 대사" },
    client,
  );

  expect(result.ok).toBe(false);
});

test("세션이 없으면 확인도 적재도 하지 않는다", async () => {
  const { client, recorded } = fakeClient({ user: null });

  expect((await verifyAdminPassword("x", client)).ok).toBe(false);
  expect(
    (
      await writeAdminAccessLog(
        { action: "download", resourceKey: "members", reason: "사유" },
        client,
      )
    ).ok,
  ).toBe(false);
  expect(recorded.signIn).toHaveLength(0);
  expect(recorded.inserted).toHaveLength(0);
});
