import argparse,concurrent.futures,datetime as dt,difflib,email.utils,hashlib,html,ipaddress,json,os,re,socket,subprocess,urllib.parse,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];UTC=dt.timezone.utc
BLOCK=re.compile(r'会员专享|付费阅读|订阅后阅读|付费专享|subscribe to (?:read|continue)|subscriber.only|premium.only|members.only|免费注册码|优惠码|赛博领鸡蛋|共送出|APOD Science|sponsored|giveaway|sweepstakes|media advisory|press conference|\bpodcast\b',re.I)
TOPICS=[('人工智能',r'\bAI\b|artificial intelligence|人工智能|大模型'),('城市',r'architect|urban|cities|housing|建筑|城市'),('商业',r'business|econom|industr|market|商业|产业'),('写作',r'writ|literary|fiction|poet|写作|文学'),('摄影',r'photograph|illustrat|cinema|影像|摄影'),('心理',r'psycholog|emotion|mental|心理|情绪'),('历史',r'histor|ancient|medieval|archaeolog|历史'),('社会',r'societ|social|politic|communit|社会'),('自然',r'ecolog|forest|climate|animal|自然'),('科学',r'scien|research|math|physic|space|科学')]
HINTS={'城市':'看看空间、制度与人的生活如何相互影响。','商业':'留意案例背后的激励与限制，找一个可以迁移的判断。','写作':'观察作者怎样组织材料，借一种表达或叙事方法。','摄影':'留意它怎样改变观看方式，找一个能亲自试的细节。','心理':'用一个不同解释检查自己的日常经验。','历史':'把熟悉的现象放进更长的时间里重新理解。','社会':'从具体人物与事件，观察更大的社会结构。','自然':'从一个物种或地方出发，打开不熟悉的生活世界。','科学':'留意研究真正回答了什么，以及还没有回答什么。','人工智能':'把技术可能性与实际使用条件放在一起看。'}
def iso(d):return d.astimezone(UTC).isoformat(timespec='seconds').replace('+00:00','Z')
def parse_date(s):
    if not s:return None
    try:d=dt.datetime.fromisoformat(s.strip().replace('Z','+00:00'))
    except (ValueError,TypeError):
        try:d=email.utils.parsedate_to_datetime(s)
        except (ValueError,TypeError):return None
    return d.replace(tzinfo=UTC) if d.tzinfo is None else d.astimezone(UTC)
def clean(s,n=500):
    s=html.unescape(re.sub(r'<[^>]+>',' ',s or ''));s=re.sub(r'\s+',' ',s).strip()
    return re.sub(r'(?:Read on Aeon|Read on Psyche|The post .*?(?:appeared first|first appeared) on.*)$','',s,flags=re.I).strip()[:n]
def canonical(raw,tracking=True):
    try:
        u=urllib.parse.urlsplit(raw.strip())
        if u.scheme not in ('https','http') or not u.hostname or u.username or u.password:return None
        if u.hostname in ('localhost','127.0.0.1','::1') or u.hostname.endswith('.local'):return None
        q=[(k,v) for k,v in urllib.parse.parse_qsl(u.query,keep_blank_values=True) if not tracking or (not k.startswith('utm_') and k not in ('fbclid','gclid'))]
        return urllib.parse.urlunsplit(('https',u.netloc,u.path or '/',urllib.parse.urlencode(q),''))
    except (ValueError,AttributeError):return None
def public_url(url):
    if not canonical(url):return False
    u=urllib.parse.urlsplit(url)
    def allowed(raw):
        ip=ipaddress.ip_address(raw)
        # Some local desktop proxies synthesize benchmark-range DNS answers.
        # Explicit local opt-in only; hosted jobs always use ordinary public DNS.
        proxy=os.environ.get('LEE_PROXY_DNS')=='1' and ((ip.version==4 and ip in ipaddress.ip_network('198.18.0.0/15')) or raw.startswith(('::ffff:0:c612:','::ffff:0:c613:')))
        return ip.is_global or proxy
    try:return all(allowed(a[4][0]) for a in socket.getaddrinfo(u.hostname,u.port or 443,type=socket.SOCK_STREAM))
    except (OSError,ValueError):return False
