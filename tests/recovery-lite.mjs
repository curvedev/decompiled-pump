import {Keypair,PublicKey,Transaction,TransactionInstruction} from '@solana/web3.js';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareRecovery,validateRecovery,LOADER,GENESIS} from '../lib/operator-recovery.mjs';

const {LiteSVM,FailedTransactionMetadata}=await import(process.env.LITESVM_MODULE||'litesvm');
const svm=new LiteSVM();
svm.warpToSlot(100n);
const keys=Object.fromEntries(['program','deployer','upgrade_authority','treasury','recovery','upload_buffer'].map(role=>[role,Keypair.generate()]));
const c={genesis:GENESIS,...Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,v.publicKey.toBase58()]))};
for(const name of ['deployer','upgrade_authority','treasury','recovery'])svm.airdrop(keys[name].publicKey,2_000_000_000n);
// This adapter uses the local bank, never a network endpoint. Genesis is pinned
// to exercise the mainnet-only planner with ephemeral local signers.
const rpc={
 getGenesisHash:async()=>GENESIS,
 getLatestBlockhash:async()=>({blockhash:svm.latestBlockhash(),lastValidBlockHeight:1000}),
 getBlockHeight:async()=>1,
 getFeeForMessage:async message=>({value:message.header.numRequiredSignatures*5000}),
 getBalance:async key=>Number(svm.getAccount(key)?.lamports||0),
 getAccountInfo:async key=>{const a=svm.getAccount(key);return a?{...a,data:Buffer.from(a.data)}:null;},
 getProgramAccounts:async()=>[],
};
const balance=key=>BigInt(svm.getAccount(key)?.lamports||0);
let checks=0;
const check=(value,label)=>{assert(value,label);checks++;};
function send(tx,signers){
 tx.sign(...signers);
 const result=svm.sendTransaction(tx);
 if(result instanceof FailedTransactionMetadata)throw new Error('Local loader transaction failed: '+result.err()+' '+result.meta().logs().join('\n'));
 return result;
}

const buffer=Buffer.alloc(37+100);
buffer.writeUInt32LE(1);buffer[4]=1;
keys.upgrade_authority.publicKey.toBuffer().copy(buffer,5);
const rent=svm.minimumBalanceForRentExemption(BigInt(buffer.length));
svm.setAccount(keys.upload_buffer.publicKey,{owner:LOADER,data:buffer,lamports:rent,executable:false,rentEpoch:0n});
const before=balance(keys.recovery.publicKey);
const bufferPlan=await prepareRecovery(rpc,c,{kind:'buffer'});
send(await validateRecovery(rpc,c,bufferPlan),[keys.deployer,keys.upgrade_authority]);
check(balance(keys.upload_buffer.publicKey)===0n,'buffer closed');
check(balance(keys.recovery.publicKey)-before===rent,'exact buffer lamports refunded');

svm.expireBlockhash();
const binary=readFileSync('target/mainnet/depump.so');
svm.addProgramWithLoader(keys.program.publicKey,new Uint8Array(binary),LOADER);
const program=svm.getAccount(keys.program.publicKey);
check(program.owner.equals(LOADER)&&Buffer.from(program.data).readUInt32LE()===2,'upgradeable program state');
const pd=new PublicKey(program.data.slice(4,36)),state=svm.getAccount(pd),data=Buffer.from(state.data);
data[12]=1;keys.upgrade_authority.publicKey.toBuffer().copy(data,13);
svm.setAccount(pd,{...state,data});
// The loader forbids retiring a program in its deployment slot.
svm.warpToSlot(101n);
const beforeRetire=balance(keys.recovery.publicKey);
const retire=await prepareRecovery(rpc,c,{kind:'retire',retirementAcknowledgement:'RETIRE '+c.program});
send(await validateRecovery(rpc,c,retire),[keys.deployer,keys.upgrade_authority]);
check(balance(pd)===0n,'ProgramData rent closed');
check(balance(keys.recovery.publicKey)-beforeRetire===BigInt(state.lamports),'exact ProgramData rent refunded');
// Closing ProgramData can leave the small executable Program account in place.
// warpToSlot changes the clock, not LiteSVM's warm program cache. Reconstruct
// a fresh bank from the actual remaining accounts to test loader resolution.
const cold=new LiteSVM();cold.warpToSlot(102n);
for(const address of [keys.program.publicKey,pd,keys.deployer.publicKey]){
 const account=svm.getAccount(address);if(account&&account.lamports>0)cold.setAccount(address,account);
}
const invoke=new Transaction({feePayer:keys.deployer.publicKey,recentBlockhash:cold.latestBlockhash()}).add(new TransactionInstruction({programId:keys.program.publicKey,keys:[],data:Buffer.from([255])}));
invoke.sign(keys.deployer);
const retiredResult=cold.sendTransaction(invoke);
check(retiredResult instanceof FailedTransactionMetadata&&String(retiredResult.err()).includes('UnsupportedProgramId')&&retiredResult.meta().logs().includes('Program is not deployed'),'retired program cannot execute in a fresh bank');

svm.expireBlockhash();
const beforeSweep=balance(keys.recovery.publicKey),sourceBefore=balance(keys.treasury.publicKey);
const sweep=await prepareRecovery(rpc,c,{kind:'wallet',sourceRole:'treasury'});
send(await validateRecovery(rpc,c,sweep),[keys.treasury]);
check(balance(keys.treasury.publicKey)===0n,'role wallet swept after fee');
check(balance(keys.recovery.publicKey)-beforeSweep===sourceBefore-BigInt(sweep.feeLamports),'exact wallet amount recovered');

const result={date:new Date().toISOString(),runtime:'LiteSVM local bank with native upgradeable loader and System Program',binarySha256:createHash('sha256').update(binary).digest('hex'),passed:true,checks,buffer_refund_verified:true,programdata_refund_verified:true,wallet_sweep_verified:true,mainnet_transactions_sent:0,limits:['Simulated empty project; no launched coins','Post-retirement invocation uses a fresh bank; warm-cache invalidation is not modeled','Does not test a browser wallet or mainnet network submission','ProgramData rent recovery is retirement, not liquidity recovery; the small Program account remains']};
writeFileSync('research/recovery-local-tests.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
