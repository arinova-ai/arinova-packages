# Hermes Arinova Plugin

Hermes gateway platform plugin for connecting Hermes Agent to Arinova Chat.

The plugin does not patch Hermes source. It registers a `arinova` gateway
platform through `ctx.register_platform()` and runs a small Node sidecar that
uses `@arinova-ai/agent-sdk`.

The sidecar requires Node.js 22 or newer.

## Install

From a Git repository:

```bash
hermes plugins install <owner>/hermes-arinova-plugin --enable
cd ~/.hermes/plugins/hermes-arinova-plugin/sidecar
npm install
hermes gateway restart
```

For local development from this checkout:

```bash
mkdir -p ~/.hermes/plugins
ln -sfn /Users/ripple/.arinova-bridge/workspace/projects/hermes-arinova-plugin ~/.hermes/plugins/hermes-arinova-plugin
hermes plugins enable hermes-arinova-plugin
cd ~/.hermes/plugins/hermes-arinova-plugin/sidecar
npm install
hermes gateway restart
```

## Configuration

Required environment variables:

```bash
ARINOVA_SERVER_URL=wss://chat.arinova.ai
ARINOVA_BOT_TOKEN=ari_...
```

Optional:

```bash
ARINOVA_ALLOW_ALL_USERS=true
ARINOVA_ALLOWED_USERS=user_1,user_2
ARINOVA_ALLOW_BOTS=none
ARINOVA_HOME_CONVERSATION=conversation-id
ARINOVA_HOME_CONVERSATION_NAME=Arinova Chat
ARINOVA_NODE_BIN=node
ARINOVA_AGENT_SDK_ROOT=~/.arinova-bridge/workspace/projects/arinova-packages/packages/agent-sdk
ARINOVA_SIDECAR_PORT=8793
ARINOVA_ADAPTER_PORT=8794
ARINOVA_SIDECAR_BIND=127.0.0.1
ARINOVA_ADAPTER_BIND=127.0.0.1
ARINOVA_SIDECAR_AUTOSTART=true
ARINOVA_AGENT_SKILLS_JSON='[{"id":"memo","name":"Memo","description":"Read and write Arinova memos"}]'
ARINOVA_AGENT_SKILLS='[{"id":"memo","name":"Memo","description":"Read and write Arinova memos"}]'
ARINOVA_CONCURRENCY_MODE=agent-wide
ARINOVA_AGENT_CONCURRENCY_MODE=agent-wide
ARINOVA_RECONNECT_INTERVAL_MS=5000
ARINOVA_PING_INTERVAL_MS=30000
ARINOVA_PING_TIMEOUT_MS=60000
ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION=2
ARINOVA_CONNECT_TIMEOUT_MS=30000
ARINOVA_ADAPTER_POST_TIMEOUT_MS=10000
ARINOVA_CONTROL_MAX_BODY_BYTES=8388608
ARINOVA_SIDECAR_POST_TIMEOUT_MS=10000
ARINOVA_DOWNLOAD_ATTACHMENTS=true
ARINOVA_ATTACHMENT_MAX_BYTES=52428800
ARINOVA_ATTACHMENT_MAX_COUNT=8
ARINOVA_ATTACHMENT_TOTAL_MAX_BYTES=67108864
ARINOVA_ATTACHMENT_TOTAL_TIMEOUT_MS=30000
ARINOVA_ALLOW_LOCAL_UPLOADS=false
ARINOVA_UPLOAD_ROOT=/absolute/path/to/approved/workspace
ARINOVA_UPLOAD_MAX_BYTES=26214400
```

Local-path tool uploads are disabled by default. Enabling them requires both
`ARINOVA_ALLOW_LOCAL_UPLOADS=true` and an explicit `ARINOVA_UPLOAD_ROOT`;
paths must be relative to that root. Base64 uploads use the same byte limit.

You can put these in `~/.hermes/.env` if your Hermes install loads that file.
Configured SDK skills must use unique non-empty `id` values and non-empty
`name` values; the sidecar uses each `id` as the slash-command slug.
When neither concurrency environment or YAML key is set, the plugin preserves
the SDK default `per-conversation`; set either concurrency key to `agent-wide`
or `unbounded` to override.
The same settings can also be configured through Hermes `config.yaml`:

```yaml
arinova:
  enabled: true
  server_url: wss://chat.arinova.ai
  token: ari_...
  bot_token: ari_... # alternate spelling for token
  allowed_users: [user_1, user_2]
  allow_all_users: false
  allow_bots: none
  sidecar_port: 8793
  adapter_port: 8794
  sidecar_bind: 127.0.0.1
  adapter_bind: 127.0.0.1
  sidecar_autostart: true
  node_bin: node
  agent_sdk_root: ~/.arinova-bridge/workspace/projects/arinova-packages/packages/agent-sdk
  home_conversation:
    chat_id: conversation-id
    name: Arinova Chat
  home_channel: # alternate spelling for home_conversation
    chat_id: conversation-id
    name: Arinova Chat
  agent_skills:
    - id: memo
      name: Memo
      description: Read and write Arinova memos
    - id: chat
      name: Chat
      description: Chat handoff helper
  concurrency_mode: agent-wide
  agent_concurrency_mode: agent-wide
  reconnect_interval_ms: 5000
  ping_interval_ms: 30000
  ping_timeout_ms: 60000
  max_consecutive_per_conversation: 2
  connect_timeout_ms: 30000
  adapter_post_timeout_ms: 10000
  control_max_body_bytes: 8388608
  sidecar_post_timeout_ms: 10000
  download_attachments: true
  attachment_max_bytes: 52428800
  attachment_max_count: 8
  attachment_total_max_bytes: 67108864
  attachment_total_timeout_ms: 30000
```

`control_max_body_bytes` defaults to 8 MiB and is always enforced by both the
sidecar and adapter callback servers. Larger limits are an explicit opt-in for
deployments with unusually large task payloads.

## Architecture

```text
Arinova Chat
  <-> @arinova-ai/agent-sdk websocket
  <-> sidecar/index.mjs
  <-> loopback HTTP
  <-> adapter.py
  <-> Hermes GatewayRunner
```

## Hermes tools

The plugin registers the generic SDK bridge tools plus method-specific aliases
for every supported `agent-sdk` method:

- `arinova_sdk_call`
- `arinova_task_call`
- `arinova_get_agent_id`
- `arinova_get_onboarding_seed`
- `arinova_send_message`
- `arinova_send_telemetry`
- `arinova_send_hud`
- `arinova_send_task_update`
- `arinova_report_tool_call`
- Action execution is exposed only through task-scoped `arinova_task_call_action`
  and `arinova_task_call`, so task, conversation, and message attribution comes
  from the active task rather than model-supplied identifiers.
