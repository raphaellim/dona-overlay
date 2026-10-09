방송국별 토큰 + 계좌/투네 서버 전송

1. 서버 패치
server-patch/dona-overlay-main 안 파일을 현재 프로젝트에 덮어쓰기.
Supabase SQL Editor에서 sql/station_collection_tokens.sql 실행.
이전 수집 테스트 SQL을 아직 실행하지 않았다면 sql/capture_test.sql도 실행.
Railway 재배포. AUTO_DONATION_TOKEN은 새 수집 API에서 더 이상 사용하지 않습니다.

2. 토큰 발급
https://dona-overlay-production.up.railway.app/collection-test.html?station=duugi
방송국 관리자로 로그인하고 토큰 발급 / 재발급 클릭.
토큰은 발급 직후 한 번만 확인/복사 가능합니다. 브라우저 저장소에 보관하지 않습니다.
재발급하면 기존 토큰 즉시 무효. 은행 앱과 Java 설정 모두 변경 필요.
이 토큰은 duugi 수집 전용입니다. 다른 방송국으로 보내면 401.
DB에는 SHA-256 해시만 저장. 공개하면 안 됩니다.

3. 은행 앱
수집 토큰 칸에 발급한 새 토큰 입력 → 설정 저장 → 대기 내역 재전송.
서버 https://dona-overlay-production.up.railway.app / 방송국 duugi.
APK 재빌드는 필요 없음. 계좌 앱의 AUTO_DONATION_TOKEN 표시는 예전 안내 문구이므로 방송국 전용 토큰을 입력하세요.

4. 투네 Java
동봉한 toonation-java-example 폴더를 사용하거나 기존 프로젝트에 src/Main.java와 ServerSender.java 교체.
프로젝트 폴더 PowerShell에서:
$env:DONATION_SERVER_URL="https://dona-overlay-production.up.railway.app"
$env:DONATION_STATION="duugi"
$env:STATION_COLLECTION_TOKEN=Read-Host "방송국 수집 토큰 붙여넣기"
$env:TOONIE_WIDGET_URL=Read-Host "투네 alertbox 주소 붙여넣기"
mvn compile exec:java

Java는 실제 수신 데이터를 /api/toonie-candidates로 전송. 실패 시 toonie-pending 폴더에 파일 보관, 5초마다 재시도. 서버 재시작이나 Java 재시작 후에도 파일이 남으면 재전송. 전송 대상 도메인/방송국 변경 시 별도 폴더를 사용하므로 다른 방송국으로 기존 데이터가 전송되지 않습니다. 폴더에 후원자/메시지 포함이므로 개인 PC에 보관하세요. 실행 프로젝트 작업폴더를 동일하게 유지하세요.
콘솔 '투네 서버 확인 대기 저장 완료' 후 웹페이지 새로고침.
로컬 미리보기 http://127.0.0.1:8765도 유지.
Java8 호환 소스. Maven 전체 빌드와 실제 Java→Railway 통신은 이 환경에서 검증하지 못했습니다.

5. 중복 수집 방지
Java로 투네를 수집하면 Railway TOONIE_COLLECTOR_ENABLED=0.
Railway 자체 수집을 사용할 때만 1. 두 수집기를 동시에 켜면 같은 후원이 두 번 들어올 수 있습니다.
서버 자체 위젯 수집은 토큰 없이 서버 내부 함수로 대기 저장합니다. 외부 API 인증을 우회하는 공개 경로는 없습니다.
Java 이벤트 ID는 수신마다 만드는 로컬 ID이며 실제 거래 ID가 아닙니다. 재생도 별도 건 표시.
합산/채팅/오버레이 자동등록은 하지 않습니다. 수집 내역은 확인 대기만 저장. 승인 기능은 후속 단계.

검증: Node 문법, 방송국 간 인증 차단, 이전 공용 토큰 거절, 관리자만 발급, 해시 저장, 토큰 교체 후 무효, 내부 수집 저장 검증 통과. 실제 Railway 배포/알림 수신은 사용자가 배포 후 확인 필요.
