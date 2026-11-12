/* Lee Reader catalog v1.4: metadata-only search for licensed/open catalogs.
   Book text is never scraped from protected sites. */
const GUTENDEX = 'https://gutendex.com/books/';
const WIKISOURCE = 'https://zh.wikisource.org/w/api.php';
const MAX_RESULTS = 30;
export const BOOK_QUERY_MIN = 2;
const allowed = url => {try{const u=new URL(url);return u.protocol==='https:'?u.href:null}catch{return null}};
const normalize = value => String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ');
const slug = value => normalize(value).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);
const values = (obj,prefix) => Object.entries(obj||{}).filter(([key,url])=>key.toLowerCase().startsWith(prefix)&&allowed(url)).map(([,url])=>url);
export function parseGutenbergBook(book) {
 if(!book||!Number.isSafeInteger(Number(book.id))||!book.title)return null;
 const formats = book.formats || {};
 const epub = values(formats,'application/epub+zip')[0] || '';
 const txt = values(formats,'text/plain')[0] || '';
 const isCatalogued = book.copyright === false;
 // A book with unknown or affirmative copyright status is not auto-imported.
 return {id:'pg:'+book.id,provider:'Project Gutenberg',title:normalize(book.title),
  author:normalize((book.authors||[]).map(a=>a.name).filter(Boolean).join('、')),
  language:(book.languages||[]).join(','),
  preview:allowed('https://www.gutenberg.org/ebooks/'+book.id),
  fileUrl:isCatalogued?(allowed(epub)||allowed(txt)||''):'',
  format:isCatalogued&&allowed(epub)?'epub':isCatalogued&&allowed(txt)?'txt':'',
  status:!isCatalogued?'rights-review':epub||txt?'ready':'online-only',
  rights:'Project Gutenberg 书目：请遵守作品所在地区著作权及电子书内附许可',
  completeness:'书目可能包含完整作品，导入后仍需检查章节'};
}
export function parseWikisourcePages(data){
 const pages = Object.values(data?.query?.pages||{}).filter(p=>p&&p.title&&!p.missing);
 return pages.filter(p=>!p.title.includes(':')).slice(0,10).map(p=>{
  const title=normalize(p.title);
  return {id:'ws:'+title,provider:'维基文库',title,author:'',language:'zh',preview:allowed('https://zh.wikisource.org/wiki/'+encodeURIComponent(title.replace(/ /g,'_'))),
   fileUrl:'',format:'',status:'online-only',rights:'维基文库：须按具体作品版权与许可核实使用条件',
   completeness:'搜索到的是页面，不保证是完整作品；请核对顶层目录'};
 });
}
async function requestJson(url,fetcher,timeout){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
 try{const response=await fetcher(url,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);return await response.json()}
 finally{clearTimeout(timer)}
}
export async function searchPublicBooks(query,{fetcher=fetch,timeout=11000}={}){
 query=normalize(query);if(query.length<BOOK_QUERY_MIN)throw Error('请输入至少两个字的书名或作者');
 const tasks=[
  requestJson(GUTENDEX+'?search='+encodeURIComponent(query),fetcher,timeout).then(d=>({provider:'gutenberg',data:d})),
  requestJson(WIKISOURCE+'?action=query&generator=search&gsrsearch='+encodeURIComponent(query)+'&gsrnamespace=0&gsrlimit=10&prop=info&inprop=url&format=json&origin=*',fetcher,timeout).then(d=>({provider:'wikisource',data:d}))
 ];
 const settled=await Promise.allSettled(tasks);
 const errors=[],results=[];
 for(let i=0;i<settled.length;i++){const task=settled[i];if(task.status==='rejected'){errors.push((i===0?'Gutenberg':'维基文库')+'：'+(task.reason?.message||'连接失败'));continue}
 const {provider,data}=task.value;if(provider==='gutenberg')results.push(...(data.results||[]).map(parseGutenbergBook).filter(Boolean));
 else results.push(...parseWikisourcePages(data));
 }
 const seen=new Set();
 const unique=results.filter(r=>{const key=r.provider+'|'+r.title;if(seen.has(key))return false;seen.add(key);return true})
 .sort((a,b)=>{const score=x=>(x.status==='ready'?100:0)+(x.title===query?90:x.title.includes(query)?30:0)+(x.language.includes('zh')?4:0);return score(b)-score(a)});
 return {query,results:unique.slice(0,MAX_RESULTS),errors};
}
export function validateDownloadLink(result){
 const url=allowed(result?.fileUrl);
 if(!url||result.status!=='ready'||!['epub','txt'].includes(result.format))throw Error('此版本没有已确认可直接导入的电子书文件');
 const u=new URL(url);
 if(!/(^|\.)gutenberg\.org$|(^|\.)pglaf\.org$/.test(u.hostname))throw Error('下载地址不属于受支持的可信书库');
 return url;
}
export function bookFilename(result){return slug(result.title||'未命名电子书')+'.'+result.format}
export function bookAssistantPrompt(query){
 const name=normalize(query);
 return '请为 Lee Reader 寻找《'+name+'》的完整电子书：优先合法可获取的 EPUB/TXT，核对作者、版本、卷数、目录和缺章；请提供可下载来源，并说明授权与完整性。找到的文件需要导入红米 Lee Reader。不能拿节选冒充全本。';
}
