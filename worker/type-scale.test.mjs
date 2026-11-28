// 글자 크기 (DESIGN.md 2): every font size of the club screens, the share pages, the sign-in page and the 총괄 콘솔 is one of
// the three steps (22, 18, 16px). Nothing smaller than 16px: members of every age read these on a phone (2026-11-28).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = ['styles.css', 'share.css', 'worker/public/live.css'];
// What may stay a literal, each with its reason.
const exceptions = [
  [/^:root$/, /^16px$/, '바탕 글자 크기 (--t3과 같다)'],
  [/\.share-close/, /^1\.6rem$/, '닫기 × 기호의 크기'],
  [/\.share-art/, /^[\d.]+cqw$/, '공유 그림 안의 글자, 그림 폭에 비례'],
  [/\.hero h1/, /^clamp\(2rem, 6vw, 3\.1rem\)$/, '총괄 로그인 코트 장면의 큰 제목 (DESIGN.md 2 예외)'],
];

test('every font size is one of the three type steps', async () => {
  const theme = await readFile('platform/theme.css', 'utf8');
  assert.deepEqual([...theme.matchAll(/--t(\d):\s*([\d.]+)rem/g)].map(([, step, rem]) => [Number(step), Number(rem) * 16]), [[1, 22], [2, 18], [3, 16]]);
  const stray = [];
  for (const file of files) {
    const css = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim().replace(/\s+/g, ' ');
      for (const [, value] of rule[2].matchAll(/(?<![-\w])font-size\s*:\s*([^;}]+)/g)) {
        const raw = value.trim().replace(/\s*!important$/, '');
        if (/^(?:var\(--t[123]\)|inherit)$/.test(raw)) continue;
        if (exceptions.some(([where, what]) => where.test(selector) && what.test(raw))) continue;
        stray.push(`${file}: ${selector.slice(-60)} { font-size: ${raw} }`);
      }
    }
  }
  assert.deepEqual(stray, [], `off the type scale:\n${stray.join('\n')}`);
});
