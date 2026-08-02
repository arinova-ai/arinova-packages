import {
  DmPolicySchema,
  requireAllowlistAllowFrom,
  requireOpenAllowFrom,
} from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";

// Credential-based auth (email/password/sessionToken) was removed in favor of
// botToken-only auth, but existing configs still carry the old keys and the
// schemas are strict — strip them instead of hard-failing channel startup.
const LEGACY_CREDENTIAL_KEYS = ["email", "password", "sessionToken"];

function stripLegacyCredentialKeys(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  for (const key of LEGACY_CREDENTIAL_KEYS) delete record[key];
  return record;
}

export const ArinovaChatAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    apiUrl: z.string().optional(),
    botToken: z.string().optional(),
    agentId: z.string().uuid().optional(),
    dmPolicy: DmPolicySchema.optional().default("open"),
    allowFrom: z.array(z.string()).optional(),
    allowAgentMessagesFrom: z.array(z.string()).optional(),
    textChunkLimit: z.number().int().positive().optional(),
  })
  .strict();

export const ArinovaChatAccountSchema = z.preprocess(
  stripLegacyCredentialKeys,
  ArinovaChatAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.openclaw-arinova-ai.dmPolicy="open" requires channels.openclaw-arinova-ai.allowFrom to include "*"',
  });
  requireAllowlistAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.openclaw-arinova-ai.dmPolicy="allowlist" requires channels.openclaw-arinova-ai.allowFrom to contain at least one sender',
  });
  }),
);

export const ArinovaChatConfigSchema = z.preprocess(
  stripLegacyCredentialKeys,
  ArinovaChatAccountSchemaBase.extend({
    accounts: z.record(z.string(), ArinovaChatAccountSchema.optional()).optional(),
  }).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.openclaw-arinova-ai.dmPolicy="open" requires channels.openclaw-arinova-ai.allowFrom to include "*"',
  });
  requireAllowlistAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.openclaw-arinova-ai.dmPolicy="allowlist" requires channels.openclaw-arinova-ai.allowFrom to contain at least one sender',
  });
  }),
);
