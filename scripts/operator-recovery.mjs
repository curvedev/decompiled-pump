#!/usr/bin/env node
// Local backend. Preparation is read-only; signing is local; submission is a separate explicit command.
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,basename} from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {Connection,Keypair,PublicKey,VersionedTransaction} from '@solana/web3.js';
import {prepareRecovery,validateRecovery,verifySigned} from '../lib/operator-recovery.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {values:v,positionals}=parseArgs({allowPositionals:true,options:{kind:{type:'string'},plan:{type:'string'},out:{type:'string'},recipient:{type:'string'},'source-role':{type:'string'},mint:{type:'string'},'retire-ack':{type:'string'},keypair:{type:'string',multiple:true},execute:{type:'boolean',default:false}}});
const c=JSON.parse(readFileSync(resolve(root,'research/mainnet-candidate.json'),'utf8'));
const connection=new Connection(c.rpc,{commitment:'confirmed',disableRetryOnRateLimit:true});
const privatePath=s=>{if(!s)throw new Error('Recovery: an explicit private output file is required');const p=resolve(s);let parent=p;const suffix=[];while(!existsSync(parent)){suffix.unshift(basename(parent));parent=dirname(parent);}const actual=resolve(realpathSync(parent),...suffix),rel=relative(realpathSync(root),actual);if(rel===''||(!rel.startsWith('..')&&!rel.startsWith('/')))throw new Error('Recovery: plans and signed artifacts must stay outside the repository');return actual;};
const save=(path,data)=>{const p=privatePath(path);mkdirSync(dirname(p),{recursive:true,mode:0o700});writeFileSync(p,data,{mode:0o600,flag:'wx'});};
try{
 const action=positionals[0];
 if(action==='prepare'){
  const p=await prepareRecovery(connection,c,{kind:v.kind,sourceRole:v['source-role'],recipient:v.recipient,mint:v.mint,retirementAcknowledgement:v['retire-ack']});
  save(v.out,JSON.stringify(p,null,2)+'\n');
  console.log(JSON.stringify({prepared:true,kind:p.kind,recipient:p.recipient,lamports:p.lamports||'chain-account amount',feeLamports:p.feeLamports,requiredSigners:p.requiredSigners,messageSha256:p.messageSha256,submitted:false},null,2));
 }else if(action==='sign'){
  const p=JSON.parse(readFileSync(privatePath(v.plan),'utf8'));const tx=await validateRecovery(connection,c,p,v.recipient);
  const signers=(v.keypair||[]).map(path=>Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path,'utf8')))));
  const expected=tx.compileMessage().accountKeys.slice(0,tx.compileMessage().header.numRequiredSignatures).map(k=>k.toBase58());
  if(signers.length!==expected.length||!expected.every(address=>signers.some(k=>k.publicKey.toBase58()===address)))throw new Error('Recovery: signer public keys do not match the reviewed transaction');
  tx.sign(...signers);verifySigned(c,p,tx.serialize());save(v.out,tx.serialize());console.log(JSON.stringify({signed:true,submitted:false,recipient:p.recipient,messageSha256:p.messageSha256}));
 }else if(action==='submit'){
  if(!v.execute)throw new Error('Recovery: submission requires --execute');
  const p=JSON.parse(readFileSync(privatePath(v.plan),'utf8'));await validateRecovery(connection,c,p,v.recipient);const signed=readFileSync(privatePath(v.out)),tx=verifySigned(c,p,signed);
  const simulation=await connection.simulateTransaction(VersionedTransaction.deserialize(signed),{sigVerify:true});
  if(simulation.value.err)throw new Error('Recovery: simulation failed; no transaction submitted');
  const signature=await connection.sendRawTransaction(signed,{skipPreflight:false,maxRetries:1});
  const result=await connection.confirmTransaction({signature,blockhash:p.blockhash,lastValidBlockHeight:p.lastValidBlockHeight},'finalized');
  if(result.value.err)throw new Error('Recovery: transaction failed; inspect its signature');
  console.log(JSON.stringify({confirmed:true,signature,recipient:p.recipient}));
 }else throw new Error('Recovery: use prepare, sign, or submit. See docs/operator-recovery.md.');
}catch(error){console.error(error.message?.startsWith('Recovery:')?error.message:'Recovery operation failed. Inspect the supplied inputs and public chain state locally; no private key is printed.');process.exitCode=1;}
