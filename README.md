# dona-overlay-main 0606 + 슬롯형 룰렛

기존 0606 최신본의 기능과 디자인을 유지하면서 폴더를 정리하고 슬롯형 룰렛 기능을 추가한 버전입니다.

## 실행
```bash
npm install
npm start
```

## 주요 페이지
- `/station_login.html` 방송국 로그인
- `/station_control.html` 방송 선택/관리
- `/control.html` PC 컨트롤
- `/m_control.html` 모바일 컨트롤
- `/roulette.html` PC 슬롯형 룰렛 관리
- `/m_roulette.html` 모바일 슬롯형 룰렛 관리
- `/overlay.html` 방송 오버레이

## SQL
새 Supabase 프로젝트에는 `sql/schema.sql` 하나만 실행하면 됩니다.
룰렛 설정/결과는 별도 테이블 없이 기존 `settings.data` JSON에 저장됩니다.
