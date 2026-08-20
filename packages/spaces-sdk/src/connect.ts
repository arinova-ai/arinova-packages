import { ArinovaError, parseScopes } from "./http.js";
import type {
  AgentInfo,
  ArinovaScope,
  ArinovaSession,
  ArinovaUser,
  SpacePurchaseResult,
  WagerBuyInResult,
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
  private purchaseInFlight: Promise<SpacePurchaseResult> | null = null;
  private wagerInFlight: Promise<WagerBuyInResult> | null = null;

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
    const bridgeToken = this.requireBridgeToken();
    const target = new URL(this.authUrl).origin;
    window.parent.postMessage(
      {
        type: "arinova:request-scope",
        bridgeToken,
        payload: { scope, protocolVersion: 1 },
      },
      target,
    );
    return this.awaitAuth(
      options.timeout ?? 30_000,
      (session) => session.scopes.includes(scope),
      `scope "${scope}" was not granted`,
      scope,
    );
  }

  requestPurchase(
    productKey: string,
    options: { timeout?: number } = {},
  ): Promise<SpacePurchaseResult> {
    if (typeof window === "undefined" || window.self === window.top) {
      return Promise.reject(new ArinovaError(
        "requestPurchase() is only available inside an embedded Space",
        0,
        "embedded_only",
      ));
    }
    if (!validProductKey(productKey)) {
      return Promise.reject(new ArinovaError(
        "productKey must use 1–64 ASCII letters, numbers, dots, underscores, or hyphens and start with a letter or number",
        0,
        "invalid_product_key",
      ));
    }
    if (this.purchaseInFlight) {
      return Promise.reject(new ArinovaError(
        "Another Space purchase request is already pending",
        0,
        "purchase_pending",
      ));
    }

    let bridgeToken: string;
    try {
      bridgeToken = this.requireBridgeToken();
    } catch (error) {
      return Promise.reject(error);
    }
    const timeout = options.timeout ?? 60_000;
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return Promise.reject(new ArinovaError(
        "timeout must be a positive number",
        0,
        "invalid_timeout",
      ));
    }

    const expectedOrigin = new URL(this.authUrl).origin;
    const operation = new Promise<SpacePurchaseResult>((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        action();
      };
      const onMessage = (event: MessageEvent): void => {
        if (event.origin !== expectedOrigin || event.source !== window.parent) return;
        const data = event.data as {
          type?: string;
          bridgeToken?: string;
          payload?: Partial<SpacePurchaseResult>;
        };
        if (!data || data.type !== "arinova:purchase-result") return;
        if (data.bridgeToken !== bridgeToken) return;
        const payload = data.payload;
        if (payload?.protocolVersion !== undefined && payload.protocolVersion !== 1) {
          finish(() => reject(new ArinovaError(
            `Unsupported Space bridge protocol version: ${String(payload.protocolVersion)}`,
            0,
            "protocol_mismatch",
          )));
          return;
        }
        if (!payload || payload.productKey !== productKey) return;
        if (!matchesPurchaseStatus(payload.status)) {
          finish(() => reject(new ArinovaError(
            "Arinova sent an invalid purchase result",
            0,
            "invalid_purchase_result",
          )));
          return;
        }
        finish(() => resolve({
          ...payload,
          productKey,
          status: payload.status,
          protocolVersion: 1,
        } as SpacePurchaseResult));
      };
      const timer = setTimeout(
        () => finish(() => reject(new ArinovaError(
          "Space purchase confirmation timed out",
          0,
          "purchase_timeout",
        ))),
        timeout,
      );
      window.addEventListener("message", onMessage);
      window.parent.postMessage(
        {
          type: "arinova:purchase-request",
          bridgeToken,
          payload: { productKey, protocolVersion: 1 },
        },
        expectedOrigin,
      );
    });
    this.purchaseInFlight = operation;
    void operation.finally(() => {
      if (this.purchaseInFlight === operation) this.purchaseInFlight = null;
    }).catch(() => undefined);
    return operation;
  }

  requestWagerBuyIn(
    sessionId: string,
    amountPoints: number,
    options: { timeout?: number } = {},
  ): Promise<WagerBuyInResult> {
    if (typeof window === "undefined" || window.self === window.top) {
      return Promise.reject(new ArinovaError(
        "requestWagerBuyIn() is only available inside an embedded Space",
        0,
        "embedded_only",
      ));
    }
    if (!validUuid(sessionId)) {
      return Promise.reject(new ArinovaError(
        "sessionId must be a UUID",
        0,
        "invalid_wager_session_id",
      ));
    }
    if (!Number.isSafeInteger(amountPoints) || amountPoints < 1 || amountPoints > 1_000_000) {
      return Promise.reject(new ArinovaError(
        "amountPoints must be an integer from 1 to 1000000",
        0,
        "invalid_wager_amount",
      ));
    }
    if (this.wagerInFlight) {
      return Promise.reject(new ArinovaError(
        "Another wager buy-in request is already pending",
        0,
        "wager_buy_in_pending",
      ));
    }

    let bridgeToken: string;
    try {
      bridgeToken = this.requireBridgeToken();
    } catch (error) {
      return Promise.reject(error);
    }
    const timeout = options.timeout ?? 60_000;
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return Promise.reject(new ArinovaError(
        "timeout must be a positive number",
        0,
        "invalid_timeout",
      ));
    }

    const expectedOrigin = new URL(this.authUrl).origin;
    const operation = new Promise<WagerBuyInResult>((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        action();
      };
      const onMessage = (event: MessageEvent): void => {
        if (event.origin !== expectedOrigin || event.source !== window.parent) return;
        const data = event.data as {
          type?: string;
          bridgeToken?: string;
          payload?: Partial<WagerBuyInResult>;
        };
        if (!data || data.type !== "arinova:wager-buyin-result") return;
        if (data.bridgeToken !== bridgeToken) return;
        const payload = data.payload;
        if (payload?.protocolVersion !== 1) {
          finish(() => reject(new ArinovaError(
            `Unsupported Space bridge protocol version: ${String(payload?.protocolVersion)}`,
            0,
            "protocol_mismatch",
          )));
          return;
        }
        if (!payload || payload.sessionId !== sessionId) return;
        if (!matchesWagerStatus(payload.status)) {
          finish(() => reject(new ArinovaError(
            "Arinova sent an invalid wager buy-in result",
            0,
            "invalid_wager_result",
          )));
          return;
        }
        finish(() => resolve({
          ...payload,
          sessionId,
          status: payload.status,
          protocolVersion: 1,
        } as WagerBuyInResult));
      };
      const timer = setTimeout(
        () => finish(() => reject(new ArinovaError(
          "Wager buy-in confirmation timed out",
          0,
          "wager_buy_in_timeout",
        ))),
        timeout,
      );
      window.addEventListener("message", onMessage);
      window.parent.postMessage(
        {
          type: "arinova:wager-buyin-request",
          bridgeToken,
          payload: { sessionId, amountPoints, protocolVersion: 1 },
        },
        expectedOrigin,
      );
    });
    this.wagerInFlight = operation;
    void operation.finally(() => {
      if (this.wagerInFlight === operation) this.wagerInFlight = null;
    }).catch(() => undefined);
    return operation;
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
    const expectedBridgeToken = this.bridgeToken();
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
          bridgeToken?: string;
          payload?: Record<string, unknown>;
        };
        if (!data) return;
        if (expectedBridgeToken && data.bridgeToken !== expectedBridgeToken) return;
        const protocolVersion = data.payload?.protocolVersion;
        if (protocolVersion !== undefined && protocolVersion !== 1) {
          finish(() => reject(new ArinovaError(
            `Unsupported Space bridge protocol version: ${String(protocolVersion)}`,
            0,
            "protocol_mismatch",
          )));
          return;
        }
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

  private bridgeToken(): string | null {
    if (typeof window === "undefined") return null;
    const hash = typeof window.location?.hash === "string"
      ? window.location.hash
      : "";
    return new URLSearchParams(hash.replace(/^#/, "")).get("bridgeToken");
  }

  private requireBridgeToken(): string {
    const token = this.bridgeToken();
    if (!token) {
      throw new ArinovaError(
        "The managed Space bridge token is missing from the URL fragment",
        0,
        "missing_bridge_token",
      );
    }
    return token;
  }
}

function validProductKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function matchesWagerStatus(value: unknown): value is WagerBuyInResult["status"] {
  return value === "accepted" || value === "cancelled" || value === "error";
}

function matchesPurchaseStatus(
  value: unknown,
): value is SpacePurchaseResult["status"] {
  return value === "purchased" || value === "cancelled" || value === "error";
}
