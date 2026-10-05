"""Offline Edge behavior tests. Run: python tests/library_test.py."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page()
    page.set_content('<main id="asset-panel"></main><dialog id="asset-dialog"></dialog>')
    for filename in ['svg.js', 'assets.js']:
        f = ROOT / 'src' / filename
        if f.exists():
            page.add_script_tag(path=str(f))
    assert page.evaluate('!!(window.SF && SF.SVG)'), 'SVG normalization API missing'
    page.evaluate('''() => {
      const assert = (condition, msg) => { if(!condition) throw Error(msg); };
      const xml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><clipPath id="c"><circle cx="40" cy="40" r="30"/></clipPath><path id="p" d="M0 0H100V80Z"/></defs><style>.shape {fill:url(#g);stroke:black;stroke-width:2}</style><use href="#p" class="shape" clip-path="url(#c)"/></svg>';
      const a = SF.SVG.normalize(xml, 'one');
      assert(a.width === 120 && a.height === 80, 'viewBox dimensions lost');
      assert(a.svg.includes('linearGradient') && a.svg.includes('clipPath'), 'defs lost');
      const doc = new DOMParser().parseFromString(a.svg, 'image/svg+xml');
      const use = doc.querySelector('use');
      assert(use.getAttribute('href').startsWith('#one'), 'use reference not remapped');
      assert((use.getAttribute('style') || use.getAttribute('fill')).includes('url('), 'CSS paint lost');
      assert(!doc.querySelector('style'), 'style rules not isolated');
      const b = SF.SVG.rekey(a.svg, 'two');
      assert(!b.includes('id="one') && b.includes('#two'), 'duplicate insertion IDs');
      const fragment = SF.SVG.sanitizeFragment('<g data-item="x" data-x="4"><text>蛋白 &amp; RNA</text></g>');
      assert(fragment.includes('data-item="x"') && fragment.includes('蛋白'), 'scene data lost');
      for (const body of ['<script>alert(1)</script>', '<rect onload="alert(1)"/>', '<foreignObject/>', '<use href="https://bad.invalid/x.svg#x"/>', '<style>rect{fill:url(https://bad.invalid/x)}</style>', '<animate attributeName="href" values="javascript:alert(1)"/>']) {
        let threw=false; try { SF.SVG.normalize('<svg xmlns="http://www.w3.org/2000/svg">'+body+'</svg>'); } catch(e) { threw=true; }
        assert(threw, 'unsafe input accepted: '+body);
      }
      let duplicateRejected=false; try { SF.SVG.normalize('<svg><path id="a"/><path id="a"/></svg>'); } catch(e) { duplicateRejected=true; }
      assert(duplicateRejected, 'ambiguous duplicate IDs accepted');
      const plain = SF.SVG.normalize('<svg viewBox="0 0 10 10"><style>.shape{fill:red}.shape{fill:blue}</style><rect class="shape" width="10" height="10"/></svg>');
      const plainDoc=new DOMParser().parseFromString(plain.svg,'image/svg+xml');
      assert(plainDoc.querySelector('rect').style.fill==='blue','namespace-free SVG or CSS source order lost');
      const cascade=SF.SVG.normalize('<svg><style>#item{fill:red}.shape{fill:blue}.shape{stroke:red!important}</style><rect id="item" class="shape" style="stroke:blue"/></svg>');
      const cascadeDoc=new DOMParser().parseFromString(cascade.svg,'image/svg+xml');
      assert(cascadeDoc.querySelector('rect').style.fill==='red' && cascadeDoc.querySelector('rect').style.stroke==='red','CSS specificity/important lost');
    }''')
    assert page.evaluate('!!SF.Assets'), 'Assets library API missing'
    page.evaluate('''async () => {
      const assert = (c,m) => { if(!c) throw Error(m); };
      const sample={id:'same',name:'细胞',category:'细胞',tags:['膜'],author:'作者',source:'来源',license:'保留许可',favorite:true,createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z',svg:'<svg viewBox="0 0 10 20"><rect width="10" height="20"/></svg>',width:10,height:20};
      const records=SF.Assets.preparePack({format:'scifigure-assets',version:1,name:'测试',assets:[sample,sample]},new Set(['same']));
      assert(records.length===2 && records[0].id!==records[1].id && records[0].id!=='same','duplicate pack IDs overwrite');
      assert(records[0].license==='保留许可' && records[0].author==='作者' && records[0].favorite,'metadata lost');
      let rejected=false; try { SF.Assets.preparePack({format:'scifigure-assets',version:1,assets:[sample,{...sample,svg:'<svg><script/></svg>'}]}); } catch(e){rejected=true;}
      assert(rejected,'invalid pack partially accepted');
      const metadata=Array.from({length:10000},(_,i)=>({...sample,id:'record-'+i,name:'素材 '+i,svg:undefined}));
      let reads=0;
      const store={listAssets:async()=>metadata,getAsset:async(id)=>{reads++;return {...sample,id};},setFavorite:async()=>{},putAssets:async()=>{},deleteAsset:async()=>{}};
      window.library=await SF.Assets.init({store,onInsert:()=>{},onStatus:()=>{}});
      assert(document.querySelectorAll('.asset-card').length===48,'10k metadata creates unbounded DOM');
      assert(reads<=48,'previews eagerly load off-page vectors');
      document.querySelector('#asset-search').value='素材 9999';
      document.querySelector('#asset-search').dispatchEvent(new Event('input'));
      await new Promise(resolve=>setTimeout(resolve,250));
      assert(document.querySelectorAll('.asset-card').length===1,'search does not include last record');
    }''')
    browser.close()
print('PASS: SVG safety/references, asset metadata/duplicate IDs/pack validation, 10k pagination/search')
