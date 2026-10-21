import {Connection,Keypair,PublicKey,Transaction,ComputeBudgetProgram,sendAndConfirmTransaction,type TransactionInstruction} from '@solana/web3.js';
import {createAssociatedTokenAccountIdempotentInstruction,getAssociatedTokenAddressSync,getAccount,getMint} from '@solana/spl-token';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {PROGRAM,TREASURY,SUPPLY,REAL_TOKEN,pda,decodeCoin,createInstruction,writeInstruction,sealInstruction,tradeInstruction,claimInstruction,graduateInstruction,quote} from '../web/protocol.ts';
// Explicit free-test-SOL network and role checks. No mainnet URL is accepted.
const c=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:async(input,init)=>{
 await delay(1000);
 for(let attempt=0;;attempt++){const response=await fetch(input,init);if(![429,503].includes(response.status)||attempt===3)return response;await response.arrayBuffer();await delay(5000*2**attempt);}
}});
assert.equal(await c.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const keyPath=process.argv[2];assert(keyPath,'Provide the project devnet deployer keypair path');
const user=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath,'utf8'))));
assert(user.publicKey.equals(TREASURY),'Only the dedicated devnet role is allowed');
assert((await c.getAccountInfo(PROGRAM))?.executable,'Deploy and verify the independent program first');
type Checkpoint={mint:string,before:number,transactions:{action:string,signature:string}[]};
const checkpointPath=join(dirname(keyPath),'devnet-smoke-checkpoint.json');
const saved:Checkpoint|null=existsSync(checkpointPath)?JSON.parse(readFileSync(checkpointPath,'utf8')):null;
const mintKey=saved?null:Keypair.generate(),mint=saved?new PublicKey(saved.mint):mintKey!.publicKey;
const address=pda('coin',mint),ata=getAssociatedTokenAddressSync(mint,user.publicKey);
const before=saved?.before??await c.getBalance(user.publicKey);assert(await c.getBalance(user.publicKey)>200_000_000,'At least 0.2 free devnet SOL is required');
const transactions=saved?.transactions??[];let checks=0;
const ok=(condition:unknown)=>{assert(condition);checks++;};
function checkpoint(){writeFileSync(checkpointPath,JSON.stringify({mint:mint.toBase58(),before,transactions},null,2)+'\n');}
const done=(action:string)=>transactions.some(t=>t.action===action);
async function send(action:string,ixs:TransactionInstruction[],signers=[user]){
 const signature=await sendAndConfirmTransaction(c,new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({units:300_000}),...ixs),signers,{commitment:'finalized',preflightCommitment:'confirmed'});
 transactions.push({action,signature});checkpoint();console.log(action,signature);
}
async function state(){const info=await c.getAccountInfo(address);assert(info);assert(info.owner.equals(PROGRAM));const value=decodeCoin(address,info.data);assert(value.creator.equals(user.publicKey));return value;}
async function invariant(){const s=await state(),info=(await c.getAccountInfo(address))!,rent=await c.getMinimumBalanceForRentExemption(204),vault=await getAccount(c,s.vault);ok(BigInt(info.lamports)===BigInt(rent)+(s.phase?s.poolSol:s.realSol)+s.creatorFees+s.platformFees);ok(vault.amount===(s.phase?s.poolToken:s.realToken+SUPPLY-REAL_TOKEN));}
const bytes=Buffer.from(JSON.stringify({name:'Protocol Verification',ticker:'TEST',description:'A free devnet lifecycle check. No market value. Not the DEPUMP project token.',image:''}));
if(!done('create'))await send('create',[createInstruction(user.publicKey,mint,bytes,createHash('sha256').update(bytes).digest())],[user,mintKey!]);
if(!done('seal metadata'))await send('seal metadata',[writeInstruction(user.publicKey,mint,0,bytes),sealInstruction(user.publicKey,mint),createAssociatedTokenAccountIdempotentInstruction(user.publicKey,ata,user.publicKey,mint)]);
const token=await getMint(c,mint);ok(token.supply===SUPPLY&&token.mintAuthority===null&&token.freezeAuthority===null);
const amount=100_000_000_000_000n;
if(!done('curve buy')){const s=await state(),q=quote(s,amount,true);ok(q.total<200_000_000n);await send('curve buy',[tradeInstruction(user.publicKey,s,amount,q.total,true)]);await invariant();}
if(!done('curve sell')){const s=await state(),q=quote(s,amount/2n,false);await send('curve sell',[tradeInstruction(user.publicKey,s,amount/2n,q.total,false)]);await invariant();}
if(!done('creator and platform claims')){let s=await state();ok(s.creatorFees>0n&&s.platformFees>0n);await send('creator and platform claims',[claimInstruction(user.publicKey,s),claimInstruction(user.publicKey,s,false)]);s=await state();ok(s.creatorFees===0n&&s.platformFees===0n);await invariant();}
if(!done('complete curve')){const s=await state(),q=quote(s,s.realToken,true);ok(q.total<200_000_000n);await send('complete curve',[tradeInstruction(user.publicKey,s,s.realToken,q.total,true)]);}
await invariant();
if(!done('graduate')){const s=await state();ok(s.realToken===0n);await send('graduate',[graduateInstruction(s)]);}
let s=await state();ok(s.phase===1&&s.poolSol>0n&&s.poolToken>0n);await invariant();
if(!done('pool buy')){const product=s.poolSol*s.poolToken,q=quote(s,1_000_000_000_000n,true);await send('pool buy',[tradeInstruction(user.publicKey,s,1_000_000_000_000n,q.total,true)]);s=await state();ok(s.poolSol*s.poolToken>=product);await invariant();}
if(!done('pool sell')){s=await state();const product=s.poolSol*s.poolToken,q=quote(s,500_000_000_000n,false);await send('pool sell',[tradeInstruction(user.publicKey,s,500_000_000_000n,q.total,false)]);s=await state();ok(s.poolSol*s.poolToken>=product);await invariant();}
const statuses=await c.getSignatureStatuses(transactions.map(t=>t.signature),{searchTransactionHistory:true});ok(statuses.value.every(v=>v&&v.err===null&&v.confirmationStatus==='finalized'));
const after=await c.getBalance(user.publicKey);ok(before-after<200_000_000);
const report={date:new Date().toISOString(),cluster:'devnet',commitment:'finalized',program:PROGRAM.toBase58(),test_mint:mint.toBase58(),test_ticker:'TEST',project_token_created:false,checks_in_final_run:checks,resumed_after_rpc_rate_limit:!!saved,passed:true,transactions,test_wallet_net_lamports_used:before-after,limits:['Free test SOL only','Single dedicated operator signs this smoke test; distinct-role authorization is covered by local tests','No browser-extension wallet approval exercised','Not a security audit']};
writeFileSync('research/devnet-smoke-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks,test_mint:report.test_mint}));
