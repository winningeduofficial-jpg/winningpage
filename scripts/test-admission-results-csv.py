#!/usr/bin/env python3
# =====================================================================
# build-admission-results-csv.py 회귀 테스트.
#
# 배경:
#  로더의 게이트(§7.5)는 43k행 실물 xlsx 를 상대로 "상류가 바뀌었는가"를
#  감시하는 장치라서, 정규화·키 생성·대표값 선택 같은 개별 규칙이
#  실제로 그 규칙대로 도는지는 증명하지 못한다. 총합이 맞아도 규칙이
#  틀릴 수 있다. 그래서 이 테스트는 실물 43k xlsx 를 쓰지 않고
#  손으로 만든 최소 픽스처(행 2~6개)로 규칙 하나하나를 직접 찌른다.
#
#  픽스처는 임시 디렉터리에 진짜 xlsx(zip)로 굽는다. 로더가 zip 안에서
#  실제로 읽는 엔트리는 `xl/sharedStrings.xml` 과
#  `xl/worksheets/sheet1.xml` 둘뿐이라 그 둘만 넣는다. 빈 셀은 `<c>`
#  엘리먼트 자체를 생략해서, 로더가 위치가 아니라 셀 참조(`r="F3"`)로
#  컬럼을 잡는지까지 같이 검증한다.
#
#  BLOCK 게이트 기대값(총 43,170행 / 연도 19,148·24,022 / 중복 28·29)은
#  실물 전량 기준이라 최소 픽스처로는 무조건 실패한다. 따라서
#  CSV 산출 검증은 main() 대신 파이프라인 함수를 main() 과 같은 순서로
#  직접 호출해서 하고, 게이트 검증은 `run_gates` 가 돌려준 리포트에서
#  게이트 ID 를 찍어 개별 판정을 본다. main() 전 구간은 "BLOCK 실패 시
#  CSV 미생성 + 비영점 종료" 한 가지만 확인한다.
#
# 사용:
#   python3 scripts/test-admission-results-csv.py
#   python3 scripts/test-admission-results-csv.py --keep   # 픽스처 보존
#
# 종료코드: 0 전건 통과 / 1 실패 있음.
# =====================================================================

import sys

# 로더를 모듈로 끌어다 쓰지만 scripts/ 에 __pycache__ 를 남기지 않는다.
sys.dont_write_bytecode = True

import argparse
import csv
import importlib.util
import itertools
import os
import shutil
import tempfile
import zipfile
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
LOADER_PATH = os.path.join(HERE, 'build-admission-results-csv.py')

NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

# 명세 §6.5 `\copy` 컬럼 목록(23열). 로더에서 import 하지 않고 **여기에
# 다시 적는다** — 로더 상수를 그대로 가져오면 "로더가 자기 자신과 같다"는
# 동어반복이 되어 Q1(recruitment_period 삭제) 검증이 무의미해진다.
EXPECTED_CSV_HEADER = [
    'result_year',
    'university_key', 'university_name', 'department_key', 'department_name',
    'main_track', 'screening_category', 'admission_track', 'variant_seq',
    'quota', 'competition_rate',
    'grade_50', 'grade_70', 'grade_85', 'grade_90',
    'grade_avg', 'grade_min', 'grade_avg10', 'grade_min10', 'grade_first_avg',
    'source_sheet', 'source_row', 'note',
]


