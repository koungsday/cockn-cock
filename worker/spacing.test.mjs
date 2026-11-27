// 간격 단계 (DESIGN.md 간격): every margin, padding and gap of the shared stylesheets is a --space-N token from
// platform/theme.css. Anything else fails here, so a stray 13px or clamp() never reaches a screen again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = ['styles.css', 'share.css', 'worker/public/live.css', 'platform/platform.css'];
const spacing = /(?<![-\w])((?:margin|padding|gap|row-gap|column-gap)(?:-(?:top|bottom|left|right|block|inline)(?:-(?:start|end))?)?|--content-top)\s*:\s*([^;}]+)/g;
// What may stay a literal, each with its reason (DESIGN.md 간격 예외).
const exceptions = [
  [/\.tab-bar/, /./, '하단 탭 바는 기존 스타일 그대로 (사용자 결정 2026-11-27)'],
  [/\.search-field input/, /^35px$/, '검색 아이콘을 비켜 두는 자리'],
  [/(^|,\s*)select\b/, /^30px$/, '선택 칸 화살표를 비켜 두는 자리'],
  [/\.routine-list|\.member-access-steps|\.start-steps/, /^(?:calc\(var\(--space-\d+\)|\+|[\d.]+r?em\)?)$/, '번호 목록의 번호 자리'],
  [/\.shuttle-inline/, /^\.35em$/, '글자 옆 셔틀콕, 글자 크기를 따름'],
  [/\.share-art/, /^[\d.]+cqw$/, '공유 그림 안의 배치, 그림 폭에 비례'],
  [/\.hero h1/, /^[\d.]+em$/, '큰 제목 글자의 위아래 맞춤, 글자 크기를 따름'],
];
const allowed = [
  /calc\(-1 \* var\(--space-\d+\)\)/g, /var\(--(?:space-\d+|content-top|page-gutter|safe-[a-z]+|sidebar-width)\)/g,
  /env\([^()]*\)/g, /\b(?:auto|inherit|0)\b/g, /(?<![\d.])-?1px\b/g,
];

test('every margin, padding and gap is on the spacing scale', async () => {
  const theme = await readFile('platform/theme.css', 'utf8');
  const steps = [...theme.matchAll(/--space-(\d+):\s*(\d+)px/g)].map(([, name, px]) => [Number(name), Number(px)]);
  assert.deepEqual(steps.map(([, px]) => px), [2, 4, 8, 12, 16, 24, 32, 48, 64, 96], 'the scale itself');
  assert(steps.every(([name, px]) => name === px), 'each token is named by its size');
  const stray = [];
  for (const file of files) {
    const css = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim().replace(/\s+/g, ' ');
      for (const [, property, value] of rule[2].matchAll(spacing)) {
        const raw = value.trim().replace(/\s*!important$/, '');
        if (exceptions.some(([where, what]) => where.test(selector) && raw.split(/\s+/).every(part => what.test(part) || /^(?:0|auto)$/.test(part)))) continue;
        let rest = raw;
        for (const pattern of allowed) rest = rest.replace(pattern, ' ');
        rest = rest.replace(/\b(?:calc|max|min)\(/g, ' ').replace(/[()+*,\s-]/g, '');
        if (rest) stray.push(`${file}: ${selector.slice(-60)} { ${property}: ${raw} }`);
      }
    }
  }
  assert.deepEqual(stray, [], `off the spacing scale:\n${stray.join('\n')}`);
});
