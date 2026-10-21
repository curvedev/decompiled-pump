import {Keypair,PublicKey,Transaction,TransactionInstruction,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {BorshAccountsCoder} from '@coral-xyz/anchor';
import {TOKEN_PROGRAM_ID,NATIVE_MINT,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {u64,ceil} from '../web/protocol.ts';
const {LiteSVM,FailedTransactionMetadata}=await import(process.env.LITESVM_MODULE||'litesvm');
const dir=process.env.REPLAY_DIR||'../work/replay';
const fixture=JSON.parse(readFileSync(dir+'/fixtures.json','utf8'));
const idl=JSON.parse(readFileSync('research/raw/pump.json','utf8'));
const coder=new BorshAccountsCoder(idl),pump=new PublicKey(fixture.pump);
const user=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(dir+'/trader-keypair.json','utf8'))));
const svm=new LiteSVM().withNativeMints();
const pinned=JSON.parse(readFileSync('research/binary-manifest.json','utf8'));
for(const name of ['pump','pump_fees']){
 const row=pinned.programs.find((p:any)=>p.name===name);
 if(createHash('sha256').update(readFileSync(`research/raw/${name}.so`)).digest('hex')!==row.executable_sha256)throw new Error('Original executable differs from research pin');
}
svm.addProgramFromFile(pump,'research/raw/pump.so');
svm.addProgramFromFile(new PublicKey('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ'),'research/raw/pump_fees.so');
for(const file of readdirSync(dir)){
 if(!file.endsWith('.json')||file.includes('keypair')||file==='fixtures.json'||file==='validator-accounts.json')continue;
 const f=JSON.parse(readFileSync(dir+'/'+file,'utf8'));if(!f.pubkey||!f.account)continue;
 svm.setAccount(new PublicKey(f.pubkey),{...f.account,data:Buffer.from(f.account.data[0],'base64'),owner:new PublicKey(f.account.owner)});
}
const pda=(seed:string,key?:PublicKey)=>PublicKey.findProgramAddressSync([Buffer.from(seed),...(key?[key.toBuffer()]:[])],pump)[0];
const get=(key:PublicKey)=>coder.decode('BondingCurve',Buffer.from(svm.getAccount(key)!.data));
const results=[];
for(const f of fixture.cases){
 const mint=new PublicKey(f.mint),curve=new PublicKey(f.curve),vault=new PublicKey(f.vault),ata=new PublicKey(f.ata);
 const keys=[new PublicKey(fixture.global),mint,NATIVE_MINT,TOKEN_PROGRAM_ID,TOKEN_PROGRAM_ID,curve,vault,
 getAssociatedTokenAddressSync(NATIVE_MINT,curve,true),user.publicKey,ata,getAssociatedTokenAddressSync(NATIVE_MINT,user.publicKey),
 pda('user_volume_accumulator',user.publicKey),new PublicKey(fixture.feeConfig),new PublicKey(fixture.buyback),SystemProgram.programId,pda('__event_authority'),pump];
 const accounts=keys.map((pubkey,i)=>({pubkey,isSigner:i===8,isWritable:[5,6,7,8,9,10,11,13].includes(i)}));
 const instruction=idl.instructions.find((x:any)=>x.name==='buy_v3');
 const amount=BigInt(f.amount),before=get(curve),base=BigInt(before.virtual_token_reserves.toString()),sol=BigInt(before.virtual_quote_reserves.toString());
 const expectedCeil=ceil(sol*amount,base-amount),expectedFloorPlusOne=sol*amount/(base-amount)+1n;
 const ix=new TransactionInstruction({programId:pump,keys:accounts,data:Buffer.concat([Buffer.from(instruction.discriminator),u64(amount),u64(900_000_000_000n),Buffer.from([0])])});
 const tx=new Transaction({feePayer:user.publicKey,recentBlockhash:svm.latestBlockhash()}).add(ComputeBudgetProgram.setComputeUnitLimit({units:500_000}),ix);tx.sign(user);
 const buybackBefore=svm.getBalance(new PublicKey(fixture.buyback));
 const zeroLimit=new Transaction({feePayer:user.publicKey,recentBlockhash:svm.latestBlockhash()}).add(ComputeBudgetProgram.setComputeUnitLimit({units:500_000}),new TransactionInstruction({...ix,data:Buffer.concat([Buffer.from(instruction.discriminator),u64(amount),u64(0n),Buffer.from([0])])}));zeroLimit.sign(user);
 const rejected=svm.sendTransaction(zeroLimit);
 const rejectedSlippage=rejected instanceof FailedTransactionMetadata;
 const slippageError=rejectedSlippage?String(rejected.err()):null;
 const unchangedAfterFailure=String(get(curve).virtual_quote_reserves)===String(before.virtual_quote_reserves);
 const res=svm.sendTransaction(tx);
 if(res instanceof FailedTransactionMetadata){results.push({amount:f.amount,success:false,error:String(res.err()),logs:res.meta().logs()});}
 else{
  const after=get(curve),actual=BigInt(after.virtual_quote_reserves.toString())-sol;
  const creatorFee=String(after.creator_fee),protocolFee=String(after.protocol_fees),buybackFee=String(svm.getBalance(new PublicKey(fixture.buyback))-buybackBefore);
  const sellAmount=amount>1n?amount/2n:1n;
  const sell=idl.instructions.find((x:any)=>x.name==='sell_v3');
  const sellIx=new TransactionInstruction({programId:pump,keys:accounts,data:Buffer.concat([Buffer.from(sell.discriminator),u64(sellAmount),u64(0n)])});
  const sellTx=new Transaction({feePayer:user.publicKey,recentBlockhash:svm.latestBlockhash()}).add(ComputeBudgetProgram.setComputeUnitLimit({units:500_000}),sellIx);sellTx.sign(user);
  const sellResult=svm.sendTransaction(sellTx);
  const expectedSell=BigInt(after.virtual_quote_reserves.toString())*sellAmount/(BigInt(after.virtual_token_reserves.toString())+sellAmount);
  let sellObservation:any;
  if(sellResult instanceof FailedTransactionMetadata)sellObservation={amount:String(sellAmount),success:false,error:String(sellResult.err()),logs:sellResult.meta().logs()};
  else{const sold=get(curve),gross=BigInt(after.virtual_quote_reserves.toString())-BigInt(sold.virtual_quote_reserves.toString());sellObservation={amount:String(sellAmount),success:true,originalGross:String(gross),candidateFloor:String(expectedSell),floorMatches:gross===expectedSell,creatorFee:String(BigInt(sold.creator_fee.toString())-BigInt(creatorFee)),protocolFee:String(BigInt(sold.protocol_fees.toString())-BigInt(protocolFee))};}
  results.push({amount:f.amount,originalGross:actual.toString(),candidateCeil:expectedCeil.toString(),candidateFloorPlusOne:expectedFloorPlusOne.toString(),ceilMatches:actual===expectedCeil,floorPlusOneMatches:actual===expectedFloorPlusOne,success:true,computeUnits:String(res.computeUnitsConsumed()),creatorFee,protocolFee,buybackFee,rejectedSlippage,slippageError,unchangedAfterFailure,sell:sellObservation});
 }
}
const output={date:new Date().toISOString(),runtime:'LiteSVM npm 0.8.0 on ARM64',scope:'Captured original Pump executable, captured Global/FeeConfig, four synthetic legacy-token SOL curves. Not historic transaction replay or full equivalence.',binarySha256:pinned.programs.find((p:any)=>p.name==='pump').executable_sha256,configContextSlot:fixture.contextSlot,results};
writeFileSync('research/original-test-results.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
if(results.some((x:any)=>!x.success||!x.floorPlusOneMatches||!x.rejectedSlippage||!x.unchangedAfterFailure||!x.sell?.floorMatches))process.exitCode=1;
