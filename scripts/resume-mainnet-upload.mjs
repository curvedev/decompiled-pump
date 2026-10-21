#!/usr/bin/env node
// Resume only the exact approved binary in its existing project buffer.
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey,Transaction} from '@solana/web3.js';
import {LOADER,GENESIS} from '../lib/operator-recovery.mjs';
import {loaderWrite} from '../lib/operator-upload.mjs';
const base58=bytes=>{const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n,out='';for(const b of bytes)n=n*256n+BigInt(b);while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}for(const b of bytes){if(b!==0)break;out='1'+out;}return out;};
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=(ok,message)=>{if(!ok)throw new Error('DEPUMP: '+message);};
async function rpc(fn){for(let n=0;n<4;n++){try{return await fn();}catch(e){if(n===3||!/429|503|fetch failed|Too Many Requests/i.test(e.message))throw e;await sleep((n+1)*2000);}}}
try{
 const {values:v}=parseArgs({options:{execute:{type:'boolean'},approval:{type:'string'},'operator-dir':{type:'string'}}});check(v.execute&&v.approval&&v['operator-dir'],'explicit execution, approval and operator directory required');
 const operator=realpathSync(v['operator-dir']);check(relative(root,operator).startsWith('..'),'operator storage must stay outside the repository');
 const c=JSON.parse(readFileSync(resolve(root,'research/mainnet-candidate.json'))),approval=JSON.parse(readFileSync(v.approval)),binary=readFileSync(resolve(root,'target/mainnet/depump.so')),hash=createHash('sha256').update(binary).digest('hex');
 check(approval.approved===true&&approval.max_total_debit_lamports===1350000000&&approval.binary_sha256===hash,'approval or exact binary mismatch');
 for(const role of ['program','deployer','upgrade_authority','treasury','recovery'])check(approval[role]===c[role],'approved role mismatch');
 const tested=JSON.parse(readFileSync(resolve(root,'research/mainnet-local-tests.json')));check(tested.passed&&tested.checks>=42&&tested.binarySha256===hash,'candidate lacks matching protocol evidence');
 const native=JSON.parse(readFileSync(resolve(root,'research/upload-local-tests.json')));check(native.passed&&native.checks>=8,'native loader writes must be tested');
 const key=name=>{try{return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolve(operator,name+'.json')))));}catch{throw new Error('DEPUMP: invalid private signer file');}};
 const payer=key('deployer'),authority=key('upgrade-authority');check(payer.publicKey.toBase58()===c.deployer&&authority.publicKey.toBase58()===c.upgrade_authority,'wrong scoped signer');
 const connection=new Connection(c.rpc,{commitment:'confirmed',disableRetryOnRateLimit:true});check(c.rpc==='https://api.mainnet-beta.solana.com'&&c.genesis===GENESIS&&await rpc(()=>connection.getGenesisHash())===GENESIS,'mainnet genesis mismatch');
 const bufferKey=new PublicKey(c.upload_buffer),programKey=new PublicKey(c.program);
 const [buffer,program]=await rpc(()=>connection.getMultipleAccountsInfo([bufferKey,programKey]));check(!program,'program already exists; no upgrade allowed');
 check(buffer&&buffer.owner.equals(LOADER)&&buffer.data.length===binary.length+37&&buffer.data.readUInt32LE()===1&&buffer.data[4]===1&&new PublicKey(buffer.data.subarray(5,37)).equals(authority.publicKey),'wrong buffer state, authority or size');
 const todo=[];for(let offset=0;offset<binary.length;offset+=900){const bytes=binary.subarray(offset,offset+900);if(!buffer.data.subarray(37+offset,37+offset+bytes.length).equals(bytes))todo.push({offset,bytes});}
 const balance=await rpc(()=>connection.getBalance(payer.publicKey));
 check(balance+buffer.lamports<=approval.max_total_debit_lamports,'unexpected project funding; review budget accounting');
 const programRent=await rpc(()=>connection.getMinimumBalanceForRentExemption(binary.length+45));check(balance>=programRent+10000000+todo.length*10000,'remaining approved balance does not cover completion');
 console.log(JSON.stringify({resuming_chunks:todo.length,chunk_bytes:900,buffer:c.upload_buffer,maximum_write_fees_lamports:todo.length*10000}));
 for(let i=0;i<todo.length;i++){
  const {offset,bytes}=todo[i],block=await rpc(()=>connection.getLatestBlockhash());
  const tx=new Transaction({feePayer:payer.publicKey,recentBlockhash:block.blockhash}).add(loaderWrite(bufferKey,authority.publicKey,offset,bytes));
  const fee=(await rpc(()=>connection.getFeeForMessage(tx.compileMessage()))).value;check(fee===10000,'unexpected base write fee');tx.sign(payer,authority);
  const raw=tx.serialize(),signature=base58(tx.signature);writeFileSync(resolve(operator,'upload-signed-'+offset+'-'+Date.now()+'.bin'),raw,{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({prepared_offset:offset,signature}));
  const broadcast=async()=>{try{const submitted=await rpc(()=>connection.sendRawTransaction(raw,{skipPreflight:false,maxRetries:2}));check(submitted===signature,'unexpected signature returned');}catch(e){if(!/already.*processed/i.test(e.message))throw e;}};
  await broadcast();
  let confirmed=false;
  for(let poll=0;poll<30;poll++){
   await sleep(1500);const status=(await rpc(()=>connection.getSignatureStatuses([signature]))).value[0];check(!status?.err,'write failed; inspect the named buffer before resuming');
   if(status?.confirmationStatus==='confirmed'||status?.confirmationStatus==='finalized'){confirmed=true;break;}
   // Rebroadcast the identical bytes only: the transaction ID and fee cannot duplicate.
   if(poll===6||poll===16)await broadcast();
  }
  check(confirmed,'write confirmation uncertain; inspect its printed signature before any retry');
  console.log(JSON.stringify({completed:i+1,total:todo.length,offset,signature}));await sleep(1000);
 }
 const complete=await rpc(()=>connection.getAccountInfo(bufferKey));check(complete?.owner.equals(LOADER)&&complete.data.subarray(37).equals(binary),'buffer differs from the approved binary');
 const receipt={date:new Date().toISOString(),program:c.program,buffer:c.upload_buffer,binary_sha256:hash,resumed_chunks:todo.length,exact_buffer_match:true,finalization_submitted:false};
 writeFileSync(resolve(operator,'upload-complete.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt));
}catch(e){console.error(e.message?.startsWith('DEPUMP:')?e.message:'DEPUMP: upload interrupted; inspect the named buffer and printed signatures. Private keys are not printed.');process.exitCode=1;}
