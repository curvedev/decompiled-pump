import {Keypair,Transaction} from '@solana/web3.js';
import {loaderWrite} from '../lib/operator-upload.mjs';
import {LOADER} from '../lib/operator-recovery.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const {LiteSVM,FailedTransactionMetadata}=await import(process.env.LITESVM_MODULE||'litesvm');
const svm=new LiteSVM(),payer=Keypair.generate(),authority=Keypair.generate(),buffer=Keypair.generate(),wrong=Keypair.generate();
svm.airdrop(payer.publicKey,1000000000n);
const data=Buffer.alloc(37+1000);data.writeUInt32LE(1);data[4]=1;authority.publicKey.toBuffer().copy(data,5);
svm.setAccount(buffer.publicKey,{owner:LOADER,lamports:svm.minimumBalanceForRentExemption(BigInt(data.length)),data,executable:false,rentEpoch:0n});
const payload=Buffer.alloc(900,123),instruction=loaderWrite(buffer.publicKey,authority.publicKey,40,payload);
assert.equal(instruction.data.readUInt32LE(),1);assert.equal(instruction.data.readUInt32LE(4),40);assert.equal(instruction.data.readBigUInt64LE(8),900n);
function send(ix,key){const tx=new Transaction({feePayer:payer.publicKey,recentBlockhash:svm.latestBlockhash()}).add(ix);tx.sign(payer,key);return svm.sendTransaction(tx);}
assert(!(send(instruction,authority) instanceof FailedTransactionMetadata));
const written=Buffer.from(svm.getAccount(buffer.publicKey).data);assert(written.subarray(77,977).equals(payload));assert(written.subarray(0,77).equals(data.subarray(0,77))&&written.subarray(977).equals(data.subarray(977)));
svm.expireBlockhash();assert(send(loaderWrite(buffer.publicKey,wrong.publicKey,40,Buffer.alloc(900,9)),wrong) instanceof FailedTransactionMetadata);assert(Buffer.from(svm.getAccount(buffer.publicKey).data).equals(written));
const report={date:new Date().toISOString(),runtime:'LiteSVM native upgradeable loader',passed:true,checks:8,scope:'Bounded loader Write encoding, exact range and payload, authority rejection and rollback',mainnet_transactions_sent:0};writeFileSync('research/upload-local-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
