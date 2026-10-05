from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge');page=b.new_page(viewport={'width':1700,'height':1040})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto((ROOT/'src/index.html').as_uri());page.wait_for_selector('body[data-ready="true"]')
 result=page.evaluate('''() => {const e=SF.app.editor;e.newDocument();const n=e.addAsset({name:'css',svg:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>.red { fill: #ff0000; stroke: #ff0000; }</style><rect class="red" width="100" height="100"/></svg>'});e.recolor(n,'fill','#0000ff');e.recolor(n,'stroke','#00ff00');return {fill:getComputedStyle(n.querySelector('rect')).fill,stroke:getComputedStyle(n.querySelector('rect')).stroke};}''')
 assert result=={'fill':'rgb(0, 0, 255)','stroke':'rgb(0, 255, 0)'},result
 result=page.evaluate('''() => {const e=SF.app.editor;e.newDocument();e.addAsset({name:'nested',svg:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g><defs><linearGradient id="a"><stop stop-color="red"/></linearGradient></defs><rect width="20" height="20" fill="url(#a)"/></g><rect x="30" width="20" height="20" fill="blue"/></svg>'});e.ungroup();e.duplicate();e.validateDocument(e.getDocument());const ids=[...e.stage.querySelectorAll('[id]')].map(n=>n.id);return ids.length===new Set(ids).size;}''')
 assert result,'Ungroup/duplicate definition IDs collide'
 result=page.evaluate('''() => {const e=SF.app.editor;e.newDocument();let t=e.addItem('text','<text x="0" y="20" style="font-size:10px">Hello</text>','text');let r=e.addItem('rect','<rect width="20" height="20"/>','shape');e.select([t,r]);e.group();e.ungroup();const top=e.selected.find(n=>n.querySelector('text'));e.select([top]);e.editText(top);return {kind:top.dataset.kind,propertiesHidden:document.getElementById('text-props').hidden,dialogOpen:document.getElementById('text-dialog').open};}''')
 assert result=={'kind':'text','propertiesHidden':False,'dialogOpen':True},result
 page.locator('#text-dialog button[value="cancel"]').click()
 page.locator('#prop-fontsize').fill('30');page.locator('#prop-fontsize').dispatch_event('change')
 assert page.locator('#art text').evaluate('(n)=>getComputedStyle(n).fontSize')=='30px'
 page.evaluate('''() => {const e=SF.app.editor;e.newDocument();e.addItem('A','<rect width="100" height="100" fill="red"/>','shape',{x:333,y:333});document.getElementById('zoom').value='1';e.fit();}''')
 before=page.locator('#art > g').get_attribute('transform')
 r=page.locator('#art > g').bounding_box();page.mouse.move(r['x']+50,r['y']+50);page.mouse.down();page.mouse.move(r['x']+50.1,r['y']+50.1);page.mouse.up()
 assert page.locator('#art > g').get_attribute('transform')==before
 assert page.evaluate('SF.app.editor.snapshot()===SF.app.editor.undoStack.at(-1)')
 # Every alignment menu action is reachable; left-align was previously malformed HTML.
 actions=['left','hcenter','right','top','vcenter','bottom','distribute-h','distribute-v']
 for action in actions:
  assert page.locator(f'#align-action option[value="{action}"]').count()==1
 page.evaluate('''() => {const e=SF.app.editor;e.newDocument();const a=e.addItem('a','<rect width="40" height="30"/>','shape',{x:200,y:200});const b=e.addItem('b','<rect width="40" height="30"/>','shape',{x:440,y:450});e.select([a,b]);}''')
 page.locator('#align-action').select_option('left')
 xs=page.locator('#art > g').evaluate_all('(ns)=>ns.map(n=>n.getBoundingClientRect().x)')
 assert abs(xs[0]-xs[1])<.1
 assert not errors,errors
 print('PASS: microdrag, CSS fill/stroke/font, nested defs duplicate, regrouped text')
 b.close()
