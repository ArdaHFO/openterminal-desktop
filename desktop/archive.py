"""Create and CRC-check the standard ZIP payload consumed by the NSIS installer."""
from pathlib import Path
import json
import zipfile

output = Path(__file__).resolve().parents[1] / 'outputs' / 'desktop-package'
source = output / 'win-unpacked'
version = json.loads((Path(__file__).parent / 'package.json').read_text())['version']
target = output / f'openterminal-desktop-{version}-x64.nsis.zip'
if not source.is_dir():
    raise RuntimeError('Pack the application before creating its payload')
count = 0
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as archive:
    for file in sorted(source.rglob('*')):
        if file.is_symlink():
            raise RuntimeError(f'Unexpected symlink: {file}')
        if file.is_file():
            archive.write(file, file.relative_to(source).as_posix())
            count += 1
with zipfile.ZipFile(target) as archive:
    bad = archive.testzip()
    if bad:
        raise RuntimeError(f'ZIP CRC verification failed: {bad}')
print(json.dumps({'payload': str(target), 'files': count, 'bytes': target.stat().st_size, 'crcVerified': True}))
