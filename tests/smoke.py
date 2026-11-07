"""Smoke test for Drill Writer.

Run from the repo root:  python3 tests/smoke.py [--shots DIR]
Starts a local server, loads the app in Chromium, exercises the main features,
and saves screenshots. Exits non-zero on any failure.
"""
import http.server, socketserver, threading, sys, os, functools, json

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else os.path.join(ROOT, 'tests', 'shots')
os.makedirs(SHOTS, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
Handler = functools.partial(Quiet, directory=ROOT)
srv = socketserver.TCPServer(('127.0.0.1', 0), Handler)
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{port}/index.html'

fails = []
def check(name, cond):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond: fails.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chromium')
    page = browser.new_page(viewport={'width': 1440, 'height': 860})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('dialog', lambda d: d.accept())
    page.goto(URL); page.wait_for_function('window.__dw && window.__dw.show')
    check('loads with no errors', not errors)

    # empty show → add performers
    page.click('.tab[data-tab=perf]')
    page.select_option('#addSection', 'trumpet'); page.fill('#addCount', '8'); page.click('#btnAddPerf')
    n = page.evaluate('__dw.show.performers.length')
    check('adds 8 trumpets', n == 8)
    check('new performers are selected', page.evaluate('__dw.sel.size') == 8)
    labels = page.evaluate('__dw.show.performers.map(p=>p.label)')
    check('labels T1..T8', labels == [f'T{i}' for i in range(1, 9)])

    # line tool: drag across the field
    box = page.locator('#field').bounding_box()
    def scr(x, y):  # world → page coords
        v = page.evaluate('({...__dw.view})')
        return box['x'] + v['ox'] + x * v['scale'], box['y'] + v['oy'] - y * v['scale']
    page.click('[data-tool=line]')
    x0, y0 = scr(-16, 36.44); x1, y1 = scr(16, 36.44)
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=6); page.mouse.up()
    pos = page.evaluate('__dw.show.performers.map(p=>__dw.show.sets[0].pos[p.id])')
    ys = {round(q['y'], 2) for q in pos}; xs = sorted(q['x'] for q in pos)
    check('line puts everyone on one front-to-back spot', len(ys) == 1)
    check('line uses 2-step interval', all(abs((xs[i + 1] - xs[i]) - 2) < 0.01 for i in range(7)))

    # add set, move selection with arrow keys, check counts/step size
    page.click('.tab[data-tab=sets]'); page.click('#btnAddSet')
    check('second set added', page.evaluate('__dw.show.sets.length') == 2)
    page.click('[data-tool=select]')
    page.locator('#field').focus()
    for _ in range(4): page.keyboard.press('Shift+ArrowUp')
    moved = page.evaluate('__dw.show.performers.map(p=>__dw.show.sets[1].pos[p.id].y - __dw.show.sets[0].pos[p.id].y)')
    check('nudge moves 16 steps back in set 2 only', all(abs(d - 16) < 0.01 for d in moved))
    check('16 steps in 16 counts is not flagged', page.evaluate("document.querySelectorAll('#setList li.warn').length") == 0)
    page.locator('#setList li').nth(1).locator('.counts input').fill('8')
    page.locator('#setList li').nth(1).locator('.counts input').press('Enter')
    check('16 steps in 8 counts is flagged as too big', page.evaluate("document.querySelectorAll('#setList li.warn').length") == 1)

    # undo restores counts
    page.locator('#field').focus(); page.keyboard.press('Control+z')
    check('undo restores counts', page.evaluate('__dw.show.sets[1].counts') == 16)

    # transforms
    page.click('[data-act=rot90]')
    pos2 = page.evaluate('__dw.show.performers.map(p=>__dw.show.sets[1].pos[p.id])')
    check('rotate 90 turns the line front-to-back', len({round(q['x'], 2) for q in pos2}) == 1)
    page.click('[data-act=mirror50]')
    check('mirror across 50 flips x', all(q['x'] < 0 for q in pos2) == all(q['x'] > 0 for q in page.evaluate('__dw.show.performers.map(p=>__dw.show.sets[1].pos[p.id])')))

    # dot tab for one performer
    page.click('.tab[data-tab=perf]'); page.click('.chip >> nth=0')
    page.click('.tab[data-tab=info]')
    rows = page.locator('.dot-table tbody tr').count()
    check('dot sheet shows one row per set', rows == 2)
    check('dot sheet uses yard-line wording', 'yd ln' in page.inner_text('.dot-table'))

    # props
    page.click('.tab[data-tab=props]'); page.click('#btnAddProp')
    check('prop added to every set', page.evaluate('__dw.show.sets.every(s=>Object.keys(s.props).length===1)'))

    # playback
    page.click('#btnNextSet'); page.click('#btnPrevSet')
    check('prev set goes back to set 1', page.evaluate('__dw.cur') == 0)
    page.fill('#bpm', '240'); page.press('#bpm', 'Enter')
    page.click('#btnPlay'); page.wait_for_timeout(1500)
    mid = page.evaluate('__dw.count')
    check('playback advances the count', mid > 2)
    page.wait_for_timeout(3500)
    check('playback stops at the last set', page.evaluate('!__dw.playing && __dw.cur === 1'))

    # autosave survives reload
    page.wait_for_timeout(500); page.reload(); page.wait_for_function('window.__dw && window.__dw.show')
    check('autosave restores the show after reload', page.evaluate('__dw.show.performers.length') == 8)

    # sample show + screenshots
    page.click('#btnSample'); page.wait_for_timeout(200)
    check('sample show loads 52 performers', page.evaluate('__dw.show.performers.length') == 52)
    page.click('.tab[data-tab=sets]')
    page.screenshot(path=f'{SHOTS}/1-set1-light.png')
    page.click('#btnNextSet'); page.wait_for_timeout(100)
    page.screenshot(path=f'{SHOTS}/2-set2-paths.png')
    page.evaluate("document.querySelector('#scrub').value = 26; document.querySelector('#scrub').dispatchEvent(new Event('input'))")
    page.screenshot(path=f'{SHOTS}/3-mid-transition.png')
    page.click('#btnTheme'); page.click('#btnNextSet'); page.wait_for_timeout(100)
    page.click('.tab[data-tab=perf]'); page.click('.sec-head >> text=Trumpet')
    page.screenshot(path=f'{SHOTS}/4-dark-selected.png')
    # arc tool on the trumpets
    page.click('[data-tool=arc]')
    for (x, y) in [(-20, 30.44), (20, 30.44), (0, 42.44)]:
        sxp, syp = scr(x, y); page.mouse.click(sxp, syp)
    arc = page.evaluate("__dw.show.performers.filter(p=>p.section==='trumpet').map(p=>__dw.show.sets[__dw.cur].pos[p.id])")
    ends = sorted(arc, key=lambda q: q['x'])
    check('arc runs from start to end point', abs(ends[0]['x'] + 20) < 0.05 and abs(ends[-1]['x'] - 20) < 0.05)
    check('arc bulges backward', max(q['y'] for q in arc) > 38)
    page.screenshot(path=f'{SHOTS}/5-arc.png')

    # tablet width
    page.set_viewport_size({'width': 820, 'height': 1180}); page.wait_for_timeout(200)
    page.screenshot(path=f'{SHOTS}/6-tablet.png', full_page=True)

    check('no console errors during run', not errors)
    if errors: print('\n'.join(errors))
    browser.close()

srv.shutdown()
print(f'\n{len(fails)} failure(s)')
sys.exit(1 if fails else 0)
