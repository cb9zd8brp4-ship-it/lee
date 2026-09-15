"""Restore public metadata, never user records; failed fetch keeps the bundled snapshot."""
from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parents[1];path=root/'data/feed.json'
url='https://cb9zd8brp4-ship-it.github.io/lee/feed.json'
try:
    p=subprocess.run(['curl','--fail','--silent','--location','--proto','=https','--proto-redir','=https','--max-time','25','--max-filesize','3000000',url],capture_output=True,timeout=30,check=True)
    candidate=json.loads(p.stdout);old=json.loads(path.read_text())
    assert candidate['schemaVersion']==2 and len(candidate['items'])>=8
    assert all(i.get('titleZh') and i.get('excerptZh') for i in candidate['items'])
    if candidate['generatedAt']>old['generatedAt']:path.write_text(json.dumps(candidate,ensure_ascii=False,separators=(',',':')))
    print('已恢复公开内容缓存')
except Exception:print('未取得更新的在线缓存，使用项目内最后成功快照')
