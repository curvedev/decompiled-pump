#!/usr/bin/env python3
"""Build an sBPF artifact without embedding the builder's home directory."""
from pathlib import Path
import os,subprocess,argparse
parser=argparse.ArgumentParser();parser.add_argument('--builder',default='cargo-build-sbf');args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
env=os.environ.copy()
flag_key='CARGO_TARGET_SBPF_SOLANA_SOLANA_RUSTFLAGS'
env[flag_key]=' '.join([env.get(flag_key,''),env.pop('RUSTFLAGS',''),f'--remap-path-prefix={Path.home()}=/build-home',f'--remap-path-prefix={root}=/project']).strip()
subprocess.run([args.builder,'--manifest-path','programs/depump/Cargo.toml','--arch','v0'],cwd=root,env=env,check=True)
binary=(root/'target/deploy/depump.so').read_bytes()
assert str(Path.home()).encode() not in binary and b'/Users/' not in binary,'Builder path remains in executable'
print('sBPF build passed the home-directory path check.')
