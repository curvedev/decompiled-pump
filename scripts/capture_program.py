#!/usr/bin/env python3
"""Pin upgradeable Solana executables with one finalized multi-account read.

Raw chain binaries stay local pending redistribution review. No signing or writes.
Uses curl's system TLS trust, with bounded timeouts and no API credentials.
"""
import argparse
import base64
import datetime
import hashlib
import json
import pathlib
import struct
import subprocess

ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
LOADER = 'BPFLoaderUpgradeab1e11111111111111111111111'
PROGRAMS = {
    'pump': '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    'pump_amm': 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
    'pump_fees': 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',
}

def b58(data):
    n = int.from_bytes(data, 'big')
    out = ''
    while n:
        n, digit = divmod(n, 58)
        out = ALPHABET[digit] + out
    return '1' * (len(data) - len(data.lstrip(b'\0'))) + out

def rpc(endpoint, method, params):
    request = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params})
    raw = subprocess.check_output([
        'curl', '--fail', '--silent', '--show-error', '--max-time', '45', endpoint,
        '-H', 'Content-Type: application/json', '--data-binary', request,
    ])
    result = json.loads(raw)
    if 'error' in result:
        raise RuntimeError(result['error'])
    return result['result']

def capture(endpoint, output):
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for label, address in PROGRAMS.items():
        initial = rpc(endpoint, 'getAccountInfo', [address, {'encoding': 'base64', 'commitment': 'finalized'}])
        account = initial['value']
        assert account and account['executable'] and account['owner'] == LOADER
        data = base64.b64decode(account['data'][0])
        assert len(data) == 36 and struct.unpack_from('<I', data)[0] == 2
        programdata_address = b58(data[4:36])
        snapshot = rpc(endpoint, 'getMultipleAccounts', [[address, programdata_address], {
            'encoding': 'base64', 'commitment': 'finalized', 'minContextSlot': initial['context']['slot'],
        }])
        program, pd = snapshot['value']
        assert base64.b64decode(program['data'][0]) == data
        assert pd and pd['owner'] == LOADER
        body = base64.b64decode(pd['data'][0])
        assert struct.unpack_from('<I', body)[0] == 3
        deployment_slot = struct.unpack_from('<Q', body, 4)[0]
        executable = body[45:]
        assert executable[:4] == b'\x7fELF'
        binary_path=output / f'{label}.so'
        if not binary_path.exists():
            binary_path.write_bytes(executable)
        elif binary_path.read_bytes()!=executable:
            (output/f'{label}-candidate-{hashlib.sha256(executable).hexdigest()[:12]}.so').write_bytes(executable)
        snapshot_path=output/f'{label}-snapshot.json'
        if not snapshot_path.exists():
            snapshot_path.write_text(json.dumps(snapshot))
        row = {
            'name': label, 'program': address, 'programdata': programdata_address,
            'research_time_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'finalized_context_slot': snapshot['context']['slot'],
            'deployment_slot': deployment_slot,
            'programdata_sha256': hashlib.sha256(body).hexdigest(),
            'executable_sha256': hashlib.sha256(executable).hexdigest(),
            'executable_bytes': len(executable),
            'upgrade_authority': b58(body[13:45]) if body[12] == 1 else None,
            'elf_machine': struct.unpack_from('<H', executable, 18)[0],
            'elf_flags': struct.unpack_from('<I', executable, 48)[0],
            'hash_scope': 'all ProgramData bytes after the 45-byte loader metadata, including padding',
        }
        rows.append(row)
        print(label, row['deployment_slot'], row['executable_sha256'])
    manifest = {'cluster': 'mainnet-beta', 'commitment': 'finalized', 'programs': rows}
    target=output.parent / 'binary-manifest.json'
    if target.exists():
        pinned=json.loads(target.read_text())
        expected={r['program']:r['executable_sha256'] for r in pinned['programs']}
        current={r['program']:r['executable_sha256'] for r in rows}
        (output/'latest-capture-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        if expected!=current:
            raise RuntimeError('Deployed bytes differ from the pinned manifest. Preserve the pin and document a new research version.')
    else:
        target.write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--rpc', default='https://api.mainnet-beta.solana.com')
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path('research/raw'))
    args = parser.parse_args()
    capture(args.rpc, args.output)