- `arinova_upload_file`
- `arinova_list_notes`
- `arinova_create_note`
- `arinova_update_note`
- `arinova_delete_note`
- `arinova_list_boards`
- `arinova_create_card`
- `arinova_update_card`
- `arinova_create_board`
- `arinova_update_board`
- `arinova_archive_board`
- `arinova_list_columns`
- `arinova_create_column`
- `arinova_update_column`
- `arinova_delete_column`
- `arinova_reorder_columns`
- `arinova_list_cards`
- `arinova_complete_card`
- `arinova_list_archived_cards`
- `arinova_add_card_commit`
- `arinova_list_card_commits`
- `arinova_link_card_note`
- `arinova_unlink_card_note`
- `arinova_list_card_notes`
- `arinova_list_labels`
- `arinova_create_label`
- `arinova_update_label`
- `arinova_delete_label`
- `arinova_add_card_label`
- `arinova_remove_card_label`
- `arinova_query_memory`
- `arinova_fetch_skill_prompt`
- `arinova_task_upload_file`
- `arinova_task_fetch_history`
- `arinova_task_call_action`

Initial scope:

- text tasks from Arinova Chat into Hermes
- Hermes text/progress replies streamed back as chunks
- task completion/error terminal frames
- Hermes processing lifecycle hooks mapped to SDK `sendTaskUpdate()` on start
  and completion, with terminal failure/cancellation telemetry through
  `sendTelemetry()`
- task cancellation forwarding from Arinova `cancel_task` into Hermes session
  cancellation
- stale local task mappings are cleared when the sidecar reports that a task
  is no longer active
- transient SDK websocket disconnects preserve active task mappings so Hermes
  can continue streaming and complete the task after reconnect
- SDK `auth_failed` and retryable/non-retryable auth error forwarding into
  Hermes adapter fatal status
- SDK non-auth `error` events forwarded into Hermes adapter lifecycle state
- SDK onboarding seed forwarding into Hermes adapter lifecycle state
- completion mention options forwarded through SDK `sendComplete()`
- active-task send routing through metadata aliases `arinova_task_id`,
  `task_id`, `taskId`, `thread_id`, and nested `arinova.taskId`
- active-task sends can pass completion mention IDs through `metadata` keys
  `mentions`, `arinova_mentions`, `complete_mentions`, or nested
  `arinova.mentions`
- sidecar lifecycle tied to the Hermes gateway adapter
- Hermes only marks the platform connected after sidecar health confirms SDK
  websocket authentication
- task context enrichment for replies, attachments, task kind, and installed
  Arinova skills
- inbound Arinova conversation names/types cached for Hermes `get_chat_info()`
- inbound attachment download into Hermes media/file cache with
  `MessageEvent.media_urls` / `media_types`
- authenticated loopback bridge for the current global `ArinovaAgent` SDK method
  surface, including messages, telemetry/HUD updates, action calls,
  uploads, notes, kanban, labels, memories, skill prompts, note sharing, and
  tool-call reports
- sidecar-owned SDK lifecycle methods: `connect()`, `disconnect()`,
  `onTask()`, and `on(AgentEvent, ...)` are bound to the Hermes adapter
  process rather than exposed as callable Hermes tools
- automatic Hermes `post_tool_call` observer reporting through SDK
  `reportToolCall()` while an Arinova task is active; reports contain only
  type/count summaries and never raw arguments, results, errors, or file
  contents, while accepting both
  `tool_name`/`args` and `function_name`/`function_args` hook payload names
- authenticated task-scoped bridge for current SDK task helpers:
  `uploadFile()`, `fetchHistory()`, and `callAction()`
- proactive Hermes outbound messages through global SDK `sendMessage()` when
  there is no active Arinova task for the target conversation
- live Hermes outbound media methods (`send_document`, `send_image_file`,
  `send_video`, and `send_voice`) through SDK `uploadFile()` followed by an
  Arinova message/chunk containing the uploaded file link
- out-of-process Hermes `send_message` / cron delivery through the plugin
  standalone sender and `ARINOVA_HOME_CONVERSATION`
- standalone `send_message` media delivery through SDK-compatible file upload
  followed by a message containing uploaded file links, with upload metadata
  returned to the caller
- plugin-local Hermes `send_message` compatibility for explicit
  `arinova:<conversationId>` targets and media-only `MEDIA:<path>` messages
  without modifying `~/hermes-agent`
- Hermes `config.yaml` bridge for connection, authz, home conversation, SDK
  options, and attachment-download settings
- Hermes `arinova` toolset registration for every current bridge method:
  generic `arinova_sdk_call` / `arinova_task_call` plus method-specific tools
  such as `arinova_query_memory`, `arinova_create_card`, and
  `arinova_task_call_action`
- method-specific Arinova tools accept SDK-shaped named parameters, while
  still keeping positional `args` for advanced calls and forward compatibility
- named tool parameters expose both Hermes-friendly snake_case and SDK-native
  camelCase aliases such as `conversationId`, `fileName`, `taskId`, and
  `actionArgs`

The loopback SDK bridge accepts JSON calls from the Python adapter:

```json
{"method":"queryMemory","args":[{"query":"project context","limit":5}]}
```

File upload calls in the sidecar control API pass bytes as base64:

```json
{
  "method": "uploadFile",
  "args": ["conversation-id", {"base64": "SGVsbG8="}, "hello.txt", "text/plain"]
}
```

Hermes tool calls also accept a local file path; the Python plugin reads the
file and forwards bytes to the sidecar:

```json
{
  "conversation_id": "conversation-id",
  "file": {"path": "/absolute/path/hello.txt"},
  "file_name": "hello.txt",
  "file_type": "text/plain"
}
```

SDK rich-card scope:

- the agent SDK currently exports no rich preview card API, so this plugin
  exposes none. Rich outbound card types should be added here when the SDK
  exports concrete methods for them.

## Development checks

```bash
python3 scripts/check_local.py --hermes-root ~/hermes-agent
python3 scripts/check_sdk_surface.py
python3 scripts/check_agent_sdk_source.py
python3 scripts/check_arinova_tools.py
python3 scripts/check_live_connection_gate.py
PYTHONPATH=~/hermes-agent python3.13 scripts/check_hermes_plugin_load.py --hermes-root ~/hermes-agent
PYTHONPATH=~/hermes-agent python3.13 scripts/check_gateway_config_load.py --hermes-root ~/hermes-agent
PYTHONPATH=~/hermes-agent python3.13 scripts/check_user_install.py --hermes-root ~/hermes-agent
python3 -m py_compile adapter.py __init__.py arinova_tools.py scripts/check_local.py scripts/check_sdk_surface.py scripts/check_agent_sdk_source.py scripts/check_hermes_plugin_load.py scripts/check_arinova_tools.py scripts/check_gateway_config_load.py scripts/check_live_connection.py scripts/check_live_connection_gate.py scripts/check_clean_install.py scripts/check_user_install.py
PYTHONPATH=~/hermes-agent python3.13 scripts/check_clean_install.py --hermes-root ~/hermes-agent
cd sidecar && npm run check
```

