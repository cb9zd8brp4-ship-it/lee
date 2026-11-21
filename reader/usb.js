/* Native USB event bridge. No cloud keys, user accounts, or background network.
   On web browsers this module is a no-op and local reading continues unchanged. */
const MAX_BYTES = 5.5 * 1024 * 1024;
const bridge = () => {
 const cap=globalThis.Capacitor;
 return typeof cap?.nativePromise === 'function' ? cap : null;
};
export function usbAvailable(){return !!bridge()}
const call=(method,payload={})=>{const cap=bridge();return cap?cap.nativePromise('ReaderUsb',method,payload):Promise.resolve(null)};
export async function exportUsbEvents(events){
 if(!usbAvailable())return false;
 if(!Array.isArray(events))throw Error('Reading events are malformed');
 const data=JSON.stringify({kind:'lee-reader-export',version:1,exportedAt:new Date().toISOString(),events});
 if(new TextEncoder().encode(data).length>MAX_BYTES)throw Error('记录超过同步容量，请先归档旧记录');
 await call('saveSnapshot',{data});return true;
}
export async function getUsbInbox(){
 if(!usbAvailable())return null;
 const result=await call('readInbox');
 if(!result?.data)return null;
 if(result.data.length>MAX_BYTES)throw Error('USB 导入数据过大');
 const value=JSON.parse(result.data);
 if(value?.kind!=='lee-reader-export'||!Array.isArray(value.events))throw Error('USB 导入不是 Lee Reader 阅读记录');
 if(value.events.length>30000)throw Error('USB 导入记录过多');
 for(const event of value.events){
  if(!event||typeof event.id!=='string'||event.id.length>100||typeof event.key!=='string'||event.key.length>500||
   typeof event.at!=='string'||!Number.isFinite(Date.parse(event.at)))throw Error('USB 导入含非法事件');
 }
 return value.events;
}
export async function acknowledgeUsbInbox(){if(usbAvailable())await call('acknowledgeInbox')}
