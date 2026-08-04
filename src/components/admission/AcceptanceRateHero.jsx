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

// 1440→1164 컨테이너 축소 비율(1164/1440≈0.808) 적용 후 rem 환산. 로고마다 원본
// 종횡비를 보존해 개별 치수를 지정한다(전체 일괄 크기 금지 — 시안 개별 로고 크기 상이).
const ROW_1 = [
  { src: snu, alt: '서울대학교', className: 'h-[1.858rem] w-[5.994rem]' },
  { src: yonsei, alt: '연세대학교', className: 'h-[2.043rem] w-[5.856rem]' },
  { src: korea, alt: '고려대학교', className: 'h-[1.670rem] w-[6.186rem]' },
  { src: hanyang, alt: '한양대학교', className: 'h-[2.044rem] w-[6.596rem]' },
  { src: pusan, alt: '부산대학교', className: 'h-[2.043rem] w-[8.132rem]' },
  // 시안 opacity 0.7 적용된 두 로고
  { src: kaist, alt: 'KAIST', className: 'h-[1.858rem] w-[5.326rem] opacity-70' },
  { src: unist, alt: 'UNIST', className: 'h-[1.111rem] w-[6.315rem] opacity-70' }
];

const ROW_2 = [
  { src: skku, alt: '성균관대학교', className: 'h-[2.416rem] w-[6.528rem]' },
  // 시안 opacity 0.8 적용된 로고
  { src: hufs, alt: '한국외국어대학교', className: 'h-[1.516rem] w-[7.376rem] opacity-80' },
  { src: konkuk, alt: '건국대학교', className: 'h-[2.041rem] w-[4.791rem]' },
  { src: cau, alt: '중앙대학교', className: 'h-[1.861rem] w-[7.468rem]' },
  { src: sogang, alt: '서강대학교', className: 'h-[1.860rem] w-[5.568rem]' }
];

function LogoRow({ logos }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-8">
      {logos.map((logo) => (
        <img
          key={logo.alt}
          src={logo.src}
          alt={logo.alt}
          className={`shrink-0 object-contain ${logo.className}`}
        />
      ))}
    </div>
  );
}

export default function AcceptanceRateHero() {
  return (
    <section className="pt-16 sm:pt-20 md:pt-[6.25rem]">
      <div className="mx-auto w-full max-w-content px-5 text-center sm:px-8">
        <p className="text-xl font-semibold leading-[1.4] tracking-[-0.02em] text-accent">
          5개년 평균
        </p>

        <div className="mt-3 flex flex-col items-center gap-2 sm:mt-4 sm:flex-row sm:items-end sm:justify-center sm:gap-4">
          <span className="text-2xl font-semibold leading-[1.4] tracking-[-0.02em] text-[#525252] sm:text-[2.25rem]">
            목표 대학 합격률
          </span>
          <span className="flex items-end gap-1">
            <span className="text-[3.5rem] font-semibold leading-none tracking-[-0.03em] text-accent sm:text-[5rem]">
              95.4
            </span>
            <span className="pb-1 text-xl font-semibold leading-none text-[#525252] sm:pb-2 sm:text-2xl">
              %
            </span>
          </span>
        </div>

        <div className="mt-12 flex flex-col items-center gap-8 sm:mt-16">
          <LogoRow logos={ROW_1} />
          <LogoRow logos={ROW_2} />
        </div>
      </div>
    </section>
  );
}
