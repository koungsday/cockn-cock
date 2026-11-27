# 글자 크기·굵기·색을 단계 토큰으로 모은다 (docs/simplify 기준). 브랜드 장면은 건드리지 않는다.
import re, sys
from pathlib import Path
from collections import Counter
FILES = ['styles.css', 'share.css', 'worker/public/live.css']
SKIP_COLOR = re.compile(r'\.(share-art|share-chat|share-brand|share-close|hero|featured|session-step|sk-|btn-lime|btn-glass|login-|public-story-head|public-share-type|tab-bar|menu-|mobile-navigation|tone-|mint|sand|lavender|nav-|sidebar|brand|demo-label|site-|platform-|loading-center|section-loader)|::backdrop')
SKIP_SIZE = re.compile(r'\.(hero|share-art|share-close|login-code)|:root')
def norm(h):
    h = h.lower()[1:]
    if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
    return '#' + h
def table(mapping):
    return {norm(c): token for token, colors in mapping.items() for c in colors.split()}
TEXT = table({
  'var(--ink)': '#193b27 #172c22 #1d3225 #1c3d2c #23382a #263c2d #1e3026 #1e2928 #263c32 #273c30 #243f30 #344b3b #283d48 #2d533d #2a4a37 #244b31 #2f4a12 #23523b',
  'var(--court)': '#28583e #235f43 #315f47 #2c6243 #24583d #234a36 #214333 #1f5a36 #316248 #42634d #458563 #427452',
  'var(--muted)': '#496354 #4d5e53 #50745c #4d5d52 #4d6153 #43654f #4c6153 #5e6e64 #586b5f #74877a #536559 #546858 #58685d #53635a #54665a #546658 #526359 #45594b #566d5e #55675c #405349 #536859 #506455 #46584d #415967 #46575c',
  'var(--line)': '#d8e68e',
})
BG = table({
  'var(--accent-soft)': '#e2efdc #e8f3e7 #ebf5e9 #edf7ea #eaf5e8 #e9f3e9 #eef7dc #f1f7e6 #f3f8ef #dce9e1 #edf4ed #edf4ec',
  'var(--hint)': '#e9eee7 #f1f5ef #edf1ed #f0f5ef #e8efe6 #dce6db #e0e8e2 #edf1eb #dde7db #f2f5f0 #fcfefa',
  'var(--court)': '#458563 #538c5d',
  'var(--ink)': '#1f5039',
  'var(--line)': '#d8e68e',
})
BORDER = table({
  'var(--line)': '#edf0ec #eaf0e9 #dce5db #e9ede8 #e8ede6 #edf0eb #e6eee4',
  'var(--edge)': '#d8e3d9 #cfdcd2',
  'var(--court)': '#3b7553 #3b7654 #376044 #386e4e',
  'var(--field-line)': '#aabfab',
})
SHADOW = table({'var(--court)': '#458563 #376044', 'var(--accent-soft)': '#f1f7e6'})
OTHER = table({'var(--court)': '#346d4e'})
def size(value):
    v = value.strip()
    m = re.fullmatch(r'([\d.]+)(rem|px)', v)
    if m: px = float(m.group(1)) * (16 if m.group(2) == 'rem' else 1)
    else:
        m = re.fullmatch(r'clamp\(\s*([\d.]+)rem.*\)', v)
        if not m: return None
        px = float(m.group(1)) * 16
    return 'var(--t4)' if px < 14.95 else 'var(--t3)' if px <= 17 else 'var(--t2)' if px <= 20.9 else 'var(--t1)'
stat = Counter(); left = Counter()
def declaration(sel, prop, value):
    if prop == 'font-size':
        if SKIP_SIZE.search(sel): return value
        new = size(value)
        if new: stat['size'] += 1; return ' ' + new
        return value
    if prop == 'font-weight':
        m = re.fullmatch(r'\s*(\d+)\s*', value)
        if m: stat['weight'] += 1; return ' 400' if int(m.group(1)) < 500 else ' 600'
        return value
    kind = TEXT if prop in ('color', 'fill', 'stroke') else BORDER if ('border' in prop or prop.startswith('outline')) else SHADOW if 'shadow' in prop else BG if 'background' in prop else OTHER
    if SKIP_COLOR.search(sel): return value
    def swap(m):
        c = norm(m.group(0))
        if c in kind: stat['color'] += 1; return kind[c]
        if len(c) == 7 and c not in ('#ffffff',): left[c] += 1
        return m.group(0)
    return re.sub(r'#[0-9a-fA-F]{3,8}\b', swap, value)
def rule(m):
    sel, body = m.group(1), m.group(2)
    flat = ' '.join(sel.split())
    body = re.sub(r'([\w-]+)(\s*:)([^;{}]+)', lambda d: d.group(1) + d.group(2) + declaration(flat, d.group(1), d.group(3)), body)
    return sel + '{' + body + '}'
for f in FILES:
    p = Path(f); src = p.read_text()
    # 주석은 그대로 두고 규칙 몸통만 바꾼다
    parts = re.split(r'(/\*.*?\*/)', src, flags=re.S)
    out = ''.join(part if part.startswith('/*') else re.sub(r'([^{}]+)\{([^{}]*)\}', rule, part) for part in parts)
    if '--check' not in sys.argv: p.write_text(out)
print(dict(stat)); print('남은 색:', left.most_common())
