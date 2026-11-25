# 콕콕콕! 운영 환경

## 월 구독료 없이 구성하는 방법

공개 GitHub 저장소와 GitHub Pages는 가상 데이터로 데모를 운영합니다. 실사용 앱은 **Cloudflare Workers Free + D1 Free**를 사용합니다. 회원에게 공유할 주소는 [썬콕19](https://cockcockcock.pages.dev/clubs/suncok19/)입니다. 루트 [콕콕콕!](https://cockcockcock.pages.dev/)은 콕콕콕! 소개 홈이고, 등록 모임 바로가기가 히어로 바로 아래에 있습니다. Cloudflare Pages가 같은 계정의 Worker에 요청을 전달하고, Worker가 썬콕19 전용 D1에서 로그인과 투표를 처리합니다.

Workers Free는 동적 요청 하루 10만 건과 요청당 CPU 10ms가 포함됩니다. D1 Free는 하루 읽기 500만 행, 쓰기 10만 행과 계정 전체 저장 공간 5GB가 포함됩니다. 무료 한도에 도달하면 해당 작업은 한도 갱신 때까지 오류가 날 수 있습니다. Free 요금제를 유지하고 유료 기능을 활성화하지 않습니다.

Vercel Hobby와 Supabase Free도 후보입니다. 다만 기존 Vercel Pro 팀을 배제하려면 별도 Hobby 팀이 필요하고, Supabase Free는 최근 7일간 활동이 적으면 일시 중지될 수 있습니다. GitHub Pages만으로는 브라우저 간에 응답을 공유할 수 없습니다.

[Workers 요금표](https://developers.cloudflare.com/workers/platform/pricing/) · [D1 요금표](https://developers.cloudflare.com/d1/platform/pricing/) · [Supabase Free 일시 중지 안내](https://supabase.com/docs/guides/platform/free-project-pausing) · [GitHub Pages 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 모임과 접근 권한

[모임 등록 목록](platform/clubs.mjs)은 배포 설정에서 관리합니다. 썬콕19 모임 화면의 첫 화면은 회원과 운영진이 함께 쓰는 로그인 화면입니다. 서버가 입력한 계정을 확인하고 해당 역할의 화면을 엽니다. 공유 링크와 서버 요청도 같은 모임 경로 아래에 있습니다.

| 접근 주체 | 범위 |
| --- | --- |
| 배포 관리자 | 모임을 등록하고 각각의 D1과 운영진 성함·비밀번호·인증 비밀을 연결합니다. |
| 모임 운영진 | 로그인한 모임의 회원·공지·투표·출석·게스트·정산을 관리합니다. |
| 회원 | 로그인한 모임에서 게시된 공지와 일정을 보고 본인 투표를 제출하거나 변경합니다. |
| 방문자 | 회원 로그인 화면과 카톡 링크의 모임명·공유 유형을 볼 수 있습니다. |

새 모임을 추가할 때는 고유한 주소와 별도의 D1 데이터베이스 및 운영진 인증 설정을 사용합니다. 등록 모임은 루트 소개 홈의 모임 목록에 나타나고, 빌드에서 각 D1의 명시적인 ID가 서로 다른지 확인합니다. 서버는 URL에서 등록된 모임을 찾고, 그 모임에 연결된 DB와 로그인 세션으로 요청을 처리합니다.

## 캐시 규칙

| 화면 또는 데이터 | 실사용 Worker 응답 규칙 |
| --- | --- |
| 루트 소개 홈(등록 모임 목록 포함) | 공개로 60초 저장할 수 있습니다. 개인 데이터는 싣지 않습니다. |
| 회원·운영진 화면, 투표·공지 공유 HTML | `no-store`로 매번 새 응답을 받습니다. |
| 로그인·세션·회원 공지와 투표·운영진 API | `private, no-store`로 브라우저와 CDN에 저장하지 않습니다. |
| 공용 이미지와 홈 화면 앱 정보 | 1시간 다시 사용할 수 있습니다. |
| 버전이 붙은 웹폰트 파일 | 최대 1년 다시 사용합니다. 폰트를 교체할 때는 파일 이름을 바꿉니다. |
| 회원·운영진 화면의 스크립트와 스타일 | 내용의 해시를 주소로 사용해 최대 1년 다시 사용합니다. 새 배포에서 HTML은 새 파일 주소를 제공합니다. |

회원과 운영진은 각각의 로그인 쿠키를 사용합니다. 회원 로그인은 브라우저 세션에 남고 서버에서 최대 12시간 유효합니다. 운영진 로그인은 자동으로 최대 30일 유효합니다. 운영진 성함이나 운영 번호를 변경하면 기존 운영 세션이 만료됩니다. GitHub Pages에는 가상 데이터로 만든 체험 화면을 배포합니다.

## 회원이 하는 일

1. 모임에 등록된 성함을 입력한 뒤 생년월일 뒤 6자리로 처음 로그인합니다. 로그인한 브라우저에서는 30일 동안 이름이 자동 입력됩니다.
2. 카톡에서 연 공지나 투표는 로그인 뒤 같은 주소에 표시됩니다. 선발·후발·불참 중 하나와 점심 여부를 선택할 수 있고, 마감 전까지 기존 응답을 바꿀 수 있습니다.
3. 원하면 6자리 개인 PIN을 설정합니다. 다음 로그인부터 성함과 새 PIN을 입력합니다. PIN을 잊으면 운영진이 6자리 임시 번호를 발급할 수 있습니다.

서버는 생년월일이나 PIN 원문 대신 솔트와 별도 서버 비밀로 만든 검증값을 저장합니다. PIN 변경과 접속 재설정 시 이전 로그인 세션은 종료됩니다. 같은 이름과 로그인 번호로 중복 등록을 시도하면 저장을 거절합니다. 기존 회원끼리 같은 이름과 로그인 번호로 겹치면 운영진이 해당 회원의 접속을 재설정해 임시번호를 개별 전달합니다.

## 운영진이 하는 일

휴대전화 브라우저에서 운영 화면 주소를 열고 홈 화면에 추가합니다. 처음 접속할 때부터 성함과 6자리 운영 번호로 로그인합니다. 로그인은 자동으로 최대 30일 유지되며 로그아웃하면 종료됩니다.

운영 홈에서 다음 모임, 투표 응답, 활동 회원 수와 최근 공지를 확인합니다. 회차를 공개하면 같은 화면에서 회원 투표를 열거나 카카오톡 공유 링크를 복사할 수 있습니다.

1. 이전 주 설정을 복제해 일시, 장소와 투표 마감을 확인합니다. 운영진이 게시한 뒤 복사한 링크를 채팅방에 올립니다.
2. 선발·후발·불참과 점심 집계를 한 화면에서 봅니다. 게스트는 신청·확정·도착·취소와 납부 확인을 기록합니다. 투표와 현장 출석은 각각 기록합니다.
3. 직접·대타·별도 승인 등 인정 방식은 운영진이 확인합니다. 의료 증빙 원본 대신 승인 결과만 기록합니다. 반기 화면에 1차·2차 인정 횟수와 콕 수령 상태를 표시합니다.
4. 실제 출석 인원, 게스트, 콕 낱개·타, 코트 찬조금을 확인하고 주간 마무리 문구를 복사합니다. 납부액이나 계좌는 별도 승인된 내부 경로로 안내합니다.

게스트비, 경기 순서와 예외 인정은 운영진이 적용합니다. 이전 회의 기록의 금액을 현재 회차에 자동 적용하는 기준은 두지 않았습니다.

## 로컬 검증과 클라우드 배포

```sh
npm ci
npm run live:test
npm run live:db
npm run live:dev
```

로컬에는 `worker/.dev.vars`에 운영진 성함 `CLUB_ADMIN_ID`, 6자리 운영 번호 `CLUB_ADMIN_PIN`, 32자 이상의 별도 난수 `CLUB_AUTH_PEPPER`를 둡니다. 로컬 파일은 Git에서 제외됩니다. 가상 회원으로 점검합니다.

영구 운영 전에는 운영자가 Cloudflare에 로그인하고 **Workers Free**를 확인합니다. 전용 D1을 만들고 `worker/wrangler.jsonc`를 복사한 `worker/wrangler.production.local.json`에 반환된 `database_id`를 입력합니다. 운영용 초기 계정과 인증 비밀은 로컬용과 별개로 생성해 권한이 제한된 `worker/.dev.vars.production`에 저장합니다. 운영진에게는 성함과 운영 번호를 개인 경로로 전달합니다. 아래 명령은 각각의 별도 설정에서 마이그레이션과 초기 암호를 포함한 배포를 합니다.

```sh
npx wrangler login
npx wrangler d1 create suncok19 --location apac
npx wrangler d1 migrations apply DB --config worker/wrangler.production.local.json --remote
npm run live:build
npx wrangler deploy --config worker/wrangler.production.local.json --secrets-file worker/.dev.vars.production
```

기존 설치의 화면을 업데이트할 때는 변경을 담은 커밋에서 Worker를 빌드하고 배포합니다. 화면·코드만 바뀐 릴리스는 머지한 `main`에서 `npm run deploy` 하나로 배포합니다. 이 명령은 한 컴퓨터에서 한 번에 하나만 실행됩니다(작업 폴더가 함께 쓰는 `.git/cockcockcock-deploy.lock`). 커밋하지 않은 변경이 있거나, GitHub `main`과 다른 코드거나, 지금 실사용에 있는 `live` 커밋보다 오래된 코드면 배포를 거부합니다. `main` 확인은 빌드 전과 Worker 업로드 직전에 두 번 합니다. 그다음 이번에 들어가는 변경 목록을 보여 준 뒤 빌드·검증·실사용 테스트 → Worker 배포 → 운영 주소의 화면 해시와 `live:verify` 확인 → `live` 태그 갱신 순서로 진행합니다. 작업 폴더(worktree)에서 실행하면 운영 설정 파일을 원래 폴더에서 복사해 씁니다. 문제가 있으면 `npx wrangler rollback --config worker/wrangler.production.local.json`으로 이전 버전을 되돌립니다. D1 마이그레이션과 비밀 갱신은 이 명령에 포함하지 않습니다. D1 스키마나 운영 계정 변경이 포함된 릴리스에서 해당 마이그레이션과 비밀 갱신을 수행합니다. 기존 회원의 PIN을 유지하려면 `CLUB_AUTH_PEPPER`를 보존합니다. 운영 번호를 변경할 때는 운영 Worker의 `CLUB_ADMIN_PIN` 비밀을 갱신합니다.

## 화면 변경과 출시 검증

- 모임 목록, 실사용 화면, 가상 체험이 [공통 테마](platform/theme.css)를 사용합니다. 밝은 면의 주요 버튼은 운영 사이드바와 같은 어두운 회녹색을 쓰고, 로고의 연두색은 선택에 씁니다. 선명한 다홍색은 오프닝과 공유 이미지의 브랜드 포인트에 사용합니다. 마감과 서비스 상태는 문구와 중립색으로 알립니다. 투표·공지와 운영 화면은 제목과 실제 기록을 먼저 배치합니다.
- 넥센타이어체는 모임 이름과 제목, 원티드 산스는 본문·입력·버튼에 사용합니다. 원티드 산스는 기본 글자 묶음을 먼저 쓰고 그 밖의 글자가 화면에 있을 때 전체 파일을 불러옵니다. [서체 출처](assets/fonts/README.md)
- 모바일 운영 메뉴와 데스크톱 탐색은 고정 헤더와 같은 안전 영역 기준으로 배치합니다. 주요 조작 영역은 최소 44px입니다. 모달과 모바일 메뉴는 ×·배경·Esc로 닫고 포커스와 스크롤을 복구합니다.
- 운영 화면은 섹션 전환, 추가·수정 창 열기, 저장 중, 저장 완료에 각각 짧은 피드백을 줍니다. 모션 줄이기에서도 진행과 완료를 읽을 수 있습니다. 입력, 처리 중, 성공, 실패를 확인합니다. 투표는 서버가 저장한 응답을 표시하고, 저장이 실패하면 입력한 선택을 유지합니다. 일시·출석·집계는 운영 화면에서 가상 기록을 입력한 뒤 API 결과와 대조합니다.
- 로그인 정보가 일치하지 않으면 성함을 유지하고 번호칸만 비웁니다. 번호칸에 빨간 표시와 짧은 좌우 모션을 적용하며, 모션 줄이기에서는 빨간 표시와 안내만 표시합니다. 왼쪽 화살표로 성함을 수정할 수 있습니다.
- 작은 화면의 Chromium과 WebKit에서 가로 넘침과 스크롤, 키보드 포커스, 오류 후 재시도, 카톡 링크의 로그인 후 복귀를 확인합니다. 설치 동작과 카톡 자체 미리보기는 실제 기기에서 확인합니다.

```sh
npm run build && npm run verify
npm run live:test && npm run live:build
npm run live:verify -- https://cockcockcock.pages.dev
```

마지막 명령은 운영 HTML, 정적 파일 해시, API 접근과 홈 화면 앱 주소를 검사합니다. 운영 화면에서 복사한 공유 주소를 `CLUB_VOTE_PATH`, `CLUB_NOTICE_PATH`에 지정하면 미리보기 경로와 실제 이미지 크기도 확인합니다. GitHub Actions는 가상 체험을 배포하고 실사용 Worker 빌드도 확인합니다. 실사용 Worker 공개는 별도 배포에서 이루어집니다.

최초 공개 URL에서는 회원 세션 없이 공지·투표 내용이 내려오지 않는지, 카톡 미리보기에는 모임명과 공유 유형만 보이는지 확인합니다. 가상 회원으로 투표하고 같은 모임의 운영진 화면에 반영되는지 확인합니다. 실제 초대 전에는 휴대전화에서 홈 화면 아이콘으로 운영진 페이지를 열고 로그인 유지도 점검합니다.

[Wrangler 로그인](https://developers.cloudflare.com/workers/wrangler/commands/general/) · [D1 마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/) · [Workers Secret 관리](https://developers.cloudflare.com/workers/configuration/secrets/)

## 실사용 주소 배포

주소를 제공하는 Pages 프로젝트는 [pages/wrangler.jsonc](pages/wrangler.jsonc)에서 기존 Worker 서비스를 연결합니다. 운영 DB와 인증 비밀은 Worker 설정에서 관리합니다. 저장소 루트에서 게이트웨이를 변경했을 때 다음 명령으로 배포합니다.

```sh
npx wrangler pages deploy --cwd pages --project-name cockcockcock --branch main
```

이전 `workers.dev` 주소의 페이지 링크를 새 주소로 연결할 때는 운영 Wrangler 설정의 `vars`에 실제 이전 주소를 `CLUB_LEGACY_ORIGIN`, 새 Pages 주소를 `CLUB_PUBLIC_ORIGIN`으로 지정합니다. 기존 링크의 경로와 쿼리는 유지됩니다. 로그인 쿠키는 호스트별로 발급되므로 새 주소에서는 한 번 로그인합니다.
