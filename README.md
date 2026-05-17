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
