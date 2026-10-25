import { PRODUCT_NAME } from "@payrollpilot/engine/messages/brand";
import { loadEnvFile, readConfig } from "./config.ts";
import { Contacts } from "./contacts.ts";
import { createConvexBackend } from "./convex.ts";
import { FakeTransport } from "./fake.ts";
import { log } from "./log.ts";
import { createPhotonTransport } from "./photon.ts";
import { Relay } from "./relay.ts";
import { StubBackend, serveStubControl } from "./stub.ts";
import type { Backend, Transport } from "./types.ts";

loadEnvFile();
const config = readConfig();
const contacts = Contacts.load(config.contactsFile);

const fake = config.spectrum ? null : new FakeTransport();
const transport: Transport = config.spectrum
  ? await createPhotonTransport(
      config.spectrum.projectId,
      config.spectrum.projectSecret,
    )
  : (fake as FakeTransport);

let backend: Backend;
let stopStub = () => {};
if (config.convexUrl) {
  backend = createConvexBackend(config.convexUrl, config.courierKey);
} else {
  const stub = new StubBackend(config.courierKey);
  const server = serveStubControl(stub, contacts, fake, config.stubPort, {
    fixturesDir: config.fixturesDir,
    dashboardUrl: config.dashboardUrl,
    managerDisplayName: config.managerDisplayName,
  });
  stopStub = () => server.stop();
  backend = stub;
}

log(
  `${PRODUCT_NAME} courier started: texts via ${transport.name}${config.spectrum ? "" : " (no SPECTRUM_PROJECT_ID/SECRET in apps/courier/.env)"},`,
  `messages via ${config.convexUrl ? "convex" : "local stub"}, contacts: ${contacts.refs.join(", ") || "none"}`,
);

const relay = new Relay(backend, transport, contacts, config.courierKey);

let stopping = false;
async function shutdown() {
  stopping = true;
  log("stopping");
  stopStub();
  await Promise.allSettled([transport.close(), backend.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// spectrum-ts has no connection events, so a stream that ends or throws is the disconnect signal.
// Exit non-zero so `bun run courier` restarts it; texts that arrive while it is down are lost (H4).
function disconnected(why: string): never {
  log(
    `WARNING: DISCONNECTED from ${transport.name === "photon" ? "Photon" : transport.name} (${why}).`,
    "Texts are NOT being received until it reconnects.",
  );
  process.exit(1);
}
process.on("unhandledRejection", (error) => {
  if (!stopping) disconnected(`unhandled error: ${String(error)}`);
});

log(
  transport.name === "photon"
    ? "connected to Photon, listening for texts"
    : "no Photon credentials: texts print here and replies come from POST /reply",
);
try {
  await relay.run();
  if (!stopping) disconnected("the message stream ended");
} catch (error) {
  if (!stopping) disconnected(String(error));
}
