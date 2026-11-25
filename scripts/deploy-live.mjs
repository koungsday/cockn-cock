// One-step live release (AGENTS.md): only the merged main is checked, built, deployed and verified.
// Usage: npm run deploy
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CLUBS } from '../platform/clubs.mjs';

const config = 'worker/wrangler.production.local.json';
const read = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let deployed = false;

function stop(problem, fix) {
  console.error(`\n배포 중단: ${problem}\n해결: ${fix}`);
  console.error(deployed
    ? `새 버전은 이미 배포됐습니다. 이전 버전으로 되돌리려면: npx wrangler rollback --config ${config}`
    : '실사용 사이트는 바뀌지 않았습니다.');
  process.exit(1);
}

function step(label, command, args) {
  console.log(`\n▶ ${label}`);
  try {
    execFileSync(command, args, { stdio: 'inherit' });
  } catch {
    stop(`${label} 단계가 실패했습니다.`, '위 출력의 오류를 고쳐 PR로 머지한 뒤 다시 실행하세요.');
  }
}

// Anything other than the merged main could roll the live site back to older code.
read('git', ['fetch', '--quiet', '--force', '--tags', 'origin', 'main']);
if (read('git', ['status', '--porcelain', '--untracked-files=no'])) {
  stop('커밋하지 않은 변경이 있습니다.', '변경을 PR로 머지하거나 되돌린 뒤 다시 실행하세요.');
}
const head = read('git', ['rev-parse', 'HEAD']);
const main = read('git', ['rev-parse', 'origin/main']);
if (head !== main) {
  stop(`지금 코드(${head.slice(0, 7)})가 GitHub main(${main.slice(0, 7)})과 다릅니다.`,
    '원래 폴더는 git pull, 작업 폴더는 git switch --detach origin/main 으로 맞춘 뒤 다시 실행하세요.');
}

// The production config is local-only (.gitignore); a worktree borrows it from the main checkout.
if (!existsSync(config)) {
  const primary = read('git', ['worktree', 'list', '--porcelain']).split('\n')[0].replace(/^worktree /, '');
  if (!existsSync(join(primary, config))) {
    stop(`운영 배포 설정(${config})이 없습니다.`, 'OPERATIONS.md "로컬 검증과 클라우드 배포"대로 운영 설정을 만드세요.');
  }
  copyFileSync(join(primary, config), config);
}
const origin = JSON.parse(readFileSync(config, 'utf8')).vars?.CLUB_PUBLIC_ORIGIN;
if (!origin) stop(`${config}에 vars.CLUB_PUBLIC_ORIGIN이 없습니다.`, '운영 주소(https://…)를 설정에 넣으세요.');
try {
  if (!read('npx', ['wrangler', 'whoami']).includes('You are logged in')) throw new Error();
} catch {
  stop('Cloudflare에 로그인돼 있지 않습니다.', '터미널에서 npx wrangler login 을 실행하세요.');
}

let previous = '';
try { previous = read('git', ['rev-parse', 'refs/tags/live']); } catch { /* first one-step release */ }
const changes = previous
  ? read('git', ['log', '--format=  %h %s', `${previous}..${head}`])
  : read('git', ['log', '-1', '--format=  %h %s', head]);
console.log(`\n이번 배포에 들어가는 변경${previous ? ` (지난 배포 ${previous.slice(0, 7)} 이후)` : ' (이전 배포 기록 없음, 현재 커밋만 표시)'}:\n${changes || '  없음 (같은 버전을 다시 배포)'}`);

step('가상 체험 빌드', 'npm', ['run', 'build']);
step('가상 체험 검증', 'npm', ['run', 'verify']);
step('실사용 테스트', 'npm', ['run', 'live:test']);
step('실사용 빌드', 'npm', ['run', 'live:build']);
step('Worker 배포', 'npx', ['wrangler', 'deploy', '--config', config]);
deployed = true;

// Confirm the public address serves this build's UI hash, then run the existing live checks.
const release = readdirSync('worker/site/club-ui')[0];
let served = '';
for (let attempt = 1; attempt <= 5 && served !== release; attempt++) {
  if (attempt > 1) await new Promise(resolve => setTimeout(resolve, 3000));
  const html = await fetch(new URL(`/clubs/${CLUBS[0].slug}/admin/`, origin), { cache: 'no-store' }).then(response => response.text()).catch(() => '');
  served = html.match(/\/club-ui\/([a-f0-9]{20})\//)?.[1] ?? '';
}
if (served !== release) stop(`운영 주소가 새 화면(${release})이 아닌 ${served || '응답 없음'}을 보여 줍니다.`, '몇 분 뒤 npm run live:verify -- ' + origin + ' 로 다시 확인하세요.');
step('운영 주소 검증', 'node', ['scripts/verify-live.mjs', origin]);

step('배포 기록(live 태그) 갱신', 'git', ['push', '--force', 'origin', `${head}:refs/tags/live`]);
execFileSync('git', ['tag', '--force', 'live', head], { stdio: 'ignore' });
console.log(`\n배포 완료: ${origin} ← ${head.slice(0, 7)} (화면 ${release})`);
