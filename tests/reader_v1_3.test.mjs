import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const app=readFileSync('reader/app.js','utf8');
const html=readFileSync('reader/index.html','utf8');
const cap=JSON.parse(readFileSync('android-wrapper/capacitor.config.json','utf8'));

test('Android system navigation has native margin enforcement',()=>{
 assert.equal(cap.android.adjustMarginsForEdgeToEdge,'force');
 assert.match(html,/viewport-fit=cover/);
});
test('passwordless form has same-mailbox email verification UI',()=>{
 for(const id of ['email','emailCode','sendLoginEmail','verifyEmail'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/id="password"/);
});
test('dislike removes current discovery, replaces within quota, never resurfaces',()=>{
 const line=app.match(/^function dismissDiscovery\(id\)\{.*\}$/m);
 assert.ok(line,'cannot locate actual dismissDiscovery implementation');
 const daily={ids:['1','2','3','4','5','6','7','8'],shown:['1','2','3','4','5','6','7','8']};
 const feedback={'feedback:1':{value:-1},'feedback:9':{value:-1}};
 const persisted=[];
 const ctx={dailySet:()=>daily,typed:()=>[],feed:Array.from({length:11},(_,i)=>({id:String(i+1)})),latest:k=>feedback[k]||null,emit:(key,type,v)=>{persisted.push(v);daily.ids=v.ids;daily.shown=v.shown},day:()=> '2026-11-11'};
 const dismiss=vm.runInNewContext('('+line[0]+')',ctx);
 dismiss('1');
 assert.deepEqual([...daily.ids],['2','3','4','5','6','7','8','10']);
 assert.equal(daily.shown.length,9);
 dismiss('1');
 assert.equal(persisted.length,1);
});
test('dislike at daily cap removes card but does not expose a thirteenth',()=>{
 const line=app.match(/^function dismissDiscovery\(id\)\{.*\}$/m);
 const daily={ids:Array.from({length:12},(_,i)=>String(i+1)),shown:Array.from({length:12},(_,i)=>String(i+1))};
 const ctx={dailySet:()=>daily,typed:()=>[],feed:Array.from({length:18},(_,i)=>({id:String(i+1)})),latest:()=>null,emit:(_k,_t,v)=>{daily.ids=v.ids;daily.shown=v.shown},day:()=> '2026-11-11'};
 const dismiss=vm.runInNewContext('('+line[0]+')',ctx);
 dismiss('1');
 assert.equal(daily.ids.length,11);
 assert.equal(daily.shown.length,12);
});
test('Supabase passwordless accepts 6-digit codes and copied magic links',async()=>{
 const cloud=readFileSync('reader/cloud.js','utf8');
 const storage=new Map();
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val),removeItem:key=>storage.delete(key)};
 const requests=[];
 globalThis.fetch=async(url,options)=>{requests.push({url,body:options.body?JSON.parse(options.body):null});
 return {ok:true,text:async()=>JSON.stringify(url.endsWith('/otp')?{}:{access_token:'token',refresh_token:'refresh',user:{id:'11111111-1111-4111-8111-111111111111'},expires_in:3600})};};
 const api=await import('data:text/javascript;base64,'+Buffer.from(cloud).toString('base64'));
 await api.sendEmailLogin('reader@example.com');
 assert.equal(requests.at(-1).body.email,'reader@example.com');
 assert.equal(requests.at(-1).body.create_user,true);
 await api.verifyEmailLogin('reader@example.com','123456');
 assert.equal(requests.at(-1).body.type,'email');
 assert.equal(requests.at(-1).body.token,'123456');
 const hostname=new URL(api.getConfig().url).host;
 await api.verifyEmailLogin('reader@example.com',`https://${hostname}/auth/v1/verify?type=magiclink&token=sample-hash`);
 assert.equal(requests.at(-1).body.token_hash,'sample-hash');
 await assert.rejects(()=>api.verifyEmailLogin('reader@example.com','https://evil.example/auth/v1/verify?token=abc'),/只能使用/);
 assert.equal(Boolean(api.getSession()?.user?.id),true);
});
