#!/usr/bin/env python3
"""Read-only mainnet rent quote for the exact local binary. No real expenditure."""
import pathlib,json,datetime,hashlib,math
from capture_program import rpc
root=pathlib.Path(__file__).resolve().parent.parent
binary=(root/'target/deploy/depump.so').read_bytes()
sizes={'mint':82,'vault':165,'coin':204,'metadata_max':4096,'program':36,'programdata':len(binary)+45,'upload_buffer':len(binary)+37}
out={'date':datetime.datetime.now(datetime.timezone.utc).isoformat(),'network':'mainnet-beta','binary_bytes':len(binary),'binary_sha256':hashlib.sha256(binary).hexdigest(),'rent_lamports':{}}
for name,size in sizes.items():
    out['rent_lamports'][name]={'bytes':size,'lamports':rpc('https://api.mainnet-beta.solana.com','getMinimumBalanceForRentExemption',[size])}
rent=out['rent_lamports'];permanent=rent['program']['lamports']+rent['programdata']['lamports']
out['estimates']={'permanent_program_rent_lamports':permanent,
    'peak_program_and_buffer_rent_lamports':permanent+rent['upload_buffer']['lamports'],
    'upload_base_fees_lamports':(math.ceil(len(binary)/900)+10)*5000,
    'base_fee_assumption_lamports_per_signature':5000,'priority_fee_assumption_lamports':0,
    'new_coin_max_metadata_account_rent_lamports':sum(rent[x]['lamports'] for x in ['mint','vault','coin','metadata_max']),
    'optional_user_token_account_rent_lamports':rent['vault']['lamports']}
(root/'research/rent-estimate.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out['estimates'],indent=2))
