/**
 * Better Auth session management for Arinova Chat.
 * Authenticates via email/password and extracts the session cookie.
 */

export type AuthResult = {
  sessionCookie: string;
};

/**
 * Sign in to Arinova Chat using Better Auth email/password flow.
 * Returns the session cookie string for subsequent requests.
 */
export async function authenticateWithArinova(params: {
  apiUrl: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const { apiUrl, email, password } = params;

  const response = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });

  if (!response.ok && response.status !== 302) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Arinova Chat sign-in failed (${response.status}): ${body || "check email/password"}`,
    );
  }

  const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
  const sessionCookie = extractSessionCookie(setCookieHeaders);

  if (!sessionCookie) {
    // Better Auth may return the token in the JSON body instead of cookies
    try {
      const data = (await response.json()) as { token?: string; session?: { token?: string } };
      const token = data.token ?? data.session?.token;
      if (token) {
        return { sessionCookie: `better-auth.session_token=${token}` };
      }
    } catch {
      // ignore parse errors
    }
    throw new Error("Arinova Chat sign-in succeeded but no session cookie was returned");
  }

  return { sessionCookie };
}

/**
 * Validate that a session cookie is still valid.
 */
export async function validateSession(params: {
  apiUrl: string;
  sessionCookie: string;
}): Promise<boolean> {
  const { apiUrl, sessionCookie } = params;

  try {
    const response = await fetch(`${apiUrl}/api/auth/session`, {
      headers: { Cookie: sessionCookie },
    });
    return response.ok;
  } catch {
    return false;
  }
}

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
  const { apiUrl, botToken, a2aEndpoint } = params;

  const body: Record<string, string> = { botToken };
  if (a2aEndpoint) body.a2aEndpoint = a2aEndpoint;

  const response = await fetch(`${apiUrl}/api/agents/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Pairing code exchange failed (${response.status}): ${body || "invalid code"}`,
    );
  }

  return (await response.json()) as { agentId: string; name: string; wsUrl?: string };
}

function extractSessionCookie(setCookieHeaders: string[]): string | undefined {
  for (const header of setCookieHeaders) {
    if (header.includes("better-auth.session_token=")) {
      const match = header.match(/better-auth\.session_token=([^;]+)/);
      if (match) {
        return `better-auth.session_token=${match[1]}`;
      }
    }
  }
  return undefined;
}
