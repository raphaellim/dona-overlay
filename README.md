# 오버레이3 디자인 패치
현재 V5 서버에 추가하는 패치입니다. 서버 전체 소스가 아닙니다.

## 적용
ZIP을 풀고 public 폴더의 파일 3개를 GitHub 프로젝트 public 폴더에 복사하세요.
overlay3.html / overlay3-alert.js는 추가 파일입니다.
alert-queue.js는 기존 V5와 동일한 대기열 모듈입니다.
Commit → Push → Railway 배포 완료 후 새 주소를 열어주세요.
SQL 변경, 앱 재설치는 필요하지 않습니다.
collection-socket.js / overlay-display.js 및 V5 alert-config, overlay-state API가 기존 서버에 있어야 합니다.

## 주소
디자인 미리보기:
https://dona-overlay-production.up.railway.app/overlay3.html?demo=1&mute=1

실제 방송용:
https://dona-overlay-production.up.railway.app/overlay3.html?station=duugi&token=기존오버레이토큰

기존 overlay.html 주소에서 파일명만 overlay3.html로 바꾸면 됩니다.
OBS/PRISM 브라우저 소스에 사용하세요. 투명 배경이며 기존 위치 설정을 사용합니다.
오버레이3는 기본 폭 336px, 계좌 롤링 34px, ALERT 116px입니다.
ALERT 자리는 비어 있어도 유지되어 아래 패널이 움직이지 않습니다.
계좌를 꺼도 ALERT 자리는 유지됩니다. 방송 종료 시 기존 정책대로 전체가 숨겨집니다.
mute=1은 오버레이3 ALERT 음소거용입니다. 다른 수동 사운드는 기존 설정을 따릅니다.
alerts=0은 오버레이3 자체 후원 ALERT를 끕니다.

## 운영
표시 패널과 통합/선택/슬라이드 모드는 기존 컨트롤 설정을 사용합니다.
공지, 방송인 분배/프리셋, 펀딩, 노래방, 미디어는 기존 데이터와 렌더러를 유지합니다.
계좌 롤링 및 ALERT: 이름 → 아이콘 → 금액, 10만원 별, 30만원 다이아.
이름 효과는 글자 안에만 적용합니다.
ALERT에 메시지/분배 내역은 각각 한 줄로 표시하고 긴 문장은 생략합니다.
같은 후원을 표시하는 별도 donation-alert.html 소스가 있다면 동시에 사용하지 마세요.

내부 알림 모드에서는 자체 투네/계좌 ALERT가 같은 대기열을 사용합니다.
원본 투네 모드에서는 기존 원본 재생 상태 연동이 필요합니다.
원본 종료 자동감지를 새로 구현한 패치가 아닙니다.
재생 상태 미확인일 때 계좌 대기는 기존 정책대로 유지됩니다.
기존 자동 최신 버전 갱신은 collection-socket.js를 재사용합니다.

## 확인 범위
로컬 브라우저에서 예시 ALERT 표시, 계좌 아래 위치, 116px 높이, 스크립트 실행을 확인했습니다.
실제 Railway 배포, 실제 투네 이벤트 및 OBS/PRISM 송출은 이 파일을 배포한 뒤 확인해야 합니다.