def fetch(url):
    p=subprocess.run(['curl','--silent','--show-error','--fail','--location','--proto','=https','--proto-redir','=https','--max-redirs','5','--max-time','20','--max-filesize','3000000','--user-agent','LeeDiscovery/2.1 (public metadata)',url],capture_output=True,timeout=25)
    if p.returncode:raise RuntimeError('Feed 暂时无法读取')
    return p.stdout
def lname(x):return x.rsplit('}',1)[-1]
def field(e,names):return next((''.join(x.itertext()).strip() for x in e if lname(x.tag) in names),'')
def parse_feed(data,s,now):
    if len(data)>3000000 or b'<!ENTITY' in data.upper():raise ValueError('不支持的 Feed')
    root=ET.fromstring(data);result=[];allowed=set(s.get('allowedHosts',[]))|{urllib.parse.urlsplit(s['url']).hostname}
    for e in [x for x in root.iter() if lname(x.tag) in ('entry','item')][:200]:
        title=clean(field(e,('title',)),240);url=field(e,('link',));download=online=None
        for x in e:
            if lname(x.tag)=='link':
                if x.get('rel','alternate')=='alternate':url=x.get('href') or x.text or ''
                if x.get('type')=='application/epub+zip' and not download:download=canonical(x.get('href',''),False)
                if x.get('rel')=='enclosure' and x.get('type')=='application/xhtml+xml':online=canonical(x.get('href',''),False)
        url=canonical(url or field(e,('guid','id')));date=parse_date(field(e,('published','pubDate','date')) or field(e,('updated',)));excerpt=clean(field(e,('description','summary')))
        if not title or not url or urllib.parse.urlsplit(url).hostname not in allowed or not date:continue
        if not now-dt.timedelta(days=7)<=date<=now+dt.timedelta(hours=3):continue
        if BLOCK.search(title+' '+excerpt) or any(part in url for part in ('/video/','/videos/','/podcast/')):continue
        author=clean(field(e,('creator','author')),160);rights='';kind='发布'
        if s['id']=='standard':
            a=next((x for x in e if lname(x.tag)=='author'),None)
            if a is not None:author=clean(field(a,('name',)),160)
            if author not in s.get('allowedAuthors',{}) or len(urllib.parse.urlsplit(url).path.strip('/').split('/'))!=3 or not download:continue
            rights=f"原著作者 {author}（{s['allowedAuthors'][author]} 年逝世）；源站标注美国公共领域，制作部分 CC0。请按所在地版权规则阅读。";kind='电子版发布'
        else:download=online=None
        tags=[t for t,p in TOPICS if re.search(p,title+' '+excerpt,re.I)][:3] or ['社会']
        result.append(dict(id=hashlib.sha256(url.encode()).hexdigest()[:20],title=title,url=url,source=s['name'],sourceId=s['id'],publishedAt=iso(date),dateKind=kind,type=s['type'],tags=tags,excerpt=excerpt or s['desc'],excerptBasis='原始 Feed 简介' if excerpt else '来源定位提示（非正文总结）',language=s['language'],category=s['category'],tier=s['tier'],author=author,rights=rights,downloadUrl=download,onlineUrl=online,direction='know',reasonZh=HINTS[tags[0]]))
    return sorted(result,key=lambda x:x['publishedAt'],reverse=True)[:8]
