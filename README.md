# Donation Overlay - Supabase SQL + 방송 세션 + 정리된 컨트롤 UI

## 이번 수정 포함

### control.html
- 한눈에 보기 좋게 레이아웃 정리
- 현재 방송 / 과거 방송 리스트 표시
- 방송 리스트는 한 카드 안에서 5개씩 표시
- 이전/다음 페이지 버튼 추가
- 과거 방송 삭제 버튼 추가
  - 현재 방송은 삭제 불가
  - 과거 방송 삭제 시 해당 방송의 후원 데이터도 같이 삭제
- 방송별 초기화 버튼 유지
- 프리셋 카드 섹션을 작게 정리
- 크리에이터 목록 / 기본 설정도 한 화면에서 보기 쉽게 정리

### overlay.html
- 현재 방송 기준 데이터 표시
- 계좌후원만 보이던 문제 보정
- 프리셋 OFF 시 해당 상태 항목 숨김
- 프리셋 ON 상태면 크리에이터별 후원금액 아래 상태 표시

## Supabase SQL

Supabase → SQL Editor에서 `supabase.sql`을 실행하세요.

기존 테이블이 있다면 아래만 추가 실행해도 됩니다.

```sql
alter table broadcasts add column if not exists memo text default '';
alter table broadcasts add column if not exists ended_at timestamptz;
alter table donations add column if not exists broadcast_id uuid references broadcasts(id) on delete set null;
NOTIFY pgrst, 'reload schema';
```

## Render 환경변수

```env
ADMIN_PASSWORD=원하는비밀번호
SUPABASE_URL=https://프로젝트ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service_role 키
```

`SUPABASE_URL`에는 `/rest/v1/`를 붙이지 않습니다.

## 업로드

ZIP 압축을 풀고 내부 파일들을 GitHub 저장소 최상단에 덮어쓴 뒤 커밋하세요.

이후 Render에서:

```text
Manual Deploy → Deploy latest commit
```


## overlay.html 추가 보정

- 계좌후원 롤링은 도네이터 합산이 아니라 저장된 계좌 후원 리스트를 그대로 표시합니다.
  - 같은 도네이터가 여러 번 후원하면 여러 번 올라옵니다.
- 크리에이터 후원금액은 기본으로 항상 표시됩니다.
- 흡연/금연, 먹어/먹지마 같은 상태 항목은 control.html 프리셋 ON/OFF에 따라 표시됩니다.
  - ON: 표시
  - OFF: 숨김


## 추가 수정: 계좌후원 합산 롤링 / 합산 페이지 분리

### overlay.html
- 계좌후원은 같은 도네이터가 여러 번 계좌후원해도 도네이터명 1번만 표시합니다.
- 금액은 해당 도네이터의 계좌후원 합산으로 표시합니다.
- 크리에이터 후원금액은 기본으로 항상 표시합니다.
- 흡연/금연, 먹어/먹지마 같은 옵션값은 control.html 프리셋 ON/OFF 기준으로만 표시합니다.

### summary.html
- 선택 크리에이터 입력 리스트는 최신순 5줄만 표시합니다.
- 전체 입력 리스트는 10줄씩 표시하고 페이지 이동 버튼으로 넘겨볼 수 있습니다.
- 크리에이터별 도네이터 합산 전체보기 링크가 추가되었습니다.
- 전체 입력 리스트 전체보기 링크가 추가되었습니다.

### 추가 페이지
- `/creator_detail.html` : 크리에이터별 도네이터 합산 전체 리스트
- `/donations.html` : 전체 입력 리스트 전체 페이지


## overlay.html 완전 재구성

계좌후원만 보이던 문제 원인:
- 이전 overlay.html에서 크리에이터 이름 3글자 처리 함수가 빠지거나,
- 서버 creators 배열이 비어오면 렌더링이 멈추는 경우가 있었습니다.

이번 버전:
- overlay.html을 완전 재작성했습니다.
- formatCreatorName 함수 포함.
- creators가 비어오면 donations 원본으로 즉시 재합산합니다.
- 계좌후원은 도네이터별 계좌합산으로 표시합니다.
- `/debug_overlay.html`에서 API 응답 확인 가능합니다.


## 운영 편의 추가 수정

