import { ArinovaAgent } from "@arinova-ai/agent-sdk";
import {
  buildAgentOptions,
  buildControlServerOptions,
  createControlServer,
  intEnv,
  listen,
  requiredEnv,
  runtimeDefaults
} from "./runtime.mjs";

const serverUrl = requiredEnv(process.env, "ARINOVA_SERVER_URL").replace(/\/+$/, "");
const botToken = requiredEnv(process.env, "ARINOVA_BOT_TOKEN");
const bind = process.env.ARINOVA_SIDECAR_BIND || runtimeDefaults.bind;
const port = intEnv(process.env, "ARINOVA_SIDECAR_PORT") ?? runtimeDefaults.sidecarPort;
const adapterUrl = (
  process.env.ARINOVA_ADAPTER_URL
  || `http://${runtimeDefaults.bind}:${runtimeDefaults.adapterPort}`
).replace(/\/$/, "");
const sharedToken = requiredEnv(process.env, "ARINOVA_BRIDGE_TOKEN");

if (!serverUrl || !botToken || !sharedToken) {
  console.error("ARINOVA_SERVER_URL, ARINOVA_BOT_TOKEN and ARINOVA_BRIDGE_TOKEN are required");
  process.exit(2);
}

const agentOptions = buildAgentOptions({ serverUrl, botToken });
const agent = new ArinovaAgent(agentOptions);
let shuttingDown = false;
let controlServer;
let clearControlState = () => {};

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    agent.disconnect();
    clearControlState();
  } finally {
    if (controlServer) {
      controlServer.close(() => process.exit(exitCode));
    }
    setTimeout(() => process.exit(exitCode), 2000).unref();
  }
}

agent.on("connected", () => {
  console.log(`connected to ${serverUrl}`);
});

agent.on("disconnected", () => {
  console.log("disconnected");
});

agent.on("error", (error) => {
  console.error(error?.stack || String(error));
});

({ controlServer, clearControlState } = createControlServer({
  agent,
  agentSkills: agentOptions.skills,
  adapterUrl,
  sharedToken,
  ...buildControlServerOptions(),
  onShutdown: () => shutdown(0)
}));

await listen(controlServer, port, bind);
console.log(`control server listening on ${bind}:${port}`);

try {
  await agent.connect();
} catch (error) {
  console.error(error?.stack || String(error));
  shutdown(1);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
