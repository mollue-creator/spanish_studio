# 주간 시사 팩 제작 규칙 (자동 작업용)

매주 일요일, 이 규칙대로 `packs/YYYY-Www.json`을 하나 만들고 검증해서 올린다.

## 1. 기사 고르기
- 지난 7일 안에 나온 **스페인어 원문 기사 4편**. 아래 RSS에서 고른다(사이트 본문 접근이 막히면 RSS 제목·요약과 curl로 받은 HTML의 `<p>`를 쓴다).
  - BBC Mundo: `https://feeds.bbci.co.uk/mundo/rss.xml`
  - El País 과학: `https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada`
  - El País 국제/문화/사회: 같은 형식으로 `section/internacional`, `section/cultura`, `section/sociedad`
- **시사·교양** 중심. 주제가 겹치지 않게: 사회·문화 / 환경·과학 / 역사·정치 / 여행·문화·생활 / 경제·기술 / 중남미 중에서 4개.
- 피할 것: 단순 사건사고, 스포츠 결과, 선정적 범죄, 하루 만에 낡는 속보.
- 같은 주제로 이전 팩과 겹치지 않게 `packs/index.json`과 직전 팩을 확인.

## 2. 본문 쓰기 (가장 중요)
- 원문을 **복사하지 말고** 사실만 가져와 **B2 수준으로 새로 쓴다**. 문장 단위 번역·인용 나열 금지. 직접 인용은 기사당 1개, 한 문장 이내.
- 5문단, 260~330단어. 원문에 없는 사실 추가 금지. 숫자·이름·날짜는 원문과 대조.
- 마지막 문단은 생각할 거리를 던지는 질문이나 관점 하나 (사실과 의견을 섞지 말 것).
- B2 문법이 자연스럽게 들어가게: 접속법(현재·과거), si 가정문, 조건법, 수동/무인칭 se, 연결어(sin embargo, por su parte, además, en cambio).

## 3. 부속 자료
- `glossary` 8~10개: B2 학습자가 모를 법한 단어. **`w`는 본문에 나온 형태 그대로**(검증기가 확인함), `ko`에 원형·뜻.
- `expressions` 5개: 일상·작문에 바로 쓸 수 있는 완전한 문장(본문 표현을 응용), `note`에 문법 포인트.
- `questions` 4개: 보기 4개, 내용이해 3 + 추론 1. **정답 위치를 섞을 것.** `explain`에 근거 문장.
- `discuss` 3개: es + ko.
- `writing`: DELE B2 작문형 과제(의견·논증), `words` "150–180", `use`에 써볼 표현 3개.
- `summary_ko`: 한국어 4~5문장 요약. `title_ko`: 한국어 제목.

## 4. 파일 형식
`packs/2026-W45.json`을 그대로 본뜬다. 필드 이름·구조를 바꾸지 말 것.
- 팩 `id` = ISO 주차 (`date +%G-W%V`), 파일명 = id + `.json`
- 기사 `id` = 팩id-1 … 팩id-4
- 팩 `title` 예: "11월 둘째 주 시사 팩", `intro`: 네 기사를 한 줄로.

## 5. 검증과 배포
```bash
python3 tools/pack_tool.py index      # 실패하면 고쳐서 통과할 때까지 반복
git add packs && git commit -m "주간 시사 팩 YYYY-Www" && git push
```
검증을 통과하지 못하면 절대 push하지 않는다.
