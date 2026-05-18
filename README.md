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


## overlay.html 크리에이터 표시 보강

- `/api/summary`에서 creators 배열이 비어오거나 전부 0으로 들어오는 경우,
  overlay가 `donations` 원본 데이터를 기준으로 즉시 크리에이터별 후원금액을 다시 합산해서 표시합니다.
- 계좌후원은 같은 도네이터명을 1번만 표시하고 계좌금액 합산으로 롤링합니다.
- 크리에이터 후원금액은 기본 표시, 옵션값은 control.html 프리셋 ON/OFF 기준으로 표시합니다.
