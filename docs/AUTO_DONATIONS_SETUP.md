# 계좌·투네 자동 후원 등록

## 설치

1. `sql/auto_donations.sql`을 기존 Supabase SQL Editor에서 실행합니다. 이전 자동등록 SQL을 적용했다면 수정된 SQL을 다시 실행합니다.
2. Render 환경변수 `AUTO_DONATION_TOKEN`에 길고 무작위인 비밀값, `TOONIE_COLLECTOR_ENABLED=1`을 설정합니다. 비밀값은 은행 알림 앱에도 입력하지만 방송 화면·URL·채팅에 넣지 않습니다.
3. Render 빌드 명령을 `npm install && npx playwright install chromium`으로 설정한 뒤 배포합니다. Chromium 실행에 필요한 시스템 라이브러리가 없는 환경은 Playwright용 Docker 이미지 등 별도 실행 환경이 필요합니다. 서버 로그에 `Toonie widget connect failed`가 없는지 확인합니다.
4. 방송국의 `creators` 첫 번째 이름이 투네 자동등록 대상입니다. 다른 대상 지정은 현재 수동 수정으로 처리합니다.
5. 방송국 관리자 로그인 후 `station_control.html`의 **투네 자동등록 위젯** 칸에 해당 방송국의 통합 알림 URL을 저장합니다. 수집 상태가 `connected`인지 확인합니다. 주소 삭제 시 수집을 중지합니다.
6. 계좌는 기존 Android 은행 알림 앱을 사용합니다. 입금 알림만 `/api/auto-donations/account`로 보냅니다.

```
POST https://dona-overlay.onrender.com/api/auto-donations/account
X-Auto-Donation-Token: <비밀값>
Content-Type: application/json

{"station":"default","eventId":"bank:20260929:notification-12345","donor":"홍길동","amount":50000,"creator":"떠기","receivedAt":"2026-09-29T13:05:00+09:00"}
```

서버 투네 수집기는 위젯 표시가 바뀔 때 임시 `eventId`를 생성합니다. 원래 거래 ID와 후원 발생 시각은 위젯 화면에서 확인할 수 없으므로, 같은 후원을 나중에 재생하면 새 건으로 들어갈 수 있습니다. 수집 중 과거 후원을 재생하지 마세요.

등록된 건은 기존 후원 내역·합계·오버레이에 바로 반영됩니다. `PUT /api/donations/:id`로 수정하거나 관리자 최근 내역의 삭제 버튼으로 삭제할 수 있습니다. 후원자명 또는 메시지에 `테스트`가 포함되면 자동등록하지 않습니다. 재생된 실제 후원은 테스트 문구가 없으면 등록될 수 있으므로 방송 전 재생 테스트 중에는 브리지를 끄고, 이미 들어온 건은 삭제하세요. 삭제 후에도 그 등록 ID 기록은 남습니다. 위젯에서 나중에 재생하면 새 임시 ID가 생성되므로 다시 등록될 수 있습니다. `auto_donation_events.raw`에는 처음 전달된 이름·금액이 남습니다. 기존 설치도 수정된 `sql/auto_donations.sql`을 다시 실행하세요.

## 실제 연결 전 확인

위젯 문구가 바뀌면 파서 조정이 필요합니다. 브라우저가 실행되지 않거나 서버가 재시작되는 동안 후원은 수집되지 않습니다. 여러 서버 인스턴스를 동시에 실행하면 중복 등록될 수 있으므로 수집 인스턴스는 하나만 운영하세요. 은행 알림 개인정보와 서버 비밀값을 로그에 남기지 마세요. 방송이 시작 상태가 아니면 409를 반환합니다.
