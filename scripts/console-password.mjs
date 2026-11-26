// 총괄 로그인 설정 (PLATFORM.md): asks the ID and the password in this terminal and stores only a PBKDF2 value.
//   npm run console:password              → the production Worker's secrets (wrangler secret put, read from stdin)
//   npm run console:password -- --local   → worker/.dev.vars for npm run live:dev
// The password is never shown, written to a file or passed as a command argument. Changing it signs every console session out.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { isAdminId } from '../worker/auth.mjs';
import { consoleSecret } from '../worker/console.mjs';

const local = process.argv.includes('--local');
const config = 'worker/wrangler.production.local.json';
const vars = 'worker/.dev.vars';

function stop(problem, fix) {
  console.error(`\n중단: ${problem}\n해결: ${fix}`);
  process.exit(1);
}

// A terminal gets hidden prompts; piped input (for scripted local setup) is read line by line.
const piped = process.stdin.isTTY ? null : readFileSync(0, 'utf8').split(/\r?\n/);
function ask(question, hidden = false) {
  if (piped) return Promise.resolve(piped.shift() ?? '');
  return new Promise(resolve => {
    const prompt = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) prompt._writeToOutput = text => { if (text.includes(question)) process.stdout.write(question); };
    prompt.question(question, answer => {
      prompt.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

if (!local && !existsSync(config)) {
  stop(`운영 배포 설정(${config})이 없습니다.`, '운영 설정이 있는 원래 폴더에서 실행하세요(OPERATIONS.md "로컬 검증과 클라우드 배포").');
}
const id = (await ask('총괄 아이디: ')).trim();
if (!isAdminId(id)) stop('아이디는 영문·숫자와 . _ - 로 3~64자이거나 한글 이름이어야 합니다.', '다시 실행해 아이디를 입력하세요.');
const password = await ask('비밀번호 (12자 이상, 입력한 글자는 보이지 않습니다): ', true);
if (password.length < 12 || password.length > 256) stop('비밀번호는 12자 이상 256자 이하여야 합니다.', '다시 실행해 더 긴 비밀번호를 입력하세요.');
if (password !== await ask('비밀번호 한 번 더: ', true)) stop('두 번 입력한 비밀번호가 다릅니다.', '다시 실행하세요.');
const secret = await consoleSecret(password);

if (local) {
  const kept = existsSync(vars)
    ? readFileSync(vars, 'utf8').split('\n').filter(line => line && !/^PLATFORM_ADMIN_(ID|PASSWORD_HASH)=/.test(line)) : [];
  writeFileSync(vars, [...kept, `PLATFORM_ADMIN_ID=${id}`, `PLATFORM_ADMIN_PASSWORD_HASH=${secret}`, ''].join('\n'), { mode: 0o600 });
  console.log(`\n${vars}에 총괄 로그인을 저장했습니다. npm run live:dev 를 다시 시작한 뒤 /console/ 에서 로그인하세요.`);
} else {
  for (const [name, value] of [['PLATFORM_ADMIN_ID', id], ['PLATFORM_ADMIN_PASSWORD_HASH', secret]]) {
    try {
      execFileSync('npx', ['wrangler', 'secret', 'put', name, '--config', config], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
    } catch {
      stop(`${name}을(를) 운영 Worker에 저장하지 못했습니다.`, 'npx wrangler whoami 로 로그인 상태를 확인한 뒤 다시 실행하세요.');
    }
  }
  const origin = JSON.parse(readFileSync(config, 'utf8')).vars?.CLUB_PUBLIC_ORIGIN ?? '';
  console.log(`\n운영 Worker에 총괄 로그인을 저장했습니다. ${origin}/console/ 에서 로그인하세요.`);
}
