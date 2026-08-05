import { useEffect, useState } from 'react';
import CountUpNumber from '../CountUpNumber';
import {
  FALLBACK_ACCEPTANCE_RATES,
  computeAcceptanceAverage,
  fetchAcceptanceRates,
  fetchAdmissionCaseLogos
} from '../../pages/admission/admissionCaseData';
import snu from '../../assets/admission/universities/snu.png';
import yonsei from '../../assets/admission/universities/yonsei.png';
import korea from '../../assets/admission/universities/korea.png';
import hanyang from '../../assets/admission/universities/hanyang.png';
import pusan from '../../assets/admission/universities/pusan.png';
import kaist from '../../assets/admission/universities/kaist.png';
import unist from '../../assets/admission/universities/unist.png';
import skku from '../../assets/admission/universities/skku.png';
import hufs from '../../assets/admission/universities/hufs.png';
import konkuk from '../../assets/admission/universities/konkuk.png';
import cau from '../../assets/admission/universities/cau.png';
import sogang from '../../assets/admission/universities/sogang.png';

// 번들 폴백 로고 — admission_case_logos 테이블이 없거나 비어 있을 때 사용.
// 1440→1164 컨테이너 축소 비율(1164/1440≈0.808) 적용 후 rem 환산.
// 폴백은 widthRem을 함께 갖는다(원본 종횡비 보존 — 현재 화면과 픽셀 동일).
// DB 행은 width 컬럼이 없으므로 widthRem이 undefined → width:auto + object-contain.
const FALLBACK_LOGO_ROWS = [
  [
    { key: 'snu', src: snu, name: '서울대학교', heightRem: 1.858, widthRem: 5.994, opacity: 1 },
    {
      key: 'yonsei',
      src: yonsei,
      name: '연세대학교',
      heightRem: 2.043,
      widthRem: 5.856,
      opacity: 1
    },
    { key: 'korea', src: korea, name: '고려대학교', heightRem: 1.67, widthRem: 6.186, opacity: 1 },
    {
      key: 'hanyang',
      src: hanyang,
      name: '한양대학교',
      heightRem: 2.044,
      widthRem: 6.596,
      opacity: 1
    },
    { key: 'pusan', src: pusan, name: '부산대학교', heightRem: 2.043, widthRem: 8.132, opacity: 1 },
    { key: 'kaist', src: kaist, name: 'KAIST', heightRem: 1.858, widthRem: 5.326, opacity: 0.7 },
    { key: 'unist', src: unist, name: 'UNIST', heightRem: 1.111, widthRem: 6.315, opacity: 0.7 }
  ],
  [
    { key: 'skku', src: skku, name: '성균관대학교', heightRem: 2.416, widthRem: 6.528, opacity: 1 },
    {
      key: 'hufs',
      src: hufs,
      name: '한국외국어대학교',
      heightRem: 1.516,
      widthRem: 7.376,
      opacity: 0.8
    },
    {
      key: 'konkuk',
      src: konkuk,
      name: '건국대학교',
      heightRem: 2.041,
      widthRem: 4.791,
      opacity: 1
    },
    { key: 'cau', src: cau, name: '중앙대학교', heightRem: 1.861, widthRem: 7.468, opacity: 1 },
    { key: 'sogang', src: sogang, name: '서강대학교', heightRem: 1.86, widthRem: 5.568, opacity: 1 }
  ]
];

function toLogoItems(dbRows) {
  return dbRows.map((row) => ({
    key: row.id,
    src: row.logo_url,
    name: row.name,
    heightRem: Number(row.display_height_rem) || 2,
    widthRem: undefined,
    opacity: Number(row.opacity) || 1
  }));
}

// DB 로고는 sort_order 순 평면 배열 → 앞쪽이 한 개 더 많게 2줄로 균등 분할.
function splitIntoTwoRows(list) {
  const half = Math.ceil(list.length / 2);
  return [list.slice(0, half), list.slice(half)];
}

function LogoRow({ logos }) {
  if (!logos || logos.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-8">
      {logos.map((logo) => (
        <img
          key={logo.key}
          src={logo.src}
          alt={logo.name}
          loading="lazy"
          className="shrink-0 object-contain"
          // 동적 Tailwind 클래스(h-[${x}rem])는 JIT가 못 잡아 무크기가 된다.
          // DB 값에서 오는 치수는 반드시 inline style로 준다.
          style={{
            height: `${logo.heightRem}rem`,
            width: logo.widthRem ? `${logo.widthRem}rem` : 'auto',
            opacity: logo.opacity
          }}
        />
      ))}
    </div>
  );
}

export default function AcceptanceRateHero() {
  // 초기값을 폴백으로 두어 첫 페인트부터 '5개년 평균 95.4%'가 나온다(레이아웃 시프트 없음).
  const [rates, setRates] = useState(FALLBACK_ACCEPTANCE_RATES);
  const [logoRows, setLogoRows] = useState(FALLBACK_LOGO_ROWS);

  useEffect(() => {
    let alive = true;

    (async () => {
      const [rateRows, logoDbRows] = await Promise.all([
        fetchAcceptanceRates(),
        fetchAdmissionCaseLogos()
      ]);
      if (!alive) return;

      // rateRows: 조회 실패면 폴백(5개년)이 오고, 정상 응답이면 0건이어도
      // 빈 배열이 그대로 온다 — 어드민이 전부 비활성화한 상태를 존중한다.
      setRates(rateRows);

      // logoDbRows === null: 조회 실패 → 초기값(번들 폴백 로고)을 그대로 유지.
      // logoDbRows가 배열이면 정상 응답 → 그대로 반영(0건이면 빈 배열 → 스트립 숨김).
      if (logoDbRows !== null) {
        setLogoRows(logoDbRows.length > 0 ? splitIntoTwoRows(toLogoItems(logoDbRows)) : []);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const years = rates.length;
  const average = computeAcceptanceAverage(rates);
  const hasRates = years > 0;
  const hasLogos = logoRows.some((row) => row.length > 0);

  // 어드민이 합격률·로고를 모두 비활성화하면 빈 여백만 남기지 않고
  // 히어로 섹션 자체를 렌더하지 않는다.
  if (!hasRates && !hasLogos) return null;

  return (
    <section className="pt-16 sm:pt-20 md:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        {hasRates && (
          <>
            <p className="text-xl font-semibold leading-[1.4] tracking-[-0.02em] text-accent">
              {years}개년 평균
            </p>

            <div className="mt-3 flex flex-col items-center gap-2 sm:mt-4 sm:flex-row sm:items-end sm:justify-center sm:gap-4">
              <span className="text-2xl font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252] sm:text-[2.25rem]">
                목표 대학 합격률
              </span>
              <span className="flex items-end gap-1">
                <CountUpNumber
                  value={average}
                  decimals={1}
                  srLabel={`${average.toFixed(1)}퍼센트`}
                  className="text-[3.5rem] font-semibold leading-none tracking-[-0.03em] text-accent sm:text-[5rem]"
                />
                <span
                  aria-hidden="true"
                  className="pb-1 text-xl font-semibold leading-none text-[#525252] sm:pb-2 sm:text-2xl"
                >
                  %
                </span>
              </span>
            </div>
          </>
        )}

        {hasLogos && (
          <div
            className={
              hasRates
                ? 'mt-12 flex flex-col items-center gap-8 sm:mt-16'
                : 'flex flex-col items-center gap-8'
            }
          >
            {logoRows.map((row, index) => (
              <LogoRow key={index} logos={row} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
