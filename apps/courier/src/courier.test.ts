import { describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import type { Message } from "spectrum-ts";
import { api } from "../../web/convex/_generated/api";
import { Contacts, conversationKey } from "./contacts.ts";
import { FakeTransport } from "./fake.ts";
import { mask } from "./log.ts";
import { toInboundEvent } from "./photon.ts";
import { numberedText } from "./polls.ts";
import { Relay } from "./relay.ts";
import { StubBackend } from "./stub.ts";

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
    expect(m.providerId).toBe(fake.outbox[0]?.providerId as string);
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

  test("a poll vote carries the poll's providerId as pollTarget", async () => {
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
      pollTarget: fake.outbox[0]?.providerId as string,
    });
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
        providerId: fake.outbox[0]?.providerId,
        conversationKey: conversationKey(EMPLOYEE),
      },
    ]);
  });
});
