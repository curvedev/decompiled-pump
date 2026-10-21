import {CONFIG} from '../web/network.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,SystemProgram,Transaction} from '@solana/web3.js';
import {connect,disconnect,sign,confirmSigned} from '../web/wallet.ts';
function mockWallet(key:Keypair,alter=false){
 const account={address:key.publicKey.toBase58(),publicKey:key.publicKey.toBytes(),chains:[CONFIG.chain]};
 return{features:{'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signTransaction':{
  supportedTransactionVersions:['legacy'],signTransaction:async(...inputs:any[])=>inputs.map(input=>{
   assert.equal(input.chain,CONFIG.chain);
   const tx=Transaction.from(input.transaction);
   if(alter)tx.instructions[0]=SystemProgram.transfer({fromPubkey:key.publicKey,toPubkey:Keypair.generate().publicKey,lamports:2});
   tx.partialSign(key);return{signedTransaction:tx.serialize()};
  })}}};
}
function transaction(key:Keypair){return new Transaction({feePayer:key.publicKey,recentBlockhash:PublicKey.default.toBase58()}).add(SystemProgram.transfer({fromPubkey:key.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1}));}
test('wallet batch retains the exact requested messages',async()=>{
 const key=Keypair.generate();await connect(mockWallet(key));const txs=[transaction(key),transaction(key)];
 const signed=await sign(txs);assert.equal(signed.length,2);assert(signed.every(t=>t.verifySignatures()));
 signed.forEach((t,i)=>assert(t.serializeMessage().equals(txs[i].serializeMessage())));await disconnect();
});
test('altered signed transaction is rejected',async()=>{
 const key=Keypair.generate();await connect(mockWallet(key,true));await assert.rejects(sign([transaction(key)]),/altered or incomplete/);await disconnect();
});
test('an uncertain send checks the same signature before considering a retry',async()=>{
 const key=Keypair.generate(),tx=transaction(key);tx.sign(key);let sends=0;
 const c:any={sendRawTransaction:async()=>{sends++;throw new Error('response lost');},getSignatureStatuses:async()=>({value:[{confirmationStatus:'confirmed',err:null}]}),getBlockHeight:async()=>1};
 const sig=await confirmSigned(c,tx,100,()=>{});assert(sig.length>20);assert.equal(sends,1);
});
test('failed broadcasts have a bounded retry count',async()=>{
 const key=Keypair.generate(),tx=transaction(key);tx.sign(key);let sends=0;
 const c:any={sendRawTransaction:async()=>{sends++;throw new Error('unavailable');},getSignatureStatuses:async()=>({value:[null]}),getBlockHeight:async()=>1};
 await assert.rejects(confirmSigned(c,tx,100,()=>{}),/Confirmation is uncertain/);assert.equal(sends,3);
});
