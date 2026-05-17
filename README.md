# Donation Overlay - Supabase SQL + 방송 세션 버전

이 버전은 Render 로컬 JSON이 아니라 Supabase PostgreSQL에 저장합니다.
또한 방송마다 데이터를 분리하는 방송 세션 기능이 포함되어 있습니다.

## 핵심 변경점

### 방송 세션
`control.html`에서 방송을 만들고 현재 방송으로 선택할 수 있습니다.

예:
- `0518여행방송`
- `0519여행방송`

현재 방송을 바꾸면:
- `admin.html` 입력은 현재 방송에만 저장
- `summary.html` 합산은 현재 방송 데이터만 표시
- `overlay.html` 오버레이도 현재 방송 데이터만 표시

즉, 새 방송을 만들면 0부터 다시 시작하면서 이전 방송 데이터는 보관됩니다.

## Supabase SQL

Supabase → SQL Editor → New query 에서 `supabase.sql` 내용을 실행하세요.

이미 기존 테이블이 있어도 `alter table ... add column if not exists`가 포함되어 있어 업그레이드 가능합니다.

## Render 환경변수

Render 서비스 → Environment 에 아래 3개를 추가하세요.

```env
ADMIN_PASSWORD=원하는관리자비밀번호
SUPABASE_URL=https://프로젝트ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role secret key
```

주의:
- `SUPABASE_URL`에는 `/rest/v1/`를 붙이지 않습니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 GitHub에 올리면 안 됩니다.
- Render Environment Variables에만 넣으세요.

## GitHub 업로드 구조

ZIP 압축을 풀고 내부 파일들을 GitHub 저장소 최상단에 업로드하세요.

정상 구조:

```text
server.js
package.json
supabase.sql
README.md
public/
data/
```

## 접속 주소

```text
/admin.html     관리자 입력
/control.html   방송컨트롤 / 방송 세션 생성
/summary.html   합산 확인
/overlay.html   OBS 오버레이
/overlay.html?demo=1  데모
```

## 포함 기능

- 계좌금액 / 투네금액 분리 입력
- 크리에이터별 금액 1칸 입력
- 처리 프리셋 설정
- 프리셋 ON/OFF
- OFF 시 admin과 overlay 모두 숨김
- 크리에이터/도네이터 합산
- 우측 상단 OBS 오버레이
- 계좌후원 롤링
- 3글자 기준 센터 고정 디자인
- 방송별 데이터 분리
