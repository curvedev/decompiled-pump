#!/usr/bin/env python3
"""Reproduce narrow static observations. No source-recovery claim."""
import argparse,json,pathlib,re,struct,subprocess,hashlib
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--sbpf-cli',required=True);args=parser.parse_args()
manifest=json.loads((root/'research/binary-manifest.json').read_text())
static=[]
for row in manifest['programs']:
    binary=root/'research/raw'/f'{row["name"]}.so';data=binary.read_bytes()
    assert hashlib.sha256(data).hexdigest()==row['executable_sha256'],'Pinned executable changed'
    shoff=struct.unpack_from('<Q',data,40)[0];size,count,names_index=struct.unpack_from('<HHH',data,58)
    sections=[struct.unpack_from('<IIQQQQIIQQ',data,shoff+i*size) for i in range(count)]
    s=sections[names_index];names=data[s[4]:s[4]+s[5]]
    metadata=[{'name':names[v[0]:].split(b'\0')[0].decode(),'offset':v[4],'size':v[5]} for v in sections]
    anchors=[]
    for pattern in [rb'Instruction: [A-Za-z0-9_]+',rb'NotEnoughTokensToBuy',rb'Division by zero',rb'Only Pump and PumpSwap programs can call this instruction']:
        anchors.extend({'file_offset':m.start(),'text':m.group().decode()} for m in re.finditer(pattern,data))
    static.append({'name':row['name'],'sections':metadata,'anchors':anchors})
(root/'research/binary-static.json').write_text(json.dumps(static,indent=2)+'\n')
assembly=root/'research/raw/pump-disassembly.txt'
with assembly.open('w') as output:
    subprocess.run([args.sbpf_cli,'--elf',str(root/'research/raw/pump.so'),'--use','disassembler'],stdout=output,check=True,timeout=120)
idl=json.loads((root/'research/raw/pump.json').read_text())
wanted={int.from_bytes(bytes(x['discriminator']),'little'):x['name'] for x in idl['instructions']}
matches=[];label=''
for line_number,line in enumerate(assembly.read_text().splitlines(),1):
    if line.endswith(':'):label=line[:-1]
    m=re.search(r'lddw r\d+, 0x([0-9a-f]+)',line)
    if m and int(m[1],16) in wanted:
        matches.append({'instruction':wanted[int(m[1],16)],'generated_label':label,'disassembly_line':line_number,'constant':m[1]})
print(json.dumps({'instruction_constant_matches':len(matches),'interpretation':'Presence is not proof of execution; generated labels are not recovered source function names.'},indent=2))
