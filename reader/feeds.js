/* Phone-side RSS/Atom stream. Only metadata/brief summaries are cached; full text stays at publisher. */
export const RSS_SOURCES=[
 {name:'36氪 · 商业与创投',url:'https://36kr.com/feed-article',category:'商业',type:'文章'},
 {name:'少数派 · 数码与生活',url:'https://sspai.com/feed',category:'科技与生活',type:'文章'},
 {name:'博客园 · 技术',url:'https://www.cnblogs.com/rss',category:'技术',type:'文章'},
 {name:'大内派谈 · 播客',url:'https://feeds.fireside.fm/sspai/rss',category:'播客',type:'播客'},
 {name:'Nature · 科学期刊',url:'https://www.nature.com/nature.rss',category:'科学',type:'期刊'},
 {name:'arXiv · AI 论文',url:'https://export.arxiv.org/rss/cs.AI',category:'研究',type:'论文'}
];
const safeUrl=u=>{try{const url=new URL(u);return url.protocol==='https:'?url.href:null}catch{return null}};
export function compactSummary(text,max=240){return String(text||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim().slice(0,max)}
export function normalizeArticleLink(link){try{const url=new URL(link);if(url.protocol!=='https:')return null;for(const p of [...url.searchParams.keys()])if(/^(utm_|spm|fbclid|gclid)/i.test(p))url.searchParams.delete(p);url.hash='';return url.href}catch{return null}}
const selectText=(el,names)=>{for(const name of names){const e=[...el.children].find(n=>n.localName?.toLowerCase()===name.toLowerCase()||n.tagName?.toLowerCase()===name.toLowerCase());if(e?.textContent?.trim())return e.textContent.trim()}return ''};
const fastId=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(16)};
export function parseFeedXml(xml,source,limit=12){
 if(typeof DOMParser!=='function')throw Error('当前运行环境不支持 XML 解析');
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 if(doc.getElementsByTagName('parsererror').length)throw Error('资讯源返回了无效的 XML');
 const nodes=[...doc.getElementsByTagName('item'),...doc.getElementsByTagName('entry')].slice(0,limit);
 const results=[];
 for(const entry of nodes){
  const title=selectText(entry,['title']);
  const linkNode=[...entry.children].find(e=>e.localName==='link'||e.tagName?.toLowerCase()==='link');
  const link=safeUrl(linkNode?.getAttribute('href')||linkNode?.textContent?.trim());
  const url=link&&normalizeArticleLink(link);
  if(!title||!url)continue;
  const excerpt=compactSummary(selectText(entry,['description','summary','content','encoded']));
  const date=selectText(entry,['pubDate','published','updated','date']);
  const time=Date.parse(date);
  results.push({id:'rss-'+fastId(url),title,titleZh:title,source:source.name,url,type:source.type,category:source.category,
   excerptZh:excerpt,excerpt,publishedAt:Number.isFinite(time)?new Date(time).toISOString():'',tier:'stream',editorial:{eligible:true}});
 }
 return results;
}
export function mergeStreamItems(lists,max=160){
 const urls=new Set(),ids=new Set(),out=[];
 for(const item of lists.flat()){
  const normalized=normalizeArticleLink(item?.url);
  if(!normalized||!item.title||urls.has(normalized)||ids.has(item.id))continue;
  urls.add(normalized);ids.add(item.id);out.push(item);
 }
 return out.sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||'')).slice(0,max);
}
async function fetchText(url,fetcher,timeout){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),timeout);
 try{const res=await fetcher(url,{cache:'no-store',signal:ac.signal});if(!res.ok)throw Error('HTTP '+res.status);
 const txt=await res.text();if(txt.length>1800000)throw Error('RSS 体积异常');return txt}
 finally{clearTimeout(timer)}
}
export async function refreshStream({fetcher=fetch,sources=RSS_SOURCES,timeout=8500}={}){
 const status=await Promise.allSettled(sources.map(async source=>{
  const txt=await fetchText(source.url,fetcher,timeout);
  const items=parseFeedXml(txt,source);
  if(!items.length)throw Error('源无可用条目');return{source:source.name,items};
 }));
 const good=[],bad=[];
 for(let i=0;i<status.length;i++){const result=status[i];if(result.status==='fulfilled')good.push(result.value);else bad.push({source:sources[i].name,error:result.reason?.message||'连接失败'})}
 return {items:mergeStreamItems(good.map(x=>x.items)),okSources:good.map(x=>x.source),errors:bad,updatedAt:new Date().toISOString()};
}
