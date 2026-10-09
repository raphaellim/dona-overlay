계좌·투네 수집 테스트 패치 (업로드한 dona-overlay-main1009.zip 기준)

먼저 public/collection-test-preview.html을 브라우저로 열면 예시 화면을 볼 수 있습니다. 예시는 실제 후원이 아닙니다.

설치:
1. ZIP 안 dona-overlay-main의 파일을 현재 서버 프로젝트에 덮어씁니다.
2. Supabase SQL Editor에서 sql/capture_test.sql 실행.
3. Railway 변수 AUTO_DONATION_TOKEN을 휴대폰 앱 값과 동일하게 설정.
4. Railway 변수 TOONIE_COLLECTOR_ENABLED=1 설정. Dockerfile 빌드로 배포하면 Chromium을 설치합니다.
5. 배포 후 관리자 로그인하고 https://dona-overlay-production.up.railway.app/collection-test.html?station=duugi 접속.
6. 투네 alertbox 주소 저장. connected 상태에서 새 후원 또는 재생을 보내 확인합니다. 테스트 문구가 들어간 것은 제외.
7. 휴대폰 앱 서버 https://dona-overlay-production.up.railway.app / station duugi / 은행 선택 / 알림 접근 허용 / 수집 활성화 후 새 입금 알림 확인.

테스트 페이지는 별도 donation_capture_candidates 테이블에만 저장합니다. 후원 합산·채팅·오버레이 등록은 하지 않습니다. 승인 기능은 다음 단계입니다. 기존 /api/auto-donations/:source의 직접 자동등록은 409로 차단했습니다. 수동 등록 기능은 기존대로 동작합니다.
삭제는 대기 목록에서 숨기는 처리입니다. 서버 DB 기록은 남습니다.
칭호와 후원자 이름을 따로 저장하고 함께 표시합니다. 은행 알림 원문·계좌번호·잔액은 서버로 보내지 않습니다.
투네 eventId는 수신마다 생성한 로컬 ID이며 실제 거래 ID가 아닙니다. 재생은 별도 건으로 들어오고 표시됩니다. 같은 후원 재생의 중복 판단은 사람이 해야 합니다.
수신 시각은 서버가 위젯 프레임을 받은 시각입니다. 과거 후원 일시가 아닙니다.
연결 상태는 위젯 웹소켓 생성/종료 기준이며 실제 저장 성공 여부는 목록으로 확인하세요. 데이터 형식이 변경되면 파서 보완이 필요합니다. 저장 실패건은 프로세스 메모리에서 재시도하므로 서버 재시작이나 연결 재생성 때 소실될 수 있습니다.
은행 앱 상태는 별도 heartbeat가 없으므로 마지막 수집 내역으로 확인합니다. 페이지는 최신 대기 100건씩 표시합니다.
Node 문법 및 후원자/칭호/100원/익명/테스트 제외/토큰/관리자 권한/대기 저장 검증 통과. Railway 배포 및 실알림 수신, 화면 실기기 검증은 아직 수행하지 않았습니다.
