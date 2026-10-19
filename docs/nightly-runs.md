# Nightly test runs

### 2026-10-19 - setup check
- git: OK (HEAD: 9ee31cd, origin: https://github.com/JoeBurd-code/grain-sim)
- npm ci: OK (completed without errors)
- browser install: FAIL (cdn.playwright.dev blocked by network policy, but chromium pre-installed at /opt/pw-browsers)
- app loads in browser: OK (title="grain-sim", served by vite on 5181, SVG count N/A via static HTML)
- gh read: FAIL (GH_TOKEN invalid, token env var exists but auth failed)
- push to main: (pending)

### 2026-10-19 - setup check 2 (Sonnet 5)
- npm ci left the tree clean: OK
- browser via playwright-cli + /tmp/pwcli.json: OK (executablePath=/opt/pw-browsers/chromium; title="grain-sim"; svg count=2; console errors=0, warnings=0; screenshot /tmp/check.png, 82599 bytes)
- ticket page readable by curl: OK (http 200, https://github.com/JoeBurd-code/grain-sim/issues/104)
- model / context window: claude-sonnet-5 (Sonnet 5), max_tokens=1,000,000
- repo clean apart from this file: OK
- push to main: (pending)
