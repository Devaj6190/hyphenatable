import { type Message, poll, type Space, UnsupportedError } from "spectrum-ts";

// Numbered-text form of a poll, for lines that can't send iMessage polls (SMS fallback) or if the poll call fails.
export function numberedText(text: string, options: string[] | null): string {
  if (!options?.length || /(^|\s)1\s/.test(text)) return text;
  return `${text} ${options.map((option, i) => `${i + 1} ${option}`).join(" ")}`;
}

// A vote comes back with the poll's message guid, so that is the id Convex must match pollTarget against.
// UNVERIFIED until H4: whether the sent message carries pollMessageGuid or only its id.
export function providerIdOf(sent: Message | undefined): string {
  if (!sent) throw new Error("send returned no message");
  const content = sent.content as { type: string; pollMessageGuid?: string };
  return content.type === "poll" && content.pollMessageGuid
    ? content.pollMessageGuid
    : sent.id;
}

export async function sendPoll(
  space: Space,
  text: string,
  options: string[],
): Promise<{ providerId: string; asPoll: boolean }> {
  try {
    return {
      providerId: providerIdOf(await space.send(poll(text, options))),
      asPoll: true,
    };
  } catch (error) {
    if (!(error instanceof UnsupportedError)) throw error;
    return {
      providerId: providerIdOf(await space.send(numberedText(text, options))),
      asPoll: false,
    };
  }
}
