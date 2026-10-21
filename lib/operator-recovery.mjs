import {PublicKey,SystemProgram,Transaction,TransactionInstruction} from '@solana/web3.js';
import {createHash} from 'node:crypto';
export const LOADER=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
export const GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const pk=s=>new PublicKey(s),check=(ok,message)=>{if(!ok)throw new Error('Recovery: '+message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const roles=['deployer','upgrade_authority','treasury','recovery'];
export function instructionFor(c,p){
 check(p.program===c.program&&p.genesis===GENESIS&&p.network==='mainnet-beta','plan belongs to another deployment');
 const recipient=pk(p.recipient);
 if(p.kind==='wallet'){
  check(roles.includes(p.sourceRole),'unknown source role');check(p.source===c[p.sourceRole],'source role mismatch');
  check(p.recipient!==p.source,'recipient equals source');check(BigInt(p.lamports)>0n,'nothing to recover');
  return SystemProgram.transfer({fromPubkey:pk(p.source),toPubkey:recipient,lamports:BigInt(p.lamports)});
 }
 if(p.kind==='platform-fees'){
  const address=PublicKey.findProgramAddressSync([Buffer.from('coin'),pk(p.mint).toBuffer()],pk(c.program))[0];
  check(p.target===address.toBase58(),'coin PDA mismatch');
  return new TransactionInstruction({programId:pk(c.program),keys:[{pubkey:pk(c.treasury),isSigner:true,isWritable:true},{pubkey:address,isSigner:false,isWritable:true}],data:Buffer.from([7])});
 }
 check(p.kind==='buffer'||p.kind==='retire','unsupported recovery operation');
 check(p.kind!=='buffer'||p.target===c.upload_buffer,'only this deployment buffer is allowed');
 check([c.deployer,c.upgrade_authority].includes(p.authority),'unapproved loader authority');
 check(p.recipient!==p.target,'recipient equals closed account');
 const keys=[{pubkey:pk(p.target),isSigner:false,isWritable:true},{pubkey:recipient,isSigner:false,isWritable:true},{pubkey:pk(p.authority),isSigner:true,isWritable:false}];
 if(p.kind==='retire'){
  check(p.retirementAcknowledgement==='RETIRE '+c.program,'explicit program retirement acknowledgement required');
  check(p.authority===c.upgrade_authority,'wrong program authority');
  keys.push({pubkey:pk(c.program),isSigner:false,isWritable:true});
 }
 const data=Buffer.alloc(4);data.writeUInt32LE(5);
 return new TransactionInstruction({programId:LOADER,keys,data});
}
export function transactionFor(c,p){
 const payer=p.kind==='wallet'?c[p.sourceRole]:c.deployer;
 check(p.feePayer===payer,'unexpected fee payer');
 return new Transaction({feePayer:pk(payer),recentBlockhash:p.blockhash}).add(instructionFor(c,p));
}
export async function checkState(connection,c,p){
 check(c.genesis===GENESIS&&await connection.getGenesisHash()===GENESIS,'mainnet genesis mismatch');
 const recipient=await connection.getAccountInfo(pk(p.recipient));
 check(!recipient||recipient.owner.equals(SystemProgram.programId)&&recipient.data.length===0,'recipient must be a standard SOL wallet');
 if(p.kind==='wallet'){
  const source=await connection.getAccountInfo(pk(p.source));
  check(source&&source.owner.equals(SystemProgram.programId)&&source.data.length===0,'source must be the role wallet');
  check(BigInt(source.lamports)>=BigInt(p.lamports)+BigInt(p.feeLamports),'balance is below the reviewed amount and fee');
  return;
 }
 if(p.kind==='platform-fees'){
  check(p.recipient===c.treasury,'platform fees are paid only to the fixed treasury');
  const a=await connection.getAccountInfo(pk(p.target));
  check(a&&a.owner.equals(pk(c.program))&&a.data.length===204&&a.data.subarray(0,8).toString()==='DEPUMP01','invalid coin account');
  check(a.data.subarray(40,72).equals(pk(p.mint).toBuffer()),'coin mint mismatch');
  check(a.data.readBigUInt64LE(145)>0n,'no platform fees are claimable');return;
 }
 const target=await connection.getAccountInfo(pk(p.target));
 check(target&&target.owner.equals(LOADER),'loader account absent or wrong owner');
 const b=target.data,offset=p.kind==='buffer'?4:12;
 check(b.length>=offset+33&&b.readUInt32LE(0)===(p.kind==='buffer'?1:3)&&b[offset]===1,'unexpected loader state');
 check(new PublicKey(b.subarray(offset+1,offset+33)).toBase58()===p.authority,'loader authority mismatch');
 if(p.kind==='retire'){
  const program=await connection.getAccountInfo(pk(c.program));
  check(program&&program.executable&&program.owner.equals(LOADER)&&program.data.length===36&&program.data.readUInt32LE(0)===2&&new PublicKey(program.data.subarray(4,36)).toBase58()===p.target,'ProgramData is not associated with this program');
  const coins=await connection.getProgramAccounts(pk(c.program),{filters:[{dataSize:204}]});
  const live=coins.filter(a=>{
   const data=a.account.data;if(data.subarray(0,8).toString()!=='DEPUMP01')return false;
   const expected=PublicKey.findProgramAddressSync([Buffer.from('coin'),data.subarray(40,72)],pk(c.program))[0];
   return expected.equals(a.pubkey);
  });
  check(live.length===0,'retirement refused: launched coins would be stranded; resolve user obligations through a separate retirement review');
 }
}
export async function prepareRecovery(connection,c,request){
 check(c.genesis===GENESIS&&await connection.getGenesisHash()===GENESIS,'mainnet genesis mismatch');
 const block=await connection.getLatestBlockhash('confirmed');
 const p={version:1,kind:request.kind,network:'mainnet-beta',genesis:GENESIS,program:c.program,recipient:request.recipient||c.recovery,createdAt:new Date().toISOString(),blockhash:block.blockhash,lastValidBlockHeight:block.lastValidBlockHeight,feeLamports:0};
 if(p.kind==='wallet'){
  p.sourceRole=request.sourceRole||'deployer';check(roles.includes(p.sourceRole),'unknown source role');p.source=c[p.sourceRole];p.lamports='1';p.feePayer=p.source;
 }else{
  p.feePayer=c.deployer;
  if(p.kind==='buffer'){
   p.target=c.upload_buffer;check(!!p.target,'deployment buffer not configured');
   const a=await connection.getAccountInfo(pk(p.target));check(a&&a.owner.equals(LOADER)&&a.data.length>=37&&a.data.readUInt32LE(0)===1&&a.data[4]===1,'buffer is absent, closed or invalid');p.authority=new PublicKey(a.data.subarray(5,37)).toBase58();
  }else if(p.kind==='retire'){
   p.retirementAcknowledgement=request.retirementAcknowledgement;p.authority=c.upgrade_authority;
   const a=await connection.getAccountInfo(pk(c.program));check(a&&a.owner.equals(LOADER)&&a.data.length===36&&a.data.readUInt32LE(0)===2,'program is not deployed');p.target=new PublicKey(a.data.subarray(4,36)).toBase58();
  }else if(p.kind==='platform-fees'){
   p.mint=pk(request.mint).toBase58();p.target=PublicKey.findProgramAddressSync([Buffer.from('coin'),pk(p.mint).toBuffer()],pk(c.program))[0].toBase58();p.recipient=c.treasury;
  }
 }
 const fee=(await connection.getFeeForMessage(transactionFor(c,p).compileMessage(),'confirmed')).value;
 check(Number.isSafeInteger(fee)&&fee>=0&&fee<=100_000,'unexpected transaction fee');p.feeLamports=fee;
 if(p.kind==='wallet'){
  const balance=await connection.getBalance(pk(p.source),'confirmed');check(Number.isSafeInteger(balance)&&balance>fee,'wallet has no recoverable SOL after the fee');p.lamports=String(balance-fee);
 }
 await checkState(connection,c,p);
 const tx=transactionFor(c,p);p.messageSha256=hash(tx.serializeMessage());p.unsignedTransaction=tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');
 p.requiredSigners=tx.compileMessage().accountKeys.slice(0,tx.compileMessage().header.numRequiredSignatures).map(k=>k.toBase58());
 return p;
}
export async function validateRecovery(connection,c,p,recipient){
 check(p.recipient===(p.kind==='platform-fees'?c.treasury:recipient||c.recovery),'recipient differs from explicit signing request');
 const expected=transactionFor(c,p),raw=Transaction.from(Buffer.from(p.unsignedTransaction,'base64'));
 check(expected.serializeMessage().equals(raw.serializeMessage())&&hash(raw.serializeMessage())===p.messageSha256,'transaction changed after preparation');
 check(await connection.getBlockHeight('confirmed')<=p.lastValidBlockHeight,'plan expired; prepare again');
 const fee=(await connection.getFeeForMessage(expected.compileMessage(),'confirmed')).value;
 check(fee===p.feeLamports,'fee changed; prepare again');await checkState(connection,c,p);return expected;
}
export function verifySigned(c,p,bytes){
 const tx=Transaction.from(bytes);check(transactionFor(c,p).serializeMessage().equals(tx.serializeMessage())&&hash(tx.serializeMessage())===p.messageSha256,'signed message differs from reviewed plan');check(tx.verifySignatures(),'missing or invalid signatures');return tx;
}