`scripts/check_sdk_surface.py` compares the current `agent-sdk/src/client.ts`
and `src/types.ts` against the Node sidecar allowlists, Python tool method
lists, method-specific named tool arguments derived from the local SDK source,
AgentSkill metadata fields, SDK constructor option fields, serialized
`TaskContext` field shapes, and `plugin.yaml` `provides_tools` block. It also
compares the installed `sidecar/node_modules/@arinova-ai/agent-sdk` package
version, declaration surface, public entrypoint exports, and consumed `dist`
artifacts against the local SDK checkout so runtime dependency drift is caught
for agent methods, task-scoped helpers, lifecycle events, skill metadata, SDK
constructor options, public types, and packaged files. Pass `--sdk-root` to
`scripts/check_local.py`, `scripts/check_sdk_surface.py`, or
`scripts/check_agent_sdk_source.py` to target a different agent-sdk checkout.
The local SDK source files and installed package declarations are treated as
authoritative; the upstream SDK README is also inventoried, but README omissions
do not hide source-exported SDK methods, task helpers, events, options, or
types from the bridge parity checks.
`scripts/check_agent_sdk_source.py`
runs the local SDK checkout's `npm run lint` and `npm test -- --run`, and
checks the bundled sidecar `@arinova-ai/agent-sdk` package still matches that
source checkout while asserting the SDK checkout stays clean before and after
those source checks. `scripts/check_local.py` runs the local gate:
source SDK health, SDK surface parity, Python tool wrappers, live credential
gate, live smoke, direct Hermes plugin loading, Hermes gateway config loading,
enabled user install loading, clean install loading, Python syntax checks, and
sidecar runtime checks. It uses
the current Python interpreter when it is Hermes-compatible, otherwise resolves a
Python 3.10+ interpreter with Hermes Python dependencies for the Hermes import
checks; pass `--hermes-python` to pin that interpreter explicitly. Without
`--require-credentials`, the live smoke can skip when neither environment nor
Hermes config credentials are present; add `--require-credentials` to make real
Arinova connectivity mandatory for a release gate. The final local-gate line
states whether the live Arinova smoke connected or skipped, so an offline pass
is not confused with a live release proof. Required-credential mode
preflights credential resolution before running the slower local checks. The
credential-gate verifier also asserts that this aggregate preflight fails fast
when credentials are absent, before source SDK or sidecar checks run. The
local gate also asserts the `~/hermes-agent` git checkout is clean before and
after Hermes integration checks and the local agent-sdk checkout is clean before
and after the gate. The success line includes `Hermes source clean; local
agent-sdk source clean`, proving the plugin path does not patch either
protected source checkout.
The SDK surface checker reports and enforces coverage for SDK constructor
options, exported interface and type-alias counts, exported type aliases,
exported interface fields, requiredness and broad type shapes, agent and task
helper parameter contract counts, SDK void return contract counts,
SDK nullable return contract counts, SDK array return contract counts,
SDK object return contract counts, SDK task void return contract counts,
SDK task nullable return contract counts, SDK task array return contract counts,
SDK task object return contract counts, SDK task required-parameter helper contract counts,
SDK task optional-only helper contract counts, HTTP-backed SDK method coverage counts,
HTTP message/file/history method contract counts, HTTP note method contract counts,
HTTP kanban method contract counts, HTTP memory and skill method contract counts,
HTTP query option contract counts, HTTP backend behavior contract counts, HTTP upload MIME contract counts, HTTP return payload contract counts,
HTTP return required-field contract counts, HTTP return shape contract counts,
HTTP query option field contract counts, HTTP runtime method contract counts,
HTTP runtime method order contract counts, HTTP error propagation contract counts,
HTTP return required field contract counts, HTTP return shape field contract counts,
HTTP return fixture field contract counts, agent and task helper return contract counts,
sidecar runtime SDK method coverage counts,
live SDK probe, live probe identity contract counts,
live probe message/file/history contract counts, live probe note contract counts,
live probe kanban contract counts, live probe memory and skill contract counts,
live probe telemetry and action contract counts,
live task helper probe contract counts,
live credential gate contract counts, credential-gate assertion counts,
live gate assertion identity contract counts,
live gate assertion message/file/history contract counts,
live gate assertion note contract counts,
live gate assertion kanban contract counts,
live gate assertion memory and skill contract counts,
live gate assertion telemetry and action contract counts,
live task helper gate assertion contract counts, live validator contract counts,
Hermes connection contract counts, Hermes tool schema contract counts,
Hermes registry schema contract counts, Hermes platform metadata contract counts,
Hermes platform factory contract counts,
Hermes agent runtime/bridge invoke contract counts,
Hermes Tool Search bridge contract counts, Hermes AIAgent init contract counts,
Hermes Python guard contract counts, env enablement contract counts,
config callback contract counts, Python tool wrapper contract counts, tool report hook contract counts,
SDK schema alignment contract counts, SDK schema field alignment contract counts,
SDK schema requiredness alignment contract counts, SDK schema shape alignment contract counts,
SDK install integrity contract counts, clean install contract counts,
clean install YAML bridge contract counts, clean install platform callback contract counts,
clean install platform metadata contract counts,
clean install platform factory contract counts,
clean install registry schema contract counts, clean install registry dispatch contract counts,
clean install agent runtime/bridge invoke contract counts,
clean install Tool Search bridge contract counts, clean install AIAgent init contract counts,
clean install gateway runner toolset contract counts,
clean install sidecar check contract counts,
user install contract counts, user install YAML bridge contract counts,
user install platform callback contract counts, user install registry schema contract counts,
user install platform metadata contract counts,
user install platform factory contract counts,
user install registry dispatch contract counts,
user install agent runtime/bridge invoke contract counts,
user install Tool Search bridge contract counts, user install AIAgent init contract counts,
user install gateway runner toolset contract counts,
user install sidecar check contract counts,
gateway config contract counts, gateway runner toolset contract counts,
sidecar SDK lockfile contract counts, duplicate-key scanner contract counts,
manifest skill contract counts, adapter behavior contract counts, send_message compatibility contract counts,
completion mention metadata contract counts, terminal task completion contract counts, TaskContext metadata behavior contract counts,
same-conversation task contract counts, sidecar lifecycle contract counts, adapter TaskContext metadata contract counts,
release-gate documentation contract counts, SDK surface CLI contract counts, install schema documentation contract counts,
sidecar upload schema contract counts, nested schema field contract counts,
nested schema requiredness contract counts, nested schema shape contract counts,
sidecar schema field parity contract counts, sidecar schema requiredness parity contract counts,
sidecar schema shape parity contract counts, sidecar nested schema field parity contract counts,
sidecar nested schema requiredness parity contract counts, sidecar nested schema shape parity contract counts,
installed SDK agent parameter parity contract counts, installed SDK task parameter parity contract counts,
installed SDK agent return parity contract counts, installed SDK task return parity contract counts,
installed SDK TaskContext callable parameter parity contract counts,
installed SDK TaskContext callable return parity contract counts,
TaskContext reply callable contract counts, TaskContext SDK helper callable contract counts,
installed SDK TaskContext reply callable contract counts,
installed SDK TaskContext SDK helper callable contract counts,
installed SDK type symbol parity contract counts, installed SDK interface field parity contract counts,
installed SDK interface requiredness parity contract counts, installed SDK interface shape parity contract counts,
installed SDK nested TaskContext field parity contract counts,
installed SDK nested TaskContext requiredness parity contract counts,
installed SDK nested TaskContext shape parity contract counts,
installed SDK type alias parity contract counts, installed SDK public type parity contract counts,
installed SDK public value parity contract counts, installed SDK action protocol parity contract counts,
Python named argument contract counts, Python task named argument contract counts,
Python required argument count contract counts, Python task required argument count contract counts,
Python max argument count contract counts, Python task max argument count contract counts,
Hermes positional argument bound contract counts, Hermes task positional argument bound contract counts,
sidecar required argument count contract counts, sidecar task required argument count contract counts,
sidecar max argument count contract counts, sidecar task max argument count contract counts,
sidecar agent argument type contract counts, sidecar task argument type contract counts,
sidecar agent argument schema contract counts, sidecar task argument schema contract counts,
Python direct argument type validation contract counts,
Python positional argument type validation contract counts,
Python method description contract counts, manifest tool exposure contract counts,
manifest tool order contract counts, manifest env contract counts,
manifest concurrency default contract counts, README manifest tool contract counts,
README env contract counts, runtime env contract counts, YAML special-key contract counts,
README YAML contract counts, SDK package version contract counts, SDK package metadata contract counts,
adapter SDK metadata key contract counts, adapter SDK package file contract counts,
adapter SDK package name contract counts, adapter SDK package type contract counts,
adapter SDK package exports contract counts, SDK dist file parity contract counts,
clean install required plugin file contract counts, user install required plugin file contract counts,
clean install SDK package file contract counts, user install SDK package file contract counts,
clean install SDK metadata key contract counts, user install SDK metadata key contract counts,
SDK method exposure contract counts, sidecar method order contract counts,
Python method order contract counts, local lifecycle method contract counts,
local lifecycle documentation contract counts, SDK README bridge contract counts,
task helper exposure contract counts, sidecar task helper order contract counts,
Python task helper order contract counts, TaskContext field contract counts,
TaskContext field shape contract counts, installed SDK method contract counts,
installed SDK task helper contract counts, installed SDK TaskContext field contract counts,
installed SDK AgentSkill field contract counts, sidecar AgentSkill field contract counts,
sidecar AgentSkill requiredness contract counts, sidecar AgentSkill shape contract counts,
installed SDK option field contract counts, sidecar option field contract counts,
SDK connection/auth option contract counts, SDK skill option contract counts,
SDK timing option contract counts, SDK scheduler option contract counts,
sidecar connection/auth option contract counts, sidecar skill option contract counts,
sidecar timing option contract counts, sidecar scheduler option contract counts,
installed SDK connection/auth option contract counts,
installed SDK skill option contract counts, installed SDK timing option contract counts,
installed SDK scheduler option contract counts,
sidecar option requiredness contract counts, sidecar option shape contract counts,
control env surface contract counts, installed SDK AgentEvent contract counts,
SDK AgentEvent connection contract counts, SDK AgentEvent error/auth contract counts,
SDK AgentEvent token contract counts, sidecar AgentEvent connection contract counts,
sidecar AgentEvent error/auth contract counts, sidecar AgentEvent token contract counts,
installed SDK AgentEvent connection contract counts,
installed SDK AgentEvent error/auth contract counts,
installed SDK AgentEvent token contract counts,
installed SDK TaskUpdateData status contract counts,
SDK TaskUpdateData start status contract counts,
SDK TaskUpdateData completion status contract counts,
installed SDK TaskUpdateData start status contract counts,
installed SDK TaskUpdateData completion status contract counts,
installed SDK TaskUpdateData variant contract counts,
installed SDK ActionCallResult status contract counts,
ActionCallResult terminal status contract counts,
ActionCallResult transient coverage contract counts,
ActionCallResult terminal coverage contract counts,
installed SDK ActionCallResult terminal status contract counts,
installed SDK ActionCallResult transient status contract counts,
SDK ActionCallResult identity contract counts,
SDK ActionCallResult payload contract counts,
SDK ActionCallResult trace contract counts,
SDK ActionCallResult execution contract counts,
installed SDK ActionCallResult identity contract counts,
installed SDK ActionCallResult payload contract counts,
installed SDK ActionCallResult trace contract counts,
installed SDK ActionCallResult execution contract counts,
SDK MemoryOrigin literal contract counts,
SDK MemoryOrigin template contract counts,
installed SDK MemoryOrigin literal contract counts,
installed SDK MemoryOrigin template contract counts,
SDK OnboardingSeed kind contract counts,
installed SDK OnboardingSeed kind contract counts,
SDK OnboardingSeed identity contract counts,
SDK OnboardingSeed action contract counts,
SDK OnboardingSeed content contract counts,
installed SDK OnboardingSeed identity contract counts,
installed SDK OnboardingSeed action contract counts,
installed SDK OnboardingSeed content contract counts,
SDK TokenClaimedData field contract counts,
installed SDK TokenClaimedData field contract counts,
TokenClaimedData required-field contract counts,
TokenClaimedData nullable agent contract counts,
SDK ActionCallOptions correlation contract counts,
SDK ActionCallOptions attribution contract counts,
SDK ActionCallOptions context contract counts,
SDK ActionCallOptions execution contract counts,
installed SDK ActionCallOptions correlation contract counts,
installed SDK ActionCallOptions attribution contract counts,
installed SDK ActionCallOptions context contract counts,
installed SDK ActionCallOptions execution contract counts,
SDK ToolCallReport identity contract counts,
SDK ToolCallReport tool contract counts,
SDK ToolCallReport outcome contract counts,
installed SDK ToolCallReport identity contract counts,
installed SDK ToolCallReport tool contract counts,
installed SDK ToolCallReport outcome contract counts,
SDK ActionErrorBody identity contract counts,
SDK ActionErrorBody detail contract counts,
installed SDK ActionErrorBody identity contract counts,
installed SDK ActionErrorBody detail contract counts,
SDK ActionConfirmationPayload identity contract counts,
SDK ActionConfirmationPayload content contract counts,
SDK ActionConfirmationPayload timing contract counts,
installed SDK ActionConfirmationPayload identity contract counts,
installed SDK ActionConfirmationPayload content contract counts,
installed SDK ActionConfirmationPayload timing contract counts,
SDK TaskAttachment identity contract counts,
SDK TaskAttachment name/type contract counts,
SDK TaskAttachment size contract counts,
SDK TaskAttachment URL contract counts,
installed SDK TaskAttachment identity contract counts,
installed SDK TaskAttachment name/type contract counts,
installed SDK TaskAttachment size contract counts,
installed SDK TaskAttachment URL contract counts,
SDK UploadResult name/type contract counts,
SDK UploadResult size contract counts,
SDK UploadResult URL contract counts,
installed SDK UploadResult name/type contract counts,
installed SDK UploadResult size contract counts,
installed SDK UploadResult URL contract counts,
SDK AgentRuntimeInfo identity contract counts,
SDK AgentRuntimeInfo environment contract counts,
installed SDK AgentRuntimeInfo identity contract counts,
installed SDK AgentRuntimeInfo environment contract counts,
SDK HistoryMessage identity contract counts,
SDK HistoryMessage content/status contract counts,
SDK HistoryMessage sender contract counts,
SDK HistoryMessage thread contract counts,
SDK HistoryMessage timestamp contract counts,
SDK HistoryMessage attachment contract counts,
installed SDK HistoryMessage identity contract counts,
installed SDK HistoryMessage content/status contract counts,
installed SDK HistoryMessage sender contract counts,
installed SDK HistoryMessage thread contract counts,
installed SDK HistoryMessage timestamp contract counts,
installed SDK HistoryMessage attachment contract counts,
SDK FetchHistoryOptions cursor contract counts,
SDK FetchHistoryOptions pagination contract counts,
installed SDK FetchHistoryOptions cursor contract counts,
installed SDK FetchHistoryOptions pagination contract counts,
SDK FetchHistoryResult collection contract counts,
SDK FetchHistoryResult pagination contract counts,
installed SDK FetchHistoryResult collection contract counts,
installed SDK FetchHistoryResult pagination contract counts,
SDK Note identity contract counts,
SDK Note creator contract counts,
SDK Note agent attribution contract counts,
SDK Note content contract counts,
SDK Note tag contract counts,
SDK Note timestamp contract counts,
installed SDK Note identity contract counts,
installed SDK Note creator contract counts,
installed SDK Note agent attribution contract counts,
installed SDK Note content contract counts,
installed SDK Note tag contract counts,
installed SDK Note timestamp contract counts,
SDK ListNotesOptions pagination contract counts,
SDK ListNotesOptions filter contract counts,
SDK ListNotesOptions archive contract counts,
installed SDK ListNotesOptions pagination contract counts,
installed SDK ListNotesOptions filter contract counts,
installed SDK ListNotesOptions archive contract counts,
SDK ListNotesResult collection contract counts,
SDK ListNotesResult pagination contract counts,
installed SDK ListNotesResult collection contract counts,
installed SDK ListNotesResult pagination contract counts,
SDK CreateNoteBody content contract counts,
SDK CreateNoteBody tag contract counts,
SDK CreateNoteBody notebook contract counts,
installed SDK CreateNoteBody content contract counts,
installed SDK CreateNoteBody tag contract counts,
installed SDK CreateNoteBody notebook contract counts,
SDK UpdateNoteBody content contract counts,
SDK UpdateNoteBody tag contract counts,
installed SDK UpdateNoteBody content contract counts,
installed SDK UpdateNoteBody tag contract counts,
SDK QueryMemoryOptions query contract counts,
SDK QueryMemoryOptions pagination contract counts,
installed SDK QueryMemoryOptions query contract counts,
installed SDK QueryMemoryOptions pagination contract counts,
SDK MemoryEntry content contract counts,
SDK MemoryEntry classification contract counts,
SDK MemoryEntry scoring contract counts,
installed SDK MemoryEntry content contract counts,
installed SDK MemoryEntry classification contract counts,
installed SDK MemoryEntry scoring contract counts,
SDK SkillPrompt content contract counts,
SDK SkillPrompt template contract counts,
SDK SkillPrompt parameter contract counts,
installed SDK SkillPrompt content contract counts,
installed SDK SkillPrompt template contract counts,
installed SDK SkillPrompt parameter contract counts,
SDK KanbanBoard identity contract counts,
SDK KanbanBoard display contract counts,
SDK KanbanBoard timestamp contract counts,
installed SDK KanbanBoard identity contract counts,
installed SDK KanbanBoard display contract counts,
installed SDK KanbanBoard timestamp contract counts,
SDK KanbanColumn identity contract counts,
SDK KanbanColumn parent contract counts,
SDK KanbanColumn display contract counts,
SDK KanbanColumn ordering contract counts,
installed SDK KanbanColumn identity contract counts,
installed SDK KanbanColumn parent contract counts,
installed SDK KanbanColumn display contract counts,
installed SDK KanbanColumn ordering contract counts,
SDK KanbanCard identity contract counts,
SDK KanbanCard placement contract counts,
SDK KanbanCard content contract counts,
SDK KanbanCard scheduling contract counts,
SDK KanbanCard creator contract counts,
SDK KanbanCard timestamp contract counts,
SDK KanbanCard archive contract counts,
installed SDK KanbanCard identity contract counts,
installed SDK KanbanCard placement contract counts,
installed SDK KanbanCard content contract counts,
installed SDK KanbanCard scheduling contract counts,
installed SDK KanbanCard creator contract counts,
installed SDK KanbanCard timestamp contract counts,
installed SDK KanbanCard archive contract counts,
SDK ListBoardsResult board contract counts,
SDK ListBoardsResult column contract counts,
SDK ListBoardsResult card contract counts,
installed SDK ListBoardsResult board contract counts,
installed SDK ListBoardsResult column contract counts,
installed SDK ListBoardsResult card contract counts,
SDK KanbanLabel identity contract counts,
SDK KanbanLabel parent contract counts,
SDK KanbanLabel display contract counts,
SDK KanbanLabel color contract counts,
installed SDK KanbanLabel identity contract counts,
installed SDK KanbanLabel parent contract counts,
installed SDK KanbanLabel display contract counts,
installed SDK KanbanLabel color contract counts,
SDK CreateBoardBody display contract counts,
SDK CreateBoardBody column contract counts,
installed SDK CreateBoardBody display contract counts,
installed SDK CreateBoardBody column contract counts,
SDK UpdateBoardBody display contract counts,
installed SDK UpdateBoardBody display contract counts,
SDK CreateCardBody content contract counts,
SDK CreateCardBody placement contract counts,
installed SDK CreateCardBody content contract counts,
installed SDK CreateCardBody placement contract counts,
SDK UpdateCardBody content contract counts,
SDK UpdateCardBody placement contract counts,
SDK UpdateCardBody ordering contract counts,
installed SDK UpdateCardBody content contract counts,
installed SDK UpdateCardBody placement contract counts,
installed SDK UpdateCardBody ordering contract counts,
SDK CreateColumnBody display contract counts,
SDK CreateColumnBody ordering contract counts,
installed SDK CreateColumnBody display contract counts,
installed SDK CreateColumnBody ordering contract counts,
SDK UpdateColumnBody display contract counts,
SDK UpdateColumnBody ordering contract counts,
installed SDK UpdateColumnBody display contract counts,
installed SDK UpdateColumnBody ordering contract counts,
SDK AddCommitBody commit contract counts,
SDK AddCommitBody content contract counts,
installed SDK AddCommitBody commit contract counts,
installed SDK AddCommitBody content contract counts,
SDK CreateLabelBody display contract counts,
SDK CreateLabelBody color contract counts,
installed SDK CreateLabelBody display contract counts,
installed SDK CreateLabelBody color contract counts,
SDK UpdateLabelBody display contract counts,
SDK UpdateLabelBody color contract counts,
installed SDK UpdateLabelBody display contract counts,
installed SDK UpdateLabelBody color contract counts,
SDK CardCommit identity contract counts,
SDK CardCommit content contract counts,
SDK CardCommit timestamp contract counts,
installed SDK CardCommit identity contract counts,
installed SDK CardCommit content contract counts,
installed SDK CardCommit timestamp contract counts,
SDK CardNote identity contract counts,
SDK CardNote display contract counts,
SDK CardNote tag contract counts,
SDK CardNote timestamp contract counts,
installed SDK CardNote identity contract counts,
installed SDK CardNote display contract counts,
installed SDK CardNote tag contract counts,
installed SDK CardNote timestamp contract counts,
SDK ArchivedCardsResult collection contract counts,
SDK ArchivedCardsResult pagination contract counts,
installed SDK ArchivedCardsResult collection contract counts,
installed SDK ArchivedCardsResult pagination contract counts,
adapter TaskUpdateData status contract counts,
adapter TaskUpdateData start status contract counts,
adapter TaskUpdateData completion status contract counts,
sidecar AgentEvent contract counts,
SDK client test inventory contract counts, SDK client test uniqueness contract counts,
SDK client HTTP validation test contract counts, SDK client task scheduling test contract counts,
SDK client reconnect buffer test contract counts, SDK client task action test contract counts,
SDK client no-conversation test contract counts, SDK client auth retry test contract counts,
SDK client onboarding test contract counts,
SDK types test inventory contract counts, SDK types test uniqueness contract counts,
SDK types action context test contract counts, SDK types ActionCallResult test contract counts,
SDK types upload attachment test contract counts, SDK types TaskContext helper test contract counts,
SDK README method inventory contract counts, SDK README method uniqueness contract counts,
SDK README lifecycle method contract counts, SDK README message/file method contract counts,
SDK README note method contract counts, SDK README kanban method contract counts,
SDK README memory method contract counts,
SDK README type inventory contract counts, SDK README type uniqueness contract counts,
SDK README kanban type contract counts, SDK README note and memory type contract counts,
SDK README option inventory contract counts, SDK README option uniqueness contract counts,
SDK README auth option contract counts, SDK README timing option contract counts,
SDK README TaskContext inventory contract counts,
SDK README TaskContext uniqueness contract counts, SDK README TaskContext field contract counts,
SDK README TaskContext reply helper contract counts,
live validator field-set contract counts, live validator status-set contract counts,
live validator field usage contract counts, live validator shape contract counts,
live validator kanban contract counts, live validator note and memory contract counts,
live validator file and history contract counts, live validator input contract counts,
live validator action contract counts,
TaskContext nested field and shape coverage, SDK option config contract counts,
SDK package file and metadata key counts, required plugin file and sidecar check
script counts, SDK auth protocol contract counts, SDK auth, command, and runtime
frame contract counts, auth frame detail contract counts, command frame detail contract counts,
runtime frame detail contract counts, SDK behavior contract counts, runtime E2E coverage contract counts,
runtime E2E queue and cron contract counts, runtime E2E skill config contract counts,
runtime E2E outbound delivery contract counts, runtime E2E TaskContext action contract counts,
runtime E2E tool report contract counts, runtime E2E reconnect buffer contract counts,
runtime E2E concurrency mode contract counts, runtime E2E auth reconnect contract counts,
runtime E2E shutdown cleanup contract counts, runtime upload validation contract counts,
runtime control validation contract counts, runtime structured argument validation contract counts,
gateway config runtime option contract counts, gateway config agent skill contract counts,
gateway config alias contract counts,
live credential resolution contract counts, live gate import and config contract counts,
live gate SDK probe contract counts, live gate probe validation contract counts,
queue overflow contract counts, auth retry contract counts,
task heartbeat contract counts, ping interval contract counts, ping timeout contract counts,
reconnect interval contract counts, action timeout contract counts, generated callId contract counts,
onboarding seed contract counts, control result contract counts, listBoards return contract counts, Hermes and sidecar JSON
schema contract counts, ActionCallResult status coverage, public value export counts,
generated JavaScript, declarations, and named tool parameters. It inventories upstream SDK client and
type tests so new behavior contracts force a bridge parity review, requires
every exposed agent SDK method to have a live smoke `call_agent_sdk()` probe
plus fake-gate SDK call assertion coverage, requires the opt-in task-scoped
`callAction()` live smoke probe to have fake-gate assertion coverage, and
requires every task-scoped helper to be exercised by the Python tool-wrapper
checks.

