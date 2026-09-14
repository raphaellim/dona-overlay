# V0718.6 용돈 음수 표시/저장 수정

- `/api/allowance/adjust`의 minus 처리에서 0 하한 제한 제거
- 예: 현재 5,000원에서 10,000원 제외 -> -5,000원 저장
- overlay.html은 기존부터 음수일 때 `-`와 음수 색상을 지원하므로 변경 없음
- m_admin.html/admin.html/m_creator.html도 Number/toLocaleString 기반이라 음수 표시 가능
- 0원 초기화 API는 기존과 동일
