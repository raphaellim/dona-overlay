후원채팅 V4 패치

교체 파일:
- server.js
- youtube-chat.js
- public/donation_chat_remote.html

접속: /donation_chat_remote.html?station=방송국슬러그

추가 기능:
1. 후원채팅 리모컨에서 YouTube 계정 OAuth 연결 진입
2. 라이브 주소 + 전송계정 저장
3. 수동 현황 전송: 누적후원 / 프리셋 / 용돈을 복수 또는 단독 선택
4. 각 현황은 현재 프로그램에 저장된 방송 데이터를 서버에서 다시 읽어 전송
5. 선택 현황 주기 자동전송(리모컨 페이지가 열려 있는 동안)
6. 기존 후원등록 자동채팅 + 프리셋 치환 유지

주의: YouTube OAuth 환경변수는 기존 서비스용 설정을 그대로 사용합니다.
