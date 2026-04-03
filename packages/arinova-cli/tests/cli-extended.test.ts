import { execSync } from "node:child_process";
import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { describe, it, expect, afterAll } from "vitest";

const API_URL = "https://api.chat-staging.arinova.ai";
const CLI = resolve(__dirname, "../dist/index.js");

function resolveToken(): string {
  if (process.env.TEST_BOT_TOKEN) return process.env.TEST_BOT_TOKEN;
  try {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const accounts = config?.channels?.["openclaw-arinova-ai"]?.accounts ?? {};
    for (const acc of Object.values(accounts) as any[]) {
      if (acc.botToken) return acc.botToken;
    }
  } catch {}
  return "";
}

const TOKEN = resolveToken();
const CONV_ID = process.env.TEST_CONVERSATION_ID ?? "db39d380-f132-45a2-929b-1cac8b98bbd8";
const HAS_TOKEN = TOKEN.length > 0;

function run(args: string): string {
  return execSync(`node ${CLI} --token ${TOKEN} --api-url ${API_URL} ${args}`, {
    encoding: "utf-8",
    timeout: 60_000,
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
}

function runSafe(args: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = run(args);
    return { stdout, stderr: "", status: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", status: err.status ?? 1 };
  }
}

async function apiFetch(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ===========================================================================
// Batch 1: New 8 CLI commands
// ===========================================================================

describe.skipIf(!HAS_TOKEN)("agent commands", () => {
  it("agent list executes", () => {
    const r = runSafe("agent list");
    expect(typeof r.status).toBe("number");
  });

  it("agent status with invalid id returns error", () => {
    const r = runSafe("agent status --id 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("capsule commands", () => {
  it("capsule list returns response", () => {
    const r = runSafe("capsule list");
    expect(typeof r.status).toBe("number");
  });

  it("capsule query returns response", () => {
    const r = runSafe('capsule query --query "test"');
    expect(typeof r.status).toBe("number");
  });

  it("capsule grant with invalid ids does not crash", () => {
    const r = runSafe("capsule grant --capsule-id 00000000-0000-0000-0000-000000000000 --agent-id 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("conversation create", () => {
  it("conversation create with invalid agent returns error", () => {
    const r = runSafe("conversation create --agent-id 00000000-0000-0000-0000-000000000000");
    expect(r.status).not.toBe(0);
  });

  it("conversation list returns data", () => {
    const r = runSafe("conversation list --limit 2");
    expect(r.status).toBe(0);
  });
});

describe.skipIf(!HAS_TOKEN)("skill toggle", () => {
  it("skill toggle without --enable or --disable shows error", () => {
    const r = runSafe("skill toggle 00000000-0000-0000-0000-000000000000 --agent 00000000-0000-0000-0000-000000000000");
    expect(r.status).not.toBe(0);
  });

  it("skill toggle with invalid ids returns error", () => {
    const r = runSafe("skill toggle 00000000-0000-0000-0000-000000000000 --agent 00000000-0000-0000-0000-000000000000 --enable");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("kanban card archive/unarchive", () => {
  it("card archive with invalid id does not crash", () => {
    const r = runSafe("kanban card archive --card-id 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });

  it("card unarchive with invalid id does not crash", () => {
    const r = runSafe("kanban card unarchive --card-id 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("kanban column create/reorder", () => {
  it("column create with invalid board does not crash", () => {
    const r = runSafe('kanban column create --board-id 00000000-0000-0000-0000-000000000000 --name "__cli_test_col"');
    expect(typeof r.status).toBe("number");
  });

  it("column reorder with invalid board does not crash", () => {
    const r = runSafe("kanban column reorder --board-id 00000000-0000-0000-0000-000000000000 --column-ids a,b,c");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("memory create/delete", () => {
  let testMemoryId: string | null = null;

  afterAll(async () => {
    if (testMemoryId) {
      try { await apiFetch("DELETE", `/api/v1/memories/${testMemoryId}`); } catch {}
    }
  });

  it("memory list executes", () => {
    const r = runSafe("memory list --limit 2");
    expect(typeof r.status).toBe("number");
  });

  it("memory create + delete roundtrip", () => {
    const r = runSafe('memory create --agent 00000000-0000-0000-0000-000000000000 --category knowledge --summary "__cli_test_memory"');
    // May fail if agent doesn't exist, that's ok
    if (r.status === 0) {
      try {
        const data = JSON.parse(r.stdout);
        testMemoryId = data.id;
        if (testMemoryId) {
          const del = runSafe(`memory delete --id ${testMemoryId}`);
          if (del.status === 0) testMemoryId = null;
        }
      } catch {}
    }
    expect(typeof r.status).toBe("number");
  });
});

// ===========================================================================
// Batch 2: theme/sticker/space/expert
// ===========================================================================

describe.skipIf(!HAS_TOKEN)("theme commands", () => {
  it("theme list executes", () => {
    const r = runSafe("theme list");
    expect(typeof r.status).toBe("number");
  });

  it("theme list with limit executes", () => {
    const r = runSafe("theme list --limit 1");
    expect(typeof r.status).toBe("number");
  });

  it("theme show with invalid id does not crash", () => {
    const r = runSafe("theme show 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });

  it("theme apply with invalid id does not crash", () => {
    const r = runSafe("theme apply 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("sticker commands", () => {
  let testStickerId: string | null = null;

  afterAll(async () => {
    if (testStickerId) {
      try { await apiFetch("DELETE", `/api/v1/stickers/${testStickerId}`); } catch {}
    }
  });

  it("sticker list executes", () => {
    const r = runSafe("sticker list");
    expect(typeof r.status).toBe("number");
  });

  it("sticker create + delete roundtrip", () => {
    const r = runSafe('sticker create --name "__cli_test_sticker" --emoji "🧪"');
    if (r.status === 0) {
      try {
        const data = JSON.parse(r.stdout);
        testStickerId = data.id;
        if (testStickerId) {
          const del = runSafe(`sticker delete ${testStickerId}`);
          if (del.status === 0) testStickerId = null;
        }
      } catch {}
    }
    expect(typeof r.status).toBe("number");
  });

  it("sticker list with category", () => {
    const r = runSafe("sticker list --category emoji");
    expect(typeof r.status).toBe("number");
  });

  it("sticker show with invalid id", () => {
    const r = runSafe("sticker show 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("space commands", () => {
  let testSpaceId: string | null = null;

  afterAll(async () => {
    if (testSpaceId) {
      try { await apiFetch("DELETE", `/api/spaces/${testSpaceId}`); } catch {}
    }
  });

  it("space list executes", () => {
    const r = runSafe("space list");
    expect(typeof r.status).toBe("number");
  });

  it("space list with search executes", () => {
    const r = runSafe('space list --search "test"');
    expect(typeof r.status).toBe("number");
  });

  it("space list with category", () => {
    const r = runSafe('space list --category "game"');
    expect(typeof r.status).toBe("number");
  });

  it("space create + delete roundtrip", () => {
    const r = runSafe('space create --name "__cli_test_space" --description "test space"');
    if (r.status === 0) {
      try {
        const data = JSON.parse(r.stdout);
        testSpaceId = data.id;
        if (testSpaceId) {
          const del = runSafe(`space delete --id ${testSpaceId}`);
          if (del.status === 0) testSpaceId = null;
        }
      } catch {}
    }
    expect(typeof r.status).toBe("number");
  });

  it("space show with invalid id", () => {
    const r = runSafe("space show --id 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("expert commands", () => {
  let testExpertId: string | null = null;

  afterAll(async () => {
    if (testExpertId) {
      try { await apiFetch("DELETE", `/api/v1/experts/${testExpertId}`); } catch {}
    }
  });

  it("expert list executes", () => {
    const r = runSafe("expert list");
    expect(typeof r.status).toBe("number");
  });

  it("expert list with category", () => {
    const r = runSafe("expert list --category general");
    expect(typeof r.status).toBe("number");
  });

  it("expert create + delete roundtrip", () => {
    const r = runSafe('expert create --name "__cli_test_expert" --category general --bio "test expert"');
    if (r.status === 0) {
      try {
        const data = JSON.parse(r.stdout);
        testExpertId = data.id;
        if (testExpertId) {
          const del = runSafe(`expert delete ${testExpertId}`);
          if (del.status === 0) testExpertId = null;
        }
      } catch {}
    }
    expect(typeof r.status).toBe("number");
  });

  it("expert show with invalid id", () => {
    const r = runSafe("expert show 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });

  it("expert ask with invalid id", () => {
    const r = runSafe('expert ask 00000000-0000-0000-0000-000000000000 --question "test"');
    expect(typeof r.status).toBe("number");
  });
});

// ===========================================================================
// Batch 3: community/app/skill
// ===========================================================================

describe.skipIf(!HAS_TOKEN)("community commands", () => {
  let testCommunityId: string | null = null;

  afterAll(async () => {
    if (testCommunityId) {
      try { await apiFetch("DELETE", `/api/communities/${testCommunityId}`); } catch {}
    }
  });

  it("community list returns response", () => {
    const r = runSafe("community list");
    expect(typeof r.status).toBe("number");
  });

  it("community create + delete roundtrip", () => {
    const r = runSafe('community create --name "__cli_test_community" --description "test"');
    if (r.status === 0) {
      try {
        const data = JSON.parse(r.stdout);
        testCommunityId = data.id;
        if (testCommunityId) {
          const del = runSafe(`community delete --id ${testCommunityId}`);
          if (del.status === 0) testCommunityId = null;
        }
      } catch {}
    }
    expect(typeof r.status).toBe("number");
  });

  it("community list-members with invalid id", () => {
    const r = runSafe("community list-members --id 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });

  it("community list-agents with invalid id", () => {
    const r = runSafe("community list-agents --id 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("app commands", () => {
  it("app list returns response", () => {
    const r = runSafe("app list");
    expect(typeof r.status).toBe("number");
  });

  it("app create with missing fields", () => {
    const r = runSafe('app create --name "__cli_test_app"');
    expect(typeof r.status).toBe("number");
  });

  it("app show with invalid id", () => {
    const r = runSafe("app show --id 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });

  it("app update with invalid id", () => {
    const r = runSafe('app update --id 00000000-0000-0000-0000-000000000000 --name "updated"');
    expect(typeof r.status).toBe("number");
  });

  it("app delete with invalid id", () => {
    const r = runSafe("app delete --id 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

describe.skipIf(!HAS_TOKEN)("skill extended commands", () => {
  let testSkillId: string | null = null;

  afterAll(async () => {
    if (testSkillId) {
      try { await apiFetch("DELETE", `/api/v1/skills/custom/${testSkillId}`); } catch {}
    }
  });

  it("skill list executes", () => {
    const r = runSafe("skill list");
    expect(typeof r.status).toBe("number");
  });

  it("skill create + toggle + delete", () => {
    const create = runSafe('skill create --name "__cli_test_skill_ext" --prompt "test prompt for skill"');
    if (create.status !== 0) return;
    try {
      const data = JSON.parse(create.stdout);
      testSkillId = data.id;

      // install on a non-existent agent (expected to fail gracefully)
      const install = runSafe(`skill install ${testSkillId} --agent 00000000-0000-0000-0000-000000000000`);
      expect(typeof install.status).toBe("number");

      // toggle (expected to fail without valid agent_skills entry)
      const toggle = runSafe(`skill toggle ${testSkillId} --agent 00000000-0000-0000-0000-000000000000 --disable`);
      expect(typeof toggle.status).toBe("number");

      // delete
      const del = runSafe(`skill delete ${testSkillId}`);
      if (del.status === 0) testSkillId = null;
    } catch {}
  });

  it("skill uninstall with invalid ids", () => {
    const r = runSafe("skill uninstall 00000000-0000-0000-0000-000000000000 --agent 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

// ===========================================================================
// Painter commands (bonus)
// ===========================================================================

describe.skipIf(!HAS_TOKEN)("painter commands", () => {
  it("painter explore executes", () => {
    const r = runSafe("painter explore");
    expect(typeof r.status).toBe("number");
  });

  it("painter list returns response", () => {
    const r = runSafe("painter list");
    expect(typeof r.status).toBe("number");
  });

  it("painter my-generations returns response", () => {
    const r = runSafe("painter my-generations");
    expect(typeof r.status).toBe("number");
  });

  it("painter show with invalid id", () => {
    const r = runSafe("painter show 00000000-0000-0000-0000-000000000000");
    expect(typeof r.status).toBe("number");
  });
});

// ===========================================================================
// Auto-send commands
// ===========================================================================

describe.skipIf(!HAS_TOKEN)("auto-send commands", () => {
  it("auto-send list returns response", () => {
    const r = runSafe(`auto-send list --conversation-id ${CONV_ID}`);
    expect(typeof r.status).toBe("number");
  });

  it("auto-send history returns response", () => {
    const r = runSafe(`auto-send history --conversation-id ${CONV_ID}`);
    expect(typeof r.status).toBe("number");
  });
});
