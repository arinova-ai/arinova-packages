import { ArinovaError, request } from "./http.js";
import { SpaceServiceTokenProvider } from "./space-service-token.js";
import type {
  RequestOptions,
  SpaceLlmGenerateParams,
  SpaceLlmGenerateResponse,
} from "./types.js";

const DEFAULT_GENERATE_TIMEOUT_MS = 40_000;
const utf8 = new TextEncoder();

/** Confidential Managed Space LLM helper. Available from the server entry only. */
export class SpaceLlmApi {
  private readonly tokenProvider: SpaceServiceTokenProvider;

  constructor(
    private readonly apiUrl: string,
    clientId: string,
    clientSecret: string,
  ) {
    this.tokenProvider = new SpaceServiceTokenProvider(apiUrl, clientId, clientSecret, "llm");
  }

  async generate(
    params: SpaceLlmGenerateParams,
    options: RequestOptions = {},
  ): Promise<SpaceLlmGenerateResponse> {
    const body = validateGenerateParams(params);
    const spaceId = params.spaceId.toLowerCase();
    return this.tokenProvider.run(
      spaceId,
      (token) => this.generateWithToken(body, token, options),
    );
  }

  private generateWithToken(
    body: Omit<SpaceLlmGenerateParams, "spaceId">,
    token: string,
    options: RequestOptions,
  ): Promise<SpaceLlmGenerateResponse> {
    return request<SpaceLlmGenerateResponse>(`${this.apiUrl}/api/v1/space-llm/generate`, {
      timeoutMs: DEFAULT_GENERATE_TIMEOUT_MS,
      ...options,
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  }

}

function validateGenerateParams(
  params: SpaceLlmGenerateParams,
): Omit<SpaceLlmGenerateParams, "spaceId"> {
  if (!params || !validUuid(params.spaceId)) {
    throw new ArinovaError("spaceId must be a UUID", 0, "invalid_space_id");
  }
  const inputBytes = typeof params.input === "string" ? utf8.encode(params.input).length : 0;
  if (inputBytes === 0 || inputBytes > 24 * 1_024) {
    throw new ArinovaError("input must contain 1–24576 UTF-8 bytes", 0, "invalid_input");
  }
  if (params.system !== undefined
    && (typeof params.system !== "string" || utf8.encode(params.system).length > 8 * 1_024)) {
    throw new ArinovaError("system must not exceed 8192 UTF-8 bytes", 0, "invalid_system");
  }
  if (!visibleAscii(params.idempotencyKey, 128)) {
    throw new ArinovaError(
      "idempotencyKey must contain 1–128 visible ASCII characters",
      0,
      "invalid_idempotency_key",
    );
  }
  if (params.maxOutputTokens !== undefined
    && (!Number.isInteger(params.maxOutputTokens) || params.maxOutputTokens <= 0)) {
    throw new ArinovaError(
      "maxOutputTokens must be a positive integer",
      0,
      "invalid_max_output_tokens",
    );
  }
  if (params.model !== undefined && (typeof params.model !== "string" || !params.model.trim())) {
    throw new ArinovaError("model must be a non-empty string", 0, "invalid_model");
  }
  if (params.jsonSchema !== undefined) {
    let encoded: Uint8Array;
    try {
      const serialized = JSON.stringify(params.jsonSchema);
      if (serialized === undefined) throw new TypeError("not JSON serializable");
      encoded = utf8.encode(serialized);
    } catch {
      throw new ArinovaError("jsonSchema must be JSON serializable", 0, "invalid_json_schema");
    }
    if (encoded.length > 8 * 1_024) {
      throw new ArinovaError("jsonSchema must not exceed 8192 UTF-8 bytes", 0, "invalid_json_schema");
    }
  }
  return {
    input: params.input,
    idempotencyKey: params.idempotencyKey,
    ...(params.system !== undefined ? { system: params.system } : {}),
    ...(params.jsonSchema !== undefined ? { jsonSchema: params.jsonSchema } : {}),
    ...(params.model !== undefined ? { model: params.model } : {}),
    ...(params.maxOutputTokens !== undefined
      ? { maxOutputTokens: params.maxOutputTokens }
      : {}),
  };
}

function visibleAscii(value: string, maxLength: number): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    && [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e;
    });
}

function validUuid(value: string): boolean {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
