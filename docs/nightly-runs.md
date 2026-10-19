# Nightly test runs

### 2026-10-19 - setup check
- git: OK (HEAD: 9ee31cd, origin: https://github.com/JoeBurd-code/grain-sim)
- npm ci: OK (completed without errors)
- browser install: FAIL (cdn.playwright.dev blocked by network policy, but chromium pre-installed at /opt/pw-browsers)
- app loads in browser: OK (title="grain-sim", served by vite on 5181, SVG count N/A via static HTML)
- gh read: FAIL (GH_TOKEN invalid, token env var exists but auth failed)
- push to main: (pending)
