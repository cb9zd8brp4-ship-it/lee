import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('reader/usb.js','utf8');
const usb=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('USB bridge is optional in web contexts',async()=>{
 delete globalThis.Capacitor;
 assert.equal(usb.usbAvailable(),false);
 assert.equal(await usb.exportUsbEvents([]),false);
 assert.equal(await usb.getUsbInbox(),null);
});
test('USB exchange validates IDs and never accepts malformed event packets',async()=>{
 let inbox=null,snapshot=null,ack=0;
 globalThis.Capacitor={nativePromise:async(_plugin,method,payload)=>{
  if(method==='saveSnapshot'){snapshot=JSON.parse(payload.data);return{saved:true}}
  if(method==='readInbox')return{data:inbox?JSON.stringify(inbox):''};
  if(method==='acknowledgeInbox'){ack++;return{}}
  throw Error('unexpected method');
 }};
 assert.equal(usb.usbAvailable(),true);
 const e={id:'123e4567-e89b-42d3-a456-426614174000',device:'redmi',key:'progress:book1',type:'progress',at:'2026-11-12T10:00:00Z',value:{chapter:3,char:20}};
 assert.equal(await usb.exportUsbEvents([e]),true);
 assert.equal(snapshot.events.length,1);
 inbox={kind:'lee-reader-export',events:[e]};
 assert.equal((await usb.getUsbInbox()).length,1);
 await usb.acknowledgeUsbInbox();assert.equal(ack,1);
 inbox={kind:'lee-reader-export',events:[{id:'bad',key:null,at:'oops'}]};
 await assert.rejects(usb.getUsbInbox(),/非法/);
});
test('Mac sync uses private app folder and strict event-id merging',()=>{
 const py=readFileSync('mac/reader_usb_sync.py','utf8');
 assert.match(py,/Android\/data\/\{APP_ID\}/);
 assert.match(py,/merged = \{e\["id"\]: e for e in local\}/);
 assert.match(py,/LEE_READER_AUTO_START/);
 const native=readFileSync('android-wrapper/native/ReaderUsbPlugin.java','utf8');
 assert.match(native,/getExternalFilesDir\(null\)/);
 assert.match(native,/@CapacitorPlugin\(name = "ReaderUsb"\)/);
});