def load_loader():
    spec = importlib.util.spec_from_file_location('build_admission_results_csv', LOADER_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


L = load_loader()

HEADER_ROW = [h for _, h, _ in L.COLUMNS]
FIELDS = [f for _, _, f in L.COLUMNS]

# 로더 기본 행 — 테스트마다 필요한 칸만 kwargs 로 덮는다.
BASE = {
    'result_year': 2026,
    'university_raw': '가나대',
    'main_track': '교과',
    'screening_category': '일반',
    'admission_track': '학생부교과(일반)',
    'department_raw': '컴퓨터공학과',
    'quota': 10,
    'competition_rate': 5.0,
    'grade_50': 3.0,
    'grade_70': 3.5,
    'grade_85': None,
    'grade_90': None,
    'grade_avg': None,
    'grade_min': None,
    'grade_avg10': None,
    'grade_min10': None,
    'grade_first_avg': None,
}


# ---------------------------------------------------------------------
# 픽스처 xlsx 굽기
# ---------------------------------------------------------------------

class RawNum:
    """`<v>` 원문을 그대로 박는다 — 부동소수 오염(9.199999999999999) 재현용."""

    def __init__(self, text):
        self.text = text


class InlineStr:
    """`t="inlineStr"` 경로 — sharedStrings 를 안 거치는 셀도 읽히는지 확인용."""

    def __init__(self, text):
        self.text = text


def col_letter(idx):
    s = ''
    idx += 1
    while idx:
        idx, r = divmod(idx - 1, 26)
        s = chr(65 + r) + s
    return s


def row_values(**kw):
    """BASE 위에 kw 를 덮어 17칸 리스트로 만든다."""
    unknown = set(kw) - set(BASE)
    if unknown:
        raise KeyError('알 수 없는 필드: {}'.format(sorted(unknown)))
    vals = dict(BASE)
    vals.update(kw)
    return [vals[f] for f in FIELDS]


def make_xlsx(path, data_rows, header=None):
    """헤더 1행 + data_rows 를 담은 최소 xlsx 를 굽는다.

    None 칸은 `<c>` 를 아예 내보내지 않는다(실물 xlsx 와 동일).
    """
    header = HEADER_ROW if header is None else header
    rows = [list(header)] + [list(r) for r in data_rows]

    sst = []
    sst_idx = {}
    body = []
    for r_no, values in enumerate(rows, start=1):
        cells = []
        for c_i, v in enumerate(values):
            if v is None:
                continue
            ref = '{}{}'.format(col_letter(c_i), r_no)
            if isinstance(v, InlineStr):
                cells.append('<c r="{}" t="inlineStr"><is><t>{}</t></is></c>'.format(
                    ref, escape(v.text)))
            elif isinstance(v, RawNum):
                cells.append('<c r="{}"><v>{}</v></c>'.format(ref, escape(v.text)))
            elif isinstance(v, str):
                if v not in sst_idx:
                    sst_idx[v] = len(sst)
                    sst.append(v)
                cells.append('<c r="{}" t="s"><v>{}</v></c>'.format(ref, sst_idx[v]))
            elif isinstance(v, bool):
                raise TypeError('bool 셀은 쓰지 않는다')
            else:
                text = str(v) if isinstance(v, int) else repr(float(v))
                cells.append('<c r="{}"><v>{}</v></c>'.format(ref, text))
        body.append('<row r="{}">{}</row>'.format(r_no, ''.join(cells)))

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="{ns}"><sheetData>{body}</sheetData></worksheet>'
    ).format(ns=NS_MAIN, body=''.join(body))
    sst_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<sst xmlns="{ns}" count="{n}" uniqueCount="{n}">{items}</sst>'
    ).format(ns=NS_MAIN, n=len(sst),
             items=''.join('<si><t>{}</t></si>'.format(escape(s)) for s in sst))

    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('xl/sharedStrings.xml', sst_xml)
        zf.writestr('xl/worksheets/sheet1.xml', sheet_xml)
    return path


# ---------------------------------------------------------------------
# 파이프라인 헬퍼
# ---------------------------------------------------------------------

TMPDIR = None
_seq = itertools.count()


def fixture(data_rows, header=None, name=None):
    path = os.path.join(TMPDIR, name or 'fx-{}.xlsx'.format(next(_seq)))
    return make_xlsx(path, data_rows, header=header)


def pipeline(data_rows, header=None):
    """main() 과 동일한 호출 순서로 S1~S5 를 돈다(게이트·CSV emit 제외).

    순서가 중요하다 — 경쟁률 0 결측 승격이 variant_seq 정렬(rate desc)보다
    먼저 일어나야 실제 적재와 같은 결과가 나온다.
    """
    path = fixture(data_rows, header=header)
    rows, hdr, raw_stats = L.build_records(path)
    value_stats = L.apply_value_rules(rows)
    name_stats = L.resolve_display_names(rows)
    dup_stats = L.assign_variant_seq(rows)
    return {
        'path': path, 'rows': rows, 'header': hdr, 'raw_stats': raw_stats,
        'value_stats': value_stats, 'name_stats': name_stats, 'dup_stats': dup_stats,
    }


def emit_csv(state):
    """CSV 를 굽고 (헤더, dict 행 리스트) 로 되읽는다."""
    out = os.path.join(TMPDIR, 'out-{}.csv'.format(next(_seq)))
    L.write_csv(state['rows'], out)
    with open(out, encoding='utf-8', newline='') as fp:
        reader = csv.reader(fp)
        header = next(reader)
        body = [dict(zip(header, r)) for r in reader]
    with open(out, 'rb') as fp:
        blob = fp.read()
    return header, body, blob, out


