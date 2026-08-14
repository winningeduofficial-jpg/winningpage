#!/usr/bin/env python3
# =====================================================================
# 입결 마스터 xlsx(2개년 17열) → admission_results 적재용 CSV 빌더.
#
# 배경:
#  상류 빌더(build_ipgyeol.py)가 원본 5종을 합쳐 만든
#  `입결_마스터_2개년.xlsx`(43,170행 × 17열)를 DB long 포맷으로
#  옮긴다. 상류 빌더 코드는 재사용하지 않는다 — 전형유형 분류·보정
#  6종·머지는 이미 xlsx에 반영돼 있어 재실행하면 이중 적용이 되고,
#  키 생성 로직(norm_major_loose / search_key)은 `학과|학부|전공`
#  어간을 잘라 서로 다른 모집단위를 병합해버려 채택할 수 없다.
#  재사용한 것은 개념 2개뿐이다 — (a) 대학명 캠퍼스 접미 보존,
#  (b) 소수 2자리 반올림. (명세 §7.4)
#
#  실행 환경에 openpyxl / pandas 가 없으므로 표준 라이브러리
#  zipfile + xml.etree 로 직접 xlsx 를 푼다. xlsx 는 빈 셀에 대해
#  `<c>` 엘리먼트 자체를 내보내지 않으므로, 위치가 아니라 셀 참조
#  (`r="F123"`)의 열문자로 컬럼을 확정해야 한다.
#
#  CSV 를 뱉기 전에 품질 게이트(명세 §7.5)를 돌린다. BLOCK 13종은
#  하나라도 어긋나면 CSV 를 만들지 않고 비영점 코드로 죽는다 —
#  43k행을 잘못 적재하면 되돌리는 비용이 검사 비용보다 훨씬 크다.
#  WARN 11종은 기대 건수와 대조만 하고 적재를 막지 않는다.
#
# 사용:
#   python3 scripts/build-admission-results-csv.py \
#       --src ~/Downloads/입결_마스터_2개년.xlsx \
#       --out admission_results_2yr.csv
#   python3 scripts/build-admission-results-csv.py --dry-run   # 게이트만
#
# 산출 CSV 는 명세 §6.5 의 `\copy` 컬럼 목록과 순서가 정확히 같다.
# recruitment_period 는 만들지 않는다 (§10.1 Q1 — 컬럼 자체가 삭제됨).
# =====================================================================

import argparse
import csv
import os
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

DEFAULT_SRC = os.path.expanduser('~/Downloads/입결_마스터_2개년.xlsx')
DEFAULT_OUT = 'admission_results_2yr.csv'
SOURCE_SHEET = '입결_마스터_2개년.xlsx#Sheet1'

# xlsx 17열 → 내부 필드명. 순서 고정(A~Q).
COLUMNS = [
    ('A', '학년도', 'result_year'),
    ('B', '대학', 'university_raw'),
    ('C', '중심전형', 'main_track'),
    ('D', '전형유형', 'screening_category'),
    ('E', '전형명', 'admission_track'),
    ('F', '모집단위', 'department_raw'),
    ('G', '모집인원', 'quota'),
    ('H', '경쟁률', 'competition_rate'),
    ('I', '교과등급 50%컷', 'grade_50'),
    ('J', '교과등급 70%컷', 'grade_70'),
    ('K', '교과등급 85%컷', 'grade_85'),
    ('L', '교과등급 90%컷', 'grade_90'),
    ('M', '합격자 평균등급', 'grade_avg'),
    ('N', '합격자 최저등급', 'grade_min'),
    ('O', '합격자 평균등급(10과목)', 'grade_avg10'),
    ('P', '합격자 최저등급(10과목)', 'grade_min10'),
    ('Q', '최초합격자 평균등급', 'grade_first_avg'),
]

