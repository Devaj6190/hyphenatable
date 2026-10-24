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
  const server = serveStubControl(stub, contacts, fake, config.stubPort);
  stopStub = () => server.stop();
  backend = stub;
}

log(
  `started: texts via ${transport.name}${config.spectrum ? "" : " (no SPECTRUM_PROJECT_ID/SECRET in apps/courier/.env)"},`,
  `messages via ${config.convexUrl ? "convex" : "local stub"}, contacts: ${contacts.refs.join(", ") || "none"}`,
);

const relay = new Relay(backend, transport, contacts, config.courierKey);

async function shutdown() {
  log("stopping");
  stopStub();
  await Promise.allSettled([transport.close(), backend.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await relay.run();