def gate_map(state):
    rep, _details, _secondary = L.run_gates(
        state['rows'], state['dup_stats'], state['name_stats'], state['value_stats'])
    blocks = {gid: (exp, act, ok) for gid, _d, exp, act, ok in rep.blocks}
    warns = {wid: (exp, act, ok) for wid, _d, exp, act, ok in rep.warns}
    return blocks, warns


# ---------------------------------------------------------------------
# 단언 헬퍼
# ---------------------------------------------------------------------

def eq(actual, expected, label):
    if actual != expected:
        raise AssertionError('{} — 기대 {!r} / 실측 {!r}'.format(label, expected, actual))


def truthy(cond, label):
    if not cond:
        raise AssertionError(label)


def gate_fail(blocks, gid, label):
    truthy(gid in blocks, '{}: {} 게이트가 리포트에 없다'.format(label, gid))
    truthy(not blocks[gid][2],
           '{}: {} 가 통과해버렸다 (실측 {!r})'.format(label, gid, blocks[gid][1]))


def gate_pass(blocks, gid, label):
    truthy(gid in blocks, '{}: {} 게이트가 리포트에 없다'.format(label, gid))
    truthy(blocks[gid][2],
           '{}: {} 가 실패했다 (기대 {!r} / 실측 {!r})'.format(
               label, gid, blocks[gid][0], blocks[gid][1]))


TESTS = []


def test(fn):
    TESTS.append(fn)
    return fn


# ---------------------------------------------------------------------
# 1. 정규화 (§7.2)
# ---------------------------------------------------------------------

@test
def t01_normalization():
    """NFC / NBSP / 중점 5종 / `&` 공백 / 결측 표기 / 2자리 반올림."""
    # 함수 단위 — 규칙 하나씩.
    eq(L.norm_text('가나대'), '가나대', 'NFC 결합')
    eq(L.norm_text('컴퓨터 공학과'), '컴퓨터 공학과', 'NBSP→space')
    eq(L.unify_middle_dot('가‧나・다․라∙마'), '가·나·다·라·마', '중점 4종→U+00B7')
    eq(L.norm_department_name('Fine Arts & Design학부'), 'Fine Arts&Design학부',
       '`&` 주변 공백 제거')
    eq(L.norm_department_name('Fine Arts&Design학부'), 'Fine Arts&Design학부',
       '`&` 공백 없는 원문은 그대로')
    for token in ('-', '–', '—', 'N/A', 'n/a', 'NA', '#N/A', '', '   '):
        eq(L.norm_text(token), None, '결측 표기 {!r} → None'.format(token))
    eq(L.norm_text('서울대학교'), '서울대학교', '정상 문자열은 무변경')

    # 행 단위 — 실제 xlsx 를 통과했을 때도 같은가.
    st = pipeline([
        row_values(university_raw='가나대',
                   department_raw='기계‧로봇 · 자동차 & AI학부',
                   admission_track='교과‧일반',
                   grade_50=RawNum('9.199999999999999'),
                   grade_70=RawNum('4.567'),
                   quota=RawNum('12'),
                   competition_rate=RawNum('3.14159')),
        row_values(department_raw='소프트웨어학과', admission_track='교과·특별',
                   quota=InlineStr('7'), competition_rate=None,
                   grade_50=None, grade_70=None),
    ])
    rows = st['rows']
    eq(len(rows), 2, '데이터 2행')
    eq(rows[0]['university_name'], '가나대', 'NFC 적용 대학명')
    eq(rows[0]['department_name'], '기계·로봇 · 자동차&AI학부',
       '중점 통일 + NBSP→space + `&` 공백 제거 (표시명 공백은 유지)')
    eq(rows[0]['admission_track'], '교과·일반', '전형명도 중점 통일')
    eq(rows[0]['grade_50'], 9.2, '9.199999999999999 → 9.2')
    eq(rows[0]['grade_70'], 4.57, '4.567 → 4.57 (round 2)')
    eq(rows[0]['competition_rate'], 3.14, '3.14159 → 3.14')
    eq(rows[0]['quota'], 12, 'quota 정수 파싱')
    eq(rows[1]['quota'], 7, 'inlineStr 셀도 읽는다')
    eq(rows[1]['competition_rate'], None, '빈 셀(<c> 부재) → None')

    # 소수 3자리 원문은 3건(9.199…/4.567/3.14159), 그중 float 파싱만으로
    # 이미 해소되는 9.2 를 빼면 실제로 값이 바뀐 건 2건.
    eq(st['raw_stats']['decimal3_text'], 3, '셀 원문 기준 소수 3자리↑')
    eq(st['raw_stats']['rounded'], 2, 'round() 가 실제로 값을 바꾼 건수')

    # 결측 표기 방어가 실제로 문자열 열에서 동작하는지.
    st2 = pipeline([row_values(department_raw='-', competition_rate=RawNum('N/A'))])
    eq(st2['rows'][0]['department_name'], None, '모집단위 `-` → 결측')
    eq(st2['rows'][0]['competition_rate'], None, '경쟁률 `N/A` → 결측')
    eq(st2['raw_stats']['missing_token_hits'], 1, '결측 표기 치환 카운트')

    # 미정의 중점류(•, ･)는 통일 대상이 아니라 경고만 — 상류 교체 감시용.
    st3 = pipeline([row_values(department_raw='가•나학과')])
    eq(st3['rows'][0]['department_name'], '가•나학과', 'U+2022 는 치환하지 않는다')
    eq(dict(st3['raw_stats']['unexpected_dot']), {'•': 1}, '미정의 중점류 경고')


