#!/usr/bin/env python3
import os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

BASE = r'D:\aetherai'

def rf(n):
    with open(os.path.join(BASE, n), 'r', encoding='utf-8') as f:
        return f.read()

def wf(n, c):
    with open(os.path.join(BASE, n), 'w', encoding='utf-8') as f:
        f.write(c)

E = {
    'scr': chr(0x1F4D1), 'sp': chr(0x1F4A8), 'mon': chr(0x1F5A5) + chr(0xFE0F),
    'bot': chr(0x1F916), 'br': chr(0x1F9E0), 'sta': chr(0x1F3F3) + chr(0xFE0F),
    'too': chr(0x1F6E0) + chr(0xFE0F), 'ge': chr(0x2699) + chr(0xFE0F),
    'lk': chr(0x1F512), 'cam': chr(0x1F4F8), 'pkg': chr(0x1F4E6),
    'roc': chr(0x1F680), 'clp': chr(0x1F4CB), 'ky': chr(0x1F511),
    'hs': chr(0x1F91D), 'pg': chr(0x1F4C4),
}

def fix(fn, toc_file, block_file):
    content = rf(fn)
    marker = '## ' + E['scr'] + ' Table of Contents'
    tidx = content.find(marker)
    if tidx == -1:
        print('SKIP ' + fn + ': no TOC')
        return
    tend = content.find('\n---\n', tidx)
    if tend == -1:
        print('WARN ' + fn + ': no TOC end')
        return
    fhdr = '## ' + E['sp'] + ' '
    fidx = content.find(fhdr, tend)
    if fidx == -1:
        print('WARN ' + fn + ': no features header')
        return
    hdr = content[:tidx]
    bef = content[tend:fidx]
    aft = content[fidx:]
    toc_data = open(toc_file, 'r', encoding='utf-8').read()
    block_data = open(block_file, 'r', encoding='utf-8').read()
    wf(fn, hdr + toc_data + '\n\n' + block_data + bef + aft)
    print('OK: ' + fn)

# Process all 5 files
files = [
    ('README.fr.md', '_fr_toc.txt', '_fr_block.txt'),
    ('README.de.md', '_de_toc.txt', '_de_block.txt'),
    ('README.pt.md', '_pt_toc.txt', '_pt_block.txt'),
    ('README.ru.md', '_ru_toc.txt', '_ru_block.txt'),
    ('README.uk.md', '_uk_toc.txt', '_uk_block.txt'),
]

for fn, toc_f, blk_f in files:
    fix(fn, toc_f, blk_f)

print('\nAll done!')
