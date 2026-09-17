const test=require('node:test'),assert=require('node:assert/strict'),C=require('../web/core.js');
const now=Date.parse('2026-09-13T08:00:00Z');
function fixture(count=50){
  const sources=Array.from({length:10},(_,n)=>({id:'s'+n,name:'来源'+n,url:'https://example.org/source/'+n,weight:1}));
  const items=Array.from({length:count},(_,n)=>C.item({
    id:'i'+String(n).padStart(2,'0'),title:'Article '+n,titleZh:'中文文章 '+n,excerpt:'English summary '+n,
    excerptZh:'这是第 '+n+' 条简体中文简介。',url:'https://example.org/a/'+n,source:'来源'+n%10,sourceId:'s'+n%10,
    publishedAt:'2026-09-12T01:00:00Z',type:n===0?'书':n===1?'纪录片':n===2?'新闻':'长文',
    direction:'know',tier:n%3===0?'explore':'core',evergreen:n===0,
    editorial:{version:3,eligible:true,score:8+(n%4)/10,exploration:n%3===0},
    viewingAccess:n===1?{mode:'zh-Hans',evidenceUrl:'https://example.org/subtitles',verifiedAt:'2026-09-12T00:00:00Z'}:{},
    tags:[n%2?'生活':'科学'],rights:n===0?'公共领域':'',downloadUrl:n===0?'https://example.org/a.epub':null
  }));
  return{schemaVersion:2,batchId:'first',generatedAt:'2026-09-13T00:00:00Z',sources,items,candidateIds:items.map(i=>i.id),newItemIds:[]};
}
test('每天首次固定出现 8 条，同一天候选池更新不会替换卡片',()=>{
  const s=C.blank(),f=fixture();C.ensureDaily(s,f,{now});
  assert.equal(s.daily.cards.length,8);assert.equal(s.daily.shownIds.length,8);
  const first=[...s.daily.cards],extra=C.item({...f.items[10],id:'new',url:'https://example.org/new',title:'New',titleZh:'新内容'});
  C.ensureDaily(s,{...f,batchId:'later',items:[extra,...f.items],candidateIds:['new',...f.candidateIds],newItemIds:['new']},{now:now+6*3600000});
  assert.deepEqual(s.daily.cards,first);
});
test('处理当前卡片会移走并有限补位，点开和明确反馈永久排除',()=>{
  const s=C.blank(),f=fixture();C.ensureDaily(s,f,{now});const opened=f.items.find(i=>i.id===s.daily.cards[0]);
  const next=C.handle(s,f,opened,'opened',{now:now+1000});
  assert(next);assert.equal(s.daily.cards.length,8);assert.equal(s.daily.shownIds.length,9);assert(!s.daily.cards.includes(opened.id));
  assert.equal(s.history[opened.id].status,'opened');
  for(const status of ['liked','neutral','disliked']){
    const i=f.items.find(x=>x.id===s.daily.cards[0]);C.handle(s,f,i,status,{now:now+2000});
    assert.equal(s.history[i.id].status,status);assert(!C.pool(s,f,now+100*86400000).some(x=>x.id===i.id));
  }
});
test('每日最多 12 个入口，额度用完后页面从 8 条逐步缩到 0',()=>{
  const s=C.blank(),f=fixture();C.ensureDaily(s,f,{now});
  for(let n=0;n<4;n++){const i=f.items.find(x=>x.id===s.daily.cards[0]);C.handle(s,f,i,'opened',{now:now+n+1})}
  assert.equal(s.daily.shownIds.length,12);assert.equal(s.daily.cards.length,8);
  while(s.daily.cards.length){const i=f.items.find(x=>x.id===s.daily.cards[0]);C.handle(s,f,i,'opened',{now:now+100})}
  assert.equal(s.daily.cards.length,0);assert.equal(s.daily.shownIds.length,12);
});
test('换掉不改变兴趣并进入冷却，冷却后可以重新候选',()=>{
  const s=C.blank(),f=fixture();C.ensureDaily(s,f,{now});const i=f.items.find(x=>x.id===s.daily.cards[0]);
  C.handle(s,f,i,'swapped',{now});assert.deepEqual(Object.keys(s.feedback),[]);assert.equal(s.history[i.id].status,'swapped');
  assert(!C.pool(s,f,now+6*86400000).some(x=>x.id===i.id));
  s.daily=null;assert(C.pool(s,f,now+8*86400000).some(x=>x.id===i.id));
});
test('后台新增内容只在处理当前卡片后的补位中生效',()=>{
  const s=C.blank(),f=fixture();C.ensureDaily(s,f,{now});const first=[...s.daily.cards];
  const fresh=C.item({...f.items[10],id:'fresh',url:'https://example.org/fresh',title:'Fresh',titleZh:'刚进入候选池'});
  const updated={...f,items:[fresh,...f.items],candidateIds:['fresh',...f.candidateIds],newItemIds:['fresh']};
  C.ensureDaily(s,updated,{now:now+3600000});assert.deepEqual(s.daily.cards,first);
  const current=f.items.find(x=>x.id===s.daily.cards[0]),replacement=C.handle(s,updated,current,'opened',{now:now+3600001});
  assert.equal(replacement.id,'fresh');assert(s.daily.cards.includes('fresh'));
});
test('三天模拟：每日 8 条互不重复，只展示内容进入冷却',()=>{
  const s=C.blank(),f=fixture(),days=[];
  for(let d=0;d<3;d++){C.ensureDaily(s,f,{now:now+d*86400000});days.push([...s.daily.cards]);}
  const all=days.flat();assert.equal(days[0].length,8);assert.equal(days[1].length,8);assert.equal(days[2].length,8);
  assert.equal(new Set(all).size,24);assert.equal(C.historyList(s).length,24);
  console.log('三天模拟',days.map((ids,n)=>({day:n+1,count:ids.length,ids})));
});
test('浏览记录保存内容快照、状态、出现次数并可备份恢复',()=>{
  const s=C.blank(),f=fixture();C.ensureDaily(s,f,{now});const i=f.items.find(x=>x.id===s.daily.cards[0]);
  s.favorites.push({...i,savedAt:new Date(now).toISOString(),status:'已聊',note:'我的备注'});
  C.handle(s,f,i,'favorite',{now:now+1});s.notes.push({id:'n',text:'偷到的判断',source:i.url,category:'思维',date:new Date(now).toISOString()});
  const restored=C.validate(JSON.parse(JSON.stringify(s))),h=C.historyList(restored).find(x=>x.id===i.id);
  assert.equal(h.status,'favorite');assert.equal(h.item.titleZh,i.titleZh);assert.equal(restored.favorites[0].note,'我的备注');assert.equal(restored.notes[0].text,'偷到的判断');
});
test('内容年龄按类型处理：新闻 14 天，长文 180 天，常青内容不限',()=>{
  const s=C.blank(),f=fixture(0),date=d=>new Date(now-d*86400000).toISOString();
  const base=C.item({...fixture().items[8],id:'long100',url:'https://example.org/long100',publishedAt:date(100)});
  const oldNews=C.item({...base,id:'news20',url:'https://example.org/news20',type:'新闻',publishedAt:date(20)});
  const evergreen=C.item({...base,id:'bookold',url:'https://example.org/bookold',type:'书',evergreen:true,publishedAt:date(1000)});
  f.items=[base,oldNews,evergreen];f.candidateIds=f.items.map(x=>x.id);
  assert.deepEqual(new Set(C.pool(s,f,now).map(x=>x.id)),new Set(['long100','bookold']));
});
test('不可用只记录可访问性，连续两次会暂停来源且不修改兴趣',()=>{
  const s=C.blank(),f=fixture(),i=f.items[5];assert.equal(C.reportUnavailable(s,i,now),false);assert.equal(C.reportUnavailable(s,i,now+1),true);
  assert(C.paused(s,i.sourceId,now+2));assert.deepEqual(Object.keys(s.feedback),[]);
  assert(C.pool(s,f,now+2).every(x=>x.sourceId!==i.sourceId));assert(!C.paused(s,i.sourceId,now+86400002));
});
test('来源屏蔽与海外开关作用于真实候选池',()=>{
  const s=C.blank(),f=fixture();s.sourcePrefs.s0='blocked';assert(C.pool(s,f,now).every(i=>i.sourceId!=='s0'));
  s.prefs.includeOverseas=false;assert.equal(C.pool(s,f,now).length,0);
});
test('旧版已看和收藏数据可迁移，危险链接被拒绝',()=>{
  const v2={version:2,notes:[],custom:[],favorites:[],feedback:{},sourcePrefs:{},availability:{},prefs:{includeOverseas:true},seen:{i00:{count:1,opened:true,at:new Date(now).toISOString()}}};
  const migrated=C.validate(v2);assert.equal(migrated.history.i00.status,'opened');assert.equal(C.safeUrl('javascript:alert(1)'),null);
});
test('复制给 Chat 的提示保留上下文并要求说明不确定性',()=>{
  const f=fixture(),quote={...f.items[4],type:'摘录',quote:'让我停下的一段话'};
  assert(C.articlePrompt(quote).includes(quote.quote));assert(C.articlePrompt(f.items[1]).includes('不要剧透'));
  assert(C.articlePrompt(f.items[0]).includes('试读'));assert(C.articlePrompt(f.items[4]).includes('不要编造'));
});