# ---------------------------------------------------------------------
# 2. 키 생성 (§7.3)
# ---------------------------------------------------------------------

@test
def t02_key_generation():
    """한글 키·공백 제거·괄호(캠퍼스) 보존·어간 미제거·결정성."""
    st = pipeline([
        row_values(university_raw='경동대', department_raw='간호학과',
                   admission_track='A'),
        row_values(university_raw='경동대(제3캠퍼스)', department_raw='간호학과',
                   admission_track='B'),
        row_values(university_raw='서울 과학 기술대', department_raw='경영학과',
                   admission_track='C'),
        row_values(university_raw='서울 과학 기술대', department_raw='경영학부',
                   admission_track='D'),
        row_values(university_raw='건국대(글로컬)',
                   department_raw='기계・로봇 자동차공학부', admission_track='E'),
    ])
    by_track = {r['admission_track']: r for r in st['rows']}

    eq(by_track['A']['university_key'], '경동대', '대학키 = 한글 원문')
    eq(by_track['B']['university_key'], '경동대(제3캠퍼스)',
       '캠퍼스 괄호 보존 — 본교/분교 키가 갈려야 한다')
    truthy(by_track['A']['university_key'] != by_track['B']['university_key'],
           '경동대 vs 경동대(제3캠퍼스) 가 같은 키로 뭉개졌다')
    eq(by_track['C']['university_key'], '서울과학기술대', '대학키 공백 전량 제거')
    eq(by_track['E']['university_key'], '건국대(글로컬)', '괄호 캠퍼스 접미 유지')

    eq(by_track['C']['department_key'], '경영학과', '모집단위키')
    truthy(by_track['C']['department_key'] != by_track['D']['department_key'],
           '경영학과 vs 경영학부 가 병합됐다 — 어간 제거 금지 위반')
    eq(by_track['E']['department_key'], '기계·로봇자동차공학부',
       '중점 통일 후 공백만 제거 (중점 자체는 키에 남는다)')

    # 결정성 — 같은 원문을 몇 번 넣어도, 순서를 바꿔도 같은 키.
    again = pipeline([
        row_values(university_raw='건국대(글로컬)',
                   department_raw='기계・로봇 자동차공학부', admission_track='E'),
    ])
    eq(again['rows'][0]['department_key'], by_track['E']['department_key'],
       '동일 입력 재실행 시 키 동일')
    eq(again['rows'][0]['university_key'], by_track['E']['university_key'],
       '동일 입력 재실행 시 대학키 동일')

    # 대학키 충돌(W10)이 0 인지 — 표기 갈림이 있어도 키가 같으면 잡힌다.
    _blocks, warns = gate_map(st)
    eq(warns['W10'][1], 0, '대학키 충돌 없음')


# ---------------------------------------------------------------------
# 3. 표시명 대표값 (§7.2)
# ---------------------------------------------------------------------

