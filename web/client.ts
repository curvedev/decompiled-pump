import {CONFIG,networkLabel,storageKey} from './network.ts';
import {Connection,PublicKey,Keypair,Transaction,VersionedTransaction,ComputeBudgetProgram,TransactionInstruction} from '@solana/web3.js';
import {createAssociatedTokenAccountIdempotentInstruction,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {PROGRAM,RPC,pda,decodeCoin,createInstruction,writeInstruction,sealInstruction,tradeInstruction,freshCoin,tokensForBudget,quote,encoder,type Coin,type Metadata} from './protocol.ts';
import {account,sign,confirmSigned} from './wallet.ts';
const rpcFetch:typeof fetch=async(input,init)=>{
  for(let attempt=0;;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12_000);
    try{
      const response=await fetch(input,{...init,signal:controller.signal});
      if(response.status!==429||attempt===1)return response;
      await response.arrayBuffer();
    }catch(error){if(controller.signal.aborted)throw new Error(networkLabel+' RPC timed out. Refresh to try again.');throw error;}
    finally{clearTimeout(timer);}
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
};
export const connection=new Connection(RPC,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:rpcFetch});
export const localNetwork=/^http:\/\/(127\.0\.0\.1|localhost):/.test(RPC);
export const networkName=localNetwork?'Local validator':networkLabel;
let checked=false;
export async function networkCheck(){
  if(checked)return;
  const genesis=await connection.getGenesisHash();
  if(!localNetwork&&genesis!==CONFIG.genesis)throw new Error('Wrong network. This build requires '+networkLabel+'.');
  const info=await connection.getAccountInfo(PROGRAM);
  if(!info?.executable)throw new Error('The independent program has not been deployed on this network yet.');
  checked=true;
}
export async function readCoin(mint:PublicKey){
  const address=pda('coin',mint),info=await connection.getAccountInfo(address);
  if(!info||!info.owner.equals(PROGRAM))throw new Error('No coin found on this network');
  return decodeCoin(address,info.data);
}
export async function metadata(coin:Coin):Promise<Metadata>{
  const info=await connection.getAccountInfo(pda('meta',coin.mint));
  if(!info||!info.owner.equals(PROGRAM)||info.data.length!==coin.metadataLen)throw new Error('Metadata is unavailable');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(info.data)));
  if(!digest.every((b,i)=>b===coin.metadataHash[i]))throw new Error('Metadata integrity check failed');
  const data=JSON.parse(new TextDecoder().decode(info.data));
  if(typeof data.name!=='string'||typeof data.ticker!=='string'||typeof data.description!=='string'||typeof data.image!=='string')throw new Error('Metadata format is invalid');
  return data;
}
export async function listings(){
  await networkCheck();
  const values=await connection.getProgramAccounts(PROGRAM,{filters:[{dataSize:204}]});
  return values.flatMap(a=>{try{const coin=decodeCoin(a.pubkey,a.account.data);return coin.sealed?[coin]:[];}catch{return[];}});
}
export type Update=(message:string,signature?:string)=>void;
async function prepared(ixs:TransactionInstruction[]){
  if(!account)throw new Error('Connect a wallet first');
  const block=await connection.getLatestBlockhash('confirmed');
  const tx=new Transaction({feePayer:new PublicKey(account.publicKey),...block}).add(ComputeBudgetProgram.setComputeUnitLimit({units:300_000}),...ixs);
  if(tx.serialize({requireAllSignatures:false,verifySignatures:false}).length>1232)throw new Error('Transaction is too large');
  return{tx,block};
}
export async function sendAction(ixs:TransactionInstruction[],update:Update){
  await networkCheck();const{tx,block}=await prepared(ixs);
  update('Checking transaction…');
  const sim=await connection.simulateTransaction(new VersionedTransaction(tx.compileMessage()),{sigVerify:false});
  if(sim.value.err)throw new Error('Simulation failed. '+readable(sim.value.logs));
  update('Approve in your wallet');const[signed]=await sign([tx]);
  const signature=await confirmSigned(connection,signed,block.lastValidBlockHeight,s=>update('Confirming transaction…',s));
  tradeHistoryCache.clear();update('Confirmed',signature);return signature;
}
function readable(logs:string[]|null|undefined){return(logs||[]).filter(l=>/error|failed|insufficient/i.test(l)).slice(-2).join(' ').slice(0,400)||'No funds were moved.';}
export type Pending={mint:string;creator:string;metadata:Metadata;budget:string};
export function pending():Pending|null{try{return JSON.parse(localStorage.getItem(storageKey('pending'))||'null');}catch{return null;}}
export async function launch(data:Metadata,budget:bigint,update:Update,resume?:Pending){
  await networkCheck();if(!account)throw new Error('Connect a wallet first');
  const user=new PublicKey(account.publicKey);
  if(resume&&resume.creator!==user.toBase58())throw new Error('Connect the wallet that started this launch');
  const keypair=resume?null:Keypair.generate(),mint=resume?new PublicKey(resume.mint):keypair!.publicKey;
  const bytes=encoder.encode(JSON.stringify(data));
  if(bytes.length>4096)throw new Error('The image and description are too large. Use a smaller image or shorter description.');
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes)));
  const existing=await connection.getAccountInfo(pda('coin',mint));
  if(existing){const value=decodeCoin(pda('coin',mint),existing.data);if(value.sealed){localStorage.removeItem(storageKey('pending'));return mint;}if(!value.creator.equals(user))throw new Error('Launch belongs to a different creator');}
  if(resume&&!existing)throw new Error('No partial launch exists. Start a new launch.');
  const block=await connection.getLatestBlockhash('confirmed');
  const txs:Transaction[]=[];
  function append(ixs:TransactionInstruction[]){const tx=new Transaction({feePayer:user,...block}).add(ComputeBudgetProgram.setComputeUnitLimit({units:300_000}),...ixs);if(tx.serialize({requireAllSignatures:false,verifySignatures:false}).length>1232)throw new Error('Transaction exceeds network size');txs.push(tx);return tx;}
  if(!existing){const tx=append([createInstruction(user,mint,bytes,hash)]);tx.partialSign(keypair!);}
  for(let offset=0;offset<bytes.length;offset+=600)append([writeInstruction(user,mint,offset,bytes.slice(offset,offset+600))]);
  const final=[sealInstruction(user,mint)];
  if(budget>0n){const coin=freshCoin(mint,user),amount=tokensForBudget(coin,budget);if(amount===0n)throw new Error('Initial buy is too small');const ata=getAssociatedTokenAddressSync(mint,user);final.push(createAssociatedTokenAccountIdempotentInstruction(user,ata,user,mint),tradeInstruction(user,coin,amount,budget,true));}
  append(final);
  update('Checking launch…');
  const sim=await connection.simulateTransaction(new VersionedTransaction(txs[0].compileMessage()),{sigVerify:false});
  if(sim.value.err)throw new Error('Launch simulation failed. '+readable(sim.value.logs));
  update('Approve launch in your wallet');const signed=await sign(txs);
  localStorage.setItem(storageKey('pending'),JSON.stringify({mint:mint.toBase58(),creator:user.toBase58(),metadata:data,budget:budget.toString()}));
  for(let i=0;i<signed.length;i++)await confirmSigned(connection,signed[i],block.lastValidBlockHeight,s=>update(`Confirming launch ${i+1} of ${signed.length}…`,s));
  localStorage.removeItem(storageKey('pending'));update('Coin launched');return mint;
}
type HistoryPoint={time:number;price:number;side:string;signature:string};
type HistoryEntry={expires:number;loading:boolean;promise:Promise<HistoryPoint[]>};
const tradeHistoryCache=new Map<string,HistoryEntry>();
export async function history(coin:Coin,force=false){
  const key=coin.mint.toBase58(),cached=tradeHistoryCache.get(key);
  if(cached&&(cached.loading||(!force&&cached.expires>Date.now())))return cached.promise;
  const entry={} as HistoryEntry;
  entry.loading=true;entry.expires=Infinity;
  entry.promise=readHistory(coin).then(points=>{entry.loading=false;entry.expires=Date.now()+60_000;return points;}).catch(error=>{if(tradeHistoryCache.get(key)===entry)tradeHistoryCache.delete(key);throw error;});
  tradeHistoryCache.set(key,entry);
  if(tradeHistoryCache.size>100)tradeHistoryCache.delete(tradeHistoryCache.keys().next().value!);
  return entry.promise;
}
async function readHistory(coin:Coin){
  const signatures=await connection.getSignaturesForAddress(coin.address,{limit:30});
  const points:{time:number;price:number;side:string;signature:string}[]=[];
  // Bounded history. No claim that these are complete candles or an indexer.
  for(const sig of signatures.slice(0,16).reverse()){
    if(sig.err)continue;
    const tx=await connection.getTransaction(sig.signature,{maxSupportedTransactionVersion:0});
    const stack:string[]=[];
    for(const log of tx?.meta?.logMessages||[]){
      const invoke=log.match(/^Program (\w+) invoke \[\d+\]$/);if(invoke){stack.push(invoke[1]);continue;}
      if(/^Program \w+ (success|failed:)/.test(log)){stack.pop();continue;}
      if(stack.at(-1)!==PROGRAM.toBase58())continue;
      const m=log.match(/^Program log: DEPUMP_TRADE (buy|sell) (\d+) (\d+)/);
      if(m&&BigInt(m[2])>0n)points.push({time:sig.blockTime||0,price:Number(BigInt(m[3]))/Number(BigInt(m[2]))/1000,side:m[1],signature:sig.signature});
    }
  }return points;
}
