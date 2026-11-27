import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(readFileSync(path,'utf8')).toString('base64'));
const catalog=await load('reader/catalog.js');
const feeds=await load('reader/feeds.js');
test('Gutenberg: source with permission and EPUB becomes downloadable',()=>{
 const item=catalog.parseGutenbergBook({id:23950,title:'Three Kingdoms',authors:[{name:'Luo Guanzhong'}],languages:['zh'],copyright:false,
  formats:{'application/epub+zip':'https://www.gutenberg.org/ebooks/23950.epub3.images','text/plain; charset=utf-8':'https://www.gutenberg.org/ebooks/23950.txt.utf-8'}});
 assert.equal(item.status,'ready'); assert.equal(item.format,'epub');
 assert.match(catalog.validateDownloadLink(item),/^https:\/\/www\.gutenberg\.org/);
 assert.match(catalog.bookFilename(item),/\.epub$/);
});
test('Gutenberg: unknown-rights titles cannot be silently downloaded',()=>{
 const item=catalog.parseGutenbergBook({id:10,title:'Restricted Book',copyright:true,
  formats:{'application/epub+zip':'https://www.gutenberg.org/ebooks/10.epub'}});
 assert.equal(item.status,'rights-review');
 assert.throws(()=>catalog.validateDownloadLink(item),/没有已确认/);
});
test('Cross-origin download links to non-catalog domains are denied',()=>{
 assert.throws(()=>catalog.validateDownloadLink({fileUrl:'https://localhost/private.epub',status:'ready',format:'epub'}),/可信书库/);
});
test('Catalog search returns Gutenberg ready results and non-importable Wikisource leads',async()=>{
 const fetcher=async url=>({ok:true,json:async()=>String(url).includes('gutendex')?
  {results:[{id:23950,title:'三国志演义',authors:[],copyright:false,languages:['zh'],formats:{'application/epub+zip':'https://www.gutenberg.org/ebooks/23950.epub3.images'}}]}:
  {query:{pages:{1:{title:'三国志演义'}}}}});
 const out=await catalog.searchPublicBooks('三国志演义',{fetcher});
 assert.equal(out.results.length,2);assert.equal(out.results[0].status,'ready');
 assert.equal(out.results[1].status,'online-only');
 assert.equal(out.errors.length,0);
});
test('Catalog fails gracefully if one provider is blocked',async()=>{
 const fetcher=async url=>{if(String(url).includes('gutendex'))throw Error('network unavailable');
  return {ok:true,json:async()=>({query:{pages:{1:{title:'西游记'}}}})}};
 const out=await catalog.searchPublicBooks('西游记',{fetcher});
 assert.equal(out.results[0].provider,'维基文库');assert.equal(out.errors.length,1);
});
test('RSS stream metadata strips tracking and avoids duplicate URLs',()=>{
 const a={id:'rss-1',title:'论文 A',url:'https://example.org/a?utm_source=abc',publishedAt:'2026-11-12T01:00:00Z'};
 const b={id:'rss-2',title:'论文 A2',url:'https://example.org/a',publishedAt:'2026-11-12T02:00:00Z'};
 const c={id:'rss-3',titleZh:'文章 B',url:'https://example.org/b',publishedAt:'2026-11-12T03:00:00Z'};
 const arr=feeds.mergeStreamItems([[a,b], [c]]);
 assert.equal(arr.length,2);assert.equal(arr[0].id,'rss-3');
 assert.equal(feeds.normalizeArticleLink(a.url),'https://example.org/a');
 assert.equal(feeds.compactSummary('<p>ABC</p><b>中文</b>'),'ABC 中文');
});
test('Phone app keeps independent auto RSS refresh and local book search',()=>{
 const app=readFileSync('reader/app.js','utf8');
 const html=readFileSync('reader/index.html','utf8');
 const cfg=JSON.parse(readFileSync('android-wrapper/capacitor.config.json','utf8'));
 assert.match(app,/searchPublicBooks/);assert.match(app,/refreshNewsStream/);
 assert.match(app,/bookFilename\(book\)/);assert.match(app,/reader\.stream\.v1/);
 assert.match(html,/id="catalogSearch"/);assert.match(html,/id="catalogList"/);
 assert.match(html,/id="streamStatus"/);
 assert.equal(cfg.plugins.CapacitorHttp.enabled,true);
 const sw=readFileSync('reader/sw.js','utf8');
 assert.match(sw,/catalog\.js/);assert.match(sw,/feeds\.js/);
});
