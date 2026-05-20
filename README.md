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


## 공지박스 표시 수정

- 기존: 공지박스 ON이어도 공지문구가 비어 있으면 공지박스가 숨김 처리되었습니다.
- 수정: 공지박스 ON이면 공지문구가 없어도 공지박스가 표시됩니다.
- 공지문구가 비어 있으면 `공지문구 없음`으로 표시됩니다.


## 공지 타이틀 / 여러 줄 공지 추가

- control.html에 공지 타이틀 입력칸을 추가했습니다.
- 공지문구 입력칸을 input에서 textarea로 변경했습니다.
- overlay.html은 저장된 noticeTitle을 공지박스 타이틀로 표시합니다.
- 공지문구 줄바꿈이 overlay에 그대로 표시됩니다.


## control.html UI/UX 개선 및 방송별 설정 묶음

- control.html을 새 UI로 정리했습니다.
- 공지사항 타이틀 입력칸과 줄바꿈 가능한 공지문구 textarea를 정리했습니다.
- 오버레이 노출 박스가 한쪽으로 밀리던 레이아웃을 수정했습니다.
- 프리셋 삭제 버튼을 추가했습니다.
- 현재 활성 방송마다 공지, 프리셋, 크리에이터, 오버레이 표시 설정을 별도로 저장합니다.
- 새 방송 시작 시 현재 설정값을 새 방송 설정으로 복사합니다.


## 공지 줄바꿈 / 공지 색상 / Alert 디자인 수정

- overlay.html에서 공지문구 줄바꿈을 줄별 span으로 렌더링하도록 수정했습니다.
- control.html에서 공지문구 1~5줄 색상을 각각 선택할 수 있습니다.
- server.js에 noticeColors 저장 필드를 추가했습니다.
- Alert 디자인을 촌스러운 그라데이션에서 어두운 네온 카드형으로 변경했습니다.
- Alert에서 후원자 이름을 가장 크게 강조하도록 변경했습니다.


## 프리즘 계좌후원 롤링 위치 누적 보정

- 기존: JS에서 고정 px(itemHeight)로 translateY 이동.
- 문제: 프리즘에서 위젯 크기 조정 시 실제 아이템 높이와 이동값이 달라져 롤링될수록 위로 밀림.
- 수정: 각 roller-item의 offsetTop을 직접 읽어서 translate3d 이동.
- 결과: 1번째/2번째/3번째 롤링 모두 같은 기준 위치에 고정됩니다.


## 방송별 보안 기능 추가

### 관리자 페이지
- `/admin.html`, `/control.html`은 관리자 로그인 후 접근합니다.
- 관리자 로그인 페이지: `/admin_login.html`

### 시청 페이지
- `/summary.html`, `/donor_detail.html`, `/creator_detail.html`, `/donations.html`은 방송 시청 비밀번호가 설정되어 있으면 로그인 후 접근합니다.
- 시청 로그인 페이지: `/viewer_login.html`

### 오버레이
- control.html의 `방송 보안`에서 오버레이 토큰을 생성할 수 있습니다.
- 프리즘/OBS에는 `/overlay.html?token=토큰값` 주소를 넣으세요.
- 토큰이 설정되어 있는데 token 없이 접속하면 차단됩니다.

### 방송별 설정
- 시청 비밀번호와 오버레이 토큰은 현재 활성 방송 설정에 저장됩니다.
- 비밀번호와 토큰을 비워두면 기존처럼 공개 상태로 동작합니다.


# 멀티 방송국 관리 버전

## 구조

- 최고관리자: `/master.html`
  - 방송국 생성/관리
  - 방송국 관리자 비밀번호 부여
  - 방송국별 오버레이 토큰 발급/복사

- 방송국 관리자: `/station_login.html`
  - 방송국 코드 + 방송국 관리자 비밀번호로 로그인
  - `/station_control.html?station=방송국코드`에서 여러 방송 생성/선택/삭제

- 방송별 운영
  - 방송 생성 시 방송 비밀번호 입력 가능
  - 방송이 바뀌면 `/station_control.html`에서 해당 방송 비밀번호를 입력
  - 이후 `/admin.html?station=방송국코드`, `/control.html?station=방송국코드` 사용 가능

- 오버레이
  - 방송국별 토큰 고정 방식
  - 프리즘/OBS 주소:
    `/overlay.html?station=방송국코드&token=방송국토큰`
  - 방송이 바뀌어도 오버레이 주소는 그대로 사용합니다.

## 적용 순서

1. Supabase SQL Editor에서 `supabase_multistation.sql` 실행
2. ZIP 전체를 GitHub에 덮어쓰기
3. Commit
4. Render 재배포
5. `/admin_login.html?next=/master.html` 접속
6. 최고관리자 PW 입력
7. `/master.html`에서 방송국 생성
8. 방송국 관리자에게 `/station_login.html?station=방송국코드` 전달

