import {importFile,loadBook,saveBook,listLocalBooks,progressPercent} from './books.js';
import {getConfig,getSession,setConfig,signin,signup,signOut,syncEvents,uploadCurrentBook,downloadCurrentBook} from './cloud.js';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const STATE_KEY='lee.reader.events.v1',DEVICE_KEY='lee.reader.device.v1',PREFS_KEY='lee.reader.prefs.v1';
const ORIGINAL_HOME='https://cb9zd8brp4-ship-it.github.io/lee/';
const FEED_LOCATIONS=['./feed.json','../feed.json',ORIGINAL_HOME+'feed.json'];
const SAFE=(s='')=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readJSON(k,fallback){try{return JSON.parse(localStorage.getItem(k))||fallback}catch{return fallback}}
const device=localStorage.getItem(DEVICE_KEY)||crypto.randomUUID();localStorage.setItem(DEVICE_KEY,device);
let events=readJSON(STATE_KEY,[]);if(!Array.isArray(events))events=[];
let settings=readJSON(PREFS_KEY,{fontSize:20,lineHeight:18,theme:'warm'});
let feed=[],feedUpdated='',feedLoading=false,lane='all',screen='home',localBooks=[],syncTimer=null,active=null,toastTimer;
function toast(msg){$('#toast').textContent=msg;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3800)}
function persist(){try{localStorage.setItem(STATE_KEY,JSON.stringify(events));return true}catch(e){toast('本地存储空间不足，请立即导出备份');return false}}
function emit(key,type,value,doSync=true){const e={id:crypto.randomUUID(),device,key,type,value,at:new Date().toISOString()};events.push(e);persist();if(doSync)scheduleSync();return e}
function fold(){const records=new Map();for(const e of events){const old=records.get(e.key);if(!old||e.at>old.at||(e.at===old.at&&e.id>old.id))records.set(e.key,e)}return records}
function latest(key){return fold().get(key)?.value||null}
function typed(prefix){return [...fold().values()].filter(e=>e.key.startsWith(prefix)&&e.value!==null).map(e=>({...e.value,__id:e.key.slice(prefix.length),__at:e.at}))}
function renderAll(){renderHome();renderShelf();renderDiscover();renderNews();renderProfile()}
function navigate(target){if(!$('#'+target))return;screen=target;$$('.screen').forEach(n=>n.classList.toggle('active',n.id===target));$$('.bottom-nav button').forEach(n=>n.classList.toggle('selected',n.dataset.target===target));window.scrollTo({top:0,behavior:'instant'});if(target==='profile')renderProfile();if(target==='discover'&&feed.length===0)loadFeed()}
$$('[data-target]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.target)));
$('#quickSettings').onclick=()=>navigate('profile');
function booksInfo(){return typed('book:').sort((a,b)=>(latest('progress:'+b.__id)?.updatedAt||b.importedAt||'').localeCompare(latest('progress:'+a.__id)?.updatedAt||a.importedAt||''))}
function isLocal(id){return localBooks.some(b=>b.id===id)}
function renderHome(){const books=booksInfo(),recent=books.find(b=>latest('progress:'+b.__id))||books[0];if(recent){const p=latest('progress:'+recent.__id),percent=p?.percent||0;$('#continueBlock').innerHTML=`<div class="muted">继续阅读 · ${SAFE(recent.author||'我的书架')}</div><h3>${SAFE(recent.title)}</h3><p>已读 ${percent}% · ${isLocal(recent.__id)?'本机可离线阅读':'当前设备需导入书籍正文'}</p><button class="btn primary" data-open-book="${SAFE(recent.__id)}">${isLocal(recent.__id)?'继续阅读':'查看书架'}</button>`}else{$('#continueBlock').innerHTML='<div class="muted">继续阅读</div><p>导入一本书，便可以从上次的章节继续阅读。</p><button class="btn secondary" data-target="shelf">去我的书架</button>'}
 $('#homeDiscover').innerHTML=feed.length?feed.filter(f=>!latest('feedback:'+f.id)).slice(0,2).map(itemCard).join(''):'<div class="empty">今日发现沿用原站内容。联网后显示最新推荐。</div>';
 $('#homeNews').innerHTML=feed.length?feed.slice(0,2).map(itemCard).join(''):'<div class="empty">暂无本地资讯缓存。联网后自动获取。</div>'}
function renderShelf(){const books=booksInfo();$('#bookList').innerHTML=books.length?books.map(b=>{const p=latest('progress:'+b.__id),percent=p?.percent||0;return `<div class="book-row"><small class="muted">${SAFE(b.format?.toUpperCase()||'电子书')} · ${isLocal(b.__id)?'已离线保存':'仅元数据'}</small><strong>${SAFE(b.title)}</strong><div class="sub">${SAFE(b.author||'作者未录入')} · ${b.chapterCount||0} 章</div><div class="progress"><i style="width:${Math.max(0,Math.min(100,percent))}%"></i></div><div class="sub">阅读进度 ${percent}%</div><div class="button-row"><button class="btn primary" data-open-book="${SAFE(b.__id)}">${isLocal(b.__id)?'继续阅读':'导入相同文件'}</button><button class="btn secondary" data-chat-book="${SAFE(b.__id)}">和 ChatGPT 聊聊</button></div></div>`}).join(''):'<div class="empty">书架还是空的。导入一本合法取得的 EPUB 或 TXT 文件，便可离线翻页。</div>';
const sources=typed('source:');$('#sourceList').innerHTML=sources.length?sources.map(x=>`<div class="tile"><div class="source">${SAFE(x.status||'外部书源')}</div><h4>${SAFE(x.title||x.url)}</h4><div class="actions"><a href="${SAFE(safeLink(x.url))}" target="_blank" rel="noopener noreferrer">打开原站 / 下载 ↗</a></div></div>`).join(''):'<div class="empty">暂无待处理书源。</div>';const f=typed('favorite:');$('#favoriteList').innerHTML=f.length?f.slice(0,50).map(item=>`<div class="tile"><div class="source">${SAFE(item.source||'我的收藏')}</div><h4>${SAFE(item.title||item.url)}</h4><div class="actions"><a target="_blank" rel="noopener" href="${SAFE(safeLink(item.url))}">打开原文 ↗</a><button data-unfavorite="${SAFE(item.__id)}">取消收藏</button></div></div>`).join(''):'<div class="empty">暂无收藏。原信息首页的历史收藏可在「记录」中无损导入。</div>'}
function safeLink(u){try{const p=new URL(u);return ['http:','https:'].includes(p.protocol)?p.href:'#'}catch{return '#'}}
function itemCard(i){const fav=latest('favorite:'+i.id),vote=latest('feedback:'+i.id);return `<article class="tile"><div class="source">${SAFE(i.source||'未知来源')} · ${SAFE(i.type||'文章')}</div><h4>${SAFE(i.titleZh||i.title)}</h4><div class="excerpt">${SAFE((i.excerptZh||i.excerpt||'').slice(0,360))}</div><div class="actions"><a href="${SAFE(safeLink(i.url))}" target="_blank" rel="noopener noreferrer" data-open-article="${SAFE(i.id)}">打开原文 ↗</a><button data-favorite="${SAFE(i.id)}">${fav?'♥ 已收藏':'♡ 收藏'}</button><button data-vote="${SAFE(i.id)}" data-value="1">${vote?.value===1?'✓ ':''}有意思</button><button data-vote="${SAFE(i.id)}" data-value="-1">${vote?.value===-1?'✓ ':''}没感觉</button></div></article>`}
function validFeed(i){if(!i?.id||!safeLink(i.url)||safeLink(i.url)==='#')return false;const e=i.editorial;if(e?.eligible===false)return false;if(Number.isFinite(e?.score)&&e.score<6)return false;return !!(i.titleZh||i.title)}
async function loadFeed(){
 if(feedLoading)return;
 feedLoading=true;$('#feedStatus').textContent='正在尝试加载现有内容池…';
 let error='没有可用的数据源';
 try{
  let success=false;
  for(const url of FEED_LOCATIONS){
   try{
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!Array.isArray(data.items)||!data.items.length)throw Error('内容包没有可用文章');
    const items=data.items.filter(validFeed);
    if(!items.length)throw Error('内容包未通过质量筛选');
    feed=items;feedUpdated=data.checkedAt||data.generatedAt||'';
    try{localStorage.setItem('lee.reader.feed.cache',JSON.stringify({feed,feedUpdated}))}catch{}
    $('#feedStatus').textContent=`最近内容检查：${feedUpdated?new Date(feedUpdated).toLocaleString('zh-CN'):'未知'} · ${feed.length} 条可用`;
    success=true;break;
   }catch(e){error=e.message||String(e)}
  }
  if(!success){
   const cache=readJSON('lee.reader.feed.cache',{});
   if(cache.feed?.length){feed=cache.feed;feedUpdated=cache.feedUpdated||'';$('#feedStatus').textContent='网络不可用，显示最近一次成功保存的内容'}
   else $('#feedStatus').textContent='内容暂不可用：'+error+'。可打开原版信息首页。';
  }
 }finally{feedLoading=false;renderAll()}
}
const day=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
function dailySet(){const key='daily:'+day(),stored=latest(key);if(stored)return stored;const seen=new Set(typed('history:').map(x=>x.__id));const first=feed.filter(i=>!seen.has(i.id)).slice(0,8).map(i=>i.id);const value={ids:first,shown:[...first]};emit(key,'daily',value);return value}
function filtered(i){if(lane==='all')return true;if(lane==='explore')return i.editorial?.exploration===true||i.tier==='explore';if(lane==='fun')return ['文化与写作','城市与生活'].includes(i.category)||['电影','剧集','随笔','纪录片'].includes(i.type);return !['电影','剧集'].includes(i.type)}
function renderDiscover(){if(!feed.length){$('#discoveryList').innerHTML='<div class="empty">暂无内容。连网时自动尝试加载原信息首页的推荐池。</div>';return}const daily=dailySet(),byId=new Map(feed.map(i=>[i.id,i])),shown=daily.ids.map(id=>byId.get(id)).filter(Boolean);$('#discoverStats').textContent=`今日已展示 ${daily.shown.length}/12 条 · ${lane==='all'?'全部内容':lane==='fun'?'娱乐':lane==='learn'?'学习':'探索'}`;$('#discoveryList').innerHTML=shown.filter(filtered).map(itemCard).join('')||'<div class="empty">当前筛选条件下没有内容。</div>';
 if(daily.shown.length<12){const b=document.createElement('button');b.className='btn secondary';b.textContent='再发现一条';b.onclick=()=>{const seen=new Set([...daily.shown,...typed('history:').map(x=>x.__id)]);const next=feed.find(i=>!seen.has(i.id));if(!next)return toast('本期没有更多合格内容');emit('history:'+next.id,'history',{status:'shown',item:next});emit('daily:'+day(),'daily',{ids:[...daily.ids,next.id],shown:[...daily.shown,next.id]});renderDiscover();};$('#discoveryList').append(b)} }