@test
def t03_display_name_representative():
    """(대학키, 모집단위키) 그룹에서 표시명이 갈릴 때 결정적으로 1개."""
    # 세 표기가 전부 같은 키 '기계·로봇학부' 로 접힌다.
    #  - '기계·로봇학부'(U+00B7) / '기계・로봇학부'(U+30FB) → 정규화 후 동일 표시명 2표
    #  - '기계 · 로봇학부'(공백) → 정규화 후에도 다른 표시명 1표
    variants = [
        ('A', '기계·로봇학부'),
        ('B', '기계・로봇학부'),
        ('C', '기계 · 로봇학부'),
    ]
    for perm in itertools.permutations(variants):
        st = pipeline([row_values(admission_track=t, department_raw=d) for t, d in perm])
        names = {r['admission_track']: r['department_name'] for r in st['rows']}
        keys = {r['department_key'] for r in st['rows']}
        eq(keys, {'기계·로봇학부'}, '세 표기가 한 키로 접힌다')
        eq(set(names.values()), {'기계·로봇학부'},
           '최빈 표시명으로 통일 (입력순 {})'.format([t for t, _ in perm]))

    # 동률이면 유니코드 오름차순 첫 값 — 입력 순서와 무관.
    tie = [('A', 'Fine Arts학부'), ('B', 'FineArts학부')]
    for perm in itertools.permutations(tie):
        st = pipeline([row_values(admission_track=t, department_raw=d) for t, d in perm])
        picked = {r['department_name'] for r in st['rows']}
        eq(picked, {'Fine Arts학부'},
           '동률 대표값은 유니코드 오름차순 (입력순 {})'.format([t for t, _ in perm]))

    # 대학 표시명도 같은 규칙. 그리고 W9(원문 기준 병합 그룹) 계수 확인.
    st = pipeline([
        row_values(admission_track='A', department_raw='기계·로봇학부'),
        row_values(admission_track='B', department_raw='기계・로봇학부'),
    ])
    _blocks, warns = gate_map(st)
    eq(warns['W9'][1], 1, '원문 표시명이 갈린 그룹 1개 (W9 는 원문 기준)')
    eq(st['name_stats']['dept_merge_groups_norm'], 0,
       '정규화 후에는 갈림이 없다 — 중점 변형은 정규화로 흡수된다')
    eq(st['name_stats']['dept_name_raw_distinct'], 2, '원문 distinct 2')
    eq(st['name_stats']['dept_key_distinct'], 1, '키 distinct 1')


# ---------------------------------------------------------------------
# 4. Q2 — 경쟁률 0 → 결측 승격
# ---------------------------------------------------------------------

@test
def t04_q2_rate_zero():
    """경쟁률 0 → null 승격 + note. 값이 0으로 남아 있으면 미달과 구별이 안 된다."""
    st = pipeline([
        row_values(admission_track='Z', competition_rate=RawNum('0')),
        row_values(admission_track='N', competition_rate=0.5),
    ])
    header, body, _blob, _out = emit_csv(st)
    by_track = {r['admission_track']: r for r in body}

    eq(by_track['Z']['competition_rate'], '', '경쟁률 0 → null(빈 칸)')
    eq(by_track['Z']['note'], '경쟁률 0 → 결측 승격', 'note 문구')
    eq(st['value_stats']['rate_zero'], 1, '승격 카운트')
    eq(by_track['N']['competition_rate'], '0.50', '0 아닌 미달 경쟁률은 그대로')
    eq(by_track['N']['note'], '', '정상 행에는 note 없음')

    # W3/W4 계수도 같이 본다.
    _blocks, warns = gate_map(st)
    eq(warns['W3'][1], 1, 'W3 경쟁률 0')
    eq(warns['W4'][1], 1, 'W4 0 < 경쟁률 < 1')

    # 승격은 quota 유무와 무관하게 적용된다(§7.2 — quota 보유 123건 포함).
    st2 = pipeline([row_values(competition_rate=RawNum('0'), quota=RawNum('40'))])
    eq(st2['rows'][0]['competition_rate'], None, 'quota 가 있어도 승격')
    eq(st2['rows'][0]['quota'], 40, 'quota 는 건드리지 않는다')


# ---------------------------------------------------------------------
# 5. Q1 — recruitment_period 부재
# ---------------------------------------------------------------------

@test
def t05_q1_no_recruitment_period():
    """CSV 컬럼 23열 = §6.5 `\\copy` 목록. recruitment_period 는 어디에도 없다."""
    st = pipeline([row_values()])
    header, body, blob, _out = emit_csv(st)

    eq(header, EXPECTED_CSV_HEADER, 'CSV 헤더 = §6.5 `\\copy` 컬럼 23열')
    eq(len(header), 23, '컬럼 수 23')
    truthy('recruitment_period' not in header,
           'recruitment_period 가 CSV 헤더에 살아 있다 (Q1 위반)')
    truthy(b'recruitment_period' not in blob,
           'recruitment_period 문자열이 CSV 본문에 섞였다')
    truthy(not blob.startswith(b'\xef\xbb\xbf'), 'UTF-8 BOM 이 붙었다')
    truthy(b'\r\n' not in blob, '개행이 CRLF 다 — LF 여야 한다')

    row = body[0]
    eq(row['source_sheet'], '입결_마스터_2개년.xlsx#Sheet1', 'source_sheet 고정값')
    eq(row['source_row'], '2', 'source_row = 엑셀 행번호(헤더 다음은 2)')
    eq(row['grade_85'], '', '결측은 빈 문자열')
    eq(row['grade_50'], '3.00', '실수는 소수 2자리 고정폭')
    eq(row['variant_seq'], '0', '단독 행의 variant_seq')