## 권한 정리

- 최고관리자 PW: Render 환경변수 `ADMIN_PASSWORD`
- 방송국 관리자 PW: 방송국 생성 시 설정
- 방송 비밀번호: 방송 생성 시 설정
- 오버레이 토큰: 방송국별 고정 토큰


## 계좌후원 금액별 / 옵션별 사운드 추가

`public/sounds/` 폴더에 사운드 파일을 넣으면 `overlay.html` 알림 발생 시 자동으로 다른 사운드가 재생됩니다.

### 파일명

- `alert.mp3` : 기본 알림
- `account_small.mp3` : 1만원 미만 계좌후원
- `account_mid.mp3` : 1만원 이상 5만원 미만 계좌후원
- `account_big.mp3` : 5만원 이상 10만원 미만 계좌후원
- `account_super.mp3` : 10만원 이상 계좌후원
- `smoke_plus.mp3` : 흡연
- `smoke_minus.mp3` : 금연
- `food_plus.mp3` : 먹어
- `food_minus.mp3` : 먹지마

### 우선순위

1. 옵션이 있으면 옵션별 사운드
2. 옵션이 없고 계좌후원이 있으면 계좌금액별 사운드
3. 그 외에는 기본 `alert.mp3`

### 테스트 URL

`testSound` 파라미터로 사운드를 테스트할 수 있습니다.

예:
`/overlay.html?station=default&token=토큰&testSound=smokePlus`


## overlay.html 토큰 필수 수정

- 기존에는 같은 브라우저가 방송국 관리자/최고관리자로 로그인된 상태면 `/overlay.html?station=...` 주소도 보일 수 있었습니다.
- 수정 후 `/overlay.html`, `/overlay2.html`은 관리자 로그인 여부와 상관없이 방송국 overlay token이 있어야만 표시됩니다.
- 올바른 주소 예:
  `/overlay.html?station=duugi&token=방송국토큰`
- 토큰 없이 접근하면 `오버레이 토큰이 필요합니다.`로 차단됩니다.


## 단순화된 사운드 구조

- 기본 사운드: control.html에서 파일명 1개 설정
- 프리셋 사운드: 각 프리셋 카드에서 파일명 설정
- 금액 구간 사운드: control.html에서 구간명/최소원/최대원/파일명 설정
- admin.html: 기본/금액구간/프리셋은 자동 표시 및 자동 재생, 필요할 때만 수동 사운드 검색 선택
- overlay.html 재생 우선순위: 수동 사운드 > 프리셋 사운드 > 금액구간 사운드 > 기본 사운드

기존 DB에는 `supabase_sound_simple_update.sql`을 1회 실행하세요.


## 수동 사운드 독립 재생 구조

수동 사운드는 이제 후원 입력 저장과 완전히 별개로 동작합니다.

### admin.html
- 수동 사운드 검색에서 `9900`, `윈도우`, `대박`처럼 검색
- 검색 결과 클릭
- `오버레이 재생` 버튼 클릭
- 후원 데이터 저장 없이 overlay에 alert와 사운드만 전송됩니다.

### 자동 사운드
후원 입력 저장 시에는 기존 자동 규칙이 적용됩니다.

우선순위:
1. 프리셋 사운드
2. 금액구간 사운드
3. 기본 사운드

### DB 추가 SQL
기존 DB에는 `supabase_sound_events_update.sql`을 1회 실행하세요.


## admin.html 레이아웃 / overlay API 권한 수정

- admin.html을 새 레이아웃으로 정리했습니다.
- 도네이터/금액/크리에이터 분배는 한 카드에 붙여 배치했습니다.
- 수동 사운드 재생 카드는 최근 입력 위로 이동했습니다.
- 수동 사운드는 후원 저장과 별개로 오버레이 재생 버튼으로만 동작합니다.
- overlay.html이 토큰으로 열렸을 때 `/api/summary`, `/api/settings`, `/api/sound-events`를 조회할 수 있도록 server.js API 권한을 수정했습니다.


## overlay 데이터 미표시 / cacheSoundRules 오류 / 분배 계산 수정

- overlay.html의 `cacheSoundRules is not defined` 오류를 수정했습니다.
- 사운드 파일은 페이지 로딩 때 전체 요청하지 않고, 실제 Alert 재생 시점에만 요청하도록 변경했습니다.
- `/sounds/*.mp3 404`는 해당 mp3 파일이 GitHub `public/sounds/`에 없다는 뜻입니다. 파일을 업로드하거나 control.html에서 해당 파일명을 비워두세요.
- admin.html 크리에이터 분배의 전액 버튼 계산을 수정했습니다. 입력칸은 천원단위이므로 66,000원은 66으로 채워집니다.


## Alert 중앙 표시 / 음악 재생 중 유지

