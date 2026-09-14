# ALERT 자동 종료 중간 멈춤 수정 V0718.1

## 증상
- 후원 ALERT가 나타난 뒤 축소되다가 중간 크기로 화면에 남음
- 오버레이 또는 후원창을 껐다 켜면 사라짐
- 해당 후원 내역을 삭제하면 사라짐

## 원인
`ensureAlertIndependent()`가 ALERT 표시 중 `opacity: 1`, `visibility: visible`,
`transform: scale(1)`을 인라인 스타일로 고정했지만, 종료 시에는 `show` 클래스만
제거했습니다. 따라서 CSS 종료 상태보다 인라인 스타일이 우선되어 축소 중간 모습이
남을 수 있었습니다.

## 수정
- 위치 보정 함수에서 시각 상태 인라인 고정 제거
- ALERT 시작 전 이전 인라인 상태 초기화
- ALERT 종료 시 `show` 제거와 동시에 시각 상태 초기화
- 300ms 뒤 `hidden` 클래스 적용 및 HTML 내용 삭제
- 다음 대기 ALERT 자동 실행 유지
- `overlay.html`, `overlay_shorts.html`, `overlay_luxury_api.html` 동일 적용

## 서버 변경
없음. 오버레이 HTML 파일만 교체합니다.