# ---------------------------------------------------------------------
# 6. Q8 — main_track 원문 유지
# ---------------------------------------------------------------------

@test
def t06_q8_main_track_raw():
    """main_track 은 원문 `교과` 그대로 — `학생부교과` 로 늘려 적지 않는다."""
    st = pipeline([
        row_values(main_track='교과', admission_track='A'),
        row_values(main_track='종합', admission_track='B'),
        row_values(main_track='논술', screening_category='논술', admission_track='C'),
        row_values(main_track='실기', screening_category='실기', admission_track='D'),
    ])
    _header, body, _blob, _out = emit_csv(st)
    tracks = [r['main_track'] for r in body]

    truthy('교과' in tracks, 'main_track 에 `교과` 가 없다')
    truthy('학생부교과' not in tracks, '`학생부교과` 로 늘려 적었다 (Q8 위반)')
    eq(sorted(set(tracks)), sorted(['교과', '논술', '실기', '종합']), '4종 원문 그대로')

    blocks, _warns = gate_map(st)
    gate_pass(blocks, 'G7', 'main_track 도메인 4종이면 통과')


# ---------------------------------------------------------------------
# 7. variant_seq (S5)
# ---------------------------------------------------------------------

@test
def t07_variant_seq():
    """자연키 중복 행에 (quota desc, rate desc, source_row asc) 순번."""
    # quota 로 갈리는 3행 — 입력 순서를 어떻게 섞어도 같은 순번이어야 한다.
    quotas = [30, 10, 20]
    for perm in itertools.permutations(quotas):
        st = pipeline([row_values(quota=q) for q in perm])
        seq = {r['quota']: r['variant_seq'] for r in st['rows']}
        eq(seq, {30: 0, 20: 1, 10: 2},
           'quota desc 순번 (입력순 {})'.format(list(perm)))
        eq(st['dup_stats'], {'dup_groups': 1, 'excess_rows': 2}, '중복 그룹 1 / 초과 2')

    # 결측 quota 는 후순위.
    st = pipeline([row_values(quota=None), row_values(quota=5)])
    seq = {r['quota']: r['variant_seq'] for r in st['rows']}
    eq(seq, {5: 0, None: 1}, 'quota 결측은 뒤로')

    # quota 동률이면 rate desc.
    st = pipeline([
        row_values(quota=10, competition_rate=3.0),
        row_values(quota=10, competition_rate=7.0),
    ])
    seq = {r['competition_rate']: r['variant_seq'] for r in st['rows']}
    eq(seq, {7.0: 0, 3.0: 1}, 'quota 동률 시 rate desc')

    # quota·rate 동률이면 source_row asc — 파일 안에서 결정적.
    st = pipeline([
        row_values(quota=10, competition_rate=4.0, grade_50=2.0),
        row_values(quota=10, competition_rate=4.0, grade_50=8.0),
    ])
    seq = {r['grade_50']: r['variant_seq'] for r in st['rows']}
    eq(seq, {2.0: 0, 8.0: 1}, '전부 동률이면 source_row asc')

    # 자연키가 다르면 순번은 전부 0.
    st = pipeline([
        row_values(admission_track='A'),
        row_values(admission_track='B'),
    ])
    eq({r['variant_seq'] for r in st['rows']}, {0}, '자연키가 다르면 0')
    eq(st['dup_stats'], {'dup_groups': 0, 'excess_rows': 0}, '중복 그룹 없음')

    # G4(순번 포함 유일성)는 항상 통과해야 하고, G5 는 실측 그룹 수를 보고한다.
    st = pipeline([row_values(quota=q) for q in (30, 20)])
    blocks, _warns = gate_map(st)
    gate_pass(blocks, 'G4', 'variant_seq 포함 유일성')
    eq(blocks['G5'][1], '1/1', 'G5 실측이 그룹 1 / 초과 1')


# ---------------------------------------------------------------------
# 8. 50%컷 > 70%컷 — 스왑 금지
# ---------------------------------------------------------------------

