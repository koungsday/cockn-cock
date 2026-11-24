# 썬콕19 운영 환경

## 월 구독료 없이 구성하는 방법

공개 GitHub 저장소와 GitHub Pages는 가상 데이터로 데모를 운영합니다. 회원이 각자 웹에서 투표하고 운영진 화면이 집계하려면 서버 코드와 공동 저장소가 필요합니다. 실사용 앱은 **Cloudflare Workers Free + D1 Free**를 사용합니다. 별도 웹 프레임워크나 도메인 구매 없이 `workers.dev` 주소에서 투표 페이지, 로그인, 관리 화면과 DB를 연결합니다. 기존 업무용 Vercel 팀은 배포 경로에 포함되지 않습니다.

Workers Free는 동적 요청 하루 10만 건과 요청당 CPU 10ms가 포함됩니다. D1 Free는 하루 읽기 500만 행, 쓰기 10만 행과 계정 전체 저장 공간 5GB가 포함됩니다. 무료 한도에 도달하면 해당 작업은 한도 갱신 때까지 오류가 날 수 있습니다. Free 요금제를 유지하고 유료 기능을 활성화하지 않습니다.

Vercel Hobby와 Supabase Free도 후보입니다. 다만 기존 Vercel Pro 팀을 배제하려면 별도 Hobby 팀이 필요하고, Supabase Free는 최근 7일간 활동이 적으면 일시 중지될 수 있습니다. GitHub Pages만으로는 브라우저 간에 응답을 공유할 수 없습니다.

[Workers 요금표](https://developers.cloudflare.com/workers/platform/pricing/) · [D1 요금표](https://developers.cloudflare.com/d1/platform/pricing/) · [Supabase Free 일시 중지 안내](https://supabase.com/docs/guides/platform/free-project-pausing) · [GitHub Pages 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 회원이 하는 일

1. 운영진에게 개인 코드를 받습니다. 첫 로그인에는 회원이 전달받은 개인 코드와 처음 설정한 생년월일 8자리가 필요합니다.
2. 첫 로그인에서 개인 PIN으로 변경합니다. 정확한 생년월일 문자열은 DB에 저장하지 않습니다. 서버는 솔트와 별도 서버 비밀을 이용한 검증값만 저장합니다. PIN을 잊으면 운영진이 임시번호로 바꿔 줄 수 있습니다.
3. 단체방의 회차 링크를 열어 선발·후발·불참 중 하나와 점심 여부를 제출합니다. 마감 전까지 기존 응답을 바꿀 수 있습니다.

생년월일과 개인 코드는 단체방에서 공유하지 않습니다. PIN 변경이나 재설정 시 이전 로그인 세션은 종료됩니다. 로그인 시도에도 횟수 제한을 적용합니다.

## 운영진이 하는 일

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

로컬 로그인에 필요한 `CLUB_ADMIN_PASSWORD`(16자 이상)와 `CLUB_AUTH_PEPPER`(32자 이상 난수)는 `worker/.dev.vars`에 둡니다. 이 파일은 Git에 포함되지 않습니다. 실제 회원 자료는 사용하지 않고 가상 회원으로 점검합니다.

영구 운영 전에는 운영자가 Cloudflare에 로그인하고 **Workers Free**를 확인합니다. `npm run live:build`로 배포 파일을 만든 뒤, 전용 D1을 만들고 반환된 데이터베이스 ID를 관리 중인 Wrangler 설정에 연결합니다. 해당 D1에만 마이그레이션을 적용하고 Worker의 Secret에 위 두 값을 넣습니다. 로컬이나 테스트에 쓰던 값을 운영에 복사하지 않습니다.

```sh
npx wrangler login
npx wrangler d1 create suncok19 --location apac
npx wrangler d1 migrations apply DB --config worker/wrangler.jsonc --remote
npm run live:build
npx wrangler deploy --config worker/wrangler.jsonc
npx wrangler secret put CLUB_ADMIN_PASSWORD --config worker/wrangler.jsonc
npx wrangler secret put CLUB_AUTH_PEPPER --config worker/wrangler.jsonc
```

최초 공개 URL에서는 쿠키 없는 요청으로 OG 태그와 미리보기 이미지를 확인하고, 별도 브라우저에서 회원 투표를 저장해 운영진 화면에 보이는지 확인합니다. 카카오톡 단체방에 실제 회원을 초대하기 전에 회원·운영진 권한, 마감 처리, PIN 변경과 재설정을 각자 점검합니다.

[Wrangler 로그인](https://developers.cloudflare.com/workers/wrangler/commands/general/) · [D1 마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/) · [Workers Secret 관리](https://developers.cloudflare.com/workers/configuration/secrets/)