def check_article(item,now):
    url=item['url']
    try:
        for _ in range(6):
            if not public_url(url):return None,'域名无法解析或地址不允许'
            p=subprocess.Popen(['curl','--silent','--show-error','--include','--proto','=https','--max-time','18','--user-agent','Mozilla/5.0 (compatible; LeeDiscovery/2.1)',url],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            try:data=p.stdout.read(70000)
            finally:
                if p.poll() is None:p.terminate()
                p.wait(timeout=3)
            chunks=re.split(br'\r?\n\r?\n',data);header=b'';body=b''
            for index,c in enumerate(chunks):
                if c.startswith(b'HTTP/'):
                    header=c;body=b'\n\n'.join(chunks[index+1:])
                    if b'200 Connection established' not in c:break
            match=re.search(br'HTTP/\S+\s+(\d+)',header)
            if not match:return None,'连接、DNS 或 SSL 错误'
            status=int(match[1])
            if status in (301,302,303,307,308):
                loc=re.search(br'(?im)^location:\s*(.+)',header);url=canonical(urllib.parse.urljoin(url,loc[1].decode().strip())) if loc else None
                if not url:return None,'重定向地址无效'
                continue
            if not 200<=status<300:return None,f'正文 HTTP {status}'
            text=body.decode('utf8','ignore')
            if re.search(r'"isAccessibleForFree"\s*:\s*(?:false|"false")|subscribe to continue reading|会员专享|付费专享',text,re.I):return None,'正文包含付费限制标记'
            if re.search(r'<title[^>]*>\s*(?:Just a moment|Access Denied|Attention Required|404|Not Found)',text,re.I):return None,'正文返回拦截或错误页'
            if not re.search(br'(?i)(text/html|application/xhtml)',header) and b'<html' not in body.lower():return None,'未取得网页正文'
            ad_slots=len(re.findall(r'<(?:ins|div)[^>]*(?:adsbygoogle|ad-slot|ad-container|advertisement)[^>]*>',text,re.I))
            observed=dict(item.get('readingExperience',{}))
            if ad_slots:observed.update(adDensity=min(3,1+ad_slots//3),basis='已读取正文片段中的广告容器迹象；非完整页面实测')
            return {**item,'url':url,'readingExperience':observed,'linkCheck':{'ok':True,'status':status,'finalUrl':url,'checkedAt':iso(now)}},None
        return None,'重定向次数过多'
    except (OSError,subprocess.SubprocessError,ValueError):return None,'正文连接失败或超时'
def dedupe(items):
    out=[];urls=set();titles=[]
    for i in items:
        u=canonical(i['url']);t=re.sub(r'[^\w\u4e00-\u9fff]','',i['title'].lower())
        if u in urls or any(t==s or (len(t)>24 and difflib.SequenceMatcher(None,t,s).ratio()>.94) for s in titles):continue
        urls.add(u);titles.append(t);out.append(i)
    return out
def balanced(items,limit=40):
    chosen=[x for x in items if x.get('evergreen')][:4]+[x for x in items if x['type']=='书'][:2];groups={}
    for i in items:
        if i['id'] not in {x['id'] for x in chosen}:groups.setdefault(i['sourceId'],[]).append(i)
    for depth in range(20):
        for group in groups.values():
            if depth<len(group) and len(chosen)<limit:chosen.append(group[depth])
    return chosen[:limit]
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--fixtures',type=Path);ap.add_argument('--skip-network-check',action='store_true');ap.add_argument('--no-translation',action='store_true');args=ap.parse_args()
    now=dt.datetime.now(UTC);path=ROOT/'data/feed.json';previous=json.loads(path.read_text()) if path.exists() else {};sources=json.loads((ROOT/'sources.json').read_text());fresh=[];statuses=[]
    def run(s):
        try:return s,parse_feed((args.fixtures/(s['id']+'.xml')).read_bytes() if args.fixtures else fetch(s['feed']),s,now),None
        except Exception:return s,[],'Feed 暂时不可用'
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for s,items,error in pool.map(run,[s for s in sources if s.get('mode')=='dynamic' and s.get('freePolicy')=='audited-open']):
            fresh+=items;statuses.append(dict(id=s['id'],name=s['name'],ok=not error,accepted=len(items),message=error or 'Feed 可读取'))
    allowed={s['id'] for s in sources if s.get('mode') in ('dynamic','curated')};old=[i for i in previous.get('items',[]) if i.get('sourceId') in allowed and parse_date(i.get('publishedAt')) and (i.get('evergreen') or parse_date(i['publishedAt'])>=now-dt.timedelta(days=7)) and not BLOCK.search(i.get('title','')+' '+i.get('excerpt',''))]
    old=[i for i in old if i.get('evergreen') or not any(part in i['url'] for part in ('/video/','/videos/','/podcast/'))]
    curated=json.loads((ROOT/'curated.json').read_text()) if (ROOT/'curated.json').exists() else [];possible=dedupe(curated+fresh+old);checked=[];rejected=[]
    if args.skip_network_check:checked=possible
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            for i,(item,error) in zip(possible,pool.map(lambda x:check_article(x,now),possible)):
                if item:checked.append(item)
                else:rejected.append(dict(id=i['id'],sourceId=i['sourceId'],url=i['url'],reason=error))
    print(f'正文校验：{len(checked)} 通过，{len(rejected)} 暂不可用',flush=True)
    from editorial import screen
    reviewed=screen(dedupe(checked),sources)
    editorial_rejected=[{'id':i['id'],'score':i['editorial']['score'],'reasons':i['editorial']['reasons']} for i in reviewed if not i['editorial']['eligible']]
    eligible=sorted([i for i in reviewed if i['editorial']['eligible']],key=lambda i:i['editorial']['score'],reverse=True)
    selected=balanced(eligible,40)
    print(f'逐篇编辑初筛：{len(eligible)} 通过，{len(editorial_rejected)} 不进入主推荐',flush=True)
    if not args.no_translation:
        from translate_metadata import localize
        try:selected=localize(selected,previous,ROOT)
        except Exception as e:
            print(f'中文生成暂不可用：{type(e).__name__}；保留已有中文内容',flush=True)
            cached={i['id']:i for i in old if i.get('titleZh') and i.get('excerptZh')}
            selected=[cached.get(i['id'],i) for i in selected]
    selected=[i for i in selected if re.search(r'[\u4e00-\u9fff]',i.get('titleZh','')) and re.search(r'[\u4e00-\u9fff]',i.get('excerptZh',''))]
    archive=screen(dedupe(selected+[i for i in old if i.get('titleZh') and i['id'] not in {x['id'] for x in rejected}])[:160],sources)
    if len(selected)<8:
        if len(previous.get('items',[]))<8:raise SystemExit('未获得足够的中文且正文可访问内容，拒绝首次空发布')
        retained=screen([i for i in previous.get('items',[]) if i['id'] not in {x['id'] for x in rejected}],sources)
        result={**previous,'items':retained,'lastGoodItems':retained,'candidateIds':[i['id'] for i in retained if i['editorial']['eligible']][:40],'attemptedAt':iso(now),'stale':True,'statuses':statuses,'linkFailures':rejected,'sources':sources}
    else:
        generated=iso(dt.datetime.now(UTC));result=dict(schemaVersion=2,generatedAt=generated,attemptedAt=generated,batchId=hashlib.sha256((generated+''.join(i['id'] for i in selected)).encode()).hexdigest()[:16],items=archive,candidateIds=[i['id'] for i in selected],lastGoodItems=archive,sources=sources,statuses=statuses,linkFailures=rejected,stale=False)
    result['editorialVersion']=3;result['editorialRejected']=editorial_rejected;result.pop('lastGoodItems',None)
    path.parent.mkdir(exist_ok=True);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')));os.replace(tmp,path)
    print(json.dumps({'generatedAt':result['generatedAt'],'items':len(result['items']),'candidates':len(result.get('candidateIds',[])),'articleChecksPassed':len(checked),'rejected':len(rejected),'stale':result['stale']},ensure_ascii=False))
if __name__=='__main__':main()
