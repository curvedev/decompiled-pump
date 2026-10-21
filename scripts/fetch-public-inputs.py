#!/usr/bin/env python3
"""Retrieve official pinned IDLs and public configuration. No signing or keys."""
import pathlib
import subprocess
import json
from capture_program import rpc
ROOT=pathlib.Path(__file__).resolve().parent.parent
RAW=ROOT/'research/raw';RAW.mkdir(parents=True,exist_ok=True)
REV='639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22'
for name in ['pump','pump_fees']:
    subprocess.run(['curl','--fail','--silent','--show-error','--max-time','30',
        f'https://raw.githubusercontent.com/pump-fun/pump-public-docs/{REV}/idl/{name}.json',
        '-o',str(RAW/f'{name}.json')],check=True)
keys=['4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf','8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt']
if not (RAW/'config-snapshot.json').exists():
    response=rpc('https://api.mainnet-beta.solana.com','getMultipleAccounts',[keys,{'encoding':'base64','commitment':'finalized'}])
    (RAW/'config-snapshot.json').write_text(json.dumps({'addresses':keys,**response}))
print('Official IDLs and current finalized public configuration captured locally. Configuration can change independently of the pinned documentation.')
