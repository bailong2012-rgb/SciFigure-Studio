"""Real file:// library workflow with IndexedDB and offline network guard."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import sys
ROOT=Path(__file__).resolve().parents[1]
APP='--app' in sys.argv
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(accept_downloads=True,viewport={'width':1700,'height':1040})
    errors=[];remote=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:remote.append(request.url) if request.url.startswith(('http:','https:')) else None)
    page.goto((ROOT/('src/index.html' if APP else 'tests/library-fixture.html')).as_uri())
    if APP:
        page.wait_for_function('window.SF && SF.app')
        page.evaluate('(async()=>{for(const a of await SF.store.listAssets())await SF.store.deleteAsset(a.id);await SF.app.library.refresh();})()')
    else:page.evaluate('boot')
    assert page.evaluate('SF.store.persistent'), 'file:// IndexedDB unavailable'
    svg=b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30"><rect width="50" height="30" fill="#62bbaa"/></svg>'
    page.locator('#asset-svg-file').set_input_files([{'name':'cell.svg','mimeType':'image/svg+xml','buffer':svg},{'name':'vessel.svg','mimeType':'image/svg+xml','buffer':svg}])
    page.wait_for_function("document.querySelectorAll('.asset-card').length===2")
    page.get_by_role('button',name='编辑 cell',exact=True).click()
    page.locator('#asset-edit-name').fill('细胞膜')
    page.locator('#asset-edit-category').fill('细胞')
    page.locator('#asset-edit-tags').fill('结构, 生物')
    page.locator('#asset-edit-author').fill('研究者')
    page.locator('#asset-edit-source').fill('离线素材源')
    page.locator('#asset-edit-license').fill('CC BY 4.0')
    page.locator('#asset-edit-save').click()
    page.wait_for_function("!document.querySelector('#asset-dialog').open")
    page.get_by_role('button',name='收藏 细胞膜',exact=True).click()
    page.wait_for_function("document.querySelector('[aria-label=\"取消收藏 细胞膜\"]')")
    page.locator('#asset-favorites').check()
    assert page.locator('.asset-card').count()==1
    if APP:before=page.locator('#art > [data-item]').count()
    page.get_by_role('button',name='插入 细胞膜',exact=True).click()
    if APP:
        page.wait_for_function('(before)=>document.querySelectorAll("#art > [data-item]").length===before+1',arg=before)
        assert page.locator('#art > [data-name="细胞膜"]').count()==1
        page.screenshot(path=str(ROOT/'work/library-integration.png'))
    else:
        page.wait_for_function('window.inserted')
        assert page.evaluate('inserted.author')=='研究者'
    with page.expect_download() as downloaded:page.locator('#asset-export-pack').click()
    exported=json.loads(Path(downloaded.value.path()).read_text(encoding='utf-8'))
    assert len(exported['assets'])==2, 'export must include full library independent of filters'
    cell=next(a for a in exported['assets'] if a['name']=='细胞膜')
    assert cell['tags']==['结构','生物'] and cell['license']=='CC BY 4.0' and cell['favorite']
    bad={'format':'scifigure-assets','version':1,'assets':[cell,{**cell,'svg':'<svg><script/></svg>'}]}
    page.locator('#asset-pack-file').set_input_files({'name':'bad.sciassets','mimeType':'application/json','buffer':json.dumps(bad).encode()})
    page.wait_for_function("document.querySelector('#asset-message').dataset.error==='true'")
    assert page.evaluate('(async()=> (await SF.store.listAssets()).length)()')==2, 'invalid pack modified library'
    page.locator('#asset-pack-file').set_input_files({'name':'good.sciassets','mimeType':'application/json','buffer':json.dumps(exported).encode()})
    page.wait_for_function("document.querySelectorAll('.asset-card').length===4")
    assert page.evaluate('(async()=>new Set((await SF.store.listAssets()).map(a=>a.id)).size)()')==4
    page.reload()
    if APP:page.wait_for_function('window.SF && SF.app')
    else:page.evaluate('boot')
    assert page.locator('.asset-card').count()==4,'library persistence failed'
    page.on('dialog',lambda dialog:dialog.accept())
    page.get_by_role('button',name='删除 vessel',exact=True).first.click()
    page.wait_for_function("document.querySelectorAll('.asset-card').length===3")
    page.evaluate('SF.store.persistent=false')
    page.locator('#asset-svg-file').set_input_files({'name':'temporary.svg','mimeType':'image/svg+xml','buffer':svg})
    page.wait_for_function("document.querySelectorAll('.asset-card').length===4")
    assert '临时' in page.locator('#asset-message').inner_text(), 'nonpersistent import falsely reports a durable save'
    assert not remote,remote
    assert not errors,errors
    browser.close()
print(('MAIN APP: ' if APP else 'FIXTURE: ')+'PASS: file:// IndexedDB, bulk SVG import, edit metadata, favorite, insertion, pack export/import, atomic rejection, persistence, delete; zero network requests')
