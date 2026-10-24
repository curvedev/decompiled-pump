import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,Transaction,VersionedTransaction} from '@solana/web3.js';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {connection,launch,pending} from '../web/client.ts';
import {connect,disconnect,base58} from '../web/wallet.ts';
import {CONFIG,MAINNET} from '../web/network.ts';
import {PROGRAM,pda,decodeCoin,type Metadata} from '../web/protocol.ts';

// Exercise the actual client against the exact program in a local synthetic bank.
// These signers and transactions never leave this process.
test('native client launch refreshes approvals, resumes interrupted metadata, and never repeats a sealed buy',async()=>{
 const runtime=await import(process.env.LITESVM_MODULE||'litesvm');
 const svm=new runtime.LiteSVM().withNativeMints(),Failed=runtime.FailedTransactionMetadata;
 const binary=MAINNET?'target/mainnet/depump.so':'target/deploy/depump.so';
 svm.addProgramFromFile(PROGRAM,binary);
 const key=Keypair.generate();svm.airdrop(key.publicKey,10_000_000_000n);
 const storage=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}});
 const saved=new Map<string,unknown>(),approvals:string[]=[];let height=1,confirmations=0,cancelAt=3;
 function patch(name:string,value:unknown){saved.set(name,(connection as any)[name]);(connection as any)[name]=value;}
 patch('getGenesisHash',async()=>CONFIG.genesis);
 patch('getAccountInfo',async(address:PublicKey)=>{const a=svm.getAccount(address);return a?{...a,data:Buffer.from(a.data)}:null;});
 patch('getLatestBlockhash',async()=>({blockhash:svm.latestBlockhash(),lastValidBlockHeight:height+150}));
 patch('simulateTransaction',async(tx:VersionedTransaction)=>{
  svm.withSigverify(false);
  const result=svm.simulateTransaction(tx);svm.withSigverify(true);
  return{value:result instanceof Failed?{err:String(result.err()),logs:result.meta().logs()}:{err:null,logs:[]}};
 });
 patch('sendRawTransaction',async(bytes:Uint8Array)=>{
  const tx=Transaction.from(bytes),result=svm.sendTransaction(tx);
  if(result instanceof Failed)throw new Error('Local bank rejected transaction: '+result.err());
  return base58(tx.signature!);
 });
 patch('confirmTransaction',async()=>{confirmations++;height+=200;svm.expireBlockhash();return{value:{err:null}};});
 const account={address:key.publicKey.toBase58(),publicKey:key.publicKey.toBytes(),chains:[CONFIG.chain]};
 const wallet={features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signTransaction':{supportedTransactionVersions:['legacy'],signTransaction:async(...inputs:any[])=>{
  assert.equal(inputs.length,1,'each approval has a fresh transaction');
  if(approvals.length===cancelAt)throw new Error('User declined this step');
  return inputs.map(input=>{assert.equal(input.chain,CONFIG.chain);const tx=Transaction.from(input.transaction);approvals.push(tx.recentBlockhash!);tx.partialSign(key);return{signedTransaction:tx.serialize()};});
 }}}};
 try{
  await connect(wallet);
  const data:Metadata={name:'Local launch',ticker:'LOCAL',description:'x'.repeat(1800),image:''};
  await assert.rejects(launch(data,1_000_000n,()=>{}),/User declined/);
  const record=pending();assert(record);assert.equal(confirmations,3);
  let coin=decodeCoin(pda('coin',new PublicKey(record.mint)),svm.getAccount(pda('coin',new PublicKey(record.mint)))!.data);
  assert.equal(coin.sealed,false);assert.equal(coin.realSol,0n);
  cancelAt=-1;const mint=await launch(record.metadata,BigInt(record.budget),()=>{},record);
  coin=decodeCoin(pda('coin',mint),svm.getAccount(pda('coin',mint))!.data);
  assert.equal(coin.sealed,true);assert(coin.realSol>0n);assert.equal(pending(),null);
  assert.equal(new Set(approvals).size,approvals.length,'old blockhashes expire between confirmed steps');
  const metadata=svm.getAccount(pda('meta',mint))!.data;
  assert.deepEqual(createHash('sha256').update(metadata).digest(),Buffer.from(coin.metadataHash));
  const before=svm.getAccount(key.publicKey)!.lamports,approvalsBefore=approvals.length;
  assert((await launch(data,1_000_000n,()=>{},record)).equals(mint));
  assert.equal(approvals.length,approvalsBefore);assert.equal(svm.getAccount(key.publicKey)!.lamports,before);
  assert(readFileSync(binary).length>0);
 }finally{
  await disconnect();for(const[name,value]of saved)(connection as any)[name]=value;delete(globalThis as any).localStorage;
 }
});
