import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey,SystemProgram,Transaction} from '@solana/web3.js';
import {prepareRecovery,validateRecovery,verifySigned,LOADER,GENESIS} from '../lib/operator-recovery.mjs';
function fixture(){
 const keys=Object.fromEntries(['program','deployer','upgrade_authority','treasury','recovery','upload_buffer'].map(k=>[k,Keypair.generate()]));
 const c={genesis:GENESIS,...Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,v.publicKey.toBase58()]))};
 const accounts=new Map();for(const role of ['deployer','treasury','recovery','upgrade_authority'])accounts.set(c[role],{owner:SystemProgram.programId,data:Buffer.alloc(0),lamports:1_000_000});
 const buffer=Buffer.alloc(37);buffer.writeUInt32LE(1);buffer[4]=1;keys.upgrade_authority.publicKey.toBuffer().copy(buffer,5);accounts.set(c.upload_buffer,{owner:LOADER,data:buffer,lamports:700_000_000});
 const pd=Keypair.generate().publicKey;const program=Buffer.alloc(36);program.writeUInt32LE(2);pd.toBuffer().copy(program,4);accounts.set(c.program,{owner:LOADER,executable:true,data:program,lamports:800_000});
 const data=Buffer.alloc(45);data.writeUInt32LE(3);data[12]=1;keys.upgrade_authority.publicKey.toBuffer().copy(data,13);accounts.set(pd.toBase58(),{owner:LOADER,data,lamports:640_000_000});
 const rpc={getGenesisHash:async()=>GENESIS,getLatestBlockhash:async()=>({blockhash:PublicKey.default.toBase58(),lastValidBlockHeight:100}),getAccountInfo:async key=>accounts.get(key.toBase58())||null,getBalance:async key=>accounts.get(key.toBase58())?.lamports||0,getFeeForMessage:async()=>({value:5000}),getBlockHeight:async()=>1,getProgramAccounts:async()=>[]};
 return{c,keys,accounts,rpc,pd};
}
test('wallet recovery leaves exactly the quoted fee and signs only the reviewed message',async()=>{
 const f=fixture(),p=await prepareRecovery(f.rpc,f.c,{kind:'wallet'});assert.equal(p.lamports,'995000');assert.equal(p.feeLamports,5000);
 const tx=await validateRecovery(f.rpc,f.c,p);assert.equal(tx.instructions.length,1);assert(tx.instructions[0].programId.equals(SystemProgram.programId));tx.sign(f.keys.deployer);assert(verifySigned(f.c,p,tx.serialize()).verifySignatures());
});
test('mutated recipient, extra instruction and changed signed messages are rejected',async()=>{
 const f=fixture(),p=await prepareRecovery(f.rpc,f.c,{kind:'wallet'});
 await assert.rejects(validateRecovery(f.rpc,f.c,{...p,recipient:Keypair.generate().publicKey.toBase58()}),/recipient/);
 const tx=Transaction.from(Buffer.from(p.unsignedTransaction,'base64'));tx.add(SystemProgram.transfer({fromPubkey:f.keys.deployer.publicKey,toPubkey:f.keys.treasury.publicKey,lamports:1}));
 await assert.rejects(validateRecovery(f.rpc,f.c,{...p,unsignedTransaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64')}),/changed/);
 tx.sign(f.keys.deployer);assert.throws(()=>verifySigned(f.c,p,tx.serialize()),/differs/);
});
test('buffer recovery closes only the configured buffer under its actual authority',async()=>{
 const f=fixture(),p=await prepareRecovery(f.rpc,f.c,{kind:'buffer'}),tx=await validateRecovery(f.rpc,f.c,p);const ix=tx.instructions[0];assert(ix.programId.equals(LOADER));assert.equal(ix.data.readUInt32LE(),5);assert.equal(ix.keys.length,3);assert(ix.keys[0].pubkey.equals(f.keys.upload_buffer.publicKey));
 tx.sign(f.keys.deployer,f.keys.upgrade_authority);verifySigned(f.c,p,tx.serialize());
 await assert.rejects(validateRecovery(f.rpc,f.c,{...p,target:f.c.program}),/only this deployment buffer/);
 f.accounts.get(f.c.upload_buffer).data[5]^=1;await assert.rejects(validateRecovery(f.rpc,f.c,p),/authority mismatch/);
});
test('retirement requires explicit acknowledgement and includes the associated program',async()=>{
 const f=fixture();await assert.rejects(prepareRecovery(f.rpc,f.c,{kind:'retire'}),/acknowledgement/);
 const p=await prepareRecovery(f.rpc,f.c,{kind:'retire',retirementAcknowledgement:'RETIRE '+f.c.program});const tx=await validateRecovery(f.rpc,f.c,p);assert.equal(tx.instructions[0].keys.length,4);assert.equal(tx.instructions[0].keys[3].pubkey.toBase58(),f.c.program);
});
test('retirement refuses a valid launched coin even if its SOL balances look empty',async()=>{
 const f=fixture(),mint=Keypair.generate().publicKey,data=Buffer.alloc(204);Buffer.from('DEPUMP01').copy(data);mint.toBuffer().copy(data,40);
 f.rpc.getProgramAccounts=async()=>[{pubkey:PublicKey.findProgramAddressSync([Buffer.from('coin'),mint.toBuffer()],f.keys.program.publicKey)[0],account:{data}}];
 await assert.rejects(prepareRecovery(f.rpc,f.c,{kind:'retire',retirementAcknowledgement:'RETIRE '+f.c.program}),/launched coins would be stranded/);
});
test('wrong network, expired plan and non-wallet recipients fail before signing',async()=>{
 const f=fixture(),p=await prepareRecovery(f.rpc,f.c,{kind:'wallet'});f.rpc.getGenesisHash=async()=>PublicKey.default.toBase58();await assert.rejects(validateRecovery(f.rpc,f.c,p),/genesis mismatch/);
 f.rpc.getGenesisHash=async()=>GENESIS;f.rpc.getBlockHeight=async()=>101;await assert.rejects(validateRecovery(f.rpc,f.c,p),/expired/);
 f.rpc.getBlockHeight=async()=>1;f.accounts.get(f.c.recovery).owner=LOADER;await assert.rejects(validateRecovery(f.rpc,f.c,p),/standard SOL wallet/);
});
test('platform recovery is limited to accrued platform fees and the fixed treasury',async()=>{
 const f=fixture(),mint=Keypair.generate().publicKey,coin=PublicKey.findProgramAddressSync([Buffer.from('coin'),mint.toBuffer()],f.keys.program.publicKey)[0],data=Buffer.alloc(204);Buffer.from('DEPUMP01').copy(data);mint.toBuffer().copy(data,40);data.writeBigUInt64LE(5000n,145);f.accounts.set(coin.toBase58(),{owner:f.keys.program.publicKey,data,lamports:1_000_000});
 const p=await prepareRecovery(f.rpc,f.c,{kind:'platform-fees',mint:mint.toBase58()});const tx=await validateRecovery(f.rpc,f.c,p);assert.equal(tx.instructions[0].data[0],7);assert.equal(tx.instructions[0].keys[0].pubkey.toBase58(),f.c.treasury);tx.sign(f.keys.deployer,f.keys.treasury);verifySigned(f.c,p,tx.serialize());
 data.writeBigUInt64LE(0n,145);await assert.rejects(validateRecovery(f.rpc,f.c,p),/no platform fees/);
});