# 수치 11열 — "전부 결측" 판정(W8)과 반올림 대상.
NUMERIC_FIELDS = [
    'quota', 'competition_rate',
    'grade_50', 'grade_70', 'grade_85', 'grade_90',
    'grade_avg', 'grade_min', 'grade_avg10', 'grade_min10', 'grade_first_avg',
]
GRADE_FIELDS = [
    'grade_50', 'grade_70', 'grade_85', 'grade_90',
    'grade_avg', 'grade_min', 'grade_avg10', 'grade_min10', 'grade_first_avg',
]

# CSV 컬럼 순서 = 명세 §6.5 `\copy` 지정 컬럼 (23열).
CSV_FIELDS = [
    'result_year',
    'university_key', 'university_name', 'department_key', 'department_name',
    'main_track', 'screening_category', 'admission_track', 'variant_seq',
    'quota', 'competition_rate',
    'grade_50', 'grade_70', 'grade_85', 'grade_90',
    'grade_avg', 'grade_min', 'grade_avg10', 'grade_min10', 'grade_first_avg',
    'source_sheet', 'source_row', 'note',
]

# 중점 5종 통일 — 목표는 U+00B7(·). 나머지 4종을 치환한다.
# ‧ U+2027 / ・ U+30FB / ․ U+2024 / ∙ U+2219 (명세 §3.7 실측)
MIDDLE_DOT = '·'
MIDDLE_DOT_VARIANTS = {
    '‧': MIDDLE_DOT,
    '・': MIDDLE_DOT,
    '․': MIDDLE_DOT,
    '∙': MIDDLE_DOT,
}
# 실측 0건이지만 상류 교체 시 새로 섞일 수 있는 중점류 — 남아 있으면 경고만 낸다.
MIDDLE_DOT_UNEXPECTED = '•‧・․∙･·'.replace(MIDDLE_DOT, '')

NBSP = ' '

# 결측 표기 변형 — 명세 실측 0건이나 상류 교체 대비로 방어한다.
MISSING_TOKENS = {'-', '–', '—', '−', 'N/A', 'n/a', 'NA', '#N/A', ''}

# 도메인 (§6.4 CHECK 제약)
MAIN_TRACK_DOMAIN = {'교과', '종합', '논술', '실기', '기타'}
MAIN_TRACK_EXPECTED = {'교과', '종합', '논술', '실기'}
SCREENING_DOMAIN = {
    '일반', '추천형', '지역인재', '농어촌', '기회균형', '특성화고',
    '특수교육', '논술', '실기', '성인학습자', '재외국민', '기타',
}
SCREENING_EXPECTED_COUNT = 11

NOT_NULL_FIELDS = [
    'result_year', 'university_name', 'department_name',
    'admission_track', 'university_key', 'department_key',
]

NOTE_RATE_ZERO = '경쟁률 0 → 결측 승격'
NOTE_CUT_INVERSION = '50%컷 > 70%컷 (원문 유지)'


# ---------------------------------------------------------------------
# (1) xlsx 추출 (S1)
# ---------------------------------------------------------------------

def col_index(ref):
    """셀 참조('F123')의 열문자를 0-base 인덱스로. A→0, Q→16."""
    n = 0
    for ch in ref:
        if not ch.isalpha():
            break
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def read_shared_strings(zf):
    """sharedStrings.xml → 인덱스 배열. <si> 안의 <t> 를 전부 이어붙인다."""
    if 'xl/sharedStrings.xml' not in zf.namelist():
        return []
    out = []
    with zf.open('xl/sharedStrings.xml') as fp:
        for event, elem in ET.iterparse(fp, events=('end',)):
            if elem.tag == NS + 'si':
                out.append(''.join(t.text or '' for t in elem.iter(NS + 't')))
                elem.clear()
    return out