### overlay.html
- 후원이 없어도 control.html의 크리에이터 목록 기준으로 `후원(0)`을 기본 표시합니다.
- 옵션값이 새로 들어오면 박스 안에 알림이 잠깐 표시됩니다.
  - 예: `후원자이름 / 흡연+2`
- 계좌후원은 같은 도네이터명을 1번만 표시하고 계좌금액 합산으로 표시합니다.

### admin.html / server.js
- 금액 입력 축약 지원:
  - `20` 입력 → 20,000원
  - `6.6` 입력 → 6,600원
  - `11900` 입력 → 11,900원
- 최근 입력 개별 삭제 지원.


## 후원 0원 크리에이터 기본 표시 수정

- overlay.html은 이제 `/api/summary` 데이터가 비어도 `/api/settings`의 creators 목록을 읽어서 기본 표시합니다.
- 후원이 없으면 `크리에이터 - 후원(0)`으로 표시됩니다.
- `/debug_overlay.html`에서 settings.creators가 정상으로 오는지 확인할 수 있습니다.


## creator_detail.html 상단 집계 추가

- 선택된 크리에이터 기준 상단에 아래 항목을 표시합니다.
  - 전체 후원금액
  - 계좌 합계
  - 투네 합계
  - 도네이터 수
  - 옵션 합계: 흡연/금연, 먹어/먹지마 등 프리셋 ON 항목 기준
- 도네이터 리스트에 순번 컬럼을 추가했습니다.


## donor_detail.html 추가

- `/donor_detail.html` 페이지 추가
- 도네이터를 전체 / 계좌만 / 투네만 탭으로 분류해서 확인 가능
- 계좌만 선택 시 계좌 후원 있는 도네이터만 표시
- 투네만 선택 시 투네 후원 있는 도네이터만 표시
- 상단에 도네이터 수, 계좌 총합, 투네 총합, 전체 합산 표시
- 도네이터 검색 가능
- 정렬 가능: 자동, 전체합계, 계좌, 투네, 이름순
- 도네이터 클릭 시 선택한 분류 기준의 상세 입력 리스트 표시


## overlay.html 3박스 분리

- overlay를 계좌박스 / 공지박스 / 크리에이터박스 3개로 분리했습니다.
- control.html에서 노출 박스를 선택할 수 있습니다.
  - 계좌박스
  - 공지박스
  - 크리에이터박스
- 공지박스는 공지문구가 있고, 공지박스 ON일 때만 표시됩니다.
- 계좌후원만 표시하거나, 전체 박스를 모두 표시하는 방식으로 운영할 수 있습니다.


## control.html 오버레이 박스 선택 기능

control.html 기본 설정 영역에 아래 체크박스가 추가되었습니다.

- 계좌박스
- 공지박스
- 크리에이터박스

체크한 항목만 overlay.html에 표시됩니다.
공지박스는 공지문구가 있고, 공지박스가 ON일 때만 표시됩니다.


## control.html 오버레이 박스 체크 중복/저장 수정

- 중복으로 보이던 오버레이 체크 영역을 제거했습니다.
- 계좌박스 / 공지박스 / 크리에이터박스 체크 영역은 1개만 표시됩니다.
- 저장 후에도 overlaySections 값이 유지되도록 server.js 저장 로직을 보강했습니다.


## overlaySections 저장 오류 수정

- 공지박스 체크 후 저장하면 다시 OFF로 돌아가던 문제 수정.
- server.js의 /api/settings 저장 로직을 교체하여 overlaySections가 Supabase settings.data에 저장됩니다.
- control.html의 중복 체크박스를 제거하고 1개 영역만 유지했습니다.
- `/debug_settings.html`에서 현재 저장된 overlaySections 값을 확인할 수 있습니다.


## overlay 적용/알림/효과음 수정

- overlay.html이 settings.overlaySections를 직접 읽어서 계좌/공지/크리에이터 박스를 표시합니다.
- /debug_overlay.html 에서 settingsOverlaySections와 summaryOverlaySections를 확인할 수 있습니다.
- alert.mp3 효과음 재생 코드가 추가되었습니다.
  - 파일 위치: public/sounds/alert.mp3
  - 이 ZIP에는 음원 파일은 포함하지 않았습니다. 직접 alert.mp3를 넣어주세요.
- 알림 박스 디자인을 더 화려하고 시인성 좋게 변경했습니다.
