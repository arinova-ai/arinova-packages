import { ArinovaError, parseScopes } from "./http.js";
import type {
  AgentInfo,
  ArinovaScope,
  ArinovaSession,
  ArinovaUser,
} from "./types.js";

type AuthPayload = {
  user?: ArinovaUser;
  accessToken?: string;
  agents?: AgentInfo[];
  scope?: string;
  expiresAt?: number;
  spaceId?: string;
};

/** Origin-validated authentication channel for embedded Spaces. */
export class EmbeddedConnector {
  constructor(
    private readonly authUrl: string,
    private readonly setSession: (session: ArinovaSession) => void,
  ) {}

  connect(timeout = 5_000): Promise<ArinovaSession> {
    return this.awaitAuth(timeout);
  }

  requestScope(
    scope: ArinovaScope,
    options: { timeout?: number } = {},
  ): Promise<ArinovaSession> {
    if (typeof window === "undefined" || window.self === window.top) {
      return Promise.reject(new ArinovaError(
        "requestScope() is only available inside an embedded Space",
        0,
        "embedded_only",
      ));
    }
    const target = new URL(this.authUrl).origin;
    window.parent.postMessage(
      { type: "arinova:request-scope", payload: { scope } },
      target,
    );
    return this.awaitAuth(
      options.timeout ?? 30_000,
      (session) => session.scopes.includes(scope),
      `scope "${scope}" was not granted`,
      scope,
    );
  }

  private awaitAuth(
    timeout: number,
    accept?: (session: ArinovaSession) => boolean,
    timeoutMessage = "connect timeout — this origin may not be authorized to receive Arinova auth",
    deniedScope?: string,
  ): Promise<ArinovaSession> {
    if (typeof window === "undefined") {
      return Promise.reject(new ArinovaError(
        "Iframe authentication requires a browser window",
        0,
        "browser_required",
      ));
    }
    const expectedOrigin = new URL(this.authUrl).origin;
    return new Promise<ArinovaSession>((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        action();
      };
      const timer = setTimeout(
        () => finish(() => reject(new ArinovaError(timeoutMessage, 0, "auth_timeout"))),
        timeout,
      );
      const onMessage = (event: MessageEvent): void => {
        if (event.origin !== expectedOrigin || event.source !== window.parent) return;
        const data = event.data as {
          type?: string;
          payload?: Record<string, unknown>;
        };
        if (!data) return;
        if (data.type === "arinova:scope-denied") {
          const denied = (data.payload ?? {}) as { scope?: string; reason?: string };
          if (!accept || !denied.scope || denied.scope === deniedScope) {
            finish(() => reject(new ArinovaError(
              denied.reason ?? `scope "${denied.scope ?? "requested"}" was denied`,
              0,
              "scope_denied",
            )));
          }
          return;
        }
        if (data.type !== "arinova:auth") return;

        const payload = (data.payload ?? {}) as AuthPayload;
        if (!payload.accessToken) {
          finish(() => reject(new ArinovaError(
            "Arinova did not issue an access token",
            0,
            "missing_access_token",
          )));
          return;
        }
        if (!payload.user || typeof payload.user !== "object" || typeof payload.user.id !== "string") {
          finish(() => reject(new ArinovaError(
            "Arinova sent an invalid user payload",
            0,
            "invalid_auth_payload",
          )));
          return;
        }
        if (typeof payload.expiresAt !== "number" || !Number.isFinite(payload.expiresAt)) {
          finish(() => reject(new ArinovaError(
            "Arinova sent no valid token expiry",
            0,
            "invalid_auth_payload",
          )));
          return;
        }

        const session: ArinovaSession = {
          user: payload.user,
          accessToken: payload.accessToken,
          tokenType: "Bearer",
          expiresAt: payload.expiresAt,
          scopes: parseScopes(payload.scope),
          agents: payload.agents ?? [],
          spaceId: payload.spaceId,
        };
        this.setSession(session);
        if (accept && !accept(session)) return;
        finish(() => resolve(session));
      };
      window.addEventListener("message", onMessage);
    });
  }
}
