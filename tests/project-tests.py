"""Real Chromium IndexedDB and project lifecycle regressions (development only)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge')
    page=browser.new_page(accept_downloads=True)
    page.goto((ROOT/'tests/project-fixture.html').as_uri())
    assert page.evaluate("!!(window.SF && SF.store && SF.Projects)"), 'Storage/project APIs are missing'
    page.evaluate('start()')
    assert page.evaluate('editor.doc.name') == '示例项目'
    page.evaluate("SF.store.putAssets([{id:'a',name:'矢量',svg:'<svg/>',width:10,height:20,tags:['细胞'],favorite:false}])")
    assert page.evaluate("SF.store.listAssets().then(a=>a[0].svg===undefined)")
    assert page.evaluate("SF.store.getAsset('a').then(a=>a.svg)") == '<svg/>'
    page.evaluate("SF.store.setFavorite('a',true)")
    assert page.evaluate("SF.store.getAsset('a').then(a=>a.favorite)") is True
    # Complete validation precedes the transaction; a bad pack cannot partially import.
    assert page.evaluate("async()=>{try{await SF.store.putAssets([{id:'good',svg:'<svg/>',width:10,height:10},{id:'bad',svg:'',width:10,height:10}]);return false}catch(e){return !(await SF.store.getAsset('good'))}}")
    # An edit followed immediately by a switch must commit to its source project.
    demo_id=page.evaluate('editor.doc.id')
    page.evaluate("editor.edit('<g data-item=\"edited\"></g>')")
    page.locator('#new-project').click()
    page.wait_for_function('(id)=>editor.doc.id!==id',arg=demo_id)
    assert page.evaluate('(id)=>SF.store.getProject(id).then(d=>d.scene.body)',demo_id) == '<g data-item="edited"></g>'
    current_id=page.evaluate('editor.doc.id')
    page.locator('#project-name').fill('改名项目')
    page.locator('#project-name').dispatch_event('change')
    page.evaluate('projects.flush()')
    assert page.evaluate('(id)=>SF.store.getProject(id).then(d=>d.name)',current_id) == '改名项目'
    # Failed write must retain the active unsaved scene and report a failure.
    page.evaluate("window.originalPut=SF.store.putProject;SF.store.putProject=async()=>{throw Error('QuotaExceededError')};editor.edit('<g data-item=\"unsaved\"></g>')")
    page.locator('#new-project').click()
    page.wait_for_function("statuses.some(s=>s.text.includes('QuotaExceededError'))")
    assert page.evaluate('editor.doc.id') == current_id
    page.evaluate('SF.store.putProject=originalPut;projects.flush()')
    # Future format rejection never destroys the current document.
    page.locator('#project-file').set_input_files({'name':'future.scifigure','mimeType':'application/json','buffer':json.dumps({'format':'scifigure-project','version':2}).encode()})
    page.wait_for_function("statuses.some(s=>s.text.includes('不支持'))")
    assert page.evaluate('editor.doc.id') == current_id
    with page.expect_download() as download:
        page.locator('#save-project').click()
    exported=json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
    assert exported['name']=='改名项目' and exported['version']==1
    assert exported['scene']['body']=='<g data-item="unsaved"></g>'
    page.reload(); page.evaluate('start()')
    assert page.evaluate('editor.doc.id') == current_id
    assert page.evaluate('editor.doc.scene.body') == '<g data-item="unsaved"></g>'
    # Import is a new project, even when its ID matches an existing local project.
    page.locator('#project-file').set_input_files({'name':'roundtrip.scifigure.json','mimeType':'application/json','buffer':json.dumps(exported).encode()})
    page.wait_for_function('(id)=>editor.doc.id!==id',arg=current_id)
    imported_id=page.evaluate('editor.doc.id')
    page.evaluate('projects.flush()')
    assert page.evaluate('editor.doc.scene.body') == '<g data-item="unsaved"></g>'
    assert page.evaluate('(id)=>SF.store.getProject(id).then(Boolean)',current_id)
    page.locator('#projects-btn').click()
    page.wait_for_selector('#project-dialog[open]')
    page.locator(f'.project-row[data-id="{imported_id}"]').get_by_role('button',name='复制',exact=True).click()
    page.wait_for_function("document.querySelectorAll('.project-row').length===4")
    copied_id=page.evaluate("SF.store.listProjects().then(list=>list.find(p=>p.name==='改名项目 副本').id)")
    page.on('dialog',lambda d:d.accept('列表改名' if d.type=='prompt' else None))
    copied_row=page.locator(f'.project-row[data-id="{copied_id}"]')
    copied_row.get_by_role('button',name='重命名',exact=True).click()
    page.wait_for_function("Array.from(document.querySelectorAll('.project-row strong')).some(n=>n.textContent==='列表改名')")
    copied_row.get_by_role('button',name='打开',exact=True).click()
    page.wait_for_function('(id)=>editor.doc.id===id',arg=copied_id)
    assert page.evaluate('editor.doc.scene.body') == '<g data-item="unsaved"></g>'
    page.locator('#projects-btn').click()
    page.locator(f'.project-row[data-id="{copied_id}"]').get_by_role('button',name='删除',exact=True).click()
    page.wait_for_function('(id)=>editor.doc.id!==id',arg=copied_id)
    page.wait_for_function("document.querySelectorAll('.project-row').length===3")
    assert page.evaluate('(id)=>SF.store.getProject(id).then(d=>d===undefined)',copied_id)
    # In-flight writes still count as unsaved when the browser closes.
    page.evaluate("window.actualPut=SF.store.putProject;window.releaseWrite=null;SF.store.putProject=async doc=>{await new Promise(resolve=>releaseWrite=resolve);return actualPut(doc)};editor.edit('<g data-item=\"pending-close\"></g>');void projects.flush()")
    page.wait_for_function('releaseWrite!==null')
    assert page.evaluate("()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented}"), 'Closing during an in-flight write must warn'
    page.evaluate('releaseWrite();SF.store.putProject=actualPut;projects.flush()')
    # Unavailable browser persistence must be explicitly temporary, never saved.
    fallback=browser.new_page()
    fallback.add_init_script("Object.defineProperty(window,'indexedDB',{value:undefined})")
    fallback.goto((ROOT/'tests/project-fixture.html').as_uri()); fallback.evaluate('start()')
    assert fallback.evaluate('SF.store.persistent') is False
    assert fallback.evaluate("statuses.some(s=>/临时|无法保存|不可用/.test(s.text))")
    print('PASS: IndexedDB metadata/payload, atomic pack rejection, project autosave/switch race, rename/duplicate/delete/open, quota, version rejection, backup round-trip, reload, in-flight close guard, explicit memory fallback')
    browser.close()