To verify Hermes can load this checkout as a plugin, run the smoke test with a
Python version supported by `~/hermes-agent`:

```bash
PYTHONPATH=~/hermes-agent python3.13 scripts/check_hermes_plugin_load.py --hermes-root ~/hermes-agent
```

The smoke test uses Hermes `PluginManager`, confirms the `arinova` platform
entry, confirms every manifest-declared tool registers, and exercises representative tool
handlers against a fake active adapter. It also verifies the Python adapter
passes connection, loopback, bridge-token, skills, concurrency, and SDK timing
settings into the supervised sidecar environment.

`scripts/check_gateway_config_load.py` creates an isolated temporary
`HERMES_HOME`, installs this checkout as a user plugin there, writes an Arinova
`config.yaml`, and verifies Hermes `load_gateway_config()` enables the platform
with the expected extras, SDK timing/scheduler options, and home conversation.
It also calls Hermes' real `GatewayRunner._create_adapter()` plugin path and
verifies it returns `ArinovaAdapter` with the YAML-loaded credentials and
runtime controls, verifies the adapter accepts Hermes' message/fatal/session
store/busy handler wiring, then drives Hermes'
`GatewayRunner._connect_adapter_with_timeout()` helper against that adapter to
verify runner-level connect handoff and reconnect flag forwarding. The same
check verifies Hermes' gateway runner contract so both interactive and
background `AIAgent` creation paths resolve platform toolsets with
`_get_platform_tools()` and pass the resolved `enabled_toolsets` into the agent.

