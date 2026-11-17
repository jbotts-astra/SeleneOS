#!/usr/bin/env python3
"""Stage only reviewed runtime files; signing always stays on the owner's device."""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'dist' / 'tizen'
RUNTIME = ('index.html', 'style.css', 'apps.js', 'data.js', 'main.js', 'config.xml', 'icon.png')

for name in RUNTIME:
    if not (ROOT / name).is_file():
        sys.exit('Missing runtime file: ' + name)
# Do not silently delete someone else's signing output or certificates.
if OUT.exists():
    unexpected = [p.name for p in OUT.iterdir() if p.name not in RUNTIME]
    if unexpected:
        sys.exit('Staging directory contains additional files; move them first: ' + ', '.join(unexpected))
OUT.mkdir(parents=True, exist_ok=True)
for name in RUNTIME:
    shutil.copyfile(ROOT / name, OUT / name)
size = sum((OUT / name).stat().st_size for name in RUNTIME)
print('Staged %d runtime files (%s bytes) in %s' % (len(RUNTIME), format(size, ','), OUT))
print('Sign this directory locally with your existing Samsung/Tizen certificate profile.')
