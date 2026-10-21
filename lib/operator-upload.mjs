import {TransactionInstruction} from '@solana/web3.js';
import {LOADER} from './operator-recovery.mjs';
export function loaderWrite(buffer,authority,offset,bytes){
 if(!Number.isSafeInteger(offset)||offset<0||offset>0xffffffff||bytes.length<1||bytes.length>900)throw new Error('DEPUMP: invalid loader write range');
 const data=Buffer.alloc(16+bytes.length);data.writeUInt32LE(1);data.writeUInt32LE(offset,4);data.writeBigUInt64LE(BigInt(bytes.length),8);Buffer.from(bytes).copy(data,16);
 return new TransactionInstruction({programId:LOADER,keys:[{pubkey:buffer,isWritable:true,isSigner:false},{pubkey:authority,isWritable:false,isSigner:true}],data});
}