def read_rows(path):
    """xlsx 1번 시트를 (엑셀 행번호, [17칸 raw 값]) 로 흘려보낸다.

    빈 셀은 `<c>` 부재이므로 17칸 리스트를 미리 None 으로 채우고
    셀 참조 열문자로 꽂아 넣는다(위치 기반 파싱 금지).
    """
    with zipfile.ZipFile(path) as zf:
        shared = read_shared_strings(zf)
        with zf.open('xl/worksheets/sheet1.xml') as fp:
            for event, elem in ET.iterparse(fp, events=('end',)):
                if elem.tag != NS + 'row':
                    continue
                row_no = int(elem.get('r'))
                cells = [None] * len(COLUMNS)
                for c in elem.findall(NS + 'c'):
                    idx = col_index(c.get('r', ''))
                    if idx < 0 or idx >= len(cells):
                        continue
                    ctype = c.get('t')
                    if ctype == 's':
                        v = c.find(NS + 'v')
                        cells[idx] = shared[int(v.text)] if v is not None else None
                    elif ctype == 'inlineStr':
                        is_ = c.find(NS + 'is')
                        cells[idx] = ''.join(t.text or '' for t in is_.iter(NS + 't')) if is_ is not None else None
                    else:
                        # t 미지정 또는 t="n"/"str" — 숫자·수식결과 모두 <v> 원문.
                        v = c.find(NS + 'v')
                        cells[idx] = v.text if v is not None else None
                yield row_no, cells
                elem.clear()


# ---------------------------------------------------------------------
# (2) 정규화 (S2/S3) — 명세 §7.2
# ---------------------------------------------------------------------

def norm_text(s):
    """공통 문자열 정규화: NFC + NBSP→space. 결측 표기는 None 으로."""
    if s is None:
        return None
    s = unicodedata.normalize('NFC', s).replace(NBSP, ' ')
    if s.strip() in MISSING_TOKENS:
        return None
    return s


def unify_middle_dot(s):
    """중점 5종을 U+00B7 하나로 통일."""
    if s is None:
        return None
    for src, dst in MIDDLE_DOT_VARIANTS.items():
        s = s.replace(src, dst)
    return s


def norm_department_name(s):
    """모집단위 표시명: NFC + NBSP→space + 중점 통일 + `&` 주변 공백 제거."""
    s = unify_middle_dot(norm_text(s))
    if s is None:
        return None
    return re.sub(r'\s*&\s*', '&', s)


def strip_all_space(s):
    """키 생성용 — 모든 공백 제거. 괄호는 캠퍼스·트랙 의미라 유지한다."""
    return re.sub(r'\s+', '', s) if s is not None else None


def parse_number(raw):
    if raw is None:
        return None
    raw = raw.strip()
    if raw in MISSING_TOKENS:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def parse_int(raw):
    v = parse_number(raw)
    return int(round(v)) if v is not None else None


# ---------------------------------------------------------------------
# (3) 행 조립
# ---------------------------------------------------------------------

