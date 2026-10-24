# Courier

The only PayrollPilot process that touches phones. It sends what Convex says is pending and relays what arrives; Convex decides everything else (shared-context section 10, ticket C-02).

- **Out:** subscribes to `messages.pendingOutbound({ courierKey })`, sends each row with Photon (`space.send`, or an iMessage poll when `kind` is `"poll"`, falling back to numbered text), then calls `messages.markSent({ courierKey, messageId, providerId })`. A message that has a `providerId` is never sent again.
- **In:** reads `app.messages` (no tunnel, no webhook) and calls `messages.inbound({ courierKey, conversationKey, providerId, text, kind, pollTarget })`. `kind` is `text`, `poll_vote` (with the poll's id as `pollTarget`) or `reaction` (with the reacted message's id). `STOP` goes through unchanged as text; Convex handles it in code.
- **Phones stay here.** `contacts.json` maps each `contactRef` (`owner`, `manager`) to a registered demo phone and is gitignored. Convex only ever sees `conversationKey = "sha256:" + base64url(sha256(E.164 phone))`. Rows for an unknown `contactRef` are refused (`unregistered_contact`); replies from unknown phones are dropped. Every log line masks phones (`+1••••0101`).

## Setup

```bash
cd apps/courier
bun install
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
curl -s -X POST 127.0.0.1:3210/outbound -d '{"contactRef":"manager","text":"[to: manager] Which job was it? 1 Job 118 2 Job 121"}'
# fake phone only: reply with text, or vote on the last poll
curl -s -X POST 127.0.0.1:3210/reply -d '{"contactRef":"manager","vote":2}'
# what Convex would hold
curl -s 127.0.0.1:3210/messages
```

With Photon connected, `/reply` is off: reply from the real phone instead.

## Test

```bash
bun test            # in apps/courier
bun run typecheck
```

## Contract points to confirm with B

- `pendingOutbound` rows need `contactRef` (from `Worker.contactRef`) so the courier can find the phone for a first message; `conversationKey` alone only works for phones that already texted in. The courier accepts either.
- There is no binding function to report a failed send. The courier calls `messages.markFailed({ courierKey, messageId, reason })` if it exists and only logs otherwise.
- Poll votes: `pollTarget` is the poll's `pollMessageGuid`; the courier stores that as the poll's `providerId` when Photon returns it (to confirm in H4).
