# 콕콕콕! 배드민턴 모임 관리

[썬콕19 실사용 주소](https://cockcockcock.pages.dev/) · [홈 화면에 추가할 운영 주소](https://cockcockcock.pages.dev/clubs/suncok19/admin/)

[모임 목록](https://koungsday.github.io/cockn-cock/) · [썬콕19 회원 체험](https://koungsday.github.io/cockn-cock/clubs/suncok19/) · [운영 화면 체험](https://koungsday.github.io/cockn-cock/clubs/suncok19/admin/) · [투표 링크 예시](https://koungsday.github.io/cockn-cock/clubs/suncok19/share/vote/e-nov28/) · [공지 링크 예시](https://koungsday.github.io/cockn-cock/clubs/suncok19/share/notice/n-schedule/) · [실사용 운영 환경](OPERATIONS.md)

콕콕콕!은 배드민턴 모임을 운영하는 서비스입니다. 첫 등록 모임인 썬콕19의 일요 운동을 준비하고, 웹 참석 응답을 당일 출석과 모임 마무리에 활용할 수 있습니다. 공개 데모는 가상 데이터를 사용합니다. `index.html`을 브라우저에서 열어도 체험할 수 있습니다.

- 카카오톡에는 회차별 링크를 올립니다. 회원은 이름과 생년월일 또는 설정한 PIN으로 로그인해 공지를 열고 선발·후발·불참과 점심 여부를 선택합니다.
- 운영진은 들어온 응답을 바로 확인합니다. 당일 실제 출석과 줄서기 출석 인정, 게스트 상태, 콕과 코트 찬조를 기록합니다.
- 운영 화면에서 마무리 문구를 만들어 카카오톡에 복사할 수 있습니다. 반기별 인정 집계에서는 각 구간 횟수와 콕 수령 여부를 확인합니다.
- 실사용 공유 카드에는 모임 이름과 공유 유형을 담습니다. 공지와 투표 내용은 로그인한 회원에게 표시됩니다. 같은 로그인 화면에서 운영 계정으로 접속하면 운영 화면이 열리며, 로그인은 자동으로 최대 30일 유지됩니다.

데모의 변경사항은 브라우저에 저장됩니다. 실사용 앱은 Cloudflare Workers가 모임별 투표와 로그인을 처리하고, 해당 모임의 전용 D1에 저장합니다. 이전 PostgreSQL 검토안은 `database/`에 있고 현재 실사용 코드의 데이터베이스는 아닙니다.

```sh
npm run build
npm run verify
```
