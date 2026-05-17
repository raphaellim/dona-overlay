# Donation Overlay Server - 분배/합산 개선 버전

## 바뀐 점

1. `admin.html`
   - 도네이터 1명이 여러 크리에이터에게 나눠 후원 가능
   - 크리에이터별 계좌금액 / 투네금액 / 메모 입력
   - 금액이 입력된 크리에이터만 저장
   - 전체 처리값 `후원 / 흡금 / 먹먹마` 공통 적용

2. `summary.html`
   - 크리에이터 합산 표에서 행 클릭 가능
   - 선택한 크리에이터별 도네이터 합산 확인
   - 선택한 크리에이터의 상세 입력 리스트 확인
   - 도네이터 합산도 계좌 / 투네 / 합산 표시

3. `overlay.html`
   - 우측 상단 심플 반투명 디자인
   - 계좌후원 롤링 표시
   - 흡금/먹먹마는 순합계 기준 표시

## 실행

```bash
npm install
npm start
```

## 접속

- 관리자 입력: `/admin.html`
- 합산 확인: `/summary.html`
- 방송컨트롤: `/control.html`
- OBS 화면: `/overlay.html`
- OBS 데모: `/overlay.html?demo=1`

## 기본 관리자 비밀번호

```text
1234
```

Render에서는 환경변수로 변경하세요.

```env
ADMIN_PASSWORD=원하는비밀번호
```

## 주의

이 버전은 SQL 없는 JSON 저장 방식입니다.
Render 무료 서버에서는 재시작/재배포 시 저장 데이터가 초기화될 수 있습니다.
