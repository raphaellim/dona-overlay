사운드 파일을 이 폴더에 넣으세요.

필수/추천 파일명:

1) 기본 알림
- alert.mp3

2) 계좌후원 금액별
- account_small.mp3  : 1만원 미만 계좌후원
- account_mid.mp3    : 1만원 이상 5만원 미만 계좌후원
- account_big.mp3    : 5만원 이상 10만원 미만 계좌후원
- account_super.mp3  : 10만원 이상 계좌후원

3) 옵션별
- smoke_plus.mp3     : 흡연
- smoke_minus.mp3    : 금연
- food_plus.mp3      : 먹어
- food_minus.mp3     : 먹지마

우선순위:
1. 옵션이 있으면 옵션별 사운드
2. 옵션이 없고 계좌후원이 있으면 계좌금액별 사운드
3. 나머지는 alert.mp3

테스트:
프리즘/브라우저에서 아래처럼 열면 해당 사운드를 테스트할 수 있습니다.
- /overlay.html?station=방송국코드&token=토큰&testSound=accountSmall
- /overlay.html?station=방송국코드&token=토큰&testSound=accountMid
- /overlay.html?station=방송국코드&token=토큰&testSound=accountBig
- /overlay.html?station=방송국코드&token=토큰&testSound=accountSuper
- /overlay.html?station=방송국코드&token=토큰&testSound=smokePlus
- /overlay.html?station=방송국코드&token=토큰&testSound=smokeMinus
- /overlay.html?station=방송국코드&token=토큰&testSound=foodPlus
- /overlay.html?station=방송국코드&token=토큰&testSound=foodMinus
