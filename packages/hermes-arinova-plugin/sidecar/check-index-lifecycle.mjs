import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const fixture = await mkdtemp(join(tmpdir(), "hermes-index-lifecycle-"));
const sidecarDir = join(fixture, "plugin/sidecar");
await mkdir(join(sidecarDir, "node_modules/@arinova-ai/agent-sdk"), { recursive: true });
await writeFile(join(sidecarDir, "index.mjs"), await readFile(new URL("./index.mjs", import.meta.url)));
await writeFile(join(sidecarDir, "runtime.mjs"), await readFile(new URL("./runtime.mjs", import.meta.url)));
await writeFile(join(fixture, "plugin/sdk-contract.json"), await readFile(new URL("../sdk-contract.json", import.meta.url)));
await writeFile(join(sidecarDir, "node_modules/@arinova-ai/agent-sdk/package.json"), JSON.stringify({ type: "module", exports: "./index.mjs" }));
await writeFile(join(sidecarDir, "node_modules/@arinova-ai/agent-sdk/index.mjs"), `
import { appendFileSync } from "node:fs";
export class ArinovaAgent {
  constructor() { this.listeners = {}; }
  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  onTask(fn) { this.taskHandler = fn; }
  async connect() { if (process.env.STUB_CONNECT_FAIL === "1") throw new Error("stub connect failed"); }
  disconnect() { if (process.env.STUB_MARKER) appendFileSync(process.env.STUB_MARKER, "disconnect\\n"); }
  getAgentId() { return "stub-agent"; }
}
`);

async function run(mode, signal) {
  const marker = join(fixture, `${mode}-${signal || "none"}.log`);
  const child = spawn(process.execPath, [join(sidecarDir, "index.mjs")], {
    env: {
      ...process.env,
      ARINOVA_SERVER_URL: "ws://127.0.0.1:1",
      ARINOVA_BOT_TOKEN: "ari_test",
      ARINOVA_BRIDGE_TOKEN: "bridge-test",
      ARINOVA_SIDECAR_PORT: "0",
      ARINOVA_ADAPTER_URL: "http://127.0.0.1:1",
      STUB_CONNECT_FAIL: mode === "fail" ? "1" : "0",
      STUB_MARKER: marker,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  if (signal) {
    const deadline = Date.now() + 3000;
    while (!stdout.includes("control server listening") && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.match(stdout, /control server listening/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    child.kill(signal);
  }
  const exitCode = await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("index lifecycle timed out")), 5000)),
  ]);
  return { exitCode, stdout, stderr, marker: await readFile(marker, "utf8") };
}

const failed = await run("fail");
assert.equal(failed.exitCode, 1);
assert.match(failed.stderr, /stub connect failed/);
assert.doesNotMatch(failed.stderr, /ReferenceError|before initialization/);
assert.match(failed.marker, /disconnect/);

for (const signal of ["SIGINT", "SIGTERM"]) {
  const stopped = await run("success", signal);
  assert.equal(stopped.exitCode, 0);
  assert.match(stopped.marker, /disconnect/);
}

console.log("sidecar index lifecycle OK");