def build_records(src):
    """xlsx → 정규화된 dict 리스트. 표시명 대표값·variant_seq 는 이후 단계."""
    rows = []
    header = None
    raw_stats = {
        'missing_token_hits': 0,
        'rounded': 0,        # float 파싱 후에도 실제로 값이 바뀐 건수
        'decimal3_text': 0,  # 셀 원문 기준 소수 3자리 이상 (§3.6 기대 1,935)
        'unexpected_dot': Counter(),
    }

    for row_no, cells in read_rows(src):
        if header is None:
            header = [norm_text(c) for c in cells]
            continue
        if all(c is None for c in cells):
            continue

        rec = {'source_row': row_no, 'source_sheet': SOURCE_SHEET}
        vals = dict(zip([f for _, _, f in COLUMNS], cells))

        rec['result_year'] = parse_int(vals['result_year'])
        rec['university_name'] = norm_text(vals['university_raw'])
        rec['main_track'] = norm_text(vals['main_track'])            # 원문 유지 (Q8)
        rec['screening_category'] = norm_text(vals['screening_category'])
        rec['admission_track'] = unify_middle_dot(norm_text(vals['admission_track']))
        rec['department_name'] = norm_department_name(vals['department_raw'])

        # 결측 표기 변형이 실제로 잡혔는지 카운트(실측 0건 기대).
        for field, raw in (
            ('university_name', vals['university_raw']),
            ('admission_track', vals['admission_track']),
            ('department_name', vals['department_raw']),
        ):
            if raw is not None and rec[field] is None:
                raw_stats['missing_token_hits'] += 1

        for name in (rec['department_name'], rec['admission_track']):
            if name:
                for ch in name:
                    if ch in MIDDLE_DOT_UNEXPECTED:
                        raw_stats['unexpected_dot'][ch] += 1

        # 키 생성 (S4, §7.3) — 대학은 공백만 제거(괄호=캠퍼스 보존),
        # 모집단위는 표시명 정규화 결과에서 공백만 더 제거(어간 제거 금지).
        rec['university_key'] = strip_all_space(rec['university_name'])
        rec['department_key'] = strip_all_space(rec['department_name'])

        rec['quota'] = parse_int(vals['quota'])
        raw_numeric = {'quota': rec['quota']}
        for field in NUMERIC_FIELDS:
            if field == 'quota':
                continue
            v = parse_number(vals[field])
            raw_numeric[field] = v
            if v is not None:
                text = (vals[field] or '').strip()
                if '.' in text and len(text.split('.', 1)[1]) >= 3:
                    raw_stats['decimal3_text'] += 1
                r = round(v, 2)
                if r != v:
                    raw_stats['rounded'] += 1
                v = r
            rec[field] = v

        # WARN 기준선(§7.5 W1·W2·W6·W8·W9·W11)은 전부 "정규화·결측승격 이전
        # 원문" 기준으로 산출된 수치다. 상류 xlsx 교체를 감시하는 게 목적이므로
        # 우리 가공 결과가 아니라 원문을 그대로 재측정해야 대조가 성립한다.
        rec['raw'] = {
            'university': vals['university_raw'],
            'department': vals['department_raw'],
            'competition_rate': raw_numeric['competition_rate'],
            'grade_50': raw_numeric['grade_50'],
            'grade_70': raw_numeric['grade_70'],
            'all_numeric_null': all(raw_numeric[f] is None for f in NUMERIC_FIELDS),
            'five_key': (
                vals['university_raw'], vals['main_track'],
                vals['screening_category'], vals['admission_track'],
                vals['department_raw'],
            ),
        }

        rec['subject_reflection'] = None   # xlsx 에 열 없음. 유일성 키 coalesce 용.
        rec['notes'] = []
        rows.append(rec)

    return rows, header, raw_stats


def apply_value_rules(rows):
    """Q2(경쟁률 0 → 결측 승격) + W1(50>70 플래그). 값 변경은 전자뿐.

    역전 판정은 반올림 전 원문으로 한다 — 반올림하면 3자리 차이로만 갈리던
    5건이 동률로 접혀 601 → 600 이 되고, 기준선 대조가 깨진다.
    """
    stats = {
        'rate_zero': 0,
        'cut_inversion': 0, 'cut_equal': 0,             # 원문 기준(W1/W2)
        'cut_inversion_out': 0, 'cut_equal_out': 0,     # 적재값(반올림 후) 기준
    }
    for rec in rows:
        if rec['competition_rate'] == 0:
            rec['competition_rate'] = None
            rec['notes'].append(NOTE_RATE_ZERO)
            stats['rate_zero'] += 1

        g50, g70 = rec['raw']['grade_50'], rec['raw']['grade_70']
        if g50 is not None and g70 is not None:
            if g50 > g70:
                # 상류 빌더의 merge 순서 문제로 추정 — 임의 스왑 금지(§7.4).
                rec['notes'].append(NOTE_CUT_INVERSION)
                stats['cut_inversion'] += 1
            elif g50 == g70:
                stats['cut_equal'] += 1

        o50, o70 = rec['grade_50'], rec['grade_70']
        if o50 is not None and o70 is not None:
            if o50 > o70:
                stats['cut_inversion_out'] += 1
            elif o50 == o70:
                stats['cut_equal_out'] += 1
    return stats


