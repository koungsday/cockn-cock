#!/bin/sh
# page.html(원본)에서 로컬 확인용 preview.html을 만든다. 발행용(글꼴·로고 포함)은 대화 기록의 명령으로 만든다.
cd "$(dirname "$0")" && python3 - <<'PY'
from pathlib import Path
head = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n'
Path('preview.html').write_text(head + Path('page.html').read_text() + '\n</body></html>\n')
PY
