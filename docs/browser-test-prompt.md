# Browser test session prompt

Two prompts: one runs the next Build mode browser-test ticket (tracker #96) in a single
session, the other runs a batch of tickets in parallel. Paste either into a new Claude
Code session, unchanged.

## Keeping a run cheap

The 2026-10-19 batch (G3, C1, C2 run in parallel on Opus) used about 80 % of a 5-hour
usage limit and took 1 h 30 min. Each agent made 120–165 tool calls, and its context
grew to 230–313k tokens. Every call re-sends the whole context, so the cost comes from
the long conversations, not from any one step. The large page snapshots of the scene
are what make the context grow. Both prompts below carry these rules:

- **Use Sonnet.** A test session follows a fixed script, so it doesn't need Opus. For
  the single-session prompt, run `/model sonnet` before pasting. The batch prompt starts
  its agents on Sonnet.
- **Read less at the start.** Read the entry template and the "Known broken items" table
  in `docs/build-mode-findings.md`, plus the one earlier entry the ticket builds on (for
  example G2 for G3). Don't read the whole findings file, which grows with every run.
- **Keep snapshots small.** Snapshot only the panel, popup or element being checked, not
  the whole page. Read numbers with a read-only eval rather than a full snapshot.
- **Run two at a time at most.** Parallel runs finish sooner but cost the same in total,
  so three at once spends the limit three times as fast.

## One ticket

The session picks the ticket itself and ends with "✅ DONE — you can close this session".
Run `/model sonnet` first.

```
Run the next Build mode browser-test ticket.

1. Pick the ticket: run
   gh issue list --label browser-test --state open --json number,title --jq 'sort_by(.number)'
   and take the lowest-numbered issue other than #96 (that one is the parent tracker).
   Tell me which ticket you picked, then read it with gh issue view <n> --comments.
   If none are open except #96, tell me the plan is finished and stop.

2. Follow docs/browser-testing.md exactly. Read it first. In docs/build-mode-findings.md,
   read only the summary table, the "Known broken items" table and the one earlier entry
   this ticket builds on (if any). Don't read the whole file.

   - This is a test-only session. Don't edit src/.
   - Drive the app with Playwright on the local dev server. You have my go-ahead to
     open the browser, so don't ask.
   - Build everything through the UI. Scripts may only read state.
   - Keep context small: snapshot only the panel, popup or element you are checking,
     and read values with a read-only browser_evaluate rather than a full-page snapshot.
   - Mark every check in the ticket PASS, FAIL or QUESTION, and record the evidence
     for each.
   - File each FAIL as a bug, after checking for an existing one.
   - If something blocks a check, log "blocked by #N" and carry on with the rest.

3. Finish: append a detailed findings entry, update the summary table and the known
   broken items, then commit and push to main. Comment the counts on the ticket and
   close it. Tick the ticket's box in #96. Stop the dev server and close the browser.

4. End with a message that starts with "✅ DONE — you can close this session", followed by:
   - the ticket you ran
   - the PASS/FAIL/QUESTION counts
   - the bugs filed or commented on
   - any QUESTIONs I need to answer
   - the next ticket in line
```

## A parallel batch

The session runs as the coordinator, and each ticket runs in its own Sonnet sub-agent,
git worktree, dev server port and browser. The Playwright MCP is a single browser that
all sub-agents would share, so each one drives its own named session through the
Playwright CLI instead (`npx -y @playwright/cli@latest -s=<name> …`). Only the
coordinator pushes, so the three findings entries don't race each other.

```
Run the next two Build mode browser-test tickets in parallel.

1. Pick the tickets: run
   gh issue list --label browser-test --state open --json number,title --jq 'sort_by(.number)'
   and take the two lowest-numbered issues other than #96. Skip a ticket that needs a
   line file a still-open ticket saves (G4 OPENs G3.json, G5 OPENs G4.json) and take the
   next one instead. Tell me which tickets you picked and why.

2. Set up, one per ticket:
   - a git worktree outside OneDrive, e.g. C:\Users\SOMO-CAD\grain-wt\<id>, on branch
     bt-<id> from main, with npm ci run in it
   - a dev server port: 5181, 5182, …, started with npx vite --port <p> --strictPort
   - a Playwright CLI session named <id>. Find its skill doc with the Playwright CLI's
     --help output and pass the path to the sub-agent.

3. Start one sub-agent per ticket with model "sonnet". Give each its worktree, port and
   CLI session name, and tell it to:
   - follow docs/browser-testing.md (skip git pull) and the reading rules in the
     one-ticket prompt above: read only the template, the summary table, the Known
     broken items table and the one earlier entry the ticket builds on
   - drive only its own CLI session, never the Playwright MCP or Claude in Chrome, and
     keep the CLI's .playwright-cli/ output in the scratchpad, not the worktree
   - snapshot only the element being checked, and read values with a read-only eval
   - search for an existing bug again right before filing one, because the other agent
     may have just filed it
   - commit its findings, screenshots and line file on its branch with no Claude
     trailers, and not push, comment on or close its ticket, or edit #96
   - stop its dev server and close its CLI session, then report the commit SHA, the
     counts, the bugs, the QUESTIONs in full, and a 3-line ticket comment

4. As each agent finishes: merge its branch into main (in the findings file keep both
   sides of each conflict, and take the filled-in row in the summary table), push,
   comment the counts on the ticket, close it, and tick its box in #96. Then remove the
   worktree (git worktree prune clears what OneDrive won't let go) and delete the branch.

5. When all are done, check that no bug was filed twice, that no test dev server or CLI
   browser is still running, and that main is clean. End with each ticket's counts, the
   bugs, the QUESTIONs I need to answer, and the next tickets in line.
```

The tickets are numbered in run order (#97 to #122), so the lowest open number is
always the next one. To re-run a ticket after its bugs are fixed, reopen it: it then
becomes the lowest open number and runs next.