@test
def t08_cut_inversion_no_swap():
    """50%컷 > 70%컷 은 값 무변경 + note 플래그만 (상류 재수정 시 이중 적용 방지)."""
    st = pipeline([
        row_values(admission_track='INV', grade_50=3.5, grade_70=2.1),
        row_values(admission_track='EQ', grade_50=2.8, grade_70=2.8),
        row_values(admission_track='OK', grade_50=2.1, grade_70=3.5),
    ])
    _header, body, _blob, _out = emit_csv(st)
    by_track = {r['admission_track']: r for r in body}

    eq(by_track['INV']['grade_50'], '3.50', '역전 행의 50%컷 값 무변경')
    eq(by_track['INV']['grade_70'], '2.10', '역전 행의 70%컷 값 무변경 (스왑 금지)')
    eq(by_track['INV']['note'], '50%컷 > 70%컷 (원문 유지)', 'note 플래그만')
    eq(by_track['EQ']['note'], '', '동률은 note 없음')
    eq(by_track['OK']['note'], '', '정상 행은 note 없음')

    eq(st['value_stats']['cut_inversion'], 1, 'W1 역전 1건')
    eq(st['value_stats']['cut_equal'], 1, 'W2 동률 1건')

    # 역전 판정은 반올림 전 원문 기준 — 3자리에서만 갈리는 쌍도 역전으로 센다.
    st2 = pipeline([row_values(grade_50=RawNum('3.004'), grade_70=RawNum('3.001'))])
    eq(st2['value_stats']['cut_inversion'], 1, '원문 기준 역전')
    eq(st2['value_stats']['cut_inversion_out'], 0,
       '반올림 후에는 동률로 접힌다 — 적재값 기준 참고치는 0')
    eq(st2['rows'][0]['grade_50'], 3.0, '반올림은 적용')
    eq(st2['rows'][0]['grade_70'], 3.0, '반올림은 적용')

    # note 두 개가 붙으면 '; ' 로 결합.
    st3 = pipeline([row_values(competition_rate=RawNum('0'), grade_50=4.0, grade_70=2.0)])
    _h, body3, _b, _o = emit_csv(st3)
    eq(body3[0]['note'], '경쟁률 0 → 결측 승격; 50%컷 > 70%컷 (원문 유지)',
       'note 복수 결합')


# ---------------------------------------------------------------------
# 9. 게이트 — 위반 픽스처가 실제로 BLOCK 을 때리는가
# ---------------------------------------------------------------------

@test
def t09_gates_detect_violations():
    """일부러 어긴 픽스처가 해당 BLOCK 게이트를 실제로 때리는가."""
    # G3 연도 도메인
    blocks, _ = gate_map(pipeline([row_values(result_year=2024)]))
    gate_fail(blocks, 'G3', '연도 2024')
    blocks, _ = gate_map(pipeline([row_values(result_year=2025, admission_track='A'),
                                   row_values(result_year=2026, admission_track='B')]))
    gate_pass(blocks, 'G3', '연도 2025/2026 만')

    # G6 NOT NULL 6열
    blocks, _ = gate_map(pipeline([row_values(university_raw=None)]))
    gate_fail(blocks, 'G6', '대학명 결측')
    blocks, _ = gate_map(pipeline([row_values(department_raw='-')]))
    gate_fail(blocks, 'G6', '모집단위 결측 표기')

    # G7 main_track 도메인
    blocks, _ = gate_map(pipeline([row_values(main_track='기타')]))
    gate_fail(blocks, 'G7', 'main_track 기타')

    # G8 은 "11종 & CHECK 12종에 포함"이라 distinct 개수를 맞춰줘야 판정이 갈린다.
    cats11 = ['일반', '추천형', '지역인재', '농어촌', '기회균형', '특성화고',
              '특수교육', '논술', '실기', '성인학습자', '재외국민']
    ok_rows = [row_values(screening_category=c, admission_track='T{}'.format(i))
               for i, c in enumerate(cats11)]
    blocks, _ = gate_map(pipeline(ok_rows))
    gate_pass(blocks, 'G8', '유효 11종')
    bad_rows = list(ok_rows)
    bad_rows[-1] = row_values(screening_category='알수없음', admission_track='T10')
    blocks, _ = gate_map(pipeline(bad_rows))
    gate_fail(blocks, 'G8', '11종이지만 도메인 밖 값 포함')

    # G10 은 로더가 항상 round(2) 를 걸므로 구조적으로 통과해야 한다.
    blocks, _ = gate_map(pipeline([row_values(grade_50=RawNum('3.14159'))]))
    gate_pass(blocks, 'G10', '반올림 후 소수 3자리 없음')

    # G11 등급 범위 [1.00, 9.00]
    for bad in (0.5, 9.5):
        blocks, _ = gate_map(pipeline([row_values(grade_min10=bad)]))
        gate_fail(blocks, 'G11', 'grade_min10={}'.format(bad))
    blocks, _ = gate_map(pipeline([row_values(grade_min10=9.0)]))
    gate_pass(blocks, 'G11', '경계값 9.00 은 통과')

    # G12 quota 범위 [1, 614]
    for bad in (RawNum('0'), 615):
        blocks, _ = gate_map(pipeline([row_values(quota=bad)]))
        gate_fail(blocks, 'G12', 'quota 범위 이탈')

    # G13 competition_rate 범위 [0, 382.2]
    blocks, _ = gate_map(pipeline([row_values(competition_rate=400.0)]))
    gate_fail(blocks, 'G13', 'competition_rate 400')

    # 최소 픽스처는 전량 기준값(G1/G2/G5)을 만족할 수 없다 — 그게 정상이다.
    blocks, _ = gate_map(pipeline([row_values()]))
    gate_fail(blocks, 'G1', '총 행수 1')