def resolve_display_names(rows):
    """표시명 대표값 결정 (§7.2).

    (대학키, 모집단위키) 그룹 안에서 표시명이 갈리면 화면 콤보 라벨과
    상세 제목이 어긋난다. 그룹 내 최빈값, 동률이면 유니코드 오름차순
    첫 값 — 입력 순서에 의존하지 않는 결정적 규칙이다. 원문은
    source_row 로 추적 가능하므로 무손실이다.
    """
    dept_variants = defaultdict(Counter)
    univ_variants = defaultdict(Counter)
    dept_raw_variants = defaultdict(set)
    for rec in rows:
        dept_variants[(rec['university_key'], rec['department_key'])][rec['department_name']] += 1
        univ_variants[rec['university_key']][rec['university_name']] += 1
        dept_raw_variants[(rec['university_key'], rec['department_key'])].add(rec['raw']['department'])

    def pick(counter):
        return sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]

    dept_pick = {k: pick(c) for k, c in dept_variants.items()}
    univ_pick = {k: pick(c) for k, c in univ_variants.items()}

    for rec in rows:
        rec['department_name'] = dept_pick[(rec['university_key'], rec['department_key'])]
        rec['university_name'] = univ_pick[rec['university_key']]

    return {
        # W9 기준선(60)은 원문 표시명 기준이다 — 중점 5종 변형(건국대
        # `기계·로봇…` vs `기계・로봇…`)까지 세야 60이 나온다. 정규화 후
        # 잔존 갈림은 아래 dept_merge_groups_norm 으로 따로 본다.
        'dept_merge_groups': sum(1 for s in dept_raw_variants.values() if len(s) > 1),
        'dept_merge_groups_norm': sum(1 for c in dept_variants.values() if len(c) > 1),
        'univ_conflicts': sum(1 for c in univ_variants.values() if len(c) > 1),
        'dept_name_raw_distinct': len({n for s in dept_raw_variants.values() for n in s}),
        'dept_name_distinct': len({r for c in dept_variants.values() for r in c}),
        'dept_key_distinct': len({k for _, k in dept_variants}),
    }


def natural_key(rec):
    """DB 유일성 인덱스와 동일한 자연키(variant_seq 제외)."""
    return (
        rec['result_year'],
        rec['university_key'],
        rec['department_key'],
        rec['main_track'] or '',
        rec['screening_category'] or '',
        rec['admission_track'],
        rec['subject_reflection'] or '',
    )


def assign_variant_seq(rows):
    """자연키 그룹 내 결정적 순번 부여 (S5).

    정렬은 (quota desc, competition_rate desc, source_row asc).
    결측은 마지막으로 밀기 위해 -1 을 센티널로 쓴다(quota min 1, rate min 0).
    """
    groups = defaultdict(list)
    for rec in rows:
        groups[natural_key(rec)].append(rec)

    dup_groups = 0
    excess_rows = 0
    for key, members in groups.items():
        if len(members) == 1:
            members[0]['variant_seq'] = 0
            continue
        dup_groups += 1
        excess_rows += len(members) - 1
        members.sort(key=lambda r: (
            -(r['quota'] if r['quota'] is not None else -1),
            -(r['competition_rate'] if r['competition_rate'] is not None else -1),
            r['source_row'],
        ))
        for i, rec in enumerate(members):
            rec['variant_seq'] = i

    return {'dup_groups': dup_groups, 'excess_rows': excess_rows}


# ---------------------------------------------------------------------
# (4) 품질 게이트 (S6) — 명세 §7.5
# ---------------------------------------------------------------------