function renderNews(){const sorted=[...feed].sort((a,b)=>(b.publishedAt||'').localeCompare(a.publishedAt||''));$('#newsList').innerHTML=sorted.length?sorted.slice(0,40).map(itemCard).join(''):'<div class="empty">资讯来源暂不可用，打开联网后重新刷新。</div>'}
function renderProfile(){const sessions=typed('session:').sort((a,b)=>b.startedAt.localeCompare(a.startedAt));const total=sessions.reduce((a,s)=>a+(s.seconds||0),0);$('#readingStats').innerHTML=`<div class="stat"><div class="sub">书籍</div><b>${booksInfo().length}</b></div><div class="stat"><div class="sub">累计阅读</div><b>${Math.floor(total/60)} 分钟</b></div><div class="stat"><div class="sub">阅读次数</div><b>${sessions.length}</b></div><div class="stat"><div class="sub">文章收藏</div><b>${typed('favorite:').length}</b></div>`;
$('#recentSessions').innerHTML=sessions.slice(0,8).map(s=>`<div class="tile"><div class="source">${SAFE(s.startedAt?.slice(0,10))}</div><h4>${SAFE(s.title)}</h4><div class="sub">阅读 ${Math.round(s.seconds/60)} 分钟 · 进度 ${s.fromPercent||0}% → ${s.toPercent||0}%</div></div>`).join('')||'<div class="empty">暂无阅读记录。阅读超过 30 秒后会自动保留会话。</div>';
const config=getConfig(),ss=getSession();$('#cloudUrl').value=config.url;$('#cloudKey').value=config.key;$('#syncBadge').textContent=ss?.user?.id?'已登录 · 可同步':'仅本地';$('#oldDataStatus').textContent=localStorage.getItem('lee.discovery.v2')?'检测到原版信息首页本地数据。可点击「查找原版数据」只读迁移。':'没有在当前浏览器发现原版数据；也可以导入原站导出的 JSON 备份。'}
async function importBooks(files){for(const f of Array.from(files||[])){try{toast('正在导入 '+f.name);const book=await importFile(f);if(!localBooks.some(b=>b.id===book.id))localBooks.push(book);if(!latest('book:'+book.id)){emit('book:'+book.id,'book',{title:book.title,author:book.author,format:book.format,chapterCount:book.chapters.length,length:book.length,importedAt:book.importedAt,quality:book.quality})}toast(book.duplicate?'该书已在本机，无需重复导入':'已导入 '+book.title)}catch(e){toast('导入失败：'+e.message)}}renderAll()}
$('#bookFile').addEventListener('change',e=>{importBooks(e.target.files);e.target.value=''});
$('#addBookUrl').onclick=async()=>{const url=$('#bookUrl').value.trim(),safe=safeLink(url);if(safe==='#')return toast('请输入有效的 HTTPS/HTTP 链接');const direct=/\.(epub|txt)(?:[?#].*)?$/i.exec(safe);let imported=false;if(direct){try{const r=await fetch(safe);if(!r.ok)throw Error('HTTP '+r.status);const blob=await r.blob();if(blob.size>35*1024*1024)throw Error('文件过大');const f=new File([blob],new URL(safe).pathname.split('/').pop().split('?')[0],{type:blob.type});await importBooks([f]);imported=true}catch(e){toast('网站限制了直接获取，请先下载文件再导入')}}if(!imported){emit('source:'+encodeURIComponent(safe),'source',{url:safe,title:safe,status:direct?'需要下载后导入':'书籍页面链接 · 待下载'});toast('已保存书源链接，后续可下载文件导入')}$('#bookUrl').value='';renderShelf()};
let beforeTouchX=0,beforeTouchY=0;
async function openBook(id){const book=await loadBook(id);if(!book){navigate('shelf');$('#bookFile').click();toast('请在此设备导入相同的 EPUB/TXT 文件，进度会同步');return}closeSession();const progress=latest('progress:'+id)||{chapter:0,char:0,percent:0};active={book,chapter:Math.min(book.chapters.length-1,Math.max(0,progress.chapter||0)),char:Math.max(0,progress.char||0),lastChar:0,sessionStart:Date.now(),sessionFrom:progress.percent||0,pageHistory:[]};$('#shell').hidden=true;$('#reader').hidden=false;$('#reader').dataset.theme=settings.theme||'warm';$('#fontSize').value=settings.fontSize||20;$('#lineHeight').value=settings.lineHeight||18;applyReaderPrefs();$('#readerBook').textContent=book.title;$('#readerMenu').hidden=true;$('#tocMenu').hidden=true;renderPage();}
function applyReaderPrefs(){$('#reader').style.setProperty('--font-size',(settings.fontSize||20)+'px');$('#reader').style.setProperty('--line-height',String((settings.lineHeight||18)/10));$('#reader').dataset.theme=settings.theme||'warm';localStorage.setItem(PREFS_KEY,JSON.stringify(settings))}
function fitText(text){const box=$('#readerText'),max=text.length;if(max===0){box.textContent='';return 0}let lo=1,hi=Math.min(max,1600),good=1;while(lo<=hi){const mid=(lo+hi)>>1;box.textContent=text.slice(0,mid);if(box.scrollHeight<=box.clientHeight+2){good=mid;lo=mid+1}else{hi=mid-1}}box.textContent=text.slice(0,good);return good}
function renderPage(){if(!active)return;const b=active.book,c=b.chapters[active.chapter];active.char=Math.max(0,Math.min(c.text.length-1,active.char));let fit=fitText(c.text.slice(active.char));if(!fit)fit=1;active.lastChar=fit;$('#readerChapter').textContent=c.title;const percent=progressPercent(b,{chapter:active.chapter,char:active.char});$('#readerProgress').textContent=percent+'%';$('#readerPageHint').textContent=`${active.chapter+1}/${b.chapters.length} 章 · 左右翻页`;saveProgress();}
let saveProgressTimer;
function saveProgress(force=false){if(!active)return;clearTimeout(saveProgressTimer);const doit=()=>{if(!active)return;const b=active.book;emit('progress:'+b.id,'progress',{chapter:active.chapter,char:active.char,percent:progressPercent(b,{chapter:active.chapter,char:active.char}),updatedAt:new Date().toISOString()});};if(force)doit();else saveProgressTimer=setTimeout(doit,700)}
function turnPage(dir){
 if(!active)return;
 const ch=active.book.chapters[active.chapter];
 if(dir>0){
  const old={chapter:active.chapter,char:active.char};
  if(active.char+active.lastChar>=ch.text.length){
   if(active.chapter+1>=active.book.chapters.length){toast('已经读到最后一章');return}
   active.chapter++;active.char=0;
  }else active.char+=active.lastChar;
  active.pageHistory.push(old);
 }else{
  const previous=active.pageHistory.pop();
  if(previous){active.chapter=previous.chapter;active.char=previous.char}
  else if(active.char===0){
   if(active.chapter===0){toast('已经是第一页');return}
   active.chapter--;active.char=Math.max(0,active.book.chapters[active.chapter].text.length-380)
  }else active.char=Math.max(0,active.char-Math.max(1,active.lastChar-40));
 }
 renderPage();
}
function closeSession(){clearTimeout(saveProgressTimer);if(!active)return;saveProgress(true);const elapsed=Math.max(0,Math.round((Date.now()-active.sessionStart)/1000));if(elapsed>=30){const book=active.book;emit('session:'+crypto.randomUUID(),'session',{bookId:book.id,title:book.title,startedAt:new Date(active.sessionStart).toISOString(),seconds:Math.min(elapsed,12*3600),fromPercent:active.sessionFrom,toPercent:progressPercent(book,{chapter:active.chapter,char:active.char})})}active=null}
function closeBook(){closeSession();$('#reader').hidden=true;$('#shell').hidden=false;renderAll()}
$('#closeReader').onclick=closeBook;$('#readerOptions').onclick=()=>{$('#readerMenu').hidden=!$('#readerMenu').hidden;$('#tocMenu').hidden=true};$('#toggleToc').onclick=()=>{if(!active)return;$('#readerMenu').hidden=true;$('#tocMenu').hidden=false;$('#tocList').innerHTML=active.book.chapters.map((c,i)=>`<button data-chapter="${i}">${i+1}. ${SAFE(c.title)}</button>`).join('')};$('#closeToc').onclick=()=>$('#tocMenu').hidden=true;
$('#fontSize').oninput=e=>{settings.fontSize=Number(e.target.value);applyReaderPrefs();if(active)active.pageHistory=[];renderPage()};$('#lineHeight').oninput=e=>{settings.lineHeight=Number(e.target.value);applyReaderPrefs();if(active)active.pageHistory=[];renderPage()};
$$('[data-theme]').forEach(b=>b.onclick=()=>{settings.theme=b.dataset.theme;applyReaderPrefs();renderPage()});
$$('.tap-zone').forEach(n=>n.onclick=()=>turnPage(n.dataset.page==='next'?1:-1));
$('#readerPaper').addEventListener('touchstart',e=>{beforeTouchX=e.touches[0].clientX;beforeTouchY=e.touches[0].clientY},{passive:true});
$('#readerPaper').addEventListener('touchend',e=>{if(!active)return;const dx=e.changedTouches[0].clientX-beforeTouchX,dy=e.changedTouches[0].clientY-beforeTouchY;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)turnPage(dx<0?1:-1)},{passive:true});
window.addEventListener('keydown',e=>{if(active){if(['ArrowRight','PageDown'].includes(e.key)){e.preventDefault();turnPage(1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();turnPage(-1)}if(e.key==='Escape')closeBook()}});
window.addEventListener('resize',()=>{if(active){active.pageHistory=[];renderPage()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(active){saveProgress(true);const elapsed=Math.round((Date.now()-active.sessionStart)/1000);if(elapsed>=30){emit('session:'+crypto.randomUUID(),'session',{bookId:active.book.id,title:active.book.title,startedAt:new Date(active.sessionStart).toISOString(),seconds:Math.min(elapsed,12*3600),fromPercent:active.sessionFrom,toPercent:progressPercent(active.book,{chapter:active.chapter,char:active.char})});active.sessionStart=Date.now();active.sessionFrom=progressPercent(active.book,{chapter:active.chapter,char:active.char})}}}else{if(active){active.sessionStart=Date.now();active.sessionFrom=progressPercent(active.book,{chapter:active.chapter,char:active.char})}if(getSession())scheduleSync()}});
window.addEventListener('online',()=>{loadFeed();scheduleSync()});
$('#tocList').addEventListener('click',e=>{const btn=e.target.closest('[data-chapter]');if(!btn||!active)return;active.chapter=Number(btn.dataset.chapter);active.char=0;active.pageHistory=[];$('#tocMenu').hidden=true;renderPage()});
function findItem(id){return feed.find(x=>x.id===id)||latest('history:'+id)?.item||latest('favorite:'+id)}
document.addEventListener('click',e=>{const target=e.target.closest('[data-target]');if(target){navigate(target.dataset.target);return}const open=e.target.closest('[data-open-book]');if(open){openBook(open.dataset.openBook);return}const cb=e.target.closest('[data-chat-book]');if(cb){chatAboutBook(cb.dataset.chatBook);return}const fav=e.target.closest('[data-favorite]');if(fav){const item=findItem(fav.dataset.favorite);if(!item)return;const key='favorite:'+item.id;emit(key,'favorite',latest(key)?null:{id:item.id,title:item.titleZh||item.title,source:item.source,url:item.url,note:'',savedAt:new Date().toISOString()});renderAll();return}const unfav=e.target.closest('[data-unfavorite]');if(unfav){emit('favorite:'+unfav.dataset.unfavorite,'favorite',null);renderAll();return}const vote=e.target.closest('[data-vote]');if(vote){const item=findItem(vote.dataset.vote);emit('feedback:'+vote.dataset.vote,'feedback',{value:Number(vote.dataset.value),sourceId:item?.sourceId||'',tags:item?.tags||[]});renderAll();return}const link=e.target.closest('[data-open-article]');if(link){const item=findItem(link.dataset.openArticle);if(item)emit('history:'+item.id,'history',{status:'opened',item,openedAt:new Date().toISOString()})}});
$$('#interestTabs button').forEach(b=>b.addEventListener('click',()=>{lane=b.dataset.lane;$$('#interestTabs button').forEach(n=>n.classList.toggle('selected',n===b));renderDiscover()}));$('#refreshNews').onclick=loadFeed;
function chatAboutBook(id){const book=booksInfo().find(x=>x.__id===id);if(!book)return;const progress=latest('progress:'+id);emit('discussion:'+crypto.randomUUID(),'discussion',{bookId:id,title:book.title,at:new Date().toISOString(),topic:'用户主动开启 ChatGPT 阅读讨论'});const context=`我正在阅读《${book.title}》${book.author?'（'+book.author+'）':''}。目前阅读进度约 ${progress?.percent||0}%，第 ${(progress?.chapter||0)+1} 章。请围绕我已经读到的部分与我展开讨论，先不要剧透后续章节。\n\n我想讨论的问题：`;navigator.clipboard?.writeText(context).then(()=>toast('讨论上下文已复制，打开 ChatGPT 粘贴')).catch(()=>toast('请选择并复制讨论上下文'));window.open('https://chatgpt.com/','_blank','noopener')}
function migrateLegacy(raw){if(!raw||![1,2,3].includes(raw.version)||(raw.version!==1&&!Array.isArray(raw.favorites)))throw Error('不是支持的 Lee 信息首页备份');let count=0;function add(key,type,val){if(latest(key)!==null)return;emit(key,type,val,false);count++}
 for(const f of (raw.favorites||[])){if(!f?.id||!f.url)continue;add('favorite:'+f.id,'favorite',{...f,title:f.titleZh||f.title||'',savedAt:f.savedAt||new Date().toISOString()})}
 for(const [id,val] of Object.entries(raw.feedback||{})){if(val)add('feedback:'+id,'feedback',val)}for(const v of (raw.votes||raw.legacyVotes||[])){if(v?.id&&[-1,0,1].includes(v.value))add('feedback:'+v.id,'feedback',{value:v.value,tags:[],sourceId:''})}for(const [id,val] of Object.entries(raw.history||{})){if(val)add('history:'+id,'history',val)}
 for(const n of raw.notes||[]){if(n?.id)add('note:'+n.id,'note',n)}for(const [id,val] of Object.entries(raw.sourcePrefs||{})){add('sourcePref:'+id,'sourcePref',val)}for(const c of raw.custom||[]){if(c?.id)add('custom:'+c.id,'custom',c)}
 if(raw.daily?.date)add('daily:'+raw.daily.date,'daily',{ids:raw.daily.cards||[],shown:raw.daily.shownIds||[]});persist();renderAll();scheduleSync();return count}
$('#importOld').onclick=()=>{const raw=localStorage.getItem('lee.discovery.v2');if(!raw){toast('当前浏览器没有旧数据，请使用「导入备份」');return}try{const n=migrateLegacy(JSON.parse(raw));toast(`只读迁移完成：${n} 项；原站未被修改`)}catch(e){toast('迁移失败：'+e.message)}};
$('#backupFile').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>6*1024*1024)throw Error('备份超过 6 MB，请先检查文件内容');const obj=JSON.parse(await file.text());if(Array.isArray(obj.events)&&obj.kind==='lee-reader-export'){const had=new Set(events.map(x=>x.id));const accepted=obj.events.filter(x=>x?.id&&x.key&&!had.has(x.id));events.push(...accepted);persist();renderAll();toast(`恢复了 ${accepted.length} 条记录`);scheduleSync()}else{const n=migrateLegacy(obj);toast(`导入旧版收藏/记录 ${n} 项`)}}catch(ex){toast('导入失败：'+ex.message)}};
function downloadJSON(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#exportData').onclick=()=>downloadJSON({kind:'lee-reader-export',version:1,exportedAt:new Date().toISOString(),events},'Lee-Reader-个人数据备份.json');
$('#exportJournal').onclick=()=>downloadJSON({kind:'lee-reader-journal',version:1,exportedAt:new Date().toISOString(),books:booksInfo(),progress:typed('progress:'),sessions:typed('session:'),articles:typed('history:'),discussions:typed('discussion:')},'Lee-Reader-阅读日志.json');
$('#saveCloud').onclick=()=>{try{setConfig($('#cloudUrl').value,$('#cloudKey').value);toast('同步连接信息已保存到当前设备')}catch(e){toast(e.message)}};
$('#signIn').onclick=async()=>{try{await signin($('#email').value,$('#password').value);$('#password').value='';$('#cloudMessage').textContent='登录成功，正在合并本地与云端历史…';await doSync();renderProfile()}catch(e){$('#cloudMessage').textContent=e.message}};
$('#signUp').onclick=async()=>{try{await signup($('#email').value,$('#password').value);$('#password').value='';$('#cloudMessage').textContent='注册已提交；如果服务要求邮箱验证，请先查收邮件。'}catch(e){$('#cloudMessage').textContent=e.message}};
$('#signOut').onclick=()=>{signOut();renderProfile();toast('已退出云同步，原有本地记录保留')};$('#syncNow').onclick=()=>doSync(true);
$('#shareCurrentBook').onclick=async()=>{try{const recent=booksInfo().find(b=>latest('progress:'+b.__id))||booksInfo()[0];if(!recent)throw Error('书架尚无书籍');const b=await loadBook(recent.__id);if(!b)throw Error('本机没有这本书的正文');if(!confirm(`仅上传《${b.title}》到你的私有云书架，供 Mac 按需读取？`))return;await uploadCurrentBook(b);toast('当前书籍已存入私人书库，Mac 可按需读取')}catch(e){toast(e.message)}};
$('#getCurrentBook').onclick=async()=>{try{const b=await downloadCurrentBook();await saveBook(b);localBooks=await listLocalBooks();if(!latest('book:'+b.id))emit('book:'+b.id,'book',{title:b.title,author:b.author,format:b.format,chapterCount:b.chapters.length,length:b.length,importedAt:b.importedAt,quality:b.quality});renderAll();toast('已读取当前书籍：'+b.title)}catch(e){toast(e.message)}};
let syncing=false;async function doSync(show=false){if(syncing||!getSession()||!navigator.onLine){if(show)toast('请先登录私人同步账户并联网');return}syncing=true;$('#syncBadge').textContent='同步中…';try{const fromCloud=await syncEvents(events),old=new Set(events.map(e=>e.id));let n=0;for(const e of fromCloud){if(!old.has(e.id)){events.push(e);n++}}if(n)persist();$('#syncBadge').textContent='已同步';$('#cloudMessage').textContent='上次同步：'+new Date().toLocaleTimeString('zh-CN')+(n?` · 合并 ${n} 项远端记录`:' · 没有新记录');if(n)renderAll();if(show)toast('同步完成')}catch(e){$('#syncBadge').textContent='离线保留';$('#cloudMessage').textContent='同步未完成：'+e.message;if(show)toast(e.message)}finally{syncing=false}}
function scheduleSync(){clearTimeout(syncTimer);if(getSession())syncTimer=setTimeout(()=>doSync(),1500)}
setInterval(()=>{if(getSession()&&navigator.onLine)doSync()},90000);
async function boot(){try{localBooks=await listLocalBooks()}catch(e){toast('本地书库暂不可用：'+e.message)}const cache=readJSON('lee.reader.feed.cache',{});if(cache.feed?.length){feed=cache.feed;feedUpdated=cache.feedUpdated||''}renderAll();loadFeed();if(getSession())scheduleSync();if('serviceWorker' in navigator &&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});}
boot();
