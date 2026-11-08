# 문장장 스튜디오 · Español

스페인어 B2를 위한 개인 학습 웹앱(PWA). 아이폰 홈 화면에 설치해서 씁니다.

- **오늘**: 간격 반복(SRS) 카드. B1·B2·C1 문장 900개 + 내가 만든 카드
- **연습**: 받아쓰기 · 말하기 · 변형 드릴 · 롤플레이(30편)
- **읽기**: 매주 일요일 새로 올라오는 시사·교양 기사 4편 (원문 링크 + B2로 다시 쓴 본문 + 어휘·표현·퀴즈·작문 과제)
- **쓰기**: 일기/의견문 → Claude 첨삭(내 구독, 복사·붙여넣기) → 다시 쓰기. 틀린 문장은 복습 카드로
- **기록**: 통계, 약점, 문장 찾기, 백업

학습 기록과 일기는 **기기 안에만** 저장되고 이 저장소에는 올라오지 않습니다.

## 구조
```
index.html  app.js  sw.js  manifest.webmanifest
data/es.js            문장·대화 데이터
packs/index.json      주간 팩 목록 (pack_tool.py가 생성)
packs/YYYY-Www.json   주간 팩
tools/pack_tool.py    팩 검증·색인
tools/PACK_SPEC.md    팩 제작 규칙 (주간 자동 작업이 따름)
```

## 로컬 실행
```bash
python3 -m http.server 8765   # → http://localhost:8765
```