class GateReport:
    def __init__(self):
        self.blocks = []   # (id, 설명, 기대, 실측, pass)
        self.warns = []

    def block(self, gid, desc, expected, actual, ok=None):
        ok = (expected == actual) if ok is None else ok
        self.blocks.append((gid, desc, expected, actual, ok))

    def warn(self, wid, desc, expected, actual):
        self.warns.append((wid, desc, expected, actual, expected == actual))

    @property
    def failed_blocks(self):
        return [b for b in self.blocks if not b[4]]

    @property
    def drifted_warns(self):
        return [w for w in self.warns if not w[4]]

    def render(self):
        lines = []
        lines.append('')
        lines.append('=== BLOCK 게이트 (실패 시 CSV 미생성) ===')
        lines.append('{:<5} {:<44} {:>14} {:>14}  {}'.format('ID', '항목', '기대', '실측', '판정'))
        for gid, desc, exp, act, ok in self.blocks:
            lines.append('{:<5} {:<44} {:>14} {:>14}  {}'.format(
                gid, desc, str(exp), str(act), 'PASS' if ok else 'FAIL'))
        lines.append('')
        lines.append('=== WARN 게이트 (기대치 대조만, 적재 진행) ===')
        lines.append('{:<5} {:<44} {:>14} {:>14}  {}'.format('ID', '항목', '기대', '실측', '판정'))
        for wid, desc, exp, act, ok in self.warns:
            lines.append('{:<5} {:<44} {:>14} {:>14}  {}'.format(
                wid, desc, str(exp), str(act), 'OK' if ok else 'DRIFT'))
        return '\n'.join(lines)


def decimals_over_2(v):
    if v is None:
        return False
    return round(v, 2) != v


