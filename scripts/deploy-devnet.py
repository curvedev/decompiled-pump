#!/usr/bin/env python3
"""Explicit devnet-only deployment. No global CLI configuration changes."""
import argparse,pathlib,subprocess,json
parser=argparse.ArgumentParser()
parser.add_argument('--deployer',required=True)
parser.add_argument('--program-keypair',required=True)
parser.add_argument('--solana',default='solana')
parser.add_argument('--keygen',default='solana-keygen')
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parent.parent
url='https://api.devnet.solana.com'
expected='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
get=lambda command:subprocess.check_output(command,text=True).strip()
assert get([args.solana,'genesis-hash','--url',url])==expected,'Wrong chain'
assert get([args.keygen,'pubkey',args.program_keypair])=='8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71','Wrong program signer'
assert get([args.keygen,'pubkey',args.deployer])=='GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb','Wrong devnet role'
binary=root/'target/deploy/depump.so';assert binary.is_file(),'Build the program first'
subprocess.run([args.solana,'program','deploy',str(binary),'--url',url,'--keypair',args.deployer,
    '--program-id',args.program_keypair,'--max-len',str(binary.stat().st_size),'--with-compute-unit-price','0'],check=True)
print('Devnet deployment returned success. Verify chain ProgramData bytes and the upgrade authority before marking deployment ready.')
