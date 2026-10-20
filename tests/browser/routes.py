import asyncio, sys
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:5173/'
R=[]
def check(n,c,x=''):
    R.append(bool(c)); print('PASS' if c else 'FAIL', n, x)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']); pg=await b.new_page(); errs=[]; bad=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('response', lambda r: bad.append(f'{r.status} {r.url}') if r.status>=400 else None)
        routes={'':'See it in','#/collection':'The collection','#/product/sofa':'Curved Velvet Sofa','#/smartfit':'SmartFit','#/autogrid':'Design From Real Measurements.','#/upload':'Preview your own model','#/how-it-works':'See it in'}
        for h,t in routes.items():
            await pg.goto(BASE+h); await pg.wait_for_timeout(600)
            txt=await pg.locator('h1').first.inner_text()
            check(f'direct link {h or "/"}', t.replace('\n',' ') in txt.replace('\n',' '), txt.replace('\n',' ')[:40])
            await pg.reload(); await pg.wait_for_timeout(400)
            check(f'refresh {h or "/"}', t.replace('\n',' ') in (await pg.locator('h1').first.inner_text()).replace('\n',' '))
        await pg.goto(BASE+'#/collection'); await pg.wait_for_timeout(300)
        await pg.click('nav >> text=AutoGrid'); await pg.wait_for_timeout(300); await pg.click('nav >> text=SmartFit'); await pg.wait_for_timeout(300)
        await pg.go_back(); await pg.wait_for_timeout(300); a=await pg.locator('h1').inner_text()
        await pg.go_back(); await pg.wait_for_timeout(300); c=await pg.locator('h1').inner_text()
        await pg.go_forward(); await pg.wait_for_timeout(300); f=await pg.locator('h1').inner_text()
        check('browser back/forward', a.startswith('Design From') and c=='The collection' and f.startswith('Design From'))
        for m in ['chair','sofa','barn-lamp','glass-lamp','vase','plant']:
            await pg.goto(BASE+'#/product/'+m); await pg.wait_for_function("document.querySelector('model-viewer')?.loaded===true", timeout=120000)
            src=await pg.evaluate("document.querySelector('model-viewer').src")
            check(f'model loads under /arspace/: {m}', '/arspace/models/' in src, src)
        check('no 4xx/5xx responses', not bad, str(bad[:3]))
        check('no page errors', not errs, str(errs[:2]))
        await b.close()
    print('SUMMARY', sum(R),'/',len(R))
asyncio.run(main())
