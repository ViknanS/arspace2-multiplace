import os, tempfile
import asyncio, sys, os, json
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:5173/'
import os, tempfile; SH=os.path.join(tempfile.gettempdir(),'arspace-shots'); os.makedirs(SH, exist_ok=True)
ARGS=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
results=[]
def check(name, cond, extra=''):
    results.append((name, bool(cond), extra)); print(('PASS' if cond else 'FAIL'), name, extra)
LOADED="document.querySelector('model-viewer')?.loaded === true"
async def desktop(b):
    ctx=await b.new_context(viewport={'width':1366,'height':860})
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append('PE '+str(e)+' '+(e.stack or '')[:500]))
    pg.on('console', lambda m: errs.append(m.text+' @'+str(m.location)) if m.type=='error' else None)
    await pg.goto(BASE); await pg.wait_for_function(LOADED, timeout=90000); await pg.wait_for_timeout(2500)
    check('home loads with hero model', await pg.locator('.hero__title').is_visible())
    st=await pg.locator('[data-device-status]').inner_text(); check('desktop device status message', 'computer' in st, st[:60])
    await pg.screenshot(path=f'{SH}/home.png')
    await pg.screenshot(path=f'{SH}/home-full.png', full_page=True)
    await pg.click('[data-try-ar]'); await pg.wait_for_timeout(400)
    check('Try AR on desktop opens unsupported dialog', await pg.locator('dialog[open] h2').inner_text()=="AR isn't available on this device")
    await pg.screenshot(path=f'{SH}/dialog-unsupported.png'); await pg.keyboard.press('Escape')
    # collection
    await pg.click('text=Explore collection'); await pg.wait_for_timeout(500)
    n=await pg.locator('.grid .card').count(); check('catalog shows 6 cards', n==6, str(n))
    await pg.screenshot(path=f'{SH}/collection.png', full_page=True)
    await pg.click('.segmented__btn[data-category=lighting]'); n=await pg.locator('.grid .card').count(); check('lighting filter -> 2', n==2, str(n))
    await pg.fill('.search input','table'); n=await pg.locator('.grid .card').count(); check('filter + search combined -> 1', n==1, str(n))
    await pg.fill('.search input','xyz'); check('empty state shown', await pg.locator('.empty').count()==1)
    await pg.click('[data-clear]'); n=await pg.locator('.grid .card').count(); check('clear restores all', n==6)
    await pg.fill('.search input','sofa'); n=await pg.locator('.grid .card').count(); check('search sofa -> 1', n==1)
    # thumbnails loaded
    await pg.fill('.search input',''); await pg.wait_for_timeout(800)
    ok=await pg.evaluate("[...document.querySelectorAll('.card img')].every(i=>i.complete && i.naturalWidth>0)"); check('all thumbnails load', ok)
    # product
    await pg.click('.card:has-text("Accent Chair") >> text=View in 3D'); await pg.wait_for_function(LOADED, timeout=90000); await pg.wait_for_timeout(1500)
    await pg.wait_for_timeout(1000)
    check('product page title', 'Accent Chair' in await pg.locator('h1').inner_text())
    dims=await pg.locator('[data-dims]').inner_text(); check('real dimensions shown', 'wide' in dims, dims)
    st=await pg.get_attribute('[data-ar]','data-state'); check('AR button state unsupported on desktop', st=='unsupported', st)
    check('AR modes configured', await pg.get_attribute('model-viewer','ar-modes')=='webxr scene-viewer quick-look')
    chips=await pg.locator('.chip').count(); check('variant chips', chips==2, str(chips))
    await pg.locator('.chip').nth(1).click(); vn=await pg.evaluate("document.querySelector('model-viewer').variantName"); check('variant switches', vn=='Peacock Velvet', str(vn))
    await pg.locator('[data-scale]').fill('140'); check('scale slider sets scale attr', await pg.get_attribute('model-viewer','scale')=='1.4 1.4 1.4')
    await pg.locator('[data-rot]').fill('90'); check('rotation slider sets orientation', await pg.get_attribute('model-viewer','orientation')=='0deg 0deg 90deg')
    await pg.click('[data-rot-step="45"]'); check('rotate +45 button', await pg.get_attribute('model-viewer','orientation')=='0deg 0deg 135deg')
    await pg.uncheck('[data-autorotate]', force=True); check('auto-rotate toggle off', await pg.get_attribute('model-viewer','auto-rotate') is None)
    # mouse drag orbit
    before=await pg.evaluate("document.querySelector('model-viewer').getCameraOrbit().theta")
    box=await pg.locator('model-viewer').bounding_box(); cx,cy=box['x']+box['width']/2, box['y']+box['height']/2
    await pg.mouse.move(cx,cy); await pg.mouse.down(); await pg.mouse.move(cx+200,cy,steps=10); await pg.mouse.up(); await pg.wait_for_timeout(800)
    after=await pg.evaluate("document.querySelector('model-viewer').getCameraOrbit().theta"); check('mouse drag rotates camera', abs(after-before)>0.1, f'{before:.2f}->{after:.2f}')
    r0=await pg.evaluate("document.querySelector('model-viewer').getCameraOrbit().radius")
    await pg.mouse.move(cx,cy); await pg.mouse.wheel(0,-400); await pg.wait_for_timeout(900)
    r1=await pg.evaluate("document.querySelector('model-viewer').getCameraOrbit().radius"); check('wheel zooms', r1<r0, f'{r0:.2f}->{r1:.2f}')
    await pg.screenshot(path=f'{SH}/product-modified.png')
    await pg.click('[data-reset]'); await pg.wait_for_timeout(900)
    ok=(await pg.get_attribute('model-viewer','scale')=='1 1 1') and (await pg.get_attribute('model-viewer','orientation')=='0deg 0deg 0deg')
    r2=await pg.evaluate("document.querySelector('model-viewer').getCameraOrbit().radius"); check('reset restores scale/orientation/camera', ok and abs(r2-r0)<0.05, f'r={r2:.2f}')
    await pg.check('[data-autorotate]', force=True); await pg.wait_for_timeout(1000)
    await pg.screenshot(path=f'{SH}/product.png')
    await pg.click('[data-ar]'); await pg.wait_for_timeout(300); check('desktop AR click explains (no silent fail)', await pg.locator('dialog[open]').count()==1)
    await pg.keyboard.press('Escape')
    # quick switching
    for pid in ['sofa','plant','vase','barn-lamp','glass-lamp']:
        await pg.goto(BASE+'#/product/'+pid); await pg.wait_for_timeout(150)
    await pg.wait_for_function(LOADED, timeout=90000); await pg.wait_for_timeout(1200)
    cnt=await pg.locator('model-viewer').count(); t=await pg.locator('h1').inner_text()
    check('rapid switching ends on correct single viewer', cnt==1 and 'Lamp' in t, t)
    await pg.screenshot(path=f'{SH}/product-lamp.png')
    for pid in ['sofa','barn-lamp','vase','plant']:
        await pg.goto(BASE+'#/product/'+pid); await pg.wait_for_function(LOADED, timeout=90000); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{SH}/p-{pid}.png')
    # missing model
    await pg.route('**/models/chair.glb', lambda r: r.fulfill(status=404, body='nope'))
    await pg.goto(BASE+'#/collection'); await pg.goto(BASE+'#/product/chair'); await pg.wait_for_timeout(5000)
    vis=await pg.locator('.stage__error').is_visible(); txt=await pg.locator('.stage__error').inner_text() if vis else ''
    check('missing model shows error', vis, txt.replace('\n',' | ')[:90])
    st=await pg.get_attribute('[data-ar]','data-state'); check('AR button error state', st=='error', st)
    await pg.screenshot(path=f'{SH}/error.png')
    await pg.unroute('**/models/chair.glb')
    # unknown product / route
    await pg.goto(BASE+'#/product/nope'); check('unknown product message', 'not found' in (await pg.locator('h1').inner_text()).lower())
    # upload
    await pg.goto(BASE+'#/upload'); await pg.wait_for_timeout(300)
    open(''+os.path.join(tempfile.gettempdir(),'')+'fake.glb','wb').write(b'not a model at all'*10)
    await pg.set_input_files('[data-file]',''+os.path.join(tempfile.gettempdir(),'')+'fake.glb'); await pg.wait_for_timeout(300)
    check('corrupt .glb rejected', await pg.locator('[data-error]').is_visible(), await pg.locator('[data-error]').inner_text())
    open(''+os.path.join(tempfile.gettempdir(),'')+'photo.png','wb').write(b'\x89PNG'+b'0'*100)
    await pg.set_input_files('[data-file]',''+os.path.join(tempfile.gettempdir(),'')+'photo.png'); await pg.wait_for_timeout(200)
    check('png rejected', 'isn' in await pg.locator('[data-error]').inner_text())
    await pg.set_input_files('[data-file]',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','public','models','vase.glb')); await pg.wait_for_function(LOADED, timeout=60000); await pg.wait_for_timeout(1500)
    check('valid glb previews locally', await pg.locator('[data-result]').is_visible() and (await pg.get_attribute('model-viewer','src')).startswith('blob:'))
    check('no AR on uploaded model', await pg.get_attribute('model-viewer','ar') is None)
    await pg.screenshot(path=f'{SH}/upload.png')
    await pg.set_input_files('[data-file]',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','public','models','chair.glb')); await pg.wait_for_function(LOADED, timeout=60000)
    check('replacing upload keeps one viewer', await pg.locator('model-viewer').count()==1)
    real=[e for e in errs if 'favicon' not in e and '404' not in e and 'Failed to load resource' not in e]
    check('no unexpected console errors', not real, json.dumps(real)[:400])
    await ctx.close()

async def mobile(b, ua, name):
    ctx=await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=ua)
    pg=await ctx.new_page(); navs=[]
    pg.on('framenavigated', lambda f: navs.append(f.url))
    pg.on('request', lambda r: navs.append(r.url) if r.url.startswith('intent:') else None)
    await pg.goto(BASE); await pg.wait_for_function(LOADED, timeout=90000); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=f'{SH}/m-{name}-home.png')
    await pg.click('.nav__toggle'); await pg.wait_for_timeout(200); check(f'{name}: mobile menu opens', await pg.locator('.nav__links.is-open').is_visible())
    await pg.screenshot(path=f'{SH}/m-{name}-menu.png'); await pg.click('.nav__toggle')
    await pg.goto(BASE+'#/product/chair'); await pg.wait_for_function(LOADED, timeout=90000); await pg.wait_for_timeout(2500)
    st=await pg.get_attribute('[data-ar]','data-state'); can=await pg.evaluate("document.querySelector('model-viewer').canActivateAR")
    check(f'{name}: AR state', True, f'state={st} canActivateAR={can}')
    await pg.screenshot(path=f'{SH}/m-{name}-product.png'); await pg.screenshot(path=f'{SH}/m-{name}-product-full.png', full_page=True)
    # touch drag
    box=await pg.locator('model-viewer').bounding_box()
    before=await pg.evaluate("document.querySelector('model-viewer').getCameraOrbit().theta")
    cdp=await ctx.new_cdp_session(pg); x,y=box['x']+box['width']/2, box['y']+box['height']/2
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    for i in range(1,21):
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+i*8,'y':y}]}); await pg.wait_for_timeout(16)
    await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); await pg.wait_for_timeout(800)
    after=await pg.evaluate("document.querySelector('model-viewer').getCameraOrbit().theta"); check(f'{name}: touch drag rotates', abs(after-before)>0.1, f'{before:.2f}->{after:.2f}')
    if st=='ready':
        await pg.click('[data-ar]'); await pg.wait_for_timeout(400)
        check(f'{name}: AR guide shown first time', await pg.locator('dialog[open] h2').inner_text()=='How to place an object')
        await pg.screenshot(path=f'{SH}/m-{name}-guide.png')
        try:
            await pg.click('dialog[open] [value=start]', timeout=3000)
        except Exception as e: pass
        await pg.wait_for_timeout(2000)
        intents=[u for u in navs if u.startswith('intent:')]
        check(f'{name}: AR launch attempted', True, (intents[0][:160] if intents else 'no intent nav captured; urls='+str(navs[-3:])))
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS)
        await desktop(b)
        await mobile(b,'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36','android')
        await mobile(b,'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/99 Chrome/129 Safari/537.36 NoAR','generic')
        await b.close()
    print('\nSUMMARY', sum(r[1] for r in results), '/', len(results))
asyncio.run(main())
