"""Run all ARSpace browser suites against a running server.

Usage:  python3 tests/browser/run_all.py [base_url]
Needs:  pip install playwright && python3 -m playwright install chromium
        a server running (npm run dev  ->  http://localhost:5173/)
fix.py and ag.py use xrmock.js, a scripted stand-in for the WebXR runtime.
They test ARSpace's own logic (states, hit-test handling, anchors, cleanup,
measurement flow). They do NOT prove behaviour on a real phone.
"""
import subprocess, sys, os, re

base = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173/'
here = os.path.dirname(os.path.abspath(__file__))
suites = [('Original ARSpace features', 'test.py'), ('SmartFit', 'sf.py'), ('Fix Position (mocked WebXR)', 'fix.py'), ('AutoGrid + plans + scan (mocked WebXR)', 'ag.py'), ('Routes, deep links, models', 'routes.py')]
failed = False
for label, f in suites:
    out = subprocess.run([sys.executable, os.path.join(here, f), base], capture_output=True, text=True).stdout
    summary = re.findall(r'SUMMARY (\d+) / (\d+)', out)
    fails = [l for l in out.splitlines() if l.startswith('FAIL')]
    print(f'{label}: ' + (f'{summary[-1][0]} / {summary[-1][1]} passed' if summary else 'did not finish'))
    for l in fails:
        print('   ', l)
    if not summary or summary[-1][0] != summary[-1][1]:
        failed = True
sys.exit(1 if failed else 0)
