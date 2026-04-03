import { DmPolicySchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z as _z } from "zod";

// Inline: requireOpenAllowFrom removed from new SDK
function requireOpenAllowFrom(params: { policy?: string; allowFrom?: string[]; ctx: _z.RefinementCtx; path: string[]; message: string }) {
  if (params.policy === "open" && (!params.allowFrom || !params.allowFrom.includes("*"))) {
    params.ctx.addIssue({ code: _z.ZodIssueCode.custom, message: params.message, path: params.path });
  }
}
import { z } from "zod";

export const ArinovaChatAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    apiUrl: z.string().optional(),
    botToken: z.string().optional(),
    email: z.string().optional(),
    password: z.string().optional(),
    sessionToken: z.string().optional(),
    agentId: z.string().uuid().optional(),
    dmPolicy: DmPolicySchema.optional().default("open"),
    allowFrom: z.array(z.string()).optional(),
    textChunkLimit: z.number().int().positive().optional(),
  })
  .strict();

export const ArinovaChatAccountSchema = ArinovaChatAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message:
      'channels.openclaw-arinova-ai.dmPolicy="open" requires channels.openclaw-arinova-ai.allowFrom to include "*"',
  });
});

export const ArinovaChatConfigSchema = ArinovaChatAccountSchemaBase.extend({
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
});
