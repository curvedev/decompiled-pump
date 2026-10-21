import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey} from '@solana/web3.js';
import {CONFIG,CLUSTER,MAINNET,storageKey,explorerTx} from '../web/network.ts';
import {connection,networkCheck} from '../web/client.ts';
test('release network pins a complete genesis and separates wallet storage and explorer links',()=>{
 assert.equal(new PublicKey(CONFIG.genesis).toBytes().length,32);
 assert.equal(CONFIG.chain,MAINNET?'solana:mainnet':'solana:devnet');
 assert(storageKey('pending').includes(CLUSTER+'.'+CONFIG.program));
 assert.equal(explorerTx('signature').includes('cluster=devnet'),!MAINNET);
});
test('wrong-chain RPC is rejected before looking up or signing for a program',async()=>{
 const original=connection.getGenesisHash,info=connection.getAccountInfo;let accountReads=0;
 connection.getGenesisHash=async()=>MAINNET?'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
 connection.getAccountInfo=async()=>{accountReads++;return null;};
 try{await assert.rejects(networkCheck(),/Wrong network/);assert.equal(accountReads,0);}finally{connection.getGenesisHash=original;connection.getAccountInfo=info;}
});