def run_gates(rows, dup_stats, name_stats, value_stats):
    rep = GateReport()
    total = len(rows)
    years = Counter(r['result_year'] for r in rows)

    # --- BLOCK ---
    rep.block('G1', '총 행수', 43170, total)
    rep.block('G2', '연도 분포 2025 / 2026', '19148/24022',
              '{}/{}'.format(years.get(2025, 0), years.get(2026, 0)))
    rep.block('G3', '연도 도메인', '{2025, 2026}',
              '{' + ', '.join(str(y) for y in sorted(years)) + '}',
              ok=set(years) == {2025, 2026})

    seen = Counter(natural_key(r) + (r['variant_seq'],) for r in rows)
    rep.block('G4', '자연키 유일성(variant_seq 포함) 중복', 0,
              sum(c - 1 for c in seen.values() if c > 1))
    rep.block('G5', '자연키 중복 그룹 / 초과 행', '28/29',
              '{}/{}'.format(dup_stats['dup_groups'], dup_stats['excess_rows']))

    missing_nn = sum(
        1 for r in rows
        if any(r.get(f) in (None, '') for f in NOT_NULL_FIELDS)
    )
    rep.block('G6', 'NOT NULL 6열 결측', 0, missing_nn)

    mt = {r['main_track'] for r in rows if r['main_track'] is not None}
    rep.block('G7', 'main_track 도메인', '⊆ CHECK 5종', ','.join(sorted(mt)),
              ok=mt <= MAIN_TRACK_DOMAIN and mt == MAIN_TRACK_EXPECTED)
    sc = {r['screening_category'] for r in rows if r['screening_category'] is not None}
    rep.block('G8', 'screening_category 도메인(11종)', SCREENING_EXPECTED_COUNT, len(sc),
              ok=sc <= SCREENING_DOMAIN and len(sc) == SCREENING_EXPECTED_COUNT)
    # G9 는 recruitment_period 폐기로 결번 (§7.5).

    over = sum(
        1 for r in rows for f in NUMERIC_FIELDS
        if f != 'quota' and decimals_over_2(r[f])
    )
    rep.block('G10', '수치 소수점 3자리 이상', 0, over)

    bad_grade = [
        (r['source_row'], f, r[f]) for r in rows for f in GRADE_FIELDS
        if r[f] is not None and not (1.0 <= r[f] <= 9.0)
    ]
    rep.block('G11', 'grade_* 범위 [1.00, 9.00] 이탈', 0, len(bad_grade))

    bad_quota = [
        (r['source_row'], r['quota']) for r in rows
        if r['quota'] is not None and not (1 <= r['quota'] <= 614)
    ]
    rep.block('G12', 'quota 범위 [1, 614] 이탈', 0, len(bad_quota))

    bad_rate = [
        (r['source_row'], r['competition_rate']) for r in rows
        if r['competition_rate'] is not None and not (0 <= r['competition_rate'] <= 382.2)
    ]
    rep.block('G13', 'competition_rate 범위 [0, 382.2] 이탈', 0, len(bad_rate))

    # --- WARN ---
    # 기준선은 원문(raw) 기준. 우리 가공 결과와 갈리는 항목은 secondary 로 병기한다.
    rep.warn('W1', 'grade_50 > grade_70 (원문)', 601, value_stats['cut_inversion'])
    rep.warn('W2', 'grade_50 = grade_70 (원문)', 6565, value_stats['cut_equal'])
    rep.warn('W3', '경쟁률 0 → 결측 승격', 141, value_stats['rate_zero'])
    rep.warn('W4', '0 < 경쟁률 < 1 (미달)', 515,
             sum(1 for r in rows if r['competition_rate'] is not None
                 and 0 < r['competition_rate'] < 1))
    rep.warn('W5', 'quota 결측', 451, sum(1 for r in rows if r['quota'] is None))
    rep.warn('W6', 'competition_rate 결측 (원문)', 2069,
             sum(1 for r in rows if r['raw']['competition_rate'] is None))
    rep.warn('W7', 'grade_50 & grade_70 동시 결측', 10885,
             sum(1 for r in rows if r['grade_50'] is None and r['grade_70'] is None))
    rep.warn('W8', '수치 11열 전부 결측 (원문)', 1,
             sum(1 for r in rows if r['raw']['all_numeric_null']))
    rep.warn('W9', '모집단위 표시명 병합 그룹 (원문)', 60, name_stats['dept_merge_groups'])
    rep.warn('W10', '대학키 충돌', 0, name_stats['univ_conflicts'])

    y25 = {r['raw']['five_key'] for r in rows if r['result_year'] == 2025}
    y26 = {r['raw']['five_key'] for r in rows if r['result_year'] == 2026}
    rep.warn('W11', '2개년 매칭 5-key 교집합 (원문)', 14229, len(y25 & y26))

    # 적재값 기준 참고치 — 기준선 대조 대상이 아니라 실제 DB 에 들어갈 모습이다.
    k25 = {five_key(r) for r in rows if r['result_year'] == 2025}
    k26 = {five_key(r) for r in rows if r['result_year'] == 2026}
    secondary = [
        ('W1', '적재값 기준 역전', value_stats['cut_inversion_out']),
        ('W2', '적재값 기준 동률', value_stats['cut_equal_out']),
        ('W6', '결측 승격 후 competition_rate 결측',
         sum(1 for r in rows if r['competition_rate'] is None)),
        ('W8', '결측 승격 후 수치 전부 결측',
         sum(1 for r in rows if all(r[f] is None for f in NUMERIC_FIELDS))),
        ('W9', '정규화 후 잔존 표시명 갈림 그룹', name_stats['dept_merge_groups_norm']),
        ('W11', '정규화 키 기준 교집합', len(k25 & k26)),
    ]

    details = {
        'bad_grade': bad_grade[:20],
        'bad_quota': bad_quota[:20],
        'bad_rate': bad_rate[:20],
    }
    return rep, details, secondary


def five_key(rec):
    """§3.5 매칭 키 — 대학·중심전형·전형유형·전형명·모집단위(정규화 키 기준)."""
    return (
        rec['university_key'],
        rec['main_track'] or '',
        rec['screening_category'] or '',
        rec['admission_track'],
        rec['department_key'],
    )


# ---------------------------------------------------------------------
# (5) CSV emit (S7)
# ---------------------------------------------------------------------

def fmt(field, value):
    if value is None:
        return ''
    if field in ('result_year', 'quota', 'source_row', 'variant_seq'):
        return str(int(value))
    if isinstance(value, float):
        return '{:.2f}'.format(value)
    return value


def write_csv(rows, out_path):
    # UTF-8 BOM 없음 / newline='' — psql \copy 와 Supabase CSV Import 양립.
    with open(out_path, 'w', encoding='utf-8', newline='') as fp:
        w = csv.writer(fp, lineterminator='\n')
        w.writerow(CSV_FIELDS)
        for rec in rows:
            rec['note'] = '; '.join(rec['notes']) if rec['notes'] else None
            w.writerow([fmt(f, rec.get(f)) for f in CSV_FIELDS])