`scripts/check_user_install.py` verifies the real `~/.hermes/plugins` install
path resolves to this checkout, that real Hermes `config.yaml` lists
`hermes-arinova-plugin` in `plugins.enabled`, that PluginManager loads it, and
that Hermes' platform listing exposes the Arinova platform and default
`hermes-arinova` toolset, and that Hermes' real platform tool resolver enables
that toolset for `arinova`. It also verifies the live Hermes registry contains
the manifest-declared Arinova platform/tools, indexes every Arinova tool under
the `hermes-arinova` registry toolset, and exposes usable generic and named SDK
tool schemas through Hermes' `model_tools` enabled-toolset filtering, including
SDK-native camelCase aliases such as `conversationId`, `fileName`, `taskId`,
and `actionArgs`. It also verifies the enabled sidecar
dependency's `@arinova-ai/agent-sdk` package version, public package metadata
including runtime `dependencies`, consumed `dist` files, and
`check_requirements()` result exactly match the selected `--sdk-root` checkout
(defaulting to
`~/.arinova-bridge/workspace/projects/arinova-packages/packages/agent-sdk`),
while confirming configured SDK options are passed into the supervised sidecar
environment and Python adapter runtime controls such as sidecar post timeout,
connect timeout, attachment download limits, autostart, and bot-sender policy.

