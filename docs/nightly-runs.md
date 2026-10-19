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

### 2026-10-19
- Tickets: G4 #104 - 10 PASS / 9 FAIL / 0 QUESTION; G5 #105 - 21 PASS / 5 FAIL / 1 QUESTION (blocked by #141)
- Bugs filed / commented:
  - New: #138 Interlocks window has no "armed while" / destination-arming blank (G4). #139 No Build mode UI creates machine rules or feed rate derivations (G4). #140 A rebuilt line's own SAVE output fails its own OPEN validation — duplicate `sim.levelSwitches` entry written when building flexiconPreBinHighTrip (G5). #141 (severe) On a rebuilt line, the metal-bin outload branch (PENDULUM CONVEYOR → GRAIN BREAK) never receives any grain; METAL BIN 1 and METAL BIN 2 are completely unreachable; no grain is lost, it backs up safely (G5). #142 No Build mode UI for "zones", so a rebuilt line never gets golden's TREATING/PACKAGING/OUTLOAD/BAGGING fit-view shortcut buttons; cosmetic only (G5).
  - Commented with confirmed behavioural repros: #138 (forcing the Flexicon pre-bin above its set point while routed to Concetti: golden stays silent, rebuilt incorrectly trips the pendulum and both inlet drum feeders). #139 (golden's preBinFeedSchedule visibly throttles the treating elevator 8.6→8.0 m/min with logged events; rebuilt holds a flat 10.1 m/min with no such events).
- Questions for the owner:
  - Once a Concetti high-high trip escalates to a full-line trip (25 s with no clear), is the intended recovery path only a full RESTART (discarding the run), or should some operator action in the UI (that doesn't exist yet) let the pre-bin drain so the `whenClears` sequence (wait 30 s / start / wait 10 s / open) can fire on its own? (raised on #105)
- Problems with the run itself:
  - Both sub-agents committed while in a detached HEAD state despite being told to work on `main`; the G4 sub-agent's local `main` branch pointer was stale. The coordinator verified each commit was a clean fast-forward from `origin/main` (no discarded history) before moving the branch pointer and pushing. The G5 sub-agent self-corrected onto `main` directly per updated instructions. No data was lost; flagging in case this recurs.
  - Otherwise none: browser, gh (routed through the GitHub MCP tools instead, since GH_TOKEN was still invalid), and both pushes all worked on the first attempt.
- Code changed: none (confirmed by `git diff --name-only origin/main...HEAD` before every push: only docs/build-mode-findings.md, docs/findings-img/*, docs/findings-lines/*, docs/nightly-runs.md were ever touched)
- Where the results are: main (43f61c7 for G4, 3e41222 for G5)
- Next tickets in line: C3 #108, C4 #109, C5 #110, C6 #111, then the B-series (#112-#117), D-series (#118-#120) and E-series (#121-#122)
