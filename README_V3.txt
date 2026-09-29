후원 자동채팅 V3 패치

교체:
- server.js
- youtube-chat.js

추가:
- public/donation_chat_remote.html

기능:
1. 후원 등록 시 자동채팅 (1차 후원내역 / 2차 누적현황 각각 ON/OFF)
2. 프리셋 후원은 {프리셋}으로 자동 표기
3. 별도 후원채팅 리모컨
4. 후원이 없어도 '현재 현황 채팅으로 전송' 버튼 사용 가능
   - 설정된 크리에이터는 0으로 표시
5. 누적현황 5/10/20/30/60분 주기 자동전송
   - 현재 V3의 주기 자동전송은 donation_chat_remote.html 페이지가 열려 있을 때 동작
   - 모바일 절전/브라우저 종료 시 중단됨

주소 예:
/donation_chat_remote.html?station=방송국슬러그

주의:
- YouTube 운영용 OAuth 계정이 기존 방식으로 연결되어 있어야 합니다.
- 라이브 주소와 전송 계정을 후원채팅 리모컨에서 저장하세요.