`scripts/check_clean_install.py` copies this plugin into a temporary plugin
directory without `.git`, `__pycache__`, or `sidecar/node_modules`, runs
`npm ci --ignore-scripts` plus the copied sidecar's full `npm run check`, runs
the copied gateway config-load smoke, and verifies Hermes can load the copied
plugin, register the Arinova platform/tools, expose the Arinova platform through
Hermes' platform listing and tool resolver, index every Arinova tool under the
`hermes-arinova` registry toolset, expose usable generic and named SDK tool
schemas through Hermes' `model_tools` enabled-toolset filtering, and pass
SDK-native camelCase alias fields through those schemas while passing
`check_requirements()`, configured SDK runtime options, and the
sidecar's Node.js 22+ runtime requirement. It also verifies copied-install
sidecar environment propagation plus Python adapter runtime controls such as
sidecar post timeout, connect timeout, attachment download limits, autostart,
and bot-sender policy, with the copied SDK install checked
against the same selected `--sdk-root` checkout.
The fresh dependency install also compares the copied sidecar's consumed SDK
package version, package metadata including runtime `dependencies`, and `dist` files against the local
`agent-sdk` checkout.

The sidecar `npm run check` also starts a local fake Arinova websocket server
and drives the real `@arinova-ai/agent-sdk` through auth, inbound task
delivery, runtime capability advertisement, skill command registration,
proactive sends, telemetry/HUD/task updates, tool-call reports, token claim
forwarding, global and task-scoped action calls including confirmation/dry-run
result fields, exact task payload serialization, SDK `task_queued` backpressure
frames, queued task drain after active completion, no-conversation cron/trigger
tasks and their conversation-scoped helper errors, chunk streaming, task
cancellation, completion mentions, and task completion without requiring live
Arinova credentials. It checks sidecar option parsing, including skills,
concurrency, timing values, and malformed config rejection. It also starts a
fake HTTP backend and exercises task-scoped upload/history plus the SDK HTTP
helpers for upload, history, notes, kanban, labels, memory search, skill
prompts, and note sharing through the sidecar `/agent-sdk` bridge, including
query-string and JSON-body wire-shape checks for structured SDK inputs plus
backend error status/body propagation through the control API.
The SDK surface check also compares local vs installed SDK method return
types, exported type names, exported type aliases, exported interface fields,
requiredness and broad type shapes, agent lifecycle events, and the package
public `index.ts` type/value exports, so package drift is caught before the
bridge is tested against live Arinova.

