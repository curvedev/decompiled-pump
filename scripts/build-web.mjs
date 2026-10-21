import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,rmSync,renameSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const rpc=process.env.VITE_RPC_URL||'https://api.devnet.solana.com';
if(rpc!=='https://api.devnet.solana.com'&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rpc))throw new Error('Review a custom public RPC configuration before embedding it in a browser bundle');
const sourceFiles=['programs/depump/src/lib.rs','programs/depump/src/math.rs','programs/depump/src/identity.rs','web/protocol.ts','web/client.ts','web/wallet.ts','web/main.ts','web/style.css','README.md','docs/protocol.md','docs/interface.md','research/binary-manifest.json'];
writeFileSync('web/source-content.generated.json',JSON.stringify(Object.fromEntries(sourceFiles.map(path=>[path,readFileSync(path,'utf8')]))));
const binary=require.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`);
rmSync('dist',{recursive:true,force:true});mkdirSync('dist/assets',{recursive:true});
execFileSync(binary,['web/main.ts','--bundle','--format=esm','--platform=browser','--target=es2022','--minify','--legal-comments=eof','--loader:.woff2=file','--outfile=dist/assets/main.js','--define:import.meta.env='+JSON.stringify({VITE_RPC_URL:rpc})],{stdio:'inherit'});
const versioned={};
for(const ext of ['js','css']){
  const file=`dist/assets/main.${ext}`,hash=createHash('sha256').update(readFileSync(file)).digest('hex').slice(0,12);
  versioned[ext]=`main.${hash}.${ext}`;renameSync(file,`dist/assets/${versioned[ext]}`);
}
let html=readFileSync('index.html','utf8').replace('/web/main.ts',`./assets/${versioned.js}`).replace('</head>',`<link rel="stylesheet" href="./assets/${versioned.css}"></head>`);
writeFileSync('dist/index.html',html);writeFileSync('dist/.nojekyll','');copyFileSync('web/fonts/OFL.txt','dist/assets/Geist-OFL.txt');
console.log('Static frontend built without source maps.');
