"""Build a portable offline distribution; no third-party build dependencies."""
from pathlib import Path
import shutil, zipfile, hashlib

ROOT=Path(__file__).resolve().parent
VERSION='0.1.0'
OUT=ROOT/'outputs'
PORTABLE=OUT/f'SciFigure-Studio-{VERSION}'
PORTABLE.mkdir(parents=True,exist_ok=True)
for file in (ROOT/'src').iterdir():
    if file.is_file():shutil.copy2(file,PORTABLE/file.name)
for name in ['README.md','LICENSE','ASSET-LICENSE.md','CONTRIBUTING.md','CHANGELOG.md','ROADMAP.md']:
    shutil.copy2(ROOT/name,PORTABLE/name)
(PORTABLE/'docs').mkdir(exist_ok=True)
for name in ['architecture.md','formats.md','verification.md','branding.md','integration.md','user-guide.zh-CN.md']:
    if (ROOT/'docs'/name).exists():shutil.copy2(ROOT/'docs'/name,PORTABLE/'docs'/name)
shutil.copytree(ROOT/'docs/images',PORTABLE/'docs/images',dirs_exist_ok=True)
readme=PORTABLE/'README.md'
readme.write_text(readme.read_text(encoding='utf-8').replace('src/scifigure-cell.svg','scifigure-cell.svg'),encoding='utf-8')
(PORTABLE/'examples').mkdir(exist_ok=True)
shutil.copy2(ROOT/'examples/basic-science.sciassets',PORTABLE/'examples/basic-science.sciassets')
(PORTABLE/'启动 SciFigure.cmd').write_bytes(b'@echo off\r\nstart "" "%~dp0index.html"\r\n')
(PORTABLE/'使用前请读.txt').write_text('SciFigure Studio 0.1.0 离线便携版\n\n1. 完整解压此文件夹。\n2. 双击“启动 SciFigure.cmd”，或用 Edge / Chrome 打开 index.html。\n3. 无需安装 Python、Node 或任何运行环境。\n4. 四角缩放，上边框中央外侧圆形手柄旋转。\n5. 自动保存位于当前浏览器；换电脑、移动目录或清理浏览器前，请备份工程并导出素材包。\n6. 更多说明见 README.md，扩展接口见 docs。\n',encoding='utf-8-sig')
archive=OUT/f'SciFigure-Studio-{VERSION}-portable.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for file in sorted(PORTABLE.rglob('*')):
        if file.is_file():z.write(file,Path(PORTABLE.name)/file.relative_to(PORTABLE))
source=OUT/f'SciFigure-Studio-{VERSION}-source.zip'
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED) as z:
    for folder in ['src','docs','tests','examples','.github']:
        for file in sorted((ROOT/folder).rglob('*')):
            if file.is_file() and '__pycache__' not in file.parts and file.name not in {'design-v0.1.md','plan-v0.1.md','progress.md'}:z.write(file,Path('SciFigure-Studio-source')/file.relative_to(ROOT))
    for name in ['README.md','LICENSE','ASSET-LICENSE.md','build.py','CONTRIBUTING.md','CHANGELOG.md','ROADMAP.md','requirements-dev.txt','.gitignore','.gitattributes']:
        z.write(ROOT/name,Path('SciFigure-Studio-source')/name)
for a in [archive,source]:
    with zipfile.ZipFile(a) as z:assert z.testzip() is None
    print(a.name,a.stat().st_size,'bytes',hashlib.sha256(a.read_bytes()).hexdigest())
(OUT/'SHA256SUMS.txt').write_text('\n'.join(hashlib.sha256(a.read_bytes()).hexdigest()+'  '+a.name for a in [archive,source])+'\n',encoding='utf-8')