With real Arinova credentials in the environment or Hermes `config.yaml` credentials,
this optional smoke test
exercises the Hermes plugin load path, Python adapter, Node sidecar, and real
SDK websocket authentication. A passing live smoke requires sidecar `/healthz`
to report `ok: true`, `connected: true`, and `agentId` matching SDK `getAgentId()`
plus a successful SDK `getOnboardingSeed()` call through the
Python adapter, then sends a
low-impact SDK `sendTelemetry()` probe to verify authenticated outbound
websocket delivery:

Credentialed live probes exercise global `ArinovaAgent` methods. Task-scoped
`TaskContext` helpers usually require an active inbound Arinova task and are
covered by the sidecar runtime/e2e checks, where the fake SDK server can
deterministically deliver active task contexts. When a real active task id is
available, `--task-fetch-history-task <task-id>` exercises task-scoped SDK
`fetchHistory()`, `--task-upload-file-task <task-id>` exercises task-scoped SDK
`uploadFile()`, and `--task-call-action-task <task-id>` plus
`--task-call-action <action-name>` exercises task-scoped SDK `callAction()`
through the plugin's `/task-sdk` bridge; call-action options intentionally
reject `taskId`, `conversationId`, and `messageId` because `TaskContext.callAction()` derives those from the task.

```bash
ARINOVA_SERVER_URL=wss://chat.arinova.ai ARINOVA_BOT_TOKEN=ari_... \
  python3.13 scripts/check_live_connection.py --hermes-root ~/hermes-agent
```

