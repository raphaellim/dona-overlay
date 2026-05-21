# control creators source fix

핵심 수정:
- 크리에이터 목록은 control.html이 저장한 현재 방송 설정(settings.creators)만 사용합니다.
- settings.data 루트 creators에 예전 이름이 남아 있어도 active broadcast overlay로 흘러가지 않습니다.
- summary/donations에 과거 크리에이터명이 남아 있어도 settings.creators에 없으면 표시하지 않습니다.
- data/db.json 기본 creators도 []로 비웠습니다.
- 재전송/멈춤 claim/lease는 제거하고 기존 수동사운드 반복 대기열 구조로 되돌렸습니다.

중요:
control.html에서 크리에이터 목록을 저장해야 overlay에 표시됩니다.
