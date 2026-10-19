# 티켓오픈 캘린더

NOL 티켓과 멜론티켓의 **콘서트 티켓오픈 예정** 일정을 한 페이지에 모아 보여주고,
새로운 오픈 공지가 올라오면 **핸드폰으로 푸시 알림**(ntfy)을 보내 줍니다.

- 출처
  - NOL 티켓 오픈 예정: https://nol.yanolja.com/ticket/display/upcoming?genre=concert
  - 멜론티켓 티켓오픈소식(콘서트): https://ticket.melon.com/csoon/index.htm
- 이미 오픈된 공연은 숨기고, 오픈 예정인 것만 날짜별로 보여줍니다 (선예매/일반예매 따로 표시).
- 카드의 📅 버튼 → 내 캘린더에 추가 (오픈 10분 전 알림 포함).

## 동작 방식

```
GitHub Actions (30분마다)
  └─ scripts/scrape.mjs
       ├─ NOL API  ┐
       ├─ 멜론 HTML ┴→ public/data/concerts.json (웹앱 데이터)
       ├─ data/state.json 과 비교해 "처음 보는 + 아직 오픈 전" 공연 → ntfy 푸시
       └─ 변경분 커밋
  └─ public/ 을 GitHub Pages 로 배포
```

- 첫 실행은 기존 공연을 "이미 본 것"으로만 기록하고 알림을 보내지 않습니다 (알림 폭탄 방지).
- 한 번에 9건 이상 새로 올라오면 한 개의 요약 알림으로 묶어 보냅니다.
- 한쪽 사이트 수집이 실패해도 이전 데이터를 유지하고, 복구 후 중복 알림을 보내지 않습니다.

## 핸드폰 알림 받기 (가입 필요 없음)

1. [ntfy](https://ntfy.sh) 앱 설치 — [iOS](https://apps.apple.com/app/ntfy/id1625396347) / [Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
2. 앱에서 **+** → 저장소 Secret `NTFY_TOPIC` 에 넣은 토픽 이름 입력 → Subscribe
3. 테스트: GitHub → Actions → *Scrape & deploy* 실행, 또는 로컬에서
   `NTFY_TOPIC=<토픽> npm run scrape -- --test-notify`

> 토픽 이름은 비밀번호처럼 다루세요. 이름을 아는 사람은 누구나 같은 알림을 구독할 수 있습니다.

## 설정

| 이름 | 종류 | 설명 |
| --- | --- | --- |
| `NTFY_TOPIC` | Secret (필수) | 알림을 보낼 ntfy 토픽 |
| `NTFY_TOKEN` | Secret (선택) | 자체/유료 ntfy 서버 접근 토큰 |
| `NTFY_SERVER` | Variable (선택) | 기본 `https://ntfy.sh` |

GitHub Pages 는 *Settings → Pages → Source: GitHub Actions* 로 설정합니다.

## 로컬 실행

```bash
npm test              # 단위 테스트
npm run scrape:dry    # 수집만 해보고 결과 출력 (파일/알림 X)
npm run scrape        # 데이터 갱신 (+ NTFY_TOPIC 있으면 알림)
npm run serve         # http://localhost:5173 에서 웹앱 미리보기
```

외부 의존성 없이 Node 20+ 만 있으면 됩니다.