The credentialed live smoke also verifies the bundled sidecar
`@arinova-ai/agent-sdk` package against the selected `--sdk-root` checkout before
opening the SDK websocket. Without those credentials it exits successfully with a
skip message that names the missing keys after checking both environment variables and Hermes
`config.yaml`; Hermes `config.yaml` credentials are accepted as the fallback
source, including partial configurations where only `ARINOVA_SERVER_URL`
or only `ARINOVA_BOT_TOKEN` is set. Add
`--require-credentials` when the live connection is a required release gate; in
that mode missing or partial credentials fail before Hermes or Arinova are
touched.
Use `--resolve-credentials-only` to verify credential source resolution without
loading Hermes or connecting to Arinova; it reports only `env`, `config`, or
`missing` sources and never prints the token. When both environment and
`config.yaml` values are present, environment credentials take precedence.
Use `--skip-telemetry` only when the environment must avoid the outbound
telemetry probe. Use `--send-telemetry-event <event-name>` and
`--send-telemetry-json '<json-object>'` to exercise SDK `sendTelemetry()` with
custom event data; those custom telemetry flags cannot be combined with
`--skip-telemetry`.
For a low-impact HUD delivery check, pass `--send-hud-json '<json-object>'`;
this calls SDK `sendHud()` after authentication and requires the payload to be a
JSON object. Use `--send-hud-conversation <conversation-id>` to exercise the
conversation-scoped SDK `sendHud()` overload; it must be paired with
`--send-hud-json`.
For a low-impact task lifecycle delivery check, pass
`--send-task-update-json '<json-object>'`; this calls SDK `sendTaskUpdate()` as
`Hermes` after authentication and requires the payload to be a JSON object.
For a tool report delivery check, pass
`--report-tool-call-json '<json-object>'`; this calls SDK `reportToolCall()`
after authentication and requires the payload to be a JSON object.
For a read-only memory search check, pass
`--query-memory-json '<json-object>'`; this calls SDK `queryMemory()` after
authentication and verifies the returned memory result shape.
For a read-only skill prompt check, pass `--fetch-skill-prompt <skill-slug>`;
this calls SDK `fetchSkillPrompt()` after authentication and verifies the
returned prompt shape.
For a read-only kanban board listing check, pass `--list-boards`; this calls
SDK `listBoards()` after authentication and verifies the returned board list
shape.
For a read-only kanban card search check, pass
`--list-cards-json '<json-object>'`; this calls SDK `listCards()` after
authentication and verifies the returned card list shape.
For a read-only conversation notes check, pass a real conversation id with
`--list-notes-conversation <conversation-id>`; this calls SDK `listNotes()`
with `--list-notes-options-json` after authentication and verifies the returned
notes result shape. `--list-notes-options-json` requires
`--list-notes-conversation`.
For a read-only board column check, pass a real board id with
`--list-columns-board <board-id>`; this calls SDK `listColumns()` after
authentication and verifies the returned column list shape.
For a read-only board label check, pass a real board id with
`--list-labels-board <board-id>`; this calls SDK `listLabels()` after
authentication and verifies the returned label list shape.
For a read-only archived-card check, pass a real board id with
`--list-archived-cards-board <board-id>`; this calls SDK `listArchivedCards()`
with `--list-archived-cards-options-json` after
authentication and verifies the returned archived-card result shape.
`--list-archived-cards-options-json` requires `--list-archived-cards-board`.
For a read-only card commit check, pass a real card id with
`--list-card-commits-card <card-id>`; this calls SDK `listCardCommits()` after
authentication and verifies the returned commit list shape.
For a read-only linked card-note check, pass a real card id with
`--list-card-notes-card <card-id>`; this calls SDK `listCardNotes()` after
authentication and verifies the returned note list shape.
For an explicit note creation check, pass a real conversation id with
`--create-note-conversation <conversation-id>` and
`--create-note-body-json '<json-object>'`; this calls SDK `createNote()` after
authentication and verifies the returned note shape.
For an explicit note update check, pass a real conversation id and note id with
`--update-note-conversation <conversation-id>`, `--update-note-id <note-id>`,
and `--update-note-body-json '<json-object>'`; this calls SDK `updateNote()`
after authentication and verifies the returned note shape.
For an explicit note deletion check, pass a real conversation id and note id
with `--delete-note-conversation <conversation-id>` and
`--delete-note-id <note-id>`; this calls SDK `deleteNote()` after
authentication and verifies the delete call completes.
For an explicit board creation check, pass `--create-board-body-json '<json-object>'`;
this calls SDK `createBoard()` after authentication and verifies the returned
board shape.
For an explicit board update check, pass a real board id with
`--update-board-id <board-id>` and `--update-board-body-json '<json-object>'`;
this calls SDK `updateBoard()` after authentication and verifies the returned
board shape.
For an explicit board archive check, pass a real board id with
`--archive-board-id <board-id>`; this calls SDK `archiveBoard()` after
authentication and verifies the archive call completes.
For an explicit card creation check, pass `--create-card-body-json '<json-object>'`;
this calls SDK `createCard()` after authentication and verifies the returned
card shape.
For an explicit card update check, pass a real card id with
`--update-card-id <card-id>` and `--update-card-body-json '<json-object>'`;
this calls SDK `updateCard()` after authentication and verifies the returned
card shape.
For an explicit card completion check, pass a real card id with
`--complete-card-id <card-id>`; this calls SDK `completeCard()` after
authentication and verifies the returned card shape.
For an explicit column creation check, pass a real board id with
`--create-column-board <board-id>` and `--create-column-body-json '<json-object>'`;
this calls SDK `createColumn()` after authentication and verifies the returned
column shape.
For an explicit column update check, pass a real column id with
`--update-column-id <column-id>` and `--update-column-body-json '<json-object>'`;
this calls SDK `updateColumn()` after authentication and verifies the returned
column shape.
For an explicit column deletion check, pass a real column id with
`--delete-column-id <column-id>`; this calls SDK `deleteColumn()` after
authentication and verifies the delete call completes.
For an explicit column reorder check, pass a real board id with
`--reorder-columns-board <board-id>` and `--reorder-columns-json '<json-array>'`;
this calls SDK `reorderColumns()` after authentication and verifies the reorder
call completes.
For an explicit card commit check, pass a real card id with
`--add-card-commit-card <card-id>` and `--add-card-commit-body-json '<json-object>'`;
this calls SDK `addCardCommit()` after authentication and verifies the returned
commit shape.
For an explicit card-note link check, pass a real card id and note id with
`--link-card-note-card <card-id>` and `--link-card-note-note <note-id>`; this
calls SDK `linkCardNote()` after authentication and verifies the link call
completes.
For an explicit card-note unlink check, pass a real card id and note id with
`--unlink-card-note-card <card-id>` and `--unlink-card-note-note <note-id>`;
this calls SDK `unlinkCardNote()` after authentication and verifies the unlink
call completes.
For an explicit label creation check, pass a real board id with
`--create-label-board <board-id>` and `--create-label-body-json '<json-object>'`;
this calls SDK `createLabel()` after authentication and verifies the returned
label shape.
For an explicit label update check, pass a real label id with
`--update-label-id <label-id>` and `--update-label-body-json '<json-object>'`;
this calls SDK `updateLabel()` after authentication and verifies the returned
label shape.
For an explicit label deletion check, pass a real label id with
`--delete-label-id <label-id>`; this calls SDK `deleteLabel()` after
authentication and verifies the delete call completes.
For an explicit card label add check, pass a real card id and label id with
`--add-card-label-card <card-id>` and `--add-card-label-label <label-id>`; this
calls SDK `addCardLabel()` after authentication and verifies the add call
completes.
For an explicit card label remove check, pass a real card id and label id with
`--remove-card-label-card <card-id>` and
`--remove-card-label-label <label-id>`; this calls SDK `removeCardLabel()` after
authentication and verifies the remove call completes.
For a full outbound delivery check, pass a real conversation id with
`--send-message-conversation <conversation-id>`; this sends the
`--send-message-content` text through SDK `sendMessage()` after authentication.
Custom `--send-message-content` requires `--send-message-conversation`.
For a read-only HTTP SDK check, pass a real conversation id with
`--fetch-history-conversation <conversation-id>`; this calls SDK `fetchHistory()`
with `--fetch-history-limit` after authentication and verifies the returned
history shape. Use `--fetch-history-options-json '<json-object>'` to exercise
full SDK `FetchHistoryOptions` pagination fields. Both history option flags
require `--fetch-history-conversation`.
For a file-upload SDK check, pass a real conversation id with
`--upload-file-conversation <conversation-id>`; this calls SDK `uploadFile()`
with a tiny generated text file unless `--upload-file-path` is provided, and
verifies the returned upload metadata shape. When provided, `--upload-file-path`
must point to an existing local file and must be paired with
`--upload-file-conversation`. Use `--upload-file-name` and
`--upload-file-type` to override the sent file metadata; those metadata flags
also require `--upload-file-conversation`.
For an action protocol check, pass a backend action name with
`--call-action <action-name>`; this calls SDK `callAction()` with
`--call-action-args-json` and `--call-action-options-json`, defaulting the
options to `dryRun: true` when not provided, and verifies the returned action
result shape. Both call-action JSON flags require `--call-action`.
For a read-only task history check, pass an active task id with
`--task-fetch-history-task <task-id>`; this calls SDK
`TaskContext.fetchHistory()` with `--task-fetch-history-limit` or
`--task-fetch-history-options-json '<json-object>'` and verifies the returned
history shape. Both task history option flags require
`--task-fetch-history-task`.
For a task-scoped file-upload SDK check, pass an active task id with
`--task-upload-file-task <task-id>`; this calls SDK `TaskContext.uploadFile()`
with a tiny generated text file unless `--task-upload-file-path` is provided,
and verifies the returned upload metadata shape. When provided,
`--task-upload-file-path` must point to an existing local file and must be
paired with `--task-upload-file-task`. Use `--task-upload-file-name` and
`--task-upload-file-type` to override the sent file metadata; those metadata
flags also require `--task-upload-file-task`.
For a task-scoped action protocol check, pass an active task id with
`--task-call-action-task <task-id>` and a backend action name with
`--task-call-action <action-name>`; this calls SDK `TaskContext.callAction()`
with `--task-call-action-args-json` and `--task-call-action-options-json`.
Task call-action options accept `callId`, `parentCallId`, `reason`, `metadata`,
`dryRun`, and `timeoutMs`, and reject explicit `taskId`, `conversationId`, and
`messageId` attribution fields.
`scripts/check_live_connection_gate.py` verifies those credential-free skip,
required-gate failure, config fallback, env-over-config precedence,
`--hermes-root` import handling, optional send-telemetry, send-hud, send-task-update,
report-tool-call, query-memory, fetch-skill-prompt, list-boards, list-cards,
list-notes, list-columns, list-labels, list-archived-cards, list-card-commits,
list-card-notes, create-note, update-note, delete-note, create-board, update-board, archive-board, create-card, update-card, complete-card, create-column, update-column, delete-column, reorder-columns, add-card-commit, link-card-note, unlink-card-note, create-label, update-label, delete-label, add-card-label, remove-card-label, send-message, fetch-history, upload-file, call-action, task-fetch-history, task-upload-file, and task-call-action probes, and
`--skip-telemetry` modes without touching `~/hermes-agent`.
