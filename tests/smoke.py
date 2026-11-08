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
    browser = p.chromium.launch(channel='chromium', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
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
    page.locator('#setList li').nth(1).locator('.counts input[aria-label=Counts]').fill('8')
    page.locator('#setList li').nth(1).locator('.counts input[aria-label=Counts]').press('Enter')
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

    # drop a student: middle trumpet of the arc drawn above (a saved form in this set)
    page.click('[data-tool=select]')
    tr = page.evaluate("__dw.show.performers.filter(p=>p.section==='trumpet').map(p=>({id:p.id,x:__dw.show.sets[__dw.cur].pos[p.id].x})).sort((a,b)=>a.x-b.x)")
    drop_id = tr[2]['id']
    page.evaluate(f"__dw.sel = new Set(['{drop_id}'])")
    page.click('.tab[data-tab=perf]'); page.evaluate("document.querySelector('#btnDropPerf').disabled=false"); page.click('#btnDropPerf')
    page.wait_for_selector('#dropApply')
    cur = page.evaluate('__dw.cur')
    plan = page.evaluate(f"(()=>{{const pl=__dw.drop.plans[{cur}]; return {{src: pl.chain && pl.chain.source, n: pl.chain && pl.chain.ids.length, choice: __dw.drop.choices[{cur}], movers: Object.keys(pl.options.close||{{}}).length}}}})()")
    check('drop uses the saved arc in this set', plan['src'] == 'saved' and plan['n'] == 6)
    check('close the gap is the default', plan['choice'] == 'close')
    check('close the gap moves only the shorter side (2 of 5)', plan['movers'] == 2)
    check('field editing is locked during review', page.evaluate("document.querySelector('.tabs').classList.contains('locked')"))
    page.screenshot(path=f'{SHOTS}/8-drop-review.png')
    before = page.evaluate('__dw.show.performers.length')
    page.click('#dropApply'); page.wait_for_selector('#dropDone')
    check('dropped student removed from show', page.evaluate('__dw.show.performers.length') == before - 1)
    check('dropped student gone from every set', page.evaluate(f"__dw.show.sets.every(s=>!s.pos['{drop_id}'])"))
    check('report lists changed dots', page.locator('.report-list li').count() >= 2)
    page.screenshot(path=f'{SHOTS}/9-drop-report.png')
    page.click('#btnUndo')
    check('undo brings the student back', page.evaluate(f"__dw.show.performers.some(p=>p.id==='{drop_id}')"))
    page.click('#dropDone')

    # add a student next to the same trumpet
    page.evaluate(f"__dw.sel = new Set(['{drop_id}'])")
    page.click('.tab[data-tab=perf]'); page.select_option('#addSection', 'trumpet'); page.click('#btnAddStudent')
    page.wait_for_selector('#addApply')
    check('new student gets next trumpet ID', page.input_value('#addLabel') == 'T7')
    cur = page.evaluate('__dw.cur')
    page.locator('.drop-sets li').nth(cur).locator('select').select_option('insert')
    ins = page.evaluate(f"Object.keys(__dw.drop.plans[{cur}].options.insert.moves).length")
    check('insert next to anchor moves only the shorter side', ins == 2)
    page.screenshot(path=f'{SHOTS}/10-add-review.png')
    n0 = page.evaluate('__dw.show.performers.length')
    page.click('#addApply'); page.wait_for_selector('#addDone')
    check('student added to every set', page.evaluate("__dw.show.performers.length") == n0 + 1 and page.evaluate("__dw.show.sets.every(s=>Object.keys(s.pos).length===__dw.show.performers.length)"))
    check('add report names the movers', page.locator('.report-list li').count() == 2)
    page.click('#btnUndo'); page.click('#addDone')
    check('undo removes the added student', page.evaluate('__dw.show.performers.length') == n0)

    # drop leaving a hole, then add fills it
    page.evaluate(f"__dw.sel = new Set(['{tr[1]['id']}']); document.querySelector('#btnDropPerf').disabled=false")
    page.click('#btnDropPerf'); page.wait_for_selector('#dropApply')
    page.evaluate("document.querySelectorAll('.drop-sets select').forEach(s=>{s.value='hole'; s.dispatchEvent(new Event('change'))})")
    page.click('#dropApply'); page.click('#dropDone')
    check('leave-the-hole remembers the empty spot', page.evaluate('__dw.show.sets.every(s=>s.holes.length===1)'))
    page.evaluate(f"__dw.sel = new Set(['{tr[0]['id']}'])")
    page.click('#btnAddStudent'); page.wait_for_selector('#addApply')
    check('add defaults to filling the empty spot', page.evaluate("__dw.drop.choices.every(c=>c==='hole')"))
    page.click('#addApply'); page.click('#addDone')
    check('filling the spot moves nobody and clears it', page.evaluate('__dw.show.sets.every(s=>s.holes.length===0)'))

    # rehearsal mode: sets 1 → 3 at a fast tempo
    page.click('#btnSample'); page.wait_for_timeout(200)
    page.click('.tab[data-tab=sets]')
    for i in (1, 2):
        ti = page.locator('#setList li').nth(i).locator('.tempo-in'); ti.fill('300'); ti.press('Enter')
    check('per-set tempo saved', page.evaluate('__dw.show.sets[1].bpm === 300 && __dw.show.sets[2].bpm === 300'))
    page.click('#btnRehearse')
    check('rehearse panel opens', page.is_visible('#rhGo'))
    check('default count-off is 1 . 3 . 1 2 3 4', page.evaluate('JSON.stringify(__rh.settings.beats)') == '[2,0,1,0,2,1,1,1]')
    page.evaluate("(()=>{for (const [id,v] of [['#rhFrom','0'],['#rhTo','2']]) { const s=document.querySelector(id); s.value=v; s.dispatchEvent(new Event('change')); }})()")
    page.evaluate("document.querySelector('#rhPct').value=120; document.querySelector('#rhPct').dispatchEvent(new Event('input'))")
    check('tempo label shows 360', '360' in page.inner_text('#rhPctLabel'))
    page.click('#rhGo'); page.wait_for_timeout(700)
    check('count-off shows big number', page.is_visible('#bigCount') and page.evaluate("document.querySelector('#bigCount').classList.contains('countoff')"))
    page.screenshot(path=f'{SHOTS}/11-rehearse-countoff.png')
    page.wait_for_timeout(4500)
    check('run is moving the drill', 0 < page.evaluate('__dw.count') < 48)
    check('big count shows the set total', page.inner_text('#bigCount .bc-of') == '/24')
    check('progress bar has one segment per count', page.locator('#bigCount .bc-bar i').count() == 24)
    check('big count says what comes next', 'set' in page.inner_text('#bigCount .bc-next').lower())
    page.screenshot(path=f'{SHOTS}/12-rehearse-run.png')
    page.wait_for_function('!__rh.engine.running', timeout=15000)
    check('run stops on the last set', page.evaluate('__dw.cur') == 2 and abs(page.evaluate('__dw.count') - 48) < 0.01)
    check('6 count-off sounds + 49 clicks scheduled', page.evaluate('__rh.engine.stats.scheduled') == 55)
    # stop mid-run
    page.click('#rhGo'); page.wait_for_timeout(2500); page.click('#rhStop')
    check('stop button stops the rep', not page.evaluate('__rh.engine.running') and not page.evaluate('__dw.playing'))
    page.click('.tab[data-tab=sets]')

    # 3D view
    page.set_viewport_size({'width': 1440, 'height': 860})
    page.click('#view3dBtn'); page.wait_for_function('__dw.v3 && __dw.v3.visible', timeout=15000); page.wait_for_timeout(1200)
    check('3D view opens', page.is_visible('#view3d canvas'))
    check('drawing tool switches back to 2D', (page.click('[data-tool=line]') or True) and page.evaluate("__dw.mode") == '2d')
    page.click('[data-tool=select]'); page.click('#view3dBtn'); page.wait_for_timeout(500)
    page.select_option('#camSelect', 'field'); page.wait_for_timeout(600)
    page.screenshot(path=f'{SHOTS}/7-3d-field.png')
    page.click('#btnPlay'); page.wait_for_timeout(800); page.click('#btnPlay')
    check('playback runs in 3D', page.evaluate('__dw.count') > 0)
    page.click('#view2dBtn')

    # tablet width
    page.set_viewport_size({'width': 820, 'height': 1180}); page.wait_for_timeout(200)
    page.screenshot(path=f'{SHOTS}/6-tablet.png', full_page=True)

    # ---- student view on a phone ----
    page.set_viewport_size({'width': 1440, 'height': 860})
    page.click('#btnSample'); page.wait_for_timeout(600)  # autosave the sample for the student page
    phone = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    sp = phone.new_page()
    sp.on('pageerror', lambda e: errors.append('student: ' + str(e)))
    # same origin as the editor, so seed its storage from the editor's saved show
    saved = page.evaluate("localStorage.getItem('drillwriter.show.v1')")
    sp.goto(URL.replace('index.html', 'student.html'))
    sp.evaluate("s => localStorage.setItem('drillwriter.show.v1', s)", saved)
    sp.goto(URL.replace('index.html', 'student.html')); sp.wait_for_selector('#pickList button')
    check('student picker lists every performer', sp.locator('#pickList .ids button').count() == 52)
    sp.fill('#pickSearch', 't4'); check('picker search filters', sp.locator('#pickList .ids button').count() == 1)
    sp.screenshot(path=f'{SHOTS}/s1-pick.png')
    sp.click('#pickList .ids button')
    sp.wait_for_selector('#mainScreen:not([hidden])')
    check('student sees their coordinates', 'yd ln' in sp.inner_text('#cX') and ('Hash' in sp.inner_text('#cY') or 'Side Line' in sp.inner_text('#cY')))
    sp.screenshot(path=f'{SHOTS}/s2-set1.png', full_page=True)
    check('performer view is the default (front at the top)', sp.evaluate("__sv.pov") == 'performer' and sp.is_visible('#povPerf.on'))
    sp.click('#zoomAll'); sp.screenshot(path=f'{SHOTS}/s2b-performer-field.png')
    sp.click('#povDir'); check('can switch to director view', sp.evaluate("__sv.pov") == 'director')
    sp.screenshot(path=f'{SHOTS}/s2c-director-field.png')
    sp.click('#povPerf'); sp.click('#zoomMe')
    check('nearby uses your left/right in performer view', 'Your right (Side 1)' in (sp.click('.tabs button[data-tab=near]') or sp.inner_text('#nearList')))
    sp.click('.tabs button[data-tab=drill]')
    sp.click('#nextSet')
    check('set 2 shows counts and step size', '24 counts' in sp.inner_text('#chips') and 'to 5' in sp.inner_text('#chips'))
    check('set 2 names the marching technique', any(w in sp.inner_text('#chips').lower() for w in ('slide', 'march', 'crab', 'face')))
    sp.screenshot(path=f'{SHOTS}/s3-set2.png')
    sp.click('.tabs button[data-tab=near]')
    check('nearby lists neighbors', sp.locator('#nearList li').count() == 4)
    sp.screenshot(path=f'{SHOTS}/s4-nearby.png', full_page=True)
    sp.click('.tabs button[data-tab=sheet]')
    check('dot sheet has a row per set', sp.locator('#sheetBody tr').count() == 3)
    sp.screenshot(path=f'{SHOTS}/s5-sheet.png', full_page=True)
    sp.click('.tabs button[data-tab=drill]')
    check('remembers the drill ID after reload', (sp.reload() or True) and (sp.wait_for_selector('#mainScreen:not([hidden])') and sp.inner_text('#whoLabel') == 'T4'))
    sp.click('#playBtn'); sp.wait_for_timeout(1200)
    check('student playback runs with big count', sp.evaluate('__sv.count') > 0 and sp.is_visible('#bigCount'))
    sp.screenshot(path=f'{SHOTS}/s6-playing.png')
    sp.click('#playBtn')
    sp.click('#practiceBtn'); check('practice dialog opens', sp.is_visible('#practiceDlg'))
    sp.click('#pGo'); sp.wait_for_timeout(600)
    check('practice starts a count-off', sp.evaluate("document.querySelector('#bigCount').classList.contains('countoff')"))
    sp.click('#playBtn')
    sp.click('#v3d'); sp.wait_for_timeout(2500)
    check('student 3D view opens', sp.is_visible('#view3d canvas'))
    sp.screenshot(path=f'{SHOTS}/s7-3d.png')
    # preview mode from the editor
    pv = phone.new_page(); pv.goto(URL.replace('index.html', 'student.html') + '?preview=1&set=1&id=' + page.evaluate("__dw.show.performers.find(p=>p.label==='G3').id"))
    pv.wait_for_selector('#mainScreen:not([hidden])')
    check('preview opens straight to the chosen student and set', pv.inner_text('#whoLabel') == 'G3' and pv.inner_text('#setName') == '2' and pv.is_visible('#previewBanner'))
    pv.screenshot(path=f'{SHOTS}/s8-preview-guard.png')
    phone.close()

    check('no console errors during run', not errors)
    if errors: print('\n'.join(errors))
    browser.close()

srv.shutdown()
print(f'\n{len(fails)} failure(s)')
sys.exit(1 if fails else 0)
