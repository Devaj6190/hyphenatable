# Courier

The only Rollpay process that touches phones. It sends what Convex says is pending and relays what arrives; Convex decides everything else (shared-context section 10, ticket C-02).

- **Out:** subscribes to `messages.pendingOutbound({ courierKey })`, sends each row with Photon (`space.send`, or an iMessage poll when `kind` is `"poll"`, falling back to numbered text), then calls `messages.markSent({ courierKey, messageId, providerId, conversationKey })`. A message that has a `providerId` is never sent again.
- **In:** reads `app.messages` (no tunnel, no webhook) and calls `messages.inbound({ courierKey, conversationKey, providerId, text, kind, pollTarget })`. `kind` is `text`, `poll_vote` (with the poll's id as `pollTarget`) or `reaction` (with the reacted message's id). `STOP` goes through unchanged as text; Convex handles it in code.
- **Ids are opaque.** Every provider id sent to Convex or written to the log is `sha256:` + base64url(sha256(id)), because a Photon poll vote's id embeds the voter's phone (found in H4). It is deterministic, so a vote's `pollTarget` still equals its poll's `providerId`. Phone numbers typed into a reply are replaced with `[phone]`.
- **Phones stay here.** `contacts.json` maps each `Worker.contactRef` to a registered demo phone: for Company A, `contact:a-w11` (the crew manager) and `contact:a-w03` (the field employee in the planted overlap). The owner works in the dashboard and is never texted and is gitignored. Convex only ever sees `conversationKey = "sha256:" + base64url(sha256(E.164 phone))`. Rows for an unknown `contactRef` are refused (`unregistered_contact`); replies from unknown phones are dropped. Every log line masks phones (`+1••••0101`).

## Setup

```bash
bun install                             # from the repo root; the courier is a workspace
cd apps/courier
cp .env.example .env                    # Photon project id and secret, COURIER_KEY, CONVEX_URL
cp contacts.example.json contacts.json  # the registered demo phones, E.164
```

Both phones must be registered as users of the Photon project (Dashboard → Users) or sends fail with "Target not allowed for this project".

## Run

```bash
bun run apps/courier/src/index.ts       # from the repo root (or `bun start` in apps/courier)
```

What it talks to depends on `.env`:

| Set in `.env` | Texts go through | Messages come from |
|---|---|---|
| nothing | fake phone printed in the terminal | local stub |
| `SPECTRUM_PROJECT_ID` + `SECRET` | Photon (real phone) | local stub |
| also `CONVEX_URL` + `COURIER_KEY` | Photon | Convex dev deployment |

### Local stub (until B-02 is deployed)

Same function names and argument shapes as the Convex side, in memory, with a localhost control port (`STUB_PORT`, default 3210):

```bash
# queue a text (or "kind":"poll" with "options")
curl -s -X POST 127.0.0.1:3210/outbound -d '{"contactRef":"contact:a-w03","text":"Which job was it? 1 Job 118 2 Job 121"}'
# fake phone only: reply with text, or vote on the last poll
curl -s -X POST 127.0.0.1:3210/reply -d '{"contactRef":"contact:a-w03","vote":2}'
# what Convex would hold
curl -s 127.0.0.1:3210/messages
```

With Photon connected, `/reply` is off: reply from the real phone instead.

The manager's summary text, built from `data/fixtures/<company>/flags.json` for the current cycle. Wording and issue phrases are at the top of `packages/engine/src/messages/templates.ts`; the greeting uses `MANAGER_DISPLAY_NAME` (else the fixture's fake name) and the link uses `DASHBOARD_URL` (unset: the "Details here" line is left out):

```bash
# see the text without sending it
curl -s -X POST 127.0.0.1:3210/summary -d '{"dryRun":true}'
# queue it for the manager phone (contact:a-w11 by default; companyId "a", current cycle)
curl -s -X POST 127.0.0.1:3210/summary -d '{}'
```

## Running the courier for the demo

**Start it before any text is sent or expected.** Photon only streams messages that arrive while the courier is connected; a text sent while it is down is lost (found in H4).

```bash
bun run courier        # from the repo root
```

- This runs `apps/courier/scripts/demo.sh`: it keeps the Mac awake while the courier runs (`caffeinate -i`, macOS only) and restarts the courier 3 s after it drops.
- **Connected:** wait for `connected to Photon, listening for texts`. If it says `no Photon credentials` instead, `apps/courier/.env` is missing `SPECTRUM_PROJECT_ID` / `SPECTRUM_PROJECT_SECRET`.
- **Disconnected:** if Photon's message stream ends or errors, it prints `WARNING: DISCONNECTED from Photon (...)`; the launcher restarts it and you should see the connected line again within a few seconds. spectrum-ts has no connection events, so a network drop that leaves the stream silently open is not detected. That is why the checklist below sends a real test text.
- **Check it is working:** a text from a registered phone shows `relayed inbound sha256:… (text)` within a few seconds. In stub mode, `curl -s 127.0.0.1:3210/messages` lists what arrived.
- **Stop:** Ctrl+C in its terminal (prints `stopping`), or `pkill -f apps/courier/src/index.ts` from another terminal. Both are clean stops, so the launcher exits instead of restarting.

**30-second pre-demo checklist**

1. Mac plugged in, lid open. `caffeinate -i` stops idle sleep, not lid-closed sleep on battery.
2. Wi-Fi on and working: open any web page.
3. `bun run courier`, then wait for `connected to Photon, listening for texts`.
4. From the demo phone, text "test" to the project's Photon number (each Photon user has their own number; use the one this project sends from).
5. Confirm `relayed inbound … (text)` appears within a few seconds. If it doesn't, Ctrl+C, run `bun run courier` again, and repeat step 4 before going on.

## Test

```bash
bun test            # in apps/courier
bun run typecheck
```

## Contract (B's `apps/web/convex/messaging/contract.ts`, PR #15)

- `pendingOutbound` rows always carry `contactRef`; the courier finds the phone from it.
- `markSent({ courierKey, messageId, providerId, conversationKey })`: the courier adds `conversationKey` because only it knows sha256(phone), and Convex needs it to tie the reply to the question.
- STOP arrives as `kind: "text"`; Convex decides it is a stop in code.
- Not in the contract yet: reporting a failed send (asked of B as a follow-up PR). Until then an unregistered contact or a Photon refusal is logged, never retried, and the message stays pending in Convex.
- Types (`OutboundItem`, `MarkSentArgs`, `InboundArgs`) and function references come straight from `apps/web/convex/messaging/contract.ts` and `apps/web/convex/_generated/api`; the courier has no copies of its own.
- Poll votes: `pollTarget` is the poll's `pollMessageGuid`; the courier stores that as the poll's `providerId` when Photon returns it (to confirm in H4).