@test
def t10_main_exit_codes():
    """BLOCK 실패 시 CSV 미생성 + 비영점 종료. 입력·헤더 이상은 2."""
    src = fixture([row_values(), row_values(admission_track='B')])
    out = os.path.join(TMPDIR, 'must-not-exist.csv')
    rc = L.main(['--src', src, '--out', out])
    eq(rc, 1, 'BLOCK 실패 종료코드')
    truthy(not os.path.exists(out), 'BLOCK 실패인데 CSV 가 생성됐다')

    rc = L.main(['--src', os.path.join(TMPDIR, '없는파일.xlsx'), '--out', out])
    eq(rc, 2, '입력 파일 없음 종료코드')
    truthy(not os.path.exists(out), '입력 없음인데 CSV 가 생성됐다')

    # 헤더가 바뀌면 게이트 기대값 전체가 무효 — 게이트 이전에 2 로 죽어야 한다.
    bad_header = list(HEADER_ROW)
    bad_header[6] = '모집정원'
    src2 = fixture([row_values()], header=bad_header)
    rc = L.main(['--src', src2, '--out', out])
    eq(rc, 2, '헤더 불일치 종료코드')
    truthy(not os.path.exists(out), '헤더 불일치인데 CSV 가 생성됐다')

    # --dry-run 도 BLOCK 실패면 1.
    rc = L.main(['--src', src, '--out', out, '--dry-run'])
    eq(rc, 1, '--dry-run + BLOCK 실패')


# ---------------------------------------------------------------------
# 러너
# ---------------------------------------------------------------------

def main(argv=None):
    global TMPDIR
    ap = argparse.ArgumentParser(description='입결 CSV 로더 회귀 테스트')
    ap.add_argument('--keep', action='store_true', help='픽스처 임시 디렉터리 보존')
    args = ap.parse_args(argv)

    TMPDIR = tempfile.mkdtemp(prefix='admission-csv-test-')
    failures = []
    try:
        print('로더: {}'.format(LOADER_PATH))
        print('픽스처: {}'.format(TMPDIR))
        print('')
        for fn in TESTS:
            doc = (fn.__doc__ or '').strip().splitlines()
            label = doc[0] if doc else fn.__name__
            try:
                # 로더가 게이트 리포트를 표준출력에 쏟으므로 main() 호출
                # 테스트만 시끄럽다. 그대로 둔다 — 실패 시 진단에 쓰인다.
                fn()
            except AssertionError as exc:
                failures.append((fn.__name__, str(exc)))
                print('FAIL  {:<28} {}'.format(fn.__name__, label))
                print('      ↳ {}'.format(exc))
            except Exception as exc:  # noqa: BLE001 — 예외 자체가 실패다
                failures.append((fn.__name__, '{}: {}'.format(type(exc).__name__, exc)))
                print('ERROR {:<28} {}'.format(fn.__name__, label))
                print('      ↳ {}: {}'.format(type(exc).__name__, exc))
            else:
                print('PASS  {:<28} {}'.format(fn.__name__, label))
    finally:
        if args.keep:
            print('\n픽스처 보존: {}'.format(TMPDIR))
        else:
            shutil.rmtree(TMPDIR, ignore_errors=True)

    print('')
    print('{}/{} 통과'.format(len(TESTS) - len(failures), len(TESTS)))
    if failures:
        print('\n실패 목록:')
        for name, msg in failures:
            print('  - {}: {}'.format(name, msg))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
