YouTube 후원채팅 전체 패치 V5 (0928 원본 기준)

교체/추가 파일
- server.js
- youtube-chat.js
- public/donation_chat_remote.html

주요 기능
1. 기존 운영용 YouTube OAuth(YOUTUBE_SERVICE_*) 그대로 사용
2. 후원채팅 리모컨에서 '+ YouTube 전송 계정 연결'로 OAuth 재연결 가능
3. OAuth 완료 후 donation_chat_remote.html로 자동 복귀
4. access token 만료 시 refresh token으로 자동 갱신하고 새 access token을 DB에 저장
5. refresh token까지 취소/만료된 계정은 '재연결 필요'로 표시
6. 방송 연결 확인 버튼 제공
7. 후원 저장 시 자동채팅: 후원내역/누적현황 개별 ON/OFF
8. 프리셋 후원은 {프리셋} 치환값으로 표시
9. 수동 현황 전송: 누적후원 / 프리셋 / 용돈 중 원하는 항목 선택
10. 선택 현황 주기 자동전송(리모컨 페이지가 열려 있을 때)

Render 운영용 OAuth 환경변수
YOUTUBE_SERVICE_CLIENT_ID
YOUTUBE_SERVICE_CLIENT_SECRET
YOUTUBE_SERVICE_REDIRECT_URI
YOUTUBE_SERVICE_CHAT_ENCRYPTION_KEY

Google OAuth 웹 클라이언트의 승인된 리디렉션 URI는
YOUTUBE_SERVICE_REDIRECT_URI 값과 정확히 같아야 합니다.
일반적으로 이 프로젝트의 콜백 경로는:
https://<Render도메인>/api/youtube-chat-service/callback

사용
/donation_chat_remote.html?station=<방송국슬러그>
