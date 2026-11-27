// One-step live release (AGENTS.md): only the merged main is checked, built, deployed and verified.
// Usage: npm run deploy
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
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

// One release at a time on this computer. Every worktree (Codex, Claude Code) shares the git common directory,
// so they all see this lock. A lock left by a stopped run is reported with the command to clear it, never removed silently.
const commonDir = read('git', ['rev-parse', '--git-common-dir']);
const lock = join(isAbsolute(commonDir) ? commonDir : join(process.cwd(), commonDir), 'cockcockcock-deploy.lock');
try {
  mkdirSync(lock);
} catch {
  let owner = '알 수 없음';
  let minutes = 0;
  try {
    owner = readFileSync(join(lock, 'owner'), 'utf8').trim();
    minutes = Math.round((Date.now() - statSync(lock).mtimeMs) / 60000);
  } catch { /* the other run is still writing its owner line */ }
  stop(`다른 배포가 진행 중입니다 (${owner}, ${minutes}분 전 시작).`, minutes >= 30
    ? `멈춘 배포가 남긴 잠금으로 보입니다. 진행 중인 배포가 없는지 확인한 뒤 rm -r '${lock}' 를 실행하고 다시 배포하세요.`
    : '그 배포가 끝난 뒤 최신 origin/main으로 다시 실행하세요.');
}
writeFileSync(join(lock, 'owner'), `${process.pid} ${new Date().toISOString()} ${process.cwd()}`);
process.on('exit', () => rmSync(lock, { recursive: true, force: true }));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));

if (read('git', ['status', '--porcelain', '--untracked-files=no'])) {
  stop('커밋하지 않은 변경이 있습니다.', '변경을 PR로 머지하거나 되돌린 뒤 다시 실행하세요.');
}
const head = read('git', ['rev-parse', 'HEAD']);

// Never goes backwards: origin/main must still be this commit, and what is live now must be in its history.
// Checked before the build and again right before the Worker upload, because another merge can land in between.
function checkReleaseOrder(when) {
  read('git', ['fetch', '--quiet', '--force', '--tags', 'origin', 'main']);
  const main = read('git', ['rev-parse', 'origin/main']);
  if (head !== main) {
    stop(`${when} GitHub main이 ${main.slice(0, 7)}입니다. 지금 코드(${head.slice(0, 7)})는 최신 main이 아닙니다.`,
      '원래 폴더는 git pull --ff-only origin main, 작업 폴더는 git switch --detach origin/main 으로 맞춘 뒤 다시 실행하세요.');
  }
  let live = '';
  try { live = read('git', ['rev-parse', 'refs/tags/live']); } catch { return ''; /* first one-step release */ }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', live, head], { stdio: 'ignore' });
  } catch {
    stop(`실사용에 있는 ${live.slice(0, 7)}이(가) 지금 코드(${head.slice(0, 7)})의 이전 기록에 없습니다. 이대로 올리면 화면이 되돌아갈 수 있습니다.`,
      'origin/main을 다시 받아 확인하세요. 되돌리려는 것이면 GitHub Revert PR을 머지한 뒤 배포하세요.');
  }
  return live;
}
const previous = checkReleaseOrder('배포 전 확인:');

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

// Code that expects a newer schema than the production D1 has would fail every save, so it never ships first.
let migrations = '';
try {
  migrations = read('npx', ['wrangler', 'd1', 'migrations', 'list', 'DB', '--remote', '--config', config]);
} catch {
  stop('운영 D1의 마이그레이션 상태를 읽지 못했습니다.', `npx wrangler d1 migrations list DB --remote --config ${config} 로 오류를 확인하세요.`);
}
if (!migrations.includes('No migrations to apply')) {
  const pending = [...migrations.matchAll(/│\s*(\S+\.sql)\s*│/g)].map(match => match[1]);
  stop(`운영 D1에 아직 적용하지 않은 마이그레이션이 있습니다: ${pending.join(', ') || '목록을 읽지 못함'}.`,
    'OPERATIONS.md "D1 구조 변경"대로 운영 D1을 먼저 바꾼 뒤 다시 배포하세요. 코드만 먼저 올리면 실사용 저장이 실패합니다.');
}

const changes = previous
  ? read('git', ['log', '--format=  %h %s', `${previous}..${head}`])
  : read('git', ['log', '-1', '--format=  %h %s', head]);
console.log(`\n이번 배포에 들어가는 변경${previous ? ` (지난 배포 ${previous.slice(0, 7)} 이후)` : ' (이전 배포 기록 없음, 현재 커밋만 표시)'}:\n${changes || '  없음 (같은 버전을 다시 배포)'}`);

step('가상 체험 빌드', 'npm', ['run', 'build']);
step('가상 체험 검증', 'npm', ['run', 'verify']);
step('실사용 테스트', 'npm', ['run', 'live:test']);
step('실사용 빌드', 'npm', ['run', 'live:build']);
checkReleaseOrder('빌드하는 동안 바뀐 것 확인:');
step('Worker 배포', 'npx', ['wrangler', 'deploy', '--config', config]);
deployed = true;

// Confirm the public address serves this build's UI hash, then run the existing live checks.
// The new version takes a while to reach every edge (#66 on 2026-11-27: longer than the 12 s this used to wait),
// so check every 5 s for up to 60 s, as verify-live.mjs does.
const release = readdirSync('worker/site/club-ui')[0];
const settleStart = Date.now();
let served = '';
for (let waits = 0; ; waits++) {
  const html = await fetch(new URL(`/clubs/${CLUBS[0].slug}/admin/`, origin), { cache: 'no-store' }).then(response => response.text()).catch(() => '');
  served = html.match(/\/club-ui\/([a-f0-9]{20})\//)?.[1] ?? '';
  if (served === release || Date.now() - settleStart >= 60000) break;
  console.log(`운영 주소가 아직 새 화면이 아닙니다(지금 ${served || '응답 없음'}). 5초 뒤 다시 확인합니다 (${waits + 1}번째).`);
  await new Promise(resolve => setTimeout(resolve, 5000));
}
if (served !== release) stop(`${Math.round((Date.now() - settleStart) / 1000)}초 동안 운영 주소가 새 화면(${release})이 아닌 ${served || '응답 없음'}을 보여 줍니다.`, '몇 분 뒤 npm run live:verify -- ' + origin + ' 로 다시 확인하세요.');
step('운영 주소 검증', 'node', ['scripts/verify-live.mjs', origin, release]);

step('배포 기록(live 태그) 갱신', 'git', ['push', '--force', 'origin', `${head}:refs/tags/live`]);
execFileSync('git', ['tag', '--force', 'live', head], { stdio: 'ignore' });
console.log(`\n배포 완료: ${origin} ← ${head.slice(0, 7)} (화면 ${release})`);
