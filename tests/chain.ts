import {Connection,Keypair,Transaction,TransactionInstruction,PublicKey,sendAndConfirmTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,getAccount,getMint} from '@solana/spl-token';
import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {PROGRAM,TREASURY,createInstruction,writeInstruction,sealInstruction,tradeInstruction,graduateInstruction,claimInstruction,decodeCoin,pda,quote,REAL_TOKEN,SUPPLY} from '../web/protocol.ts';

const endpoint=process.env.LOCAL_RPC||'http://127.0.0.1:8899';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(endpoint))throw new Error('Chain tests are restricted to localhost');
let svm:any=null,Failed:any=null;
const lite=process.env.CHAIN_RUNTIME==='lite';
if(lite){const runtime=await import(process.env.LITESVM_MODULE||'litesvm');svm=new runtime.LiteSVM().withNativeMints();Failed=runtime.FailedTransactionMetadata;svm.addProgramFromFile(PROGRAM,'target/deploy/depump.so');}
const connection=new Connection(endpoint,'confirmed');
const c:any=lite?{
  requestAirdrop:async(key:PublicKey,n:number)=>{svm.airdrop(key,BigInt(n));return'airdrop';},
  confirmTransaction:async()=>({value:{err:null}}),
  getAccountInfo:async(key:PublicKey)=>{const a=svm.getAccount(key);return a?{...a,data:Buffer.from(a.data)}:null;},
  getMinimumBalanceForRentExemption:async(n:number)=>Number(svm.minimumBalanceForRentExemption(BigInt(n))),
}:connection;
const user=Keypair.generate(),stranger=Keypair.generate(),mint=Keypair.generate();
let checks=0;
const ok=(condition:unknown,message:string)=>{assert(condition,message);checks++;};
async function send(ixs:TransactionInstruction[],signers:Keypair[]=[user]){
  if(lite){
    svm.expireBlockhash();
    const tx=new Transaction({feePayer:signers[0].publicKey,recentBlockhash:svm.latestBlockhash()}).add(ComputeBudgetProgram.setComputeUnitLimit({units:300_000}),...ixs);tx.sign(...signers);
    const result=svm.sendTransaction(tx);if(result instanceof Failed){const error:any=new Error(String(result.err()));error.logs=result.meta().logs();throw error;}return'ok';
  }
  return sendAndConfirmTransaction(c,new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({units:300_000}),...ixs),signers,{commitment:'confirmed'});
}
async function reject(ixs:TransactionInstruction[],label:string,signers:Keypair[]=[user]){
  let failed=false;try{await send(ixs,signers);}catch{failed=true;}ok(failed,label);
}
const coinAddress=pda('coin',mint.publicKey),meta=pda('meta',mint.publicKey);
const state=async()=>decodeCoin(coinAddress,(await c.getAccountInfo(coinAddress))!.data);
async function invariant(){
  const s=await state(),a=(await c.getAccountInfo(s.address))!,vault=await getAccount(c,s.vault);
  const rent=await c.getMinimumBalanceForRentExemption(204);
  const reserves=s.phase===0?s.realSol:s.poolSol;
  ok(BigInt(a.lamports)===BigInt(rent)+reserves+s.creatorFees+s.platformFees,'SOL liabilities conserved');
  ok(vault.amount===(s.phase===0?s.realToken+SUPPLY-REAL_TOKEN:s.poolToken),'token inventory conserved');
}
for(const who of [user,stranger]){const sig=await c.requestAirdrop(who.publicKey,10_000_000_000);await c.confirmTransaction(sig,'confirmed');}
const metadata=Buffer.from(JSON.stringify({name:'Local test coin',ticker:'TEST',description:'Generated during localhost verification',image:''}));
const hash=createHash('sha256').update(metadata).digest();
await send([createInstruction(user.publicKey,mint.publicKey,metadata,hash)],[user,mint]);
const s0=await state();
ok(s0.realToken===REAL_TOKEN,'initial token reserves');
const tokenMint=await getMint(c,mint.publicKey);
ok(tokenMint.mintAuthority===null&&tokenMint.freezeAuthority===null&&tokenMint.supply===SUPPLY,'fixed supply and no freeze authority');
const ata=getAssociatedTokenAddressSync(mint.publicKey,user.publicKey);
await send([createAssociatedTokenAccountIdempotentInstruction(user.publicKey,ata,user.publicKey,mint.publicKey)]);
await reject([tradeInstruction(user.publicKey,s0,1_000_000n,10_000n,true)],'unsealed metadata prevents trading');
await reject([sealInstruction(user.publicKey,mint.publicKey)],'metadata hash mismatch');
await reject([writeInstruction(stranger.publicKey,mint.publicKey,0,metadata)],'metadata ownership',[stranger]);
await send([writeInstruction(user.publicKey,mint.publicKey,0,metadata),sealInstruction(user.publicKey,mint.publicKey)]);
await reject([writeInstruction(user.publicKey,mint.publicKey,0,metadata)],'sealed metadata immutable');
await reject([graduateInstruction(await state())],'cannot graduate early');
const buyAmount=100_000_000_000_000n;
let s=await state(),q=quote(s,buyAmount,true);
await reject([tradeInstruction(user.publicKey,s,buyAmount,q.total-1n,true)],'buy slippage rejected');
ok((await state()).realSol===0n,'failed trade rolls back');
await send([tradeInstruction(user.publicKey,s,buyAmount,q.total,true)]);await invariant();
s=await state();q=quote(s,buyAmount/2n,false);
await reject([tradeInstruction(user.publicKey,s,buyAmount/2n,q.total+1n,false)],'sell slippage rejected');
const wrongVault=tradeInstruction(user.publicKey,s,buyAmount/2n,0n,false);wrongVault.keys[2].pubkey=ata;
await reject([wrongVault],'wrong vault rejected');
await reject([claimInstruction(stranger.publicKey,s)],'unauthorized creator claim',[stranger]);
await reject([claimInstruction(stranger.publicKey,s,false)],'unauthorized platform claim',[stranger]);
const noSignature=tradeInstruction(user.publicKey,s,buyAmount/2n,0n,false);noSignature.keys[0].isSigner=false;
// A separate payer keeps the trader unsigned.
await reject([noSignature],'trader signature required',[stranger]);
await send([tradeInstruction(user.publicKey,s,buyAmount/2n,q.total,false)]);await invariant();
s=await state();ok(s.creatorFees>0n&&s.platformFees>0n,'separate fees accrue');
await send([claimInstruction(user.publicKey,s)]);ok((await state()).creatorFees===0n,'creator fees claimed');await invariant();
await reject([claimInstruction(user.publicKey,await state())],'duplicate claim rejected');
if(process.env.TEST_TREASURY_KEYPAIR){
 const treasury=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.TEST_TREASURY_KEYPAIR,'utf8'))));
 ok(treasury.publicKey.equals(TREASURY),'test treasury matches compiled role');
 const sig=await c.requestAirdrop(treasury.publicKey,1_000_000_000);await c.confirmTransaction(sig,'confirmed');
 await send([claimInstruction(treasury.publicKey,await state(),false)],[treasury]);
 ok((await state()).platformFees===0n,'platform fees claimed by the fixed treasury');await invariant();
}
s=await state();q=quote(s,s.realToken,true);
await send([tradeInstruction(user.publicKey,s,s.realToken,q.total,true)]);await invariant();
s=await state();ok(s.realToken===0n,'curve exhaustion recorded');
await reject([tradeInstruction(user.publicKey,s,1_000_000n,1_000_000n,true)],'completed curve pauses before graduation');
await send([graduateInstruction(s)]);s=await state();ok(s.phase===1&&s.poolSol>0n&&s.poolToken>0n,'graduation uses real liquidity');
await send([graduateInstruction(s)]);await invariant();
const product=s.poolToken*s.poolSol, poolBuy=1_000_000_000_000n;
q=quote(s,poolBuy,true);await send([tradeInstruction(user.publicKey,s,poolBuy,q.total,true)]);await invariant();
s=await state();ok(s.poolToken*s.poolSol>=product,'pool product nondecreasing after buy');
const product2=s.poolToken*s.poolSol;
q=quote(s,poolBuy/2n,false);await send([tradeInstruction(user.publicKey,s,poolBuy/2n,q.total,false)]);await invariant();
s=await state();ok(s.poolToken*s.poolSol>=product2,'pool product nondecreasing after sell');
const unknown=new TransactionInstruction({programId:PROGRAM,keys:[],data:Buffer.from([8])});
await reject([unknown],'unsupported liquidity withdrawal opcode rejected');
writeFileSync('research/chain-test-results.json',JSON.stringify({date:new Date().toISOString(),network:lite?'LiteSVM synthetic local bank':'localhost validator',program:PROGRAM.toBase58(),binarySha256:createHash('sha256').update(readFileSync('target/deploy/depump.so')).digest('hex'),checks,passed:true,limits:['No browser wallet approval exercised','Not a security audit','Random runtime keys excluded from source']},null,2)+'\n');
console.log(JSON.stringify({passed:true,checks}));