- overlay alert를 전체 화면 중앙에 표시하도록 변경했습니다.
- 사운드가 재생되는 동안 alert가 유지됩니다.
- 사운드가 끝나면 alert가 사라집니다.
- 사운드가 없거나 재생 실패 시에는 기본 시간 후 사라집니다.
- 너무 짧은 효과음도 최소 2.6초는 표시됩니다.
- 긴 음악은 최대 20초 안전장치 후 사라집니다.


## Alert 미표시 수정

- alertShowing 변수가 누락되어 Alert 큐가 실행될 때 중단되던 문제를 수정했습니다.
- Alert는 전체 화면 중앙에 표시됩니다.
- 사운드 재생 중에는 Alert가 유지됩니다.
- 긴 음악은 최대 1분까지 유지됩니다.
- 수동 사운드 이벤트는 overlay가 열린 이후 발생한 이벤트만 재생합니다.


## 수동 사운드 대기열

- admin.html에서 수동 사운드를 여러 번 추가하면 대기열에 표시됩니다.
- overlay.html은 대기열에서 1개씩 가져와 순서대로 재생합니다.
- 재생이 끝난 항목은 `played_at` 처리되어 admin.html 대기열에서 자동으로 사라집니다.
- admin.html에서 대기 중인 항목은 취소할 수 있습니다.
- 기존 DB에는 `supabase_sound_queue_update.sql`을 1회 실행하세요.


## 수동 사운드 바로 출력 / 대기열 대기 선택

admin.html 수동 사운드 영역에 재생 방식을 추가했습니다.

- 바로 출력: 선택 실행 즉시 overlay 대기열로 들어가 재생됩니다.
- 대기열 대기: admin 대기열에만 쌓이고 overlay에는 아직 전송되지 않습니다.
- 대기열 전송: 대기 중인 항목을 pending으로 바꾸어 overlay에서 순차 재생합니다.
- overlay Alert 문구는 2줄입니다:
  1줄: 후원자명
  2줄: 재생 파일명에서 확장자를 제외한 이름

기존 DB에는 `supabase_sound_queue_mode_update.sql`을 1회 실행하세요.


## overlay 새로고침 시 오래된 수동 사운드 재생 방지

- overlay가 열린 시점을 기준으로 그 이후 `released_at` 된 수동 사운드만 재생합니다.
- 새로고침해도 기존 pending 항목을 전부 다시 순차 재생하지 않습니다.
- `대기열 대기` 항목은 `대기열 전송`을 누른 시점에 released_at이 찍히고 그 이후 overlay에서 순차 재생됩니다.
- 기존 DB에는 `supabase_sound_queue_sync_update.sql`을 1회 실행하세요.


## 수동 사운드 중복 재생 / Alert 문구 수정

- overlay polling 중 같은 sound_events 항목이 중복 큐에 들어가던 문제를 수정했습니다.
- overlay가 이벤트를 가져온 즉시 claimed 처리하고 DB도 played 처리합니다.
- 같은 노래를 3번 넣으면 정확히 3번만 재생됩니다.
- 수동 사운드 Alert 문구를 변경했습니다:
  1줄: admin.html의 `Alert 표시 제목`
  2줄: 재생 파일명에서 확장자를 제외한 이름
- 기존 DB에는 `supabase_sound_queue_duplicate_alert_title_update.sql`을 1회 실행하세요.


## 대기열 1개씩 삭제 / admin 토스트 복구

- overlay가 수동 사운드 대기열을 한꺼번에 claimed/played 처리하지 않도록 수정했습니다.
- 현재 alert가 재생 중이면 다음 대기열 항목을 아직 가져오지 않습니다.
- admin 대기열에서는 실제 재생 시작된 항목만 1개씩 사라집니다.
- admin.html의 자동 사라지는 토스트 Alert를 다시 적용했습니다.


## 수동 사운드 반복 횟수 / 카운트 표시

- admin.html 수동 사운드에 `반복 횟수` 입력을 추가했습니다.
- 같은 사운드를 여러 번 누르지 않고 10회 같은 식으로 등록할 수 있습니다.
- admin 대기열에서는 `윈도우 × 10`처럼 남은 횟수를 표시합니다.
- 재생이 시작될 때마다 `× 9`, `× 8`처럼 카운트가 깎입니다.
- overlay Alert에는 `1/10`, `2/10`처럼 현재 회차가 표시됩니다.
- 기존 DB에는 `supabase_sound_repeat_count_update.sql`을 1회 실행하세요.


## 후원 Alert 출처/이동 문구 수정

후원 Alert가 아래 형식으로 표시됩니다.

- `(계좌) 후원자 → 크리에이터`
- `(투네) 후원자 → 크리에이터`
- `(계좌+투네) 후원자 → 크리에이터`

옵션 결과는 아래 줄에 표시됩니다.
