#!/usr/bin/env python3
"""주간 시사 팩 검증 + 색인 갱신.
사용법:
  python3 tools/pack_tool.py validate packs/2026-W45.json   # 한 팩 검사
  python3 tools/pack_tool.py index                          # 모든 팩 검사 후 packs/index.json 재생성
검사에 실패하면 종료 코드 1. 단어 수(words)는 자동으로 채운다."""
import json, re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
PACKS = ROOT / 'packs'
WORD = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ'’-]+", re.U)
ID_RE = re.compile(r'^\d{4}-W\d{2}$')

def check_pack(path):
    errs = []
    try:
        p = json.loads(path.read_text(encoding='utf-8'))
    except Exception as e:
        return [f'{path.name}: JSON 파싱 실패 — {e}'], None
    def E(m): errs.append(f'{path.name}: {m}')
    if not ID_RE.match(p.get('id', '')): E('id는 YYYY-Www 형식이어야 함')
    if path.stem != p.get('id'): E(f'파일명({path.stem})과 id({p.get("id")})가 다름')
    for k in ('title', 'intro', 'created'):
        if not isinstance(p.get(k), str) or not p[k].strip(): E(f'{k} 누락')
    arts = p.get('articles')
    if not isinstance(arts, list) or not (2 <= len(arts) <= 6): E('articles는 2~6개'); return errs, p
    ids = set()
    for i, a in enumerate(arts, 1):
        tag = f'기사{i}'
        aid = a.get('id', '')
        if aid != f"{p.get('id')}-{i}": E(f'{tag}: id는 {p.get("id")}-{i} 이어야 함')
        if aid in ids: E(f'{tag}: id 중복')
        ids.add(aid)
        for k in ('topic', 'level', 'title', 'title_ko', 'summary_ko'):
            if not isinstance(a.get(k), str) or not a[k].strip(): E(f'{tag}: {k} 누락')
        src = a.get('source') or {}
        if not all(isinstance(src.get(k), str) and src[k] for k in ('name', 'date', 'url')): E(f'{tag}: source.name/date/url 필요')
        elif not src['url'].startswith('https://'): E(f'{tag}: source.url은 https')
        paras = a.get('paragraphs')
        if not isinstance(paras, list) or not (3 <= len(paras) <= 8) or not all(isinstance(x, str) and x.strip() for x in paras):
            E(f'{tag}: paragraphs는 문자열 3~8개'); continue
        text = ' '.join(paras)
        n = len(WORD.findall(text)); a['words'] = n
        if not (200 <= n <= 450): E(f'{tag}: 본문 {n}단어 (200~450 필요)')
        gl = a.get('glossary') or []
        if not (6 <= len(gl) <= 14): E(f'{tag}: glossary 6~14개 (현재 {len(gl)})')
        low = text.lower()
        for g in gl:
            if not g.get('w') or not g.get('ko'): E(f'{tag}: glossary 항목에 w/ko 필요'); continue
            if g['w'].lower() not in low: E(f'{tag}: glossary "{g["w"]}"가 본문에 그대로 없음 (본문 형태 그대로 적을 것)')
        ex = a.get('expressions') or []
        if not (3 <= len(ex) <= 7): E(f'{tag}: expressions 3~7개')
        for x in ex:
            if not x.get('es') or not x.get('ko'): E(f'{tag}: expression에 es/ko 필요')
        qs = a.get('questions') or []
        if not (3 <= len(qs) <= 6): E(f'{tag}: questions 3~6개')
        ans = []
        for j, q in enumerate(qs, 1):
            opts = q.get('options')
            if not q.get('q') or not isinstance(opts, list) or len(opts) != 4: E(f'{tag} Q{j}: q와 options 4개 필요'); continue
            if not isinstance(q.get('answer'), int) or not 0 <= q['answer'] <= 3: E(f'{tag} Q{j}: answer는 0~3 정수')
            else: ans.append(q['answer'])
            if len(set(opts)) != 4: E(f'{tag} Q{j}: 보기 중복')
        if len(ans) >= 3 and len(set(ans)) == 1: E(f'{tag}: 정답 위치가 전부 같음 — 섞을 것')
        ds = a.get('discuss') or []
        if not (2 <= len(ds) <= 4) or not all(d.get('es') and d.get('ko') for d in ds): E(f'{tag}: discuss 2~4개(es/ko)')
        w = a.get('writing') or {}
        if not (w.get('task_es') and w.get('task_ko')): E(f'{tag}: writing.task_es/task_ko 필요')
        if not isinstance(w.get('use', []), list): E(f'{tag}: writing.use는 목록')
    return errs, p

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'index'
    files = [pathlib.Path(sys.argv[2])] if cmd == 'validate' and len(sys.argv) > 2 else sorted(PACKS.glob('20*-W*.json'))
    all_errs, packs = [], []
    for f in files:
        errs, p = check_pack(f)
        all_errs += errs
        if p and not errs:
            f.write_text(json.dumps(p, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')  # words 반영
            packs.append({'id': p['id'], 'title': p['title'], 'file': f.name, 'count': len(p['articles'])})
    if all_errs:
        print('❌ 검증 실패'); [print(' -', e) for e in all_errs]; sys.exit(1)
    if cmd == 'index':
        packs.sort(key=lambda x: x['id'], reverse=True)
        (PACKS / 'index.json').write_text(json.dumps({'updated': packs[0]['id'] if packs else '', 'packs': packs}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'✅ {len(packs)}개 팩 검증 통과, index.json 갱신')
    else:
        print('✅ 검증 통과')
main()
