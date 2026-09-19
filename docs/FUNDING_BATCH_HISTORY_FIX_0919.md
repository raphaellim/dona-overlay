# 펀딩 후원입력 내역 누락 수정 (0919)

증상
- 후원입력의 처리방식에서 펀딩을 선택하면 펀딩 현재값은 증가하지만 펀딩 합산/내역에는 보이지 않음.

원인
- `/api/donations/batch`가 `fundingId`를 이용해 펀딩 현재값만 올리고,
  실제 donations 행의 checks.meta에는 `manualKind=funding`, `fundingId`를 기록하지 않았음.

수정
- 후원입력 + 펀딩 선택 시 모든 분배 행에 펀딩 메타데이터 저장.
- 동일 입력건에 공통 `fundingBatchId` 저장.
- summary.html에서는 같은 `fundingBatchId`를 1건으로 다시 묶어 표시.
- 현재 펀딩 제목도 `fundingTitle`로 저장하여 추후 펀딩 항목이 삭제돼도 제목 보존.
- ALERT는 기존처럼 정상 표시. silentAlert로 변경하지 않음.

주의
- 패치 이전에 이미 저장되어 펀딩 메타가 없는 일반 후원행은 어떤 펀딩이었는지 DB만으로 식별할 수 없어 자동 복구되지 않음.
