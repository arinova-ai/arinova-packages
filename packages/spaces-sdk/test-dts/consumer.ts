import { Arinova, ArinovaError, type RequestOptions } from "@arinova-ai/spaces-sdk";
import { ArinovaServer, ArinovaError as ServerArinovaError } from "@arinova-ai/spaces-sdk/server";
import packageJson from "@arinova-ai/spaces-sdk/package.json" with { type: "json" };

const options: RequestOptions = { signal: AbortSignal.timeout(100), timeoutMs: 100, retries: 1 };
const browser = new Arinova({ clientId: "app", redirectUri: "https://app.test/callback" });
void browser.user.profile(options);
void browser.agent.chatStream({ agentId: "agent", prompt: "hello" }, options);
void browser.commerce.products(options);
void browser.commerce.inventory(options);
void browser.commerce.consume("coins.small", { quantity: 1, idempotencyKey: "consume-1" }, options);
void browser.commerce.requestPurchase("coins.small");
void browser.wager.requestBuyIn("11111111-1111-4111-8111-111111111111", 500);
void browser.storage.list<{ level: number }>(options);
void browser.storage.set("save", { level: 1 }, options);
const server = new ArinovaServer({ clientId: "app", clientSecret: "secret" });
void server.exchangeCode({ code: "code", redirectUri: "https://app.test/callback", codeVerifier: "verifier" });

const errors: Array<typeof ArinovaError> = [ArinovaError, ServerArinovaError];
void errors;
void packageJson.name;
