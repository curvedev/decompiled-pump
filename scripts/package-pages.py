#!/usr/bin/env python3
"""Copy only the current anonymous static frontend into GitHub Pages' docs root."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parent.parent
dist=root/'dist'
assert (dist/'index.html').is_file(), 'Build the website first'
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
