import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,type ParsedTransactionWithMeta} from '@solana/web3.js';
import {LaunchDiscovery,createdMints} from '../web/discovery.ts';
import {base58} from '../web/wallet.ts';
const program=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,other=Keypair.generate().publicKey;
function txFor(key=mint,inner=false):ParsedTransactionWithMeta{
 const pda=PublicKey.findProgramAddressSync([new TextEncoder().encode('coin'),key.toBytes()],program)[0],data=Buffer.alloc(35);data[1]=1;
 const ix={programId:program,data:base58(data),accounts:[other,pda,key,other,other,other,other]};
 return{meta:{err:null,innerInstructions:inner?[{index:0,instructions:[ix]}]:[]},transaction:{message:{instructions:inner?[]:[ix]}}}as unknown as ParsedTransactionWithMeta;
}
test('launch discovery identifies the actual Create ABI and derived coin address',()=>{assert.deepEqual(createdMints(txFor(),program),[mint.toBase58()]);});
test('failed transactions, other programs and forged coin PDAs cannot establish launches',()=>{
 const failed=txFor();failed.meta!.err={InstructionError:[0,'InvalidArgument']};assert.deepEqual(createdMints(failed,program),[]);
 assert.deepEqual(createdMints(txFor(),other),[]);const forged=txFor();(forged.transaction.message.instructions[0]as any).accounts[1]=other;assert.deepEqual(createdMints(forged,program),[]);
 const malformed=txFor();(malformed.transaction.message.instructions[0]as any).data='!';assert.deepEqual(createdMints(malformed,program),[]);
});
test('CPI creates are included and repeated create observations are deduplicated',()=>{const tx=txFor(mint,true);tx.transaction.message.instructions=(tx.meta!.innerInstructions![0].instructions as any);assert.deepEqual(createdMints(tx,program),[mint.toBase58()]);});
test('older activity uses the cursor, uses one transaction per request and retains discovered mints',async()=>{
 const discovery=new LaunchDiscovery(program),queries:any[]=[],sizes:number[]=[];let page=0;
 const rpc={getSignaturesForAddress:async(_p:PublicKey,options:any)=>{queries.push(options);return page++===0?Array.from({length:20},(_,i)=>({signature:'sig'+i,err:null})):[{signature:'older',err:null}];},getParsedTransactions:async(signatures:string[])=>{sizes.push(signatures.length);return signatures.map(s=>txFor(s==='older'?other:mint));}}as any;
 await discovery.scan(rpc);assert.equal(discovery.hasOlder,true);await discovery.scan(rpc,true);
 assert.equal(queries[1].before,'sig19');assert(sizes.every(n=>n<=1));assert.equal(discovery.hasOlder,false);assert.deepEqual(new Set(discovery.mints),new Set([mint.toBase58(),other.toBase58()]));
});
test('missing transaction data never advances discovery or produces a false empty result',async()=>{
 const discovery=new LaunchDiscovery(program);let missing:'transaction'|'metadata'|false='transaction';const rpc={getSignaturesForAddress:async()=>[{signature:'sig',err:null}],getParsedTransactions:async()=>[missing==='transaction'?null:missing==='metadata'?{...txFor(),meta:null}:txFor()]}as any;
 await assert.rejects(discovery.scan(rpc),/history is incomplete/);assert.equal(discovery.mints.size,0);missing='metadata';await assert.rejects(discovery.scan(rpc),/history is incomplete/);missing=false;await discovery.scan(rpc);assert.equal(discovery.mints.size,1);
});
test('failed signatures are skipped and exhausted history performs no older-page request',async()=>{
 const discovery=new LaunchDiscovery(program);let reads=0;const rpc={getSignaturesForAddress:async()=>{reads++;return[{signature:'failed',err:{InstructionError:[0,'InvalidArgument']}}];},getParsedTransactions:async()=>{throw new Error('Failed signatures must not be fetched');}}as any;
 await discovery.scan(rpc);await discovery.scan(rpc,true);assert.equal(discovery.mints.size,0);assert.equal(reads,1);
});
