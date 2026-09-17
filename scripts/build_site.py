#!/usr/bin/env python3
from pathlib import Path
import json,shutil
root=Path(__file__).resolve().parents[1];dist=root/'dist';dist.mkdir(exist_ok=True)
feed=json.loads((root/'data/feed.json').read_text())
assert len(feed.get('items',[]))>=8,'Refuse an empty homepage'
assert all(i.get('titleZh') and i.get('excerptZh') for i in feed['items']),'Chinese metadata is required'
encoded=json.dumps(feed,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
page=(root/'web/index.template.html').read_text().replace('__FEED__',encoded)
assert '__SOURCES__' not in page and '__FEED__' not in page
css=(root/'web/style.css').read_text()+'\n'+(root/'web/v2.css').read_text()
(dist/'index.html').write_text(page);(dist/'style.css').write_text(css)
for name in ['core.js','app.js','favicon.svg']:shutil.copy2(root/'web'/name,dist/name)
shutil.copy2(root/'data/feed.json',dist/'feed.json')
offline=page.replace('<link rel="stylesheet" href="style.css">','<style>'+css+'</style>')
for name in ['core.js','app.js']:offline=offline.replace('<script src="'+name+'?v=20260917-finite"></script>','<script>'+(root/'web'/name).read_text().replace('</script','<\\/script')+'</script>')
offline=offline.replace('<link rel="apple-touch-icon" href="apple-touch-icon.png">','').replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">','')
for p in [root/'Lee_信息首页.html',dist/'Lee_信息首页.html']:p.write_text(offline)
(dist/'.nojekyll').touch()
print(f'Built online and offline homepage: {len(feed["items"])} Chinese items')

