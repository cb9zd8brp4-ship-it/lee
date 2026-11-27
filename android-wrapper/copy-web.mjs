import {cp,rm,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const www=path.join(root,'www');
await rm(www,{recursive:true,force:true});
await mkdir(www,{recursive:true});
await cp(path.join(root,'../reader'),www,{recursive:true});
await mkdir(path.join(www,'vendor'),{recursive:true});
await cp(path.join(root,'node_modules/jszip/dist/jszip.min.js'),path.join(www,'vendor/jszip.min.js'));
const feed=path.join(root,'../data/feed.json');
try {await access(feed);await cp(feed,path.join(www,'feed.json'));console.log('Offline feed bundled')}
catch {console.warn('No data/feed.json found; will load feed online when available')}
console.log('Lee Reader Android web assets ready');
