#!/usr/bin/env python3
"""Copy only the current anonymous static frontend into GitHub Pages' docs root."""
from pathlib import Path
import shutil,json,subprocess,sys
root=Path(__file__).resolve().parent.parent
dist=root/'dist'
assert (dist/'index.html').is_file(), 'Build the website first'
network=json.loads((dist/'network.json').read_text())
if network['network']=='mainnet':
    check=subprocess.run([sys.executable,str(root/'scripts/mainnet-control.py'),'verify'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if check.returncode: raise SystemExit('Mainnet publishing refused: finalized deployment and candidate bytes have not been verified.')
    candidate=json.loads((root/'research/mainnet-candidate.json').read_text())
    verification=json.loads((root/'research/mainnet-deployment.json').read_text())
    assert verification['exact_byte_match'] and verification['program']==candidate['program'] and verification['upgrade_authority']==candidate['upgrade_authority'], 'Mainnet deployment must be verified before public packaging'
for name in ['assets','index.html','.nojekyll']:
    source=dist/name
    target=root/'docs'/name
    if target.is_dir():
        shutil.rmtree(target)
    elif target.is_file():
        target.unlink()
    if source.is_dir():
        shutil.copytree(source,target)
    else:
        shutil.copyfile(source,target)
print('Packaged GitHub Pages assets in docs/.')
