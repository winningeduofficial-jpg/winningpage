import { useEffect, useRef, useState } from 'react';

/**
 * 남은 초를 세어주는 재발송 쿨타임 훅.
 *
 * 서버 쪽 제한을 대신하는 게 아니다 — Supabase Auth에는 이미
 * "Minimum interval between emails"(기본 60초)가 걸려 있다. 문제는 그게
 * 화면에 보이지 않아서, 사용자가 버튼을 연타하면 아무 안내 없이 실패만
 * 하고 그 사이 시간당 발송 할당량이 소진된다는 점이다. 이 훅은 남은 시간을
 * 눈에 보이게 만들어 헛클릭 자체를 막는다.
 *
 * 실제 강제력은 서버에 있다. 클라이언트 쿨타임은 우회 가능하므로 보안 장치로
 * 여기지 말 것.
 *
 * @param {number} seconds 쿨타임 길이(초)
 */
export function useCooldown(seconds) {
  const [deadline, setDeadline] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return undefined;
    }

    function tick() {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);

      if (left === 0) {
        setDeadline(0);
      }
    }

    tick();
    timerRef.current = setInterval(tick, 500);

    return () => {
      clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [deadline]);

  return {
    remaining,
    active: remaining > 0,
    start: () => setDeadline(Date.now() + seconds * 1000),
    reset: () => setDeadline(0)
  };
}
