#!/usr/bin/env python3
"""Explicit devnet-only deployment. No global CLI configuration changes."""
import argparse,pathlib,subprocess,os
parser=argparse.ArgumentParser()
parser.add_argument('--deployer',required=True)
parser.add_argument('--program-keypair',required=True)
parser.add_argument('--solana',default='solana')
parser.add_argument('--keygen',default='solana-keygen')
parser.add_argument('--buffer',help='Private project deployment buffer keypair; defaults beside the program keypair')
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parent.parent
url='https://api.devnet.solana.com'
expected='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
get=lambda command:subprocess.check_output(command,text=True).strip()
assert get([args.solana,'genesis-hash','--url',url])==expected,'Wrong chain'
assert get([args.keygen,'pubkey',args.program_keypair])=='8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71','Wrong program signer'
assert get([args.keygen,'pubkey',args.deployer])=='GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb','Wrong devnet role'
binary=root/'target/deploy/depump.so';assert binary.is_file(),'Build the program first'
buffer=pathlib.Path(args.buffer) if args.buffer else pathlib.Path(args.program_keypair).parent/'deployment-buffer.json'
if not buffer.exists():
    subprocess.run([args.keygen,'new','--no-bip39-passphrase','--silent','--outfile',str(buffer)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
    os.chmod(buffer,0o600)
result=subprocess.run([args.solana,'program','deploy',str(binary),'--url',url,'--keypair',args.deployer,
    '--program-id',args.program_keypair,'--buffer',str(buffer),'--max-len',str(binary.stat().st_size),'--with-compute-unit-price','0'],text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
# CLI recovery messages can include secret seed phrases. Keep diagnostics private.
if result.returncode:
    log=buffer.parent/'deploy-diagnostics.log'
    fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as out: out.write(result.stdout+'\n'+result.stderr)
    raise SystemExit('Deployment failed. Private diagnostics are beside the private buffer keypair; do not publish them.')
for line in result.stdout.splitlines():
    if line.startswith(('Program Id:','Signature:')): print(line)
print('Devnet deployment returned success. Verify chain ProgramData bytes and the upgrade authority before marking deployment ready.')
