# 콕앤콕 운영 환경

## 현재 배포

- 코드는 [콕앤콕 공개 저장소](https://github.com/koungsday/cockn-cock)에 있습니다. `main`에 올리면 GitHub Actions가 `dist/`를 검증하고 GitHub Pages에 배포합니다.
- 주소는 [콕앤콕 데모](https://koungsday.github.io/cockn-cock/)입니다. 배포에는 별도 도메인이나 Vercel 프로젝트가 필요하지 않습니다.
- [참석 투표 링크](https://koungsday.github.io/cockn-cock/share/vote/e-nov28/)와 [공지 링크](https://koungsday.github.io/cockn-cock/share/notice/n-schedule/)에는 각각의 제목, 설명, 1200×630 이미지가 최초 HTML에 들어갑니다. 두 페이지는 가상 예시입니다. 초안에서 직접 추가하거나 수정한 데이터는 브라우저에 저장됩니다.
- 배포 산출물은 명시한 웹 파일과 이미지로 구성합니다. DB 마이그레이션과 검증 코드는 GitHub 저장소에 있으며 웹 배포에는 포함되지 않습니다.

[GitHub Pages 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) · [카카오 링크 미리보기 안내](https://developers.kakao.com/docs/ko/message-template/common#scrap-message)

## 실사용 환경 제안

**개인용 Vercel Hobby 팀 + 콕앤콕 전용 Supabase Free PostgreSQL(서울)**을 우선으로 봅니다. 저장소는 지금 만든 것을 쓰고, 실사용 서버는 기본 `vercel.app` 주소로 열면 됩니다. 기존 Vercel Pro 팀에는 업무용 프로젝트가 있고 사용량도 팀 단위로 합산되므로, 서비스 설정과 청구 범위를 함께 분리하려면 별도 Hobby 팀이 필요합니다. 모임 운영진과 회원은 서비스 안의 권한으로 관리합니다.

Supabase Free는 사용 빈도가 낮으면 7일 동안의 활동을 기준으로 일시 중지될 수 있습니다. 첫 실사용 전에 모임 환경에서 DB 연결과 재개 절차를 확인하세요. 기존 업무용 연결 문자열을 재사용할 이유는 없습니다.

[팀 생성과 요금제 선택](https://vercel.com/docs/accounts#creating-a-team) · [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Vercel Pro 사용량](https://vercel.com/docs/plans/pro-plan) · [Supabase 지역](https://supabase.com/docs/guides/platform/regions) · [Supabase Free 일시 중지](https://supabase.com/docs/guides/platform/free-project-pausing)

### 운영 전에 연결할 것

1. **운영 서버와 DB.** 새 운영 프로젝트에 모임 전용 DB를 연결하고 [초기 마이그레이션](database/001.sql)을 적용합니다. 로컬·미리보기의 테스트 데이터와 실사용 DB를 분리합니다. DB 연결 문자열과 인증 비밀은 새 운영 프로젝트의 서버 환경 변수에 둡니다.
2. **회원 확인.** 운영진이 회원을 등록하고 처음 한 번 본인 계정과 연결합니다. 카카오 로그인을 쓰면 앱 등록과 콜백 설정이 추가됩니다. 운영진은 회원 관리와 출석 확정을 하고, 회원은 자신에게 배정된 회차에서 자기 응답만 한 건 저장하거나 마감 전 갱신할 수 있게 합니다.
3. **공개 링크.** 공지와 투표에는 각각 고정 URL과 카드에 공개할 정보를 둡니다. 로봇도 읽을 수 있도록 서버가 최초 HTML의 `<head>`에 OG 메타데이터를 넣습니다. 회원 명단, 메모, 개인 응답과 집계는 인증을 거친 화면이나 API에서만 반환합니다.
4. **실사용 검증.** 카카오톡에서 두 유형의 링크를 직접 붙여 넣어 카드와 화면 이동을 확인합니다. 서로 다른 회원으로 로그인해 다른 사람 응답에 접근할 수 있는지, 마감 뒤 쓰기가 막히는지, 회원과 운영진의 접근 범위를 확인합니다. 운영 DB에는 점검용 가상 데이터만 넣어 먼저 검사합니다.

초안 배포는 운영 서버와 별개입니다. 이 환경에서 Supabase CLI에 로그인된 접근 권한이 없어서 운영 DB 생성과 연결은 진행되지 않았습니다. [Supabase 로그인 안내](https://supabase.com/docs/reference/cli/supabase-login)

## 재현 가능한 검증

저장소 루트에서 실행합니다.

```sh
npm run build
npm run verify
npm run verify -- https://koungsday.github.io/cockn-cock/

npm --prefix database ci
npm --prefix database test
```

웹 검증은 HTML 첫 응답의 OG 태그, 카드 PNG 크기와 수신 화면 링크를 확인합니다. DB 검증은 로컬 임시 PostgreSQL에서 공개 역할 권한, 회차 명단 제약, 중복 응답과 갱신, 출석 분리를 확인합니다. 호스팅 DB와 카카오톡 앱의 화면은 별도로 확인해야 합니다.
