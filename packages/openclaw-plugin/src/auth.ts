import { normalizeTrustedApiUrl } from "./api-endpoint.js";
import { readBoundedText } from "./http.js";

/**
 * Exchange a bot token for the agent ID.
 * Also registers the A2A endpoint with Arinova so the backend knows
 * where to forward messages.
 */
export async function exchangeBotToken(params: {
  apiUrl: string;
  botToken: string;
  a2aEndpoint?: string;
}): Promise<{ agentId: string; name: string; wsUrl?: string }> {
  const { botToken, a2aEndpoint } = params;
  const apiUrl = normalizeTrustedApiUrl(params.apiUrl);

  const body: Record<string, string> = { botToken };
  if (a2aEndpoint) body.a2aEndpoint = a2aEndpoint;

  const response = await fetch(`${apiUrl}/api/agents/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const responseText = await readBoundedText(response);
  if (!response.ok) {
    throw new Error(
      `Pairing code exchange failed (${response.status}): ${responseText || "invalid code"}`,
    );
  }

  return JSON.parse(responseText) as { agentId: string; name: string; wsUrl?: string };
}
