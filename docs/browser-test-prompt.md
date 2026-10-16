# Browser test session prompt

Paste the prompt below into a new Claude Code session, unchanged, to run the next
Build mode browser-test ticket (tracker #96). The session picks the ticket itself and
ends with "✅ DONE — you can close this session".

```
Run the next Build mode browser-test ticket.

1. Pick the ticket: run
   gh issue list --label browser-test --state open --json number,title --jq 'sort_by(.number)'
   and take the lowest-numbered issue other than #96 (that one is the parent tracker).
   Tell me which ticket you picked, then read it with gh issue view <n> --comments.
   If none are open except #96, tell me the plan is finished and stop.

2. Follow docs/browser-testing.md exactly. Read it first, then read the latest entries
   and the "Known broken items" table in docs/build-mode-findings.md.

   - This is a test-only session. Don't edit src/.
   - Drive the app with Playwright on the local dev server. You have my go-ahead to
     open the browser, so don't ask.
   - Build everything through the UI. Scripts may only read state.
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

The tickets are numbered in run order (#97 to #122), so the lowest open number is
always the next one. To re-run a ticket after its bugs are fixed, reopen it: it then
becomes the lowest open number and runs next.
