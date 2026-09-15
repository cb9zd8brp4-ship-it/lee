"""Re-screen the last verified snapshot without pretending to fetch new content."""
import json
from pathlib import Path
from editorial import screen
root=Path(__file__).resolve().parents[1];p=root/'data/feed.json';f=json.loads(p.read_text())
f['items']=screen(f['items'],f['sources']);f.pop('lastGoodItems',None);f['candidateIds']=[i['id'] for i in f['items'] if i['editorial']['eligible']][:40]
f['editorialVersion']=3;f['batchId']=f['batchId'].split('-editorial')[0]+'-editorial3'
p.write_text(json.dumps(f,ensure_ascii=False,separators=(',',':')))
print('已重新筛选快照，未修改内容抓取时间：',len(f['candidateIds']),'条合格候选')
