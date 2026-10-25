import { describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import type { Message } from "spectrum-ts";
import { api } from "../../web/convex/_generated/api";
import { readConfig } from "./config.ts";
import {
  Contacts,
  conversationKey,
  opaqueId,
  redactPhones,
} from "./contacts.ts";
import { FakeTransport } from "./fake.ts";
import { mask } from "./log.ts";
import { toInboundEvent } from "./photon.ts";
import { numberedText } from "./polls.ts";
import { Relay } from "./relay.ts";
import { StubBackend } from "./stub.ts";
import { summaryFromFixtures } from "./summary.ts";

const EMPLOYEE = "+15555550100";
const MANAGER = "+15555550101";
const KEY = "test-key";
const LONG_DIGITS = /\d{7,}/;

function setup() {
  const contacts = new Contacts({
    "contact:a-w11": MANAGER,
    "contact:a-w03": EMPLOYEE,
  });
  const stub = new StubBackend(KEY);
  const fake = new FakeTransport();
  const relay = new Relay(stub, fake, contacts, KEY, 1);
  stub.onPending((rows) => void relay.handlePending(rows));
  return { contacts, stub, fake, relay };
}

const settle = () => Bun.sleep(10);

describe("contacts", () => {
  test("conversationKey is sha256, stable across formats, with no long digit runs", () => {
    expect(conversationKey(EMPLOYEE)).toBe(
      conversationKey("+1 (555) 555-0100"),
    );
    expect(conversationKey(EMPLOYEE)).toStartWith("sha256:");
    for (let i = 0; i < 200; i++)
      expect(
        conversationKey(`+1555555${String(i).padStart(4, "0")}`),
      ).not.toMatch(LONG_DIGITS);
  });

  test("unknown refs and phones are not resolved", () => {
    const contacts = new Contacts({ "contact:a-w03": EMPLOYEE });
    expect(contacts.phoneFor("contact:a-w99")).toBeNull();
    expect(contacts.isRegistered("+15555550199")).toBe(false);
  });

  test("log lines mask phones", () => {
    expect(mask(`sent to ${EMPLOYEE} ok`)).toBe("sent to +1••••0100 ok");
    expect(mask("on 10/24 your 8h entry")).toBe("on 10/24 your 8h entry");
  });
});

describe("outbound", () => {
  test("a pending text is sent once and marked sent with its providerId", async () => {
    const { stub, fake } = setup();
    const m = stub.enqueue({
      contactRef: "contact:a-w11",
      text: "Which job was it? 1 Job 118 2 Job 121",
    });
    await settle();
    stub.enqueue({ contactRef: "contact:a-w03", text: "second" }); // triggers another pending update
    await settle();
    expect(
      fake.outbox.filter((o) => o.text.startsWith("Which job")),
    ).toHaveLength(1);
    expect(fake.outbox[0]?.phone).toBe(MANAGER);
    expect(m.status).toBe("sent");
    expect(m.providerId).toBe(opaqueId(fake.outbox[0]?.providerId as string));
    expect(m.conversationKey).toBe(conversationKey(MANAGER)); // markSent carries it (contract PR #15)
  });

  test("an unregistered contactRef is refused, never sent, and not retried", async () => {
    const { stub, fake } = setup();
    const m = stub.enqueue({ contactRef: "contact:a-w99", text: "hello" });
    await settle();
    stub.enqueue({ contactRef: "contact:a-w03", text: "next" }); // another pending update
    await settle();
    expect(fake.outbox.map((o) => o.text)).toEqual(["next"]);
    expect(m.status).toBe("pending"); // the contract has no failed-send call yet; the courier only logs it
    expect(m.providerId).toBeNull();
  });

  test("one message per conversation at a time: the second waits for the first", async () => {
    const { stub, fake } = setup();
    const a = stub.enqueue({ contactRef: "contact:a-w11", text: "first" });
    const b = stub.enqueue({ contactRef: "contact:a-w11", text: "second" });
    await settle();
    expect(a.status).toBe("sent");
    expect(fake.outbox.map((o) => o.text)).toContain("first");
    expect(b.status).toBe("sent"); // stub releases it once the first is sent; Convex holds it until answered
  });

  test("polls fall back to numbered text without doubling the numbers", () => {
    expect(
      numberedText("Which one is right?", ["7:30-15:30", "12:00-16:00"]),
    ).toBe("Which one is right? 1 7:30-15:30 2 12:00-16:00");
    expect(numberedText("Which job? 1 A 2 B", ["A", "B"])).toBe(
      "Which job? 1 A 2 B",
    );
  });
});

describe("inbound", () => {
  test("a reply is relayed with a conversationKey, never the phone, and deduped", async () => {
    const { stub, fake, relay } = setup();
    const event = fake.inject(MANAGER, { text: "1" });
    await relay.handleInbound(event);
    await relay.handleInbound(event);
    const inbound = stub.messages.filter((m) => m.direction === "in");
    expect(inbound).toHaveLength(1);
    expect(inbound[0]?.conversationKey).toBe(conversationKey(MANAGER));
    const stored = JSON.stringify(stub.messages);
    expect(stored).toContain("sha256");
    expect(stored).not.toMatch(LONG_DIGITS);
  });

  test("STOP passes through unchanged as text", async () => {
    const { stub, fake, relay } = setup();
    await relay.handleInbound(fake.inject(EMPLOYEE, { text: "STOP" }));
    expect(stub.messages[0]).toMatchObject({ text: "STOP", kind: "text" });
  });

  test("a poll vote's pollTarget matches the poll's providerId as Convex holds it", async () => {
    const { stub, fake, relay } = setup();
    stub.enqueue({
      contactRef: "contact:a-w11",
      text: "Which one is right?",
      kind: "poll",
      options: ["Job 118", "Job 121"],
    });
    await settle();
    await relay.handleInbound(fake.inject(MANAGER, { vote: 2 }));
    const vote = stub.messages.find((m) => m.direction === "in");
    expect(vote).toMatchObject({
      kind: "poll_vote",
      text: "Job 121",
      pollTarget: opaqueId(fake.outbox[0]?.providerId as string),
    });
    const poll = stub.messages.find((m) => m.kind === "poll");
    expect(vote?.pollTarget).toBe(poll?.providerId as string);
  });

  test("replies from unregistered phones are dropped", async () => {
    const { stub, fake, relay } = setup();
    await relay.handleInbound(fake.inject("+15555550199", { text: "hi" }));
    expect(stub.messages).toHaveLength(0);
  });
});

describe("photon mapping", () => {
  const base = { id: "p1", sender: { id: MANAGER } };
  const asMessage = (m: object) => m as unknown as Message;

  test("text, poll vote and reaction map to inbound kinds; our own sends are skipped", () => {
    expect(
      toInboundEvent(
        asMessage({ ...base, content: { type: "text", text: "2" } }),
      ),
    ).toMatchObject({ kind: "text", text: "2" });
    expect(
      toInboundEvent(
        asMessage({
          ...base,
          content: {
            type: "poll_option",
            selected: true,
            option: { title: "Job 121" },
            poll: { type: "poll", options: [] },
            pollMessageGuid: "g1",
            title: "",
          },
        }),
      ),
    ).toMatchObject({ kind: "poll_vote", text: "Job 121", pollTarget: "g1" });
    expect(
      toInboundEvent(
        asMessage({
          ...base,
          content: { type: "reaction", emoji: "👍", target: { id: "m9" } },
        }),
      ),
    ).toMatchObject({
      kind: "reaction",
      pollTarget: "m9",
    });
    expect(
      toInboundEvent(
        asMessage({
          ...base,
          direction: "outbound",
          content: { type: "text", text: "x" },
        }),
      ),
    ).toBeNull();
    expect(
      toInboundEvent(asMessage({ ...base, content: { type: "read" } })),
    ).toBeNull();
  });
});

describe("contract (PR #15)", () => {
  test("the courier calls B's binding function names", () => {
    expect(getFunctionName(api.messages.pendingOutbound)).toBe(
      "messages:pendingOutbound",
    );
    expect(getFunctionName(api.messages.markSent)).toBe("messages:markSent");
    expect(getFunctionName(api.messages.inbound)).toBe("messages:inbound");
  });

  test("markSent carries courierKey, messageId, providerId and conversationKey", async () => {
    const { stub, fake } = setup();
    const calls: unknown[] = [];
    const markSent = stub.markSent.bind(stub);
    stub.markSent = async (args) => {
      calls.push(args);
      await markSent(args);
    };
    const m = stub.enqueue({ contactRef: "contact:a-w03", text: "hello" });
    await settle();
    expect(calls).toEqual([
      {
        courierKey: KEY,
        messageId: m.messageId,
        providerId: opaqueId(fake.outbox[0]?.providerId as string),
        conversationKey: conversationKey(EMPLOYEE),
      },
    ]);
  });
});

// Anything phone-like: 7 or more digits, allowing the separators people type between them.
const PHONE_LIKE = /\+?\d[\d\s().-]{5,}\d/g;
const phoneLike = (text: string) =>
  (text.match(PHONE_LIKE) ?? []).filter(
    (m) => m.replace(/\D/g, "").length >= 7,
  );

describe("privacy: no phone number leaves the courier", () => {
  test("nothing sent to Convex carries a phone-like digit run, even when Photon's ids and texts do", async () => {
    const { stub, fake, relay } = setup();
    const sentToConvex: unknown[] = [];
    for (const name of ["markSent", "inbound"] as const) {
      const real = stub[name].bind(stub) as (args: never) => Promise<void>;
      stub[name] = async (args: never) => {
        sentToConvex.push(args);
        await real(args);
      };
    }
    // Photon's outbound id for the poll, and a vote id in the shape H4 saw: poll guid, voter, guid, selected, n.
    const pollGuid = "spc-msg-0cf612d1-3329-42f4-9435-3f4651a24afe";
    const send = fake.send.bind(fake);
    fake.send = async (...args) => ({
      ...(await send(...args)),
      providerId: pollGuid,
    });
    stub.enqueue({
      contactRef: "contact:a-w11",
      text: "Which job? Please tap Job 121.",
      kind: "poll",
      options: ["Job 118", "Job 121", "Not sure"],
    });
    await settle();
    await relay.handleInbound({
      providerId: `${pollGuid}:${MANAGER}:F1C88B4A-A805-4C9D-869D-CC14D00592CA:selected:${MANAGER}`,
      phone: MANAGER,
      text: "Job 118",
      kind: "poll_vote",
      pollTarget: pollGuid,
    });
    await relay.handleInbound(
      fake.inject(EMPLOYEE, {
        text: "call me at (555) 555-0100 or +1 555 555 0101",
      }),
    );

    expect(sentToConvex).toHaveLength(3);
    const wire = JSON.stringify(sentToConvex);
    expect(phoneLike(wire)).toEqual([]);
    for (const phone of [MANAGER, EMPLOYEE])
      expect(wire).not.toContain(phone.slice(-10));
    const vote = stub.messages.find((m) => m.kind === "poll_vote");
    const poll = stub.messages.find((m) => m.kind === "poll");
    expect(vote?.pollTarget).toBe(poll?.providerId as string);
    expect(stub.messages.at(-1)?.text).toBe("call me at [phone] or [phone]");
  });

  test("the check itself catches a raw phone, so the test above can fail", () => {
    expect(
      phoneLike(JSON.stringify({ providerId: `x:${MANAGER}:y` })),
    ).not.toEqual([]);
  });

  test("redactPhones leaves times, dates, hours and job numbers alone", () => {
    for (const text of [
      "4:30pm",
      "7:30-15:30",
      "2026-10-22",
      "10.5h",
      "Job 121",
      "1",
    ])
      expect(redactPhones(text)).toBe(text);
  });
});

describe("manager summary from the fixtures", () => {
  const base = {
    fixturesDir: readConfig({}).fixturesDir,
    companyId: "a",
    contactRef: "contact:a-w11",
  };

  test("Company A's current cycle, greeting the fixture's fake name, queued for the manager phone", async () => {
    const { stub, fake } = setup();
    const { text, cycleId } = summaryFromFixtures({
      ...base,
      managerDisplayName: null,
      dashboardUrl: "https://rollpay.app",
    });
    expect(cycleId).toBe("a-c05");
    expect(text).toBe(
      "Hi Dakota, before we run payroll (Oct 10–23) there are 10 timesheet items to check, mostly duplicate or zero-hour entries.\nDetails here: https://rollpay.app/c/a/manager?as=manager",
    );
    stub.enqueue({ contactRef: "contact:a-w11", text: text as string });
    await settle();
    expect(fake.outbox.at(-1)).toMatchObject({ phone: MANAGER, text });
  });

  test("MANAGER_DISPLAY_NAME wins; no DASHBOARD_URL leaves out the Details here line", () => {
    expect(
      readConfig({ MANAGER_DISPLAY_NAME: " Alex " }).managerDisplayName,
    ).toBe("Alex");
    const { text } = summaryFromFixtures({
      ...base,
      managerDisplayName: "Alex",
      dashboardUrl: null,
    });
    expect(text).toBe(
      "Hi Alex, before we run payroll (Oct 10–23) there are 10 timesheet items to check, mostly duplicate or zero-hour entries.",
    );
  });
});
