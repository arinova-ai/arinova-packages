import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function scaffoldSpaceProject(
  projectName: string,
  apiOrigin: string,
  parentDirectory = process.cwd(),
): string {
  if (!projectName.trim()) throw new Error("Space project name cannot be empty.");
  const directory = resolve(parentDirectory, projectName);
  if (existsSync(directory)) {
    throw new Error(`Directory already exists: ${directory}`);
  }
  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(apiOrigin).origin;
  } catch {
    throw new Error(`Invalid API origin: ${apiOrigin}`);
  }
  if (!normalizedOrigin.startsWith("https://")) {
    throw new Error("The scaffold API origin must use https.");
  }

  const displayName = basename(directory);
  const manifest = {
    id: "YOUR_OAUTH_CLIENT_ID",
    version: "1.0.0",
    entry: "index.html",
    name: displayName,
    description: "A managed Arinova Space.",
    assets: ["app.js"],
    declaredApiOrigins: [normalizedOrigin],
    requestedScopes: ["profile"],
  };
  const title = htmlEscape(displayName);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; }
      main { width: min(36rem, calc(100% - 2rem)); }
      button { padding: .65rem 1rem; }
      #status { overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p id="status">Waiting for Arinova authentication…</p>
      <button id="economy" type="button">Request economy access</button>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`;
  const javascript = `const bridgeToken = new URLSearchParams(location.hash.slice(1)).get("bridgeToken");
const status = document.querySelector("#status");

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.data?.bridgeToken !== bridgeToken) return;
  if (event.data?.payload?.protocolVersion !== 1) return;
  if (event.data.type === "arinova:auth") {
    status.textContent = \`Signed in as \${event.data.payload.user.name}\`;
  }
  if (event.data.type === "arinova:scope-denied") {
    status.textContent = \`Permission not granted: \${event.data.payload.reason}\`;
  }
});

document.querySelector("#economy").addEventListener("click", () => {
  window.parent.postMessage({
    type: "arinova:request-scope",
    bridgeToken,
    payload: { protocolVersion: 1, scope: "economy" },
  }, "*");
});
`;

  mkdirSync(directory);
  writeFileSync(resolve(directory, "space.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(directory, "index.html"), html);
  writeFileSync(resolve(directory, "app.js"), javascript);
  return directory;
}
