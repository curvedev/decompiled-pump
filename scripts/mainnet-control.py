#!/usr/bin/env python3
"""DEPUMP mainnet preparation, byte verification, and explicitly budgeted deployment."""
import argparse,base64,datetime,hashlib,json,math,os,pathlib,struct,subprocess
from capture_program import rpc,b58,LOADER
ROOT=pathlib.Path(__file__).resolve().parent.parent
URL='https://api.mainnet-beta.solana.com'
GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
def config():
    c=json.loads((ROOT/'research/mainnet-candidate.json').read_text())
    assert c['network']=='mainnet-beta' and c['genesis']==GENESIS and c['rpc']==URL
    assert len(set(c[k] for k in ['program','deployer','upgrade_authority','treasury','recovery']))==5
    assert rpc(URL,'getGenesisHash',[])==GENESIS,'Wrong network'
    return c
def binary():
    return (ROOT/'target/mainnet/depump.so').read_bytes()
def preflight(c):
    b=binary();sizes={'program':36,'programdata':len(b)+45,'upload_buffer':len(b)+37,'mint':82,'vault':165,'coin':204,'metadata_max':4096}
    rents={k:{'bytes':n,'lamports':rpc(URL,'getMinimumBalanceForRentExemption',[n])} for k,n in sizes.items()}
    names=['program','deployer','upgrade_authority','treasury','recovery']
    snap=rpc(URL,'getMultipleAccounts',[[c[k] for k in names],{'encoding':'base64','commitment':'finalized'}])
    permanent=rents['program']['lamports']+rents['programdata']['lamports']
    report={'date':datetime.datetime.now(datetime.timezone.utc).isoformat(),'network':'mainnet-beta','genesis':GENESIS,'program':c['program'],'binary_bytes':len(b),'binary_sha256':hashlib.sha256(b).hexdigest(),'rent':rents,'permanent_program_rent_lamports':permanent,'peak_program_buffer_rent_lamports':permanent+rents['upload_buffer']['lamports'],'modeled_upload_base_fees_lamports':(math.ceil(len(b)/900)+10)*10000,'priority_fee_lamports':0,'proposed_funding_lamports':1_350_000_000,'new_coin_max_metadata_rent_lamports':sum(rents[k]['lamports'] for k in ['mint','vault','coin','metadata_max']),'required_operator_liquidity_lamports':0,'roles_balance_lamports':{k:0 if a is None else a['lamports'] for k,a in zip(names,snap['value'])},'program_exists':snap['value'][0] is not None,'recurring_paid_service_configured':False,'deployed':False}
    (ROOT/'research/mainnet-preflight.json').write_text(json.dumps(report,indent=2)+'\n')
    return report
def verify(c):
    first=rpc(URL,'getAccountInfo',[c['program'],{'encoding':'base64','commitment':'finalized'}]);p=first['value']
    assert p and p['executable'] and p['owner']==LOADER,'Program is not deployed'
    data=base64.b64decode(p['data'][0]);assert len(data)==36 and struct.unpack_from('<I',data)[0]==2
    pd=b58(data[4:36]);snap=rpc(URL,'getMultipleAccounts',[[c['program'],pd],{'encoding':'base64','commitment':'finalized','minContextSlot':first['context']['slot']}]);p,state=snap['value']
    assert base64.b64decode(p['data'][0])==data and state['owner']==LOADER
    body=base64.b64decode(state['data'][0]);assert struct.unpack_from('<I',body)[0]==3 and body[12]==1
    assert b58(body[13:45])==c['upgrade_authority'],'Unexpected upgrade authority'
    b=binary();assert body[45:]==b,'On-chain bytes differ from candidate'
    tested=json.loads((ROOT/'research/mainnet-local-tests.json').read_text());assert tested['passed'] and tested['checks']>=41 and tested['program']==c['program'] and tested['binarySha256']==hashlib.sha256(b).hexdigest()
    report={'date':datetime.datetime.now(datetime.timezone.utc).isoformat(),'network':'mainnet-beta','genesis':GENESIS,'program':c['program'],'programdata':pd,'deployment_slot':struct.unpack_from('<Q',body,4)[0],'finalized_context_slot':snap['context']['slot'],'upgrade_authority':c['upgrade_authority'],'treasury':c['treasury'],'binary_bytes':len(b),'binary_sha256':hashlib.sha256(b).hexdigest(),'exact_byte_match':True,'upgradeable':True,'project_token_created':False}
    (ROOT/'research/mainnet-deployment.json').write_text(json.dumps(report,indent=2)+'\n');return report
def deploy(c,args):
    assert args.execute and args.approval and args.operator_dir,'Deployment requires --execute, approved budget and operator keys'
    approval=json.loads(pathlib.Path(args.approval).read_text());report=preflight(c)
    assert approval.get('approved') is True,'Actual costs and wallet roles need user approval'
    for field in ['program','deployer','upgrade_authority','treasury','recovery']:assert approval[field]==c[field]
    assert approval['binary_sha256']==report['binary_sha256']
    assert approval['max_total_debit_lamports']==1_350_000_000,'Review a changed budget separately'
    assert not report['program_exists'],'Existing mainnet program requires a separate upgrade review'
    assert report['roles_balance_lamports']['deployer']>=approval['max_total_debit_lamports'],'Dedicated deployer is not funded'
    assert report['peak_program_buffer_rent_lamports']+report['modeled_upload_base_fees_lamports']+40_000_000<=approval['max_total_debit_lamports'],'Rent exceeds approved budget'
    tested=json.loads((ROOT/'research/mainnet-local-tests.json').read_text());assert tested['passed'] and tested['checks']>=42 and tested['program']==c['program'] and tested['binarySha256']==report['binary_sha256']
    recovery=subprocess.run(['node','--test','tests/recovery.test.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    assert recovery.returncode==0,'User-required operator recovery backend checks failed'
    operator=pathlib.Path(args.operator_dir).resolve();keys={'program':'program','deployer':'deployer','upgrade_authority':'upgrade-authority','treasury':'treasury','recovery':'recovery'}
    for role,name in keys.items():
        actual=subprocess.check_output([args.keygen,'pubkey',str(operator/(name+'.json'))],text=True).strip();assert actual==c[role],'Wrong '+role+' signer'
    buffer=operator/'deployment-buffer.json';assert buffer.is_file()
    command=[args.solana,'program','deploy',str(ROOT/'target/mainnet/depump.so'),'--url',URL,'--keypair',str(operator/'deployer.json'),'--upgrade-authority',str(operator/'upgrade-authority.json'),'--program-id',str(operator/'program.json'),'--buffer',str(buffer),'--max-len',str(report['binary_bytes']),'--with-compute-unit-price','0','--max-sign-attempts','1','--use-rpc']
    result=subprocess.run(command,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:
        fd=os.open(operator/'deploy-diagnostics.log',os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,'w') as f:f.write(result.stdout+'\n'+result.stderr)
        raise SystemExit('Deployment interrupted. Inspect the private diagnostic file and specific buffer before a retry; never publish recovery phrases.')
    for line in result.stdout.splitlines():
        if line.startswith(('Program Id:','Signature:')):print(line)
    return verify(c)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['preflight','verify','deploy']);p.add_argument('--execute',action='store_true');p.add_argument('--approval');p.add_argument('--operator-dir');p.add_argument('--solana',default='solana');p.add_argument('--keygen',default='solana-keygen');args=p.parse_args();c=config();report={'preflight':lambda:preflight(c),'verify':lambda:verify(c),'deploy':lambda:deploy(c,args)}[args.action]();print(json.dumps(report,indent=2))
