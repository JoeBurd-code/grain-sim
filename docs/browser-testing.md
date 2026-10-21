# Browser test sessions (Build mode)

How to run one `browser-test` ticket. Each ticket is one combo, done in one fresh
session. The ticket says what to build and what to expect; this file says how every
session works. The parent tracking issue holds the full matrix.

These sessions are the user's standing go-ahead to drive a browser, so the CLAUDE.md
"ask before opening a browser" rule is already satisfied for them.

## 1. Set up

1. Read the ticket. In `docs/build-mode-findings.md`, read only the summary table, the
   "Known broken items" table and the one earlier entry the ticket builds on, if any
   (for example G2 for G3). The tables list the bugs already filed and the items known
   to be broken. Don't read the whole file: it grows with every run, and reading it
   all makes every session cost more.
2. `git pull`, then record the SHA from `git rev-parse --short HEAD`.
3. Run `npm run dev` in the background and note the port (normally 5173).
4. Use **Playwright** (`mcp__playwright__*`) as the driver. In a parallel batch, each
   sub-agent drives its own named Playwright CLI session instead, because the MCP is one
   shared browser (see `docs/browser-test-prompt.md`). Fall back to Claude in Chrome
   only for a gesture Playwright can't do, and say so in the findings.
5. Start from a clean browser: navigate to the app, run
   `localStorage.clear()` once with `browser_evaluate`, then reload. Skip this only
   when the ticket says to OPEN a saved line.

## 2. Rules while testing

- **Build only through the UI.** Use clicks, drags, typing and the app's own buttons
  (NEW LINE, OPEN, SAVE, START OVER, the catalogue, the Interlocks window and the
  right panel). Never make or change a line, a machine or the sim with a script.
- **Reading state is allowed, as evidence only.** You may use DOM snapshots
  (`browser_snapshot`), screenshots, console messages, a file downloaded by SAVE, and
  a read-only `browser_evaluate` such as reading localStorage. Check the console for
  errors after every major step.
- **Keep snapshots small.** Snapshot only the panel, popup or element being checked,
  and read numbers with a read-only evaluate rather than a full-page snapshot. Full
  snapshots of the scene are large, and they pile up in the session's context, which
  is what makes a run expensive.
- **Test only, never fix.** Don't edit `src/` in a test session. A failure gets
  logged and filed (section 4) and the session carries on.
- **Bugs don't block.** If an item or feature the combo needs is broken, log
  "blocked by #N", work around it where you can (a custom item in place of a real
  one, say), and test everything else.
- **Pass criteria are fixed in the ticket.** Judge each check against the ticket's
  expected results, not against what the app happens to do.

### What counts as PASS / FAIL / QUESTION

- **PASS**: the expected result happened.
- **FAIL**: any of these:
  - the expected result did not happen
  - grain is silently lost or created (the totals don't balance)
  - the sim freezes or stops stepping
  - a console error appears
  - the UI does something with no explanation (a button with no effect, a missing
    control, a popup with no values)
- **QUESTION**: the app did something defensible, but the right behaviour is the
  user's call. For example, should bin-into-bin be allowed? Log it, don't file a bug.

For unusual wiring, a pass means **either** the line runs and conserves grain, **or**
the Build mode problems list explains why it can't run.

### Checking grain conservation

Run long enough for flow to settle (normally 2 to 5 sim minutes at 5×). Then compare
grain in against grain out, plus what each machine holds, as far as the popups and
charts show. Note the figures in the findings, and say how you read them.

## 3. Findings entry

Append the entry to `docs/build-mode-findings.md` under the combo's own heading.
Create the heading if it's the first run; a re-run adds a new dated entry under the
same heading. Use this template:

```markdown
### <combo id> — <date> — <sha>

**Result:** <n> PASS · <n> FAIL · <n> QUESTION · blocked by: <#N, … or none>
**Tool:** Playwright (+ Chrome for …, if used)

**Steps**
1. …

**Checks**
| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|

**Bugs filed / commented**
- #N <title> (new | existing, commented)

**Questions for the user**
- …

**Observations**
Anything odd that isn't a failure: slow UI, confusing wording, layout glitches.

**Follow-up combo ideas**
- …
```

Then update the summary table at the top of the findings file: one row per combo,
showing the latest run. Add each QUESTION as a new row in "Open questions for the
owner" too (next free Q number, the combo id under From, Answer left blank).

Save screenshots to `docs/findings-img/<combo-id>-<n>.png` and link them from the
entry. Save any line that SAVE downloads to `docs/findings-lines/<combo-id>.json`
(the golden rebuild passes these between sessions).

## 4. Filing bugs

1. Search first:
   `gh issue list --label bug --state open --search "<key words>"`.
   If the bug is already filed, comment on it with this combo's repro and SHA rather
   than filing it again.
2. Otherwise file it with labels `bug` and `needs-triage`. The issue body holds:
   - **Found in:** the combo ticket (#N), with the SHA.
   - **Repro:** numbered UI steps starting from a clean browser.
   - **Expected / Actual**, with a screenshot link and any console error text.
   - **Acceptance:** "Re-run combo <id> and check <#> passes."

## 5. End the session

1. Stop the dev server and close the browser.
2. Commit the findings, screenshots and line files, then push to `main`. Don't add
   Claude trailers to the commit.
3. Comment on the combo ticket with the PASS/FAIL/QUESTION counts, the bugs filed,
   and a link to the findings entry.
4. Close the combo ticket, even when checks failed: the bugs carry the follow-up.
   A re-run after a fix reopens it, adds a new dated entry, then closes it again.
