#!/usr/bin/env python3
"""Verify finalized devnet deployment bytes, loader state and project authority."""
import base64, datetime, hashlib, json, pathlib, struct
from capture_program import rpc, b58, LOADER
URL='https://api.devnet.solana.com'
PROGRAM='8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71'
AUTHORITY='GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb'
assert rpc(URL,'getGenesisHash',[])=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
first=rpc(URL,'getAccountInfo',[PROGRAM,{'encoding':'base64','commitment':'finalized'}])
p=first['value']; assert p and p['executable'] and p['owner']==LOADER
program_data=base64.b64decode(p['data'][0]); assert len(program_data)==36 and struct.unpack_from('<I',program_data)[0]==2
address=b58(program_data[4:36])
snapshot=rpc(URL,'getMultipleAccounts',[[PROGRAM,address],{'encoding':'base64','commitment':'finalized','minContextSlot':first['context']['slot']}])
p,pd=snapshot['value']; assert base64.b64decode(p['data'][0])==program_data and pd['owner']==LOADER
body=base64.b64decode(pd['data'][0]); assert struct.unpack_from('<I',body)[0]==3 and body[12]==1
assert b58(body[13:45])==AUTHORITY
binary=pathlib.Path('target/deploy/depump.so').read_bytes(); assert body[45:]==binary,'Finalized on-chain executable differs from the tested artifact'
report={'date':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cluster':'devnet','commitment':'finalized','program':PROGRAM,'programdata':address,'deployment_slot':struct.unpack_from('<Q',body,4)[0],'finalized_context_slot':snapshot['context']['slot'],'upgrade_authority':AUTHORITY,'executable_bytes':len(binary),'executable_sha256':hashlib.sha256(binary).hexdigest(),'exact_byte_match':True,'upgradeable':True,'project_token_created':False}
pathlib.Path('research/devnet-deployment.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
