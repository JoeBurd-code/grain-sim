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

### 2026-10-20
- Tickets: C3 #108 - 15 PASS / 2 FAIL / 0 QUESTION; C4 #109 - 13 PASS / 4 FAIL / 0 QUESTION
- Bugs filed / commented:
  - New: #143 Dragging a bin's set point slider in SIM mode is lost on return to BUILD mode — sync only works Build→SIM, never SIM→Build (C3). #145 A bin fed by a Diverter or Scalping screen gets no suggested high-level interlock at all, because neither's behaviour kind (`router`/`splitter`) defines a `stop` verb that `holdAction()` needs (C4).
  - Commented with confirmed repros: #137 (C3 — reconfirmed a custom Bin's LSH slider still carries the Treater pre-bin's 35-90% range instead of 0-100%). #136 (C4 — reconfirmed no conveyor-running suggestion pattern exists; Drum feeder→Conveyor and Conveyor→Elevator legs got no suggestion).
  - Also: a sub-agent testing C3 accidentally created a throwaway placeholder issue (#144) while finding the right GitHub tool call; it closed that issue itself as not_planned immediately. No lasting effect, noted for transparency.
- Questions for the owner: none this run.
- Problems with the run itself: none. Both sub-agents committed cleanly on `main` on their first attempt (no detached-HEAD issue this time). `gh` CLI auth is still invalid (GH_TOKEN), so all GitHub steps (search/file/comment/close bugs, close tickets, tick #96, post ticket comments) were routed through the GitHub MCP tools instead, which worked throughout with no fallback to docs/nightly-gh-actions.md needed. Both pushes to main succeeded on the first attempt. No code change was ever made or needed reverting.
- Code changed: none (confirmed by `git diff --name-only origin/main...HEAD` before each push: only docs/build-mode-findings.md, docs/findings-img/*, docs/findings-lines/* were touched)
- Where the results are: main (346a1a0 for C3, 67855f7 for C4)
- Next tickets in line: C5 #110, C6 #111, then the B-series (#112-#117), D-series (#118-#120) and E-series (#121-#122)

### 2026-10-21
- Tickets: C5 #110 - 6 PASS / 2 FAIL / 0 QUESTION; C6 #111 - 7 PASS / 3 FAIL / 1 QUESTION
- Bugs filed / commented:
  - New: #146 A broken or incomplete interlock (its watched machine deleted, or a blank new interlock) is correctly flagged in the PROBLEMS list but never blocks RUN and is skipped with no warning anywhere — UI, event log or console (C5, covers both the delete-a-watched-bin check and the leave-it-blank check, one root cause).
  - Commented with confirmed repros: #139 (C6 — built the golden pre-bin-feed-schedule topology by hand on a NEW LINE; the Interlocks window's "+ ADD" form has no rule-kind selector or graded-band fields, and the Batch treater's BUILD panel has no hold-next-batch option, so neither golden rule type can be created from scratch, not just on the rebuilt golden line). #143 (C6 — the same SIM→BUILD one-way slider-sync gap also loses a machine-rule's own LSH set point, not just an interlock's).
- Questions for the owner:
  - Should `preBinFeedSchedule`'s graded boost/normal/throttle bands and `afterBinHoldTreater`'s "block new batches" behaviour become expressible as Interlocks-window sentences (a throttle-style THEN step; a distinct "block new batches" action), or stay a separate rule type Build mode never lets a user create? (raised on #111/C6)
- Problems with the run itself: none. Both sub-agents committed cleanly on `main` on the first attempt. `gh` CLI auth is still invalid (GH_TOKEN), so all GitHub steps (search/file/comment/close bugs, close tickets, tick #96, post ticket comments) were routed through the GitHub MCP tools instead, which worked throughout with no fallback to docs/nightly-gh-actions.md needed (the file was never created). Both pushes to main succeeded on the first attempt. No code change was ever made or needed reverting; both hard-rule checks (`git status --porcelain` / `git diff --name-only origin/main...HEAD`) showed only the allowed docs paths before each push.
- Code changed: none (confirmed by `git diff --name-only origin/main...HEAD` before each push: only docs/build-mode-findings.md, docs/findings-img/*, docs/findings-lines/* were touched)
- Where the results are: main (f861ecd for C5, 2947b47 for C6)
- Next tickets in line: B1 #112, B2 #113, then the rest of the B-series (#114-#117), D-series (#118-#120) and E-series (#121-#122)
