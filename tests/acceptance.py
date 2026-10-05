from pathlib import Path
import math
from playwright.sync_api import sync_playwright
import json, argparse
parser=argparse.ArgumentParser()
parser.add_argument('--browser',default='msedge',choices=['msedge','chrome'])
parser.add_argument('--app',type=Path)
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1]
assert (ROOT/'src/index.html').exists(), 'v0.1 application not yet implemented'
with sync_playwright() as p:
    browser=p.chromium.launch(channel=args.browser)
    page=browser.new_page(viewport={'width':1700,'height':1040},accept_downloads=True)
    errors=[]
    requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
    page.goto((args.app or ROOT/'src/index.html').resolve().as_uri())
    page.wait_for_selector('body[data-ready="true"]')
    page.locator('#art > [data-kind="icon"]').first.click()
    assert page.locator('#selection [data-handle="rotate"]').count()==1
    assert page.locator('#selection [data-handle^="resize"]').count()==4
    # Rotate by dragging the dedicated upper-center handle, around the object center.
    icon=page.locator('#art > [data-kind="icon"]').first
    original=icon.get_attribute('transform')
    b=icon.bounding_box();cx=b['x']+b['width']/2;cy=b['y']+b['height']/2
    handle=page.locator('#selection [data-handle="rotate"]').bounding_box()
    hx=handle['x']+handle['width']/2;hy=handle['y']+handle['height']/2
    radius=cy-hy
    page.mouse.move(hx,hy);page.mouse.down()
    for j in range(1,13):
        a=-math.pi/2+(math.pi/2*j/12)
        page.mouse.move(cx+radius*math.cos(a),cy+radius*math.sin(a))
    page.mouse.up()
    assert abs(float(page.locator('#prop-rotation').input_value())-90)<1
    assert icon.get_attribute('transform')!=original
    page.locator('#undo').click()
    assert icon.get_attribute('transform')==original
    page.locator('#redo').click()
    assert icon.get_attribute('transform')!=original
    page.locator('#undo').click()
    # All four handles resize; opposite corner stays fixed with aspect lock.
    for name,dx,dy in [('nw',-15,-15),('ne',15,-15),('se',15,15),('sw',-15,15)]:
        icon.click();before=icon.bounding_box()
        h=page.locator(f'#selection [data-handle="resize-{name}"]').bounding_box()
        x=h['x']+h['width']/2;y=h['y']+h['height']/2
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+dx,y+dy,steps=5);page.mouse.up()
        after=icon.bounding_box();assert after['width']>before['width']+8
        page.locator('#undo').click()
    # New blank project and text editing.
    demo_id=page.evaluate('SF.app.editor.getDocument().id')
    page.locator('#new-project').click()
    page.wait_for_function('(id)=>SF.app.editor.getDocument().id!==id',arg=demo_id)
    page.wait_for_function('document.querySelector("#art").children.length===0')
    page.locator('#project-name').fill('验收测试项目')
    page.locator('#project-name').dispatch_event('change')
    page.locator('#add-text').click()
    text=page.locator('#art > [data-kind="text"]').first
    text.dblclick()
    page.locator('#text-edit-value').fill('第一行\n第二行')
    page.locator('#text-edit-apply').click()
    assert text.locator('tspan').count()==2
    assert page.locator('#prop-text').input_value()=='第一行\n第二行'
    # Real marquee and keyboard nudging/undo are covered through visible item selection.
    page.locator('#add-rect').click()
    rect=page.locator('#art > [data-kind="shape"]').first
    page.locator('#prop-x').fill('100');page.locator('#prop-x').dispatch_event('change')
    page.locator('#prop-y').fill('120');page.locator('#prop-y').dispatch_event('change')
    page.locator('#duplicate').click()
    page.locator('#prop-x').fill('450');page.locator('#prop-x').dispatch_event('change')
    page.locator('#prop-y').fill('350');page.locator('#prop-y').dispatch_event('change')
    rect.click()
    page.locator('#art > [data-kind="shape"]').nth(1).click(modifiers=['Shift'])
    page.locator('#align-action').select_option('top')
    boxes=page.locator('#art > [data-kind="shape"]').evaluate_all('(ns)=>ns.map(n=>n.getBoundingClientRect().y)')
    assert abs(boxes[0]-boxes[1])<.2
    page.locator('#group').click()
    assert page.locator('#art > [data-kind="group"]').count()==1
    page.locator('#ungroup').click()
    assert page.locator('#art > [data-kind="group"]').count()==0
    assert page.locator('#art > [data-item]').count()==3
    page.keyboard.press('Escape')
    page.locator('#art > [data-item]').last.click()
    page.locator('#lock').click()
    assert page.locator('#art > [data-locked="true"]').count()==1
    page.locator('#delete').click()
    assert page.locator('#art > [data-item]').count()==3
    page.locator('#lock').click()
    page.locator('#hide').click()
    assert page.locator('#art > [data-hidden="true"]').count()==1
    page.locator('#undo').click()
    # Add library asset; duplicate internal definitions must get unique IDs.
    page.locator('.asset-preview').first.click()
    page.locator('#duplicate').click()
    ids=page.locator('#stage #art [id],#stage #defs [id]').evaluate_all('(ns)=>ns.map(n=>n.id)')
    assert len(ids)==len(set(ids)), 'duplicate gradient/clip IDs'
    with page.expect_download() as dl: page.locator('#export-svg').click()
    dl.value.save_as(ROOT/'work/acceptance-export.svg')
    with page.expect_download() as dl: page.locator('#export-png').click()
    dl.value.save_as(ROOT/'work/acceptance-export.png')
    from xml.etree import ElementTree as ET
    export=ET.parse(ROOT/'work/acceptance-export.svg')
    assert export.find('.//*[@id="selection"]') is None
    assert export.find('.//*[@id="grid"]') is None
    from PIL import Image
    assert Image.open(ROOT/'work/acceptance-export.png').size==(3600,2400)
    with page.expect_download() as dl: page.locator('#save-project').click()
    dl.value.save_as(ROOT/'work/acceptance-project.scifigure')
    count=page.locator('#art > [data-item]').count()
    await_save=page.evaluate('SF.app.projects.flush().then(()=>true)')
    page.reload();page.wait_for_selector('body[data-ready="true"]')
    assert page.locator('#art > [data-item]').count()==count
    # Invalid import must not mutate active canvas.
    invalid=ROOT/'work/invalid-project.json';invalid.write_text('{"format":"scifigure-project","version":999}',encoding='utf-8')
    current_id=page.evaluate('SF.app.editor.getDocument().id')
    page.locator('#project-file').set_input_files(invalid)
    page.wait_for_function('document.querySelector("#toast").textContent.includes("失败")')
    assert page.evaluate('SF.app.editor.getDocument().id')==current_id
    assert page.locator('#art > [data-item]').count()==count
    # Load pristine demo for a reviewable final screenshot.
    page.locator('#projects-btn').click()
    page.locator(f'.project-row[data-id="{demo_id}"]').get_by_role('button',name='打开',exact=True).click()
    page.wait_for_function('(id)=>SF.app.editor.getDocument().id===id',arg=demo_id)
    page.wait_for_function('!document.querySelector("#project-dialog").open')
    page.locator('#art > [data-kind="icon"]').first.click()
    page.screenshot(path=str(ROOT/'work/initial-editor.png'))
    assert not errors, errors
    assert not requests, requests
    print(json.dumps({'offline_editor_workflows':'passed','rotation':'90 degrees with pointer','corner_handles':4,'exports':'SVG + 3600x2400 PNG','errors':errors,'external_requests':len(requests)}))
    browser.close()
