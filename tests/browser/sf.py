import os, tempfile
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:5173/'
import os, tempfile; SH=os.path.join(tempfile.gettempdir(),'arspace-shots'); os.makedirs(SH, exist_ok=True)
R=[]
def check(n,c,x=''):
    R.append(c); print('PASS' if c else 'FAIL', n, x)
async def banner(pg): return (await pg.locator('.sf-banner strong').inner_text())
async def walk(pg): return (await pg.locator('.sf-stat--wide strong').inner_text())
async def count_state(pg, st): return await pg.locator(f'.plan__item.is-{st}').count()
async def drag_item(pg, name_sub, dx_cm, dy_cm):
    # convert cm delta to screen px using SVG CTM
    g = pg.locator('.plan__item', has_text=name_sub).first
    box = await g.bounding_box()
    scale = await pg.evaluate("(()=>{const s=document.querySelector('[data-plan]'); return s.getScreenCTM().a})()")
    x,y = box['x']+box['width']/2, box['y']+box['height']/2
    await pg.mouse.move(x,y); await pg.mouse.down()
    for i in range(1,11): await pg.mouse.move(x+dx_cm*scale*i/10, y+dy_cm*scale*i/10)
    await pg.mouse.up(); await pg.wait_for_timeout(150)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':1366,'height':900}); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto(BASE); await pg.wait_for_timeout(800)
        await pg.click('nav >> text=SmartFit'); await pg.wait_for_timeout(500)
        check('SmartFit nav opens planner', await pg.locator('h1').inner_text()=='SmartFit')
        check('default 4 x 3 room', await pg.input_value('[data-room=width]')=='4.00' and await pg.input_value('[data-room=length]')=='3.00')
        check('default layout works', await banner(pg)=='Layout works', await banner(pg))
        check('clear walking route', await walk(pg)=='Clear path available')
        check('route drawn', await pg.locator('.plan__route').count()==1)
        await pg.screenshot(path=f'{SH}/sf-fits.png', full_page=True)
        # 1 chair fits in empty room
        await pg.click('[data-clear]'); await pg.click('[data-add=chair]'); await pg.wait_for_timeout(200)
        check('1 chair fits in empty room', await count_state(pg,'ok')==1 and await banner(pg)=='Layout works', await banner(pg))
        # 2 sofa exceeds room width
        await pg.select_option('[data-scenario]','too-wide'); await pg.wait_for_timeout(300)
        txt=await pg.locator('[data-results]').inner_text()
        check('2 sofa exceeds width reported in red', 'extends 10 cm past the left wall' in txt and await count_state(pg,'error')==1)
        check('2 rotate recommendation', 'Rotate the Curved Velvet Sofa by 90°' in txt)
        await pg.screenshot(path=f'{SH}/sf-toowide.png', full_page=True)
        # 3 overlap
        await pg.select_option('[data-scenario]','overlap'); await pg.wait_for_timeout(300)
        txt=await pg.locator('[data-results]').inner_text()
        check('3 overlap measured', 'overlaps the Coffee Table by 15 cm' in txt and await count_state(pg,'error')==2, txt.split('\n')[0])
        await pg.screenshot(path=f'{SH}/sf-overlap.png', full_page=True)
        # fix by dragging table down 20cm
        await drag_item(pg,'Coffee table',0,20); txt=await pg.locator('[data-results]').inner_text()
        check('3b dragging fixes overlap', await pg.locator('.sf-issues').count()==0 and await count_state(pg,'error')==0, await banner(pg))
        # 4 rotate resolves
        await pg.select_option('[data-scenario]','rotate'); await pg.wait_for_timeout(300)
        check('4 rotate scenario has collision', await count_state(pg,'error')==2)
        await pg.locator('.plan__item', has_text='Bookshelf').first.dispatch_event('pointerdown') if False else None
        g=pg.locator('.plan__item', has_text='Bookshelf').first; bx=await g.bounding_box()
        await pg.mouse.click(bx['x']+bx['width']/2, bx['y']+bx['height']/2); await pg.wait_for_timeout(150)
        check('selected panel shows bookshelf', 'Bookshelf' in await pg.locator('[data-selected]').inner_text())
        await pg.click('[data-rotate]'); await pg.wait_for_timeout(200)
        check('4 rotating resolves collision', await count_state(pg,'error')==0 and await banner(pg)=='Layout works', await banner(pg))
        await pg.focus('[data-plan]'); await pg.keyboard.press('r'); await pg.wait_for_timeout(150)
        check('keyboard R rotates back -> collision', await count_state(pg,'error')==2)
        # 5 blocked
        await pg.select_option('[data-scenario]','blocked'); await pg.wait_for_timeout(300)
        check('5 walkway blocked', await walk(pg)=='No path available' and await pg.locator('.plan__route').count()==0)
        await pg.screenshot(path=f'{SH}/sf-blocked.png', full_page=True)
        # restricted: move tv unit 25cm left? gap left between sofa and tv
        await pg.select_option('[data-scenario]','fits'); await pg.wait_for_timeout(300)
        await drag_item(pg,'Plant',-40,0)
        w=await walk(pg); check('restricted pathway shown after narrowing', w=='Restricted pathway', w + ' / ' + await pg.locator('.sf-stat--wide em').inner_text())
        check('narrowest marker drawn', await pg.locator('.plan__narrow').count()==1)
        await pg.screenshot(path=f'{SH}/sf-restricted.png')
        # clearance slider lowering
        await pg.locator('[data-clearance]').fill('45'); await pg.wait_for_timeout(200)
        check('6 lowering clearance -> clear path', await walk(pg)=='Clear path available')
        await pg.locator('[data-clearance]').fill('80')
        # 7 edit dims + room
        await pg.click('[data-reset]'); await pg.wait_for_timeout(200)
        g=pg.locator('.plan__item', has_text='Chair').first; bx=await g.bounding_box()
        await pg.mouse.click(bx['x']+bx['width']/2, bx['y']+bx['height']/2)
        await pg.fill('[data-dim=d]','140'); await pg.press('[data-dim=d]','Enter'); await pg.locator('[data-dim=d]').dispatch_event('change'); await pg.wait_for_timeout(200)
        txt=await pg.locator('[data-results]').inner_text(); check('7 editing chair depth creates issue', 'Chair' in txt and await banner(pg)!='Layout works', await banner(pg))
        check('7 edited tag shown', 'Size edited by you' in await pg.locator('[data-selected]').inner_text())
        await pg.fill('[data-dim=w]','5000'); await pg.locator('[data-dim=w]').dispatch_event('change'); await pg.wait_for_timeout(100)
        check('7 invalid dim rejected', await pg.locator('[data-dim-error]').is_visible())
        await pg.fill('[data-room=width]','2.5'); await pg.locator('[data-room=width]').dispatch_event('change'); await pg.wait_for_timeout(200)
        txt=await pg.locator('.sf-stats').inner_text(); check('7 room width edit applied', '2.50 × 3.00 m' in txt)
        await pg.fill('[data-room=width]','40'); await pg.locator('[data-room=width]').dispatch_event('change'); await pg.wait_for_timeout(100)
        check('7 unrealistic room rejected', await pg.locator('[data-room-error]').is_visible() and '2.50 × 3.00 m' in await pg.locator('.sf-stats').inner_text())
        await pg.fill('[data-room=width]',''); await pg.locator('[data-room=width]').dispatch_event('change')
        check('7 empty room value rejected', await pg.locator('[data-room-error]').is_visible())
        # remove, delete key, grid toggle, markers drag
        await pg.select_option('[data-scenario]','fits'); await pg.wait_for_timeout(200)
        n0=await pg.locator('.plan__item').count()
        g=pg.locator('.plan__item', has_text='Plant').first; bx=await g.bounding_box(); await pg.mouse.click(bx['x']+bx['width']/2, bx['y']+bx['height']/2)
        await pg.keyboard.press('Delete'); await pg.wait_for_timeout(100)
        check('Delete key removes item', await pg.locator('.plan__item').count()==n0-1)
        await pg.click('[data-reset]'); check('reset restores arrangement', await pg.locator('.plan__item').count()==n0)
        await pg.uncheck('[data-grid]', force=True); check('grid toggle', await pg.locator('.plan__grid').count()==0); await pg.check('[data-grid]', force=True)
        m=pg.locator('[data-marker=entry]'); bx=await m.bounding_box(); scale=await pg.evaluate("document.querySelector('[data-plan]').getScreenCTM().a")
        await pg.mouse.move(bx['x']+bx['width']/2, bx['y']+bx['height']/2); await pg.mouse.down(); await pg.mouse.move(bx['x']+bx['width']/2+100*scale, bx['y']+bx['height']/2-20*scale, steps=8); await pg.mouse.up()
        check('entry marker draggable', abs((await m.bounding_box())['x']-bx['x'])>50*scale)
        # AR link
        check('Preview in AR links exist', await pg.locator('a.sf-ar-link[href="#/product/chair?ar=1"]').count()==1)
        # ?add from product page
        await pg.goto(BASE+'#/product/sofa'); await pg.wait_for_timeout(500)
        await pg.click('text=Check if it fits your room in SmartFit'); await pg.wait_for_timeout(400)
        check('product page -> SmartFit adds sofa', await pg.locator('.plan__item', has_text='Sofa').count()==2 and 'Sofa' in await pg.locator('[data-selected]').inner_text())
        # mobile
        mp=await b.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
        await mp.goto(BASE+'#/smartfit'); await mp.wait_for_timeout(600)
        sw=await mp.evaluate("document.documentElement.scrollWidth"); check('mobile no horizontal overflow', sw<=390, str(sw))
        await mp.screenshot(path=f'{SH}/sf-mobile.png', full_page=True)
        # touch: drag furniture with a finger, and swipe empty floor to scroll the page
        tc=await b.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, user_agent='Mozilla/5.0 (Linux; Android 14) Chrome/129 Mobile')
        tp=await tc.new_page(); await tp.goto(BASE+'#/smartfit'); await tp.wait_for_timeout(700)
        g=tp.locator('.plan__item', has_text='Coffee table').first; await g.scroll_into_view_if_needed(); bb=await g.bounding_box()
        getx="JSON.parse(localStorage.getItem('arspace.workingPlan')).furniture.find(f=>f.kind==='coffee-table').xMeters"
        x0=await tp.evaluate(getx); cdp=await tc.new_cdp_session(tp); x,y=bb['x']+bb['width']/2, bb['y']+bb['height']/2
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
        for i in range(1,21):
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+i*3,'y':y,'id':1}]}); await tp.wait_for_timeout(20)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); await tp.wait_for_timeout(300)
        x1=await tp.evaluate(getx); check('touch drag moves furniture (emulated touch)', x1-x0>0.5, f'{x0}->{x1} m')
        sb=await tp.locator('[data-plan]').bounding_box(); sy0=await tp.evaluate('scrollY'); ex,ey=sb['x']+8, sb['y']+sb['height']-8
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':ex,'y':ey,'id':2}]})
        for i in range(1,16):
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':ex,'y':ey-i*12,'id':2}]}); await tp.wait_for_timeout(16)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); await tp.wait_for_timeout(500)
        check('swipe on empty floor still scrolls the page', await tp.evaluate('scrollY')-sy0>50)
        await tc.close()
        real=[e for e in errs if 'Failed to load resource' not in e]
        check('no console errors', not real, json.dumps(real)[:300])
        await b.close()
    print('SUMMARY', sum(R), '/', len(R))
asyncio.run(main())
