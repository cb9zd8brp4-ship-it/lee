import {copyFile,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const javaDir=path.join(root,'android/app/src/main/java/com/lee/reader');
const mainFile=path.join(javaDir,'MainActivity.java');
await mkdir(javaDir,{recursive:true});
await copyFile(path.join(root,'native/ReaderUsbPlugin.java'),path.join(javaDir,'ReaderUsbPlugin.java'));
let contents=await readFile(mainFile,'utf8');
if(!contents.includes('registerPlugin(ReaderUsbPlugin.class)')){
 if(!contents.includes('public class MainActivity extends BridgeActivity {'))throw Error('Unexpected Capacitor MainActivity');
 contents=contents.replace('public class MainActivity extends BridgeActivity {',`public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ReaderUsbPlugin.class);
        super.onCreate(savedInstanceState);
    }`);
 await writeFile(mainFile,contents);
}
console.log('Registered Lee Reader USB Android plugin');