# ---------------------------------------------------------------------
# main
# ---------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(
        description='입결 마스터 xlsx → admission_results 적재용 CSV (품질 게이트 포함)')
    ap.add_argument('--src', default=DEFAULT_SRC, help='입력 xlsx 경로')
    ap.add_argument('--out', default=DEFAULT_OUT, help='출력 CSV 경로')
    ap.add_argument('--dry-run', action='store_true',
                    help='게이트만 실행하고 CSV 를 만들지 않는다')
    ap.add_argument('--strict-warn', action='store_true',
                    help='WARN 기대치 이탈도 실패로 취급한다')
    args = ap.parse_args(argv)

    if not os.path.exists(args.src):
        print('입력 파일 없음: {}'.format(args.src), file=sys.stderr)
        return 2

    rows, header, raw_stats = build_records(args.src)

    # 헤더 형상 확인 — 17열이 아니면 상류 xlsx 가 바뀐 것이라 전 게이트 기대값이 무효.
    expected_header = [h for _, h, _ in COLUMNS]
    if header != expected_header:
        print('헤더 불일치 — 상류 xlsx 스키마가 바뀌었다. 게이트 기대값 재산출 필요.',
              file=sys.stderr)
        print('  기대: {}'.format(expected_header), file=sys.stderr)
        print('  실측: {}'.format(header), file=sys.stderr)
        return 2

    value_stats = apply_value_rules(rows)
    name_stats = resolve_display_names(rows)
    dup_stats = assign_variant_seq(rows)
    rep, details, secondary = run_gates(rows, dup_stats, name_stats, value_stats)

    print('입력: {}'.format(args.src))
    print('행수: {} / 소수3자리↑ 원문: {} (그중 float 파싱 후에도 반올림 필요: {}) / 결측표기 치환: {}'.format(
        len(rows), raw_stats['decimal3_text'], raw_stats['rounded'],
        raw_stats['missing_token_hits']))
    if raw_stats['unexpected_dot']:
        print('⚠ 미정의 중점류 잔존: {}'.format(dict(raw_stats['unexpected_dot'])))
    print('모집단위 표시명 distinct 원문 {} → 정규화 {} → 키 {}'.format(
        name_stats['dept_name_raw_distinct'], name_stats['dept_name_distinct'],
        name_stats['dept_key_distinct']))
    print(rep.render())

    print('')
    print('=== 적재값 기준 참고치 (기준선 대조 대상 아님) ===')
    for wid, desc, val in secondary:
        print('{:<5} {:<44} {:>14}'.format(wid, desc, val))

    for label, items in details.items():
        if items:
            print('\n[{}] 표본(최대 20):'.format(label))
            for it in items:
                print('  ', it)

    failed = rep.failed_blocks
    drifted = rep.drifted_warns

    if failed:
        print('\n✗ BLOCK 게이트 {}건 실패 — CSV 를 만들지 않는다.'.format(len(failed)),
              file=sys.stderr)
        for gid, desc, exp, act, _ in failed:
            print('  {} {}: 기대 {} / 실측 {}'.format(gid, desc, exp, act), file=sys.stderr)
        return 1

    if drifted:
        print('\n⚠ WARN 기대치 이탈 {}건 (적재는 진행 가능):'.format(len(drifted)))
        for wid, desc, exp, act, _ in drifted:
            print('  {} {}: 기대 {} / 실측 {}'.format(wid, desc, exp, act))
        if args.strict_warn:
            return 1

    if args.dry_run:
        print('\n--dry-run: 게이트 통과. CSV 미생성.')
        return 0

    write_csv(rows, args.out)
    print('\n✓ CSV 생성: {} ({}행 + 헤더)'.format(args.out, len(rows)))
    print('  적재는 명세 §6.5 스테이징 경유 — 본 테이블 직접 임포트 금지.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
