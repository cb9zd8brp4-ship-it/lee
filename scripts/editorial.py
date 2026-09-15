"""Transparent, language-neutral screening of individual public metadata.
Scores are heuristics, not a claim that the full article was editorially read.
"""
import re
VERSION=3
FOCUS={
 '经营与创作':r'business model|small business|entrepreneur|creator|经营|商业模式|小生意|轻资产|创作者|创作|创业',
 '城市与空间':r'architect|housing|urban|cities|public space|third place|建筑|居住|城市|空间设计|第三空间',
 '生活与地方':r'coffee|cooking|recipe|\btravel(?:ling|ing|s)?\b|textile|lifestyle|local cultur|咖啡|菜谱|旅行|地方文化|织物|生活方式',
 '表达与选择':r'writ|language|word|storytell|illustration|photograph|camera|flap book|student|palmistry|mental health|choice|freedom|impatien|写作|词语|表达|影像|摄影|相机|选择|自由|不耐烦|比喻|心理健康',
 '现实中的技术':r'(?:\bAI\b|artificial intelligence|人工智能|机器学习).{0,100}(?:teach|work|classroom|business|document|device|教育|课堂|工作|经营|文档|设备)|(?:teach|work|课堂|文档).{0,80}(?:\bAI\b|人工智能)',
 '人物与社会':r'occupation|profession|worker|community|communities|astronaut candidate|migration|patriarch|protest|职业|人物|社区|移民|迁徙|女性|社会规则'
}
BRIDGES={
 '陌生行业与制度':r'artisanal|mining|industry|institution|tradition|astronaut candidate|制度|采矿|行业|传统建筑|职业',
 '地方与生活经验':r'central asia|vietnam|angola|peru|bukhara|medieval|地方|越南|中亚|布哈拉|安哥拉|中世纪',
 '表达与观察方法':r'etymolog|polymath|palmistry|pinhole|flap book|perception|词源|博学|掌纹|针孔|暗箱|翻页书|观察|盲点'
}
def hits(pattern,s):return bool(re.search(pattern,s,re.I))
def reading_experience(item,source):
    observed={**source.get('readingExperience',{}),**item.get('readingExperience',{})}
    # Missing observations stay neutral; a famous/foreign source is never rewarded.
    ad=max(0,min(3,int(observed.get('adDensity',0))))
    obstruction=observed.get('obstructive') is True
    popups=observed.get('frequentPopups') is True
    base=float(observed.get('baseScore',observed.get('score',.8)))
    factor=max(.15,min(1,base-.12*ad-.25*obstruction-.15*popups))
    return {**observed,'baseScore':base,'score':round(factor,2),'hint':'阅读体验一般 · 可尝试阅读模式' if ad>=2 or obstruction or popups else '', 'basis':observed.get('basis','未完整实测排版，使用中性值')}
def chinese_video(item):
    a=item.get('viewingAccess',{})
    return a.get('mode') in ('zh-Hans','zh-Hant','auto-zh') and bool(a.get('evidenceUrl')) and bool(a.get('verifiedAt'))
def assess(item,source):
    # Do not score publisher descriptions or our generic recommendation text as article evidence.
    summary=item.get('excerpt','')
    missing='来源定位' in item.get('excerptBasis','') or not summary.strip() or hits(r'APOD\s*Science|APODArchive|CalendarRSS|To view this video please enable',summary)
    raw=item.get('title','')+' '+('' if missing else summary)+' '+item.get('action','')
    focus=[k for k,p in FOCUS.items() if hits(p,raw)]
    if hits(r'bacteri|microb|细菌|微生物',raw) and not hits(r'people|human|worker|people|人类|人物|工人',raw):focus=[k for k in focus if k!='人物与社会']
    bridges=[k for k,p in BRIDGES.items() if hits(p,raw)]
    interest=min(3,2.5*len(focus))
    novelty=min(3,(1.5 if bridges else 0)+(.75 if bridges and focus else 0)+(.75 if len(bridges)>1 else 0))
    detail=hits(r'\b\d+(?:[.,]\d+)?\b|研究|数据|案例|调查|采访|report|survey|study|research|case|example',summary)
    concrete=hits(r'how|because|through|method|step|workshop|people|woman|women|teacher|village|design|\bmy\b|wait|experience|为什么|怎样|如何|工艺|方法|步骤|教师|人物|社区|他们|对比|实验|布道|选中|使用|反思',raw)
    dense=not missing and (len(summary)>=55 or item.get('action'))
    density=(1 if dense else 0)+(1 if dense and (detail or concrete) else 0)
    continuing=1 if focus and (concrete or item.get('action') or item.get('type')=='书') else .5 if focus and dense else 0
    reading=reading_experience(item,source)
    total=round(interest+novelty+density+reading['score']+continuing,2)
    reason=[]
    if missing:reason.append('缺少具体文章简介，不能用来源名声补分')
    if not focus and not bridges:reason.append('与已知兴趣及相邻探索缺少连接')
    if hits(r'震惊|必看|惊呆|不看后悔|mind.blown|you won.t believe',item.get('title','')):total=max(0,total-2);reason.append('标题党降权')
    if item.get('type') in ('纪录片','电影','剧集') and not chinese_video(item):reason.append('暂无经核验的中文观看方式')
    eligible=total>=6 and density>=1 and not missing and not reading.get('obstructive') and (item.get('type') not in ('纪录片','电影','剧集') or chinese_video(item))
    return {'version':VERSION,'score':total,'interest':interest,'novelty':novelty,'density':density,'reading':reading['score'],'continuing':continuing,'eligible':eligible,'exploration':bool(bridges and focus and novelty>=2),'connections':focus+bridges,'reasons':reason,'basis':'依据具体标题、公开简介与实践步骤的规则初筛；未将语言、国家、媒体名气计分'},reading
def screen(items,sources):
    byid={s['id']:s for s in sources};out=[]
    for i in items:
        e,r=assess(i,byid.get(i['sourceId'],{}));out.append({**i,'editorial':e,'readingExperience':r})
    return out
