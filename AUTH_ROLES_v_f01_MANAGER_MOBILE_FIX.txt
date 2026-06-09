# 폴더 구조

```text
dona-overlay-main/
├─ server.js                 # Express API 서버
├─ package.json
├─ README.md
├─ data/                     # 로컬 JSON fallback 데이터
├─ docs/                     # 작업 메모/구조 문서
├─ sql/
│  └─ schema.sql             # 통합 SQL 1개
└─ public/
   ├─ *.html                 # 기존 URL 호환용 주요 화면
   ├─ common.js              # 공통 API 유틸
   ├─ app.css                # 기존 공통 스타일
   ├─ assets/
   │  ├─ css/                # 신규/분리 CSS
   │  └─ js/                 # 신규/분리 JS
   ├─ sounds/                # 효과음
   ├─ uploads/               # 업로드 이미지/영상
   └─ videos/                # 기본 영상 리소스
```

기존 URL이 깨지지 않도록 HTML 진입 파일은 `public/` 루트에 유지했고, 새 기능 리소스는 `public/assets/` 아래로 분리했습니다.
