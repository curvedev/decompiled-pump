import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,rmSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const rpc=process.env.VITE_RPC_URL||'https://api.devnet.solana.com';
if(rpc!=='https://api.devnet.solana.com'&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(rpc))throw new Error('Review a custom public RPC configuration before embedding it in a browser bundle');
const binary=require.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`);
rmSync('dist',{recursive:true,force:true});mkdirSync('dist/assets',{recursive:true});
execFileSync(binary,['web/main.ts','--bundle','--format=esm','--platform=browser','--target=es2022','--minify','--legal-comments=eof','--outfile=dist/assets/main.js','--define:import.meta.env='+JSON.stringify({VITE_RPC_URL:rpc})],{stdio:'inherit'});
const versioned={};
for(const ext of ['js','css']){
  const file=`dist/assets/main.${ext}`,hash=createHash('sha256').update(readFileSync(file)).digest('hex').slice(0,12);
  versioned[ext]=`main.${hash}.${ext}`;renameSync(file,`dist/assets/${versioned[ext]}`);
}
let html=readFileSync('index.html','utf8').replace('/web/main.ts',`./assets/${versioned.js}`).replace('</head>',`<link rel="stylesheet" href="./assets/${versioned.css}"></head>`);
writeFileSync('dist/index.html',html);writeFileSync('dist/.nojekyll','');
console.log('Static frontend built without source maps.');
