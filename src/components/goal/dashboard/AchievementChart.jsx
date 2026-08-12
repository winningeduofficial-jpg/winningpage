import { Bar, BarChart, ResponsiveContainer, XAxis } from 'recharts';
import GoalCard from '../GoalCard';
import { CHART_COLORS } from '../../charts/chartTheme';
import { getSubjectHex } from '../subjectTokens';

// "학업 성취도 변화 추이" 카드(1076×408 = 67.25rem×25.5rem) — part-05 #15/#20 정본(그룹 막대
// 5그룹×3계열). #12의 4시리즈 라인 차트는 확정 사항에 따라 채택하지 않는다.
//
// recharts@3.10.1을 그대로 활용(작업 지시 §대시보드 위젯 AchievementChart). SVG 내부 치수
// (barSize/barGap 등)는 recharts API가 숫자(px) 단위만 받으므로 이 파일 한정으로 rem 환산 규칙의
// 예외다 — CSS 레이아웃(카드 높이, 여백 등)은 그대로 rem을 쓴다.
//
// 그리드선·Y축·값 라벨·호버 툴팁은 시안에 없다(part-05 §223, §251) — 의도적으로 미구현.
// 계열 3색은 다른 화면(#25/#26/과목 칩 등)과 동일한 과목 색 정본(subjectTokens.js →
// tailwind.config.js `goal.subject.*`)을 재사용한다(코드 검수 §1 — 이전엔 이 카드만 로컬 hex를
// 따로 써서 국어 색이 다른 화면과 어긋났었다).
const SERIES = [
  { key: 'korean', label: '국어', color: getSubjectHex('korean') },
  { key: 'math', label: '수학', color: getSubjectHex('math') },
  { key: 'english', label: '영어', color: getSubjectHex('english') }
];

export default function AchievementChart({ data }) {
  const hasData = Array.isArray(data?.groups) && data.groups.length > 0;

  return (
    <GoalCard tone="neutral" className="flex h-[25.5rem] w-full flex-col gap-4 px-[2rem] py-[1.75rem]">
      <div className="flex items-center justify-between">
        <h3 className="text-[1.125rem] font-bold leading-[1.4] text-ink-strong">학업 성취도 변화 추이</h3>
        {hasData && (
          <ul className="flex items-center gap-5">
            {SERIES.map((series) => (
              <li key={series.key} className="flex items-center gap-2 text-[0.8125rem] leading-[1.4] text-ink">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: series.color }}
                />
                {series.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasData ? (
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.groups} barGap={12} barCategoryGap="28%" margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: CHART_COLORS.label, fontSize: 12 }}
              />
              {SERIES.map((series) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  fill={series.color}
                  barSize={20}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        // 시안(#13)에는 빈 상태 안내 카피가 없지만(§139 "로딩/무데이터 구분 표기 없음"), 완전
        // 공백 카드는 실 사용자에게 로딩 오류처럼 보일 수 있어 최소 안내문을 추가했다(재량, 미확정).
        <div className="flex flex-1 items-center justify-center text-[0.875rem] leading-[1.4] text-ink-sub">
          아직 표시할 성취도 데이터가 없어요.
        </div>
      )}
    </GoalCard>
  );
}
