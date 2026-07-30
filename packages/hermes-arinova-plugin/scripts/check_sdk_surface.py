#!/usr/bin/env python3
"""Check that the sidecar exposes the current ArinovaAgent SDK surface."""

from check_sdk_surface_helpers import *

def main() -> int:
    args = parse_args()
    sdk_client = Path(args.sdk_client).expanduser().resolve() if args.sdk_client else None
    sdk_root = (
        Path(args.sdk_root).expanduser().resolve()
        if args.sdk_root
        else (sdk_client.parents[1] if sdk_client else DEFAULT_SDK_ROOT)
    )
    sdk_client = sdk_client or sdk_root / "src/client.ts"
    if sdk_client.name != "client.ts" or sdk_client.parent.name != "src":
        raise RuntimeError(f"sdk_client must point to agent-sdk src/client.ts: {sdk_client}")
    if sdk_client.parents[1] != sdk_root:
        raise RuntimeError(f"sdk_client {sdk_client} is not inside sdk_root {sdk_root}")
    installed_sdk = ROOT / "sidecar/node_modules/@arinova-ai/agent-sdk"
    sdk_client_source = sdk_client.read_text()
    sdk_readme_source = (sdk_root / "README.md").read_text()
    sdk_client_test_source = (sdk_root / "src/client.test.ts").read_text()
    sdk_types_test_source = (sdk_root / "src/types.test.ts").read_text()
    sdk_test_name_list = sdk_client_test_name_list(sdk_client_test_source)
    sdk_test_names = set(sdk_test_name_list)
    sdk_test_inventory_missing = sorted(EXPECTED_SDK_CLIENT_TEST_NAMES - sdk_test_names)
    sdk_test_inventory_new = sorted(sdk_test_names - EXPECTED_SDK_CLIENT_TEST_NAMES)
    sdk_test_inventory_duplicates = duplicate_values(sdk_test_name_list)
    sdk_types_test_name_list = sdk_client_test_name_list(sdk_types_test_source)
    sdk_types_test_names = set(sdk_types_test_name_list)
    sdk_types_test_inventory_missing = sorted(EXPECTED_SDK_TYPES_TEST_NAMES - sdk_types_test_names)
    sdk_types_test_inventory_new = sorted(sdk_types_test_names - EXPECTED_SDK_TYPES_TEST_NAMES)
    sdk_types_test_inventory_duplicates = duplicate_values(sdk_types_test_name_list)
    sdk_types_action_context_test_missing = sorted(EXPECTED_SDK_TYPES_ACTION_CONTEXT_TEST_NAMES - sdk_types_test_names)
    sdk_types_action_result_test_missing = sorted(EXPECTED_SDK_TYPES_ACTION_RESULT_TEST_NAMES - sdk_types_test_names)
    sdk_types_upload_attachment_test_missing = sorted(EXPECTED_SDK_TYPES_UPLOAD_ATTACHMENT_TEST_NAMES - sdk_types_test_names)
    sdk_types_task_context_helper_test_missing = sorted(
        EXPECTED_SDK_TYPES_TASK_CONTEXT_HELPER_TEST_NAMES - sdk_types_test_names
    )
    sdk_readme_method_heading_names = sdk_readme_method_heading_list(sdk_readme_source)
    sdk_readme_method_headings = set(sdk_readme_method_heading_names)
    sdk_readme_method_heading_missing = sorted(EXPECTED_SDK_README_METHOD_HEADINGS - sdk_readme_method_headings)
    sdk_readme_method_heading_new = sorted(sdk_readme_method_headings - EXPECTED_SDK_README_METHOD_HEADINGS)
    sdk_readme_method_heading_duplicates = duplicate_values(sdk_readme_method_heading_names)
    sdk_readme_lifecycle_method_missing = sorted(
        EXPECTED_SDK_README_LIFECYCLE_METHOD_HEADINGS - sdk_readme_method_headings
    )
    sdk_readme_message_file_method_missing = sorted(
        EXPECTED_SDK_README_MESSAGE_FILE_METHOD_HEADINGS - sdk_readme_method_headings
    )
    sdk_readme_note_method_missing = sorted(
        EXPECTED_SDK_README_NOTE_METHOD_HEADINGS - sdk_readme_method_headings
    )
    sdk_readme_kanban_method_missing = sorted(
        EXPECTED_SDK_README_KANBAN_METHOD_HEADINGS - sdk_readme_method_headings
    )
    sdk_readme_memory_method_missing = sorted(
        EXPECTED_SDK_README_MEMORY_METHOD_HEADINGS - sdk_readme_method_headings
    )
    sdk_readme_type_symbol_names = sdk_readme_type_symbol_list(sdk_readme_source)
    sdk_readme_type_symbols = set(sdk_readme_type_symbol_names)
    sdk_readme_type_symbol_missing = sorted(EXPECTED_SDK_README_TYPE_SYMBOLS - sdk_readme_type_symbols)
    sdk_readme_type_symbol_new = sorted(sdk_readme_type_symbols - EXPECTED_SDK_README_TYPE_SYMBOLS)
    sdk_readme_type_symbol_duplicates = duplicate_values(sdk_readme_type_symbol_names)
    sdk_readme_kanban_type_missing = sorted(EXPECTED_SDK_README_KANBAN_TYPE_SYMBOLS - sdk_readme_type_symbols)
    sdk_readme_note_memory_type_missing = sorted(
        EXPECTED_SDK_README_NOTE_MEMORY_TYPE_SYMBOLS - sdk_readme_type_symbols
    )
    sdk_readme_option_name_list_value = sdk_readme_option_name_list(sdk_readme_source)
    sdk_readme_option_names = set(sdk_readme_option_name_list_value)
    sdk_readme_option_name_missing = sorted(EXPECTED_SDK_README_OPTION_NAMES - sdk_readme_option_names)
    sdk_readme_option_name_new = sorted(sdk_readme_option_names - EXPECTED_SDK_README_OPTION_NAMES)
    sdk_readme_option_name_duplicates = duplicate_values(sdk_readme_option_name_list_value)
    sdk_readme_auth_option_missing = sorted(EXPECTED_SDK_README_AUTH_OPTION_NAMES - sdk_readme_option_names)
    sdk_readme_timing_option_missing = sorted(EXPECTED_SDK_README_TIMING_OPTION_NAMES - sdk_readme_option_names)
    sdk_readme_task_context_item_names = sdk_readme_task_context_item_list(sdk_readme_source)
    sdk_readme_task_context_items = set(sdk_readme_task_context_item_names)
    sdk_readme_task_context_item_missing = sorted(
        EXPECTED_SDK_README_TASK_CONTEXT_ITEMS - sdk_readme_task_context_items
    )
    sdk_readme_task_context_item_new = sorted(
        sdk_readme_task_context_items - EXPECTED_SDK_README_TASK_CONTEXT_ITEMS
    )
    sdk_readme_task_context_item_duplicates = duplicate_values(sdk_readme_task_context_item_names)
    sdk_readme_task_context_field_item_missing = sorted(
        EXPECTED_SDK_README_TASK_CONTEXT_FIELD_ITEMS - sdk_readme_task_context_items
    )
    sdk_readme_task_context_reply_item_missing = sorted(
        EXPECTED_SDK_README_TASK_CONTEXT_REPLY_ITEMS - sdk_readme_task_context_items
    )
    sdk_client_http_validation_test_missing = sorted(EXPECTED_SDK_CLIENT_HTTP_VALIDATION_TEST_NAMES - sdk_test_names)
    sdk_client_task_scheduling_test_missing = sorted(EXPECTED_SDK_CLIENT_TASK_SCHEDULING_TEST_NAMES - sdk_test_names)
    sdk_client_reconnect_buffer_test_missing = sorted(EXPECTED_SDK_CLIENT_RECONNECT_BUFFER_TEST_NAMES - sdk_test_names)
    sdk_client_task_action_test_missing = sorted(EXPECTED_SDK_CLIENT_TASK_ACTION_TEST_NAMES - sdk_test_names)
    sdk_client_no_conversation_test_missing = sorted(EXPECTED_SDK_CLIENT_NO_CONVERSATION_TEST_NAMES - sdk_test_names)
    sdk_client_auth_retry_test_missing = sorted(EXPECTED_SDK_CLIENT_AUTH_RETRY_TEST_NAMES - sdk_test_names)
    sdk_client_onboarding_test_missing = sorted(EXPECTED_SDK_CLIENT_ONBOARDING_TEST_NAMES - sdk_test_names)
    sdk_client_test_inventory_contract_count = len(EXPECTED_SDK_CLIENT_TEST_NAMES)
    sdk_client_test_uniqueness_contract_count = len(sdk_test_name_list)
    sdk_client_http_validation_test_contract_count = len(EXPECTED_SDK_CLIENT_HTTP_VALIDATION_TEST_NAMES)
    sdk_client_task_scheduling_test_contract_count = len(EXPECTED_SDK_CLIENT_TASK_SCHEDULING_TEST_NAMES)
    sdk_client_reconnect_buffer_test_contract_count = len(EXPECTED_SDK_CLIENT_RECONNECT_BUFFER_TEST_NAMES)
    sdk_client_task_action_test_contract_count = len(EXPECTED_SDK_CLIENT_TASK_ACTION_TEST_NAMES)
    sdk_client_no_conversation_test_contract_count = len(EXPECTED_SDK_CLIENT_NO_CONVERSATION_TEST_NAMES)
    sdk_client_auth_retry_test_contract_count = len(EXPECTED_SDK_CLIENT_AUTH_RETRY_TEST_NAMES)
    sdk_client_onboarding_test_contract_count = len(EXPECTED_SDK_CLIENT_ONBOARDING_TEST_NAMES)
    sdk_types_test_inventory_contract_count = len(EXPECTED_SDK_TYPES_TEST_NAMES)
    sdk_types_test_uniqueness_contract_count = len(sdk_types_test_name_list)
    sdk_types_action_context_test_contract_count = len(EXPECTED_SDK_TYPES_ACTION_CONTEXT_TEST_NAMES)
    sdk_types_action_result_test_contract_count = len(EXPECTED_SDK_TYPES_ACTION_RESULT_TEST_NAMES)
    sdk_types_upload_attachment_test_contract_count = len(EXPECTED_SDK_TYPES_UPLOAD_ATTACHMENT_TEST_NAMES)
    sdk_types_task_context_helper_test_contract_count = len(EXPECTED_SDK_TYPES_TASK_CONTEXT_HELPER_TEST_NAMES)
    sdk_readme_method_inventory_contract_count = len(EXPECTED_SDK_README_METHOD_HEADINGS)
    sdk_readme_method_uniqueness_contract_count = len(sdk_readme_method_heading_names)
    sdk_readme_lifecycle_method_contract_count = len(EXPECTED_SDK_README_LIFECYCLE_METHOD_HEADINGS)
    sdk_readme_message_file_method_contract_count = len(EXPECTED_SDK_README_MESSAGE_FILE_METHOD_HEADINGS)
    sdk_readme_note_method_contract_count = len(EXPECTED_SDK_README_NOTE_METHOD_HEADINGS)
    sdk_readme_kanban_method_contract_count = len(EXPECTED_SDK_README_KANBAN_METHOD_HEADINGS)
    sdk_readme_memory_method_contract_count = len(EXPECTED_SDK_README_MEMORY_METHOD_HEADINGS)
    sdk_readme_type_inventory_contract_count = len(EXPECTED_SDK_README_TYPE_SYMBOLS)
    sdk_readme_type_uniqueness_contract_count = len(sdk_readme_type_symbol_names)
    sdk_readme_kanban_type_contract_count = len(EXPECTED_SDK_README_KANBAN_TYPE_SYMBOLS)
    sdk_readme_note_memory_type_contract_count = len(EXPECTED_SDK_README_NOTE_MEMORY_TYPE_SYMBOLS)
    sdk_readme_option_inventory_contract_count = len(EXPECTED_SDK_README_OPTION_NAMES)
    sdk_readme_option_uniqueness_contract_count = len(sdk_readme_option_name_list_value)
    sdk_readme_auth_option_contract_count = len(EXPECTED_SDK_README_AUTH_OPTION_NAMES)
    sdk_readme_timing_option_contract_count = len(EXPECTED_SDK_README_TIMING_OPTION_NAMES)
    sdk_readme_task_context_inventory_contract_count = len(EXPECTED_SDK_README_TASK_CONTEXT_ITEMS)
    sdk_readme_task_context_uniqueness_contract_count = len(sdk_readme_task_context_item_names)
    sdk_readme_task_context_field_contract_count = len(EXPECTED_SDK_README_TASK_CONTEXT_FIELD_ITEMS)
    sdk_readme_task_context_reply_contract_count = len(EXPECTED_SDK_README_TASK_CONTEXT_REPLY_ITEMS)
    sdk_methods = public_agent_methods(sdk_client_source)
    sdk_method_order = [
        method for method in public_agent_method_list(sdk_client_source) if method not in INTENTIONALLY_LOCAL
    ]
    sdk_method_params = class_method_params(sdk_client_source, "export class ArinovaAgent")
    sdk_http_methods = class_methods_containing(sdk_client_source, "export class ArinovaAgent", "fetch(")
    sdk_method_required_counts = class_method_required_param_counts(
        sdk_client_source,
        "export class ArinovaAgent",
    )
    sdk_method_max_counts = class_method_max_param_counts(sdk_client_source, "export class ArinovaAgent")
    sdk_method_returns = class_method_returns(sdk_client_source, "export class ArinovaAgent")
    agent_param_contract_count = len(
        [method for method in sdk_methods - INTENTIONALLY_LOCAL if method in sdk_method_params]
    )
    sdk_package_version = package_version(sdk_root / "package.json")
    sdk_action_protocol = const_string_value(sdk_client_source, "ACTION_PROTOCOL_VERSION")
    sdk_auth_runtime_fields = object_literal_fields_after(sdk_client_source, "runtime: {")
    sdk_auth_runtime_values = object_literal_scalar_values_after(
        sdk_client_source,
        "runtime: {",
        {"SDK_VERSION": sdk_package_version},
    )
    sdk_auth_action_capability_fields = object_literal_fields_after(sdk_client_source, "actionCall: {")
    sdk_auth_action_capability_values = object_literal_scalar_values_after(
        sdk_client_source,
        "actionCall: {",
        {"ACTION_PROTOCOL_VERSION": sdk_action_protocol},
    )
    sdk_register_command_fields = object_literal_fields_after(
        sdk_client_source,
        "commands: this.skills.map((s) => (",
    )
    sdk_heartbeat_command_fields = object_literal_fields_after(
        sdk_client_source,
        'this.send({ type: "heartbeat_commands"',
    )
    sdk_runtime_frame_fields = {
        "agent_send": object_literal_fields_after(sdk_client_source, 'this.send({ type: "agent_send"'),
        "agent_telemetry": object_literal_fields_after(sdk_client_source, 'this.send({ type: "agent_telemetry"'),
        "hud_update": object_literal_fields_after(sdk_client_source, "const msg: Record<string, unknown> ="),
        "task_update": object_literal_fields_after(sdk_client_source, 'this.send({ type: "task_update"'),
        "tool_call_report": object_literal_fields_after(sdk_client_source, 'this.send({ type: "tool_call_report"'),
        "task_queued": object_literal_fields_after(sdk_client_source, 'this.send({\n        type: "task_queued"'),
        "agent_complete": object_literal_fields_after(sdk_client_source, 'this.sendTerminal({\n          type: "agent_complete"'),
        "agent_error": object_literal_fields_after(sdk_client_source, 'const payload: Record<string, unknown> = { type: "agent_error"'),
    }
    sdk_runtime_frame_fields["hud_update"].add("conversationId")
    if "options?.mentions" in sdk_client_source:
        sdk_runtime_frame_fields["agent_complete"].add("mentions")
    if 'payload.reason = "cancelled"' in sdk_client_source:
        sdk_runtime_frame_fields["agent_error"].add("reason")
    auth_frame_contract_count = 2
    command_frame_contract_count = 2
    runtime_frame_contract_count = len(sdk_runtime_frame_fields)
    sdk_types = (sdk_root / "src/types.ts").read_text()
    sdk_index = (sdk_root / "src/index.ts").read_text()
    sdk_skill_fields = interface_fields(sdk_types, "AgentSkill")
    sdk_option_fields = interface_fields(sdk_types, "ArinovaAgentOptions")
    sdk_readme_option_name_stale = sorted(sdk_readme_option_names - sdk_option_fields)
    sdk_runtime_info_fields = interface_fields(sdk_types, "AgentRuntimeInfo")
    sdk_action_option_fields = interface_fields(sdk_types, "ActionCallOptions")
    sdk_action_result_fields = interface_fields(sdk_types, "ActionCallResult")
    sdk_action_error_fields = interface_fields(sdk_types, "ActionErrorBody")
    sdk_action_confirmation_fields = interface_fields(sdk_types, "ActionConfirmationPayload")
    sdk_tool_report_fields = interface_fields(sdk_types, "ToolCallReport")
    sdk_task_attachment_fields = interface_fields(sdk_types, "TaskAttachment")
    sdk_upload_result_fields = interface_fields(sdk_types, "UploadResult")
    sdk_history_message_fields = interface_fields(sdk_types, "HistoryMessage")
    sdk_fetch_history_option_fields = interface_fields(sdk_types, "FetchHistoryOptions")
    sdk_fetch_history_result_fields = interface_fields(sdk_types, "FetchHistoryResult")
    sdk_note_fields = interface_fields(sdk_types, "Note")
    sdk_list_notes_option_fields = interface_fields(sdk_types, "ListNotesOptions")
    sdk_list_notes_result_fields = interface_fields(sdk_types, "ListNotesResult")
    sdk_create_note_body_fields = interface_fields(sdk_types, "CreateNoteBody")
    sdk_update_note_body_fields = interface_fields(sdk_types, "UpdateNoteBody")
    sdk_query_memory_option_fields = interface_fields(sdk_types, "QueryMemoryOptions")
    sdk_memory_entry_fields = interface_fields(sdk_types, "MemoryEntry")
    sdk_share_note_result_fields = interface_fields(sdk_types, "ShareNoteResult")
    sdk_skill_prompt_fields = interface_fields(sdk_types, "SkillPrompt")
    sdk_kanban_board_fields = interface_fields(sdk_types, "KanbanBoard")
    sdk_kanban_column_fields = interface_fields(sdk_types, "KanbanColumn")
    sdk_kanban_card_fields = interface_fields(sdk_types, "KanbanCard")
    sdk_list_boards_result_fields = interface_fields(sdk_types, "ListBoardsResult")
    sdk_kanban_label_fields = interface_fields(sdk_types, "KanbanLabel")
    sdk_create_board_body_fields = interface_fields(sdk_types, "CreateBoardBody")
    sdk_update_board_body_fields = interface_fields(sdk_types, "UpdateBoardBody")
    sdk_create_card_body_fields = interface_fields(sdk_types, "CreateCardBody")
    sdk_update_card_body_fields = interface_fields(sdk_types, "UpdateCardBody")
    sdk_create_column_body_fields = interface_fields(sdk_types, "CreateColumnBody")
    sdk_update_column_body_fields = interface_fields(sdk_types, "UpdateColumnBody")
    sdk_add_commit_body_fields = interface_fields(sdk_types, "AddCommitBody")
    sdk_create_label_body_fields = interface_fields(sdk_types, "CreateLabelBody")
    sdk_update_label_body_fields = interface_fields(sdk_types, "UpdateLabelBody")
    sdk_card_commit_fields = interface_fields(sdk_types, "CardCommit")
    sdk_card_note_fields = interface_fields(sdk_types, "CardNote")
    sdk_archived_cards_result_fields = interface_fields(sdk_types, "ArchivedCardsResult")
    sdk_token_claimed_fields = interface_fields(sdk_types, "TokenClaimedData")
    sdk_token_claimed_required_fields = interface_required_fields(sdk_types, "TokenClaimedData")
    sdk_onboarding_seed_fields = interface_fields(sdk_types, "OnboardingSeed")
    sdk_agent_events = type_alias_string_union(sdk_types, "AgentEvent")
    sdk_task_update_statuses = type_alias_discriminator_values(sdk_types, "TaskUpdateData", "status")
    sdk_action_result_statuses = interface_string_union_field(sdk_types, "ActionCallResult", "status")
    sdk_memory_origin_literals = type_alias_string_union(sdk_types, "MemoryOrigin")
    sdk_memory_origin_templates = type_alias_template_string_prefixes(sdk_types, "MemoryOrigin")
    sdk_onboarding_seed_kinds = interface_string_union_field(sdk_types, "OnboardingSeed", "kind")
    sdk_terminal_action_statuses = class_method_string_includes(
        sdk_client_source,
        "export class ArinovaAgent",
        "handleActionResult",
    )
    sdk_transient_action_statuses = sdk_action_result_statuses - sdk_terminal_action_statuses
    sdk_type_symbols = exported_type_symbols(sdk_types)
    sdk_type_alias_bodies = exported_type_alias_bodies(sdk_types)
    sdk_interface_fields = exported_interface_field_map(sdk_types)
    sdk_interface_required_fields = exported_interface_required_field_map(sdk_types)
    sdk_interface_shapes = exported_interface_shape_map(sdk_types)
    sdk_public_types = public_type_exports(sdk_index)
    sdk_public_values = public_value_exports(sdk_index)
    sdk_readme_type_symbol_stale = sorted(sdk_readme_type_symbols - sdk_type_symbols)
    installed_client_decl = (installed_sdk / "dist/client.d.ts").read_text()
    installed_client_js = (installed_sdk / "dist/client.js").read_text()
    installed_methods = declared_agent_methods(installed_client_decl)
    installed_method_params = class_method_params(installed_client_decl, "export declare class ArinovaAgent")
    installed_method_returns = class_method_returns(
        installed_client_decl,
        "export declare class ArinovaAgent",
    )
    installed_action_protocol = const_string_value(installed_client_js, "ACTION_PROTOCOL_VERSION")
    installed_types = (installed_sdk / "dist/types.d.ts").read_text()
    installed_index = (installed_sdk / "dist/index.d.ts").read_text()
    installed_skill_fields = interface_fields(installed_types, "AgentSkill")
    installed_option_fields = interface_fields(installed_types, "ArinovaAgentOptions")
    installed_runtime_info_fields = interface_fields(installed_types, "AgentRuntimeInfo")
    installed_action_option_fields = interface_fields(installed_types, "ActionCallOptions")
    installed_action_result_fields = interface_fields(installed_types, "ActionCallResult")
    installed_action_error_fields = interface_fields(installed_types, "ActionErrorBody")
    installed_action_confirmation_fields = interface_fields(installed_types, "ActionConfirmationPayload")
    installed_tool_report_fields = interface_fields(installed_types, "ToolCallReport")
    installed_task_attachment_fields = interface_fields(installed_types, "TaskAttachment")
    installed_upload_result_fields = interface_fields(installed_types, "UploadResult")
    installed_history_message_fields = interface_fields(installed_types, "HistoryMessage")
    installed_fetch_history_option_fields = interface_fields(installed_types, "FetchHistoryOptions")
    installed_fetch_history_result_fields = interface_fields(installed_types, "FetchHistoryResult")
    installed_note_fields = interface_fields(installed_types, "Note")
    installed_list_notes_option_fields = interface_fields(installed_types, "ListNotesOptions")
    installed_list_notes_result_fields = interface_fields(installed_types, "ListNotesResult")
    installed_create_note_body_fields = interface_fields(installed_types, "CreateNoteBody")
    installed_update_note_body_fields = interface_fields(installed_types, "UpdateNoteBody")
    installed_query_memory_option_fields = interface_fields(installed_types, "QueryMemoryOptions")
    installed_memory_entry_fields = interface_fields(installed_types, "MemoryEntry")
    installed_share_note_result_fields = interface_fields(installed_types, "ShareNoteResult")
    installed_skill_prompt_fields = interface_fields(installed_types, "SkillPrompt")
    installed_kanban_board_fields = interface_fields(installed_types, "KanbanBoard")
    installed_kanban_column_fields = interface_fields(installed_types, "KanbanColumn")
    installed_kanban_card_fields = interface_fields(installed_types, "KanbanCard")
    installed_list_boards_result_fields = interface_fields(installed_types, "ListBoardsResult")
    installed_kanban_label_fields = interface_fields(installed_types, "KanbanLabel")
    installed_create_board_body_fields = interface_fields(installed_types, "CreateBoardBody")
    installed_update_board_body_fields = interface_fields(installed_types, "UpdateBoardBody")
    installed_create_card_body_fields = interface_fields(installed_types, "CreateCardBody")
    installed_update_card_body_fields = interface_fields(installed_types, "UpdateCardBody")
    installed_create_column_body_fields = interface_fields(installed_types, "CreateColumnBody")
    installed_update_column_body_fields = interface_fields(installed_types, "UpdateColumnBody")
    installed_add_commit_body_fields = interface_fields(installed_types, "AddCommitBody")
    installed_create_label_body_fields = interface_fields(installed_types, "CreateLabelBody")
    installed_update_label_body_fields = interface_fields(installed_types, "UpdateLabelBody")
    installed_card_commit_fields = interface_fields(installed_types, "CardCommit")
    installed_card_note_fields = interface_fields(installed_types, "CardNote")
    installed_archived_cards_result_fields = interface_fields(installed_types, "ArchivedCardsResult")
    installed_token_claimed_fields = interface_fields(installed_types, "TokenClaimedData")
    installed_token_claimed_required_fields = interface_required_fields(installed_types, "TokenClaimedData")
    installed_onboarding_seed_fields = interface_fields(installed_types, "OnboardingSeed")
    installed_agent_events = type_alias_string_union(installed_types, "AgentEvent")
    installed_task_update_statuses = type_alias_discriminator_values(installed_types, "TaskUpdateData", "status")
    installed_task_update_variants = type_alias_object_variants(installed_types, "TaskUpdateData", "status")
    installed_action_result_statuses = interface_string_union_field(installed_types, "ActionCallResult", "status")
    installed_memory_origin_literals = type_alias_string_union(installed_types, "MemoryOrigin")
    installed_memory_origin_templates = type_alias_template_string_prefixes(installed_types, "MemoryOrigin")
    installed_onboarding_seed_kinds = interface_string_union_field(installed_types, "OnboardingSeed", "kind")
    installed_type_symbols = exported_type_symbols(installed_types)
    installed_type_alias_bodies = exported_type_alias_bodies(installed_types)
    installed_interface_fields = exported_interface_field_map(installed_types)
    installed_interface_required_fields = exported_interface_required_field_map(installed_types)
    installed_interface_shapes = exported_interface_shape_map(installed_types)
    installed_public_types = public_type_exports(installed_index)
    installed_public_values = public_value_exports(installed_index)
    plugin_source = (ROOT / "__init__.py").read_text()
    adapter_source = (ROOT / "adapter.py").read_text()
    local_check_source = (ROOT / "scripts/check_local.py").read_text()
    check_sdk_surface_source = (ROOT / "scripts/check_sdk_surface.py").read_text()
    agent_sdk_source_check_source = (ROOT / "scripts/check_agent_sdk_source.py").read_text()
    arinova_tools_check_source = "\n".join(
        (
            (ROOT / "scripts/check_arinova_tools.py").read_text(),
            (ROOT / "scripts/check_arinova_tools_helpers.py").read_text(),
        )
    )
    clean_install_source = (ROOT / "scripts/check_clean_install.py").read_text()
    user_install_source = (ROOT / "scripts/check_user_install.py").read_text()
    gateway_config_source = (ROOT / "scripts/check_gateway_config_load.py").read_text()
    hermes_plugin_load_source = "\n".join(
        (
            (ROOT / "scripts/check_hermes_plugin_load.py").read_text(),
            (ROOT / "scripts/check_hermes_plugin_load_helpers.py").read_text(),
        )
    )
    live_connection_source = (ROOT / "scripts/check_live_connection.py").read_text()
    live_connection_gate_source = "\n".join(
        (
            (ROOT / "scripts/check_live_connection_gate.py").read_text(),
            (ROOT / "scripts/check_live_connection_gate_helpers.py").read_text(),
            (ROOT / "scripts/check_live_connection_gate_fake_hermes.py").read_text(),
        )
    )
    readme_source = (ROOT / "README.md").read_text()
    sidecar_source = (ROOT / "sidecar/runtime.mjs").read_text()
    sidecar_index_source = (ROOT / "sidecar/index.mjs").read_text()
    sidecar_runtime_check_source = "\n".join(
        (
            (ROOT / "sidecar/check-runtime.mjs").read_text(),
            (ROOT / "sidecar/check-runtime-fixtures.mjs").read_text(),
        )
    )
    sidecar_e2e_check_source = "\n".join(
        (
            (ROOT / "sidecar/check-sdk-e2e.mjs").read_text(),
            (ROOT / "sidecar/check-sdk-e2e-fixtures.mjs").read_text(),
        )
    )
    sidecar_http_check_source = "\n".join(
        (
            (ROOT / "sidecar/check-sdk-http.mjs").read_text(),
            (ROOT / "sidecar/check-sdk-http-fixtures.mjs").read_text(),
        )
    )
    live_validator_field_drift = {}
    for field_set_name, interface_name in {
        "KANBAN_BOARD_FIELDS": "KanbanBoard",
        "KANBAN_CARD_FIELDS": "KanbanCard",
        "KANBAN_COLUMN_FIELDS": "KanbanColumn",
        "KANBAN_LABEL_FIELDS": "KanbanLabel",
        "TASK_ATTACHMENT_FIELDS": "TaskAttachment",
        "UPLOAD_RESULT_FIELDS": "UploadResult",
        "HISTORY_MESSAGE_FIELDS": "HistoryMessage",
        "MEMORY_ENTRY_FIELDS": "MemoryEntry",
        "SKILL_PROMPT_FIELDS": "SkillPrompt",
        "NOTE_FIELDS": "Note",
        "CARD_COMMIT_FIELDS": "CardCommit",
        "CARD_NOTE_FIELDS": "CardNote",
        "SHARE_NOTE_RESULT_FIELDS": "ShareNoteResult",
        "ONBOARDING_SEED_FIELDS": "OnboardingSeed",
    }.items():
        actual_fields = python_string_collection(live_connection_source, field_set_name)
        expected_fields = sdk_interface_fields.get(interface_name, set())
        if actual_fields != expected_fields:
            live_validator_field_drift[field_set_name] = {
                "expected": sorted(expected_fields),
                "actual": sorted(actual_fields),
                "interface": interface_name,
            }
    for field_set_name, interface_name in {
        "QUERY_MEMORY_OPTION_FIELDS": "QueryMemoryOptions",
        "LIST_NOTES_OPTION_FIELDS": "ListNotesOptions",
        "FETCH_HISTORY_OPTION_FIELDS": "FetchHistoryOptions",
        "CREATE_NOTE_BODY_FIELDS": "CreateNoteBody",
        "UPDATE_NOTE_BODY_FIELDS": "UpdateNoteBody",
        "CREATE_BOARD_BODY_FIELDS": "CreateBoardBody",
        "UPDATE_BOARD_BODY_FIELDS": "UpdateBoardBody",
        "CREATE_CARD_BODY_FIELDS": "CreateCardBody",
        "UPDATE_CARD_BODY_FIELDS": "UpdateCardBody",
        "CREATE_COLUMN_BODY_FIELDS": "CreateColumnBody",
        "UPDATE_COLUMN_BODY_FIELDS": "UpdateColumnBody",
        "ADD_COMMIT_BODY_FIELDS": "AddCommitBody",
        "CREATE_LABEL_BODY_FIELDS": "CreateLabelBody",
        "UPDATE_LABEL_BODY_FIELDS": "UpdateLabelBody",
        "TOOL_CALL_REPORT_FIELDS": "ToolCallReport",
        "ACTION_CALL_OPTION_FIELDS": "ActionCallOptions",
        "ACTION_ERROR_FIELDS": "ActionErrorBody",
        "ACTION_CONFIRMATION_FIELDS": "ActionConfirmationPayload",
        "ACTION_CALL_RESULT_FIELDS": "ActionCallResult",
        "ONBOARDING_SEED_FIELDS": "OnboardingSeed",
    }.items():
        actual_fields = python_string_collection(live_connection_source, field_set_name)
        expected_fields = sdk_interface_fields.get(interface_name, set())
        if actual_fields != expected_fields:
            live_validator_field_drift[field_set_name] = {
                "expected": sorted(expected_fields),
                "actual": sorted(actual_fields),
                "interface": interface_name,
            }
    for field_set_name, method_name in {
        "LIST_CARDS_OPTION_FIELDS": "listCards",
        "LIST_ARCHIVED_CARDS_OPTION_FIELDS": "listArchivedCards",
    }.items():
        actual_fields = python_string_collection(live_connection_source, field_set_name)
        expected_fields = method_inline_object_param_fields(
            sdk_client_source,
            "export class ArinovaAgent",
            method_name,
            "options",
        )
        if actual_fields != expected_fields:
            live_validator_field_drift[field_set_name] = {
                "expected": sorted(expected_fields),
                "actual": sorted(actual_fields),
                "interface": f"{method_name} options",
            }
    for status_set_name, expected_statuses, interface_name in (
        ("ACTION_STATUSES", sdk_action_result_statuses, "ActionCallResult.status"),
        ("TERMINAL_ACTION_STATUSES", sdk_terminal_action_statuses, "handleActionResult terminal statuses"),
    ):
        actual_statuses = python_string_collection(live_connection_source, status_set_name)
        if actual_statuses != expected_statuses:
            live_validator_field_drift[status_set_name] = {
                "expected": sorted(expected_statuses),
                "actual": sorted(actual_statuses),
                "interface": interface_name,
            }
    live_validator_field_set_contract_count = 35
    live_validator_status_set_contract_count = 2
    live_validator_field_usage_drift = {}
    live_validator_field_shape_drift = {}
    live_validator_mappings = {
        "KANBAN_BOARD_FIELDS": "_sdk_kanban_board",
        "KANBAN_CARD_FIELDS": "_sdk_kanban_card",
        "KANBAN_COLUMN_FIELDS": "_sdk_kanban_column",
        "KANBAN_LABEL_FIELDS": "_sdk_kanban_label",
        "TASK_ATTACHMENT_FIELDS": "_sdk_task_attachment",
        "UPLOAD_RESULT_FIELDS": "_sdk_upload_result",
        "HISTORY_MESSAGE_FIELDS": "_sdk_history_message",
        "MEMORY_ENTRY_FIELDS": "_sdk_memory_entry",
        "SKILL_PROMPT_FIELDS": "_sdk_skill_prompt",
        "NOTE_FIELDS": "_sdk_note",
        "CARD_COMMIT_FIELDS": "_sdk_card_commit",
        "CARD_NOTE_FIELDS": "_sdk_card_note",
        "SHARE_NOTE_RESULT_FIELDS": "_sdk_share_note_result",
        "QUERY_MEMORY_OPTION_FIELDS": "_sdk_query_memory_options",
        "LIST_CARDS_OPTION_FIELDS": "_sdk_list_cards_options",
        "LIST_NOTES_OPTION_FIELDS": "_sdk_list_notes_options",
        "LIST_ARCHIVED_CARDS_OPTION_FIELDS": "_sdk_list_archived_cards_options",
        "FETCH_HISTORY_OPTION_FIELDS": "_sdk_fetch_history_options",
        "CREATE_NOTE_BODY_FIELDS": "_sdk_create_note_body",
        "UPDATE_NOTE_BODY_FIELDS": "_sdk_update_note_body",
        "CREATE_BOARD_BODY_FIELDS": "_sdk_create_board_body",
        "UPDATE_BOARD_BODY_FIELDS": "_sdk_update_board_body",
        "CREATE_CARD_BODY_FIELDS": "_sdk_create_card_body",
        "UPDATE_CARD_BODY_FIELDS": "_sdk_update_card_body",
        "CREATE_COLUMN_BODY_FIELDS": "_sdk_create_column_body",
        "UPDATE_COLUMN_BODY_FIELDS": "_sdk_update_column_body",
        "ADD_COMMIT_BODY_FIELDS": "_sdk_add_commit_body",
        "CREATE_LABEL_BODY_FIELDS": "_sdk_create_label_body",
        "UPDATE_LABEL_BODY_FIELDS": "_sdk_update_label_body",
        "TOOL_CALL_REPORT_FIELDS": "_sdk_tool_call_report",
        "ACTION_CALL_OPTION_FIELDS": "_sdk_action_call_options",
        "ACTION_ERROR_FIELDS": "_sdk_action_error",
        "ACTION_CONFIRMATION_FIELDS": "_sdk_action_confirmation",
        "ACTION_CALL_RESULT_FIELDS": "_sdk_action_call_result",
        "ONBOARDING_SEED_FIELDS": "_sdk_onboarding_seed",
    }
    live_validator_kanban_field_sets = {
        "KANBAN_BOARD_FIELDS",
        "KANBAN_CARD_FIELDS",
        "KANBAN_COLUMN_FIELDS",
        "KANBAN_LABEL_FIELDS",
        "CARD_COMMIT_FIELDS",
        "CARD_NOTE_FIELDS",
    }
    live_validator_note_memory_field_sets = {
        "NOTE_FIELDS",
        "MEMORY_ENTRY_FIELDS",
        "SKILL_PROMPT_FIELDS",
        "SHARE_NOTE_RESULT_FIELDS",
        "ONBOARDING_SEED_FIELDS",
    }
    live_validator_file_history_field_sets = {
        "TASK_ATTACHMENT_FIELDS",
        "UPLOAD_RESULT_FIELDS",
        "HISTORY_MESSAGE_FIELDS",
    }
    live_validator_input_field_sets = {
        "QUERY_MEMORY_OPTION_FIELDS",
        "LIST_CARDS_OPTION_FIELDS",
        "LIST_NOTES_OPTION_FIELDS",
        "LIST_ARCHIVED_CARDS_OPTION_FIELDS",
        "FETCH_HISTORY_OPTION_FIELDS",
        "CREATE_NOTE_BODY_FIELDS",
        "UPDATE_NOTE_BODY_FIELDS",
        "CREATE_BOARD_BODY_FIELDS",
        "UPDATE_BOARD_BODY_FIELDS",
        "CREATE_CARD_BODY_FIELDS",
        "UPDATE_CARD_BODY_FIELDS",
        "CREATE_COLUMN_BODY_FIELDS",
        "UPDATE_COLUMN_BODY_FIELDS",
        "ADD_COMMIT_BODY_FIELDS",
        "CREATE_LABEL_BODY_FIELDS",
        "UPDATE_LABEL_BODY_FIELDS",
        "TOOL_CALL_REPORT_FIELDS",
    }
    live_validator_action_field_sets = {
        "ACTION_CALL_OPTION_FIELDS",
        "ACTION_ERROR_FIELDS",
        "ACTION_CONFIRMATION_FIELDS",
        "ACTION_CALL_RESULT_FIELDS",
    }
    live_validator_category_drift = {
        "kanban": sorted(live_validator_kanban_field_sets - set(live_validator_mappings)),
        "note/memory": sorted(live_validator_note_memory_field_sets - set(live_validator_mappings)),
        "file/history": sorted(live_validator_file_history_field_sets - set(live_validator_mappings)),
        "input": sorted(live_validator_input_field_sets - set(live_validator_mappings)),
        "action": sorted(live_validator_action_field_sets - set(live_validator_mappings)),
    }
    live_validator_category_drift = {
        category: missing for category, missing in live_validator_category_drift.items() if missing
    }
    live_validator_contract_count = len(live_validator_mappings)
    live_validator_field_usage_contract_count = len(live_validator_mappings)
    live_validator_kanban_contract_count = len(live_validator_kanban_field_sets)
    live_validator_note_memory_contract_count = len(live_validator_note_memory_field_sets)
    live_validator_file_history_contract_count = len(live_validator_file_history_field_sets)
    live_validator_input_contract_count = len(live_validator_input_field_sets)
    live_validator_action_contract_count = len(live_validator_action_field_sets)
    for field_set_name, validator_name in live_validator_mappings.items():
        validator_body = python_function_body(live_connection_source, validator_name)
        if field_set_name in validator_body:
            missing_field_refs = []
        else:
            missing_field_refs = sorted(
                field
                for field in python_string_collection(live_connection_source, field_set_name)
                if f'"{field}"' not in validator_body and f"'{field}'" not in validator_body
            )
            if missing_field_refs:
                live_validator_field_usage_drift[field_set_name] = {
                    "validator": validator_name,
                    "missing": missing_field_refs,
                }
        interface_name = {
            "KANBAN_BOARD_FIELDS": "KanbanBoard",
            "KANBAN_CARD_FIELDS": "KanbanCard",
            "KANBAN_COLUMN_FIELDS": "KanbanColumn",
            "KANBAN_LABEL_FIELDS": "KanbanLabel",
            "TASK_ATTACHMENT_FIELDS": "TaskAttachment",
            "UPLOAD_RESULT_FIELDS": "UploadResult",
            "HISTORY_MESSAGE_FIELDS": "HistoryMessage",
            "MEMORY_ENTRY_FIELDS": "MemoryEntry",
            "SKILL_PROMPT_FIELDS": "SkillPrompt",
            "NOTE_FIELDS": "Note",
            "CARD_COMMIT_FIELDS": "CardCommit",
            "CARD_NOTE_FIELDS": "CardNote",
            "SHARE_NOTE_RESULT_FIELDS": "ShareNoteResult",
            "ONBOARDING_SEED_FIELDS": "OnboardingSeed",
            "TOOL_CALL_REPORT_FIELDS": "ToolCallReport",
            "ACTION_ERROR_FIELDS": "ActionErrorBody",
            "ACTION_CONFIRMATION_FIELDS": "ActionConfirmationPayload",
            "ACTION_CALL_RESULT_FIELDS": "ActionCallResult",
        }.get(field_set_name)
        if interface_name and not missing_field_refs:
            missing_shapes = live_validator_shape_missing(
                validator_body,
                field_set_name=field_set_name,
                expected_shapes=sdk_interface_shapes.get(interface_name, {}),
                required_fields=sdk_interface_required_fields.get(interface_name, set()),
            )
            if missing_shapes:
                live_validator_field_shape_drift[field_set_name] = {
                    "validator": validator_name,
                    "missing": missing_shapes,
                    "interface": interface_name,
                }
    live_validator_shape_contract_count = 17
    http_query_option_specs = (
        (
            "fetchHistory query params",
            sdk_interface_fields.get("FetchHistoryOptions", set()),
            "Object.fromEntries(searchParams(pagedHistoryRequest))",
        ),
        (
            "listNotes query params",
            sdk_interface_fields.get("ListNotesOptions", set()),
            'Object.fromEntries(searchParams(requestFor("GET", "/api/v1/notes")))',
        ),
        (
            "listCards query params",
            method_inline_object_param_fields(
                sdk_client_source,
                "export class ArinovaAgent",
                "listCards",
                "options",
            ),
            'Object.fromEntries(searchParams(requestFor("GET", "/api/v1/kanban/cards")))',
        ),
        (
            "listArchivedCards query params",
            method_inline_object_param_fields(
                sdk_client_source,
                "export class ArinovaAgent",
                "listArchivedCards",
                "options",
            ),
            'Object.fromEntries(searchParams(requestFor("GET", "/api/v1/kanban/boards/board-1/archived-cards")))',
        ),
        (
            "queryMemory query params",
            {"q" if field == "query" else field for field in sdk_interface_fields.get("QueryMemoryOptions", set())},
            'Object.fromEntries(searchParams(requestFor("GET", "/api/v1/memories/search")))',
        ),
    )
    http_query_option_contract_count = len(http_query_option_specs)
    http_query_option_field_contract_count = sum(len(expected_fields) for _label, expected_fields, _marker in http_query_option_specs)
    http_query_option_field_drift = {}
    for label, expected_fields, marker in http_query_option_specs:
        actual_fields = object_literal_fields_after(sidecar_http_check_source, marker)
        if actual_fields != expected_fields:
            http_query_option_field_drift[label] = {
                "expected": sorted(expected_fields),
                "actual": sorted(actual_fields),
            }
    auth_protocol_coverage_drift = (
        not sdk_action_protocol
        or f'protocolVersion: "{sdk_action_protocol}"' not in sidecar_e2e_check_source
    )
    auth_protocol_contract_count = 1
    e2e_auth_runtime_fields = object_literal_fields_after(sidecar_e2e_check_source, "auth.runtime, {")
    e2e_auth_runtime_values = object_literal_scalar_values_after(
        sidecar_e2e_check_source,
        "auth.runtime, {",
        {"sdkPackage.version": sdk_package_version},
    )
    e2e_auth_action_capability_fields = object_literal_fields_after(sidecar_e2e_check_source, "actionCall: {")
    e2e_auth_action_capability_values = object_literal_scalar_values_after(
        sidecar_e2e_check_source,
        "actionCall: {",
    )
    e2e_register_command_fields = object_literal_fields_after(sidecar_e2e_check_source, "commands: [")
    e2e_heartbeat_command_fields = object_literal_fields_after(sidecar_e2e_check_source, "commandHeartbeat, {")
    e2e_runtime_frame_fields = {
        "agent_send": object_literal_fields_after(sidecar_e2e_check_source, 'message.type === "agent_send"), {'),
        "agent_telemetry": object_literal_fields_after(
            sidecar_e2e_check_source,
            'message.type === "agent_telemetry"), {',
        ),
        "hud_update": object_literal_fields_after(sidecar_e2e_check_source, 'message.type === "hud_update"), {'),
        "task_update": object_literal_fields_after(sidecar_e2e_check_source, 'message.type === "task_update"), {'),
        "tool_call_report": object_literal_fields_after(sidecar_e2e_check_source, 'message.type === "tool_call_report"), {'),
        "task_queued": object_literal_fields_after(sidecar_e2e_check_source, "assert.deepEqual(queued, {"),
        "agent_complete": object_literal_fields_after(sidecar_e2e_check_source, "assert.deepEqual(complete, {"),
        "agent_error": object_literal_fields_after(sidecar_e2e_check_source, "assert.deepEqual(endpointCancelError, {"),
    }
    live_agent_sdk_calls = python_call_first_string_args(
        live_connection_source,
        "call_agent_sdk",
    ) | python_call_string_args(live_connection_source, "_expect_sdk_void", arg_index=1)
    python_task_handler_check_calls = python_call_first_string_args(arinova_tools_check_source, "_task_handler")
    exposed = sidecar_agent_methods(sidecar_source)
    sidecar_ordered = sidecar_agent_method_list(sidecar_source)
    exposed_task = sidecar_task_methods(sidecar_source)
    sidecar_task_ordered = sidecar_task_method_list(sidecar_source)
    tools_source = (ROOT / "arinova_tools.py").read_text()
    python_exposed = python_agent_methods(tools_source)
    python_task_exposed = python_task_methods(tools_source)
    python_ordered = python_agent_method_list(tools_source)
    python_task_ordered = python_task_method_list(tools_source)
    python_void_agent_methods = python_string_collection(arinova_tools_check_source, "VOID_AGENT_METHODS")
    adapter_void_agent_methods = python_string_collection(adapter_source, "VOID_AGENT_METHODS")
    sdk_void_agent_methods = {
        method
        for method, return_type in sdk_method_returns.items()
        if method not in INTENTIONALLY_LOCAL and return_type in {"Promise<void>", "void"}
    }
    sdk_agent_return_methods = {
        method for method in sdk_methods - INTENTIONALLY_LOCAL if method in sdk_method_returns
    }
    sdk_void_return_methods = {
        method
        for method in sdk_agent_return_methods
        if sdk_method_returns.get(method) in {"Promise<void>", "void"}
    }
    sdk_nullable_return_methods = {
        method
        for method in sdk_agent_return_methods
        if sdk_method_returns.get(method, "").endswith("| null")
    }
    sdk_array_return_methods = {
        method
        for method in sdk_agent_return_methods
        if re.match(r"^Promise<[^>]+\[]>$", sdk_method_returns.get(method, ""))
    }
    sdk_object_return_methods = (
        sdk_agent_return_methods
        - sdk_void_return_methods
        - sdk_nullable_return_methods
        - sdk_array_return_methods
    )
    sdk_return_shape_category_members = (
        sdk_void_return_methods | sdk_nullable_return_methods | sdk_array_return_methods | sdk_object_return_methods
    )
    sdk_return_shape_category_drift = {}
    if sdk_agent_return_methods - sdk_return_shape_category_members:
        sdk_return_shape_category_drift["uncategorized"] = sorted(
            sdk_agent_return_methods - sdk_return_shape_category_members
        )
    if sdk_return_shape_category_members - sdk_agent_return_methods:
        sdk_return_shape_category_drift["stale"] = sorted(
            sdk_return_shape_category_members - sdk_agent_return_methods
        )
    sdk_void_return_contract_count = len(sdk_void_return_methods)
    sdk_nullable_return_contract_count = len(sdk_nullable_return_methods)
    sdk_array_return_contract_count = len(sdk_array_return_methods)
    sdk_object_return_contract_count = len(sdk_object_return_methods)
    agent_return_contract_count = len(
        sdk_agent_return_methods
    )
    arinova_tools_path = ROOT / "arinova_tools.py"
    python_named_args = python_arg_specs(tools_source, "ARG_SPECS")
    python_task_named_args = python_arg_specs(tools_source, "TASK_ARG_SPECS")
    python_agent_arg_types = python_arg_type_map(tools_source, "ARG_SPECS")
    python_task_arg_types = python_arg_type_map(tools_source, "TASK_ARG_SPECS")
    sidecar_agent_arg_types = sidecar_arg_type_map(sidecar_source, "agentArgTypes")
    sidecar_task_arg_types = sidecar_arg_type_map(sidecar_source, "taskArgTypes")
    sidecar_agent_arg_type_drift = {
        method: expected
        for method, expected in sorted(python_agent_arg_types.items())
        if sidecar_agent_arg_types.get(method) != expected
    }
    sidecar_task_arg_type_drift = {
        method: expected
        for method, expected in sorted(python_task_arg_types.items())
        if sidecar_task_arg_types.get(method) != expected
    }
    sidecar_agent_arg_type_stale = sorted(set(sidecar_agent_arg_types) - set(python_agent_arg_types))
    sidecar_task_arg_type_stale = sorted(set(sidecar_task_arg_types) - set(python_task_arg_types))
    sidecar_agent_arg_names = sidecar_arg_name_map(sidecar_source, "agentArgNames")
    sidecar_task_arg_names = sidecar_arg_name_map(sidecar_source, "taskArgNames")
    sidecar_agent_arg_name_drift = {
        method: expected
        for method, expected in sorted(python_named_args.items())
        if expected and sidecar_agent_arg_names.get(method) != expected
    }
    sidecar_task_arg_name_drift = {
        method: expected
        for method, expected in sorted(python_task_named_args.items())
        if expected and sidecar_task_arg_names.get(method) != expected
    }
    sidecar_agent_arg_name_stale = sorted(set(sidecar_agent_arg_names) - {method for method, args in python_named_args.items() if args})
    sidecar_task_arg_name_stale = sorted(set(sidecar_task_arg_names) - {method for method, args in python_task_named_args.items() if args})
    sidecar_agent_arg_name_contract_count = len(sidecar_agent_arg_names)
    sidecar_task_arg_name_contract_count = len(sidecar_task_arg_names)
    python_agent_arg_schemas = python_structured_arg_schema_map(tools_source, "ARG_SPECS")
    python_task_arg_schemas = python_structured_arg_schema_map(tools_source, "TASK_ARG_SPECS")
    sidecar_agent_arg_schemas = sidecar_arg_schema_map(sidecar_source, "agentArgSchemas")
    sidecar_task_arg_schemas = sidecar_arg_schema_map(sidecar_source, "taskArgSchemas")
    sidecar_agent_arg_schema_drift = {
        method: expected
        for method, expected in sorted(python_agent_arg_schemas.items())
        if sidecar_agent_arg_schemas.get(method) != expected
    }
    sidecar_task_arg_schema_drift = {
        method: expected
        for method, expected in sorted(python_task_arg_schemas.items())
        if sidecar_task_arg_schemas.get(method) != expected
    }
    sidecar_agent_arg_schema_stale = sorted(set(sidecar_agent_arg_schemas) - set(python_agent_arg_schemas))
    sidecar_task_arg_schema_stale = sorted(set(sidecar_task_arg_schemas) - set(python_task_arg_schemas))
    python_direct_arg_type_validation_missing = sorted(
        (
            python_direct_arg_type_validation_errors(tools_source, "ARG_SPECS")
            | python_direct_arg_type_validation_errors(tools_source, "TASK_ARG_SPECS")
        )
        - {error for error in re.findall(r'"error": "([^"]+)"', arinova_tools_check_source)}
    )
    python_positional_arg_type_validation_missing = sorted(
        (
            python_positional_arg_type_validation_errors(tools_source, "ARG_SPECS")
            | python_positional_arg_type_validation_errors(tools_source, "TASK_ARG_SPECS")
        )
        - {error for error in re.findall(r'"error": "([^"]+)"', arinova_tools_check_source)}
    )
    python_direct_helper_validation_contract_missing = (
        'validated_args = _validate_positional_args(method, args, task_scoped=False)' not in tools_source
        or 'validated_args = _validate_positional_args(method, args, task_scoped=True)' not in tools_source
        or 'direct_bad_agent_args = await arinova_tools.call_agent_method("sendMessage", ["conv-direct-only"])'
        not in arinova_tools_check_source
        or 'direct_bad_agent_shape = await arinova_tools.call_agent_method("createCard", ["not-an-object"])'
        not in arinova_tools_check_source
        or 'direct_bad_task_args = await arinova_tools.call_task_method("task-1", "callAction", ["task.action"])'
        not in arinova_tools_check_source
        or 'direct_bad_task_shape = await arinova_tools.call_task_method("task-1", "fetchHistory", ["not-an-object"])'
        not in arinova_tools_check_source
    )
    python_direct_helper_validation_contract_count = 6
    python_required_arg_counts = python_module_value(arinova_tools_path, "REQUIRED_ARG_COUNTS")
    python_task_required_arg_counts = python_module_value(arinova_tools_path, "TASK_REQUIRED_ARG_COUNTS")
    python_agent_schema_arg_bounds = python_method_schema_arg_bounds(arinova_tools_path)
    python_task_schema_arg_bounds = python_method_schema_arg_bounds(arinova_tools_path, task_scoped=True)
    python_method_descriptions = python_dict_keys(tools_source, "METHOD_DESCRIPTIONS")
    sdk_task_helpers = task_context_helpers(sdk_types)
    sdk_task_helper_order = task_context_helper_list(sdk_types)
    sdk_task_helper_params = task_context_helper_params(sdk_types)
    sdk_task_helper_required_counts = task_context_helper_required_param_counts(sdk_types)
    sdk_task_helper_max_counts = task_context_helper_max_param_counts(sdk_types)
    sdk_task_helper_returns = task_context_helper_returns(sdk_types)
    sdk_task_callable_params = task_context_callable_params(sdk_types)
    sdk_task_callable_returns = task_context_callable_returns(sdk_types)
    sdk_task_reply_callables = {"sendChunk", "sendComplete", "sendError"}
    sdk_task_sdk_helper_callables = set(sdk_task_helpers)
    sdk_task_callable_category_members = sdk_task_reply_callables | sdk_task_sdk_helper_callables
    sdk_task_callable_names = set(sdk_task_callable_params) | set(sdk_task_callable_returns)
    sdk_task_callable_category_drift = {}
    if sdk_task_callable_names - sdk_task_callable_category_members:
        sdk_task_callable_category_drift["uncategorized"] = sorted(
            sdk_task_callable_names - sdk_task_callable_category_members
        )
    if sdk_task_callable_category_members - sdk_task_callable_names:
        sdk_task_callable_category_drift["stale"] = sorted(
            sdk_task_callable_category_members - sdk_task_callable_names
        )
    sdk_task_reply_callable_contract_count = len(sdk_task_reply_callables & sdk_task_callable_names)
    sdk_task_sdk_helper_callable_contract_count = len(sdk_task_sdk_helper_callables & sdk_task_callable_names)
    task_param_contract_count = len(
        [method for method in sdk_task_helpers if method in sdk_task_helper_params]
    )
    sdk_task_required_param_helpers = {
        method
        for method in sdk_task_helpers
        if sdk_task_helper_required_counts.get(method, 0) > 0
    }
    sdk_task_optional_only_param_helpers = {
        method
        for method in sdk_task_helpers
        if method in sdk_task_helper_params and sdk_task_helper_required_counts.get(method, 0) == 0
    }
    sdk_task_param_arity_category_members = (
        sdk_task_required_param_helpers | sdk_task_optional_only_param_helpers
    )
    sdk_task_param_arity_category_drift = {}
    if sdk_task_helpers - sdk_task_param_arity_category_members:
        sdk_task_param_arity_category_drift["uncategorized"] = sorted(
            sdk_task_helpers - sdk_task_param_arity_category_members
        )
    if sdk_task_param_arity_category_members - sdk_task_helpers:
        sdk_task_param_arity_category_drift["stale"] = sorted(
            sdk_task_param_arity_category_members - sdk_task_helpers
        )
    sdk_task_required_param_helper_contract_count = len(sdk_task_required_param_helpers)
    sdk_task_optional_only_param_helper_contract_count = len(sdk_task_optional_only_param_helpers)
    sdk_task_return_helpers = {
        method for method in sdk_task_helpers if method in sdk_task_helper_returns
    }
    sdk_task_void_return_helpers = {
        method
        for method in sdk_task_return_helpers
        if sdk_task_helper_returns.get(method) in {"Promise<void>", "void"}
    }
    sdk_task_nullable_return_helpers = {
        method
        for method in sdk_task_return_helpers
        if sdk_task_helper_returns.get(method, "").endswith("| null")
    }
    sdk_task_array_return_helpers = {
        method
        for method in sdk_task_return_helpers
        if re.match(r"^Promise<[^>]+\[]>$", sdk_task_helper_returns.get(method, ""))
    }
    sdk_task_object_return_helpers = (
        sdk_task_return_helpers
        - sdk_task_void_return_helpers
        - sdk_task_nullable_return_helpers
        - sdk_task_array_return_helpers
    )
    sdk_task_return_shape_category_members = (
        sdk_task_void_return_helpers
        | sdk_task_nullable_return_helpers
        | sdk_task_array_return_helpers
        | sdk_task_object_return_helpers
    )
    sdk_task_return_shape_category_drift = {}
    if sdk_task_return_helpers - sdk_task_return_shape_category_members:
        sdk_task_return_shape_category_drift["uncategorized"] = sorted(
            sdk_task_return_helpers - sdk_task_return_shape_category_members
        )
    if sdk_task_return_shape_category_members - sdk_task_return_helpers:
        sdk_task_return_shape_category_drift["stale"] = sorted(
            sdk_task_return_shape_category_members - sdk_task_return_helpers
        )
    sdk_task_void_return_contract_count = len(sdk_task_void_return_helpers)
    sdk_task_nullable_return_contract_count = len(sdk_task_nullable_return_helpers)
    sdk_task_array_return_contract_count = len(sdk_task_array_return_helpers)
    sdk_task_object_return_contract_count = len(sdk_task_object_return_helpers)
    task_return_contract_count = len(
        sdk_task_return_helpers
    )
    sdk_task_field_shapes = task_context_data_shapes(sdk_types)
    sdk_readme_method_heading_stale = sorted(
        heading
        for heading in sdk_readme_method_headings
        if (
            heading.startswith("agent.")
            and heading.removeprefix("agent.") not in sdk_methods
        )
        or (
            heading.startswith("task.")
            and heading.removeprefix("task.") not in sdk_task_helpers
        )
    )
    installed_task_helpers = task_context_helpers(installed_types)
    installed_task_helper_params = task_context_helper_params(installed_types)
    installed_task_helper_returns = task_context_helper_returns(installed_types)
    installed_task_callable_params = task_context_callable_params(installed_types)
    installed_task_callable_returns = task_context_callable_returns(installed_types)
    sdk_task_fields = task_context_data_fields(sdk_types)
    sdk_readme_task_context_item_stale = sorted(
        item
        for item in sdk_readme_task_context_items
        if (
            "(" in item
            and item.split("(", 1)[0] not in sdk_task_callable_params
        )
        or (
            "(" not in item
            and item not in sdk_task_fields
        )
    )
    installed_task_fields = task_context_data_fields(installed_types)
    exposed_task_fields = sidecar_task_fields(sidecar_source)
    exposed_task_field_shapes = sidecar_task_shapes(sidecar_source)
    exposed_skill_fields = sidecar_skill_fields(sidecar_source)
    adapter_task_metadata_fields = {
        key for _label, key in python_for_tuple_pair_values(adapter_source, ("label", "key"))
    }
    adapter_task_metadata_candidate_shapes = {
        **{field: "string" for field in INTENTIONALLY_LOCAL_TASK_FIELDS},
        **sdk_task_field_shapes,
    }
    expected_adapter_task_metadata_fields = {
        field
        for field in (sdk_task_fields | INTENTIONALLY_LOCAL_TASK_FIELDS)
        if field not in {"content", "taskKind"}
        and adapter_task_metadata_candidate_shapes.get(field) == "string"
    }
    exposed_skill_required_fields = sidecar_skill_required_fields(sidecar_source)
    exposed_skill_shapes = sidecar_skill_shapes(sidecar_source)
    exposed_option_fields = sidecar_agent_option_fields(sidecar_source)
    exposed_option_required_fields = sidecar_agent_option_required_fields(sidecar_source)
    exposed_option_shapes = sidecar_agent_option_shapes(sidecar_source)
    exposed_control_env = sidecar_control_env(sidecar_source)
    exposed_control_endpoints = sidecar_control_endpoints(sidecar_source)
    adapter_control_endpoints = adapter_sidecar_post_paths(adapter_source)
    control_options_unwired = not index_uses_control_options(sidecar_index_source)
    sidecar_port_parser_unwired = not index_uses_strict_port_parser(sidecar_index_source)
    sidecar_required_env_unwired = not index_uses_trimmed_required_env(sidecar_index_source)
    exposed_agent_events = sidecar_agent_events(sidecar_source)
    checked_agent_methods = sidecar_check_agent_method_calls(sidecar_e2e_check_source, sidecar_http_check_source)
    checked_http_methods = sidecar_check_agent_method_calls(sidecar_http_check_source)
    expected_http_runtime_methods = js_string_array(sidecar_http_check_source, "EXPECTED_HTTP_SDK_METHODS")
    checked_task_methods = sidecar_check_task_method_calls(sidecar_e2e_check_source, sidecar_http_check_source)
    expected_task_runtime_methods = js_string_array(sidecar_e2e_check_source, "EXPECTED_TASK_SDK_METHODS")
    sidecar_agent_required_counts = js_map_number_entries(sidecar_source, "agentRequiredArgCounts")
    sidecar_task_required_counts = js_map_number_entries(sidecar_source, "taskRequiredArgCounts")
    sidecar_agent_max_counts = sidecar_agent_required_counts | js_map_number_entries(
        sidecar_source,
        "agentMaxArgCounts",
    )
    sidecar_task_max_counts = sidecar_task_required_counts | js_map_number_entries(
        sidecar_source,
        "taskMaxArgCounts",
    )
    manifest_source = (ROOT / "plugin.yaml").read_text()
    manifest_exposed = manifest_tools(manifest_source)
    manifest_order = manifest_tool_list(manifest_source)
    manifest_hook_exposed = manifest_hooks(manifest_source)
    manifest_env_exposed = manifest_env(manifest_source)
    readme_env_exposed = readme_env_names(readme_source)
    runtime_env_exposed = set().union(
        arinova_env_names(plugin_source),
        arinova_env_names(adapter_source),
        arinova_env_names(sidecar_source),
        arinova_env_names(sidecar_index_source),
    )
    yaml_bridge_keys = python_function_dict_keys(plugin_source, "_apply_yaml_config", "key_map")
    yaml_special_keys = (
        python_function_mapping_key_lookups(plugin_source, "_apply_yaml_config", "platform_cfg")
        - yaml_bridge_keys
    )
    expected_readme_yaml_keys = yaml_bridge_keys | {
        "enabled",
        "allowed_users",
        "allow_all_users",
        "home_channel",
        "home_conversation",
        "agent_skills",
    }
    readme_yaml_exposed = readme_yaml_keys(readme_source)
    expected_tools = {"arinova_sdk_call", "arinova_task_call"}
    expected_tools.update(f"arinova_{snake(method)}" for method in exposed)
    expected_tools.update(f"arinova_task_{snake(method)}" for method in exposed_task)
    hermes_tool_schema_contract_count = len(expected_tools)
    hermes_toolset_name_contract_missing = 'TOOLSET = "hermes-arinova"' not in tools_source
    hermes_toolset_name_contract_count = 1

    sdk_option_config_coverage_missing: list[str] = []
    for option_name in sorted(sdk_option_fields):
        config = EXPECTED_SDK_OPTION_CONFIG.get(option_name)
        if config is None:
            sdk_option_config_coverage_missing.append(f"{option_name}: missing config contract")
            continue
        expected_env = config["env"]
        expected_yaml = config["yaml"]
        expected_readme_yaml = config.get("readme_yaml", expected_yaml)
        missing_manifest_env = sorted(expected_env - manifest_env_exposed)
        missing_readme_env = sorted(expected_env - readme_env_exposed)
        missing_runtime_env = sorted(expected_env - runtime_env_exposed)
        missing_yaml_bridge = sorted(expected_yaml - (yaml_bridge_keys | yaml_special_keys))
        missing_readme_yaml = sorted(expected_readme_yaml - readme_yaml_exposed)
        if missing_manifest_env:
            sdk_option_config_coverage_missing.append(
                f"{option_name}: manifest env missing {missing_manifest_env}"
            )
        if missing_readme_env:
            sdk_option_config_coverage_missing.append(
                f"{option_name}: README env missing {missing_readme_env}"
            )
        if missing_runtime_env:
            sdk_option_config_coverage_missing.append(
                f"{option_name}: runtime env missing {missing_runtime_env}"
            )
        if missing_yaml_bridge:
            sdk_option_config_coverage_missing.append(
                f"{option_name}: YAML bridge missing {missing_yaml_bridge}"
            )
        if missing_readme_yaml:
            sdk_option_config_coverage_missing.append(
                f"{option_name}: README YAML missing {missing_readme_yaml}"
            )
    stale_sdk_option_config = sorted(set(EXPECTED_SDK_OPTION_CONFIG) - sdk_option_fields)
    sdk_option_config_contract_count = len(EXPECTED_SDK_OPTION_CONFIG)

    missing = sorted(sdk_methods - exposed - INTENTIONALLY_LOCAL)
    stale = sorted(exposed - sdk_methods)
    local_lifecycle_method_drift = sorted(INTENTIONALLY_LOCAL ^ EXPECTED_LOCAL_LIFECYCLE_METHODS)
    local_lifecycle_sdk_drift = sorted(EXPECTED_LOCAL_LIFECYCLE_METHODS - sdk_methods)
    local_lifecycle_docs_missing = (
        "sidecar-owned SDK lifecycle methods" not in readme_source
        or "`connect()`, `disconnect()`" not in readme_source
        or "`onTask()`" not in readme_source
        or "`on(AgentEvent, ...)`" not in readme_source
        or "rather than exposed as callable Hermes tools" not in readme_source
    )
    sdk_readme_bridge_coverage_missing = sorted(
        heading
        for heading in sdk_readme_method_headings
        if (
            heading.startswith("agent.")
            and heading.removeprefix("agent.") not in exposed
            and heading.removeprefix("agent.") not in INTENTIONALLY_LOCAL
        )
        or (
            heading.startswith("task.")
            and heading.removeprefix("task.") not in exposed_task
        )
    )
    sidecar_order_drift = sidecar_ordered != sdk_method_order
    python_order_drift = python_ordered != sdk_method_order
    task_missing = sorted(sdk_task_helpers - exposed_task)
    task_stale = sorted(exposed_task - sdk_task_helpers)
    sidecar_task_order_drift = sidecar_task_ordered != sdk_task_helper_order
    python_task_order_drift = python_task_ordered != sdk_task_helper_order
    task_field_missing = sorted(sdk_task_fields - exposed_task_fields)
    task_field_stale = sorted(exposed_task_fields - sdk_task_fields - INTENTIONALLY_LOCAL_TASK_FIELDS)
    task_field_shape_drift = {
        field: sdk_task_field_shapes[field]
        for field in sorted(sdk_task_fields & exposed_task_fields)
        if sdk_task_field_shapes.get(field) != exposed_task_field_shapes.get(field)
    }
    adapter_task_metadata_field_drift = (
        adapter_task_metadata_fields != expected_adapter_task_metadata_fields
    )
    adapter_task_metadata_contract_count = len(expected_adapter_task_metadata_fields)
    runtime_missing = sorted(sdk_methods - installed_methods)
    runtime_extra = sorted(installed_methods - sdk_methods)
    runtime_task_missing = sorted(sdk_task_helpers - installed_task_helpers)
    runtime_task_extra = sorted(installed_task_helpers - sdk_task_helpers)
    runtime_task_field_missing = sorted(sdk_task_fields - installed_task_fields)
    runtime_task_field_extra = sorted(installed_task_fields - sdk_task_fields)
    runtime_skill_field_missing = sorted(sdk_skill_fields - installed_skill_fields)
    runtime_skill_field_extra = sorted(installed_skill_fields - sdk_skill_fields)
    skill_field_missing = sorted(sdk_skill_fields - exposed_skill_fields)
    skill_field_stale = sorted(exposed_skill_fields - sdk_skill_fields)
    skill_required_drift = (
        sorted(sdk_interface_required_fields.get("AgentSkill", set()))
        if exposed_skill_required_fields != sdk_interface_required_fields.get("AgentSkill", set())
        else []
    )
    skill_shape_drift = (
        interface_field_shapes(sdk_types, "AgentSkill")
        if exposed_skill_shapes != interface_field_shapes(sdk_types, "AgentSkill")
        else {}
    )
    runtime_option_field_missing = sorted(sdk_option_fields - installed_option_fields)
    runtime_option_field_extra = sorted(installed_option_fields - sdk_option_fields)
    option_field_missing = sorted(sdk_option_fields - exposed_option_fields)
    option_field_stale = sorted(exposed_option_fields - sdk_option_fields)
    option_required_drift = (
        sorted(sdk_interface_required_fields.get("ArinovaAgentOptions", set()))
        if exposed_option_required_fields != sdk_interface_required_fields.get("ArinovaAgentOptions", set())
        else []
    )
    option_shape_drift = (
        interface_field_shapes(sdk_types, "ArinovaAgentOptions")
        if exposed_option_shapes != interface_field_shapes(sdk_types, "ArinovaAgentOptions")
        else {}
    )
    sdk_option_connection_auth_fields = {"serverUrl", "botToken"}
    sdk_option_skill_fields = {"skills"}
    sdk_option_timing_fields = {"reconnectInterval", "pingInterval", "pingTimeout"}
    sdk_option_scheduler_fields = {"concurrencyMode", "maxConsecutivePerConversation"}
    sdk_option_category_members = (
        sdk_option_connection_auth_fields
        | sdk_option_skill_fields
        | sdk_option_timing_fields
        | sdk_option_scheduler_fields
    )
    sdk_option_category_drift = {}
    if sdk_option_fields - sdk_option_category_members:
        sdk_option_category_drift["uncategorized"] = sorted(sdk_option_fields - sdk_option_category_members)
    if sdk_option_category_members - sdk_option_fields:
        sdk_option_category_drift["stale"] = sorted(sdk_option_category_members - sdk_option_fields)
    sidecar_option_category_drift = {}
    if exposed_option_fields - sdk_option_category_members:
        sidecar_option_category_drift["uncategorized"] = sorted(exposed_option_fields - sdk_option_category_members)
    if sdk_option_category_members - exposed_option_fields:
        sidecar_option_category_drift["missing"] = sorted(sdk_option_category_members - exposed_option_fields)
    runtime_option_category_drift = {}
    if installed_option_fields - sdk_option_category_members:
        runtime_option_category_drift["uncategorized"] = sorted(installed_option_fields - sdk_option_category_members)
    if sdk_option_category_members - installed_option_fields:
        runtime_option_category_drift["missing"] = sorted(sdk_option_category_members - installed_option_fields)
    sdk_runtime_info_identity_fields = {"name", "version"}
    sdk_runtime_info_environment_fields = {"language", "platform"}
    sdk_runtime_info_category_members = sdk_runtime_info_identity_fields | sdk_runtime_info_environment_fields
    sdk_runtime_info_category_drift = {}
    if sdk_runtime_info_fields - sdk_runtime_info_category_members:
        sdk_runtime_info_category_drift["uncategorized"] = sorted(
            sdk_runtime_info_fields - sdk_runtime_info_category_members
        )
    if sdk_runtime_info_category_members - sdk_runtime_info_fields:
        sdk_runtime_info_category_drift["stale"] = sorted(
            sdk_runtime_info_category_members - sdk_runtime_info_fields
        )
    runtime_runtime_info_category_drift = {}
    if installed_runtime_info_fields - sdk_runtime_info_category_members:
        runtime_runtime_info_category_drift["uncategorized"] = sorted(
            installed_runtime_info_fields - sdk_runtime_info_category_members
        )
    if sdk_runtime_info_category_members - installed_runtime_info_fields:
        runtime_runtime_info_category_drift["missing"] = sorted(
            sdk_runtime_info_category_members - installed_runtime_info_fields
        )
    control_env_drift = sorted(EXPECTED_CONTROL_ENV ^ exposed_control_env)
    runtime_agent_event_missing = sorted(sdk_agent_events - installed_agent_events)
    runtime_agent_event_extra = sorted(installed_agent_events - sdk_agent_events)
    sdk_agent_connection_events = {"connected", "disconnected"}
    sdk_agent_error_auth_events = {"error", "auth_failed"}
    sdk_agent_token_events = {"token_claimed"}
    sdk_agent_event_category_members = (
        sdk_agent_connection_events | sdk_agent_error_auth_events | sdk_agent_token_events
    )
    sdk_agent_event_category_drift = {}
    if sdk_agent_events - sdk_agent_event_category_members:
        sdk_agent_event_category_drift["uncategorized"] = sorted(sdk_agent_events - sdk_agent_event_category_members)
    if sdk_agent_event_category_members - sdk_agent_events:
        sdk_agent_event_category_drift["stale"] = sorted(sdk_agent_event_category_members - sdk_agent_events)
    sidecar_agent_event_category_drift = {}
    if exposed_agent_events - sdk_agent_event_category_members:
        sidecar_agent_event_category_drift["uncategorized"] = sorted(
            exposed_agent_events - sdk_agent_event_category_members
        )
    if sdk_agent_event_category_members - exposed_agent_events:
        sidecar_agent_event_category_drift["missing"] = sorted(
            sdk_agent_event_category_members - exposed_agent_events
        )
    runtime_agent_event_category_drift = {}
    if installed_agent_events - sdk_agent_event_category_members:
        runtime_agent_event_category_drift["uncategorized"] = sorted(
            installed_agent_events - sdk_agent_event_category_members
        )
    if sdk_agent_event_category_members - installed_agent_events:
        runtime_agent_event_category_drift["missing"] = sorted(
            sdk_agent_event_category_members - installed_agent_events
        )
    runtime_task_update_status_missing = sorted(sdk_task_update_statuses - installed_task_update_statuses)
    runtime_task_update_status_extra = sorted(installed_task_update_statuses - sdk_task_update_statuses)
    sdk_task_update_start_statuses = {"started"}
    sdk_task_update_completion_statuses = {"completed"}
    sdk_task_update_status_category_members = (
        sdk_task_update_start_statuses | sdk_task_update_completion_statuses
    )
    sdk_task_update_status_category_drift = {}
    if sdk_task_update_statuses - sdk_task_update_status_category_members:
        sdk_task_update_status_category_drift["uncategorized"] = sorted(
            sdk_task_update_statuses - sdk_task_update_status_category_members
        )
    if sdk_task_update_status_category_members - sdk_task_update_statuses:
        sdk_task_update_status_category_drift["stale"] = sorted(
            sdk_task_update_status_category_members - sdk_task_update_statuses
        )
    runtime_task_update_status_category_drift = {}
    if installed_task_update_statuses - sdk_task_update_status_category_members:
        runtime_task_update_status_category_drift["uncategorized"] = sorted(
            installed_task_update_statuses - sdk_task_update_status_category_members
        )
    if sdk_task_update_status_category_members - installed_task_update_statuses:
        runtime_task_update_status_category_drift["missing"] = sorted(
            sdk_task_update_status_category_members - installed_task_update_statuses
        )
    runtime_task_update_variant_drift = {}
    sdk_task_update_variants = type_alias_object_variants(sdk_types, "TaskUpdateData", "status")
    for variant in sorted(set(sdk_task_update_variants) | set(installed_task_update_variants)):
        expected = sdk_task_update_variants.get(variant, {"fields": set(), "required": set(), "shapes": {}})
        actual = installed_task_update_variants.get(variant, {"fields": set(), "required": set(), "shapes": {}})
        if actual != expected:
            runtime_task_update_variant_drift[variant] = {
                "expected": {
                    "fields": sorted(expected["fields"]),
                    "required": sorted(expected["required"]),
                    "shapes": expected["shapes"],
                },
                "actual": {
                    "fields": sorted(actual["fields"]),
                    "required": sorted(actual["required"]),
                    "shapes": actual["shapes"],
                },
            }
    runtime_action_result_status_missing = sorted(sdk_action_result_statuses - installed_action_result_statuses)
    runtime_action_result_status_extra = sorted(installed_action_result_statuses - sdk_action_result_statuses)
    sdk_action_result_status_category_members = sdk_terminal_action_statuses | sdk_transient_action_statuses
    sdk_action_result_status_category_drift = {}
    if sdk_action_result_statuses - sdk_action_result_status_category_members:
        sdk_action_result_status_category_drift["uncategorized"] = sorted(
            sdk_action_result_statuses - sdk_action_result_status_category_members
        )
    if sdk_action_result_status_category_members - sdk_action_result_statuses:
        sdk_action_result_status_category_drift["stale"] = sorted(
            sdk_action_result_status_category_members - sdk_action_result_statuses
        )
    runtime_action_result_status_category_drift = {}
    if installed_action_result_statuses - sdk_action_result_status_category_members:
        runtime_action_result_status_category_drift["uncategorized"] = sorted(
            installed_action_result_statuses - sdk_action_result_status_category_members
        )
    if sdk_action_result_status_category_members - installed_action_result_statuses:
        runtime_action_result_status_category_drift["missing"] = sorted(
            sdk_action_result_status_category_members - installed_action_result_statuses
        )
    sdk_action_result_identity_fields = {"callId", "action", "status"}
    sdk_action_result_payload_fields = {"result", "error", "confirmation"}
    sdk_action_result_trace_fields = {"traceId", "actionVersion"}
    sdk_action_result_execution_fields = {"dryRun"}
    sdk_action_result_category_members = (
        sdk_action_result_identity_fields
        | sdk_action_result_payload_fields
        | sdk_action_result_trace_fields
        | sdk_action_result_execution_fields
    )
    sdk_action_result_field_category_drift = {}
    if sdk_action_result_fields - sdk_action_result_category_members:
        sdk_action_result_field_category_drift["uncategorized"] = sorted(
            sdk_action_result_fields - sdk_action_result_category_members
        )
    if sdk_action_result_category_members - sdk_action_result_fields:
        sdk_action_result_field_category_drift["stale"] = sorted(
            sdk_action_result_category_members - sdk_action_result_fields
        )
    runtime_action_result_field_category_drift = {}
    if installed_action_result_fields - sdk_action_result_category_members:
        runtime_action_result_field_category_drift["uncategorized"] = sorted(
            installed_action_result_fields - sdk_action_result_category_members
        )
    if sdk_action_result_category_members - installed_action_result_fields:
        runtime_action_result_field_category_drift["missing"] = sorted(
            sdk_action_result_category_members - installed_action_result_fields
        )
    sdk_memory_origin_literal_contract = {"self", "system"}
    sdk_memory_origin_template_contract = {"shared-from-"}
    sdk_memory_origin_literal_drift = {}
    if sdk_memory_origin_literals - sdk_memory_origin_literal_contract:
        sdk_memory_origin_literal_drift["uncategorized"] = sorted(
            sdk_memory_origin_literals - sdk_memory_origin_literal_contract
        )
    if sdk_memory_origin_literal_contract - sdk_memory_origin_literals:
        sdk_memory_origin_literal_drift["missing"] = sorted(
            sdk_memory_origin_literal_contract - sdk_memory_origin_literals
        )
    sdk_memory_origin_template_drift = {}
    if sdk_memory_origin_templates - sdk_memory_origin_template_contract:
        sdk_memory_origin_template_drift["uncategorized"] = sorted(
            sdk_memory_origin_templates - sdk_memory_origin_template_contract
        )
    if sdk_memory_origin_template_contract - sdk_memory_origin_templates:
        sdk_memory_origin_template_drift["missing"] = sorted(
            sdk_memory_origin_template_contract - sdk_memory_origin_templates
        )
    runtime_memory_origin_literal_drift = {}
    if installed_memory_origin_literals - sdk_memory_origin_literal_contract:
        runtime_memory_origin_literal_drift["uncategorized"] = sorted(
            installed_memory_origin_literals - sdk_memory_origin_literal_contract
        )
    if sdk_memory_origin_literal_contract - installed_memory_origin_literals:
        runtime_memory_origin_literal_drift["missing"] = sorted(
            sdk_memory_origin_literal_contract - installed_memory_origin_literals
        )
    runtime_memory_origin_template_drift = {}
    if installed_memory_origin_templates - sdk_memory_origin_template_contract:
        runtime_memory_origin_template_drift["uncategorized"] = sorted(
            installed_memory_origin_templates - sdk_memory_origin_template_contract
        )
    if sdk_memory_origin_template_contract - installed_memory_origin_templates:
        runtime_memory_origin_template_drift["missing"] = sorted(
            sdk_memory_origin_template_contract - installed_memory_origin_templates
        )
    sdk_onboarding_seed_kind_contract = {"first_touch_opening"}
    sdk_onboarding_seed_kind_drift = {}
    if sdk_onboarding_seed_kinds - sdk_onboarding_seed_kind_contract:
        sdk_onboarding_seed_kind_drift["uncategorized"] = sorted(
            sdk_onboarding_seed_kinds - sdk_onboarding_seed_kind_contract
        )
    if sdk_onboarding_seed_kind_contract - sdk_onboarding_seed_kinds:
        sdk_onboarding_seed_kind_drift["missing"] = sorted(
            sdk_onboarding_seed_kind_contract - sdk_onboarding_seed_kinds
        )
    runtime_onboarding_seed_kind_drift = {}
    if installed_onboarding_seed_kinds - sdk_onboarding_seed_kind_contract:
        runtime_onboarding_seed_kind_drift["uncategorized"] = sorted(
            installed_onboarding_seed_kinds - sdk_onboarding_seed_kind_contract
        )
    if sdk_onboarding_seed_kind_contract - installed_onboarding_seed_kinds:
        runtime_onboarding_seed_kind_drift["missing"] = sorted(
            sdk_onboarding_seed_kind_contract - installed_onboarding_seed_kinds
        )
    sdk_onboarding_seed_identity_fields = {"kind", "seedId", "agentId"}
    sdk_onboarding_seed_action_fields = {"action"}
    sdk_onboarding_seed_content_fields = {"prompt"}
    sdk_onboarding_seed_category_members = (
        sdk_onboarding_seed_identity_fields
        | sdk_onboarding_seed_action_fields
        | sdk_onboarding_seed_content_fields
    )
    sdk_onboarding_seed_category_drift = {}
    if sdk_onboarding_seed_fields - sdk_onboarding_seed_category_members:
        sdk_onboarding_seed_category_drift["uncategorized"] = sorted(
            sdk_onboarding_seed_fields - sdk_onboarding_seed_category_members
        )
    if sdk_onboarding_seed_category_members - sdk_onboarding_seed_fields:
        sdk_onboarding_seed_category_drift["stale"] = sorted(
            sdk_onboarding_seed_category_members - sdk_onboarding_seed_fields
        )
    runtime_onboarding_seed_category_drift = {}
    if installed_onboarding_seed_fields - sdk_onboarding_seed_category_members:
        runtime_onboarding_seed_category_drift["uncategorized"] = sorted(
            installed_onboarding_seed_fields - sdk_onboarding_seed_category_members
        )
    if sdk_onboarding_seed_category_members - installed_onboarding_seed_fields:
        runtime_onboarding_seed_category_drift["missing"] = sorted(
            sdk_onboarding_seed_category_members - installed_onboarding_seed_fields
        )
    sdk_action_option_correlation_fields = {"callId", "parentCallId"}
    sdk_action_option_attribution_fields = {"taskId", "conversationId", "messageId"}
    sdk_action_option_context_fields = {"reason", "metadata"}
    sdk_action_option_execution_fields = {"dryRun", "timeoutMs"}
    sdk_action_option_category_members = (
        sdk_action_option_correlation_fields
        | sdk_action_option_attribution_fields
        | sdk_action_option_context_fields
        | sdk_action_option_execution_fields
    )
    sdk_action_option_category_drift = {}
    if sdk_action_option_fields - sdk_action_option_category_members:
        sdk_action_option_category_drift["uncategorized"] = sorted(
            sdk_action_option_fields - sdk_action_option_category_members
        )
    if sdk_action_option_category_members - sdk_action_option_fields:
        sdk_action_option_category_drift["stale"] = sorted(
            sdk_action_option_category_members - sdk_action_option_fields
        )
    runtime_action_option_category_drift = {}
    if installed_action_option_fields - sdk_action_option_category_members:
        runtime_action_option_category_drift["uncategorized"] = sorted(
            installed_action_option_fields - sdk_action_option_category_members
        )
    if sdk_action_option_category_members - installed_action_option_fields:
        runtime_action_option_category_drift["missing"] = sorted(
            sdk_action_option_category_members - installed_action_option_fields
        )
    sdk_tool_report_identity_fields = {"sessionId", "turnId", "messageId"}
    sdk_tool_report_tool_fields = {"seqOrder", "toolName", "input", "output"}
    sdk_tool_report_outcome_fields = {"durationMs", "success", "error"}
    sdk_tool_report_category_members = (
        sdk_tool_report_identity_fields | sdk_tool_report_tool_fields | sdk_tool_report_outcome_fields
    )
    sdk_tool_report_category_drift = {}
    if sdk_tool_report_fields - sdk_tool_report_category_members:
        sdk_tool_report_category_drift["uncategorized"] = sorted(
            sdk_tool_report_fields - sdk_tool_report_category_members
        )
    if sdk_tool_report_category_members - sdk_tool_report_fields:
        sdk_tool_report_category_drift["stale"] = sorted(
            sdk_tool_report_category_members - sdk_tool_report_fields
        )
    runtime_tool_report_category_drift = {}
    if installed_tool_report_fields - sdk_tool_report_category_members:
        runtime_tool_report_category_drift["uncategorized"] = sorted(
            installed_tool_report_fields - sdk_tool_report_category_members
        )
    if sdk_tool_report_category_members - installed_tool_report_fields:
        runtime_tool_report_category_drift["missing"] = sorted(
            sdk_tool_report_category_members - installed_tool_report_fields
        )
    sdk_action_error_identity_fields = {"code", "message"}
    sdk_action_error_detail_fields = {"details"}
    sdk_action_error_category_members = sdk_action_error_identity_fields | sdk_action_error_detail_fields
    sdk_action_error_category_drift = {}
    if sdk_action_error_fields - sdk_action_error_category_members:
        sdk_action_error_category_drift["uncategorized"] = sorted(
            sdk_action_error_fields - sdk_action_error_category_members
        )
    if sdk_action_error_category_members - sdk_action_error_fields:
        sdk_action_error_category_drift["stale"] = sorted(
            sdk_action_error_category_members - sdk_action_error_fields
        )
    runtime_action_error_category_drift = {}
    if installed_action_error_fields - sdk_action_error_category_members:
        runtime_action_error_category_drift["uncategorized"] = sorted(
            installed_action_error_fields - sdk_action_error_category_members
        )
    if sdk_action_error_category_members - installed_action_error_fields:
        runtime_action_error_category_drift["missing"] = sorted(
            sdk_action_error_category_members - installed_action_error_fields
        )
    sdk_action_confirmation_identity_fields = {"confirmationId"}
    sdk_action_confirmation_content_fields = {"title", "summary"}
    sdk_action_confirmation_timing_fields = {"expiresAt"}
    sdk_action_confirmation_category_members = (
        sdk_action_confirmation_identity_fields
        | sdk_action_confirmation_content_fields
        | sdk_action_confirmation_timing_fields
    )
    sdk_action_confirmation_category_drift = {}
    if sdk_action_confirmation_fields - sdk_action_confirmation_category_members:
        sdk_action_confirmation_category_drift["uncategorized"] = sorted(
            sdk_action_confirmation_fields - sdk_action_confirmation_category_members
        )
    if sdk_action_confirmation_category_members - sdk_action_confirmation_fields:
        sdk_action_confirmation_category_drift["stale"] = sorted(
            sdk_action_confirmation_category_members - sdk_action_confirmation_fields
        )
    runtime_action_confirmation_category_drift = {}
    if installed_action_confirmation_fields - sdk_action_confirmation_category_members:
        runtime_action_confirmation_category_drift["uncategorized"] = sorted(
            installed_action_confirmation_fields - sdk_action_confirmation_category_members
        )
    if sdk_action_confirmation_category_members - installed_action_confirmation_fields:
        runtime_action_confirmation_category_drift["missing"] = sorted(
            sdk_action_confirmation_category_members - installed_action_confirmation_fields
        )
    sdk_attachment_identity_fields = {"id"}
    sdk_file_name_type_fields = {"fileName", "fileType"}
    sdk_file_size_fields = {"fileSize"}
    sdk_file_url_fields = {"url"}
    sdk_task_attachment_category_members = (
        sdk_attachment_identity_fields | sdk_file_name_type_fields | sdk_file_size_fields | sdk_file_url_fields
    )
    sdk_upload_result_category_members = sdk_file_name_type_fields | sdk_file_size_fields | sdk_file_url_fields
    sdk_task_attachment_category_drift = {}
    if sdk_task_attachment_fields - sdk_task_attachment_category_members:
        sdk_task_attachment_category_drift["uncategorized"] = sorted(
            sdk_task_attachment_fields - sdk_task_attachment_category_members
        )
    if sdk_task_attachment_category_members - sdk_task_attachment_fields:
        sdk_task_attachment_category_drift["stale"] = sorted(
            sdk_task_attachment_category_members - sdk_task_attachment_fields
        )
    runtime_task_attachment_category_drift = {}
    if installed_task_attachment_fields - sdk_task_attachment_category_members:
        runtime_task_attachment_category_drift["uncategorized"] = sorted(
            installed_task_attachment_fields - sdk_task_attachment_category_members
        )
    if sdk_task_attachment_category_members - installed_task_attachment_fields:
        runtime_task_attachment_category_drift["missing"] = sorted(
            sdk_task_attachment_category_members - installed_task_attachment_fields
        )
    sdk_upload_result_category_drift = {}
    if sdk_upload_result_fields - sdk_upload_result_category_members:
        sdk_upload_result_category_drift["uncategorized"] = sorted(
            sdk_upload_result_fields - sdk_upload_result_category_members
        )
    if sdk_upload_result_category_members - sdk_upload_result_fields:
        sdk_upload_result_category_drift["stale"] = sorted(
            sdk_upload_result_category_members - sdk_upload_result_fields
        )
    runtime_upload_result_category_drift = {}
    if installed_upload_result_fields - sdk_upload_result_category_members:
        runtime_upload_result_category_drift["uncategorized"] = sorted(
            installed_upload_result_fields - sdk_upload_result_category_members
        )
    if sdk_upload_result_category_members - installed_upload_result_fields:
        runtime_upload_result_category_drift["missing"] = sorted(
            sdk_upload_result_category_members - installed_upload_result_fields
        )
    sdk_history_message_identity_fields = {"id", "conversationId", "seq"}
    sdk_history_message_content_status_fields = {"role", "content", "status"}
    sdk_history_message_sender_fields = {
        "senderAgentId",
        "senderAgentName",
        "senderUserId",
        "senderUsername",
    }
    sdk_history_message_thread_fields = {"replyToId", "threadId"}
    sdk_history_message_timestamp_fields = {"createdAt", "updatedAt"}
    sdk_history_message_attachment_fields = {"attachments"}
    sdk_history_message_category_members = (
        sdk_history_message_identity_fields
        | sdk_history_message_content_status_fields
        | sdk_history_message_sender_fields
        | sdk_history_message_thread_fields
        | sdk_history_message_timestamp_fields
        | sdk_history_message_attachment_fields
    )
    sdk_history_message_category_drift = {}
    if sdk_history_message_fields - sdk_history_message_category_members:
        sdk_history_message_category_drift["uncategorized"] = sorted(
            sdk_history_message_fields - sdk_history_message_category_members
        )
    if sdk_history_message_category_members - sdk_history_message_fields:
        sdk_history_message_category_drift["stale"] = sorted(
            sdk_history_message_category_members - sdk_history_message_fields
        )
    runtime_history_message_category_drift = {}
    if installed_history_message_fields - sdk_history_message_category_members:
        runtime_history_message_category_drift["uncategorized"] = sorted(
            installed_history_message_fields - sdk_history_message_category_members
        )
    if sdk_history_message_category_members - installed_history_message_fields:
        runtime_history_message_category_drift["missing"] = sorted(
            sdk_history_message_category_members - installed_history_message_fields
        )
    sdk_fetch_history_option_cursor_fields = {"before", "after", "around"}
    sdk_fetch_history_option_pagination_fields = {"limit"}
    sdk_fetch_history_option_category_members = (
        sdk_fetch_history_option_cursor_fields | sdk_fetch_history_option_pagination_fields
    )
    sdk_fetch_history_option_category_drift = {}
    if sdk_fetch_history_option_fields - sdk_fetch_history_option_category_members:
        sdk_fetch_history_option_category_drift["uncategorized"] = sorted(
            sdk_fetch_history_option_fields - sdk_fetch_history_option_category_members
        )
    if sdk_fetch_history_option_category_members - sdk_fetch_history_option_fields:
        sdk_fetch_history_option_category_drift["stale"] = sorted(
            sdk_fetch_history_option_category_members - sdk_fetch_history_option_fields
        )
    runtime_fetch_history_option_category_drift = {}
    if installed_fetch_history_option_fields - sdk_fetch_history_option_category_members:
        runtime_fetch_history_option_category_drift["uncategorized"] = sorted(
            installed_fetch_history_option_fields - sdk_fetch_history_option_category_members
        )
    if sdk_fetch_history_option_category_members - installed_fetch_history_option_fields:
        runtime_fetch_history_option_category_drift["missing"] = sorted(
            sdk_fetch_history_option_category_members - installed_fetch_history_option_fields
        )
    sdk_fetch_history_result_collection_fields = {"messages"}
    sdk_fetch_history_result_pagination_fields = {"hasMore", "nextCursor"}
    sdk_fetch_history_result_category_members = (
        sdk_fetch_history_result_collection_fields | sdk_fetch_history_result_pagination_fields
    )
    sdk_fetch_history_result_category_drift = {}
    if sdk_fetch_history_result_fields - sdk_fetch_history_result_category_members:
        sdk_fetch_history_result_category_drift["uncategorized"] = sorted(
            sdk_fetch_history_result_fields - sdk_fetch_history_result_category_members
        )
    if sdk_fetch_history_result_category_members - sdk_fetch_history_result_fields:
        sdk_fetch_history_result_category_drift["stale"] = sorted(
            sdk_fetch_history_result_category_members - sdk_fetch_history_result_fields
        )
    runtime_fetch_history_result_category_drift = {}
    if installed_fetch_history_result_fields - sdk_fetch_history_result_category_members:
        runtime_fetch_history_result_category_drift["uncategorized"] = sorted(
            installed_fetch_history_result_fields - sdk_fetch_history_result_category_members
        )
    if sdk_fetch_history_result_category_members - installed_fetch_history_result_fields:
        runtime_fetch_history_result_category_drift["missing"] = sorted(
            sdk_fetch_history_result_category_members - installed_fetch_history_result_fields
        )
    sdk_note_identity_fields = {"id", "conversationId"}
    sdk_note_creator_fields = {"creatorId", "creatorType", "creatorName"}
    sdk_note_agent_attribution_fields = {"agentId", "agentName"}
    sdk_note_content_fields = {"title", "content"}
    sdk_note_tag_fields = {"tags"}
    sdk_note_timestamp_fields = {"createdAt", "updatedAt"}
    sdk_note_category_members = (
        sdk_note_identity_fields
        | sdk_note_creator_fields
        | sdk_note_agent_attribution_fields
        | sdk_note_content_fields
        | sdk_note_tag_fields
        | sdk_note_timestamp_fields
    )
    sdk_note_category_drift = {}
    if sdk_note_fields - sdk_note_category_members:
        sdk_note_category_drift["uncategorized"] = sorted(sdk_note_fields - sdk_note_category_members)
    if sdk_note_category_members - sdk_note_fields:
        sdk_note_category_drift["stale"] = sorted(sdk_note_category_members - sdk_note_fields)
    runtime_note_category_drift = {}
    if installed_note_fields - sdk_note_category_members:
        runtime_note_category_drift["uncategorized"] = sorted(
            installed_note_fields - sdk_note_category_members
        )
    if sdk_note_category_members - installed_note_fields:
        runtime_note_category_drift["missing"] = sorted(sdk_note_category_members - installed_note_fields)
    sdk_list_notes_option_pagination_fields = {"before", "limit", "offset"}
    sdk_list_notes_option_filter_fields = {"tags"}
    sdk_list_notes_option_archive_fields = {"archived"}
    sdk_list_notes_option_category_members = (
        sdk_list_notes_option_pagination_fields
        | sdk_list_notes_option_filter_fields
        | sdk_list_notes_option_archive_fields
    )
    sdk_list_notes_option_category_drift = {}
    if sdk_list_notes_option_fields - sdk_list_notes_option_category_members:
        sdk_list_notes_option_category_drift["uncategorized"] = sorted(
            sdk_list_notes_option_fields - sdk_list_notes_option_category_members
        )
    if sdk_list_notes_option_category_members - sdk_list_notes_option_fields:
        sdk_list_notes_option_category_drift["stale"] = sorted(
            sdk_list_notes_option_category_members - sdk_list_notes_option_fields
        )
    runtime_list_notes_option_category_drift = {}
    if installed_list_notes_option_fields - sdk_list_notes_option_category_members:
        runtime_list_notes_option_category_drift["uncategorized"] = sorted(
            installed_list_notes_option_fields - sdk_list_notes_option_category_members
        )
    if sdk_list_notes_option_category_members - installed_list_notes_option_fields:
        runtime_list_notes_option_category_drift["missing"] = sorted(
            sdk_list_notes_option_category_members - installed_list_notes_option_fields
        )
    sdk_list_notes_result_collection_fields = {"notes"}
    sdk_list_notes_result_pagination_fields = {"hasMore", "nextCursor"}
    sdk_list_notes_result_category_members = (
        sdk_list_notes_result_collection_fields | sdk_list_notes_result_pagination_fields
    )
    sdk_list_notes_result_category_drift = {}
    if sdk_list_notes_result_fields - sdk_list_notes_result_category_members:
        sdk_list_notes_result_category_drift["uncategorized"] = sorted(
            sdk_list_notes_result_fields - sdk_list_notes_result_category_members
        )
    if sdk_list_notes_result_category_members - sdk_list_notes_result_fields:
        sdk_list_notes_result_category_drift["stale"] = sorted(
            sdk_list_notes_result_category_members - sdk_list_notes_result_fields
        )
    runtime_list_notes_result_category_drift = {}
    if installed_list_notes_result_fields - sdk_list_notes_result_category_members:
        runtime_list_notes_result_category_drift["uncategorized"] = sorted(
            installed_list_notes_result_fields - sdk_list_notes_result_category_members
        )
    if sdk_list_notes_result_category_members - installed_list_notes_result_fields:
        runtime_list_notes_result_category_drift["missing"] = sorted(
            sdk_list_notes_result_category_members - installed_list_notes_result_fields
        )
    sdk_create_note_body_content_fields = {"title", "content"}
    sdk_create_note_body_tag_fields = {"tags"}
    sdk_create_note_body_notebook_fields = {"notebookId"}
    sdk_create_note_body_category_members = (
        sdk_create_note_body_content_fields
        | sdk_create_note_body_tag_fields
        | sdk_create_note_body_notebook_fields
    )
    sdk_create_note_body_category_drift = {}
    if sdk_create_note_body_fields - sdk_create_note_body_category_members:
        sdk_create_note_body_category_drift["uncategorized"] = sorted(
            sdk_create_note_body_fields - sdk_create_note_body_category_members
        )
    if sdk_create_note_body_category_members - sdk_create_note_body_fields:
        sdk_create_note_body_category_drift["stale"] = sorted(
            sdk_create_note_body_category_members - sdk_create_note_body_fields
        )
    runtime_create_note_body_category_drift = {}
    if installed_create_note_body_fields - sdk_create_note_body_category_members:
        runtime_create_note_body_category_drift["uncategorized"] = sorted(
            installed_create_note_body_fields - sdk_create_note_body_category_members
        )
    if sdk_create_note_body_category_members - installed_create_note_body_fields:
        runtime_create_note_body_category_drift["missing"] = sorted(
            sdk_create_note_body_category_members - installed_create_note_body_fields
        )
    sdk_update_note_body_content_fields = {"title", "content"}
    sdk_update_note_body_tag_fields = {"tags"}
    sdk_update_note_body_category_members = sdk_update_note_body_content_fields | sdk_update_note_body_tag_fields
    sdk_update_note_body_category_drift = {}
    if sdk_update_note_body_fields - sdk_update_note_body_category_members:
        sdk_update_note_body_category_drift["uncategorized"] = sorted(
            sdk_update_note_body_fields - sdk_update_note_body_category_members
        )
    if sdk_update_note_body_category_members - sdk_update_note_body_fields:
        sdk_update_note_body_category_drift["stale"] = sorted(
            sdk_update_note_body_category_members - sdk_update_note_body_fields
        )
    runtime_update_note_body_category_drift = {}
    if installed_update_note_body_fields - sdk_update_note_body_category_members:
        runtime_update_note_body_category_drift["uncategorized"] = sorted(
            installed_update_note_body_fields - sdk_update_note_body_category_members
        )
    if sdk_update_note_body_category_members - installed_update_note_body_fields:
        runtime_update_note_body_category_drift["missing"] = sorted(
            sdk_update_note_body_category_members - installed_update_note_body_fields
        )
    sdk_query_memory_option_query_fields = {"query"}
    sdk_query_memory_option_pagination_fields = {"limit"}
    sdk_query_memory_option_category_members = (
        sdk_query_memory_option_query_fields | sdk_query_memory_option_pagination_fields
    )
    sdk_query_memory_option_category_drift = {}
    if sdk_query_memory_option_fields - sdk_query_memory_option_category_members:
        sdk_query_memory_option_category_drift["uncategorized"] = sorted(
            sdk_query_memory_option_fields - sdk_query_memory_option_category_members
        )
    if sdk_query_memory_option_category_members - sdk_query_memory_option_fields:
        sdk_query_memory_option_category_drift["stale"] = sorted(
            sdk_query_memory_option_category_members - sdk_query_memory_option_fields
        )
    runtime_query_memory_option_category_drift = {}
    if installed_query_memory_option_fields - sdk_query_memory_option_category_members:
        runtime_query_memory_option_category_drift["uncategorized"] = sorted(
            installed_query_memory_option_fields - sdk_query_memory_option_category_members
        )
    if sdk_query_memory_option_category_members - installed_query_memory_option_fields:
        runtime_query_memory_option_category_drift["missing"] = sorted(
            sdk_query_memory_option_category_members - installed_query_memory_option_fields
        )
    sdk_memory_entry_content_fields = {"content"}
    sdk_memory_entry_classification_fields = {"category", "origin"}
    sdk_memory_entry_scoring_fields = {"score"}
    sdk_memory_entry_category_members = (
        sdk_memory_entry_content_fields
        | sdk_memory_entry_classification_fields
        | sdk_memory_entry_scoring_fields
    )
    sdk_memory_entry_category_drift = {}
    if sdk_memory_entry_fields - sdk_memory_entry_category_members:
        sdk_memory_entry_category_drift["uncategorized"] = sorted(
            sdk_memory_entry_fields - sdk_memory_entry_category_members
        )
    if sdk_memory_entry_category_members - sdk_memory_entry_fields:
        sdk_memory_entry_category_drift["stale"] = sorted(
            sdk_memory_entry_category_members - sdk_memory_entry_fields
        )
    runtime_memory_entry_category_drift = {}
    if installed_memory_entry_fields - sdk_memory_entry_category_members:
        runtime_memory_entry_category_drift["uncategorized"] = sorted(
            installed_memory_entry_fields - sdk_memory_entry_category_members
        )
    if sdk_memory_entry_category_members - installed_memory_entry_fields:
        runtime_memory_entry_category_drift["missing"] = sorted(
            sdk_memory_entry_category_members - installed_memory_entry_fields
        )
    sdk_share_note_result_identity_fields = {"messageId", "noteId"}
    sdk_share_note_result_display_fields = {"title", "preview"}
    sdk_share_note_result_tag_fields = {"tags"}
    sdk_share_note_result_category_members = (
        sdk_share_note_result_identity_fields
        | sdk_share_note_result_display_fields
        | sdk_share_note_result_tag_fields
    )
    sdk_share_note_result_category_drift = {}
    if sdk_share_note_result_fields - sdk_share_note_result_category_members:
        sdk_share_note_result_category_drift["uncategorized"] = sorted(
            sdk_share_note_result_fields - sdk_share_note_result_category_members
        )
    if sdk_share_note_result_category_members - sdk_share_note_result_fields:
        sdk_share_note_result_category_drift["stale"] = sorted(
            sdk_share_note_result_category_members - sdk_share_note_result_fields
        )
    runtime_share_note_result_category_drift = {}
    if installed_share_note_result_fields - sdk_share_note_result_category_members:
        runtime_share_note_result_category_drift["uncategorized"] = sorted(
            installed_share_note_result_fields - sdk_share_note_result_category_members
        )
    if sdk_share_note_result_category_members - installed_share_note_result_fields:
        runtime_share_note_result_category_drift["missing"] = sorted(
            sdk_share_note_result_category_members - installed_share_note_result_fields
        )
    sdk_skill_prompt_content_fields = {"promptContent"}
    sdk_skill_prompt_template_fields = {"promptTemplate"}
    sdk_skill_prompt_parameter_fields = {"parameters"}
    sdk_skill_prompt_category_members = (
        sdk_skill_prompt_content_fields
        | sdk_skill_prompt_template_fields
        | sdk_skill_prompt_parameter_fields
    )
    sdk_skill_prompt_category_drift = {}
    if sdk_skill_prompt_fields - sdk_skill_prompt_category_members:
        sdk_skill_prompt_category_drift["uncategorized"] = sorted(
            sdk_skill_prompt_fields - sdk_skill_prompt_category_members
        )
    if sdk_skill_prompt_category_members - sdk_skill_prompt_fields:
        sdk_skill_prompt_category_drift["stale"] = sorted(
            sdk_skill_prompt_category_members - sdk_skill_prompt_fields
        )
    runtime_skill_prompt_category_drift = {}
    if installed_skill_prompt_fields - sdk_skill_prompt_category_members:
        runtime_skill_prompt_category_drift["uncategorized"] = sorted(
            installed_skill_prompt_fields - sdk_skill_prompt_category_members
        )
    if sdk_skill_prompt_category_members - installed_skill_prompt_fields:
        runtime_skill_prompt_category_drift["missing"] = sorted(
            sdk_skill_prompt_category_members - installed_skill_prompt_fields
        )
    sdk_kanban_board_identity_fields = {"id"}
    sdk_kanban_board_display_fields = {"name"}
    sdk_kanban_board_timestamp_fields = {"createdAt"}
    sdk_kanban_board_category_members = (
        sdk_kanban_board_identity_fields
        | sdk_kanban_board_display_fields
        | sdk_kanban_board_timestamp_fields
    )
    sdk_kanban_board_category_drift = {}
    if sdk_kanban_board_fields - sdk_kanban_board_category_members:
        sdk_kanban_board_category_drift["uncategorized"] = sorted(
            sdk_kanban_board_fields - sdk_kanban_board_category_members
        )
    if sdk_kanban_board_category_members - sdk_kanban_board_fields:
        sdk_kanban_board_category_drift["stale"] = sorted(
            sdk_kanban_board_category_members - sdk_kanban_board_fields
        )
    runtime_kanban_board_category_drift = {}
    if installed_kanban_board_fields - sdk_kanban_board_category_members:
        runtime_kanban_board_category_drift["uncategorized"] = sorted(
            installed_kanban_board_fields - sdk_kanban_board_category_members
        )
    if sdk_kanban_board_category_members - installed_kanban_board_fields:
        runtime_kanban_board_category_drift["missing"] = sorted(
            sdk_kanban_board_category_members - installed_kanban_board_fields
        )
    sdk_kanban_column_identity_fields = {"id"}
    sdk_kanban_column_parent_fields = {"boardId"}
    sdk_kanban_column_display_fields = {"name"}
    sdk_kanban_column_ordering_fields = {"sortOrder"}
    sdk_kanban_column_category_members = (
        sdk_kanban_column_identity_fields
        | sdk_kanban_column_parent_fields
        | sdk_kanban_column_display_fields
        | sdk_kanban_column_ordering_fields
    )
    sdk_kanban_column_category_drift = {}
    if sdk_kanban_column_fields - sdk_kanban_column_category_members:
        sdk_kanban_column_category_drift["uncategorized"] = sorted(
            sdk_kanban_column_fields - sdk_kanban_column_category_members
        )
    if sdk_kanban_column_category_members - sdk_kanban_column_fields:
        sdk_kanban_column_category_drift["stale"] = sorted(
            sdk_kanban_column_category_members - sdk_kanban_column_fields
        )
    runtime_kanban_column_category_drift = {}
    if installed_kanban_column_fields - sdk_kanban_column_category_members:
        runtime_kanban_column_category_drift["uncategorized"] = sorted(
            installed_kanban_column_fields - sdk_kanban_column_category_members
        )
    if sdk_kanban_column_category_members - installed_kanban_column_fields:
        runtime_kanban_column_category_drift["missing"] = sorted(
            sdk_kanban_column_category_members - installed_kanban_column_fields
        )
    sdk_kanban_card_identity_fields = {"id"}
    sdk_kanban_card_placement_fields = {"columnId", "columnName"}
    sdk_kanban_card_content_fields = {"title", "description", "priority"}
    sdk_kanban_card_scheduling_fields = {"dueDate", "sortOrder"}
    sdk_kanban_card_creator_fields = {"createdBy"}
    sdk_kanban_card_timestamp_fields = {"createdAt", "updatedAt"}
    sdk_kanban_card_archive_fields = {"archivedAt"}
    sdk_kanban_card_category_members = (
        sdk_kanban_card_identity_fields
        | sdk_kanban_card_placement_fields
        | sdk_kanban_card_content_fields
        | sdk_kanban_card_scheduling_fields
        | sdk_kanban_card_creator_fields
        | sdk_kanban_card_timestamp_fields
        | sdk_kanban_card_archive_fields
    )
    sdk_kanban_card_category_drift = {}
    if sdk_kanban_card_fields - sdk_kanban_card_category_members:
        sdk_kanban_card_category_drift["uncategorized"] = sorted(
            sdk_kanban_card_fields - sdk_kanban_card_category_members
        )
    if sdk_kanban_card_category_members - sdk_kanban_card_fields:
        sdk_kanban_card_category_drift["stale"] = sorted(
            sdk_kanban_card_category_members - sdk_kanban_card_fields
        )
    runtime_kanban_card_category_drift = {}
    if installed_kanban_card_fields - sdk_kanban_card_category_members:
        runtime_kanban_card_category_drift["uncategorized"] = sorted(
            installed_kanban_card_fields - sdk_kanban_card_category_members
        )
    if sdk_kanban_card_category_members - installed_kanban_card_fields:
        runtime_kanban_card_category_drift["missing"] = sorted(
            sdk_kanban_card_category_members - installed_kanban_card_fields
        )
    sdk_list_boards_result_board_fields = {"boards"}
    sdk_list_boards_result_column_fields = {"columns"}
    sdk_list_boards_result_card_fields = {"cards"}
    sdk_list_boards_result_category_members = (
        sdk_list_boards_result_board_fields
        | sdk_list_boards_result_column_fields
        | sdk_list_boards_result_card_fields
    )
    sdk_list_boards_result_category_drift = {}
    if sdk_list_boards_result_fields - sdk_list_boards_result_category_members:
        sdk_list_boards_result_category_drift["uncategorized"] = sorted(
            sdk_list_boards_result_fields - sdk_list_boards_result_category_members
        )
    if sdk_list_boards_result_category_members - sdk_list_boards_result_fields:
        sdk_list_boards_result_category_drift["stale"] = sorted(
            sdk_list_boards_result_category_members - sdk_list_boards_result_fields
        )
    runtime_list_boards_result_category_drift = {}
    if installed_list_boards_result_fields - sdk_list_boards_result_category_members:
        runtime_list_boards_result_category_drift["uncategorized"] = sorted(
            installed_list_boards_result_fields - sdk_list_boards_result_category_members
        )
    if sdk_list_boards_result_category_members - installed_list_boards_result_fields:
        runtime_list_boards_result_category_drift["missing"] = sorted(
            sdk_list_boards_result_category_members - installed_list_boards_result_fields
        )
    sdk_kanban_label_identity_fields = {"id"}
    sdk_kanban_label_parent_fields = {"boardId"}
    sdk_kanban_label_display_fields = {"name"}
    sdk_kanban_label_color_fields = {"color"}
    sdk_kanban_label_category_members = (
        sdk_kanban_label_identity_fields
        | sdk_kanban_label_parent_fields
        | sdk_kanban_label_display_fields
        | sdk_kanban_label_color_fields
    )
    sdk_kanban_label_category_drift = {}
    if sdk_kanban_label_fields - sdk_kanban_label_category_members:
        sdk_kanban_label_category_drift["uncategorized"] = sorted(
            sdk_kanban_label_fields - sdk_kanban_label_category_members
        )
    if sdk_kanban_label_category_members - sdk_kanban_label_fields:
        sdk_kanban_label_category_drift["stale"] = sorted(
            sdk_kanban_label_category_members - sdk_kanban_label_fields
        )
    runtime_kanban_label_category_drift = {}
    if installed_kanban_label_fields - sdk_kanban_label_category_members:
        runtime_kanban_label_category_drift["uncategorized"] = sorted(
            installed_kanban_label_fields - sdk_kanban_label_category_members
        )
    if sdk_kanban_label_category_members - installed_kanban_label_fields:
        runtime_kanban_label_category_drift["missing"] = sorted(
            sdk_kanban_label_category_members - installed_kanban_label_fields
        )
    sdk_create_board_body_display_fields = {"name"}
    sdk_create_board_body_column_fields = {"columns"}
    sdk_create_board_body_category_members = (
        sdk_create_board_body_display_fields | sdk_create_board_body_column_fields
    )
    sdk_create_board_body_category_drift = {}
    if sdk_create_board_body_fields - sdk_create_board_body_category_members:
        sdk_create_board_body_category_drift["uncategorized"] = sorted(
            sdk_create_board_body_fields - sdk_create_board_body_category_members
        )
    if sdk_create_board_body_category_members - sdk_create_board_body_fields:
        sdk_create_board_body_category_drift["stale"] = sorted(
            sdk_create_board_body_category_members - sdk_create_board_body_fields
        )
    runtime_create_board_body_category_drift = {}
    if installed_create_board_body_fields - sdk_create_board_body_category_members:
        runtime_create_board_body_category_drift["uncategorized"] = sorted(
            installed_create_board_body_fields - sdk_create_board_body_category_members
        )
    if sdk_create_board_body_category_members - installed_create_board_body_fields:
        runtime_create_board_body_category_drift["missing"] = sorted(
            sdk_create_board_body_category_members - installed_create_board_body_fields
        )
    sdk_update_board_body_display_fields = {"name"}
    sdk_update_board_body_category_members = sdk_update_board_body_display_fields
    sdk_update_board_body_category_drift = {}
    if sdk_update_board_body_fields - sdk_update_board_body_category_members:
        sdk_update_board_body_category_drift["uncategorized"] = sorted(
            sdk_update_board_body_fields - sdk_update_board_body_category_members
        )
    if sdk_update_board_body_category_members - sdk_update_board_body_fields:
        sdk_update_board_body_category_drift["stale"] = sorted(
            sdk_update_board_body_category_members - sdk_update_board_body_fields
        )
    runtime_update_board_body_category_drift = {}
    if installed_update_board_body_fields - sdk_update_board_body_category_members:
        runtime_update_board_body_category_drift["uncategorized"] = sorted(
            installed_update_board_body_fields - sdk_update_board_body_category_members
        )
    if sdk_update_board_body_category_members - installed_update_board_body_fields:
        runtime_update_board_body_category_drift["missing"] = sorted(
            sdk_update_board_body_category_members - installed_update_board_body_fields
        )
    sdk_create_card_body_content_fields = {"title", "description", "priority"}
    sdk_create_card_body_placement_fields = {"columnName", "columnId", "boardId"}
    sdk_create_card_body_category_members = (
        sdk_create_card_body_content_fields | sdk_create_card_body_placement_fields
    )
    sdk_create_card_body_category_drift = {}
    if sdk_create_card_body_fields - sdk_create_card_body_category_members:
        sdk_create_card_body_category_drift["uncategorized"] = sorted(
            sdk_create_card_body_fields - sdk_create_card_body_category_members
        )
    if sdk_create_card_body_category_members - sdk_create_card_body_fields:
        sdk_create_card_body_category_drift["stale"] = sorted(
            sdk_create_card_body_category_members - sdk_create_card_body_fields
        )
    runtime_create_card_body_category_drift = {}
    if installed_create_card_body_fields - sdk_create_card_body_category_members:
        runtime_create_card_body_category_drift["uncategorized"] = sorted(
            installed_create_card_body_fields - sdk_create_card_body_category_members
        )
    if sdk_create_card_body_category_members - installed_create_card_body_fields:
        runtime_create_card_body_category_drift["missing"] = sorted(
            sdk_create_card_body_category_members - installed_create_card_body_fields
        )
    sdk_update_card_body_content_fields = {"title", "description", "priority"}
    sdk_update_card_body_placement_fields = {"columnId"}
    sdk_update_card_body_ordering_fields = {"sortOrder"}
    sdk_update_card_body_category_members = (
        sdk_update_card_body_content_fields
        | sdk_update_card_body_placement_fields
        | sdk_update_card_body_ordering_fields
    )
    sdk_update_card_body_category_drift = {}
    if sdk_update_card_body_fields - sdk_update_card_body_category_members:
        sdk_update_card_body_category_drift["uncategorized"] = sorted(
            sdk_update_card_body_fields - sdk_update_card_body_category_members
        )
    if sdk_update_card_body_category_members - sdk_update_card_body_fields:
        sdk_update_card_body_category_drift["stale"] = sorted(
            sdk_update_card_body_category_members - sdk_update_card_body_fields
        )
    runtime_update_card_body_category_drift = {}
    if installed_update_card_body_fields - sdk_update_card_body_category_members:
        runtime_update_card_body_category_drift["uncategorized"] = sorted(
            installed_update_card_body_fields - sdk_update_card_body_category_members
        )
    if sdk_update_card_body_category_members - installed_update_card_body_fields:
        runtime_update_card_body_category_drift["missing"] = sorted(
            sdk_update_card_body_category_members - installed_update_card_body_fields
        )
    sdk_create_column_body_display_fields = {"name"}
    sdk_create_column_body_ordering_fields = {"sortOrder"}
    sdk_create_column_body_category_members = (
        sdk_create_column_body_display_fields | sdk_create_column_body_ordering_fields
    )
    sdk_create_column_body_category_drift = {}
    if sdk_create_column_body_fields - sdk_create_column_body_category_members:
        sdk_create_column_body_category_drift["uncategorized"] = sorted(
            sdk_create_column_body_fields - sdk_create_column_body_category_members
        )
    if sdk_create_column_body_category_members - sdk_create_column_body_fields:
        sdk_create_column_body_category_drift["stale"] = sorted(
            sdk_create_column_body_category_members - sdk_create_column_body_fields
        )
    runtime_create_column_body_category_drift = {}
    if installed_create_column_body_fields - sdk_create_column_body_category_members:
        runtime_create_column_body_category_drift["uncategorized"] = sorted(
            installed_create_column_body_fields - sdk_create_column_body_category_members
        )
    if sdk_create_column_body_category_members - installed_create_column_body_fields:
        runtime_create_column_body_category_drift["missing"] = sorted(
            sdk_create_column_body_category_members - installed_create_column_body_fields
        )
    sdk_update_column_body_display_fields = {"name"}
    sdk_update_column_body_ordering_fields = {"sortOrder"}
    sdk_update_column_body_category_members = (
        sdk_update_column_body_display_fields | sdk_update_column_body_ordering_fields
    )
    sdk_update_column_body_category_drift = {}
    if sdk_update_column_body_fields - sdk_update_column_body_category_members:
        sdk_update_column_body_category_drift["uncategorized"] = sorted(
            sdk_update_column_body_fields - sdk_update_column_body_category_members
        )
    if sdk_update_column_body_category_members - sdk_update_column_body_fields:
        sdk_update_column_body_category_drift["stale"] = sorted(
            sdk_update_column_body_category_members - sdk_update_column_body_fields
        )
    runtime_update_column_body_category_drift = {}
    if installed_update_column_body_fields - sdk_update_column_body_category_members:
        runtime_update_column_body_category_drift["uncategorized"] = sorted(
            installed_update_column_body_fields - sdk_update_column_body_category_members
        )
    if sdk_update_column_body_category_members - installed_update_column_body_fields:
        runtime_update_column_body_category_drift["missing"] = sorted(
            sdk_update_column_body_category_members - installed_update_column_body_fields
        )
    sdk_add_commit_body_commit_fields = {"commitHash"}
    sdk_add_commit_body_content_fields = {"message"}
    sdk_add_commit_body_category_members = sdk_add_commit_body_commit_fields | sdk_add_commit_body_content_fields
    sdk_add_commit_body_category_drift = {}
    if sdk_add_commit_body_fields - sdk_add_commit_body_category_members:
        sdk_add_commit_body_category_drift["uncategorized"] = sorted(
            sdk_add_commit_body_fields - sdk_add_commit_body_category_members
        )
    if sdk_add_commit_body_category_members - sdk_add_commit_body_fields:
        sdk_add_commit_body_category_drift["stale"] = sorted(
            sdk_add_commit_body_category_members - sdk_add_commit_body_fields
        )
    runtime_add_commit_body_category_drift = {}
    if installed_add_commit_body_fields - sdk_add_commit_body_category_members:
        runtime_add_commit_body_category_drift["uncategorized"] = sorted(
            installed_add_commit_body_fields - sdk_add_commit_body_category_members
        )
    if sdk_add_commit_body_category_members - installed_add_commit_body_fields:
        runtime_add_commit_body_category_drift["missing"] = sorted(
            sdk_add_commit_body_category_members - installed_add_commit_body_fields
        )
    sdk_create_label_body_display_fields = {"name"}
    sdk_create_label_body_color_fields = {"color"}
    sdk_create_label_body_category_members = sdk_create_label_body_display_fields | sdk_create_label_body_color_fields
    sdk_create_label_body_category_drift = {}
    if sdk_create_label_body_fields - sdk_create_label_body_category_members:
        sdk_create_label_body_category_drift["uncategorized"] = sorted(
            sdk_create_label_body_fields - sdk_create_label_body_category_members
        )
    if sdk_create_label_body_category_members - sdk_create_label_body_fields:
        sdk_create_label_body_category_drift["stale"] = sorted(
            sdk_create_label_body_category_members - sdk_create_label_body_fields
        )
    runtime_create_label_body_category_drift = {}
    if installed_create_label_body_fields - sdk_create_label_body_category_members:
        runtime_create_label_body_category_drift["uncategorized"] = sorted(
            installed_create_label_body_fields - sdk_create_label_body_category_members
        )
    if sdk_create_label_body_category_members - installed_create_label_body_fields:
        runtime_create_label_body_category_drift["missing"] = sorted(
            sdk_create_label_body_category_members - installed_create_label_body_fields
        )
    sdk_update_label_body_display_fields = {"name"}
    sdk_update_label_body_color_fields = {"color"}
    sdk_update_label_body_category_members = sdk_update_label_body_display_fields | sdk_update_label_body_color_fields
    sdk_update_label_body_category_drift = {}
    if sdk_update_label_body_fields - sdk_update_label_body_category_members:
        sdk_update_label_body_category_drift["uncategorized"] = sorted(
            sdk_update_label_body_fields - sdk_update_label_body_category_members
        )
    if sdk_update_label_body_category_members - sdk_update_label_body_fields:
        sdk_update_label_body_category_drift["stale"] = sorted(
            sdk_update_label_body_category_members - sdk_update_label_body_fields
        )
    runtime_update_label_body_category_drift = {}
    if installed_update_label_body_fields - sdk_update_label_body_category_members:
        runtime_update_label_body_category_drift["uncategorized"] = sorted(
            installed_update_label_body_fields - sdk_update_label_body_category_members
        )
    if sdk_update_label_body_category_members - installed_update_label_body_fields:
        runtime_update_label_body_category_drift["missing"] = sorted(
            sdk_update_label_body_category_members - installed_update_label_body_fields
        )
    sdk_card_commit_identity_fields = {"cardId", "commitHash"}
    sdk_card_commit_content_fields = {"message"}
    sdk_card_commit_timestamp_fields = {"createdAt"}
    sdk_card_commit_category_members = (
        sdk_card_commit_identity_fields | sdk_card_commit_content_fields | sdk_card_commit_timestamp_fields
    )
    sdk_card_commit_category_drift = {}
    if sdk_card_commit_fields - sdk_card_commit_category_members:
        sdk_card_commit_category_drift["uncategorized"] = sorted(
            sdk_card_commit_fields - sdk_card_commit_category_members
        )
    if sdk_card_commit_category_members - sdk_card_commit_fields:
        sdk_card_commit_category_drift["stale"] = sorted(
            sdk_card_commit_category_members - sdk_card_commit_fields
        )
    runtime_card_commit_category_drift = {}
    if installed_card_commit_fields - sdk_card_commit_category_members:
        runtime_card_commit_category_drift["uncategorized"] = sorted(
            installed_card_commit_fields - sdk_card_commit_category_members
        )
    if sdk_card_commit_category_members - installed_card_commit_fields:
        runtime_card_commit_category_drift["missing"] = sorted(
            sdk_card_commit_category_members - installed_card_commit_fields
        )
    sdk_card_note_identity_fields = {"id"}
    sdk_card_note_display_fields = {"title"}
    sdk_card_note_tag_fields = {"tags"}
    sdk_card_note_timestamp_fields = {"createdAt"}
    sdk_card_note_category_members = (
        sdk_card_note_identity_fields
        | sdk_card_note_display_fields
        | sdk_card_note_tag_fields
        | sdk_card_note_timestamp_fields
    )
    sdk_card_note_category_drift = {}
    if sdk_card_note_fields - sdk_card_note_category_members:
        sdk_card_note_category_drift["uncategorized"] = sorted(
            sdk_card_note_fields - sdk_card_note_category_members
        )
    if sdk_card_note_category_members - sdk_card_note_fields:
        sdk_card_note_category_drift["stale"] = sorted(
            sdk_card_note_category_members - sdk_card_note_fields
        )
    runtime_card_note_category_drift = {}
    if installed_card_note_fields - sdk_card_note_category_members:
        runtime_card_note_category_drift["uncategorized"] = sorted(
            installed_card_note_fields - sdk_card_note_category_members
        )
    if sdk_card_note_category_members - installed_card_note_fields:
        runtime_card_note_category_drift["missing"] = sorted(
            sdk_card_note_category_members - installed_card_note_fields
        )
    sdk_archived_cards_result_collection_fields = {"cards"}
    sdk_archived_cards_result_pagination_fields = {"total", "page", "limit"}
    sdk_archived_cards_result_category_members = (
        sdk_archived_cards_result_collection_fields | sdk_archived_cards_result_pagination_fields
    )
    sdk_archived_cards_result_category_drift = {}
    if sdk_archived_cards_result_fields - sdk_archived_cards_result_category_members:
        sdk_archived_cards_result_category_drift["uncategorized"] = sorted(
            sdk_archived_cards_result_fields - sdk_archived_cards_result_category_members
        )
    if sdk_archived_cards_result_category_members - sdk_archived_cards_result_fields:
        sdk_archived_cards_result_category_drift["stale"] = sorted(
            sdk_archived_cards_result_category_members - sdk_archived_cards_result_fields
        )
    runtime_archived_cards_result_category_drift = {}
    if installed_archived_cards_result_fields - sdk_archived_cards_result_category_members:
        runtime_archived_cards_result_category_drift["uncategorized"] = sorted(
            installed_archived_cards_result_fields - sdk_archived_cards_result_category_members
        )
    if sdk_archived_cards_result_category_members - installed_archived_cards_result_fields:
        runtime_archived_cards_result_category_drift["missing"] = sorted(
            sdk_archived_cards_result_category_members - installed_archived_cards_result_fields
        )
    action_result_terminal_status_missing = sorted(sdk_terminal_action_statuses - sdk_action_result_statuses)
    action_result_transient_status_missing = sorted(
        status for status in sdk_transient_action_statuses if f'"{status}"' not in sidecar_e2e_check_source
    )
    action_result_terminal_coverage_missing = sorted(
        status for status in sdk_terminal_action_statuses if f'status: "{status}"' not in sidecar_e2e_check_source
    )
    adapter_task_update_statuses = python_dict_string_values(adapter_source, "status")
    adapter_task_update_status_drift = sorted(adapter_task_update_statuses - sdk_task_update_statuses)
    adapter_task_update_status_category_drift = {}
    if adapter_task_update_statuses - sdk_task_update_status_category_members:
        adapter_task_update_status_category_drift["uncategorized"] = sorted(
            adapter_task_update_statuses - sdk_task_update_status_category_members
        )
    if sdk_task_update_status_category_members - adapter_task_update_statuses:
        adapter_task_update_status_category_drift["missing"] = sorted(
            sdk_task_update_status_category_members - adapter_task_update_statuses
        )
    agent_event_missing = sorted(sdk_agent_events - exposed_agent_events)
    agent_event_stale = sorted(exposed_agent_events - sdk_agent_events)
    sdk_method_exposure_contract_count = len(sdk_methods - INTENTIONALLY_LOCAL)
    sidecar_method_order_contract_count = len(sdk_method_order)
    python_method_order_contract_count = len(sdk_method_order)
    local_lifecycle_method_contract_count = len(EXPECTED_LOCAL_LIFECYCLE_METHODS)
    local_lifecycle_documentation_contract_count = 1
    sdk_readme_bridge_contract_count = len(
        [
            heading
            for heading in sdk_readme_method_headings
            if heading.startswith("agent.") or heading.startswith("task.")
        ]
    )
    task_helper_exposure_contract_count = len(sdk_task_helpers)
    sidecar_task_helper_order_contract_count = len(sdk_task_helper_order)
    python_task_helper_order_contract_count = len(sdk_task_helper_order)
    task_context_field_contract_count = len(sdk_task_fields)
    task_context_field_shape_contract_count = len(sdk_task_fields & exposed_task_fields)
    installed_method_contract_count = len(sdk_methods | installed_methods)
    installed_task_helper_contract_count = len(sdk_task_helpers | installed_task_helpers)
    installed_task_context_field_contract_count = len(sdk_task_fields | installed_task_fields)
    installed_agent_skill_field_contract_count = len(sdk_skill_fields | installed_skill_fields)
    sidecar_agent_skill_field_contract_count = len(sdk_skill_fields)
    sidecar_agent_skill_required_contract_count = 1
    sidecar_agent_skill_shape_contract_count = 1
    installed_option_field_contract_count = len(sdk_option_fields | installed_option_fields)
    sidecar_option_field_contract_count = len(sdk_option_fields)
    sdk_option_connection_auth_contract_count = len(sdk_option_connection_auth_fields & sdk_option_fields)
    sdk_option_skill_contract_count = len(sdk_option_skill_fields & sdk_option_fields)
    sdk_option_timing_contract_count = len(sdk_option_timing_fields & sdk_option_fields)
    sdk_option_scheduler_contract_count = len(sdk_option_scheduler_fields & sdk_option_fields)
    sidecar_option_connection_auth_contract_count = len(sdk_option_connection_auth_fields & exposed_option_fields)
    sidecar_option_skill_contract_count = len(sdk_option_skill_fields & exposed_option_fields)
    sidecar_option_timing_contract_count = len(sdk_option_timing_fields & exposed_option_fields)
    sidecar_option_scheduler_contract_count = len(sdk_option_scheduler_fields & exposed_option_fields)
    installed_option_connection_auth_contract_count = len(sdk_option_connection_auth_fields & installed_option_fields)
    installed_option_skill_contract_count = len(sdk_option_skill_fields & installed_option_fields)
    installed_option_timing_contract_count = len(sdk_option_timing_fields & installed_option_fields)
    installed_option_scheduler_contract_count = len(sdk_option_scheduler_fields & installed_option_fields)
    sidecar_option_required_contract_count = 1
    sidecar_option_shape_contract_count = 1
    control_env_surface_contract_count = len(EXPECTED_CONTROL_ENV)
    installed_agent_event_contract_count = len(sdk_agent_events | installed_agent_events)
    sdk_agent_connection_event_contract_count = len(sdk_agent_connection_events & sdk_agent_events)
    sdk_agent_error_auth_event_contract_count = len(sdk_agent_error_auth_events & sdk_agent_events)
    sdk_agent_token_event_contract_count = len(sdk_agent_token_events & sdk_agent_events)
    sidecar_agent_connection_event_contract_count = len(sdk_agent_connection_events & exposed_agent_events)
    sidecar_agent_error_auth_event_contract_count = len(sdk_agent_error_auth_events & exposed_agent_events)
    sidecar_agent_token_event_contract_count = len(sdk_agent_token_events & exposed_agent_events)
    installed_agent_connection_event_contract_count = len(sdk_agent_connection_events & installed_agent_events)
    installed_agent_error_auth_event_contract_count = len(sdk_agent_error_auth_events & installed_agent_events)
    installed_agent_token_event_contract_count = len(sdk_agent_token_events & installed_agent_events)
    installed_task_update_status_contract_count = len(sdk_task_update_statuses | installed_task_update_statuses)
    sdk_task_update_start_status_contract_count = len(sdk_task_update_start_statuses & sdk_task_update_statuses)
    sdk_task_update_completion_status_contract_count = len(
        sdk_task_update_completion_statuses & sdk_task_update_statuses
    )
    installed_task_update_start_status_contract_count = len(
        sdk_task_update_start_statuses & installed_task_update_statuses
    )
    installed_task_update_completion_status_contract_count = len(
        sdk_task_update_completion_statuses & installed_task_update_statuses
    )
    adapter_task_update_start_status_contract_count = len(
        sdk_task_update_start_statuses & adapter_task_update_statuses
    )
    adapter_task_update_completion_status_contract_count = len(
        sdk_task_update_completion_statuses & adapter_task_update_statuses
    )
    installed_task_update_variant_contract_count = len(
        set(sdk_task_update_variants) | set(installed_task_update_variants)
    )
    installed_action_result_status_contract_count = len(
        sdk_action_result_statuses | installed_action_result_statuses
    )
    action_result_terminal_status_contract_count = len(sdk_terminal_action_statuses)
    action_result_transient_coverage_contract_count = len(sdk_transient_action_statuses)
    action_result_terminal_coverage_contract_count = len(sdk_terminal_action_statuses)
    installed_action_result_terminal_status_contract_count = len(
        sdk_terminal_action_statuses & installed_action_result_statuses
    )
    installed_action_result_transient_status_contract_count = len(
        sdk_transient_action_statuses & installed_action_result_statuses
    )
    sdk_action_result_identity_contract_count = len(sdk_action_result_identity_fields & sdk_action_result_fields)
    sdk_action_result_payload_contract_count = len(sdk_action_result_payload_fields & sdk_action_result_fields)
    sdk_action_result_trace_contract_count = len(sdk_action_result_trace_fields & sdk_action_result_fields)
    sdk_action_result_execution_contract_count = len(sdk_action_result_execution_fields & sdk_action_result_fields)
    installed_action_result_identity_contract_count = len(
        sdk_action_result_identity_fields & installed_action_result_fields
    )
    installed_action_result_payload_contract_count = len(
        sdk_action_result_payload_fields & installed_action_result_fields
    )
    installed_action_result_trace_contract_count = len(
        sdk_action_result_trace_fields & installed_action_result_fields
    )
    installed_action_result_execution_contract_count = len(
        sdk_action_result_execution_fields & installed_action_result_fields
    )
    sdk_memory_origin_literal_contract_count = len(sdk_memory_origin_literal_contract & sdk_memory_origin_literals)
    sdk_memory_origin_template_contract_count = len(sdk_memory_origin_template_contract & sdk_memory_origin_templates)
    installed_memory_origin_literal_contract_count = len(
        sdk_memory_origin_literal_contract & installed_memory_origin_literals
    )
    installed_memory_origin_template_contract_count = len(
        sdk_memory_origin_template_contract & installed_memory_origin_templates
    )
    sdk_onboarding_seed_kind_contract_count = len(sdk_onboarding_seed_kind_contract & sdk_onboarding_seed_kinds)
    installed_onboarding_seed_kind_contract_count = len(
        sdk_onboarding_seed_kind_contract & installed_onboarding_seed_kinds
    )
    sdk_onboarding_seed_identity_contract_count = len(
        sdk_onboarding_seed_identity_fields & sdk_onboarding_seed_fields
    )
    sdk_onboarding_seed_action_contract_count = len(sdk_onboarding_seed_action_fields & sdk_onboarding_seed_fields)
    sdk_onboarding_seed_content_contract_count = len(
        sdk_onboarding_seed_content_fields & sdk_onboarding_seed_fields
    )
    installed_onboarding_seed_identity_contract_count = len(
        sdk_onboarding_seed_identity_fields & installed_onboarding_seed_fields
    )
    installed_onboarding_seed_action_contract_count = len(
        sdk_onboarding_seed_action_fields & installed_onboarding_seed_fields
    )
    installed_onboarding_seed_content_contract_count = len(
        sdk_onboarding_seed_content_fields & installed_onboarding_seed_fields
    )
    sdk_action_option_correlation_contract_count = len(
        sdk_action_option_correlation_fields & sdk_action_option_fields
    )
    sdk_action_option_attribution_contract_count = len(
        sdk_action_option_attribution_fields & sdk_action_option_fields
    )
    sdk_action_option_context_contract_count = len(sdk_action_option_context_fields & sdk_action_option_fields)
    sdk_action_option_execution_contract_count = len(sdk_action_option_execution_fields & sdk_action_option_fields)
    installed_action_option_correlation_contract_count = len(
        sdk_action_option_correlation_fields & installed_action_option_fields
    )
    installed_action_option_attribution_contract_count = len(
        sdk_action_option_attribution_fields & installed_action_option_fields
    )
    installed_action_option_context_contract_count = len(
        sdk_action_option_context_fields & installed_action_option_fields
    )
    installed_action_option_execution_contract_count = len(
        sdk_action_option_execution_fields & installed_action_option_fields
    )
    sdk_tool_report_identity_contract_count = len(sdk_tool_report_identity_fields & sdk_tool_report_fields)
    sdk_tool_report_tool_contract_count = len(sdk_tool_report_tool_fields & sdk_tool_report_fields)
    sdk_tool_report_outcome_contract_count = len(sdk_tool_report_outcome_fields & sdk_tool_report_fields)
    installed_tool_report_identity_contract_count = len(
        sdk_tool_report_identity_fields & installed_tool_report_fields
    )
    installed_tool_report_tool_contract_count = len(sdk_tool_report_tool_fields & installed_tool_report_fields)
    installed_tool_report_outcome_contract_count = len(
        sdk_tool_report_outcome_fields & installed_tool_report_fields
    )
    sdk_action_error_identity_contract_count = len(sdk_action_error_identity_fields & sdk_action_error_fields)
    sdk_action_error_detail_contract_count = len(sdk_action_error_detail_fields & sdk_action_error_fields)
    installed_action_error_identity_contract_count = len(
        sdk_action_error_identity_fields & installed_action_error_fields
    )
    installed_action_error_detail_contract_count = len(
        sdk_action_error_detail_fields & installed_action_error_fields
    )
    sdk_action_confirmation_identity_contract_count = len(
        sdk_action_confirmation_identity_fields & sdk_action_confirmation_fields
    )
    sdk_action_confirmation_content_contract_count = len(
        sdk_action_confirmation_content_fields & sdk_action_confirmation_fields
    )
    sdk_action_confirmation_timing_contract_count = len(
        sdk_action_confirmation_timing_fields & sdk_action_confirmation_fields
    )
    installed_action_confirmation_identity_contract_count = len(
        sdk_action_confirmation_identity_fields & installed_action_confirmation_fields
    )
    installed_action_confirmation_content_contract_count = len(
        sdk_action_confirmation_content_fields & installed_action_confirmation_fields
    )
    installed_action_confirmation_timing_contract_count = len(
        sdk_action_confirmation_timing_fields & installed_action_confirmation_fields
    )
    sdk_task_attachment_identity_contract_count = len(sdk_attachment_identity_fields & sdk_task_attachment_fields)
    sdk_task_attachment_name_type_contract_count = len(sdk_file_name_type_fields & sdk_task_attachment_fields)
    sdk_task_attachment_size_contract_count = len(sdk_file_size_fields & sdk_task_attachment_fields)
    sdk_task_attachment_url_contract_count = len(sdk_file_url_fields & sdk_task_attachment_fields)
    installed_task_attachment_identity_contract_count = len(
        sdk_attachment_identity_fields & installed_task_attachment_fields
    )
    installed_task_attachment_name_type_contract_count = len(
        sdk_file_name_type_fields & installed_task_attachment_fields
    )
    installed_task_attachment_size_contract_count = len(sdk_file_size_fields & installed_task_attachment_fields)
    installed_task_attachment_url_contract_count = len(sdk_file_url_fields & installed_task_attachment_fields)
    sdk_upload_result_name_type_contract_count = len(sdk_file_name_type_fields & sdk_upload_result_fields)
    sdk_upload_result_size_contract_count = len(sdk_file_size_fields & sdk_upload_result_fields)
    sdk_upload_result_url_contract_count = len(sdk_file_url_fields & sdk_upload_result_fields)
    installed_upload_result_name_type_contract_count = len(
        sdk_file_name_type_fields & installed_upload_result_fields
    )
    installed_upload_result_size_contract_count = len(sdk_file_size_fields & installed_upload_result_fields)
    installed_upload_result_url_contract_count = len(sdk_file_url_fields & installed_upload_result_fields)
    sdk_history_message_identity_contract_count = len(
        sdk_history_message_identity_fields & sdk_history_message_fields
    )
    sdk_history_message_content_status_contract_count = len(
        sdk_history_message_content_status_fields & sdk_history_message_fields
    )
    sdk_history_message_sender_contract_count = len(sdk_history_message_sender_fields & sdk_history_message_fields)
    sdk_history_message_thread_contract_count = len(sdk_history_message_thread_fields & sdk_history_message_fields)
    sdk_history_message_timestamp_contract_count = len(
        sdk_history_message_timestamp_fields & sdk_history_message_fields
    )
    sdk_history_message_attachment_contract_count = len(
        sdk_history_message_attachment_fields & sdk_history_message_fields
    )
    installed_history_message_identity_contract_count = len(
        sdk_history_message_identity_fields & installed_history_message_fields
    )
    installed_history_message_content_status_contract_count = len(
        sdk_history_message_content_status_fields & installed_history_message_fields
    )
    installed_history_message_sender_contract_count = len(
        sdk_history_message_sender_fields & installed_history_message_fields
    )
    installed_history_message_thread_contract_count = len(
        sdk_history_message_thread_fields & installed_history_message_fields
    )
    installed_history_message_timestamp_contract_count = len(
        sdk_history_message_timestamp_fields & installed_history_message_fields
    )
    installed_history_message_attachment_contract_count = len(
        sdk_history_message_attachment_fields & installed_history_message_fields
    )
    sdk_fetch_history_option_cursor_contract_count = len(
        sdk_fetch_history_option_cursor_fields & sdk_fetch_history_option_fields
    )
    sdk_fetch_history_option_pagination_contract_count = len(
        sdk_fetch_history_option_pagination_fields & sdk_fetch_history_option_fields
    )
    installed_fetch_history_option_cursor_contract_count = len(
        sdk_fetch_history_option_cursor_fields & installed_fetch_history_option_fields
    )
    installed_fetch_history_option_pagination_contract_count = len(
        sdk_fetch_history_option_pagination_fields & installed_fetch_history_option_fields
    )
    sdk_fetch_history_result_collection_contract_count = len(
        sdk_fetch_history_result_collection_fields & sdk_fetch_history_result_fields
    )
    sdk_fetch_history_result_pagination_contract_count = len(
        sdk_fetch_history_result_pagination_fields & sdk_fetch_history_result_fields
    )
    installed_fetch_history_result_collection_contract_count = len(
        sdk_fetch_history_result_collection_fields & installed_fetch_history_result_fields
    )
    installed_fetch_history_result_pagination_contract_count = len(
        sdk_fetch_history_result_pagination_fields & installed_fetch_history_result_fields
    )
    sdk_note_identity_contract_count = len(sdk_note_identity_fields & sdk_note_fields)
    sdk_note_creator_contract_count = len(sdk_note_creator_fields & sdk_note_fields)
    sdk_note_agent_attribution_contract_count = len(sdk_note_agent_attribution_fields & sdk_note_fields)
    sdk_note_content_contract_count = len(sdk_note_content_fields & sdk_note_fields)
    sdk_note_tag_contract_count = len(sdk_note_tag_fields & sdk_note_fields)
    sdk_note_timestamp_contract_count = len(sdk_note_timestamp_fields & sdk_note_fields)
    installed_note_identity_contract_count = len(sdk_note_identity_fields & installed_note_fields)
    installed_note_creator_contract_count = len(sdk_note_creator_fields & installed_note_fields)
    installed_note_agent_attribution_contract_count = len(
        sdk_note_agent_attribution_fields & installed_note_fields
    )
    installed_note_content_contract_count = len(sdk_note_content_fields & installed_note_fields)
    installed_note_tag_contract_count = len(sdk_note_tag_fields & installed_note_fields)
    installed_note_timestamp_contract_count = len(sdk_note_timestamp_fields & installed_note_fields)
    sdk_list_notes_option_pagination_contract_count = len(
        sdk_list_notes_option_pagination_fields & sdk_list_notes_option_fields
    )
    sdk_list_notes_option_filter_contract_count = len(
        sdk_list_notes_option_filter_fields & sdk_list_notes_option_fields
    )
    sdk_list_notes_option_archive_contract_count = len(
        sdk_list_notes_option_archive_fields & sdk_list_notes_option_fields
    )
    installed_list_notes_option_pagination_contract_count = len(
        sdk_list_notes_option_pagination_fields & installed_list_notes_option_fields
    )
    installed_list_notes_option_filter_contract_count = len(
        sdk_list_notes_option_filter_fields & installed_list_notes_option_fields
    )
    installed_list_notes_option_archive_contract_count = len(
        sdk_list_notes_option_archive_fields & installed_list_notes_option_fields
    )
    sdk_list_notes_result_collection_contract_count = len(
        sdk_list_notes_result_collection_fields & sdk_list_notes_result_fields
    )
    sdk_list_notes_result_pagination_contract_count = len(
        sdk_list_notes_result_pagination_fields & sdk_list_notes_result_fields
    )
    installed_list_notes_result_collection_contract_count = len(
        sdk_list_notes_result_collection_fields & installed_list_notes_result_fields
    )
    installed_list_notes_result_pagination_contract_count = len(
        sdk_list_notes_result_pagination_fields & installed_list_notes_result_fields
    )
    sdk_create_note_body_content_contract_count = len(
        sdk_create_note_body_content_fields & sdk_create_note_body_fields
    )
    sdk_create_note_body_tag_contract_count = len(sdk_create_note_body_tag_fields & sdk_create_note_body_fields)
    sdk_create_note_body_notebook_contract_count = len(
        sdk_create_note_body_notebook_fields & sdk_create_note_body_fields
    )
    installed_create_note_body_content_contract_count = len(
        sdk_create_note_body_content_fields & installed_create_note_body_fields
    )
    installed_create_note_body_tag_contract_count = len(
        sdk_create_note_body_tag_fields & installed_create_note_body_fields
    )
    installed_create_note_body_notebook_contract_count = len(
        sdk_create_note_body_notebook_fields & installed_create_note_body_fields
    )
    sdk_update_note_body_content_contract_count = len(
        sdk_update_note_body_content_fields & sdk_update_note_body_fields
    )
    sdk_update_note_body_tag_contract_count = len(sdk_update_note_body_tag_fields & sdk_update_note_body_fields)
    installed_update_note_body_content_contract_count = len(
        sdk_update_note_body_content_fields & installed_update_note_body_fields
    )
    installed_update_note_body_tag_contract_count = len(
        sdk_update_note_body_tag_fields & installed_update_note_body_fields
    )
    sdk_query_memory_option_query_contract_count = len(
        sdk_query_memory_option_query_fields & sdk_query_memory_option_fields
    )
    sdk_query_memory_option_pagination_contract_count = len(
        sdk_query_memory_option_pagination_fields & sdk_query_memory_option_fields
    )
    installed_query_memory_option_query_contract_count = len(
        sdk_query_memory_option_query_fields & installed_query_memory_option_fields
    )
    installed_query_memory_option_pagination_contract_count = len(
        sdk_query_memory_option_pagination_fields & installed_query_memory_option_fields
    )
    sdk_memory_entry_content_contract_count = len(sdk_memory_entry_content_fields & sdk_memory_entry_fields)
    sdk_memory_entry_classification_contract_count = len(
        sdk_memory_entry_classification_fields & sdk_memory_entry_fields
    )
    sdk_memory_entry_scoring_contract_count = len(sdk_memory_entry_scoring_fields & sdk_memory_entry_fields)
    installed_memory_entry_content_contract_count = len(
        sdk_memory_entry_content_fields & installed_memory_entry_fields
    )
    installed_memory_entry_classification_contract_count = len(
        sdk_memory_entry_classification_fields & installed_memory_entry_fields
    )
    installed_memory_entry_scoring_contract_count = len(
        sdk_memory_entry_scoring_fields & installed_memory_entry_fields
    )
    sdk_share_note_result_identity_contract_count = len(
        sdk_share_note_result_identity_fields & sdk_share_note_result_fields
    )
    sdk_share_note_result_display_contract_count = len(
        sdk_share_note_result_display_fields & sdk_share_note_result_fields
    )
    sdk_share_note_result_tag_contract_count = len(
        sdk_share_note_result_tag_fields & sdk_share_note_result_fields
    )
    installed_share_note_result_identity_contract_count = len(
        sdk_share_note_result_identity_fields & installed_share_note_result_fields
    )
    installed_share_note_result_display_contract_count = len(
        sdk_share_note_result_display_fields & installed_share_note_result_fields
    )
    installed_share_note_result_tag_contract_count = len(
        sdk_share_note_result_tag_fields & installed_share_note_result_fields
    )
    sdk_skill_prompt_content_contract_count = len(sdk_skill_prompt_content_fields & sdk_skill_prompt_fields)
    sdk_skill_prompt_template_contract_count = len(sdk_skill_prompt_template_fields & sdk_skill_prompt_fields)
    sdk_skill_prompt_parameter_contract_count = len(sdk_skill_prompt_parameter_fields & sdk_skill_prompt_fields)
    installed_skill_prompt_content_contract_count = len(
        sdk_skill_prompt_content_fields & installed_skill_prompt_fields
    )
    installed_skill_prompt_template_contract_count = len(
        sdk_skill_prompt_template_fields & installed_skill_prompt_fields
    )
    installed_skill_prompt_parameter_contract_count = len(
        sdk_skill_prompt_parameter_fields & installed_skill_prompt_fields
    )
    sdk_kanban_board_identity_contract_count = len(sdk_kanban_board_identity_fields & sdk_kanban_board_fields)
    sdk_kanban_board_display_contract_count = len(sdk_kanban_board_display_fields & sdk_kanban_board_fields)
    sdk_kanban_board_timestamp_contract_count = len(sdk_kanban_board_timestamp_fields & sdk_kanban_board_fields)
    installed_kanban_board_identity_contract_count = len(
        sdk_kanban_board_identity_fields & installed_kanban_board_fields
    )
    installed_kanban_board_display_contract_count = len(
        sdk_kanban_board_display_fields & installed_kanban_board_fields
    )
    installed_kanban_board_timestamp_contract_count = len(
        sdk_kanban_board_timestamp_fields & installed_kanban_board_fields
    )
    sdk_kanban_column_identity_contract_count = len(sdk_kanban_column_identity_fields & sdk_kanban_column_fields)
    sdk_kanban_column_parent_contract_count = len(sdk_kanban_column_parent_fields & sdk_kanban_column_fields)
    sdk_kanban_column_display_contract_count = len(sdk_kanban_column_display_fields & sdk_kanban_column_fields)
    sdk_kanban_column_ordering_contract_count = len(sdk_kanban_column_ordering_fields & sdk_kanban_column_fields)
    installed_kanban_column_identity_contract_count = len(
        sdk_kanban_column_identity_fields & installed_kanban_column_fields
    )
    installed_kanban_column_parent_contract_count = len(
        sdk_kanban_column_parent_fields & installed_kanban_column_fields
    )
    installed_kanban_column_display_contract_count = len(
        sdk_kanban_column_display_fields & installed_kanban_column_fields
    )
    installed_kanban_column_ordering_contract_count = len(
        sdk_kanban_column_ordering_fields & installed_kanban_column_fields
    )
    sdk_kanban_card_identity_contract_count = len(sdk_kanban_card_identity_fields & sdk_kanban_card_fields)
    sdk_kanban_card_placement_contract_count = len(sdk_kanban_card_placement_fields & sdk_kanban_card_fields)
    sdk_kanban_card_content_contract_count = len(sdk_kanban_card_content_fields & sdk_kanban_card_fields)
    sdk_kanban_card_scheduling_contract_count = len(
        sdk_kanban_card_scheduling_fields & sdk_kanban_card_fields
    )
    sdk_kanban_card_creator_contract_count = len(sdk_kanban_card_creator_fields & sdk_kanban_card_fields)
    sdk_kanban_card_timestamp_contract_count = len(sdk_kanban_card_timestamp_fields & sdk_kanban_card_fields)
    sdk_kanban_card_archive_contract_count = len(sdk_kanban_card_archive_fields & sdk_kanban_card_fields)
    installed_kanban_card_identity_contract_count = len(
        sdk_kanban_card_identity_fields & installed_kanban_card_fields
    )
    installed_kanban_card_placement_contract_count = len(
        sdk_kanban_card_placement_fields & installed_kanban_card_fields
    )
    installed_kanban_card_content_contract_count = len(
        sdk_kanban_card_content_fields & installed_kanban_card_fields
    )
    installed_kanban_card_scheduling_contract_count = len(
        sdk_kanban_card_scheduling_fields & installed_kanban_card_fields
    )
    installed_kanban_card_creator_contract_count = len(
        sdk_kanban_card_creator_fields & installed_kanban_card_fields
    )
    installed_kanban_card_timestamp_contract_count = len(
        sdk_kanban_card_timestamp_fields & installed_kanban_card_fields
    )
    installed_kanban_card_archive_contract_count = len(
        sdk_kanban_card_archive_fields & installed_kanban_card_fields
    )
    sdk_list_boards_result_board_contract_count = len(
        sdk_list_boards_result_board_fields & sdk_list_boards_result_fields
    )
    sdk_list_boards_result_column_contract_count = len(
        sdk_list_boards_result_column_fields & sdk_list_boards_result_fields
    )
    sdk_list_boards_result_card_contract_count = len(
        sdk_list_boards_result_card_fields & sdk_list_boards_result_fields
    )
    installed_list_boards_result_board_contract_count = len(
        sdk_list_boards_result_board_fields & installed_list_boards_result_fields
    )
    installed_list_boards_result_column_contract_count = len(
        sdk_list_boards_result_column_fields & installed_list_boards_result_fields
    )
    installed_list_boards_result_card_contract_count = len(
        sdk_list_boards_result_card_fields & installed_list_boards_result_fields
    )
    sdk_kanban_label_identity_contract_count = len(sdk_kanban_label_identity_fields & sdk_kanban_label_fields)
    sdk_kanban_label_parent_contract_count = len(sdk_kanban_label_parent_fields & sdk_kanban_label_fields)
    sdk_kanban_label_display_contract_count = len(sdk_kanban_label_display_fields & sdk_kanban_label_fields)
    sdk_kanban_label_color_contract_count = len(sdk_kanban_label_color_fields & sdk_kanban_label_fields)
    installed_kanban_label_identity_contract_count = len(
        sdk_kanban_label_identity_fields & installed_kanban_label_fields
    )
    installed_kanban_label_parent_contract_count = len(
        sdk_kanban_label_parent_fields & installed_kanban_label_fields
    )
    installed_kanban_label_display_contract_count = len(
        sdk_kanban_label_display_fields & installed_kanban_label_fields
    )
    installed_kanban_label_color_contract_count = len(
        sdk_kanban_label_color_fields & installed_kanban_label_fields
    )
    sdk_create_board_body_display_contract_count = len(
        sdk_create_board_body_display_fields & sdk_create_board_body_fields
    )
    sdk_create_board_body_column_contract_count = len(
        sdk_create_board_body_column_fields & sdk_create_board_body_fields
    )
    installed_create_board_body_display_contract_count = len(
        sdk_create_board_body_display_fields & installed_create_board_body_fields
    )
    installed_create_board_body_column_contract_count = len(
        sdk_create_board_body_column_fields & installed_create_board_body_fields
    )
    sdk_update_board_body_display_contract_count = len(
        sdk_update_board_body_display_fields & sdk_update_board_body_fields
    )
    installed_update_board_body_display_contract_count = len(
        sdk_update_board_body_display_fields & installed_update_board_body_fields
    )
    sdk_create_card_body_content_contract_count = len(
        sdk_create_card_body_content_fields & sdk_create_card_body_fields
    )
    sdk_create_card_body_placement_contract_count = len(
        sdk_create_card_body_placement_fields & sdk_create_card_body_fields
    )
    installed_create_card_body_content_contract_count = len(
        sdk_create_card_body_content_fields & installed_create_card_body_fields
    )
    installed_create_card_body_placement_contract_count = len(
        sdk_create_card_body_placement_fields & installed_create_card_body_fields
    )
    sdk_update_card_body_content_contract_count = len(
        sdk_update_card_body_content_fields & sdk_update_card_body_fields
    )
    sdk_update_card_body_placement_contract_count = len(
        sdk_update_card_body_placement_fields & sdk_update_card_body_fields
    )
    sdk_update_card_body_ordering_contract_count = len(
        sdk_update_card_body_ordering_fields & sdk_update_card_body_fields
    )
    installed_update_card_body_content_contract_count = len(
        sdk_update_card_body_content_fields & installed_update_card_body_fields
    )
    installed_update_card_body_placement_contract_count = len(
        sdk_update_card_body_placement_fields & installed_update_card_body_fields
    )
    installed_update_card_body_ordering_contract_count = len(
        sdk_update_card_body_ordering_fields & installed_update_card_body_fields
    )
    sdk_create_column_body_display_contract_count = len(
        sdk_create_column_body_display_fields & sdk_create_column_body_fields
    )
    sdk_create_column_body_ordering_contract_count = len(
        sdk_create_column_body_ordering_fields & sdk_create_column_body_fields
    )
    installed_create_column_body_display_contract_count = len(
        sdk_create_column_body_display_fields & installed_create_column_body_fields
    )
    installed_create_column_body_ordering_contract_count = len(
        sdk_create_column_body_ordering_fields & installed_create_column_body_fields
    )
    sdk_update_column_body_display_contract_count = len(
        sdk_update_column_body_display_fields & sdk_update_column_body_fields
    )
    sdk_update_column_body_ordering_contract_count = len(
        sdk_update_column_body_ordering_fields & sdk_update_column_body_fields
    )
    installed_update_column_body_display_contract_count = len(
        sdk_update_column_body_display_fields & installed_update_column_body_fields
    )
    installed_update_column_body_ordering_contract_count = len(
        sdk_update_column_body_ordering_fields & installed_update_column_body_fields
    )
    sdk_add_commit_body_commit_contract_count = len(sdk_add_commit_body_commit_fields & sdk_add_commit_body_fields)
    sdk_add_commit_body_content_contract_count = len(
        sdk_add_commit_body_content_fields & sdk_add_commit_body_fields
    )
    installed_add_commit_body_commit_contract_count = len(
        sdk_add_commit_body_commit_fields & installed_add_commit_body_fields
    )
    installed_add_commit_body_content_contract_count = len(
        sdk_add_commit_body_content_fields & installed_add_commit_body_fields
    )
    sdk_create_label_body_display_contract_count = len(
        sdk_create_label_body_display_fields & sdk_create_label_body_fields
    )
    sdk_create_label_body_color_contract_count = len(
        sdk_create_label_body_color_fields & sdk_create_label_body_fields
    )
    installed_create_label_body_display_contract_count = len(
        sdk_create_label_body_display_fields & installed_create_label_body_fields
    )
    installed_create_label_body_color_contract_count = len(
        sdk_create_label_body_color_fields & installed_create_label_body_fields
    )
    sdk_update_label_body_display_contract_count = len(
        sdk_update_label_body_display_fields & sdk_update_label_body_fields
    )
    sdk_update_label_body_color_contract_count = len(
        sdk_update_label_body_color_fields & sdk_update_label_body_fields
    )
    installed_update_label_body_display_contract_count = len(
        sdk_update_label_body_display_fields & installed_update_label_body_fields
    )
    installed_update_label_body_color_contract_count = len(
        sdk_update_label_body_color_fields & installed_update_label_body_fields
    )
    sdk_card_commit_identity_contract_count = len(sdk_card_commit_identity_fields & sdk_card_commit_fields)
    sdk_card_commit_content_contract_count = len(sdk_card_commit_content_fields & sdk_card_commit_fields)
    sdk_card_commit_timestamp_contract_count = len(sdk_card_commit_timestamp_fields & sdk_card_commit_fields)
    installed_card_commit_identity_contract_count = len(
        sdk_card_commit_identity_fields & installed_card_commit_fields
    )
    installed_card_commit_content_contract_count = len(
        sdk_card_commit_content_fields & installed_card_commit_fields
    )
    installed_card_commit_timestamp_contract_count = len(
        sdk_card_commit_timestamp_fields & installed_card_commit_fields
    )
    sdk_card_note_identity_contract_count = len(sdk_card_note_identity_fields & sdk_card_note_fields)
    sdk_card_note_display_contract_count = len(sdk_card_note_display_fields & sdk_card_note_fields)
    sdk_card_note_tag_contract_count = len(sdk_card_note_tag_fields & sdk_card_note_fields)
    sdk_card_note_timestamp_contract_count = len(sdk_card_note_timestamp_fields & sdk_card_note_fields)
    installed_card_note_identity_contract_count = len(
        sdk_card_note_identity_fields & installed_card_note_fields
    )
    installed_card_note_display_contract_count = len(
        sdk_card_note_display_fields & installed_card_note_fields
    )
    installed_card_note_tag_contract_count = len(sdk_card_note_tag_fields & installed_card_note_fields)
    installed_card_note_timestamp_contract_count = len(
        sdk_card_note_timestamp_fields & installed_card_note_fields
    )
    sdk_archived_cards_result_collection_contract_count = len(
        sdk_archived_cards_result_collection_fields & sdk_archived_cards_result_fields
    )
    sdk_archived_cards_result_pagination_contract_count = len(
        sdk_archived_cards_result_pagination_fields & sdk_archived_cards_result_fields
    )
    installed_archived_cards_result_collection_contract_count = len(
        sdk_archived_cards_result_collection_fields & installed_archived_cards_result_fields
    )
    installed_archived_cards_result_pagination_contract_count = len(
        sdk_archived_cards_result_pagination_fields & installed_archived_cards_result_fields
    )
    sdk_runtime_info_identity_contract_count = len(sdk_runtime_info_identity_fields & sdk_runtime_info_fields)
    sdk_runtime_info_environment_contract_count = len(
        sdk_runtime_info_environment_fields & sdk_runtime_info_fields
    )
    installed_runtime_info_identity_contract_count = len(
        sdk_runtime_info_identity_fields & installed_runtime_info_fields
    )
    installed_runtime_info_environment_contract_count = len(
        sdk_runtime_info_environment_fields & installed_runtime_info_fields
    )
    adapter_task_update_status_contract_count = len(adapter_task_update_statuses)
    sidecar_agent_event_contract_count = len(sdk_agent_events)
    sidecar_check_method_missing = sorted((exposed - INTENTIONALLY_LOCAL) - checked_agent_methods)
    sidecar_check_method_stale = sorted(checked_agent_methods - exposed)
    sidecar_check_method_contract_count = len(exposed & checked_agent_methods)
    sidecar_http_method_missing = sorted((sdk_http_methods & exposed) - checked_http_methods)
    sidecar_http_method_stale = sorted(checked_http_methods - exposed)
    http_method_contract_count = len(sdk_http_methods & exposed)
    http_message_file_history_methods = {"sendMessage", "uploadFile", "fetchHistory"}
    http_note_methods = {"listNotes", "createNote", "updateNote", "deleteNote", "shareNote"}
    http_kanban_methods = {
        "listBoards",
        "createCard",
        "updateCard",
        "createBoard",
        "updateBoard",
        "archiveBoard",
        "listColumns",
        "createColumn",
        "updateColumn",
        "deleteColumn",
        "reorderColumns",
        "listCards",
        "completeCard",
        "listArchivedCards",
        "addCardCommit",
        "listCardCommits",
        "linkCardNote",
        "unlinkCardNote",
        "listCardNotes",
        "listLabels",
        "createLabel",
        "updateLabel",
        "deleteLabel",
        "addCardLabel",
        "removeCardLabel",
    }
    http_memory_skill_methods = {"queryMemory", "fetchSkillPrompt"}
    http_method_category_members = (
        http_message_file_history_methods | http_note_methods | http_kanban_methods | http_memory_skill_methods
    )
    http_method_category_drift = {}
    if (sdk_http_methods & exposed) - http_method_category_members:
        http_method_category_drift["uncategorized"] = sorted((sdk_http_methods & exposed) - http_method_category_members)
    if http_method_category_members - (sdk_http_methods & exposed):
        http_method_category_drift["stale"] = sorted(http_method_category_members - (sdk_http_methods & exposed))
    http_message_file_history_contract_count = len(http_message_file_history_methods)
    http_note_contract_count = len(http_note_methods)
    http_kanban_contract_count = len(http_kanban_methods)
    http_memory_skill_contract_count = len(http_memory_skill_methods)
    http_runtime_method_drift = sorted(set(expected_http_runtime_methods) ^ (sdk_http_methods & exposed))
    http_runtime_method_order_drift = expected_http_runtime_methods != [
        method for method in sidecar_ordered if method in (sdk_http_methods & exposed)
    ]
    http_runtime_method_contract_count = len(expected_http_runtime_methods)
    http_runtime_method_order_contract_count = len(expected_http_runtime_methods)
    sidecar_check_task_method_missing = sorted(exposed_task - checked_task_methods)
    sidecar_check_task_method_stale = sorted(checked_task_methods - exposed_task)
    sidecar_check_task_contract_count = len(exposed_task & checked_task_methods)
    task_runtime_method_drift = sorted(set(expected_task_runtime_methods) ^ exposed_task)
    task_runtime_method_order_drift = expected_task_runtime_methods != sidecar_task_ordered
    sdk_error_unwired = (
        "error" in sdk_agent_events
        and (
            '"/sdk-error"' not in sidecar_source
            or '"/sdk-error"' not in adapter_source
            or "_handle_sdk_error" not in adapter_source
        )
    )
    token_claimed_payload_coverage_missing = (
        sdk_token_claimed_fields != {"agentId", "permanentToken"}
        or 'agent.emit("token_claimed", { agentId: "agent-1", permanentToken: "ari_perm" })'
        not in sidecar_runtime_check_source
        or 'tokenEvent.body.agentId, "agent-1"' not in sidecar_runtime_check_source
        or 'tokenEvent.body.permanentToken, "ari_perm"' not in sidecar_runtime_check_source
        or "function isTokenClaimedData" not in sidecar_source
        or '(typeof data.agentId === "string" || data.agentId === null)' not in sidecar_source
        or 'typeof data.permanentToken === "string"' not in sidecar_source
        or 'data.permanentToken.trim() !== ""' not in sidecar_source
        or 'permanentToken: "ari_null_agent_perm"' not in sidecar_runtime_check_source
        or "malformed token_claimed should not be forwarded to Hermes" not in sidecar_runtime_check_source
        or "blank token_claimed token should not be forwarded to Hermes" not in sidecar_runtime_check_source
        or "const agentId = connected && typeof agent.getAgentId" not in sidecar_source
        or "typeof agentId === \"string\" && agentId ? { agentId } : {}" not in sidecar_source
        or "malformed getAgentId should not be forwarded to Hermes connection status" not in sidecar_runtime_check_source
        or "function healthBody" not in sidecar_runtime_check_source
        or 'agentId: "agent-1"' not in sidecar_runtime_check_source
        or "healthBody(true, 0)" not in sidecar_runtime_check_source
        or 'payload.get("agentId")' not in adapter_source
        or 'payload.get("permanentToken")' not in adapter_source
        or 'self.config.token = permanent_token' not in adapter_source
        or 'self.config.extra["bot_token"] = permanent_token' not in adapter_source
        or 'adapter.config.extra.get("bot_token") != "ari_perm"' not in hermes_plugin_load_source
        or "adapter did not record token_claimed state" not in hermes_plugin_load_source
        or "adapter did not record token_claimed state without agent id" not in hermes_plugin_load_source
        or "adapter accepted malformed token_claimed state" not in hermes_plugin_load_source
        or "adapter accepted blank token_claimed token" not in hermes_plugin_load_source
        or "_wait_for_sidecar recorded malformed healthz agent id" not in hermes_plugin_load_source
        or "adapter accepted malformed connection-status agent id" not in hermes_plugin_load_source
    )
    sdk_token_claimed_field_drift = {}
    sdk_token_claimed_field_contract = {"agentId", "permanentToken"}
    if sdk_token_claimed_fields - sdk_token_claimed_field_contract:
        sdk_token_claimed_field_drift["uncategorized"] = sorted(
            sdk_token_claimed_fields - sdk_token_claimed_field_contract
        )
    if sdk_token_claimed_field_contract - sdk_token_claimed_fields:
        sdk_token_claimed_field_drift["missing"] = sorted(
            sdk_token_claimed_field_contract - sdk_token_claimed_fields
        )
    runtime_token_claimed_field_drift = {}
    if installed_token_claimed_fields - sdk_token_claimed_field_contract:
        runtime_token_claimed_field_drift["uncategorized"] = sorted(
            installed_token_claimed_fields - sdk_token_claimed_field_contract
        )
    if sdk_token_claimed_field_contract - installed_token_claimed_fields:
        runtime_token_claimed_field_drift["missing"] = sorted(
            sdk_token_claimed_field_contract - installed_token_claimed_fields
        )
    token_claimed_required_field_drift = {}
    if sdk_token_claimed_required_fields != sdk_token_claimed_field_contract:
        token_claimed_required_field_drift["sdk"] = {
            "expected": sorted(sdk_token_claimed_field_contract),
            "actual": sorted(sdk_token_claimed_required_fields),
        }
    if installed_token_claimed_required_fields != sdk_token_claimed_field_contract:
        token_claimed_required_field_drift["installed"] = {
            "expected": sorted(sdk_token_claimed_field_contract),
            "actual": sorted(installed_token_claimed_required_fields),
        }
    sidecar_token_claimed_nullable_agent_contract_missing = (
        "TokenClaimedData" not in sdk_types
        or '(typeof data.agentId === "string" || data.agentId === null)' not in sidecar_source
        or 'permanentToken: "ari_null_agent_perm"' not in sidecar_runtime_check_source
        or "adapter did not record token_claimed state without agent id" not in hermes_plugin_load_source
    )
    sdk_token_claimed_field_contract_count = len(sdk_token_claimed_field_contract & sdk_token_claimed_fields)
    installed_token_claimed_field_contract_count = len(
        sdk_token_claimed_field_contract & installed_token_claimed_fields
    )
    token_claimed_required_field_contract_count = len(
        sdk_token_claimed_field_contract & sdk_token_claimed_required_fields & installed_token_claimed_required_fields
    )
    sidecar_token_claimed_nullable_agent_contract_count = 1
    onboarding_seed_fields = interface_fields(sdk_types, "OnboardingSeed")
    onboarding_seed_contract_missing = (
        onboarding_seed_fields != {"kind", "seedId", "agentId", "action", "prompt"}
        or "function isOnboardingSeed" not in sidecar_source
        or "const pendingOnboardingSeeds = new Set();" not in sidecar_source
        or any(f"typeof seed.{field} === \"string\"" not in sidecar_source for field in ("seedId", "agentId", "action", "prompt"))
        or 'seed.kind === "first_touch_opening"' not in sidecar_source
        or "forwardedOnboardingSeeds.has(seed.seedId) || pendingOnboardingSeeds.has(seed.seedId)" not in sidecar_source
        or "pendingOnboardingSeeds.add(seed.seedId);" not in sidecar_source
        or "forwardedOnboardingSeeds.add(seed.seedId);" not in sidecar_source
        or "pendingOnboardingSeeds.delete(seed.seedId);" not in sidecar_source
        or '{ kind: "first_touch_opening", seedId: "seed-1", agentId: "agent-1", action: "open", prompt: "hello" }'
        not in sidecar_runtime_check_source
        or 'assert.deepEqual(emptySeedEvent.body, { kind: "first_touch_opening", seedId: "", agentId: "", action: "", prompt: "" })'
        not in sidecar_runtime_check_source
        or 'seedId: "seed-retry"' not in sidecar_runtime_check_source
        or "successful onboarding seed retry should be marked forwarded" not in sidecar_runtime_check_source
        or 'agent.getOnboardingSeed().prompt, "Say hello"' not in sidecar_e2e_check_source
        or 'seedEvent.body.seedId, "seed-1"' not in sidecar_e2e_check_source
        or 'seedEvent.body.prompt, "Say hello"' not in sidecar_e2e_check_source
        or '"malformed-seed"' not in sidecar_e2e_check_source
        or "malformed auth_ok onboardingSeed should not be forwarded" not in sidecar_e2e_check_source
        or "def _sdk_onboarding_seed(value: object) -> bool:" not in live_connection_source
        or "not _sdk_onboarding_seed(onboarding_seed)" not in live_connection_source
        or "SDK getOnboardingSeed() returned malformed seed" not in live_connection_source
        or "adapter accepted malformed onboarding seed state" not in hermes_plugin_load_source
        or "adapter rejected SDK-valid empty-string onboarding seed state" not in hermes_plugin_load_source
        or '"seedId": ""' not in hermes_plugin_load_source
        or '"agentId": ""' not in hermes_plugin_load_source
        or '"action": ""' not in hermes_plugin_load_source
        or '"prompt": ""' not in hermes_plugin_load_source
    )
    onboarding_seed_contract_count = 1
    control_result_contract_missing = (
        "result: result ?? null" not in sidecar_source
        or "assertJsonCompliant" not in sidecar_source
        or "contains a non-finite number" not in sidecar_source
        or 'assertJsonCompliant(parsed, "control request body")' not in sidecar_source
        or "throw new ControlRequestError(error instanceof Error ? error.message : String(error))" not in sidecar_source
        or "function controlContentLength" not in sidecar_source
        or "control request Content-Length is required" not in sidecar_source
        or "control request Content-Length must be a non-negative integer" not in sidecar_source
        or "readJson(rawJsonRequest" not in sidecar_runtime_check_source
        or '"content-length": "not-a-number"' not in sidecar_runtime_check_source
        or '"content-length": "-1"' not in sidecar_runtime_check_source
        or "control request without Content-Length must be rejected before reading body" not in sidecar_runtime_check_source
        or "postWithoutContentLength" not in sidecar_runtime_check_source
        or "control request without Content-Length dispatched to the SDK" not in sidecar_runtime_check_source
        or "function assertNoDuplicateJsonKeys" not in sidecar_source
        or "JSON object contains duplicate key" not in sidecar_source
        or "duplicateKeyJson" not in sidecar_runtime_check_source
        or "nestedDuplicateKeyJson" not in sidecar_runtime_check_source
        or "duplicate key: value" not in sidecar_runtime_check_source
        or 'assertJsonCompliant(body, "adapter callback")' not in sidecar_source
        or "adapter acknowledgement" not in sidecar_source
        or "returned non-JSON response content type" not in sidecar_source
        or "returned malformed JSON acknowledgement" not in sidecar_source
        or "returned malformed acknowledgement" not in sidecar_source
        or "returned unsuccessful acknowledgement" not in sidecar_source
        or "nonJsonAckAdapter" not in sidecar_runtime_check_source
        or "malformedAckAdapter" not in sidecar_runtime_check_source
        or "emptyAckAdapter" not in sidecar_runtime_check_source
        or "duplicateKeyAckAdapter" not in sidecar_runtime_check_source
        or "nonfiniteAckAdapter" not in sidecar_runtime_check_source
        or "nonObjectAckAdapter" not in sidecar_runtime_check_source
        or "unsuccessfulAckAdapter" not in sidecar_runtime_check_source
        or 'async sendTelemetry(event, data)' not in sidecar_runtime_check_source
        or 'method: "sendTelemetry", args: ["runtime.undefined", { ok: true }]' not in sidecar_runtime_check_source
        or "{ ok: true, result: null }" not in sidecar_runtime_check_source
        or 'agent.calls.at(-1), ["sendTelemetry", "runtime.undefined", { ok: true }]' not in sidecar_runtime_check_source
        or 'assert.equal(await callAgentSdk("sendMessage", ["conv-1", "proactive hello"]), null)' not in sidecar_e2e_check_source
        or 'assert.equal(await callAgentSdk("sendTelemetry", ["smoke", { ok: true }]), null)' not in sidecar_e2e_check_source
        or 'assert.equal(await callAgentSdk("sendHud", [{ status: "green" }, "conv-1"]), null)' not in sidecar_e2e_check_source
        or 'assert.equal(await callAgentSdk("sendHud", [{ status: "global" }]), null)' not in sidecar_e2e_check_source
        or 'assert.equal(await callAgentSdk("sendTaskUpdate", ["Hermes", { status: "started", task: "smoke" }]), null)' not in sidecar_e2e_check_source
        or 'assert.equal(await callAgentSdk("reportToolCall", [{' not in sidecar_e2e_check_source
        or "nonfiniteAgentResult" not in sidecar_runtime_check_source
        or "nonfiniteControlRequest" not in sidecar_runtime_check_source
        or "control request body\\.args\\[0\\]\\.output\\.value contains a non-finite number" not in sidecar_runtime_check_source
        or "nonfiniteTaskResult" not in sidecar_runtime_check_source
        or "adapterEventsBeforeNonfiniteCallback" not in sidecar_runtime_check_source
        or "adapter callback\\.score contains a non-finite number" not in sidecar_runtime_check_source
        or "function rejectUnknownFields" not in sidecar_source
        or "control request body has unsupported field(s)" not in sidecar_source
        or "unknownAgentField" not in sidecar_runtime_check_source
        or "badAgentMethod" not in sidecar_runtime_check_source
        or "badAgentMethodObjectArgs" not in sidecar_runtime_check_source
        or "badAgentMethodExtraArgs" not in sidecar_runtime_check_source
        or "unknownTaskField" not in sidecar_runtime_check_source
        or "unknownChunkField" not in sidecar_runtime_check_source
        or "unknownCompleteField" not in sidecar_runtime_check_source
        or "unknownErrorField" not in sidecar_runtime_check_source
        or 'if (req.method === "POST" && path === "/healthz")' not in sidecar_source
        or 'if (req.method === "POST" && path === "/shutdown")' not in sidecar_source
        or "unknownHealthzField" not in sidecar_runtime_check_source
        or "unknownShutdownField" not in sidecar_runtime_check_source
        or "assert.equal(shutdownCalls, 0)" not in sidecar_runtime_check_source
        or '(await post("/chunk", { taskId: "task-1", content: "delta" })).body, { ok: true }'
        not in sidecar_runtime_check_source
        or "missingChunkContent" not in sidecar_runtime_check_source
        or '(await post("/complete", { taskId: "  task-1  ", content: "done", mentions: ["user-1", "", "agent-1"] })).body'
        not in sidecar_runtime_check_source
        or 'badCompleteMentions' not in sidecar_runtime_check_source
        or "mentions must be an array when provided" not in sidecar_runtime_check_source
        or "mentions must be an array when provided" not in sidecar_source
        or "badCompleteMentionItems" not in sidecar_runtime_check_source
        or "mentions items must be strings" not in sidecar_runtime_check_source
        or "mentions items must be strings" not in sidecar_source
        or 'mention.trim() !== ""' not in sidecar_source
        or 'const arrayJson = await postRaw("/agent-sdk", "[]")' not in sidecar_runtime_check_source
        or 'const nullJson = await postRaw("/task-sdk", "null")' not in sidecar_runtime_check_source
        or "control request body must be a JSON object" not in sidecar_source
    )
    control_result_contract_count = 1
    sdk_upload_mime_types = js_string_map(sdk_client_source, "MIME_TYPES")
    http_upload_mime_contract_drift = (
        js_string_map(sidecar_http_check_source, "EXPECTED_UPLOAD_MIME_TYPES") != sdk_upload_mime_types
        or python_string_map(adapter_source, "SDK_UPLOAD_MIME_TYPES") != sdk_upload_mime_types
        or "_sdk_mime_type" not in adapter_source
        or "arinova-unknown.blobx" not in hermes_plugin_load_source
        or "standalone unknown-extension upload did not use SDK MIME fallback" not in hermes_plugin_load_source
        or "unknown.blobx" not in sidecar_http_check_source
        or "Content-Type: application\\/octet-stream" not in sidecar_http_check_source
        or '"application/octet-stream"' not in sidecar_http_check_source
        or "Content-Type: text\\/plain" not in sidecar_http_check_source
    )
    http_upload_mime_contract_count = 1
    http_error_coverage_missing = (
        "async function sdkError" not in sidecar_http_check_source
        or 'await sdk("sendMessage", ["conv-empty", ""])' not in sidecar_http_check_source
        or '{ conversationId: "conv-empty", content: "" }' not in sidecar_http_check_source
        or "sendMessage failed \\(404\\): invalid conversation" not in sidecar_http_check_source
        or "invalid conversation" not in sidecar_http_check_source
        or "updateCard failed \\(409\\): card locked" not in sidecar_http_check_source
        or "card locked" not in sidecar_http_check_source
        or "Upload failed \\(413\\): file too large" not in sidecar_http_check_source
        or "huge.bin" not in sidecar_http_check_source
        or "duplicate-json.bin" not in sidecar_http_check_source
        or "uploadFile returned malformed JSON: JSON object contains duplicate key: url" not in sidecar_http_check_source
        or "fetchHistory failed \\(400\\): cursor expired" not in sidecar_http_check_source
        or "fetchHistory returned malformed JSON: JSON object contains duplicate key: messages" not in sidecar_http_check_source
        or "listNotes failed \\(410\\): notes expired" not in sidecar_http_check_source
        or "bad-note-cursor" not in sidecar_http_check_source
        or '?before=bad-note-cursor' not in sidecar_http_check_source
        or '?limit=0&offset=0' not in sidecar_http_check_source
        or 'request.search === ""' not in sidecar_http_check_source
        or '?conversationId=conv-1' in sidecar_http_check_source
        or "createNote failed \\(422\\): note invalid" not in sidecar_http_check_source
        or "Bad Note" not in sidecar_http_check_source
        or "Duplicate Json Note" not in sidecar_http_check_source
        or 'requestsFor("POST", "/api/v1/notes")[3]' not in sidecar_http_check_source
        or "updateNote failed \\(423\\): note locked" not in sidecar_http_check_source
        or "note-locked" not in sidecar_http_check_source
        or '"note/slash"' not in sidecar_http_check_source
        or '"/api/v1/notes/note%2Fslash"' not in sidecar_http_check_source
        or 'searchParams(requestFor("PATCH", "/api/v1/notes/note-locked"))' not in sidecar_http_check_source
        or 'searchParams(requestFor("PATCH", "/api/v1/notes/note-1"))' not in sidecar_http_check_source
        or 'searchParams(requestFor("PATCH", "/api/v1/notes/note-1"))), {})' not in sidecar_http_check_source
        or "deleteNote failed \\(404\\): note missing" not in sidecar_http_check_source
        or "note-missing" not in sidecar_http_check_source
        or 'searchParams(requestFor("DELETE", "/api/v1/notes/note-missing"))' not in sidecar_http_check_source
        or 'searchParams(requestFor("DELETE", "/api/v1/notes/note-1"))' not in sidecar_http_check_source
        or "shareNote failed \\(404\\): share note missing" not in sidecar_http_check_source
        or "note-share-missing" not in sidecar_http_check_source
        or "note-duplicate-json" not in sidecar_http_check_source
        or 'assertEmptyBody(requestFor("POST", "/api/v1/notes/note-1/share"))' not in sidecar_http_check_source
        or 'assertEmptyBody(requestFor("POST", "/api/v1/notes/note%2Fslash/share"))' not in sidecar_http_check_source
        or 'assertEmptyBody(requestFor("POST", "/api/v1/notes/note-duplicate-json/share"))' not in sidecar_http_check_source
        or "async function readSdkHttpJson(res, method)" not in sidecar_source
        or "async function callMessageFileHistorySdk(agent, method, args)" not in sidecar_source
        or "async function callTaskMessageFileHistorySdk(agent, task, method, args)" not in sidecar_source
        or 'return await callTaskMessageFileHistorySdk(agent, task, method, args)' not in sidecar_source
        or "const MIME_TYPES = {" not in sidecar_source
        or "function mimeFromFileName(name)" not in sidecar_source
        or "formData.append(\"conversationId\", args[0])" not in sidecar_source
        or "formData.append(\"file\", blob, args[2])" not in sidecar_source
        or "return await callMessageFileHistorySdk(agent, method, args)" not in sidecar_source
        or "assertNoDuplicateJsonKeys(raw)" not in sidecar_source
        or "assertJsonCompliant(parsed, `${method} response`)" not in sidecar_source
        or "returned malformed JSON" not in sidecar_source
        or "rawJson(res, 200" not in sidecar_http_check_source
        or "createNote returned malformed JSON: JSON object contains duplicate key: id" not in sidecar_http_check_source
        or "listBoards returned malformed JSON: JSON object contains duplicate key: id" not in sidecar_http_check_source
        or "shareNote returned malformed JSON: JSON object contains duplicate key: messageId" not in sidecar_http_check_source
        or "listBoards failed \\(503\\): boards unavailable" not in sidecar_http_check_source
        or "duplicateNextListBoards" not in sidecar_http_check_source
        or "failNextListBoards" not in sidecar_http_check_source
        or "boards unavailable" not in sidecar_http_check_source
        or "createBoard failed \\(422\\): board invalid" not in sidecar_http_check_source
        or "Bad Board" not in sidecar_http_check_source
        or "updateBoard failed \\(423\\): board locked" not in sidecar_http_check_source
        or "board-locked" not in sidecar_http_check_source
        or "archiveBoard failed \\(404\\): board missing" not in sidecar_http_check_source
        or "board-missing" not in sidecar_http_check_source
        or "listColumns failed \\(404\\): columns missing" not in sidecar_http_check_source
        or "columns missing" not in sidecar_http_check_source
        or "createColumn failed \\(422\\): column invalid" not in sidecar_http_check_source
        or "Bad Column" not in sidecar_http_check_source
        or "updateColumn failed \\(423\\): column locked" not in sidecar_http_check_source
        or "col-locked" not in sidecar_http_check_source
        or "deleteColumn failed \\(404\\): column missing" not in sidecar_http_check_source
        or "col-missing" not in sidecar_http_check_source
        or "reorderColumns failed \\(409\\): column order stale" not in sidecar_http_check_source
        or "column order stale" not in sidecar_http_check_source
        or "createCard failed \\(422\\): card invalid" not in sidecar_http_check_source
        or "Bad Card" not in sidecar_http_check_source
        or "listCards failed \\(503\\): cards unavailable" not in sidecar_http_check_source
        or "cards unavailable" not in sidecar_http_check_source
        or "completeCard failed \\(404\\): card missing" not in sidecar_http_check_source
        or "card-missing" not in sidecar_http_check_source
        or "listArchivedCards failed \\(404\\): archive missing" not in sidecar_http_check_source
        or "archive missing" not in sidecar_http_check_source
        or "addCardCommit failed \\(422\\): commit invalid" not in sidecar_http_check_source
        or 'commitHash: "bad"' not in sidecar_http_check_source
        or "listCardCommits failed \\(404\\): commits missing" not in sidecar_http_check_source
        or "commits missing" not in sidecar_http_check_source
        or "linkCardNote failed \\(404\\): card note missing" not in sidecar_http_check_source
        or "unlinkCardNote failed \\(404\\): card note missing" not in sidecar_http_check_source
        or "note-missing" not in sidecar_http_check_source
        or "listCardNotes failed \\(404\\): card notes missing" not in sidecar_http_check_source
        or "card notes missing" not in sidecar_http_check_source
        or "listLabels failed \\(404\\): labels missing" not in sidecar_http_check_source
        or "labels missing" not in sidecar_http_check_source
        or "createLabel failed \\(422\\): label invalid" not in sidecar_http_check_source
        or "Bad Label" not in sidecar_http_check_source
        or "updateLabel failed \\(423\\): label locked" not in sidecar_http_check_source
        or "label-locked" not in sidecar_http_check_source
        or "deleteLabel failed \\(404\\): label missing" not in sidecar_http_check_source
        or "label missing" not in sidecar_http_check_source
        or "addCardLabel failed \\(404\\): card label missing" not in sidecar_http_check_source
        or "removeCardLabel failed \\(404\\): card label missing" not in sidecar_http_check_source
        or "label-missing" not in sidecar_http_check_source
        or "queryMemory failed" not in sidecar_http_check_source
        or "memory backend down" not in sidecar_http_check_source
        or "queryMemory returned malformed JSON: JSON object contains duplicate key: summary" not in sidecar_http_check_source
        or 'queryMemory", [{ query: "duplicate-json", limit: 1 }]' not in sidecar_http_check_source
        or "fetchSkillPrompt failed" not in sidecar_http_check_source
        or "skill missing" not in sidecar_http_check_source
        or "fetchSkillPrompt returned malformed JSON: JSON object contains duplicate key: promptContent" not in sidecar_http_check_source
        or 'fetchSkillPrompt", ["duplicate-json"]' not in sidecar_http_check_source
        or "async function callMemorySkillSdk(agent, method, args)" not in sidecar_source
        or 'params.set("q", args[0].query)' not in sidecar_source
        or "normalizeMemoryOrigin(entry.source)" not in sidecar_source
        or 'pathSegment(args[0])' not in sidecar_source
        or 'return await callMemorySkillSdk(agent, method, args)' not in sidecar_source
        or "bad-cursor" not in sidecar_http_check_source
        or "serverUrl: `ws://127.0.0.1:${backend.address().port}/`" not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("uploadFile", ["conv-1", { base64: "SGk=" }, "hello.txt", "text/plain"]), {' not in sidecar_http_check_source
        or 'name="conversationId"\\r\\n\\r\\nconv-1' not in sidecar_http_check_source
        or 'name="file"; filename="hello\\.txt"' not in sidecar_http_check_source
        or "Content-Type: text\\/plain" not in sidecar_http_check_source
        or 'fileName: "hello.txt"' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("fetchHistory", ["conv-1", { before: "msg-9", after: "msg-1", around: "msg-5", limit: 1 }]), historyResult())' not in sidecar_http_check_source
        or 'senderAgentId: "agent-helper"' not in sidecar_http_check_source
        or 'replyToId: "reply-http-1"' not in sidecar_http_check_source
        or 'threadId: "thread-http-1"' not in sidecar_http_check_source
        or 'id: "hist-http-att-1"' not in sidecar_http_check_source
        or 'nextCursor: "hist-http-1"' not in sidecar_http_check_source
        or "nextCursor: null" in sidecar_http_check_source
        or "return json(res, 200, { messages: [], hasMore: false });" not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("fetchHistory", ["conv-1", { before: "", after: "", around: "", limit: 0 }]), {\n    messages: [],\n    hasMore: false\n  });' not in sidecar_http_check_source
        or 'nextCursor: "note-cursor-1"' not in sidecar_http_check_source
        or 'export type MemoryOrigin = "self" | "system" | `shared-from-${string}`;' not in sdk_types
        or 'if (source === "user") return "self";' not in sdk_client_source
        or 'if (source === "system") return "system";' not in sdk_client_source
        or 'source.match(/^shared-from-([0-9a-fA-F]{8})$/)' not in sdk_client_source
        or 'return `shared-from-${m[1]!.toLowerCase()}`;' not in sdk_client_source
        or "return undefined;" not in sdk_client_source
        or 'origin: "system"' not in sidecar_http_check_source
        or 'source: "shared-from-A1B2C3D4"' not in sidecar_http_check_source
        or 'origin: "shared-from-a1b2c3d4"' not in sidecar_http_check_source
        or 'source: "user"' not in sidecar_http_check_source
        or 'origin: "self"' not in sidecar_http_check_source
        or 'source: "legacy-import"' not in sidecar_http_check_source
        or 'Object.hasOwn((await sdk("queryMemory", [{ query: "Unknown", limit: 2 }]))[3], "origin")' not in sidecar_http_check_source
        or 'summary: "No Source"' not in sidecar_http_check_source
        or 'Object.hasOwn((await sdk("queryMemory", [{ query: "No Source", limit: 2 }]))[4], "origin")' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("queryMemory", [{ query: "", limit: 0 }]), memoryEntries())' not in sidecar_http_check_source
        or 'url.searchParams.get("q") === "duplicate-json"' not in sidecar_http_check_source
        or 'promptTemplate: "Template"' not in sidecar_http_check_source
        or '"skill with/slash"' not in sidecar_http_check_source
        or "/api/v1/skills/skill%20with%2Fslash/prompt" not in sidecar_http_check_source
        or 'preview: "Preview"' not in sidecar_http_check_source
        or 'createNote", ["conv-1", { title: "Note", content: "Body", tags: ["work"], notebookId: "book-1" }]' not in sidecar_http_check_source
        or 'createNote", ["conv-1", { title: "Title only" }]' not in sidecar_http_check_source
        or 'updateNote", ["conv-1", "note-1", { title: "Updated", content: "Body 2", tags: ["ai"] }]' not in sidecar_http_check_source
        or 'updateNote", ["conv-1", "note-1", { tags: ["solo"] }]' not in sidecar_http_check_source
        or 'creatorType: "agent"' not in sidecar_http_check_source
        or 'agentId: "agent-1"' not in sidecar_http_check_source
        or 'agentName: "Agent"' not in sidecar_http_check_source
        or 'tags: ["work", "ai"]' not in sidecar_http_check_source
        or 'notes: [note()]' not in sidecar_http_check_source
        or ']), note())' not in sidecar_http_check_source
        or ']), note("Updated"))' not in sidecar_http_check_source
        or 'id: "board-1", name: "Board", createdAt: "now"' not in sidecar_http_check_source
        or 'id: "col-1", boardId: "board-1", name: "Todo", sortOrder: 1' not in sidecar_http_check_source
        or 'columnName: "Todo"' not in sidecar_http_check_source
        or 'dueDate: null' not in sidecar_http_check_source
        or 'createdBy: null' not in sidecar_http_check_source
        or 'archivedAt: null' not in sidecar_http_check_source
        or 'updateCard", ["card-1", { title: "Card", description: "Desc 2", priority: "urgent", columnId: "col-1", sortOrder: 7 }]' not in sidecar_http_check_source
        or 'updateCard", ["card-1", { sortOrder: 8 }]' not in sidecar_http_check_source
        or 'createBoard", [{ name: "Board", columns: [{ name: "Todo" }, { name: "Done" }] }]' not in sidecar_http_check_source
        or 'createBoard", [{ name: "Board without columns" }]' not in sidecar_http_check_source
        or 'updateBoard", ["board-1", { name: "Updated" }]' not in sidecar_http_check_source
        or 'createColumn", ["board-1", { name: "Todo", sortOrder: 3 }]' not in sidecar_http_check_source
        or 'createColumn", ["board-1", { name: "No sort column" }]' not in sidecar_http_check_source
        or 'updateColumn", ["col-1", { name: "Doing", sortOrder: 4 }]' not in sidecar_http_check_source
        or 'updateColumn", ["col-1", { sortOrder: 5 }]' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("listCards", [{ search: "Card", limit: 1, offset: 5 }]), [card()])' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("listCards", [{ search: "", limit: 0, offset: 0 }]), [card()])' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("listCards"), [card()])' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("completeCard", ["card-1"]), card())' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("listArchivedCards", ["board-1", { page: 1, limit: 20 }]), {' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("listArchivedCards", ["board-1"]), {' not in sidecar_http_check_source
        or 'cards: [card()]' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("addCardCommit", ["card-1", { commitHash: "abc", message: "commit" }]), cardCommit())' not in sidecar_http_check_source
        or 'addCardCommit", ["card-1", { commitHash: "def" }]' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("listCardCommits", ["card-1"]), [cardCommit()])' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("listCardNotes", ["card-1"]), [cardNote()])' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("listLabels", ["board-1"]), [label()])' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("createLabel", ["board-1", { name: "Bug", color: "#ff0000" }]), label("Bug", "#ff0000"))' not in sidecar_http_check_source
        or 'createLabel", ["board-1", { name: "No color" }]' not in sidecar_http_check_source
        or 'assert.deepEqual(await sdk("updateLabel", ["label-1", { name: "Feature", color: "#00ff00" }]), label("Feature", "#00ff00"))' not in sidecar_http_check_source
        or 'updateLabel", ["label-1", { color: "#0000ff" }]' not in sidecar_http_check_source
        or "assertEmptyBody" not in sidecar_http_check_source
        or 'requestFor("DELETE", "/api/v1/notes/note-1")' not in sidecar_http_check_source
        or 'requestFor("POST", "/api/v1/kanban/boards/board-1/archive")' not in sidecar_http_check_source
        or 'requestFor("DELETE", "/api/v1/kanban/columns/col-1")' not in sidecar_http_check_source
        or 'requestFor("POST", "/api/v1/kanban/cards/card-1/complete")' not in sidecar_http_check_source
        or 'requestFor("GET", "/api/v1/kanban/cards/card-1/commits")' not in sidecar_http_check_source
        or 'requestFor("GET", "/api/v1/kanban/cards/card-1/notes")' not in sidecar_http_check_source
        or 'requestFor("DELETE", "/api/v1/kanban/cards/card-1/notes/note-1")' not in sidecar_http_check_source
        or 'requestFor("DELETE", "/api/v1/kanban/cards/card%2Fslash/notes/note%2Fslash")' not in sidecar_http_check_source
        or 'requestFor("DELETE", "/api/v1/kanban/labels/label-1")' not in sidecar_http_check_source
        or 'requestFor("DELETE", "/api/v1/kanban/cards/card-1/labels/label-1")' not in sidecar_http_check_source
        or 'requestFor("DELETE", "/api/v1/kanban/cards/card%2Fslash/labels/label%2Fslash")' not in sidecar_http_check_source
        or 'requestFor("PATCH", "/api/v1/kanban/cards/card%2Fslash")' not in sidecar_http_check_source
        or 'requestFor("PATCH", "/api/v1/kanban/boards/board%2Fslash")' not in sidecar_http_check_source
        or "duplicateHistoryRequest" not in sidecar_http_check_source
        or "missing duplicate-json fetchHistory request" not in sidecar_http_check_source
        or "pagedHistoryRequest" not in sidecar_http_check_source
        or "missing paged fetchHistory request" not in sidecar_http_check_source
        or "emptyHistoryRequest" not in sidecar_http_check_source
        or "missing empty fetchHistory request" not in sidecar_http_check_source
        or "defaultHistoryRequest" not in sidecar_http_check_source
        or 'assertEmptyBody(requestFor("GET", "/api/v1/notes"))' not in sidecar_http_check_source
        or 'assertEmptyBody(emptyNotesRequest)' not in sidecar_http_check_source
        or "defaultNotesRequest" not in sidecar_http_check_source
        or 'assertEmptyBody(requestFor("GET", "/api/v1/kanban/cards"))' not in sidecar_http_check_source
        or 'assertEmptyBody(emptyCardsRequest)' not in sidecar_http_check_source
        or "defaultCardsRequest" not in sidecar_http_check_source
        or 'assertEmptyBody(requestFor("GET", "/api/v1/kanban/boards/board-1/archived-cards"))' not in sidecar_http_check_source
        or 'assertEmptyBody(requestsFor("GET", "/api/v1/kanban/boards/board-1/archived-cards")[1])' not in sidecar_http_check_source
        or "defaultArchivedCardsRequest" not in sidecar_http_check_source
        or 'assertEmptyBody(requestFor("GET", "/api/v1/memories/search"))' not in sidecar_http_check_source
        or 'assertEmptyBody(emptyMemoryRequest)' not in sidecar_http_check_source
        or 'fetchHistory", ["conv-1", { before: "", after: "", around: "", limit: 0 }]' not in sidecar_http_check_source
        or 'fetchHistory", ["conv-1"]' not in sidecar_http_check_source
        or 'listNotes", ["conv-1", { before: "", limit: 0, offset: 0, tags: [], archived: false }]' not in sidecar_http_check_source
        or 'listNotes", ["conv-1"]' not in sidecar_http_check_source
        or 'listCards", [{ search: "", limit: 0, offset: 0 }]' not in sidecar_http_check_source
        or 'listArchivedCards", ["board-1", { page: 0, limit: 0 }]' not in sidecar_http_check_source
        or 'queryMemory", [{ query: "", limit: 0 }]' not in sidecar_http_check_source
        or 'requestsFor("GET", "/api/v1/kanban/boards/board-1/archived-cards")[1]' not in sidecar_http_check_source
        or "emptyCardsRequest" not in sidecar_http_check_source
        or "missing empty listCards request" not in sidecar_http_check_source
        or "emptyMemoryRequest" not in sidecar_http_check_source
        or "missing empty queryMemory request" not in sidecar_http_check_source
        or "auth: req.headers.authorization" not in sidecar_http_check_source
        or "for (const request of requests)" not in sidecar_http_check_source
        or 'assert.equal(request.auth, "Bearer ari_test"' not in sidecar_http_check_source
        or "`${request.method} ${request.path} missing auth`" not in sidecar_http_check_source
        or "assert.deepEqual([...calledMethods].sort(), EXPECTED_HTTP_SDK_METHODS.toSorted())" not in sidecar_http_check_source
        or "assert.ok(requests.length >= 35)" not in sidecar_http_check_source
    )
    http_backend_behavior_contract_count = 1
    http_error_propagation_contract_count = 1
    http_return_payload_contract_missing = (
        interface_fields(sdk_types, "UploadResult") != {"url", "fileName", "fileType", "fileSize"}
        or 'url: "https://file"' not in sidecar_http_check_source
        or 'fileName: "hello.txt"' not in sidecar_http_check_source
        or 'fileType: "text/plain"' not in sidecar_http_check_source
        or "fileSize: 2" not in sidecar_http_check_source
        or 'url: "https://file/unknown.blobx"' not in sidecar_http_check_source
        or 'fileName: "unknown.blobx"' not in sidecar_http_check_source
        or 'fileType: "application/octet-stream"' not in sidecar_http_check_source
        or interface_fields(sdk_types, "TaskAttachment") != {"id", "fileName", "fileType", "fileSize", "url"}
        or 'id: "hist-http-att-1"' not in sidecar_http_check_source
        or 'fileName: "history-http.txt"' not in sidecar_http_check_source
        or 'fileType: "text/plain"' not in sidecar_http_check_source
        or "fileSize: 9" not in sidecar_http_check_source
        or 'url: "https://files.example/history-http.txt"' not in sidecar_http_check_source
        or interface_fields(sdk_types, "HistoryMessage")
        != {
            "id",
            "conversationId",
            "seq",
            "role",
            "content",
            "status",
            "senderAgentId",
            "senderAgentName",
            "senderUserId",
            "senderUsername",
            "replyToId",
            "threadId",
            "createdAt",
            "updatedAt",
            "attachments",
        }
        or 'id: "hist-http-1"' not in sidecar_http_check_source
        or "seq: 7" not in sidecar_http_check_source
        or 'role: "assistant"' not in sidecar_http_check_source
        or 'status: "sent"' not in sidecar_http_check_source
        or 'senderAgentId: "agent-helper"' not in sidecar_http_check_source
        or 'senderAgentName: "Helper"' not in sidecar_http_check_source
        or 'senderUserId: "user-1"' not in sidecar_http_check_source
        or 'senderUsername: "User"' not in sidecar_http_check_source
        or 'replyToId: "reply-http-1"' not in sidecar_http_check_source
        or 'threadId: "thread-http-1"' not in sidecar_http_check_source
        or 'createdAt: "2026-06-29T02:00:00.000Z"' not in sidecar_http_check_source
        or 'updatedAt: "2026-06-29T02:00:01.000Z"' not in sidecar_http_check_source
        or interface_fields(sdk_types, "FetchHistoryResult") != {"messages", "hasMore", "nextCursor"}
        or "messages: [" not in sidecar_http_check_source
        or "hasMore: true" not in sidecar_http_check_source
        or 'nextCursor: "hist-http-1"' not in sidecar_http_check_source
        or interface_fields(sdk_types, "Note")
        != {
            "id",
            "conversationId",
            "creatorId",
            "creatorType",
            "creatorName",
            "agentId",
            "agentName",
            "title",
            "content",
            "tags",
            "createdAt",
            "updatedAt",
        }
        or 'id: "note-1"' not in sidecar_http_check_source
        or 'conversationId: "conv-1"' not in sidecar_http_check_source
        or 'creatorId: "agent-1"' not in sidecar_http_check_source
        or 'creatorType: "agent"' not in sidecar_http_check_source
        or 'creatorName: "Agent"' not in sidecar_http_check_source
        or 'agentId: "agent-1"' not in sidecar_http_check_source
        or 'agentName: "Agent"' not in sidecar_http_check_source
        or "content: \"Body\"" not in sidecar_http_check_source
        or 'tags: ["work", "ai"]' not in sidecar_http_check_source
        or 'createdAt: "now"' not in sidecar_http_check_source
        or 'updatedAt: "later"' not in sidecar_http_check_source
        or interface_fields(sdk_types, "ListNotesResult") != {"notes", "hasMore", "nextCursor"}
        or "notes: [note()]" not in sidecar_http_check_source
        or 'nextCursor: "note-cursor-1"' not in sidecar_http_check_source
        or interface_fields(sdk_types, "KanbanBoard") != {"id", "name", "createdAt"}
        or 'id: "board-1", name: "Board", createdAt: "now"' not in sidecar_http_check_source
        or interface_fields(sdk_types, "KanbanColumn") != {"id", "boardId", "name", "sortOrder"}
        or 'id: "col-1", boardId: "board-1", name: "Todo", sortOrder: 1' not in sidecar_http_check_source
        or interface_fields(sdk_types, "KanbanCard")
        != {
            "id",
            "columnId",
            "columnName",
            "title",
            "description",
            "priority",
            "dueDate",
            "sortOrder",
            "createdBy",
            "createdAt",
            "updatedAt",
            "archivedAt",
        }
        or 'columnName: "Todo"' not in sidecar_http_check_source
        or 'title: "Card"' not in sidecar_http_check_source
        or "description: null" not in sidecar_http_check_source
        or "priority: null" not in sidecar_http_check_source
        or "dueDate: null" not in sidecar_http_check_source
        or "sortOrder: 1" not in sidecar_http_check_source
        or "createdBy: null" not in sidecar_http_check_source
        or "createdAt: null" not in sidecar_http_check_source
        or "updatedAt: null" not in sidecar_http_check_source
        or "archivedAt: null" not in sidecar_http_check_source
        or interface_fields(sdk_types, "CardCommit") != {"cardId", "commitHash", "message", "createdAt"}
        or 'cardId: "card-1"' not in sidecar_http_check_source
        or 'commitHash: "abc"' not in sidecar_http_check_source
        or interface_fields(sdk_types, "CardNote") != {"id", "title", "tags", "createdAt"}
        or "function cardNote()" not in sidecar_http_check_source
        or 'title: "Note"' not in sidecar_http_check_source
        or "tags: []" not in sidecar_http_check_source
        or interface_fields(sdk_types, "ArchivedCardsResult") != {"cards", "total", "page", "limit"}
        or "cards: [card()]" not in sidecar_http_check_source
        or "total: 1" not in sidecar_http_check_source
        or "page: 1" not in sidecar_http_check_source
        or "limit: 10" not in sidecar_http_check_source
        or interface_fields(sdk_types, "KanbanLabel") != {"id", "boardId", "name", "color"}
        or "function label(" not in sidecar_http_check_source
        or interface_fields(sdk_types, "MemoryEntry") != {"content", "category", "score", "origin"}
        or 'content: "Summary\\nDetail"' not in sidecar_http_check_source
        or 'category: "project"' not in sidecar_http_check_source
        or "score: 0.9" not in sidecar_http_check_source
        or 'origin: "system"' not in sidecar_http_check_source
        or interface_fields(sdk_types, "SkillPrompt") != {"promptContent", "promptTemplate", "parameters"}
        or 'promptContent: "Prompt"' not in sidecar_http_check_source
        or 'promptTemplate: "Template"' not in sidecar_http_check_source
        or "parameters: []" not in sidecar_http_check_source
        or '"skill with/slash"' not in sidecar_http_check_source
        or "/api/v1/skills/skill%20with%2Fslash/prompt" not in sidecar_http_check_source
        or 'promptContent: "Encoded Prompt"' not in sidecar_http_check_source
        or 'promptTemplate: "Encoded Template"' not in sidecar_http_check_source
        or 'name: "topic"' not in sidecar_http_check_source
        or 'type: "string"' not in sidecar_http_check_source
        or "required: true" not in sidecar_http_check_source
        or 'enum: ["sdk", "bridge"]' not in sidecar_http_check_source
        or 'default: "sdk"' not in sidecar_http_check_source
        or 'nested: { preserves: ["unknown", "metadata"] }' not in sidecar_http_check_source
        or interface_fields(sdk_types, "ShareNoteResult") != {"messageId", "noteId", "title", "preview", "tags"}
        or 'messageId: "msg-1"' not in sidecar_http_check_source
        or 'noteId: "note-1"' not in sidecar_http_check_source
        or 'title: "Note"' not in sidecar_http_check_source
        or 'preview: "Preview"' not in sidecar_http_check_source
        or "tags: []" not in sidecar_http_check_source
    )
    http_return_payload_expected_required = {
        "UploadResult": {"url", "fileName", "fileType", "fileSize"},
        "TaskAttachment": {"id", "fileName", "fileType", "fileSize", "url"},
        "HistoryMessage": {"id", "conversationId", "seq", "role", "content", "status", "createdAt", "updatedAt"},
        "FetchHistoryResult": {"messages", "hasMore"},
        "Note": {"id", "conversationId", "creatorId", "creatorType", "creatorName", "title", "content", "createdAt", "updatedAt"},
        "ListNotesResult": {"notes", "hasMore"},
        "KanbanBoard": {"id", "name", "createdAt"},
        "KanbanColumn": {"id", "boardId", "name", "sortOrder"},
        "KanbanCard": {"id", "columnId", "title", "description", "priority", "dueDate", "sortOrder", "createdBy", "createdAt", "updatedAt"},
        "CardCommit": {"cardId", "commitHash", "message", "createdAt"},
        "CardNote": {"id", "title", "tags", "createdAt"},
        "ArchivedCardsResult": {"cards", "total", "page", "limit"},
        "KanbanLabel": {"id", "boardId", "name", "color"},
        "MemoryEntry": {"content", "category", "score"},
        "SkillPrompt": {"promptContent", "promptTemplate", "parameters"},
        "ShareNoteResult": {"messageId", "noteId", "title", "preview", "tags"},
    }
    http_return_payload_required_drift = {
        name: {
            "expected": sorted(expected),
            "actual": sorted(sdk_interface_required_fields.get(name, set())),
        }
        for name, expected in http_return_payload_expected_required.items()
        if sdk_interface_required_fields.get(name, set()) != expected
    }
    http_return_required_contract_count = len(http_return_payload_expected_required)
    http_return_required_field_contract_count = sum(len(expected) for expected in http_return_payload_expected_required.values())
    http_return_payload_expected_shapes = {
        "UploadResult": {"url": "string", "fileName": "string", "fileType": "string", "fileSize": "number"},
        "TaskAttachment": {"id": "string", "fileName": "string", "fileType": "string", "fileSize": "number", "url": "string"},
        "HistoryMessage": {
            "id": "string",
            "conversationId": "string",
            "seq": "number",
            "role": "string",
            "content": "string",
            "status": "string",
            "senderAgentId": "string",
            "senderAgentName": "string",
            "senderUserId": "string",
            "senderUsername": "string",
            "replyToId": "string",
            "threadId": "string",
            "createdAt": "string",
            "updatedAt": "string",
            "attachments": "array",
        },
        "FetchHistoryResult": {"messages": "array", "hasMore": "boolean", "nextCursor": "string"},
        "Note": {
            "id": "string",
            "conversationId": "string",
            "creatorId": "string",
            "creatorType": "string",
            "creatorName": "string",
            "agentId": "string",
            "agentName": "string",
            "title": "string",
            "content": "string",
            "tags": "array:string",
            "createdAt": "string",
            "updatedAt": "string",
        },
        "ListNotesResult": {"notes": "array", "hasMore": "boolean", "nextCursor": "string"},
        "KanbanBoard": {"id": "string", "name": "string", "createdAt": "string"},
        "KanbanColumn": {"id": "string", "boardId": "string", "name": "string", "sortOrder": "number"},
        "KanbanCard": {
            "id": "string",
            "columnId": "string",
            "columnName": "string",
            "title": "string",
            "description": "string",
            "priority": "string",
            "dueDate": "string",
            "sortOrder": "number",
            "createdBy": "string",
            "createdAt": "string",
            "updatedAt": "string",
            "archivedAt": "string",
        },
        "CardCommit": {"cardId": "string", "commitHash": "string", "message": "string", "createdAt": "string"},
        "CardNote": {"id": "string", "title": "string", "tags": "array:string", "createdAt": "string"},
        "ArchivedCardsResult": {"cards": "array", "total": "number", "page": "number", "limit": "number"},
        "KanbanLabel": {"id": "string", "boardId": "string", "name": "string", "color": "string"},
        "MemoryEntry": {"content": "string", "category": "string", "score": "number", "origin": "unknown"},
        "SkillPrompt": {"promptContent": "string", "promptTemplate": "string", "parameters": "array"},
        "ShareNoteResult": {"messageId": "string", "noteId": "string", "title": "string", "preview": "string", "tags": "array:string"},
    }
    http_return_payload_shape_drift = {
        name: {
            "expected": expected,
            "actual": sdk_interface_shapes.get(name, {}),
        }
        for name, expected in http_return_payload_expected_shapes.items()
        if sdk_interface_shapes.get(name, {}) != expected
    }
    http_return_shape_contract_count = len(http_return_payload_expected_shapes)
    http_return_payload_contract_count = len(http_return_payload_expected_shapes)
    http_return_shape_field_contract_count = sum(len(expected) for expected in http_return_payload_expected_shapes.values())
    http_return_fixture_field_contract_count = http_return_shape_field_contract_count
    sdk_list_boards_return_contract_drift = (
        sdk_method_returns.get("listBoards") != "Promise<KanbanBoard[]>"
        or 'assert.deepEqual(await sdk("listBoards", []), [{ id: "board-1", name: "Board", createdAt: "now" }])'
        not in sidecar_http_check_source
    )
    sdk_list_boards_return_contract_count = 1
    auth_frame_contract_drift = {}
    if sdk_auth_runtime_fields != sdk_runtime_info_fields:
        auth_frame_contract_drift["SDK agent_auth.runtime"] = {
            "expected": sorted(sdk_runtime_info_fields),
            "actual": sorted(sdk_auth_runtime_fields),
        }
    if e2e_auth_runtime_fields != sdk_auth_runtime_fields:
        auth_frame_contract_drift["sidecar e2e auth.runtime assertion"] = {
            "expected": sorted(sdk_auth_runtime_fields),
            "actual": sorted(e2e_auth_runtime_fields),
        }
    if e2e_auth_runtime_values != sdk_auth_runtime_values:
        auth_frame_contract_drift["sidecar e2e auth.runtime values"] = {
            "expected": sdk_auth_runtime_values,
            "actual": e2e_auth_runtime_values,
        }
    if e2e_auth_action_capability_fields != sdk_auth_action_capability_fields:
        auth_frame_contract_drift["sidecar e2e actionCall capability assertion"] = {
            "expected": sorted(sdk_auth_action_capability_fields),
            "actual": sorted(e2e_auth_action_capability_fields),
        }
    if e2e_auth_action_capability_values != sdk_auth_action_capability_values:
        auth_frame_contract_drift["sidecar e2e actionCall capability values"] = {
            "expected": sdk_auth_action_capability_values,
            "actual": e2e_auth_action_capability_values,
        }
    auth_frame_detail_contract_count = 5
    command_frame_contract_drift = {}
    if sdk_register_command_fields != {"name", "description"}:
        command_frame_contract_drift["SDK register_commands.commands[]"] = {
            "expected": ["description", "name"],
            "actual": sorted(sdk_register_command_fields),
        }
    if e2e_register_command_fields != sdk_register_command_fields:
        command_frame_contract_drift["sidecar e2e register_commands assertion"] = {
            "expected": sorted(sdk_register_command_fields),
            "actual": sorted(e2e_register_command_fields),
        }
    if sdk_heartbeat_command_fields != {"type", "agentId"}:
        command_frame_contract_drift["SDK heartbeat_commands"] = {
            "expected": ["agentId", "type"],
            "actual": sorted(sdk_heartbeat_command_fields),
        }
    if e2e_heartbeat_command_fields != sdk_heartbeat_command_fields:
        command_frame_contract_drift["sidecar e2e heartbeat_commands assertion"] = {
            "expected": sorted(sdk_heartbeat_command_fields),
            "actual": sorted(e2e_heartbeat_command_fields),
        }
    command_frame_detail_contract_count = 4
    runtime_frame_contract_drift = {}
    for frame_name, sdk_fields in sorted(sdk_runtime_frame_fields.items()):
        e2e_fields = e2e_runtime_frame_fields.get(frame_name, set())
        if e2e_fields != sdk_fields:
            runtime_frame_contract_drift[f"sidecar e2e {frame_name} assertion"] = {
                "expected": sorted(sdk_fields),
                "actual": sorted(e2e_fields),
            }
    runtime_frame_detail_contract_count = len(sdk_runtime_frame_fields)
    sdk_max_queue_size = ts_numeric_const(sdk_client_source, "MAX_QUEUE_SIZE")
    queue_overflow_contract_drift = (
        sdk_max_queue_size is None
        or f"for (let index = 1; index <= {sdk_max_queue_size + 1}; index += 1)" not in sidecar_e2e_check_source
        or f'"task-overflow-{sdk_max_queue_size + 1}"' not in sidecar_e2e_check_source
        or f"overflowQueued.queuePosition, {sdk_max_queue_size - 1}" not in sidecar_e2e_check_source
        or f"overflowQueued.globalQueueSize, {sdk_max_queue_size}" not in sidecar_e2e_check_source
    )
    queue_overflow_contract_count = 1
    sdk_auth_error_max_retries = ts_numeric_const(sdk_client_source, "AUTH_ERROR_MAX_RETRIES")
    sdk_auth_error_base_delay = ts_numeric_const(sdk_client_source, "AUTH_ERROR_BASE_DELAY")
    sdk_auth_error_max_delay = ts_numeric_const(sdk_client_source, "AUTH_ERROR_MAX_DELAY")
    sdk_retryable_auth_error_markers = class_method_includes_arguments(
        sdk_client_source,
        "export class ArinovaAgent",
        "isRetryableServerAuthError",
    )
    e2e_retryable_auth_error_markers = set(
        js_string_array(sidecar_e2e_check_source, "EXPECTED_RETRYABLE_AUTH_ERROR_MARKERS")
    )
    auth_retry_contract_drift = (
        sdk_auth_error_max_retries is None
        or sdk_auth_error_base_delay is None
        or sdk_auth_error_max_delay is None
        or e2e_retryable_auth_error_markers != sdk_retryable_auth_error_markers
        or f"delay >= {js_numeric_literal(sdk_auth_error_base_delay)}" not in sidecar_e2e_check_source
        or f"observedSdkAuthRetryDelays.includes({js_numeric_literal(sdk_auth_error_max_delay)})" not in sidecar_e2e_check_source
        or "observedSdkAuthRetryDelays.push(delay)" not in sidecar_e2e_check_source
        or sidecar_e2e_check_source.count(
            f"for (let index = 1; index <= {sdk_auth_error_max_retries}; index += 1)"
        ) < 2
        or f"authCountBeforeTimeoutErrors + {sdk_auth_error_max_retries}" not in sidecar_e2e_check_source
        or f"authCountBeforeRepeatedErrors + {sdk_auth_error_max_retries}" not in sidecar_e2e_check_source
        or "retryable auth marker ${marker}" not in sidecar_e2e_check_source
    )
    auth_retry_contract_count = 1
    sdk_task_heartbeat_interval = ts_numeric_const(sdk_client_source, "TASK_HEARTBEAT_INTERVAL")
    task_heartbeat_contract_drift = (
        sdk_task_heartbeat_interval is None
        or "function speedSdkHeartbeats" not in sidecar_e2e_check_source
        or f"delay === {js_numeric_literal(sdk_task_heartbeat_interval)}" not in sidecar_e2e_check_source
        or '"task-heartbeat"' not in sidecar_e2e_check_source
        or "agent_heartbeat" not in sidecar_e2e_check_source
        or "heartbeat.taskId, \"task-heartbeat\"" not in sidecar_e2e_check_source
    )
    task_heartbeat_contract_count = 1
    default_ping_e2e_match = re.search(
        r"async function runDefaultPingIntervalE2e\(\) \{(?P<body>.*?)\n\}\n\nawait runDefaultPingIntervalE2e\(\);",
        sidecar_e2e_check_source,
        re.S,
    )
    default_ping_e2e_body = default_ping_e2e_match.group("body") if default_ping_e2e_match else ""
    sdk_default_ping_interval = ts_numeric_const(sdk_client_source, "DEFAULT_PING_INTERVAL")
    ping_interval_contract_drift = (
        sdk_default_ping_interval is None
        or "function speedSdkDefaultPings" not in sidecar_e2e_check_source
        or f"delay === {js_numeric_literal(sdk_default_ping_interval)}" not in sidecar_e2e_check_source
        or default_ping_e2e_match is None
        or '"ari_default_ping"' not in sidecar_e2e_check_source
        or 'message.type === "ping"' not in default_ping_e2e_body
        or "ARINOVA_PING_INTERVAL_MS" in default_ping_e2e_body
    )
    ping_interval_contract_count = 1
    default_ping_timeout_e2e_match = re.search(
        r"async function runDefaultPingTimeoutE2e\(\) \{(?P<body>.*?)\n\}\n\nawait runDefaultPingTimeoutE2e\(\);",
        sidecar_e2e_check_source,
        re.S,
    )
    default_ping_timeout_e2e_body = (
        default_ping_timeout_e2e_match.group("body") if default_ping_timeout_e2e_match else ""
    )
    ping_timeout_contract_drift = (
        "this.pingTimeout = options.pingTimeout ?? 2 * this.pingInterval" not in sdk_client_source
        or default_ping_timeout_e2e_match is None
        or '"ari_default_ping_timeout"' not in sidecar_e2e_check_source
        or "timeoutArinova.autoPong = false" not in default_ping_timeout_e2e_body
        or "ARINOVA_PING_INTERVAL_MS" not in default_ping_timeout_e2e_body
        or "ARINOVA_PING_TIMEOUT_MS" in default_ping_timeout_e2e_body
        or "default ping timeout should keep the initial socket alive for twice the ping interval" not in sidecar_e2e_check_source
        or "authCountBeforeDefaultPingTimeout + 1" not in sidecar_e2e_check_source
    )
    ping_timeout_contract_count = 1
    default_reconnect_e2e_match = re.search(
        r"async function runDefaultReconnectIntervalE2e\(\) \{(?P<body>.*?)\n\}\n\nawait runDefaultReconnectIntervalE2e\(\);",
        sidecar_e2e_check_source,
        re.S,
    )
    default_reconnect_e2e_body = default_reconnect_e2e_match.group("body") if default_reconnect_e2e_match else ""
    sdk_default_reconnect_interval = ts_numeric_const(sdk_client_source, "DEFAULT_RECONNECT_INTERVAL")
    reconnect_interval_contract_drift = (
        sdk_default_reconnect_interval is None
        or "function speedSdkDefaultReconnects" not in sidecar_e2e_check_source
        or f"delay === {js_numeric_literal(sdk_default_reconnect_interval)}" not in sidecar_e2e_check_source
        or default_reconnect_e2e_match is None
        or '"ari_default_reconnect"' not in sidecar_e2e_check_source
        or "authCountBeforeDefaultReconnect + 1" not in sidecar_e2e_check_source
        or "ARINOVA_RECONNECT_INTERVAL_MS" in default_reconnect_e2e_body
    )
    reconnect_interval_contract_count = 1
    sdk_default_action_timeout = ts_numeric_const(sdk_client_source, "DEFAULT_ACTION_TIMEOUT")
    action_timeout_contract_drift = (
        sdk_default_action_timeout is None
        or "function speedSdkActionTimeouts" not in sidecar_e2e_check_source
        or f"delay === {js_numeric_literal(sdk_default_action_timeout)}" not in sidecar_e2e_check_source
        or '"global-default-timeout-call"' not in sidecar_e2e_check_source
        or '"global.default-timeout"' not in sidecar_e2e_check_source
        or "globalDefaultTimeout.body.error" not in sidecar_e2e_check_source
    )
    action_timeout_contract_count = 1
    generated_call_id_contract_drift = (
        "function generateCallId()" not in sdk_client_source
        or "`call_${crypto.randomUUID().replace(/-/g, \"\")}`" not in sdk_client_source
        or "`call_${Math.random().toString(36).slice(2)}_${Date.now()}`" not in sdk_client_source
        or '"global.generated-call-id"' not in sidecar_e2e_check_source
        or "generatedCallIdAction.id, /^call_/" not in sidecar_e2e_check_source
        or "callId: generatedCallIdAction.id" not in sidecar_e2e_check_source
        or "generatedCallIdResultPromise" not in sidecar_e2e_check_source
    )
    generated_call_id_contract_count = 1
    sdk_behavior_contract_count = 8
    e2e_runtime_coverage_missing = (
        "task_queued" not in sidecar_e2e_check_source
        or "cron_wakeup" not in sidecar_e2e_check_source
        or "not bound to a conversation" not in sidecar_e2e_check_source
        or '"task-cron-queued-1"' not in sidecar_e2e_check_source
        or '"task-cron-queued-2"' not in sidecar_e2e_check_source
        or "cronQueuedSecond.globalQueueSize, 1" not in sidecar_e2e_check_source
        or "cronQueuedSecondEvent.body.taskKind, \"trigger\"" not in sidecar_e2e_check_source
        or "heartbeat_commands" not in sidecar_e2e_check_source
        or "fallbackAvailableSkills" not in sidecar_source
        or "agentSkills: agentOptions.skills" not in sidecar_index_source
        or "task-fallback-skills" not in sidecar_runtime_check_source
        or "task-explicit-empty-skills" not in sidecar_runtime_check_source
        or "explicit empty skills checked" not in sidecar_runtime_check_source
        or "slashCommand: null" not in sidecar_runtime_check_source
        or "preserve_null=True" not in check_sdk_surface_source
        or 'shapes["slashCommand"] = "string|null"' not in check_sdk_surface_source
        or '{ id: "chat", name: "Chat", description: "" }' not in sidecar_runtime_check_source
        or '{ id: "chat", name: "Chat", description: "" }' not in sidecar_e2e_check_source
        or '{ name: "chat", description: "" }' not in sidecar_e2e_check_source
        or "requires a non-empty id" not in sidecar_runtime_check_source
        or "has duplicate id: memo" not in sidecar_runtime_check_source
        or "{ id: 123, name: \"Bad\", description: \"Bad\" }" not in sidecar_runtime_check_source
        or "requires string id, name and description" not in sidecar_runtime_check_source
        or 'ARINOVA_PING_INTERVAL_MS: "1.5"' not in sidecar_runtime_check_source
        or 'ARINOVA_PING_TIMEOUT_MS: "true"' not in sidecar_runtime_check_source
        or 'ARINOVA_MAX_CONSECUTIVE_PER_CONVERSATION: "two"' not in sidecar_runtime_check_source
        or 'ARINOVA_RECONNECT_INTERVAL_MS: "1e3"' not in sidecar_runtime_check_source
        or 'ARINOVA_RECONNECT_INTERVAL_MS: "   "' not in sidecar_runtime_check_source
        or 'ARINOVA_RECONNECT_INTERVAL_MS: " 250 "' not in sidecar_runtime_check_source
        or 'ARINOVA_CONTROL_MAX_BODY_BYTES: "   "' not in sidecar_runtime_check_source
        or 'ARINOVA_CONTROL_MAX_BODY_BYTES: " 512 "' not in sidecar_runtime_check_source
        or "typeof raw === \"string\" ? raw.trim() : raw" not in sidecar_source
        or '!/^\\d+$/.test(String(normalized))' not in sidecar_source
        or 'ARINOVA_ADAPTER_POST_TIMEOUT_MS: "1234"' not in sidecar_runtime_check_source
        or 'ARINOVA_CONTROL_MAX_BODY_BYTES: "4096"' not in sidecar_runtime_check_source
        or 'adapterPostTimeoutMs: 1234' not in sidecar_runtime_check_source
        or 'maxBodyBytes: 4096' not in sidecar_runtime_check_source
        or 'ARINOVA_ADAPTER_POST_TIMEOUT_MS: "-1"' not in sidecar_runtime_check_source
        or 'ARINOVA_CONTROL_MAX_BODY_BYTES: "huge"' not in sidecar_runtime_check_source
        or 'ARINOVA_CONTROL_MAX_BODY_BYTES: "0x10"' not in sidecar_runtime_check_source
        or 'ARINOVA_RECONNECT_INTERVAL_MS: "250"' not in sidecar_e2e_check_source
        or 'ARINOVA_AGENT_CONCURRENCY_MODE: "unbounded"' not in sidecar_runtime_check_source
        or 'ARINOVA_CONCURRENCY_MODE: "agent-wide"' not in sidecar_runtime_check_source
        or 'concurrencyMode: "per-conversation"' not in sidecar_runtime_check_source
        or '|| "per-conversation"' not in sidecar_source
        or 'id: "primary", name: "Primary", description: "Primary skill env"' not in sidecar_runtime_check_source
        or "taskEvent.body.availableSkills" not in sidecar_e2e_check_source
        or 'slug: "", name: "  ", slashCommand: null, description: ""' not in sidecar_e2e_check_source
        or "queuedTaskEvent.body.availableSkills" not in sidecar_e2e_check_source
        or 'slashCommand: "/memo"' not in sidecar_e2e_check_source
        or "slashCommand: null" not in sidecar_e2e_check_source
        or 'await callAgentSdk("sendHud", [{ status: "global" }])' not in sidecar_e2e_check_source
        or 'message.type === "hud_update" && message.data?.status === "global"' not in sidecar_e2e_check_source
        or "httpSendRequestsBeforeWsSendMessage" not in sidecar_e2e_check_source
        or 'request.path === "/api/v1/messages/send"' not in sidecar_e2e_check_source
        or "sendMessage should use agent_send websocket frame while connected" not in sidecar_e2e_check_source
        or "const wasConnected = connected" not in sidecar_source
        or "connectionStatusCountBeforeDuplicateAuth" not in sidecar_e2e_check_source
        or "duplicate auth_ok should not forward duplicate Hermes connection-status" not in sidecar_e2e_check_source
        or "connectedEventsBeforeDuplicateConnected" not in sidecar_runtime_check_source
        or "duplicate connected event should not forward duplicate Hermes connection-status" not in sidecar_runtime_check_source
        or "async function taskSdkError" not in sidecar_e2e_check_source
        or 'await taskSdkError("task-1", "fetchHistory", [{ before: "duplicate-json" }])' not in sidecar_e2e_check_source
        or "fetchHistory returned malformed JSON: JSON object contains duplicate key: messages" not in sidecar_e2e_check_source
        or 'await taskSdkError("task-1", "uploadFile", [{ base64: "SGk=" }, "duplicate-json.bin", "application/octet-stream"])' not in sidecar_e2e_check_source
        or "uploadFile returned malformed JSON: JSON object contains duplicate key: url" not in sidecar_e2e_check_source
        or 'const defaultHistory = await callTaskSdk("task-1", "fetchHistory")' not in sidecar_e2e_check_source
        or "assert.deepEqual(defaultHistory, { messages: [], hasMore: false })" not in sidecar_e2e_check_source
        or "actionCall" not in sidecar_e2e_check_source
        or 'taskId: "global-task"' not in sidecar_e2e_check_source
        or 'conversationId: "conv-global"' not in sidecar_e2e_check_source
        or 'messageId: "msg-global"' not in sidecar_e2e_check_source
        or "isOnboardingSeed" not in sidecar_source
        or '"bad-seed"' not in sidecar_runtime_check_source
        or "adapter unavailable" not in sidecar_runtime_check_source
        or r"/adapter \/task failed \(503\): adapter unavailable/" not in sidecar_runtime_check_source
        or 'seedId: ""' not in sidecar_runtime_check_source
        or 'mentions: ["user-1"]' not in sidecar_e2e_check_source
        or "missingChunkContent" not in sidecar_e2e_check_source
        or 'postControl("/chunk", { taskId: "task-1" })' not in sidecar_e2e_check_source
        or 'postControl("/chunk", { taskId: "  task-1  ", content: "trimmed delta" })' not in sidecar_e2e_check_source
        or 'await callTaskSdk("  task-1  ", "  fetchHistory  ")' not in sidecar_e2e_check_source
        or 'postControl("/complete", { taskId: "  task-1  ", content: "done", mentions: ["user-1"] })' not in sidecar_e2e_check_source
        or '"claim_ok"' not in sidecar_e2e_check_source
        or '"ari_claim_perm"' not in sidecar_e2e_check_source
        or '"ari_claim_no_agent_perm"' not in sidecar_e2e_check_source
        or '"seed-claim"' not in sidecar_e2e_check_source
        or '"Claimed token hello"' not in sidecar_e2e_check_source
        or "onboardingSeedCountBeforeClaimOk" not in sidecar_e2e_check_source
        or "claim_ok should leave SDK onboarding seed null until permanent-token auth_ok" not in sidecar_e2e_check_source
        or "claim_ok should not forward an onboarding seed to Hermes" not in sidecar_e2e_check_source
        or 'assertAuthEnvelope(claimReconnectAuths.at(-1), "ari_claim_no_agent_perm", "claim-token reconnect agent_auth")'
        not in sidecar_e2e_check_source
        or '"task-error-cancelled"' not in sidecar_e2e_check_source
        or "assert.deepEqual(endpointCancelError, {" not in sidecar_e2e_check_source
        or 'reason: "cancelled"' not in sidecar_e2e_check_source
        or "cancelledComplete" not in sidecar_e2e_check_source
        or "cancelledError" not in sidecar_e2e_check_source
        or "task-pre-aborted" not in sidecar_runtime_check_source
        or "task.signal.aborted" not in sidecar_source
        or 'event.path === "/task" && event.body.taskId === "task-pre-aborted"' not in sidecar_runtime_check_source
        or 'output: [{ content: "memory" }]' not in sidecar_e2e_check_source
        or "durationMs: 42" not in sidecar_e2e_check_source
        or 'messageId: "msg-1"' not in sidecar_e2e_check_source
        or 'status: "completed", durationMs: 12, costUsd: 0.02, numTurns: 3' not in sidecar_e2e_check_source
        or 'toolName: "arinova_sdk_call"' not in sidecar_e2e_check_source
        or 'input: { method: "queryMemory" }' not in sidecar_e2e_check_source
        or "durationMs: 7" not in sidecar_e2e_check_source
        or "success: false" not in sidecar_e2e_check_source
        or 'error: "tool failed"' not in sidecar_e2e_check_source
        or 'messageId: "msg-2"' not in sidecar_e2e_check_source
        or 'senderUserId: "user-1"' not in sidecar_e2e_check_source
        or 'senderAgentId: "agent-helper"' not in sidecar_e2e_check_source
        or 'members: [{ agentId: "agent-researcher", agentName: "Researcher" }]' not in sidecar_e2e_check_source
        or 'replyTo: { role: "assistant", content: "previous answer", senderAgentName: "Helper" }' not in sidecar_e2e_check_source
        or 'history: [{ role: "user", content: "earlier question"' not in sidecar_e2e_check_source
        or 'senderAgentName: "Helper", senderUsername: "User", createdAt: "2026-06-29T00:59:00.000Z"' not in sidecar_e2e_check_source
        or 'senderAgentId: "agent-helper",\n        senderAgentName: "Helper",\n        senderUserId: "user-1"' not in sidecar_e2e_check_source
        or 'id: "att-1"' not in sidecar_e2e_check_source
        or 'fileType: "text/plain"' not in sidecar_e2e_check_source
        or 'fileSize: 1' not in sidecar_e2e_check_source
        or 'url: "https://x"' not in sidecar_e2e_check_source
        or 'url: "https://file/task.txt"' not in sidecar_e2e_check_source
        or 'fileName: "task.txt"' not in sidecar_e2e_check_source
        or 'fileSize: 2' not in sidecar_e2e_check_source
        or "taskActionIdOverride" not in sidecar_e2e_check_source
        or 'taskId: "wrong-task"' not in sidecar_e2e_check_source
        or 'conversationId: "wrong-conv"' not in sidecar_e2e_check_source
        or 'messageId: "wrong-message"' not in sidecar_e2e_check_source
        or "unsupported field\\(s\\): conversationId, messageId, taskId" not in sidecar_e2e_check_source
        or "assert.deepEqual(taskAction, {" not in sidecar_e2e_check_source
        or 'assert.deepEqual(await taskActionResultPromise, {' not in sidecar_e2e_check_source
        or 'callId: "task-call"' not in sidecar_e2e_check_source
        or 'action: "task.action"' not in sidecar_e2e_check_source
        or 'traceId: "trace-task"' not in sidecar_e2e_check_source
        or 'actionVersion: "task-v1"' not in sidecar_e2e_check_source
        or "dryRun: false" not in sidecar_e2e_check_source
        or '"task.action.full-options"' not in sidecar_e2e_check_source
        or '"task-parent-call"' not in sidecar_e2e_check_source
        or '"task-sidecar-smoke"' not in sidecar_e2e_check_source
        or "assert.deepEqual(globalAction, {" not in sidecar_e2e_check_source
        or 'parentCallId: "parent-call"' not in sidecar_e2e_check_source
        or 'assert.deepEqual(await globalActionResultPromise, {' not in sidecar_e2e_check_source
        or 'status: "requires_confirmation"' not in sidecar_e2e_check_source
        or "result: null" not in sidecar_e2e_check_source
        or "error: null" not in sidecar_e2e_check_source
        or 'confirmationId: "confirm-1"' not in sidecar_e2e_check_source
        or 'summary: "Review before running"' not in sidecar_e2e_check_source
        or 'expiresAt: "2026-06-29T00:00:00.000Z"' not in sidecar_e2e_check_source
        or 'traceId: "trace-1"' not in sidecar_e2e_check_source
        or 'actionVersion: "v1"' not in sidecar_e2e_check_source
        or "assert.match(generatedCallIdAction.id, /^call_/)" not in sidecar_e2e_check_source
        or "result: { generated: true }" not in sidecar_e2e_check_source
        or "assert.deepEqual(cronAction, {" not in sidecar_e2e_check_source
        or 'messageId: "task-cron"' not in sidecar_e2e_check_source
        or 'assert.deepEqual(await cronActionResultPromise, {' not in sidecar_e2e_check_source
        or 'callId: "cron-call"' not in sidecar_e2e_check_source
        or 'action: "cron.action"' not in sidecar_e2e_check_source
        or "assert.deepEqual(transientAction, {" not in sidecar_e2e_check_source
        or '"global-transient-call"' not in sidecar_e2e_check_source
        or '"received", "validating", "processing"' not in sidecar_e2e_check_source
        or "resolved a pending action_call" not in sidecar_e2e_check_source
        or "assert.deepEqual(globalErrorAction, {" not in sidecar_e2e_check_source
        or '"global-error-call"' not in sidecar_e2e_check_source
        or '"VALIDATION_FAILED"' not in sidecar_e2e_check_source
        or 'message: "Value was rejected"' not in sidecar_e2e_check_source
        or 'details: { field: "value", reason: "too-small" }' not in sidecar_e2e_check_source
        or 'traceId: "trace-error"' not in sidecar_e2e_check_source
        or "assert.deepEqual(globalCancelledAction, {" not in sidecar_e2e_check_source
        or '"global-cancelled-call"' not in sidecar_e2e_check_source
        or 'result: { reason: "user_cancelled" }' not in sidecar_e2e_check_source
        or '"trace-cancelled"' not in sidecar_e2e_check_source
        or "assert.deepEqual(globalTimeoutAction, {" not in sidecar_e2e_check_source
        or '"global-timeout-call"' not in sidecar_e2e_check_source
        or "timed out" not in sidecar_e2e_check_source
        or 'result: { tooLate: true }' not in sidecar_e2e_check_source
        or "late action_result after timeout should not reopen or duplicate action_call state" not in sidecar_e2e_check_source
        or '"global-disconnect-call"' not in sidecar_e2e_check_source
        or "cancelled by disconnect" not in sidecar_e2e_check_source
        or '"global-after-disconnect-call"' not in sidecar_e2e_check_source
        or "action_call requires an active WebSocket connection" not in sidecar_e2e_check_source
        or '"offline.noop"' not in sidecar_e2e_check_source
        or '"sendHud", [{ status: "offline" }, "conv-offline"]' not in sidecar_e2e_check_source
        or '"sendTaskUpdate", ["Hermes", { status: "completed" }]' not in sidecar_e2e_check_source
        or 'toolName: "arinova_sdk_call"' not in sidecar_e2e_check_source
        or "disconnectedVoid.body.result, null" not in sidecar_e2e_check_source
        or '"disconnected fire-and-forget SDK methods should no-op without websocket frames"' not in sidecar_e2e_check_source
        or 'sendRaw("{bad-json")' not in sidecar_e2e_check_source
        or "malformed websocket JSON did not surface through /sdk-error" not in sidecar_e2e_check_source
        or "abortCleanups" not in sidecar_source
        or "function forgetTask" not in sidecar_source
        or "pendingTaskOutputs" not in sidecar_source
        or "function queueOrSendTaskOutput" not in sidecar_source
        or "function flushPendingTaskOutputs" not in sidecar_source
        or "console.error(error?.stack || String(error))" not in sidecar_source
        or "queueOrSendTaskOutput(taskId, () => task.sendChunk(content))" not in sidecar_source
        or "queueOrSendTaskOutput(taskId, () => task.sendComplete(content, options))" not in sidecar_source
        or "queueOrSendTaskOutput(taskId, () => task.sendError(error))" not in sidecar_source
        or "function clearControlState" not in sidecar_source
        or "return { controlServer, tasks, clearControlState }" not in sidecar_source
        or "clearControlState();" not in sidecar_index_source
        or "dropPending = false" not in sidecar_source
        or "dropPending: true" not in sidecar_source
        or "completedCancelCount" not in sidecar_runtime_check_source
        or "erroredCancelCount" not in sidecar_runtime_check_source
        or "task-forward-fail" not in sidecar_runtime_check_source
        or "task bridge unavailable" not in sidecar_runtime_check_source
        or "forwardFailureCancelCount" not in sidecar_runtime_check_source
        or '"task-transient-disconnect"' not in sidecar_runtime_check_source
        or '"held during reconnect"' not in sidecar_runtime_check_source
        or '"done after reconnect"' not in sidecar_runtime_check_source
        or '"task-complete-while-disconnected"' not in sidecar_runtime_check_source
        or '"queued complete"' not in sidecar_runtime_check_source
        or '"user-offline"' not in sidecar_runtime_check_source
        or 'completeWhileDisconnectedTask.completeOptions, { mentions: ["user-offline"] }' not in sidecar_runtime_check_source
        or 'assert.deepEqual(reconnectComplete.mentions, ["user-offline"])' not in sidecar_e2e_check_source
        or '"task-failing-complete-while-disconnected"' not in sidecar_runtime_check_source
        or '"queued failing complete"' not in sidecar_runtime_check_source
        or '"task-error-while-disconnected"' not in sidecar_runtime_check_source
        or '"queued error"' not in sidecar_runtime_check_source
        or '"task-failing-error-while-disconnected"' not in sidecar_runtime_check_source
        or '"queued failing error"' not in sidecar_runtime_check_source
        or '"task-abort-while-disconnected"' not in sidecar_runtime_check_source
        or '"stale chunk"' not in sidecar_runtime_check_source
        or '"task-signal-cleanup-runtime-active"' not in sidecar_runtime_check_source
        or '"drop on signal cleanup"' not in sidecar_runtime_check_source
        or "clearControlState();\n  clearControlState();" not in sidecar_runtime_check_source
        or '"task-shutdown-runtime-active"' not in sidecar_runtime_check_source
        or '"drop on shutdown"' not in sidecar_runtime_check_source
        or 'typeof clearControlState, "function"' not in sidecar_runtime_check_source
        or "assert.equal(tasks.size, 0)" not in sidecar_runtime_check_source
        or '"task-fair-a1"' not in sidecar_e2e_check_source
        or '"task-fair-c1"' not in sidecar_e2e_check_source
        or "fairQueuedB1.globalQueueSize, 2" not in sidecar_e2e_check_source
        or "fairQueuedC1.globalQueueSize, 5" not in sidecar_e2e_check_source
        or "assert.deepEqual(fairRunOrder" not in sidecar_e2e_check_source
        or "async function runPerConversationE2e" not in sidecar_e2e_check_source
        or '"task-cron-queued-2"' not in sidecar_e2e_check_source
        or '"second queued trigger wakeup"' not in sidecar_e2e_check_source
        or 'cronQueuedSecondEvent.body.taskKind, "trigger"' not in sidecar_e2e_check_source
        or 'cronQueuedSecondEvent.body.content, "second queued trigger wakeup"' not in sidecar_e2e_check_source
        or 'ARINOVA_CONCURRENCY_MODE: "per-conversation"' not in sidecar_e2e_check_source
        or '"task-per-conv-a1"' not in sidecar_e2e_check_source
        or '"task-per-conv-a2"' not in sidecar_e2e_check_source
        or '"task-per-conv-b1"' not in sidecar_e2e_check_source
        or "per-conversation mode should not start a same-conversation queued task immediately" not in sidecar_e2e_check_source
        or "queuedA2.globalQueueSize, 1" not in sidecar_e2e_check_source
        or 'b1Task.body.conversationId, "conv-per-b"' not in sidecar_e2e_check_source
        or 'drainedA2.body.content, "queued same conversation task"' not in sidecar_e2e_check_source
        or '"task-per-conv-cron"' not in sidecar_e2e_check_source
        or '"task-per-conv-real-while-cron"' not in sidecar_e2e_check_source
        or "per-conversation no-conversation sentinel should not queue a real conversation task" not in sidecar_e2e_check_source
        or 'realWhileCron.body.conversationId, "conv-per-real"' not in sidecar_e2e_check_source
        or "async function runUnboundedE2e" not in sidecar_e2e_check_source
        or 'ARINOVA_AGENT_CONCURRENCY_MODE: "unbounded"' not in sidecar_e2e_check_source
        or "unboundedOptions.concurrencyMode, \"unbounded\"" not in sidecar_e2e_check_source
        or '"task-unbounded-a1"' not in sidecar_e2e_check_source
        or '"task-unbounded-a2"' not in sidecar_e2e_check_source
        or "unbounded mode should not queue a same-conversation second task" not in sidecar_e2e_check_source
        or '{ ok: true, connected: true, agentId: "agent-1", tasks: 1 }' not in sidecar_e2e_check_source
        or '{ ok: true, connected: true, agentId: "agent-unbounded", tasks: 2 }' not in sidecar_e2e_check_source
        or '"task-cancel-queued-active"' not in sidecar_e2e_check_source
        or '"task-cancel-queued-pending"' not in sidecar_e2e_check_source
        or "cancelQueuedPending.queuePosition, 0" not in sidecar_e2e_check_source
        or "cancelQueuedPending.globalQueueSize, 1" not in sidecar_e2e_check_source
        or 'event.path === "/cancel" && event.body.taskId === "task-cancel-queued-pending"' not in sidecar_e2e_check_source
        or 'event.path === "/task" && event.body.taskId === "task-cancel-queued-pending"' not in sidecar_e2e_check_source
        or '"cancel queued active done"' not in sidecar_e2e_check_source
        or "function speedSdkAuthRetries" not in sidecar_e2e_check_source
        or '"task-auth-error-active"' not in sidecar_e2e_check_source
        or 'type: "auth_error"' not in sidecar_e2e_check_source
        or '"Invalid bot token"' not in sidecar_e2e_check_source
        or '"Gateway timeout"' not in sidecar_e2e_check_source
        or "invalidAuthFailed.body.retryable, false" not in sidecar_e2e_check_source
        or "retryableAuthFailed.body.retryable, true" not in sidecar_e2e_check_source
        or "authClearedTaskCall.body.error, /no active task/" not in sidecar_e2e_check_source
        or "auth_error retry should reconnect after auth_ok" not in sidecar_e2e_check_source
        or "retryable auth_error should reconnect after auth_ok" not in sidecar_e2e_check_source
        or "function assertAuthEnvelope" not in sidecar_e2e_check_source
        or '"claim-token reconnect agent_auth"' not in sidecar_e2e_check_source
        or '"active-task reconnect agent_auth"' not in sidecar_e2e_check_source
        or '"pong-timeout reconnect agent_auth"' not in sidecar_e2e_check_source
        or '"invalid-auth retry agent_auth"' not in sidecar_e2e_check_source
        or '"retryable-auth retry agent_auth"' not in sidecar_e2e_check_source
        or "`Authentication timeout repeated ${index}`" not in sidecar_e2e_check_source
        or "timeoutAuthFailed.body.retryable, true" not in sidecar_e2e_check_source
        or "repeated auth timeout should keep scheduling retries" not in sidecar_e2e_check_source
        or "repeated auth timeout should recover after auth_ok" not in sidecar_e2e_check_source
        or "`Invalid bot token repeated ${index}`" not in sidecar_e2e_check_source
        or "repeated real auth_error should keep scheduling retries" not in sidecar_e2e_check_source
        or "repeated auth_error should recover after auth_ok" not in sidecar_e2e_check_source
        or '"task-reconnect-active"' not in sidecar_e2e_check_source
        or "authCountBeforeActiveReconnect + 1" not in sidecar_e2e_check_source
        or "active task socket drop should emit a fresh disconnected status" not in sidecar_e2e_check_source
        or "active task reconnect auth_ok should emit a fresh connected status" not in sidecar_e2e_check_source
        or '"buffered while offline"' not in sidecar_e2e_check_source
        or '"completed while offline"' not in sidecar_e2e_check_source
        or "offline chunk should buffer until SDK websocket reconnect auth_ok" not in sidecar_e2e_check_source
        or "offline terminal event should buffer until SDK websocket reconnect auth_ok" not in sidecar_e2e_check_source
        or 'reconnectChunk.chunk, "buffered while offline"' not in sidecar_e2e_check_source
        or 'reconnectComplete.content, "completed while offline"' not in sidecar_e2e_check_source
        or "offline chunks should flush before terminal events" not in sidecar_e2e_check_source
        or 'event.path === "/cancel" && event.body.taskId === "task-reconnect-active"' not in sidecar_e2e_check_source
        or "onboardingSeedCountBeforeSeedlessReconnect" not in sidecar_e2e_check_source
        or 'await callAgentSdk("getOnboardingSeed"), null' not in sidecar_e2e_check_source
        or "seedless reconnect auth_ok should clear SDK seed without forwarding an onboarding seed" not in sidecar_e2e_check_source
        or "this.autoPong = true" not in sidecar_e2e_check_source
        or 'parsed.type === "ping" && this.autoPong' not in sidecar_e2e_check_source
        or "normal ping/pong should not force a reconnect" not in sidecar_e2e_check_source
        or "authCountBeforePongTimeout + 1" not in sidecar_e2e_check_source
        or "pong watchdog reconnect should mark the adapter disconnected" not in sidecar_e2e_check_source
        or "pong watchdog reconnect should restore connected status after auth_ok" not in sidecar_e2e_check_source
        or "async function runInitialPongGraceE2e" not in sidecar_e2e_check_source
        or "graceArinova.autoPong = false" not in sidecar_e2e_check_source
        or '"ari_pong_grace"' not in sidecar_e2e_check_source
        or "initial missing pong should not reconnect before the onopen grace timeout" not in sidecar_e2e_check_source
        or "authCountBeforeGrace + 1" not in sidecar_e2e_check_source
        or '"initial pong grace reconnect agent_auth"' not in sidecar_e2e_check_source
        or '"default reconnect agent_auth"' not in sidecar_e2e_check_source
        or '"default ping timeout reconnect agent_auth"' not in sidecar_e2e_check_source
        or "async function runShutdownCleanupE2e" not in sidecar_e2e_check_source
        or '"task-shutdown-active"' not in sidecar_e2e_check_source
        or '"task-shutdown-queued"' not in sidecar_e2e_check_source
        or '"global-shutdown-pending-call"' not in sidecar_e2e_check_source
        or '(await postShutdownControl("/shutdown", {})).body, { ok: true }' not in sidecar_e2e_check_source
        or "action_call global-shutdown-pending-call cancelled by disconnect" not in sidecar_e2e_check_source
        or "shutdown should cancel the active task" not in sidecar_e2e_check_source
        or "shutdown should not start queued tasks" not in sidecar_e2e_check_source
        or "shutdown should remove queued tasks without adapter cancel" not in sidecar_e2e_check_source
        or "async function runMalformedOnboardingSeedE2e" not in sidecar_e2e_check_source
        or '"ari_malformed_seed"' not in sidecar_e2e_check_source
        or '"something_else"' not in sidecar_e2e_check_source
        or '"bad-kind"' not in sidecar_e2e_check_source
        or "malformed onboarding seed should not be forwarded to Hermes" not in sidecar_e2e_check_source
        or '"missing-prompt"' not in sidecar_e2e_check_source
        or "onboarding seed missing prompt should not be forwarded to Hermes" not in sidecar_e2e_check_source
        or 'onboardingSeed: "nope"' not in sidecar_e2e_check_source
        or "string onboarding seed should not be forwarded to Hermes" not in sidecar_e2e_check_source
        or '"queue_overflow"' not in sidecar_e2e_check_source
        or 'nextCursor: "hist-1"' not in sidecar_e2e_check_source
        or '"hist-att-1"' not in sidecar_e2e_check_source
        or '"task-error"' not in sidecar_runtime_check_source
        or "missingComplete" not in sidecar_runtime_check_source
        or "missingError" not in sidecar_runtime_check_source
        or "completeFailureTask" not in sidecar_runtime_check_source
        or "errorFailureTask" not in sidecar_runtime_check_source
        or "complete delivery failed" not in sidecar_runtime_check_source
        or "error delivery failed" not in sidecar_runtime_check_source
        or "missingAgentUploadData" not in sidecar_runtime_check_source
        or "missingTaskUploadData" not in sidecar_runtime_check_source
        or "missingAgentUploadBase64" not in sidecar_runtime_check_source
        or "badAgentUploadBase64Type" not in sidecar_runtime_check_source
        or "missingTaskUploadBase64" not in sidecar_runtime_check_source
        or "badTaskUploadBase64Type" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.base64 is required" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.base64 must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.base64 is required" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.base64 must be a string" not in sidecar_runtime_check_source
        or "const uploadFileSchema = {" not in sidecar_source
        or "required: [\"base64\"]" not in sidecar_source
        or "must be an object with a base64 string" not in sidecar_source
        or "ambiguousAgentUploadData" not in sidecar_runtime_check_source
        or "ambiguousTaskUploadData" not in sidecar_runtime_check_source
        or "Object.keys(file).filter((key) => key !== \"base64\")" not in sidecar_source
        or "args\\[1\\] has unsupported field\\(s\\): path" not in sidecar_runtime_check_source
        or "args\\[0\\] has unsupported field\\(s\\): path" not in sidecar_runtime_check_source
        or "falsyTask" not in sidecar_runtime_check_source
        or 'const content = requiredTextField(body, "content")' not in sidecar_source
        or "function requiredTextField" not in sidecar_source
        or "badChunkContent" not in sidecar_runtime_check_source
        or "missingChunkContent" not in sidecar_runtime_check_source
        or "badCompleteContent" not in sidecar_runtime_check_source
        or "badErrorContent" not in sidecar_runtime_check_source
        or "ARINOVA_AGENT_SKILLS must be a JSON array" not in sidecar_runtime_check_source
        or 'ARINOVA_AGENT_SKILLS_JSON: \'[{"id":"memo","id":"chat","name":"Chat","description":"Duplicate field"}]\'' not in sidecar_runtime_check_source
        or "JSON object contains duplicate key: id" not in sidecar_runtime_check_source
        or 'ARINOVA_AGENT_SKILLS: \'[{"id":"memo","name":"Memo","description":"One","description":"Two"}]\'' not in sidecar_runtime_check_source
        or "JSON object contains duplicate key: description" not in sidecar_runtime_check_source
        or "ARINOVA_AGENT_SKILLS\\[0\\] requires string id, name and description" not in sidecar_runtime_check_source
        or "ARINOVA_AGENT_SKILLS_JSON\\[0\\] has unsupported field\\(s\\): icon" not in sidecar_runtime_check_source
        or "requires a non-empty id" not in sidecar_runtime_check_source
        or "requires a non-empty name" not in sidecar_runtime_check_source
        or "has duplicate id: memo" not in sidecar_runtime_check_source
        or "const skillIds = new Set()" not in sidecar_source
        or '["id", "name", "description"].includes(key)' not in sidecar_source
        or "assertNoDuplicateJsonKeys(raw)" not in sidecar_source
        or "numericChunkContent" not in sidecar_runtime_check_source
        or "booleanCompleteContent" not in sidecar_runtime_check_source
        or "numericErrorContent" not in sidecar_runtime_check_source
        or "content must be a string" not in sidecar_runtime_check_source
        or "error must be a string" not in sidecar_runtime_check_source
        or "Arinova task is missing taskId" not in sidecar_source
        or "malformedTask" not in sidecar_runtime_check_source
        or "requiredStringField" not in sidecar_source
        or "const value = body[key].trim()" not in sidecar_source
        or 'method: "  sendTelemetry  "' not in sidecar_runtime_check_source
        or "const agentArgNames = new Map([" not in sidecar_source
        or "const taskArgNames = new Map([" not in sidecar_source
        or "const trimmedStringArguments = new Set([" not in sidecar_source
        or "const trimmedStringFields = new Set([" not in sidecar_source
        or "const trimmedStringFieldsByArgument = new Map([" not in sidecar_source
        or "const trimmedStringArrayArguments = new Set([" not in sidecar_source
        or "function normalizeSdkValue(name, value)" not in sidecar_source
        or "trimmedReorderColumnIds" not in sidecar_runtime_check_source
        or '"  col-sidecar-a  "' not in sidecar_runtime_check_source
        or "trimmedStructuredHistoryCursors" not in sidecar_runtime_check_source
        or '"  msg-before  "' not in sidecar_runtime_check_source
        or "trimmedStructuredCardIds" not in sidecar_runtime_check_source
        or '" keep sidecar title padding "' not in sidecar_runtime_check_source
        or "trimmedReportIdentityFields" not in sidecar_runtime_check_source
        or '"  sidecar-session  "' not in sidecar_runtime_check_source
        or '" keep tool padding "' not in sidecar_runtime_check_source
        or "function normalizeSdkArgs(method, args, argNames)" not in sidecar_source
        or "args = normalizeSdkArgs(method, args, agentArgNames)" not in sidecar_source
        or "args = normalizeSdkArgs(method, args, taskArgNames)" not in sidecar_source
        or "trimmedAgentActionOptionIds" not in sidecar_runtime_check_source
        or '"  sidecar-global-call  "' not in sidecar_runtime_check_source
        or '" keep sidecar reason padding "' not in sidecar_runtime_check_source
        or '"  sidecar-task-call  "' not in sidecar_runtime_check_source
        or '" keep task sidecar reason padding "' not in sidecar_runtime_check_source
        or "trimmedAgentMessageArgs" not in sidecar_runtime_check_source
        or '"  conv-sidecar-trim  "' not in sidecar_runtime_check_source
        or '" hello sidecar trim "' not in sidecar_runtime_check_source
        or "trimmedAgentShareNoteArgs" not in sidecar_runtime_check_source
        or '"  note-share-sidecar-trim  "' not in sidecar_runtime_check_source
        or '"  task.sidecar.trim  "' not in sidecar_runtime_check_source
        or 'taskId: "  task-1  ", method: "  fetchHistory  "' not in sidecar_runtime_check_source
        or 'taskId: "  task-1  ", content: "trimmed delta"' not in sidecar_runtime_check_source
        or 'taskId: "  task-1  ", content: "done", mentions: ["user-1", "", "agent-1"]' not in sidecar_runtime_check_source
        or 'taskId: "  task-error  ", error: "cancelled"' not in sidecar_runtime_check_source
        or "validateCallArgs" not in sidecar_source
        or "validateCallArgSchemas" not in sidecar_source
        or "agentArgSchemas" not in sidecar_source
        or "taskArgSchemas" not in sidecar_source
        or "agentRequiredArgCounts" not in sidecar_source
        or "taskRequiredArgCounts" not in sidecar_source
        or "shortAgentArgs" not in sidecar_runtime_check_source
        or "extraAgentArgs" not in sidecar_runtime_check_source
        or "badFetchSkillPromptArg" not in sidecar_runtime_check_source
        or "badShareNoteConversationArg" not in sidecar_runtime_check_source
        or "badShareNoteNoteArg" not in sidecar_runtime_check_source
        or "async function callNoteSdk(agent, method, args)" not in sidecar_source
        or "async function callKanbanSdk(agent, method, args)" not in sidecar_source
        or "function pathSegment(value)" not in sidecar_source
        or "const kanbanVoidMethods = new Set([" not in sidecar_source
        or "kanbanVoidMethods.has(method)" not in sidecar_source
        or "pathSegment(args[0])" not in sidecar_source
        or "pathSegment(args[1])" not in sidecar_source
        or "params.set(\"conversationId\", conversationId)" in sidecar_source
        or "withConversationQuery" in sidecar_source
        or "async function callShareNote(agent, args)" not in sidecar_source
        or "encodeURIComponent(noteIdOrBody)" not in sidecar_source
        or "encodeURIComponent(noteId)" not in sidecar_source
        or 'JSON.stringify({ conversationId })' in sidecar_source
        or 'return await callNoteSdk(agent, method, args)' not in sidecar_source
        or 'return await callKanbanSdk(agent, method, args)' not in sidecar_source
        or 'return await callShareNote(agent, args)' not in sidecar_source
        or "badScalarAgentStringCases" not in sidecar_runtime_check_source
        or 'method: "fetchSkillPrompt", args: [123]' not in sidecar_runtime_check_source
        or 'method: "shareNote", args: [123, "note-1"]' not in sidecar_runtime_check_source
        or 'method: "shareNote", args: ["conv-1", 123]' not in sidecar_runtime_check_source
        or '["sendHud", [{}, 123], 1]' not in sidecar_runtime_check_source
        or '["deleteNote", [123, "note-1"], 0]' not in sidecar_runtime_check_source
        or '["archiveBoard", [123], 0]' not in sidecar_runtime_check_source
        or '["listColumns", [123], 0]' not in sidecar_runtime_check_source
        or '["deleteColumn", [123], 0]' not in sidecar_runtime_check_source
        or '["completeCard", [123], 0]' not in sidecar_runtime_check_source
        or '["listCardCommits", [123], 0]' not in sidecar_runtime_check_source
        or '["linkCardNote", [123, "note-1"], 0]' not in sidecar_runtime_check_source
        or '["unlinkCardNote", [123, "note-1"], 0]' not in sidecar_runtime_check_source
        or '["listCardNotes", [123], 0]' not in sidecar_runtime_check_source
        or '["listLabels", [123], 0]' not in sidecar_runtime_check_source
        or '["deleteLabel", [123], 0]' not in sidecar_runtime_check_source
        or '["addCardLabel", [123, "label-1"], 0]' not in sidecar_runtime_check_source
        or '["removeCardLabel", [123, "label-1"], 0]' not in sidecar_runtime_check_source
        or "badCreateCardMissingTitle" not in sidecar_runtime_check_source
        or "badCreateCardUnknownField" not in sidecar_runtime_check_source
        or "badCreateBoardColumnMissingName" not in sidecar_runtime_check_source
        or "badCreateBoardColumnsType" not in sidecar_runtime_check_source
        or "badCreateBoardColumnItemType" not in sidecar_runtime_check_source
        or "badCreateBoardColumnNameType" not in sidecar_runtime_check_source
        or "badCreateBoardColumnUnknownField" not in sidecar_runtime_check_source
        or "badCreateBoardNameType" not in sidecar_runtime_check_source
        or "badUpdateBoardNameType" not in sidecar_runtime_check_source
        or "badCreateColumnMissingName" not in sidecar_runtime_check_source
        or "badCreateColumnNameType" not in sidecar_runtime_check_source
        or "badUpdateColumnNameType" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.columns\\[0\\]\\.name is required" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.columns must be an array" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.columns\\[0\\] must be an object" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.columns\\[0\\]\\.name must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.columns\\[0\\] has unsupported field\\(s\\): title" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.name must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.name is required" not in sidecar_runtime_check_source
        or "badHistoryLimitType" not in sidecar_runtime_check_source
        or "badHistoryBeforeType" not in sidecar_runtime_check_source
        or "badHistoryAfterType" not in sidecar_runtime_check_source
        or "badHistoryAroundType" not in sidecar_runtime_check_source
        or "badListCardsLimitType" not in sidecar_runtime_check_source
        or "badListCardsSearchType" not in sidecar_runtime_check_source
        or "badListCardsOffsetType" not in sidecar_runtime_check_source
        or "badArchivedCardsPageType" not in sidecar_runtime_check_source
        or "badArchivedCardsLimitType" not in sidecar_runtime_check_source
        or "badQueryMemoryMissingQuery" not in sidecar_runtime_check_source
        or "badQueryMemoryQueryType" not in sidecar_runtime_check_source
        or "badQueryMemoryLimitType" not in sidecar_runtime_check_source
        or "badCreateColumnSortOrderType" not in sidecar_runtime_check_source
        or "badUpdateColumnSortOrderType" not in sidecar_runtime_check_source
        or "badCreateLabelNameType" not in sidecar_runtime_check_source
        or "badCreateLabelColorType" not in sidecar_runtime_check_source
        or "badUpdateLabelNameType" not in sidecar_runtime_check_source
        or "badUpdateLabelColorType" not in sidecar_runtime_check_source
        or "badCommitHashType" not in sidecar_runtime_check_source
        or "badCommitMessageType" not in sidecar_runtime_check_source
        or "badCreateCardColumnIdType" not in sidecar_runtime_check_source
        or "badCreateNoteTitleType" not in sidecar_runtime_check_source
        or "badCreateNoteContentType" not in sidecar_runtime_check_source
        or "badCreateNoteNotebookIdType" not in sidecar_runtime_check_source
        or "badUpdateNoteContentType" not in sidecar_runtime_check_source
        or "badCreateCardColumnNameType" not in sidecar_runtime_check_source
        or "badCreateCardBoardIdType" not in sidecar_runtime_check_source
        or "badCreateCardPriorityType" not in sidecar_runtime_check_source
        or "badCreateCardDescriptionType" not in sidecar_runtime_check_source
        or "badUpdateCardTitleType" not in sidecar_runtime_check_source
        or "badUpdateCardColumnIdType" not in sidecar_runtime_check_source
        or "badUpdateCardDescriptionType" not in sidecar_runtime_check_source
        or "badUpdateCardPriorityType" not in sidecar_runtime_check_source
        or "badUpdateCardSortOrderType" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.limit must be a number" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.search must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.offset must be a number" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.page must be a number" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.query is required" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.query must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.before must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.after must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.around must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.sortOrder must be a number" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.name must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.color must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.commitHash must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.message must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.columnId must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.title must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.content must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.notebookId must be a string" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.content must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.columnName must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.boardId must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.priority must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.description must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.title must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.columnId must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.description must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.priority must be a string" not in sidecar_runtime_check_source
        or "badListNotesTagsType" not in sidecar_runtime_check_source
        or "badListNotesBeforeType" not in sidecar_runtime_check_source
        or "badListNotesLimitType" not in sidecar_runtime_check_source
        or "badListNotesOffsetType" not in sidecar_runtime_check_source
        or "badListNotesArchivedType" not in sidecar_runtime_check_source
        or "badListNotesTagsItemType" not in sidecar_runtime_check_source
        or "badCreateNoteTagsType" not in sidecar_runtime_check_source
        or "badCreateNoteTagsItemType" not in sidecar_runtime_check_source
        or "badUpdateNoteTagsType" not in sidecar_runtime_check_source
        or "badUpdateNoteTagsItemType" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.tags must be an array" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.tags must be an array" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.archived must be a boolean" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.tags items must be strings" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.tags items must be strings" not in sidecar_runtime_check_source
        or "badAgentActionNameType" not in sidecar_runtime_check_source
        or "badAgentActionCallIdType" not in sidecar_runtime_check_source
        or "badAgentActionMetadataType" not in sidecar_runtime_check_source
        or "badAgentActionTaskIdType" not in sidecar_runtime_check_source
        or "badAgentActionConversationIdType" not in sidecar_runtime_check_source
        or "badAgentActionMessageIdType" not in sidecar_runtime_check_source
        or "badAgentActionParentCallIdType" not in sidecar_runtime_check_source
        or "badAgentActionReasonType" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.callId must be a string" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.metadata must be an object" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.taskId must be a string" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.conversationId must be a string" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.messageId must be a string" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.parentCallId must be a string" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.reason must be a string" not in sidecar_runtime_check_source
        or "badAgentActionDryRunType" not in sidecar_runtime_check_source
        or "badAgentActionTimeoutType" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.dryRun must be a boolean" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.timeoutMs must be a number" not in sidecar_runtime_check_source
        or "badTaskUpdateStatus" not in sidecar_runtime_check_source
        or "badTaskUpdateTaskType" not in sidecar_runtime_check_source
        or "badTaskUpdateDurationType" not in sidecar_runtime_check_source
        or "badTaskUpdateCostType" not in sidecar_runtime_check_source
        or "badTaskUpdateTurnsType" not in sidecar_runtime_check_source
        or "badReportRequiredField" not in sidecar_runtime_check_source
        or "badReportSessionIdType" not in sidecar_runtime_check_source
        or "badReportTurnIdType" not in sidecar_runtime_check_source
        or "badReportSeqOrderType" not in sidecar_runtime_check_source
        or "badReportToolNameType" not in sidecar_runtime_check_source
        or "badReportInputType" not in sidecar_runtime_check_source
        or "badReportSuccessType" not in sidecar_runtime_check_source
        or "badReportDurationType" not in sidecar_runtime_check_source
        or "badReportErrorType" not in sidecar_runtime_check_source
        or "badReportMessageIdType" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.task must be a string" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.durationMs must be a number" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.costUsd must be a number" not in sidecar_runtime_check_source
        or "args\\[1\\]\\.numTurns must be a number" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.sessionId must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.turnId must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.seqOrder must be a number" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.toolName must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.input must be an object" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.success must be a boolean" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.durationMs must be a number" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.error must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.messageId must be a string" not in sidecar_runtime_check_source
        or "structuredAgentUnknownFieldCases" not in sidecar_runtime_check_source
        or "structured fields" not in sidecar_runtime_check_source
        or "shortTaskUploadArgs" not in sidecar_runtime_check_source
        or "extraTaskUploadArgs" not in sidecar_runtime_check_source
        or "shortTaskArgs" not in sidecar_runtime_check_source
        or "extraTaskArgs" not in sidecar_runtime_check_source
        or "badTaskActionOption" not in sidecar_runtime_check_source
        or "badTaskActionParentCallIdType" not in sidecar_runtime_check_source
        or "badTaskActionReasonType" not in sidecar_runtime_check_source
        or "badTaskActionCallIdType" not in sidecar_runtime_check_source
        or "badTaskActionMetadataType" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.parentCallId must be a string" not in sidecar_runtime_check_source
        or "args\\[2\\]\\.reason must be a string" not in sidecar_runtime_check_source
        or "taskScopedActionIdOverride" not in sidecar_runtime_check_source
        or "unsupported field\\(s\\): conversationId, messageId, taskId" not in sidecar_runtime_check_source
        or "badTaskActionDryRunType" not in sidecar_runtime_check_source
        or "badTaskActionTimeoutType" not in sidecar_runtime_check_source
        or "badTaskHistoryCursor" not in sidecar_runtime_check_source
        or "badTaskHistoryAfter" not in sidecar_runtime_check_source
        or "badTaskHistoryAround" not in sidecar_runtime_check_source
        or "badTaskHistoryLimit" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.after must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.around must be a string" not in sidecar_runtime_check_source
        or "args\\[0\\]\\.limit must be a number" not in sidecar_runtime_check_source
        or "structuredTaskUnknownFieldCases" not in sidecar_runtime_check_source
        or "taskActionOptionsSchema" not in sidecar_source
        or "taskId must be a non-empty string" not in sidecar_runtime_check_source
        or "method must be a non-empty string" not in sidecar_runtime_check_source
        or "args must be an array when provided" not in sidecar_source
        or "objectTaskArgs" not in sidecar_runtime_check_source
        or "badTaskMethod" not in sidecar_runtime_check_source
        or "badMissingTaskMethod" not in sidecar_runtime_check_source
        or "missingTaskObjectArgs" not in sidecar_runtime_check_source
        or "missingTaskShortActionArgs" not in sidecar_runtime_check_source
        or "missingTaskBadActionArgs" not in sidecar_runtime_check_source
        or "missingTaskBadActionOptions" not in sidecar_runtime_check_source
        or 'method: "notAllowed", args: []' not in sidecar_runtime_check_source
        or "throw new ControlRequestError(`unsupported SDK method: ${method}`)" not in sidecar_source
    )
    e2e_runtime_coverage_contract_count = 1
    e2e_queue_cron_contract_count = 1
    e2e_skill_config_contract_count = 1
    e2e_outbound_delivery_contract_count = 1
    e2e_task_context_action_contract_count = 1
    e2e_tool_report_contract_count = 1
    e2e_reconnect_buffer_contract_count = 1
    e2e_concurrency_mode_contract_count = 1
    e2e_auth_reconnect_contract_count = 1
    e2e_shutdown_cleanup_contract_count = 1
    runtime_upload_validation_contract_count = 1
    expected_control_endpoints = {
        "/healthz",
        "/agent-sdk",
        "/task-sdk",
        "/chunk",
        "/complete",
        "/error",
        "/shutdown",
    }
    control_endpoint_drift = {}
    if exposed_control_endpoints != expected_control_endpoints:
        control_endpoint_drift["sidecar"] = sorted(exposed_control_endpoints)
    if adapter_control_endpoints != expected_control_endpoints:
        control_endpoint_drift["adapter"] = sorted(adapter_control_endpoints)
    missing_control_endpoint_check_coverage = sorted(
        endpoint for endpoint in expected_control_endpoints if f'("{endpoint}"' not in sidecar_runtime_check_source
    )
    runtime_control_validation_contract_count = 1 + len(expected_control_endpoints)
    runtime_structured_arg_validation_contract_count = 1
    clean_install_platform_contract_missing = (
        "standalone_sender_fn" not in clean_install_source
        or "cron_deliver_env_var" not in clean_install_source
        or "apply_yaml_config_fn" not in clean_install_source
        or "def assert_platform_listing_and_toolset_resolution() -> None:" not in clean_install_source
        or "from hermes_cli.platforms import get_all_platforms, platform_label" not in clean_install_source
        or "from hermes_cli.tools_config import _get_platform_tools" not in clean_install_source
        or "copied plugin Arinova platform missing from Hermes platform listing" not in clean_install_source
        or 'arinova.default_toolset != "hermes-arinova"' not in clean_install_source
        or "copied plugin Arinova platform_label() did not use registry metadata" not in clean_install_source
        or "include_default_mcp_servers=False" not in clean_install_source
        or "copied plugin Arinova platform toolset did not resolve through Hermes tools_config" not in clean_install_source
        or "assert_platform_listing_and_toolset_resolution()" not in clean_install_source
        or "def assert_gateway_runner_platform_toolset_resolution() -> None:" not in clean_install_source
        or "import gateway.run as gateway_run" not in clean_install_source
        or "platform_key = gateway_run._platform_config_key(platform)" not in clean_install_source
        or "copied plugin gateway runner did not resolve the Arinova platform toolset" not in clean_install_source
        or "assert_gateway_runner_platform_toolset_resolution()" not in clean_install_source
        or "def assert_yaml_bridge(entry)" not in clean_install_source
        or "wss://clean-yaml.example" not in clean_install_source
        or "conv-clean-yaml" not in clean_install_source
        or "wss://clean-home-alias.example" not in clean_install_source
        or "conv-clean-home-alias" not in clean_install_source
        or "copied plugin YAML bridge did not accept home_channel alias" not in clean_install_source
        or "copied plugin YAML bridge did not seed ARINOVA_HOME_CONVERSATION_NAME from home_channel alias" not in clean_install_source
        or "copied plugin YAML bridge extra" not in clean_install_source
        or "assert_platform_callbacks" not in clean_install_source
        or "copied plugin Arinova platform source drifted" not in clean_install_source
        or "copied plugin Arinova platform plugin_name drifted" not in clean_install_source
        or "copied plugin Arinova platform required_env drifted" not in clean_install_source
        or "copied plugin Arinova allowed users env drifted" not in clean_install_source
        or "copied plugin Arinova allow-all env drifted" not in clean_install_source
        or "copied plugin Arinova install hint drifted" not in clean_install_source
        or "copied plugin Arinova platform hint drifted" not in clean_install_source
        or "copied plugin Arinova adapter factory returned unexpected adapter" not in clean_install_source
        or "copied plugin Arinova adapter factory did not preserve PlatformConfig object" not in clean_install_source
        or "copied plugin Arinova adapter factory did not hydrate credentials" not in clean_install_source
        or "copied plugin did not register Arinova validate_config callback" not in clean_install_source
        or "copied plugin Arinova config callbacks accepted blank env credentials" not in clean_install_source
        or "copied plugin blank env credentials shadowed configured credentials" not in clean_install_source
        or "copied plugin Arinova config callbacks rejected configured credentials" not in clean_install_source
        or "copied plugin Arinova config callbacks rejected PlatformConfig.token credentials" not in clean_install_source
        or "copied plugin Arinova config callbacks rejected env credentials" not in clean_install_source
        or "wss://clean-env.example" not in clean_install_source
        or "def assert_adapter_sidecar_env(module, platform_config) -> None:" not in clean_install_source
        or "ws://clean-sidecar-env.example" not in clean_install_source
        or "ari_clean_sidecar_env" not in clean_install_source
        or '"sidecar_port": 18793' not in clean_install_source
        or '"ARINOVA_SIDECAR_PORT": "18793"' not in clean_install_source
        or '"ARINOVA_AGENT_SKILLS_JSON": \'[{"id":"memo","name":"Memo","description":"Use memos"}]\'' not in clean_install_source
        or '"ARINOVA_CONCURRENCY_MODE": "agent-wide"' not in clean_install_source
        or '"ARINOVA_RECONNECT_INTERVAL_MS": "1234"' not in clean_install_source
        or '"ARINOVA_AGENT_SDK_ROOT": "/tmp/hermes-arinova-clean-sdk-root"' not in clean_install_source
        or '"sidecar_post_timeout_ms": 6789' not in clean_install_source
        or '"connect_timeout_ms": 7890' not in clean_install_source
        or '"download_attachments": False' not in clean_install_source
        or '"attachment_max_bytes": 8901' not in clean_install_source
        or '"sidecar_autostart": False' not in clean_install_source
        or '"allow_bots": "all"' not in clean_install_source
        or "copied plugin adapter runtime controls drifted" not in clean_install_source
        or "copied plugin sidecar env" not in clean_install_source
        or "def manifest_hooks(path: Path) -> set[str]" not in clean_install_source
        or "provides_hooks:" not in clean_install_source
        or "registered hooks did not match manifest" not in clean_install_source
        or "registered_hooks != expected_hooks" not in clean_install_source
        or "assert_registry_schemas" not in clean_install_source
        or "class FakeDispatchAdapter" not in clean_install_source
        or "async def assert_registry_dispatches(registry, module)" not in clean_install_source
        or 'registry.get_entry("arinova_sdk_call")' not in clean_install_source
        or 'registry.get_entry("arinova_send_message")' not in clean_install_source
        or 'registry.get_entry("arinova_upload_file")' not in clean_install_source
        or 'registry.get_entry("arinova_task_call")' not in clean_install_source
        or 'registry.get_entry("arinova_task_call_action")' not in clean_install_source
        or 'registry.get_entry("arinova_task_fetch_history")' not in clean_install_source
        or 'registry.get_entry("arinova_task_upload_file")' not in clean_install_source
        or '"file": {"base64": "R0E="}' not in clean_install_source
        or '"file": {"base64": "SGk="}' not in clean_install_source
        or '"file": {"base64": "R0k="}' not in clean_install_source
        or '"file": {"base64": "IQ=="}' not in clean_install_source
        or "non_object_payload_errors" not in clean_install_source
        or "copied plugin registry dispatch did not reject non-object tool payloads" not in clean_install_source
        or "copied plugin registry dispatch did not preserve no-conversation task guard" not in clean_install_source
        or "taskKind=cron_wakeup" not in clean_install_source
        or "copied plugin registry dispatch did not route expected SDK calls" not in clean_install_source
        or "asyncio.run(assert_registry_dispatches(registry, loaded.module))" not in clean_install_source
        or "def assert_agent_runtime_invokes_enabled_toolset(module) -> None:" not in clean_install_source
        or 'sys.modules.setdefault("httpx", types.ModuleType("httpx"))' not in clean_install_source
        or "from agent import agent_runtime_helpers" not in clean_install_source
        or "agent_runtime_helpers._ra = lambda: model_tools" not in clean_install_source
        or "agent_runtime_helpers.invoke_tool(" not in clean_install_source
        or "copied plugin Hermes agent runtime invoke did not preserve positional argument bound error" not in clean_install_source
        or "args for sendMessage requires at least 2 item(s)" not in clean_install_source
        or 'sys.modules.setdefault("requests", types.ModuleType("requests"))' not in clean_install_source
        or "import run_agent" not in clean_install_source
        or "from agent import tool_executor" not in clean_install_source
        or "run_agent.AIAgent._invoke_tool(" not in clean_install_source
        or "tool_executor.execute_tool_calls_sequential(" not in clean_install_source
        or "tool_executor.execute_tool_calls_concurrent(" not in clean_install_source
        or "tool_executor._ra = lambda: model_tools" not in clean_install_source
        or "previous_agent_runtime_ra = agent_runtime_helpers._ra" not in clean_install_source
        or "copied plugin tool_executor did not preserve bridge argument object error" not in clean_install_source
        or "copied plugin concurrent tool_executor did not preserve bridge argument object error" not in clean_install_source
        or "tool_call 'arguments' must be an object" not in clean_install_source
        or "class OutOfScopeToolExecutorAgent" not in clean_install_source
        or "copied plugin tool_executor did not block out-of-scope Arinova bridge call" not in clean_install_source
        or "copied plugin concurrent tool_executor did not block out-of-scope Arinova bridge call" not in clean_install_source
        or "_tool_worker_threads_lock = threading.Lock()" not in clean_install_source
        or 'enabled_toolsets = ["hermes-arinova"]' not in clean_install_source
        or '"tool_call"' not in clean_install_source
        or "hello from Hermes tool_call bridge" not in clean_install_source
        or "hello from Hermes tool executor bridge" not in clean_install_source
        or "hello from Hermes concurrent tool executor bridge" not in clean_install_source
        or "copied plugin Hermes tool_call bridge invoke failed" not in clean_install_source
        or "copied plugin Hermes agent runtime invoke did not route expected SDK call" not in clean_install_source
        or "copied plugin tool_executor did not unwrap tool_call through enabled Arinova toolset" not in clean_install_source
        or "copied plugin concurrent tool_executor did not unwrap tool_call through enabled Arinova toolset" not in clean_install_source
        or "assert_agent_runtime_invokes_enabled_toolset(loaded.module)" not in clean_install_source
        or "def expected_tool_schemas(module)" not in clean_install_source
        or "module.register_tools.__globals__" not in clean_install_source
        or "arinova_task_upload_file" not in clean_install_source
        or "conversationId" not in clean_install_source
        or "fileName" not in clean_install_source
        or "actionArgs" not in clean_install_source
        or "def assert_registry_schemas(registry, module, expected_tools: set[str])" not in clean_install_source
        or "def assert_registry_toolset_index(registry, expected_tools: set[str]) -> None:" not in clean_install_source
        or "copied plugin registry toolset index did not match manifest tools" not in clean_install_source
        or "copied plugin available toolset metadata did not expose manifest tools" not in clean_install_source
        or "assert_registry_toolset_index(registry, expected_tools)" not in clean_install_source
        or "def assert_model_tools_enabled_toolset(module, expected_tools: set[str]) -> None:" not in clean_install_source
        or "copied plugin model_tools enabled_toolsets did not expose manifest Arinova tools" not in clean_install_source
        or "def assert_real_agent_init_enabled_toolset(module, expected_tools: set[str]) -> None:" not in clean_install_source
        or "agent = run_agent.AIAgent(" not in clean_install_source
        or 'enabled_toolsets=["hermes-arinova"]' not in clean_install_source
        or "ssl_guard.verify_ca_bundle_with_fallback = lambda: None" not in clean_install_source
        or "copied plugin AIAgent init did not expose Tool Search bridge tools" not in clean_install_source
        or "copied plugin AIAgent init leaked direct Arinova tools with Tool Search enabled" not in clean_install_source
        or "copied plugin AIAgent init valid_tool_names missed bridge tools" not in clean_install_source
        or "copied plugin AIAgent init tool_search could not find Arinova tool" not in clean_install_source
        or "assert_real_agent_init_enabled_toolset(loaded.module, expected_tools)" not in clean_install_source
        or "tool_search.ToolSearchConfig(" not in clean_install_source
        or 'enabled="on"' not in clean_install_source
        or '"tool_search"' not in clean_install_source
        or '"tool_describe"' not in clean_install_source
        or '"tool_call"' not in clean_install_source
        or "copied plugin model_tools tool_call did not block out-of-scope Arinova bridge call" not in clean_install_source
        or "copied plugin model_tools Tool Search did not defer Arinova tools" not in clean_install_source
        or "copied plugin tool_search did not surface arinova_send_message" not in clean_install_source
        or "copied plugin tool_describe did not expose arinova_send_message schema" not in clean_install_source
        or "assert_model_tools_enabled_toolset(loaded.module, expected_tools)" not in clean_install_source
        or "missing_registry_tools = sorted(name for name in expected_tools if registry.get_entry(name) is None)" not in clean_install_source
        or "copied plugin tools missing from registry" not in clean_install_source
        or "registry.get_definitions(\n            expected_tools" not in clean_install_source
        or "set(by_name) != expected_tools" not in clean_install_source
        or "schema function name mismatch" not in clean_install_source
        or "schema parameters are not an object" not in clean_install_source
        or "schema description drifted" not in clean_install_source
        or "schema parameters drifted from generated schema" not in clean_install_source
        or "generated schema set mismatch" not in clean_install_source
        or "schema does not expose positional args" not in clean_install_source
        or "generic schema does not require method" not in clean_install_source
        or 'tools["TASK_METHODS"] if name == "arinova_task_call" else tools["AGENT_METHODS"]' not in clean_install_source
        or "generic schema method enum drifted" not in clean_install_source
        or "method-specific schema unexpectedly exposes method" not in clean_install_source
        or "task schema missing task id aliases" not in clean_install_source
        or "copied plugin method schema missing aliases" not in clean_install_source
        or "copied plugin task method schema missing aliases" not in clean_install_source
        or "def assert_sidecar_check_script(sidecar_package: dict)" not in clean_install_source
        or "EXPECTED_SIDECAR_SYNTAX_CHECKS" not in clean_install_source
        or "copied sidecar check script is missing syntax check(s)" not in clean_install_source
        or '"index.mjs"' not in clean_install_source
        or '"runtime.mjs"' not in clean_install_source
        or "copied sidecar check script is missing verifier(s)" not in clean_install_source
        or "check-runtime.mjs" not in clean_install_source
        or "check-sdk-e2e.mjs" not in clean_install_source
        or "check-sdk-http.mjs" not in clean_install_source
        or '"npm", "ci", "--ignore-scripts"' not in clean_install_source
        or '"npm", "run", "check"' not in clean_install_source
        or 'str(plugin_dir / "scripts/check_gateway_config_load.py")' not in clean_install_source
        or '"--hermes-root"' not in clean_install_source
        or "installed unexpected @arinova-ai/agent-sdk version" not in clean_install_source
        or "SDK_PACKAGE_PUBLIC_METADATA_KEYS" not in clean_install_source
        or '"--sdk-root"' not in clean_install_source
        or "def assert_sdk_package_matches_local(installed_package_path: Path, sdk_root: Path)" not in clean_install_source
        or "copied sidecar SDK package version differs from local agent-sdk package" not in clean_install_source
        or "copied sidecar SDK package metadata differs from local agent-sdk package" not in clean_install_source
        or "copied sidecar SDK package exports drifted" not in clean_install_source
        or "assert_sdk_package_matches_local(sdk_package_path, sdk_root)" not in clean_install_source
        or "def assert_sidecar_lock_matches_local(sidecar_dir: Path, sdk_root: Path)" not in clean_install_source
        or "assert_sidecar_lock_matches_local(plugin_dir / \"sidecar\", sdk_root)" not in clean_install_source
        or "copied sidecar lockfile version is not npm v3" not in clean_install_source
        or "copied sidecar lockfile does not declare dependency requirements" not in clean_install_source
        or "copied sidecar lockfile root package name differs from package.json" not in clean_install_source
        or "copied sidecar lockfile root package version differs from package.json" not in clean_install_source
        or "copied sidecar lockfile root dependencies differ from package.json" not in clean_install_source
        or "copied sidecar lockfile root engines differ from package.json" not in clean_install_source
        or "copied sidecar package.json SDK dependency is not pinned to local agent-sdk package" not in clean_install_source
        or "copied sidecar lockfile SDK dependency is not pinned to local agent-sdk package" not in clean_install_source
        or "copied sidecar lockfile SDK package version differs from local agent-sdk package" not in clean_install_source
        or "copied sidecar lockfile SDK package tarball differs from local agent-sdk package" not in clean_install_source
        or "copied sidecar lockfile SDK package license differs from local agent-sdk package" not in clean_install_source
        or "copied sidecar lockfile SDK package integrity is missing or not sha512" not in clean_install_source
        or "assert_sdk_dist_matches_local" not in clean_install_source
        or "SDK_PACKAGE_FILES" not in clean_install_source
        or "copied sidecar SDK package files differ from local agent-sdk package" not in clean_install_source
        or "README.md" not in clean_install_source
        or "dist/types.d.ts" not in clean_install_source
        or "dist/types.d.ts.map" not in clean_install_source
        or "with sidecar dependencies" not in clean_install_source
        or "without installing sidecar dependencies" not in clean_install_source
        or "REQUIRED_PLUGIN_FILES" not in clean_install_source
        or "def assert_required_plugin_files(plugin_dir: Path)" not in clean_install_source
        or "copied plugin is missing required file(s)" not in clean_install_source
        or '"sidecar/runtime.mjs"' not in clean_install_source
        or '"scripts/check_local.py"' not in clean_install_source
        or '"scripts/check_sdk_surface.py"' not in clean_install_source
        or '"scripts/check_agent_sdk_source.py"' not in clean_install_source
        or "for relative_path in REQUIRED_PLUGIN_FILES" not in clean_install_source
    )
    clean_install_contract_count = 1
    clean_install_yaml_bridge_contract_count = 1
    clean_install_platform_callback_contract_count = 1
    clean_install_platform_metadata_contract_count = 1
    clean_install_platform_factory_contract_count = 1
    clean_install_registry_schema_contract_count = 1
    clean_install_registry_dispatch_contract_count = 1
    clean_install_agent_runtime_bridge_contract_count = 1
    clean_install_agent_init_contract_count = 1
    clean_install_tool_search_bridge_contract_count = 1
    clean_install_gateway_runner_toolset_contract_count = 1
    clean_install_sidecar_check_contract_count = 1
    user_install_contract_missing = (
        "discover_and_load(force=True)" not in user_install_source
        or 'plugins" / "hermes-arinova-plugin"' not in user_install_source
        or "plugin_dir.resolve() != ROOT" not in user_install_source
        or "def assert_real_config_enabled(hermes_home: Path) -> None:" not in user_install_source
        or "yaml.safe_load" not in user_install_source
        or 'plugins.get("enabled")' not in user_install_source
        or '"hermes-arinova-plugin" not in enabled' not in user_install_source
        or "enabled user plugin is not listed in real Hermes plugins.enabled" not in user_install_source
        or "assert_real_config_enabled(hermes_home)" not in user_install_source
        or "def assert_platform_listing() -> None:" not in user_install_source
        or "from hermes_cli.platforms import get_all_platforms, platform_label" not in user_install_source
        or "enabled user plugin Arinova platform missing from Hermes platform listing" not in user_install_source
        or 'arinova.default_toolset != "hermes-arinova"' not in user_install_source
        or "enabled user plugin Arinova platform_label() did not use registry metadata" not in user_install_source
        or "assert_platform_listing()" not in user_install_source
        or "def assert_platform_toolset_resolution() -> None:" not in user_install_source
        or "from hermes_cli.config import load_config" not in user_install_source
        or "from hermes_cli.tools_config import _get_platform_tools" not in user_install_source
        or "include_default_mcp_servers=False" not in user_install_source
        or "enabled user plugin Arinova platform toolset did not resolve through Hermes tools_config" not in user_install_source
        or "assert_platform_toolset_resolution()" not in user_install_source
        or "def assert_gateway_runner_platform_toolset_resolution() -> None:" not in user_install_source
        or "import gateway.run as gateway_run" not in user_install_source
        or "platform_key = gateway_run._platform_config_key(platform)" not in user_install_source
        or "enabled user plugin gateway runner did not resolve the Arinova platform toolset" not in user_install_source
        or "assert_gateway_runner_platform_toolset_resolution()" not in user_install_source
        or "standalone_sender_fn" not in user_install_source
        or "cron_deliver_env_var" not in user_install_source
        or "apply_yaml_config_fn" not in user_install_source
        or "def assert_yaml_bridge(entry)" not in user_install_source
        or "wss://user-yaml.example" not in user_install_source
        or "conv-user-yaml" not in user_install_source
        or "wss://user-home-alias.example" not in user_install_source
        or "conv-user-home-alias" not in user_install_source
        or "enabled user plugin YAML bridge did not accept home_channel alias" not in user_install_source
        or "enabled user plugin YAML bridge did not seed ARINOVA_HOME_CONVERSATION_NAME from home_channel alias" not in user_install_source
        or "enabled user plugin YAML bridge extra" not in user_install_source
        or "assert_platform_callbacks" not in user_install_source
        or "enabled user plugin Arinova platform source drifted" not in user_install_source
        or "enabled user plugin Arinova platform plugin_name drifted" not in user_install_source
        or "enabled user plugin Arinova platform required_env drifted" not in user_install_source
        or "enabled user plugin Arinova allowed users env drifted" not in user_install_source
        or "enabled user plugin Arinova allow-all env drifted" not in user_install_source
        or "enabled user plugin Arinova install hint drifted" not in user_install_source
        or "enabled user plugin Arinova platform hint drifted" not in user_install_source
        or "enabled user plugin Arinova adapter factory returned unexpected adapter" not in user_install_source
        or "enabled user plugin Arinova adapter factory did not preserve PlatformConfig object" not in user_install_source
        or "enabled user plugin Arinova adapter factory did not hydrate credentials" not in user_install_source
        or "enabled user plugin did not register Arinova validate_config callback" not in user_install_source
        or "enabled user plugin Arinova config callbacks accepted blank env credentials" not in user_install_source
        or "enabled user plugin blank env credentials shadowed configured credentials" not in user_install_source
        or "enabled user plugin Arinova config callbacks rejected configured credentials" not in user_install_source
        or "enabled user plugin Arinova config callbacks rejected PlatformConfig.token credentials" not in user_install_source
        or "enabled user plugin Arinova config callbacks rejected env credentials" not in user_install_source
        or "wss://user-env.example" not in user_install_source
        or "def assert_adapter_sidecar_env(module, platform_config) -> None:" not in user_install_source
        or "ws://user-sidecar-env.example" not in user_install_source
        or "ari_user_sidecar_env" not in user_install_source
        or '"sidecar_port": 18794' not in user_install_source
        or '"ARINOVA_SIDECAR_PORT": "18794"' not in user_install_source
        or '"ARINOVA_AGENT_SKILLS_JSON": \'[{"id":"memo","name":"Memo","description":"Use memos"}]\'' not in user_install_source
        or '"ARINOVA_CONCURRENCY_MODE": "agent-wide"' not in user_install_source
        or '"ARINOVA_RECONNECT_INTERVAL_MS": "1234"' not in user_install_source
        or '"ARINOVA_AGENT_SDK_ROOT": "/tmp/hermes-arinova-user-sdk-root"' not in user_install_source
        or '"sidecar_post_timeout_ms": 6789' not in user_install_source
        or '"connect_timeout_ms": 7890' not in user_install_source
        or '"download_attachments": False' not in user_install_source
        or '"attachment_max_bytes": 8901' not in user_install_source
        or '"sidecar_autostart": False' not in user_install_source
        or '"allow_bots": "all"' not in user_install_source
        or "enabled user plugin adapter runtime controls drifted" not in user_install_source
        or "enabled user plugin sidecar env" not in user_install_source
        or "registry.get_entry" not in user_install_source
        or "def manifest_hooks(path: Path) -> set[str]" not in user_install_source
        or "provides_hooks:" not in user_install_source
        or "registered hooks did not match manifest" not in user_install_source
        or "registered_hooks != expected_hooks" not in user_install_source
        or "assert_registry_schemas" not in user_install_source
        or "class FakeDispatchAdapter" not in user_install_source
        or "async def assert_registry_dispatches(registry, module)" not in user_install_source
        or 'registry.get_entry("arinova_sdk_call")' not in user_install_source
        or 'registry.get_entry("arinova_send_message")' not in user_install_source
        or 'registry.get_entry("arinova_upload_file")' not in user_install_source
        or 'registry.get_entry("arinova_task_call")' not in user_install_source
        or 'registry.get_entry("arinova_task_call_action")' not in user_install_source
        or 'registry.get_entry("arinova_task_fetch_history")' not in user_install_source
        or 'registry.get_entry("arinova_task_upload_file")' not in user_install_source
        or '"file": {"base64": "R0E="}' not in user_install_source
        or '"file": {"base64": "SGk="}' not in user_install_source
        or '"file": {"base64": "R0k="}' not in user_install_source
        or '"file": {"base64": "IQ=="}' not in user_install_source
        or "non_object_payload_errors" not in user_install_source
        or "enabled user plugin registry dispatch did not reject non-object tool payloads" not in user_install_source
        or "enabled user plugin registry dispatch did not preserve no-conversation task guard" not in user_install_source
        or "taskKind=cron_wakeup" not in user_install_source
        or "enabled user plugin registry dispatch did not route expected SDK calls" not in user_install_source
        or "asyncio.run(assert_registry_dispatches(registry, loaded.module))" not in user_install_source
        or "def assert_agent_runtime_invokes_enabled_toolset(module) -> None:" not in user_install_source
        or 'sys.modules.setdefault("httpx", types.ModuleType("httpx"))' not in user_install_source
        or "from agent import agent_runtime_helpers" not in user_install_source
        or "agent_runtime_helpers._ra = lambda: model_tools" not in user_install_source
        or "agent_runtime_helpers.invoke_tool(" not in user_install_source
        or "enabled user plugin Hermes agent runtime invoke did not preserve positional argument bound error" not in user_install_source
        or "args for sendMessage requires at least 2 item(s)" not in user_install_source
        or 'sys.modules.setdefault("requests", types.ModuleType("requests"))' not in user_install_source
        or "import run_agent" not in user_install_source
        or "from agent import tool_executor" not in user_install_source
        or "run_agent.AIAgent._invoke_tool(" not in user_install_source
        or "tool_executor.execute_tool_calls_sequential(" not in user_install_source
        or "tool_executor.execute_tool_calls_concurrent(" not in user_install_source
        or "tool_executor._ra = lambda: model_tools" not in user_install_source
        or "previous_agent_runtime_ra = agent_runtime_helpers._ra" not in user_install_source
        or "enabled user plugin tool_executor did not preserve bridge argument object error" not in user_install_source
        or "enabled user plugin concurrent tool_executor did not preserve bridge argument object error" not in user_install_source
        or "tool_call 'arguments' must be an object" not in user_install_source
        or "class OutOfScopeToolExecutorAgent" not in user_install_source
        or "enabled user plugin tool_executor did not block out-of-scope Arinova bridge call" not in user_install_source
        or "enabled user plugin concurrent tool_executor did not block out-of-scope Arinova bridge call" not in user_install_source
        or "_tool_worker_threads_lock = threading.Lock()" not in user_install_source
        or 'enabled_toolsets = ["hermes-arinova"]' not in user_install_source
        or '"tool_call"' not in user_install_source
        or "hello from Hermes tool_call bridge" not in user_install_source
        or "hello from Hermes tool executor bridge" not in user_install_source
        or "hello from Hermes concurrent tool executor bridge" not in user_install_source
        or "enabled user plugin Hermes tool_call bridge invoke failed" not in user_install_source
        or "enabled user plugin Hermes agent runtime invoke did not route expected SDK call" not in user_install_source
        or "enabled user plugin tool_executor did not unwrap tool_call through enabled Arinova toolset" not in user_install_source
        or "enabled user plugin concurrent tool_executor did not unwrap tool_call through enabled Arinova toolset" not in user_install_source
        or "assert_agent_runtime_invokes_enabled_toolset(loaded.module)" not in user_install_source
        or "def expected_tool_schemas(module)" not in user_install_source
        or "module.register_tools.__globals__" not in user_install_source
        or "arinova_task_upload_file" not in user_install_source
        or "conversationId" not in user_install_source
        or "fileName" not in user_install_source
        or "actionArgs" not in user_install_source
        or "def assert_registry_schemas(registry, module, expected_tools: set[str])" not in user_install_source
        or "def assert_registry_toolset_index(registry, expected_tools: set[str]) -> None:" not in user_install_source
        or "enabled user plugin registry toolset index did not match manifest tools" not in user_install_source
        or "enabled user plugin available toolset metadata did not expose manifest tools" not in user_install_source
        or "assert_registry_toolset_index(registry, expected_tools)" not in user_install_source
        or "def assert_model_tools_enabled_toolset(module, expected_tools: set[str]) -> None:" not in user_install_source
        or "enabled user plugin model_tools enabled_toolsets did not expose manifest Arinova tools" not in user_install_source
        or "def assert_real_agent_init_enabled_toolset(module, expected_tools: set[str]) -> None:" not in user_install_source
        or "agent = run_agent.AIAgent(" not in user_install_source
        or 'enabled_toolsets=["hermes-arinova"]' not in user_install_source
        or "ssl_guard.verify_ca_bundle_with_fallback = lambda: None" not in user_install_source
        or "enabled user plugin AIAgent init did not expose Tool Search bridge tools" not in user_install_source
        or "enabled user plugin AIAgent init leaked direct Arinova tools with Tool Search enabled" not in user_install_source
        or "enabled user plugin AIAgent init valid_tool_names missed bridge tools" not in user_install_source
        or "enabled user plugin AIAgent init tool_search could not find Arinova tool" not in user_install_source
        or "assert_real_agent_init_enabled_toolset(loaded.module, expected_tools)" not in user_install_source
        or "tool_search.ToolSearchConfig(" not in user_install_source
        or 'enabled="on"' not in user_install_source
        or '"tool_search"' not in user_install_source
        or '"tool_describe"' not in user_install_source
        or '"tool_call"' not in user_install_source
        or "enabled user plugin model_tools tool_call did not block out-of-scope Arinova bridge call" not in user_install_source
        or "enabled user plugin model_tools Tool Search did not defer Arinova tools" not in user_install_source
        or "enabled user plugin tool_search did not surface arinova_send_message" not in user_install_source
        or "enabled user plugin tool_describe did not expose arinova_send_message schema" not in user_install_source
        or "assert_model_tools_enabled_toolset(loaded.module, expected_tools)" not in user_install_source
        or "registry.get_definitions(\n            expected_tools" not in user_install_source
        or "set(by_name) != expected_tools" not in user_install_source
        or "schema function name mismatch" not in user_install_source
        or "schema parameters are not an object" not in user_install_source
        or "schema description drifted" not in user_install_source
        or "schema parameters drifted from generated schema" not in user_install_source
        or "generated schema set mismatch" not in user_install_source
        or "schema does not expose positional args" not in user_install_source
        or "generic schema does not require method" not in user_install_source
        or 'tools["TASK_METHODS"] if name == "arinova_task_call" else tools["AGENT_METHODS"]' not in user_install_source
        or "generic schema method enum drifted" not in user_install_source
        or "method-specific schema unexpectedly exposes method" not in user_install_source
        or "task schema missing task id aliases" not in user_install_source
        or "enabled user plugin method schema missing aliases" not in user_install_source
        or "enabled user plugin task method schema missing aliases" not in user_install_source
        or "def assert_sidecar_check_script(sidecar_package: dict)" not in user_install_source
        or "EXPECTED_SIDECAR_SYNTAX_CHECKS" not in user_install_source
        or "enabled user sidecar check script is missing syntax check(s)" not in user_install_source
        or '"index.mjs"' not in user_install_source
        or '"runtime.mjs"' not in user_install_source
        or "enabled user sidecar check script is missing verifier(s)" not in user_install_source
        or "check-runtime.mjs" not in user_install_source
        or "check-sdk-e2e.mjs" not in user_install_source
        or "check-sdk-http.mjs" not in user_install_source
        or "installed unexpected @arinova-ai/agent-sdk version" not in user_install_source
        or "SDK_PACKAGE_PUBLIC_METADATA_KEYS" not in user_install_source
        or '"--sdk-root"' not in user_install_source
        or "def assert_sdk_package_matches_local(installed_package_path: Path, sdk_root: Path)" not in user_install_source
        or "enabled user plugin SDK package version differs from local agent-sdk package" not in user_install_source
        or "enabled user plugin SDK package metadata differs from local agent-sdk package" not in user_install_source
        or "enabled user plugin SDK package exports drifted" not in user_install_source
        or "assert_sdk_package_matches_local(sdk_package_path, sdk_root)" not in user_install_source
        or "enabled user plugin check_requirements() did not pass with installed sidecar dependencies" not in user_install_source
        or "def assert_sidecar_lock_matches_local(sidecar_dir: Path, sdk_root: Path)" not in user_install_source
        or "assert_sidecar_lock_matches_local(plugin_dir / \"sidecar\", sdk_root)" not in user_install_source
        or "enabled user sidecar lockfile version is not npm v3" not in user_install_source
        or "enabled user sidecar lockfile does not declare dependency requirements" not in user_install_source
        or "enabled user sidecar lockfile root package name differs from package.json" not in user_install_source
        or "enabled user sidecar lockfile root package version differs from package.json" not in user_install_source
        or "enabled user sidecar lockfile root dependencies differ from package.json" not in user_install_source
        or "enabled user sidecar lockfile root engines differ from package.json" not in user_install_source
        or "enabled user sidecar package.json SDK dependency is not pinned to local agent-sdk package" not in user_install_source
        or "enabled user sidecar lockfile SDK dependency is not pinned to local agent-sdk package" not in user_install_source
        or "enabled user sidecar lockfile SDK package version differs from local agent-sdk package" not in user_install_source
        or "enabled user sidecar lockfile SDK package tarball differs from local agent-sdk package" not in user_install_source
        or "enabled user sidecar lockfile SDK package license differs from local agent-sdk package" not in user_install_source
        or "enabled user sidecar lockfile SDK package integrity is missing or not sha512" not in user_install_source
        or "assert_sdk_dist_matches_local" not in user_install_source
        or "SDK_PACKAGE_FILES" not in user_install_source
        or "enabled user plugin SDK package files differ from local agent-sdk package" not in user_install_source
        or "README.md" not in user_install_source
        or "dist/types.d.ts" not in user_install_source
        or "dist/types.d.ts.map" not in user_install_source
        or "REQUIRED_PLUGIN_FILES" not in user_install_source
        or "def assert_required_plugin_files(plugin_dir: Path)" not in user_install_source
        or "enabled user plugin is missing required file(s)" not in user_install_source
        or '"sidecar/runtime.mjs"' not in user_install_source
        or '"scripts/check_local.py"' not in user_install_source
        or '"scripts/check_sdk_surface.py"' not in user_install_source
        or '"scripts/check_agent_sdk_source.py"' not in user_install_source
        or "for relative_path in REQUIRED_PLUGIN_FILES" not in user_install_source
    )
    agent_sdk_source_check_drift = (
        "DEFAULT_SDK_ROOT" not in agent_sdk_source_check_source
        or "SDK_SOURCE_FILES" not in agent_sdk_source_check_source
        or "SDK_PACKAGE_FILES" not in agent_sdk_source_check_source
        or "SDK_PACKAGE_PUBLIC_METADATA_KEYS" not in agent_sdk_source_check_source
        or "def assert_bundled_sdk_matches_source(sdk_root: Path) -> str:" not in agent_sdk_source_check_source
        or "bundled @arinova-ai/agent-sdk package files differ from local agent-sdk source" not in agent_sdk_source_check_source
        or "def git_root(path: Path) -> Path | None:" not in agent_sdk_source_check_source
        or "def assert_sdk_source_clean(sdk_root: Path, phase: str) -> None:" not in agent_sdk_source_check_source
        or '["git", "-C", str(root), "status", "--short", "--", str(sdk_root)]' not in agent_sdk_source_check_source
        or "plugin checks must not modify" not in agent_sdk_source_check_source
        or "before source SDK checks" not in agent_sdk_source_check_source
        or "after source SDK checks" not in agent_sdk_source_check_source
        or 'run_sdk_command(sdk_root, ["npm", "run", "lint"])' not in agent_sdk_source_check_source
        or 'run_sdk_command(sdk_root, ["npm", "test", "--", "--run"])' not in agent_sdk_source_check_source
        or "agent-sdk source OK:" not in agent_sdk_source_check_source
    )
    sdk_surface_cli_drift = (
        "import argparse" not in check_sdk_surface_source
        or "DEFAULT_SDK_ROOT" not in check_sdk_surface_source
        or "def parse_args() -> argparse.Namespace:" not in check_sdk_surface_source
        or '"--sdk-root"' not in check_sdk_surface_source
        or "Optional path to agent-sdk src/client.ts" not in check_sdk_surface_source
        or "sdk_client.parents[1] if sdk_client else DEFAULT_SDK_ROOT" not in check_sdk_surface_source
        or "sdk_client must point to agent-sdk src/client.ts" not in check_sdk_surface_source
        or "is not inside sdk_root" not in check_sdk_surface_source
    )
    sdk_surface_cli_contract_count = 1
    local_check_drift = (
        "PY_COMPILE_FILES" not in local_check_source
        or "DEFAULT_SDK_ROOT" not in local_check_source
        or "def _python_probe(command: str) -> tuple[int, int] | None:" not in local_check_source
        or "import sys; import yaml;" not in local_check_source
        or "def resolve_hermes_python(explicit: str | None) -> str:" not in local_check_source
        or 'Path("/tmp/hermes-arinova-plugin-py313-venv/bin/python")' not in local_check_source
        or '"--hermes-python"' not in local_check_source
        or '"--sdk-root"' not in local_check_source
        or "sdk_root_path = Path(args.sdk_root).expanduser().resolve()" not in local_check_source
        or "sdk_root = str(sdk_root_path)" not in local_check_source
        or "def assert_hermes_source_clean(hermes_root: Path, phase: str) -> None:" not in local_check_source
        or '["git", "-C", str(hermes_root), "status", "--short"]' not in local_check_source
        or "plugin integration checks must not modify" not in local_check_source
        or "before Hermes integration checks" not in local_check_source
        or "after Hermes integration checks" not in local_check_source
        or "def assert_sdk_source_clean(sdk_root: Path, phase: str) -> None:" not in local_check_source
        or '["git", "-C", str(root), "status", "--short", "--", str(sdk_root)]' not in local_check_source
        or "local agent-sdk checkout is dirty" not in local_check_source
        or "before local gate" not in local_check_source
        or "after local gate" not in local_check_source
        or "LIVE_CREDENTIAL_ENV_KEYS" not in local_check_source
        or "def env_without_live_credentials() -> dict[str, str]:" not in local_check_source
        or "fixture_env = env_without_live_credentials()" not in local_check_source
        or "code = run(command, env=fixture_env)" not in local_check_source
        or '"scripts/check_agent_sdk_source.py", "--sdk-root", sdk_root' not in local_check_source
        or '"scripts/check_sdk_surface.py", "--sdk-root", sdk_root' not in local_check_source
        or '"scripts/check_arinova_tools.py"' not in local_check_source
        or '"scripts/check_live_connection_gate.py"' not in local_check_source
        or '"--resolve-credentials-only"' not in local_check_source
        or "live_command = [\n        hermes_python," not in local_check_source
        or '"scripts/check_live_connection.py",\n        "--hermes-root",\n        hermes_root,\n        "--sdk-root",\n        sdk_root,' not in local_check_source
        or 'live_command.append("--require-credentials")' not in local_check_source
        or "LIVE_SKIP_PREFIX" not in local_check_source
        or "run_captured(live_command)" not in local_check_source
        or 'source_clean_summary = "Hermes source clean; local agent-sdk source clean"' not in local_check_source
        or "live Arinova smoke skipped; rerun with --require-credentials for release" not in local_check_source
        or "live Arinova smoke connected" not in local_check_source
        or '"scripts/check_hermes_plugin_load.py", "--hermes-root", hermes_root' not in local_check_source
        or '"scripts/check_gateway_config_load.py", "--hermes-root", hermes_root' not in local_check_source
        or '"scripts/check_user_install.py", "--hermes-root", hermes_root, "--sdk-root", sdk_root' not in local_check_source
        or '"scripts/check_clean_install.py", "--hermes-root", hermes_root, "--sdk-root", sdk_root' not in local_check_source
        or '"npm", "--prefix", "sidecar", "run", "check"' not in local_check_source
        or "hermes-arinova local gate OK" not in local_check_source
    )
    sdk_install_integrity_contract_count = 5
    user_install_yaml_bridge_contract_count = 1
    user_install_platform_callback_contract_count = 1
    user_install_platform_metadata_contract_count = 1
    user_install_platform_factory_contract_count = 1
    user_install_registry_schema_contract_count = 1
    user_install_registry_dispatch_contract_count = 1
    user_install_agent_runtime_bridge_contract_count = 1
    user_install_agent_init_contract_count = 1
    user_install_tool_search_bridge_contract_count = 1
    user_install_gateway_runner_toolset_contract_count = 1
    user_install_sidecar_check_contract_count = 1
    gateway_config_contract_missing = (
        "TemporaryDirectory(prefix=\"hermes-arinova-config-\")" not in gateway_config_source
        or "symlink_to(ROOT, target_is_directory=True)" not in gateway_config_source
        or "load_gateway_config()" not in gateway_config_source
        or "wss://yaml.example" not in gateway_config_source
        or "\"concurrency_mode\": \"unbounded\"" not in gateway_config_source
        or "\"reconnect_interval_ms\": 1111" not in gateway_config_source
        or "\"ping_interval_ms\": 2222" not in gateway_config_source
        or "\"ping_timeout_ms\": 3333" not in gateway_config_source
        or "\"max_consecutive_per_conversation\": 4" not in gateway_config_source
        or "\"adapter_post_timeout_ms\": 5432" not in gateway_config_source
        or "\"control_max_body_bytes\": 7654" not in gateway_config_source
        or "\"sidecar_post_timeout_ms\": 6543" not in gateway_config_source
        or "\"download_attachments\": False" not in gateway_config_source
        or "\"attachment_max_bytes\": 1234" not in gateway_config_source
        or "\"allow_bots\": \"all\"" not in gateway_config_source
        or "\"sidecar_bind\": \"127.0.0.2\"" not in gateway_config_source
        or "\"adapter_bind\": \"127.0.0.3\"" not in gateway_config_source
        or "\"agent_sdk_root\": \"/tmp/hermes-arinova-agent-sdk-root\"" not in gateway_config_source
        or "agent_skills_json" not in gateway_config_source
        or '{"id": "chat", "name": "Chat", "description": ""}' not in gateway_config_source
        or "TemporaryDirectory(prefix=\"hermes-arinova-config-duplicate-skills-\")" not in gateway_config_source
        or "Arinova validate_config accepted duplicate YAML agent_skills ids from load_gateway_config()" not in gateway_config_source
        or "TemporaryDirectory(prefix=\"hermes-arinova-config-blank-skill-\")" not in gateway_config_source
        or "Arinova validate_config accepted blank YAML agent_skills id from load_gateway_config()" not in gateway_config_source
        or "from adapter import validate_config" not in gateway_config_source
        or "conv-yaml" not in gateway_config_source
        or "YAML Home" not in gateway_config_source
        or "TemporaryDirectory(prefix=\"hermes-arinova-config-bot-token-\")" not in gateway_config_source
        or "wss://yaml-bot-token.example" not in gateway_config_source
        or "bot_token: ari_yaml_bot_token" not in gateway_config_source
        or "Arinova bot_token YAML alias was not loaded" not in gateway_config_source
        or "TemporaryDirectory(prefix=\"hermes-arinova-config-home-channel-\")" not in gateway_config_source
        or "home_channel:" not in gateway_config_source
        or "conv-home-channel" not in gateway_config_source
        or "Home Channel Alias" not in gateway_config_source
        or "Arinova home_channel YAML alias was not preserved in extra" not in gateway_config_source
        or "from adapter import ArinovaAdapter" not in gateway_config_source
        or "from gateway.run import GatewayRunner" not in gateway_config_source
        or "runner = GatewayRunner.__new__(GatewayRunner)" not in gateway_config_source
        or 'runner._create_adapter(Platform("arinova"), runner_arinova)' not in gateway_config_source
        or "GatewayRunner._create_adapter did not create ArinovaAdapter" not in gateway_config_source
        or "GatewayRunner._create_adapter did not preserve Arinova PlatformConfig object" not in gateway_config_source
        or "GatewayRunner._create_adapter did not hydrate Arinova credentials" not in gateway_config_source
        or "GatewayRunner._create_adapter did not preserve Arinova runtime config" not in gateway_config_source
        or '"ARINOVA_SIDECAR_AUTOSTART"' not in gateway_config_source
        or "sidecar_autostart: false" not in gateway_config_source
        or '"sidecar_autostart": False' not in gateway_config_source
        or "created_adapter.autostart_sidecar is not False" not in gateway_config_source
        or "autostart={created_adapter.autostart_sidecar}" not in gateway_config_source
        or "GatewayRunner._create_adapter did not inject group_sessions_per_user" not in gateway_config_source
        or "GatewayRunner._create_adapter did not inject thread_sessions_per_user" not in gateway_config_source
        or "created_adapter.set_message_handler(fake_message_handler)" not in gateway_config_source
        or "created_adapter.set_fatal_error_handler(fake_fatal_handler)" not in gateway_config_source
        or "created_adapter.set_session_store(fake_session_store)" not in gateway_config_source
        or "created_adapter.set_busy_session_handler(fake_busy_handler)" not in gateway_config_source
        or "GatewayRunner handler wiring did not attach to Arinova adapter" not in gateway_config_source
        or "async def fake_connect(*, is_reconnect: bool = False) -> bool:" not in gateway_config_source
        or "runner._connect_adapter_with_timeout(" not in gateway_config_source
        or "is_reconnect=True" not in gateway_config_source
        or "GatewayRunner._connect_adapter_with_timeout did not drive Arinova adapter connect" not in gateway_config_source
        or "def assert_gateway_runner_toolset_contract(hermes_root: Path) -> None:" not in gateway_config_source
        or 'source_path = hermes_root / "gateway" / "run.py"' not in gateway_config_source
        or "enabled_toolsets = sorted(_get_platform_tools(user_config, platform_key))" not in gateway_config_source
        or "enabled_toolsets=enabled_toolsets" not in gateway_config_source
        or "Gateway runner does not resolve platform enabled_toolsets through _get_platform_tools" not in gateway_config_source
        or "Gateway runner does not pass resolved enabled_toolsets into both AIAgent paths" not in gateway_config_source
        or "def assert_conversation_loop_tool_validation_contract(hermes_root: Path) -> None:" not in gateway_config_source
        or 'source_path = hermes_root / "agent" / "conversation_loop.py"' not in gateway_config_source
        or '"if tc.function.name not in agent.valid_tool_names:"' not in gateway_config_source
        or '"repaired = agent._repair_tool_call(tc.function.name)"' not in gateway_config_source
        or '"agent._execute_tool_calls(assistant_message, messages, effective_task_id, api_call_count)"' not in gateway_config_source
        or "Hermes conversation loop no longer validates model tool calls against" not in gateway_config_source
        or "assert_conversation_loop_tool_validation_contract(hermes_root)" not in gateway_config_source
        or "def assert_agent_init_toolset_contract(hermes_root: Path) -> None:" not in gateway_config_source
        or 'source_path = hermes_root / "agent" / "agent_init.py"' not in gateway_config_source
        or '"agent.tools = _ra().get_tool_definitions("' not in gateway_config_source
        or '"enabled_toolsets=enabled_toolsets"' not in gateway_config_source
        or '"disabled_toolsets=disabled_toolsets"' not in gateway_config_source
        or 'agent.valid_tool_names = {tool["function"]["name"] for tool in agent.tools}' not in gateway_config_source
        or "Hermes agent init no longer derives valid_tool_names from" not in gateway_config_source
        or "assert_agent_init_toolset_contract(hermes_root)" not in gateway_config_source
    )
    gateway_config_contract_count = 1
    gateway_config_runtime_option_contract_count = 1
    gateway_config_agent_skill_contract_count = 1
    gateway_config_alias_contract_count = 1
    gateway_runner_toolset_contract_count = 1
    live_gate_contract_missing = (
        "DEFAULT_SDK_ROOT" not in live_connection_source
        or '"--sdk-root"' not in live_connection_source
        or "def assert_bundled_sdk_matches_source(sdk_root: Path) -> str:" not in live_connection_source
        or "live smoke bundled @arinova-ai/agent-sdk version differs from selected agent-sdk source" not in live_connection_source
        or "live smoke bundled @arinova-ai/agent-sdk package metadata differs from selected agent-sdk source" not in live_connection_source
        or "live smoke bundled @arinova-ai/agent-sdk package files differ from selected agent-sdk source" not in live_connection_source
        or "sdk_version = assert_bundled_sdk_matches_source(sdk_root)" not in live_connection_source
        or "connected agent_id={agent_id} sdk={sdk_version}" not in live_connection_source
        or "--require-credentials" not in live_connection_source
        or "return 2" not in live_connection_source
        or "def config_credentials" not in live_connection_source
        or "def yaml_config_credentials" not in live_connection_source
        or "def config_platform_values" not in live_connection_source
        or "def ensure_hermes_import_path(hermes_root: Path) -> None" not in live_connection_source
        or "def resolve_credentials" not in live_connection_source
        or "load_hermes_config: bool = True" not in live_connection_source
        or "load_hermes_config=not args.resolve_credentials_only" not in live_connection_source
        or "ensure_hermes_import_path(hermes_root)\n    try:\n        from gateway.config import PlatformConfig" not in live_connection_source
        or "load_gateway_config()" not in live_connection_source
        or "yaml.safe_load" not in live_connection_source
        or "except Exception" not in live_connection_source
        or "def arinova_platform_config" not in live_connection_source
        or 'getattr(key, "value", None) == "arinova"' not in live_connection_source
        or 'getattr(key, "name", None) == "arinova"' not in live_connection_source
        or 'platform.token or extra.get("bot_token")' not in live_connection_source
        or "loaded.module.validate_config(platform_config)" not in live_connection_source
        or "resolved Arinova live smoke config did not pass plugin validate_config" not in live_connection_source
        or 'os.getenv("ARINOVA_CONCURRENCY_MODE", "per-conversation")' not in live_connection_source
        or '"concurrency_mode": "per-conversation"' not in live_connection_gate_source
        or "--resolve-credentials-only" not in live_connection_source
        or "live Arinova credentials resolved: " not in live_connection_source
        or "LOCAL_CHECK = ROOT / \"scripts/check_local.py\"" not in live_connection_gate_source
        or "def run_local(*args: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:" not in live_connection_gate_source
        or "expected local gate --require-credentials to fail fast with 2" not in live_connection_gate_source
        or "local gate --require-credentials did not surface missing credential message" not in live_connection_gate_source
        or "local gate --require-credentials did not preflight credentials before slower checks" not in live_connection_gate_source
        or "--require-credentials" not in live_connection_gate_source
        or "returncode != 2" not in live_connection_gate_source
        or "tempfile.TemporaryDirectory" not in live_connection_gate_source
        or '"HERMES_HOME"' not in live_connection_gate_source
        or "write_config" not in live_connection_gate_source
        or "write_token_alias_config" not in live_connection_gate_source
        or "write_fake_hermes_root" not in live_connection_gate_source
        or "missing-hermes-agent" not in live_connection_gate_source
        or "fake-hermes-agent" not in live_connection_gate_source
        or "wss://config.example" not in live_connection_gate_source
        or "ari_config" not in live_connection_gate_source
        or "wss://config-token-alias.example" not in live_connection_gate_source
        or "ari_config_token_alias" not in live_connection_gate_source
        or "server_url=config bot_token=config" not in live_connection_gate_source
        or "server_url=env bot_token=config" not in live_connection_gate_source
        or "server_url=config bot_token=env" not in live_connection_gate_source
        or "server_url=env bot_token=env" not in live_connection_gate_source
        or "blank_env_config" not in live_connection_gate_source
        or "blank_server_env_token" not in live_connection_gate_source
        or "env_server_blank_token" not in live_connection_gate_source
        or 'ARINOVA_SERVER_URL="   "' not in live_connection_gate_source
        or 'ARINOVA_BOT_TOKEN="  "' not in live_connection_gate_source
        or "ARINOVA_FAKE_CONFIG_PLATFORM_KEY" not in live_connection_gate_source
        or "typed platform-key config live smoke" not in live_connection_gate_source
        or "ari_loaded_config" not in live_connection_gate_source
        or "live-smoke-skill" not in live_connection_gate_source
        or "ARINOVA_FAKE_VALIDATE_CONFIG_MARKER" not in live_connection_gate_source
        or "ARINOVA_FAKE_VALIDATE_CONFIG_FALSE" not in live_connection_gate_source
        or "validated before fake adapter construction" not in live_connection_gate_source
        or "wss://env-typed.example" not in live_connection_gate_source
        or "ari_env_typed" not in live_connection_gate_source
        or "env-over-config server precedence" not in live_connection_gate_source
        or "env-over-config token precedence" not in live_connection_gate_source
        or "ARINOVA_CONCURRENCY_MODE=\"agent-wide\"" not in live_connection_gate_source
        or "typed platform-key env-concurrency live smoke" not in live_connection_gate_source
        or "typed platform-key config did not preserve env concurrency mode" not in live_connection_gate_source
        or "PYTHONPATH=\"/definitely/not/hermes\"" not in live_connection_gate_source
        or "agent-from-fake-hermes-root" not in live_connection_gate_source
        or "live Arinova sendMessage OK: conversation_id=conv-import-path" not in live_connection_gate_source
        or "live Arinova sendHud OK" not in live_connection_gate_source
        or "live Arinova sendTaskUpdate OK" not in live_connection_gate_source
        or "live Arinova reportToolCall OK" not in live_connection_gate_source
        or "live Arinova queryMemory OK: entries=0" not in live_connection_gate_source
        or "live Arinova fetchSkillPrompt OK: slug=memo" not in live_connection_gate_source
        or "live Arinova listBoards OK: boards=0" not in live_connection_gate_source
        or "live Arinova listCards OK: cards=0" not in live_connection_gate_source
        or "live Arinova listNotes OK: conversation_id=conv-notes notes=0" not in live_connection_gate_source
        or "live Arinova listColumns OK: board_id=board-live columns=0" not in live_connection_gate_source
        or "live Arinova listLabels OK: board_id=board-live labels=0" not in live_connection_gate_source
        or "live Arinova listArchivedCards OK: board_id=board-live cards=0" not in live_connection_gate_source
        or "live Arinova listCardCommits OK: card_id=card-live commits=0" not in live_connection_gate_source
        or "live Arinova listCardNotes OK: card_id=card-live notes=0" not in live_connection_gate_source
        or "live Arinova shareNote OK: conversation_id=conv-share note_id=note-share" not in live_connection_gate_source
        or "live Arinova createNote OK: conversation_id=conv-note note_id=note-live" not in live_connection_gate_source
        or "live Arinova updateNote OK: conversation_id=conv-note note_id=note-live" not in live_connection_gate_source
        or "live Arinova deleteNote OK: conversation_id=conv-note note_id=note-live" not in live_connection_gate_source
        or "live Arinova createBoard OK: board_id=board-live" not in live_connection_gate_source
        or "live Arinova updateBoard OK: board_id=board-live" not in live_connection_gate_source
        or "live Arinova archiveBoard OK: board_id=board-live" not in live_connection_gate_source
        or "live Arinova createCard OK: card_id=card-live" not in live_connection_gate_source
        or "live Arinova updateCard OK: card_id=card-live" not in live_connection_gate_source
        or "live Arinova completeCard OK: card_id=card-live" not in live_connection_gate_source
        or "live Arinova createColumn OK: column_id=column-live" not in live_connection_gate_source
        or "live Arinova updateColumn OK: column_id=column-live" not in live_connection_gate_source
        or "live Arinova deleteColumn OK: column_id=column-live" not in live_connection_gate_source
        or "live Arinova reorderColumns OK: board_id=board-live" not in live_connection_gate_source
        or "live Arinova addCardCommit OK: card_id=card-live" not in live_connection_gate_source
        or "live Arinova linkCardNote OK: card_id=card-live note_id=note-live" not in live_connection_gate_source
        or "live Arinova unlinkCardNote OK: card_id=card-live note_id=note-live" not in live_connection_gate_source
        or "live Arinova createLabel OK: label_id=label-live" not in live_connection_gate_source
        or "live Arinova updateLabel OK: label_id=label-live" not in live_connection_gate_source
        or "live Arinova deleteLabel OK: label_id=label-live" not in live_connection_gate_source
        or "live Arinova addCardLabel OK: card_id=card-live label_id=label-live" not in live_connection_gate_source
        or "live Arinova removeCardLabel OK: card_id=card-live label_id=label-live" not in live_connection_gate_source
        or "live Arinova fetchHistory OK: conversation_id=conv-history messages=0" not in live_connection_gate_source
        or "live Arinova uploadFile OK: conversation_id=conv-upload fileName=live-gate.txt" not in live_connection_gate_source
        or "live Arinova callAction OK: action=live.smoke status=success" not in live_connection_gate_source
        or "ARINOVA_FAKE_SDK_CALLS_MARKER" not in live_connection_gate_source
        or "def assert_sdk_call" not in live_connection_gate_source
        or "custom live gate probe" not in live_connection_gate_source
        or '"args": ["conv-import-path", "custom live gate probe"]' not in live_connection_gate_source
        or '"method": "sendHud"' not in live_connection_gate_source
        or '"status": "live-smoke"' not in live_connection_gate_source
        or '"args": [{"progress": 1, "status": "live-smoke"}, "conv-hud"]' not in live_connection_gate_source
        or '"method": "sendTaskUpdate"' not in live_connection_gate_source
        or '"task": "live smoke"' not in live_connection_gate_source
        or '"method": "reportToolCall"' not in live_connection_gate_source
        or '"toolName": "live_smoke"' not in live_connection_gate_source
        or '"method": "queryMemory"' not in live_connection_gate_source
        or '"query": "live smoke"' not in live_connection_gate_source
        or '"method": "fetchSkillPrompt"' not in live_connection_gate_source
        or '"args": ["memo"]' not in live_connection_gate_source
        or '"method": "listBoards"' not in live_connection_gate_source
        or '"method": "listCards"' not in live_connection_gate_source
        or '"search": "live smoke"' not in live_connection_gate_source
        or '"method": "listNotes"' not in live_connection_gate_source
        or '"args": ["conv-notes", {"archived": False, "limit": 1, "tags": ["live"]}]' not in live_connection_gate_source
        or '"method": "listColumns"' not in live_connection_gate_source
        or '"args": ["board-live"]' not in live_connection_gate_source
        or '"method": "listLabels"' not in live_connection_gate_source
        or '"method": "listArchivedCards"' not in live_connection_gate_source
        or '"args": ["board-live", {"limit": 1, "page": 1}]' not in live_connection_gate_source
        or '"method": "listCardCommits"' not in live_connection_gate_source
        or '"args": ["card-live"]' not in live_connection_gate_source
        or '"method": "listCardNotes"' not in live_connection_gate_source
        or '"method": "shareNote"' not in live_connection_gate_source
        or '"args": ["conv-share", "note-share"]' not in live_connection_gate_source
        or '"method": "createNote"' not in live_connection_gate_source
        or '"Live smoke note"' not in live_connection_gate_source
        or '"notebookId":"book-live"' not in live_connection_gate_source
        or '"notebookId": "book-live"' not in live_connection_gate_source
        or "createNote notebookId live smoke" not in live_connection_gate_source
        or '"method": "updateNote"' not in live_connection_gate_source
        or '"Updated live smoke note"' not in live_connection_gate_source
        or '"method": "deleteNote"' not in live_connection_gate_source
        or '"args": ["conv-note", "note-live"]' not in live_connection_gate_source
        or '"method": "createBoard"' not in live_connection_gate_source
        or '"Live smoke board"' not in live_connection_gate_source
        or '"method": "updateBoard"' not in live_connection_gate_source
        or '"Updated live smoke board"' not in live_connection_gate_source
        or '"method": "archiveBoard"' not in live_connection_gate_source
        or '"method": "createCard"' not in live_connection_gate_source
        or '"Live smoke card"' not in live_connection_gate_source
        or '"method": "updateCard"' not in live_connection_gate_source
        or '"Updated live smoke card"' not in live_connection_gate_source
        or '"method": "completeCard"' not in live_connection_gate_source
        or '"method": "createColumn"' not in live_connection_gate_source
        or '"Live smoke column"' not in live_connection_gate_source
        or '"method": "updateColumn"' not in live_connection_gate_source
        or '"Updated live smoke column"' not in live_connection_gate_source
        or '"method": "deleteColumn"' not in live_connection_gate_source
        or '"method": "reorderColumns"' not in live_connection_gate_source
        or '"args": ["board-live", ["column-live", "done-column"]]' not in live_connection_gate_source
        or '"method": "addCardCommit"' not in live_connection_gate_source
        or '"Live smoke commit"' not in live_connection_gate_source
        or '"method": "linkCardNote"' not in live_connection_gate_source
        or '"method": "unlinkCardNote"' not in live_connection_gate_source
        or '"method": "createLabel"' not in live_connection_gate_source
        or '"Live smoke label"' not in live_connection_gate_source
        or '"method": "updateLabel"' not in live_connection_gate_source
        or '"Updated live smoke label"' not in live_connection_gate_source
        or '"method": "deleteLabel"' not in live_connection_gate_source
        or '"method": "addCardLabel"' not in live_connection_gate_source
        or '"method": "removeCardLabel"' not in live_connection_gate_source
        or '"args": [\n                "conv-history",' not in live_connection_gate_source
        or '"before": "msg-before"' not in live_connection_gate_source
        or '"after": "msg-after"' not in live_connection_gate_source
        or '"around": "msg-around"' not in live_connection_gate_source
        or '"args": [\n                "conv-upload",' not in live_connection_gate_source
        or '"SGVybWVzIEFyaW5vdmEgbGl2ZSBzbW9rZSB1cGxvYWQK"' not in live_connection_gate_source
        or '"method": "callAction"' not in live_connection_gate_source
        or '"live.smoke"' not in live_connection_gate_source
        or '"hermes-arinova-live-smoke-action"' not in live_connection_gate_source
        or '"custom.live.telemetry"' not in live_connection_gate_source
        or '"phase": "live-gate"' not in live_connection_gate_source
        or "--skip-telemetry live smoke still called sendTelemetry" not in live_connection_gate_source
        or "SDK sendTelemetry() probe cannot use custom event when telemetry is skipped" not in live_connection_gate_source
        or "bad skip telemetry event live smoke" not in live_connection_gate_source
        or "SDK sendTelemetry() probe cannot use custom data when telemetry is skipped" not in live_connection_gate_source
        or "bad skip telemetry data live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_TELEMETRY" not in live_connection_gate_source
        or "fake telemetry rejected" not in live_connection_gate_source
        or "telemetry failure live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_SEND_MESSAGE" not in live_connection_gate_source
        or "fake sendMessage rejected" not in live_connection_gate_source
        or "sendMessage failure live smoke" not in live_connection_gate_source
        or "SDK sendMessage() probe requires conversation id when message content is provided" not in live_connection_gate_source
        or "bad sendMessage content without conversation live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_NON_NULL_VOID_METHOD" not in live_connection_gate_source
        or "SDK sendHud() returned non-null void result" not in live_connection_gate_source
        or "non-null void result live smoke" not in live_connection_gate_source
        or "SDK sendTelemetry() returned non-null void result" not in live_connection_gate_source
        or "non-null void sendTelemetry live smoke" not in live_connection_gate_source
        or "SDK sendTaskUpdate() returned non-null void result" not in live_connection_gate_source
        or "non-null void sendTaskUpdate live smoke" not in live_connection_gate_source
        or "SDK reportToolCall() returned non-null void result" not in live_connection_gate_source
        or "non-null void reportToolCall live smoke" not in live_connection_gate_source
        or "--skip-telemetry" not in live_connection_gate_source
        or "ARINOVA_FAKE_DISCONNECT_MARKER" not in live_connection_gate_source
        or "def assert_disconnected" not in live_connection_gate_source
        or "did not disconnect fake Arinova adapter" not in live_connection_gate_source
        or "env credential live smoke" not in live_connection_gate_source
        or "bad onboarding seed live smoke" not in live_connection_gate_source
        or "def assert_failed" not in live_connection_gate_source
        or "ARINOVA_FAKE_CONNECT_FALSE" not in live_connection_gate_source
        or "fake connect returned false" not in live_connection_gate_source
        or "ARINOVA_FAKE_CONNECT_WITHOUT_CONNECTED_STATE" not in live_connection_gate_source
        or "connected false state live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_CLAIMED_AGENT_MISMATCH" not in live_connection_gate_source
        or "SDK getAgentId() disagreed with token-claimed agent id" not in live_connection_gate_source
        or "ARINOVA_FAKE_HEALTH_AGENT_MISMATCH" not in live_connection_gate_source
        or "sidecar health agent id disagreed with SDK getAgentId()" not in live_connection_gate_source
        or "health agent mismatch live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_HEALTH_OK" not in live_connection_gate_source
        or "sidecar health did not report healthy control state" not in live_connection_gate_source
        or "bad health ok live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_HEALTH" not in live_connection_gate_source
        or "sidecar health did not report authenticated SDK state" not in live_connection_gate_source
        or "ARINOVA_FAKE_EMPTY_AGENT_ID" not in live_connection_gate_source
        or "SDK getAgentId() did not return an authenticated agent id" not in live_connection_gate_source
        or "ARINOVA_FAKE_UNEXPECTED_ONBOARDING_SEED" not in live_connection_gate_source
        or "SDK getOnboardingSeed() returned unexpected value" not in live_connection_gate_source
        or "unexpected onboarding seed live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_ONBOARDING_SEED" not in live_connection_gate_source
        or "SDK getOnboardingSeed() returned malformed seed" not in live_connection_gate_source
        or "SDK sendHud() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad sendHud JSON live smoke" not in live_connection_gate_source
        or "SDK sendHud() probe payload must be a JSON object" not in live_connection_gate_source
        or "bad sendHud payload live smoke" not in live_connection_gate_source
        or "SDK sendHud() probe requires HUD JSON when conversation id is provided" not in live_connection_gate_source
        or "bad sendHud conversation without payload live smoke" not in live_connection_gate_source
        or "SDK sendTaskUpdate() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad sendTaskUpdate JSON live smoke" not in live_connection_gate_source
        or "SDK sendTaskUpdate() probe payload must be a JSON object" not in live_connection_gate_source
        or "bad sendTaskUpdate payload live smoke" not in live_connection_gate_source
        or '{"status":"completed","durationMs":12,"costUsd":0.02,"numTurns":3}' not in live_connection_gate_source
        or "completed sendTaskUpdate live smoke" not in live_connection_gate_source
        or '"args": [\n                    "Hermes",\n                    {"status": "completed", "durationMs": 12, "costUsd": 0.02, "numTurns": 3}' not in live_connection_gate_source
        or "SDK sendTaskUpdate() probe payload must match TaskUpdateData" not in live_connection_gate_source
        or "bad sendTaskUpdate started live smoke" not in live_connection_gate_source
        or '{"status":"started","task":"boot","durationMs":1}' not in live_connection_gate_source
        or "bad sendTaskUpdate unknown field live smoke" not in live_connection_gate_source
        or "SDK reportToolCall() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad reportToolCall JSON live smoke" not in live_connection_gate_source
        or "SDK reportToolCall() probe payload must be a JSON object" not in live_connection_gate_source
        or "bad reportToolCall payload live smoke" not in live_connection_gate_source
        or '"toolName":"arinova_sdk_call","input":{"method":"queryMemory"},' not in live_connection_gate_source
        or '"durationMs":7,"success":false,"error":"tool failed","messageId":"msg-2"}' not in live_connection_gate_source
        or "failure reportToolCall live smoke" not in live_connection_gate_source
        or '"success": False' not in live_connection_gate_source
        or "SDK reportToolCall() probe payload must match ToolCallReport" not in live_connection_gate_source
        or "bad reportToolCall shape live smoke" not in live_connection_gate_source
        or '"toolName":"bash","input":{},"success":true,"unknown":true}' not in live_connection_gate_source
        or "bad reportToolCall unknown field live smoke" not in live_connection_gate_source
        or "SDK queryMemory() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad queryMemory JSON live smoke" not in live_connection_gate_source
        or "SDK queryMemory() probe payload must be a JSON object" not in live_connection_gate_source
        or "bad queryMemory payload live smoke" not in live_connection_gate_source
        or "SDK queryMemory() probe payload must match QueryMemoryOptions" not in live_connection_gate_source
        or "bad queryMemory shape live smoke" not in live_connection_gate_source
        or "bad queryMemory unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_QUERY_MEMORY_ENTRY" not in live_connection_gate_source
        or "SDK queryMemory() returned malformed memory result" not in live_connection_gate_source
        or "bad queryMemory result live smoke" not in live_connection_gate_source
        or "bad queryMemory entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_QUERY_MEMORY_SCORE" not in live_connection_gate_source
        or "bad queryMemory score live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_QUERY_MEMORY_ORIGIN" not in live_connection_gate_source
        or "bad queryMemory origin live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_QUERY_MEMORY_SHARED_ORIGIN" not in live_connection_gate_source
        or "bad queryMemory shared origin live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_QUERY_MEMORY_NULL_ORIGIN" not in live_connection_gate_source
        or "bad queryMemory null origin live smoke" not in live_connection_gate_source
        or "SDK fetchSkillPrompt() returned malformed prompt" not in live_connection_gate_source
        or "bad fetchSkillPrompt live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_SKILL_PROMPT_PARAMETERS" not in live_connection_gate_source
        or "bad fetchSkillPrompt parameters live smoke" not in live_connection_gate_source
        or "SDK listBoards() returned malformed boards result" not in live_connection_gate_source
        or "bad listBoards live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_BOARDS_ENTRY" not in live_connection_gate_source
        or "bad listBoards entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_BOARDS_MISSING_FIELD" not in live_connection_gate_source
        or "bad listBoards missing field live smoke" not in live_connection_gate_source
        or "SDK listCards() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad listCards JSON live smoke" not in live_connection_gate_source
        or "SDK listCards() probe options must be a JSON object" not in live_connection_gate_source
        or "bad listCards payload live smoke" not in live_connection_gate_source
        or "SDK listCards() probe options must match SDK listCards options" not in live_connection_gate_source
        or "bad listCards options shape live smoke" not in live_connection_gate_source
        or "bad listCards options unknown field live smoke" not in live_connection_gate_source
        or "SDK listCards() returned malformed cards result" not in live_connection_gate_source
        or "bad listCards live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_CARDS_ENTRY" not in live_connection_gate_source
        or "bad listCards entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_CARDS_MISSING_NULLABLE" not in live_connection_gate_source
        or "bad listCards nullable live smoke" not in live_connection_gate_source
        or '"offset":4' not in live_connection_gate_source
        or '"offset smoke"' not in live_connection_gate_source
        or "listCards offset live smoke" not in live_connection_gate_source
        or "SDK listNotes() probe requires conversation id when notes options JSON is provided" not in live_connection_gate_source
        or "bad listNotes options without conversation live smoke" not in live_connection_gate_source
        or "SDK listNotes() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad listNotes JSON live smoke" not in live_connection_gate_source
        or "SDK listNotes() probe options must be a JSON object" not in live_connection_gate_source
        or "bad listNotes payload live smoke" not in live_connection_gate_source
        or "SDK listNotes() probe options must match ListNotesOptions" not in live_connection_gate_source
        or "bad listNotes options shape live smoke" not in live_connection_gate_source
        or "bad listNotes options tags live smoke" not in live_connection_gate_source
        or "bad listNotes options unknown field live smoke" not in live_connection_gate_source
        or "SDK listNotes() returned malformed notes result" not in live_connection_gate_source
        or "bad listNotes live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_NOTES_METADATA" not in live_connection_gate_source
        or "bad listNotes metadata live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_NOTES_NULL_CURSOR" not in live_connection_gate_source
        or "bad listNotes null cursor live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_NOTES_ENTRY" not in live_connection_gate_source
        or "bad listNotes entry live smoke" not in live_connection_gate_source
        or '"before":"note-before"' not in live_connection_gate_source
        or '"offset":3' not in live_connection_gate_source
        or "listNotes pagination live smoke" not in live_connection_gate_source
        or "SDK listColumns() returned malformed columns result" not in live_connection_gate_source
        or "bad listColumns live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_COLUMNS_ENTRY" not in live_connection_gate_source
        or "bad listColumns entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_COLUMNS_MISSING_FIELD" not in live_connection_gate_source
        or "bad listColumns missing field live smoke" not in live_connection_gate_source
        or "SDK listLabels() returned malformed labels result" not in live_connection_gate_source
        or "bad listLabels live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_LABELS_ENTRY" not in live_connection_gate_source
        or "bad listLabels entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_LABELS_MISSING_FIELD" not in live_connection_gate_source
        or "bad listLabels missing field live smoke" not in live_connection_gate_source
        or "SDK listArchivedCards() probe requires board id when archived cards options JSON is provided" not in live_connection_gate_source
        or "bad listArchivedCards options without board live smoke" not in live_connection_gate_source
        or "SDK listArchivedCards() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad listArchivedCards JSON live smoke" not in live_connection_gate_source
        or "SDK listArchivedCards() probe options must be a JSON object" not in live_connection_gate_source
        or "bad listArchivedCards payload live smoke" not in live_connection_gate_source
        or "SDK listArchivedCards() probe options must match SDK listArchivedCards options" not in live_connection_gate_source
        or "bad listArchivedCards options shape live smoke" not in live_connection_gate_source
        or "bad listArchivedCards options unknown field live smoke" not in live_connection_gate_source
        or "SDK listArchivedCards() returned malformed archived cards result" not in live_connection_gate_source
        or "bad listArchivedCards live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS_METADATA" not in live_connection_gate_source
        or '"page": True' not in live_connection_gate_source
        or "bad listArchivedCards metadata live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS_ENTRY" not in live_connection_gate_source
        or "bad listArchivedCards entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_ARCHIVED_CARDS_MISSING_NULLABLE" not in live_connection_gate_source
        or "bad listArchivedCards nullable live smoke" not in live_connection_gate_source
        or "SDK listCardCommits() returned malformed commits result" not in live_connection_gate_source
        or "bad listCardCommits live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_CARD_COMMITS_ENTRY" not in live_connection_gate_source
        or "bad listCardCommits entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_CARD_COMMITS_MISSING_FIELD" not in live_connection_gate_source
        or "bad listCardCommits missing field live smoke" not in live_connection_gate_source
        or "SDK listCardNotes() returned malformed card notes result" not in live_connection_gate_source
        or "bad listCardNotes live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_CARD_NOTES_ENTRY" not in live_connection_gate_source
        or "bad listCardNotes entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_LIST_CARD_NOTES_TAGS" not in live_connection_gate_source
        or "bad listCardNotes tags live smoke" not in live_connection_gate_source
        or "SDK shareNote() probe requires both conversation id and note id" not in live_connection_gate_source
        or "bad shareNote partial live smoke" not in live_connection_gate_source
        or "SDK shareNote() returned malformed share result" not in live_connection_gate_source
        or "bad shareNote live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_SHARE_NOTE_MISSING_TAGS" not in live_connection_gate_source
        or "bad shareNote missing tags live smoke" not in live_connection_gate_source
        or "bad shareNote tags live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_SHARE_NOTE_NULL_TAGS" not in live_connection_gate_source
        or "bad shareNote null tags live smoke" not in live_connection_gate_source
        or "SDK createNote() probe requires both conversation id and note body JSON" not in live_connection_gate_source
        or "bad createNote partial live smoke" not in live_connection_gate_source
        or "SDK createNote() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad createNote JSON live smoke" not in live_connection_gate_source
        or "SDK createNote() probe body must be a JSON object" not in live_connection_gate_source
        or "bad createNote payload live smoke" not in live_connection_gate_source
        or "SDK createNote() probe body must match CreateNoteBody" not in live_connection_gate_source
        or "bad createNote body shape live smoke" not in live_connection_gate_source
        or "bad createNote body tags live smoke" not in live_connection_gate_source
        or "bad createNote body unknown field live smoke" not in live_connection_gate_source
        or "SDK createNote() returned malformed note result" not in live_connection_gate_source
        or "bad createNote live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_NOTE_ENTRY" not in live_connection_gate_source
        or "bad createNote entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_NOTE_NULL_OPTIONAL" not in live_connection_gate_source
        or "bad createNote null optional live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_NOTE_NULL_TAGS" not in live_connection_gate_source
        or "bad createNote null tags live smoke" not in live_connection_gate_source
        or "SDK updateNote() probe requires conversation id, note id, and note body JSON" not in live_connection_gate_source
        or "bad updateNote partial live smoke" not in live_connection_gate_source
        or "SDK updateNote() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad updateNote JSON live smoke" not in live_connection_gate_source
        or "SDK updateNote() probe body must be a JSON object" not in live_connection_gate_source
        or "bad updateNote payload live smoke" not in live_connection_gate_source
        or "SDK updateNote() probe body must match UpdateNoteBody" not in live_connection_gate_source
        or "bad updateNote body tags live smoke" not in live_connection_gate_source
        or "bad updateNote body unknown field live smoke" not in live_connection_gate_source
        or "SDK updateNote() returned malformed note result" not in live_connection_gate_source
        or "bad updateNote live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_NOTE_ENTRY" not in live_connection_gate_source
        or "bad updateNote entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_NOTE_NULL_TAGS" not in live_connection_gate_source
        or "bad updateNote null tags live smoke" not in live_connection_gate_source
        or "SDK deleteNote() probe requires both conversation id and note id" not in live_connection_gate_source
        or "bad deleteNote partial live smoke" not in live_connection_gate_source
        or "fake deleteNote rejected" not in live_connection_gate_source
        or "deleteNote failure live smoke" not in live_connection_gate_source
        or "SDK createBoard() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad createBoard JSON live smoke" not in live_connection_gate_source
        or "SDK createBoard() probe body must be a JSON object" not in live_connection_gate_source
        or "bad createBoard payload live smoke" not in live_connection_gate_source
        or "SDK createBoard() probe body must match CreateBoardBody" not in live_connection_gate_source
        or "bad createBoard body shape live smoke" not in live_connection_gate_source
        or "bad createBoard body columns live smoke" not in live_connection_gate_source
        or "bad createBoard body unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_BOARD" not in live_connection_gate_source
        or "SDK createBoard() returned malformed board result" not in live_connection_gate_source
        or "bad createBoard live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_BOARD_CREATED_AT" not in live_connection_gate_source
        or "bad createBoard createdAt live smoke" not in live_connection_gate_source
        or '"No columns live smoke board"' not in live_connection_gate_source
        or "createBoard no-columns live smoke" not in live_connection_gate_source
        or "SDK updateBoard() probe requires both board id and board body JSON" not in live_connection_gate_source
        or "bad updateBoard partial live smoke" not in live_connection_gate_source
        or "SDK updateBoard() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad updateBoard JSON live smoke" not in live_connection_gate_source
        or "SDK updateBoard() probe body must be a JSON object" not in live_connection_gate_source
        or "bad updateBoard payload live smoke" not in live_connection_gate_source
        or "SDK updateBoard() probe body must match UpdateBoardBody" not in live_connection_gate_source
        or "bad updateBoard body shape live smoke" not in live_connection_gate_source
        or "bad updateBoard body name live smoke" not in live_connection_gate_source
        or "bad updateBoard body unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_BOARD" not in live_connection_gate_source
        or "SDK updateBoard() returned malformed board result" not in live_connection_gate_source
        or "bad updateBoard live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_BOARD_CREATED_AT" not in live_connection_gate_source
        or "bad updateBoard createdAt live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_ARCHIVE_BOARD" not in live_connection_gate_source
        or "fake archiveBoard rejected" not in live_connection_gate_source
        or "archiveBoard failure live smoke" not in live_connection_gate_source
        or "SDK createCard() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad createCard JSON live smoke" not in live_connection_gate_source
        or "SDK createCard() probe body must be a JSON object" not in live_connection_gate_source
        or "bad createCard payload live smoke" not in live_connection_gate_source
        or "SDK createCard() probe body must match CreateCardBody" not in live_connection_gate_source
        or "bad createCard body shape live smoke" not in live_connection_gate_source
        or "bad createCard body description live smoke" not in live_connection_gate_source
        or "bad createCard body unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_CARD" not in live_connection_gate_source
        or "SDK createCard() returned malformed card result" not in live_connection_gate_source
        or "bad createCard live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_CARD_MISSING_NULLABLE" not in live_connection_gate_source
        or "bad createCard nullable live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_CARD_NULL_COLUMN_NAME" not in live_connection_gate_source
        or "bad createCard columnName live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_CARD_ARCHIVED_AT" not in live_connection_gate_source
        or "bad createCard archivedAt live smoke" not in live_connection_gate_source
        or '"columnId":"column-live"' not in live_connection_gate_source
        or '"Column id live smoke card"' not in live_connection_gate_source
        or "createCard columnId live smoke" not in live_connection_gate_source
        or "SDK updateCard() probe requires both card id and card body JSON" not in live_connection_gate_source
        or "bad updateCard partial live smoke" not in live_connection_gate_source
        or "SDK updateCard() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad updateCard JSON live smoke" not in live_connection_gate_source
        or "SDK updateCard() probe body must be a JSON object" not in live_connection_gate_source
        or "bad updateCard payload live smoke" not in live_connection_gate_source
        or "SDK updateCard() probe body must match UpdateCardBody" not in live_connection_gate_source
        or "bad updateCard body title live smoke" not in live_connection_gate_source
        or "bad updateCard body sortOrder live smoke" not in live_connection_gate_source
        or "bad updateCard body unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_CARD" not in live_connection_gate_source
        or "SDK updateCard() returned malformed card result" not in live_connection_gate_source
        or "bad updateCard live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_CARD_MISSING_NULLABLE" not in live_connection_gate_source
        or "bad updateCard nullable live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_COMPLETE_CARD" not in live_connection_gate_source
        or "SDK completeCard() returned malformed card result" not in live_connection_gate_source
        or "bad completeCard live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_COMPLETE_CARD_SORT_ORDER" not in live_connection_gate_source
        or "bad completeCard sortOrder live smoke" not in live_connection_gate_source
        or "SDK createColumn() probe requires both board id and column body JSON" not in live_connection_gate_source
        or "bad createColumn partial live smoke" not in live_connection_gate_source
        or "SDK createColumn() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad createColumn JSON live smoke" not in live_connection_gate_source
        or "SDK createColumn() probe body must be a JSON object" not in live_connection_gate_source
        or "bad createColumn payload live smoke" not in live_connection_gate_source
        or "SDK createColumn() probe body must match CreateColumnBody" not in live_connection_gate_source
        or "bad createColumn body shape live smoke" not in live_connection_gate_source
        or "bad createColumn body sortOrder live smoke" not in live_connection_gate_source
        or "bad createColumn body unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_COLUMN" not in live_connection_gate_source
        or "SDK createColumn() returned malformed column result" not in live_connection_gate_source
        or "bad createColumn live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_COLUMN_SORT_ORDER" not in live_connection_gate_source
        or "bad createColumn result sortOrder live smoke" not in live_connection_gate_source
        or "SDK updateColumn() probe requires both column id and column body JSON" not in live_connection_gate_source
        or "bad updateColumn partial live smoke" not in live_connection_gate_source
        or "SDK updateColumn() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad updateColumn JSON live smoke" not in live_connection_gate_source
        or "SDK updateColumn() probe body must be a JSON object" not in live_connection_gate_source
        or "bad updateColumn payload live smoke" not in live_connection_gate_source
        or "SDK updateColumn() probe body must match UpdateColumnBody" not in live_connection_gate_source
        or "bad updateColumn body name live smoke" not in live_connection_gate_source
        or "bad updateColumn body sortOrder live smoke" not in live_connection_gate_source
        or "bad updateColumn body unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_COLUMN" not in live_connection_gate_source
        or "SDK updateColumn() returned malformed column result" not in live_connection_gate_source
        or "bad updateColumn live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_COLUMN_SORT_ORDER" not in live_connection_gate_source
        or "bad updateColumn result sortOrder live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_DELETE_COLUMN" not in live_connection_gate_source
        or "fake deleteColumn rejected" not in live_connection_gate_source
        or "deleteColumn failure live smoke" not in live_connection_gate_source
        or "SDK reorderColumns() probe requires both board id and column ids JSON" not in live_connection_gate_source
        or "bad reorderColumns partial live smoke" not in live_connection_gate_source
        or "SDK reorderColumns() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad reorderColumns JSON live smoke" not in live_connection_gate_source
        or "SDK reorderColumns() probe column ids must be a JSON string array" not in live_connection_gate_source
        or "bad reorderColumns payload live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_REORDER_COLUMNS" not in live_connection_gate_source
        or "fake reorderColumns rejected" not in live_connection_gate_source
        or "reorderColumns failure live smoke" not in live_connection_gate_source
        or "SDK addCardCommit() probe requires both card id and commit body JSON" not in live_connection_gate_source
        or "bad addCardCommit partial live smoke" not in live_connection_gate_source
        or "SDK addCardCommit() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad addCardCommit JSON live smoke" not in live_connection_gate_source
        or "SDK addCardCommit() probe body must be a JSON object" not in live_connection_gate_source
        or "bad addCardCommit payload live smoke" not in live_connection_gate_source
        or "SDK addCardCommit() probe body must match AddCommitBody" not in live_connection_gate_source
        or "bad addCardCommit body shape live smoke" not in live_connection_gate_source
        or "bad addCardCommit body message live smoke" not in live_connection_gate_source
        or "bad addCardCommit body unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_ADD_CARD_COMMIT" not in live_connection_gate_source
        or "SDK addCardCommit() returned malformed commit result" not in live_connection_gate_source
        or "bad addCardCommit live smoke" not in live_connection_gate_source
        or '"commitHash":"def456"' not in live_connection_gate_source
        or "addCardCommit no-message live smoke" not in live_connection_gate_source
        or "SDK linkCardNote() probe requires both card id and note id" not in live_connection_gate_source
        or "bad linkCardNote partial live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_LINK_CARD_NOTE" not in live_connection_gate_source
        or "fake linkCardNote rejected" not in live_connection_gate_source
        or "linkCardNote failure live smoke" not in live_connection_gate_source
        or "SDK unlinkCardNote() probe requires both card id and note id" not in live_connection_gate_source
        or "bad unlinkCardNote partial live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_UNLINK_CARD_NOTE" not in live_connection_gate_source
        or "fake unlinkCardNote rejected" not in live_connection_gate_source
        or "unlinkCardNote failure live smoke" not in live_connection_gate_source
        or "SDK createLabel() probe requires both board id and label body JSON" not in live_connection_gate_source
        or "bad createLabel partial live smoke" not in live_connection_gate_source
        or "SDK createLabel() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad createLabel JSON live smoke" not in live_connection_gate_source
        or "SDK createLabel() probe body must be a JSON object" not in live_connection_gate_source
        or "bad createLabel payload live smoke" not in live_connection_gate_source
        or "SDK createLabel() probe body must match CreateLabelBody" not in live_connection_gate_source
        or "bad createLabel body shape live smoke" not in live_connection_gate_source
        or "bad createLabel body color live smoke" not in live_connection_gate_source
        or "bad createLabel body unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_LABEL" not in live_connection_gate_source
        or "SDK createLabel() returned malformed label result" not in live_connection_gate_source
        or "bad createLabel live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CREATE_LABEL_MISSING_NULLABLE" not in live_connection_gate_source
        or "bad createLabel nullable live smoke" not in live_connection_gate_source
        or '"No color live smoke label"' not in live_connection_gate_source
        or "createLabel no-color live smoke" not in live_connection_gate_source
        or "SDK updateLabel() probe requires both label id and label body JSON" not in live_connection_gate_source
        or "bad updateLabel partial live smoke" not in live_connection_gate_source
        or "SDK updateLabel() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad updateLabel JSON live smoke" not in live_connection_gate_source
        or "SDK updateLabel() probe body must be a JSON object" not in live_connection_gate_source
        or "bad updateLabel payload live smoke" not in live_connection_gate_source
        or "SDK updateLabel() probe body must match UpdateLabelBody" not in live_connection_gate_source
        or "bad updateLabel body name live smoke" not in live_connection_gate_source
        or "bad updateLabel body color live smoke" not in live_connection_gate_source
        or "bad updateLabel body unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_LABEL" not in live_connection_gate_source
        or "SDK updateLabel() returned malformed label result" not in live_connection_gate_source
        or "bad updateLabel live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPDATE_LABEL_MISSING_NULLABLE" not in live_connection_gate_source
        or "bad updateLabel nullable live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_DELETE_LABEL" not in live_connection_gate_source
        or "fake deleteLabel rejected" not in live_connection_gate_source
        or "deleteLabel failure live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_ADD_CARD_LABEL" not in live_connection_gate_source
        or "fake addCardLabel rejected" not in live_connection_gate_source
        or "addCardLabel failure live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_REMOVE_CARD_LABEL" not in live_connection_gate_source
        or "fake removeCardLabel rejected" not in live_connection_gate_source
        or "removeCardLabel failure live smoke" not in live_connection_gate_source
        or "SDK addCardLabel() probe requires both card id and label id" not in live_connection_gate_source
        or "bad addCardLabel partial live smoke" not in live_connection_gate_source
        or "SDK removeCardLabel() probe requires both card id and label id" not in live_connection_gate_source
        or "bad removeCardLabel partial live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_FETCH_HISTORY" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_FETCH_HISTORY_METADATA" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_FETCH_HISTORY_NULL_CURSOR" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_FETCH_HISTORY_ENTRY" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_FETCH_HISTORY_NULL_OPTIONAL" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_FETCH_HISTORY_NULL_ATTACHMENTS" not in live_connection_gate_source
        or "SDK fetchHistory() probe options JSON argument could not be parsed" not in live_connection_gate_source
        or "bad fetchHistory options JSON live smoke" not in live_connection_gate_source
        or "SDK fetchHistory() probe options must be a JSON object" not in live_connection_gate_source
        or "bad fetchHistory options payload live smoke" not in live_connection_gate_source
        or "SDK fetchHistory() probe options must match FetchHistoryOptions" not in live_connection_gate_source
        or "bad fetchHistory options cursor live smoke" not in live_connection_gate_source
        or "bad fetchHistory options limit live smoke" not in live_connection_gate_source
        or "bad fetchHistory options unknown field live smoke" not in live_connection_gate_source
        or "SDK fetchHistory() probe requires conversation id when history limit is provided" not in live_connection_gate_source
        or "bad fetchHistory limit without conversation live smoke" not in live_connection_gate_source
        or "SDK fetchHistory() probe requires conversation id when history options JSON is provided" not in live_connection_gate_source
        or "bad fetchHistory options without conversation live smoke" not in live_connection_gate_source
        or '"before": "msg-before"' not in live_connection_gate_source
        or '"after": "msg-after"' not in live_connection_gate_source
        or '"around": "msg-around"' not in live_connection_gate_source
        or "SDK fetchHistory() returned malformed history" not in live_connection_gate_source
        or "bad fetchHistory live smoke" not in live_connection_gate_source
        or "bad fetchHistory metadata live smoke" not in live_connection_gate_source
        or "bad fetchHistory null cursor live smoke" not in live_connection_gate_source
        or "bad fetchHistory entry live smoke" not in live_connection_gate_source
        or "bad fetchHistory null optional live smoke" not in live_connection_gate_source
        or "bad fetchHistory null attachments live smoke" not in live_connection_gate_source
        or "SDK uploadFile() probe requires conversation id when upload file path is provided" not in live_connection_gate_source
        or "bad uploadFile path without conversation live smoke" not in live_connection_gate_source
        or "SDK uploadFile() probe requires conversation id when upload file name is provided" not in live_connection_gate_source
        or "bad uploadFile name without conversation live smoke" not in live_connection_gate_source
        or "SDK uploadFile() probe requires conversation id when upload file type is provided" not in live_connection_gate_source
        or "bad uploadFile type without conversation live smoke" not in live_connection_gate_source
        or "SDK uploadFile() probe file path does not exist" not in live_connection_gate_source
        or "bad uploadFile missing path live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_UPLOAD_FILE" not in live_connection_gate_source
        or "fake uploadFile rejected" not in live_connection_gate_source
        or "uploadFile failure live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPLOAD_FILE" not in live_connection_gate_source
        or "SDK uploadFile() returned malformed upload result" not in live_connection_gate_source
        or "bad uploadFile live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPLOAD_FILE_SIZE" not in live_connection_gate_source
        or "bad uploadFile size live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_UPLOAD_FILE_TYPE" not in live_connection_gate_source
        or "SDK uploadFile() returned mismatched upload metadata" not in live_connection_gate_source
        or "bad uploadFile metadata live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_REJECT_CALL_ACTION" not in live_connection_gate_source
        or "fake callAction rejected" not in live_connection_gate_source
        or "callAction failure live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_CONFIRMATION_CALL_ACTION" not in live_connection_gate_source
        or '"status": "requires_confirmation"' not in live_connection_gate_source
        or '"confirmationId": "confirm-live"' not in live_connection_gate_source
        or "live Arinova callAction OK: action=live.confirm status=requires_confirmation" not in live_connection_gate_source
        or "confirmation callAction live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_ERROR_CALL_ACTION" not in live_connection_gate_source
        or '"status": "error"' not in live_connection_gate_source
        or '"code": "live_error"' not in live_connection_gate_source
        or "live Arinova callAction OK: action=live.error status=error" not in live_connection_gate_source
        or "error callAction live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_CANCELLED_CALL_ACTION" not in live_connection_gate_source
        or '"status": "cancelled"' not in live_connection_gate_source
        or '"reason": "user_cancelled"' not in live_connection_gate_source
        or "live Arinova callAction OK: action=live.cancelled status=cancelled" not in live_connection_gate_source
        or "cancelled callAction live smoke" not in live_connection_gate_source
        or '"parentCallId":"parent-full"' not in live_connection_gate_source
        or '"metadata":{"source":"live-gate","nested":{"ok":true}}' not in live_connection_gate_source
        or "live Arinova callAction OK: action=live.full-options status=success" not in live_connection_gate_source
        or "full-options callAction live smoke" not in live_connection_gate_source
        or "async def call_task_sdk(self, task_id, method, *args):" not in live_connection_gate_source
        or "task_id=task-live-history messages=0" not in live_connection_gate_source
        or "task fetchHistory live smoke" not in live_connection_gate_source
        or "bad task fetchHistory limit without task live smoke" not in live_connection_gate_source
        or "bad task fetchHistory options without task live smoke" not in live_connection_gate_source
        or "bad task fetchHistory options JSON live smoke" not in live_connection_gate_source
        or "bad task fetchHistory options payload live smoke" not in live_connection_gate_source
        or "bad task fetchHistory options cursor live smoke" not in live_connection_gate_source
        or "bad task fetchHistory options limit live smoke" not in live_connection_gate_source
        or "bad task fetchHistory options unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY" not in live_connection_gate_source
        or "bad task fetchHistory live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_METADATA" not in live_connection_gate_source
        or "bad task fetchHistory metadata live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_NULL_CURSOR" not in live_connection_gate_source
        or "bad task fetchHistory null cursor live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_ENTRY" not in live_connection_gate_source
        or "bad task fetchHistory entry live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_NULL_OPTIONAL" not in live_connection_gate_source
        or "bad task fetchHistory null optional live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_FETCH_HISTORY_NULL_ATTACHMENTS" not in live_connection_gate_source
        or "bad task fetchHistory null attachments live smoke" not in live_connection_gate_source
        or "task_id=task-live-upload fileName=task-live-gate.txt" not in live_connection_gate_source
        or "task uploadFile live smoke" not in live_connection_gate_source
        or "bad task uploadFile path without task live smoke" not in live_connection_gate_source
        or "bad task uploadFile name without task live smoke" not in live_connection_gate_source
        or "bad task uploadFile type without task live smoke" not in live_connection_gate_source
        or "bad task uploadFile missing path live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_UPLOAD_FILE" not in live_connection_gate_source
        or "bad task uploadFile live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_UPLOAD_FILE_SIZE" not in live_connection_gate_source
        or "bad task uploadFile size live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_UPLOAD_FILE_TYPE" not in live_connection_gate_source
        or "Task SDK uploadFile() returned mismatched upload metadata" not in live_connection_gate_source
        or "bad task uploadFile metadata live smoke" not in live_connection_gate_source
        or "task_id=task-live-action action=live.task-action status=success" not in live_connection_gate_source
        or '"parentCallId":"task-parent"' not in live_connection_gate_source
        or '"metadata":{"source":"live-gate-task"}' not in live_connection_gate_source
        or "task callAction live smoke" not in live_connection_gate_source
        or "Task SDK callAction() probe requires task id when action name is provided" not in live_connection_gate_source
        or "bad task callAction action without task live smoke" not in live_connection_gate_source
        or "Task SDK callAction() probe requires task id when args JSON is provided" not in live_connection_gate_source
        or "bad task callAction args without task live smoke" not in live_connection_gate_source
        or "Task SDK callAction() probe requires task id when options JSON is provided" not in live_connection_gate_source
        or "bad task callAction options without task live smoke" not in live_connection_gate_source
        or "Task SDK callAction() probe requires action name when task id is provided" not in live_connection_gate_source
        or "bad task callAction task without action live smoke" not in live_connection_gate_source
        or '{"taskId":"other-task","conversationId":"conv-other","messageId":"msg-other"}' not in live_connection_gate_source
        or "Task SDK callAction() probe options must match TaskContext ActionCallOptions" not in live_connection_gate_source
        or "bad task callAction attribution options live smoke" not in live_connection_gate_source
        or "Task SDK callAction() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad task callAction JSON live smoke" not in live_connection_gate_source
        or "Task SDK callAction() probe args must be a JSON object" not in live_connection_gate_source
        or "bad task callAction args live smoke" not in live_connection_gate_source
        or "Task SDK callAction() probe options must be a JSON object" not in live_connection_gate_source
        or "bad task callAction options live smoke" not in live_connection_gate_source
        or '{"timeoutMs":"slow"}' not in live_connection_gate_source
        or "bad task callAction options shape live smoke" not in live_connection_gate_source
        or '{"metadata":null}' not in live_connection_gate_source
        or "bad task callAction options metadata live smoke" not in live_connection_gate_source
        or '{"timeoutMs":15000,"typo":true}' not in live_connection_gate_source
        or "bad task callAction options unknown field live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_CALL_ACTION" not in live_connection_gate_source
        or "Task SDK callAction() returned malformed action result" not in live_connection_gate_source
        or "bad task callAction live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_CALL_ACTION_OPTIONAL" not in live_connection_gate_source
        or "bad task callAction optional live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_CALL_ACTION_NULL_DETAILS" not in live_connection_gate_source
        or "bad task callAction null details live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_CALL_ACTION_NULL_DRY_RUN" not in live_connection_gate_source
        or "bad task callAction null dryRun live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_TASK_CALL_ACTION_NULL_METADATA" not in live_connection_gate_source
        or "bad task callAction null metadata live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CALL_ACTION" not in live_connection_gate_source
        or "SDK callAction() returned malformed action result" not in live_connection_gate_source
        or "bad callAction live smoke" not in live_connection_gate_source
        or "SDK callAction() probe requires action name when args JSON is provided" not in live_connection_gate_source
        or "bad callAction args without action live smoke" not in live_connection_gate_source
        or "SDK callAction() probe requires action name when options JSON is provided" not in live_connection_gate_source
        or "bad callAction options without action live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CALL_ACTION_OPTIONAL" not in live_connection_gate_source
        or "bad callAction optional live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CALL_ACTION_NULL_DETAILS" not in live_connection_gate_source
        or "bad callAction null details live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_NONTERMINAL_CALL_ACTION" not in live_connection_gate_source
        or 'for nonterminal_status in ("received", "validating", "processing")' not in live_connection_gate_source
        or "ARINOVA_FAKE_NONTERMINAL_CALL_ACTION=nonterminal_status" not in live_connection_gate_source
        or 'f"live.nonterminal.{nonterminal_status}"' not in live_connection_gate_source
        or 'f"nonterminal {nonterminal_status} callAction live smoke"' not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CALL_ACTION_NULL_DRY_RUN" not in live_connection_gate_source
        or "bad callAction null dryRun live smoke" not in live_connection_gate_source
        or "ARINOVA_FAKE_BAD_CALL_ACTION_NULL_METADATA" not in live_connection_gate_source
        or "bad callAction null metadata live smoke" not in live_connection_gate_source
        or "SDK callAction() probe JSON argument could not be parsed" not in live_connection_gate_source
        or "bad callAction JSON live smoke" not in live_connection_gate_source
        or "SDK callAction() probe args must be a JSON object" not in live_connection_gate_source
        or "bad callAction args live smoke" not in live_connection_gate_source
        or "SDK callAction() probe options must be a JSON object" not in live_connection_gate_source
        or "bad callAction options live smoke" not in live_connection_gate_source
        or "SDK callAction() probe options must match ActionCallOptions" not in live_connection_gate_source
        or "bad callAction options shape live smoke" not in live_connection_gate_source
        or '{"metadata":null}' not in live_connection_gate_source
        or "bad callAction options metadata live smoke" not in live_connection_gate_source
        or '{"dryRun":null}' not in live_connection_gate_source
        or "bad callAction options dryRun live smoke" not in live_connection_gate_source
        or '{"timeoutMs":15000,"typo":true}' not in live_connection_gate_source
        or "bad callAction options unknown field live smoke" not in live_connection_gate_source
        or "custom.live.telemetry" not in live_connection_gate_source
        or "SDK sendTelemetry() probe cannot use custom event when telemetry is skipped" not in live_connection_gate_source
        or "bad skip telemetry event live smoke" not in live_connection_gate_source
        or "SDK sendTelemetry() probe cannot use custom data when telemetry is skipped" not in live_connection_gate_source
        or "bad skip telemetry data live smoke" not in live_connection_gate_source
        or "SDK sendTelemetry() probe event must be a non-empty string" not in live_connection_gate_source
        or "bad sendTelemetry event live smoke" not in live_connection_gate_source
        or "SDK sendTelemetry() probe data JSON argument could not be parsed" not in live_connection_gate_source
        or "bad sendTelemetry JSON live smoke" not in live_connection_gate_source
        or "SDK sendTelemetry() probe data must be a JSON object" not in live_connection_gate_source
        or "bad sendTelemetry payload live smoke" not in live_connection_gate_source
        or "missing ARINOVA_SERVER_URL, ARINOVA_BOT_TOKEN" not in live_connection_gate_source
        or "missing ARINOVA_SERVER_URL" not in live_connection_gate_source
        or "missing ARINOVA_BOT_TOKEN" not in live_connection_gate_source
        or "ari_fake" not in live_connection_gate_source
        or "wss://example.invalid" not in live_connection_gate_source
        or '"/healthz"' not in live_connection_source
        or 'health.get("ok") is not True' not in live_connection_source
        or 'health.get("connected") is not True' not in live_connection_source
        or 'health.get("agentId")' not in live_connection_source
        or "sidecar health agent id disagreed with SDK getAgentId()" not in live_connection_source
        or "getAgentId" not in live_agent_sdk_calls
        or "SDK getAgentId() did not return an authenticated agent id" not in live_connection_source
        or "SDK getAgentId() disagreed with token-claimed agent id" not in live_connection_source
        or "getOnboardingSeed" not in live_agent_sdk_calls
        or "SDK getOnboardingSeed() returned unexpected value" not in live_connection_source
        or "SDK getOnboardingSeed() returned malformed seed" not in live_connection_source
        or "first_touch_opening" not in live_connection_source
        or "async def _expect_sdk_void(adapter: object, method: str, *args: object) -> None:" not in live_connection_source
        or "returned non-null void result" not in live_connection_source
        or "--skip-telemetry" not in live_connection_source
        or "--send-telemetry-event" not in live_connection_source
        or "--send-telemetry-json" not in live_connection_source
        or "sendTelemetry" not in live_agent_sdk_calls
        or "DEFAULT_SEND_TELEMETRY_EVENT" not in live_connection_source
        or "hermes_arinova_live_smoke" not in live_connection_source
        or "SDK sendTelemetry() probe cannot use custom event when telemetry is skipped" not in live_connection_source
        or "SDK sendTelemetry() probe cannot use custom data when telemetry is skipped" not in live_connection_source
        or "SDK sendTelemetry() probe event must be a non-empty string" not in live_connection_source
        or "SDK sendTelemetry() probe data JSON argument could not be parsed" not in live_connection_source
        or "SDK sendTelemetry() probe data must be a JSON object" not in live_connection_source
        or 'await _expect_sdk_void(\n                    adapter,\n                    "sendTelemetry",' not in live_connection_source
        or "--send-hud-json" not in live_connection_source
        or "--send-hud-conversation" not in live_connection_source
        or "sendHud" not in live_agent_sdk_calls
        or 'await _expect_sdk_void(adapter, "sendHud", send_hud_payload, send_hud_conversation)' not in live_connection_source
        or 'await _expect_sdk_void(adapter, "sendHud", send_hud_payload)' not in live_connection_source
        or "SDK sendHud() probe requires HUD JSON when conversation id is provided" not in live_connection_source
        or "SDK sendHud() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK sendHud() probe payload must be a JSON object" not in live_connection_source
        or "live Arinova sendHud OK" not in live_connection_source
        or "--send-task-update-json" not in live_connection_source
        or "sendTaskUpdate" not in live_agent_sdk_calls
        or 'await _expect_sdk_void(adapter, "sendTaskUpdate", "Hermes", send_task_update_payload)' not in live_connection_source
        or "SDK sendTaskUpdate() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK sendTaskUpdate() probe payload must be a JSON object" not in live_connection_source
        or "def _sdk_task_update_data(value: object) -> bool:" not in live_connection_source
        or "TASK_UPDATE_STARTED_FIELDS" not in live_connection_source
        or "TASK_UPDATE_COMPLETED_FIELDS" not in live_connection_source
        or "all(key in TASK_UPDATE_STARTED_FIELDS for key in value)" not in live_connection_source
        or "all(key in TASK_UPDATE_COMPLETED_FIELDS for key in value)" not in live_connection_source
        or "SDK sendTaskUpdate() probe payload must match TaskUpdateData" not in live_connection_source
        or "not _sdk_task_update_data(send_task_update_payload)" not in live_connection_source
        or "live Arinova sendTaskUpdate OK" not in live_connection_source
        or "--report-tool-call-json" not in live_connection_source
        or "reportToolCall" not in live_agent_sdk_calls
        or 'await _expect_sdk_void(adapter, "reportToolCall", report_tool_call_payload)' not in live_connection_source
        or "SDK reportToolCall() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK reportToolCall() probe payload must be a JSON object" not in live_connection_source
        or "def _sdk_tool_call_report(value: object) -> bool:" not in live_connection_source
        or "TOOL_CALL_REPORT_FIELDS" not in live_connection_source
        or "any(key not in TOOL_CALL_REPORT_FIELDS for key in value)" not in live_connection_source
        or "SDK reportToolCall() probe payload must match ToolCallReport" not in live_connection_source
        or "not _sdk_tool_call_report(report_tool_call_payload)" not in live_connection_source
        or "live Arinova reportToolCall OK" not in live_connection_source
        or "--query-memory-json" not in live_connection_source
        or "queryMemory" not in live_agent_sdk_calls
        or "SDK queryMemory() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK queryMemory() probe payload must be a JSON object" not in live_connection_source
        or "def _sdk_query_memory_options(value: object) -> bool:" not in live_connection_source
        or "QUERY_MEMORY_OPTION_FIELDS" not in live_connection_source
        or "all(key in QUERY_MEMORY_OPTION_FIELDS for key in value)" not in live_connection_source
        or "SDK queryMemory() probe payload must match QueryMemoryOptions" not in live_connection_source
        or "not _sdk_query_memory_options(query_memory_payload)" not in live_connection_source
        or "SDK queryMemory() returned malformed memory result" not in live_connection_source
        or "import math" not in live_connection_source
        or "math.isfinite(value)" not in live_connection_source
        or "not isinstance(value, bool)" not in live_connection_source
        or "def _sdk_memory_origin(value: object) -> bool:" not in live_connection_source
        or 'value in {"self", "system"}' not in live_connection_source
        or 'value.startswith(shared_prefix)' not in live_connection_source
        or "len(value) == len(shared_prefix) + 8" not in live_connection_source
        or 'char in "0123456789abcdef"' not in live_connection_source
        or "def _sdk_optional_memory_origin(value: dict[str, object], key: str) -> bool:" not in live_connection_source
        or '_sdk_optional_memory_origin(value, "origin")' not in live_connection_source
        or "def _sdk_paginated_result(value: object, items_key: str) -> bool:" not in live_connection_source
        or 'isinstance(value.get("hasMore"), bool)' not in live_connection_source
        or '_sdk_optional_str(value, "nextCursor")' not in live_connection_source
        or "next_cursor = value.get(\"nextCursor\")" in live_connection_source
        or "def _sdk_memory_entry(value: object) -> bool:" not in live_connection_source
        or "any(not _sdk_memory_entry(entry) for entry in memory_entries)" not in live_connection_source
        or "live Arinova queryMemory OK: entries=" not in live_connection_source
        or "--fetch-skill-prompt" not in live_connection_source
        or "fetchSkillPrompt" not in live_agent_sdk_calls
        or "SDK fetchSkillPrompt() returned malformed prompt" not in live_connection_source
        or "def _sdk_skill_prompt(value: object) -> bool:" not in live_connection_source
        or 'isinstance(value.get("parameters"), list)' not in live_connection_source
        or "not _sdk_skill_prompt(skill_prompt)" not in live_connection_source
        or "live Arinova fetchSkillPrompt OK: slug=" not in live_connection_source
        or "--list-boards" not in live_connection_source
        or "listBoards" not in live_agent_sdk_calls
        or "SDK listBoards() returned malformed boards result" not in live_connection_source
        or "def _sdk_kanban_board(value: object) -> bool:" not in live_connection_source
        or 'isinstance(value.get("createdAt"), str)' not in live_connection_source
        or "any(not _sdk_kanban_board(board) for board in boards)" not in live_connection_source
        or "live Arinova listBoards OK: boards=" not in live_connection_source
        or "--list-cards-json" not in live_connection_source
        or "listCards" not in live_agent_sdk_calls
        or "SDK listCards() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK listCards() probe options must be a JSON object" not in live_connection_source
        or "def _sdk_list_cards_options(value: object) -> bool:" not in live_connection_source
        or "LIST_CARDS_OPTION_FIELDS" not in live_connection_source
        or "all(key in LIST_CARDS_OPTION_FIELDS for key in value)" not in live_connection_source
        or "SDK listCards() probe options must match SDK listCards options" not in live_connection_source
        or "not _sdk_list_cards_options(list_cards_options)" not in live_connection_source
        or "SDK listCards() returned malformed cards result" not in live_connection_source
        or "def _sdk_kanban_card(value: object) -> bool:" not in live_connection_source
        or 'isinstance(value.get("columnId"), str)' not in live_connection_source
        or '_sdk_optional_str(value, "columnName")' not in live_connection_source
        or 'value.get("columnName") is None' in live_connection_source
        or 'def _sdk_required_nullable_str(value: dict[str, object], key: str) -> bool:' not in live_connection_source
        or 'def _sdk_optional_nullable_str(value: dict[str, object], key: str) -> bool:' not in live_connection_source
        or '_sdk_required_nullable_str(value, "description")' not in live_connection_source
        or '_sdk_required_nullable_str(value, "createdAt")' not in live_connection_source
        or '_sdk_optional_nullable_str(value, "archivedAt")' not in live_connection_source
        or '_sdk_number(value.get("sortOrder"))' not in live_connection_source
        or "any(not _sdk_kanban_card(card) for card in cards)" not in live_connection_source
        or "live Arinova listCards OK: cards=" not in live_connection_source
        or "--list-notes-conversation" not in live_connection_source
        or "--list-notes-options-json" not in live_connection_source
        or "listNotes" not in live_agent_sdk_calls
        or "SDK listNotes() probe requires conversation id when notes options JSON is provided" not in live_connection_source
        or "SDK listNotes() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK listNotes() probe options must be a JSON object" not in live_connection_source
        or "def _sdk_list_notes_options(value: object) -> bool:" not in live_connection_source
        or "LIST_NOTES_OPTION_FIELDS" not in live_connection_source
        or "all(key in LIST_NOTES_OPTION_FIELDS for key in value)" not in live_connection_source
        or "SDK listNotes() probe options must match ListNotesOptions" not in live_connection_source
        or "not _sdk_list_notes_options(list_notes_options)" not in live_connection_source
        or "SDK listNotes() returned malformed notes result" not in live_connection_source
        or "def _sdk_note(value: object) -> bool:" not in live_connection_source
        or 'value.get("creatorType") in {"user", "agent"}' not in live_connection_source
        or '_sdk_optional_str(value, "agentId")' not in live_connection_source
        or '_sdk_optional_str(value, "agentName")' not in live_connection_source
        or "def _sdk_optional_str_array(value: dict[str, object], key: str) -> bool:" not in live_connection_source
        or '_sdk_optional_str_array(value, "tags")' not in live_connection_source
        or "tags is None" in live_connection_source
        or "not _sdk_note(note)" not in live_connection_source
        or 'not _sdk_paginated_result(notes_result, "notes")' not in live_connection_source
        or "hasMore={notes_result.get('hasMore')}" not in live_connection_source
        or "live Arinova listNotes OK: " not in live_connection_source
        or "--list-columns-board" not in live_connection_source
        or "listColumns" not in live_agent_sdk_calls
        or "SDK listColumns() returned malformed columns result" not in live_connection_source
        or "def _sdk_kanban_column(value: object) -> bool:" not in live_connection_source
        or "_sdk_number(value.get(\"sortOrder\"))" not in live_connection_source
        or "any(not _sdk_kanban_column(column) for column in columns)" not in live_connection_source
        or "live Arinova listColumns OK: " not in live_connection_source
        or "--list-labels-board" not in live_connection_source
        or "listLabels" not in live_agent_sdk_calls
        or "SDK listLabels() returned malformed labels result" not in live_connection_source
        or "def _sdk_kanban_label(value: object) -> bool:" not in live_connection_source
        or '_sdk_required_nullable_str(value, "color")' not in live_connection_source
        or "any(not _sdk_kanban_label(label) for label in labels)" not in live_connection_source
        or "live Arinova listLabels OK: " not in live_connection_source
        or "--list-archived-cards-board" not in live_connection_source
        or "--list-archived-cards-options-json" not in live_connection_source
        or "listArchivedCards" not in live_agent_sdk_calls
        or "SDK listArchivedCards() probe requires board id when archived cards options JSON is provided" not in live_connection_source
        or "SDK listArchivedCards() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK listArchivedCards() probe options must be a JSON object" not in live_connection_source
        or "def _sdk_list_archived_cards_options(value: object) -> bool:" not in live_connection_source
        or "LIST_ARCHIVED_CARDS_OPTION_FIELDS" not in live_connection_source
        or "all(key in LIST_ARCHIVED_CARDS_OPTION_FIELDS for key in value)" not in live_connection_source
        or "SDK listArchivedCards() probe options must match SDK listArchivedCards options" not in live_connection_source
        or "not _sdk_list_archived_cards_options(list_archived_cards_options)" not in live_connection_source
        or "SDK listArchivedCards() returned malformed archived cards result" not in live_connection_source
        or 'not _sdk_number(archived_cards.get("total"))' not in live_connection_source
        or 'not _sdk_number(archived_cards.get("page"))' not in live_connection_source
        or 'not _sdk_number(archived_cards.get("limit"))' not in live_connection_source
        or 'any(not _sdk_kanban_card(card) for card in archived_cards.get("cards", []))' not in live_connection_source
        or "live Arinova listArchivedCards OK: " not in live_connection_source
        or "--list-card-commits-card" not in live_connection_source
        or "listCardCommits" not in live_agent_sdk_calls
        or "SDK listCardCommits() returned malformed commits result" not in live_connection_source
        or "def _sdk_card_commit(value: object) -> bool:" not in live_connection_source
        or "not _sdk_card_commit(commit)" not in live_connection_source
        or "live Arinova listCardCommits OK: " not in live_connection_source
        or "--list-card-notes-card" not in live_connection_source
        or "listCardNotes" not in live_agent_sdk_calls
        or "SDK listCardNotes() returned malformed card notes result" not in live_connection_source
        or "def _sdk_card_note(value: object) -> bool:" not in live_connection_source
        or "not _sdk_card_note(note)" not in live_connection_source
        or "live Arinova listCardNotes OK: " not in live_connection_source
        or "--share-note-conversation" not in live_connection_source
        or "--share-note-id" not in live_connection_source
        or "shareNote" not in live_agent_sdk_calls
        or "SDK shareNote() probe requires both conversation id and note id" not in live_connection_source
        or "SDK shareNote() returned malformed share result" not in live_connection_source
        or "def _sdk_share_note_result(value: object) -> bool:" not in live_connection_source
        or "not _sdk_share_note_result(share_result)" not in live_connection_source
        or 'all(isinstance(tag, str) for tag in value.get("tags"))' not in live_connection_source
        or "live Arinova shareNote OK: " not in live_connection_source
        or "--create-note-conversation" not in live_connection_source
        or "--create-note-body-json" not in live_connection_source
        or "createNote" not in live_agent_sdk_calls
        or "SDK createNote() probe requires both conversation id and note body JSON" not in live_connection_source
        or "SDK createNote() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK createNote() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_create_note_body(value: object) -> bool:" not in live_connection_source
        or "CREATE_NOTE_BODY_FIELDS" not in live_connection_source
        or "all(key in CREATE_NOTE_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK createNote() probe body must match CreateNoteBody" not in live_connection_source
        or "not _sdk_create_note_body(create_note_body)" not in live_connection_source
        or "SDK createNote() returned malformed note result" not in live_connection_source
        or "not _sdk_note(created_note)" not in live_connection_source
        or "live Arinova createNote OK: " not in live_connection_source
        or "--update-note-conversation" not in live_connection_source
        or "--update-note-id" not in live_connection_source
        or "--update-note-body-json" not in live_connection_source
        or "updateNote" not in live_agent_sdk_calls
        or "SDK updateNote() probe requires conversation id, note id, and note body JSON" not in live_connection_source
        or "SDK updateNote() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK updateNote() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_update_note_body(value: object) -> bool:" not in live_connection_source
        or "UPDATE_NOTE_BODY_FIELDS" not in live_connection_source
        or "all(key in UPDATE_NOTE_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK updateNote() probe body must match UpdateNoteBody" not in live_connection_source
        or "not _sdk_update_note_body(update_note_body)" not in live_connection_source
        or "SDK updateNote() returned malformed note result" not in live_connection_source
        or "not _sdk_note(updated_note)" not in live_connection_source
        or "live Arinova updateNote OK: " not in live_connection_source
        or "--delete-note-conversation" not in live_connection_source
        or "--delete-note-id" not in live_connection_source
        or "deleteNote" not in live_agent_sdk_calls
        or "SDK deleteNote() probe requires both conversation id and note id" not in live_connection_source
        or 'await _expect_sdk_void(adapter, "deleteNote", delete_note_conversation, delete_note_id)' not in live_connection_source
        or "live Arinova deleteNote OK: " not in live_connection_source
        or "--create-board-body-json" not in live_connection_source
        or "createBoard" not in live_agent_sdk_calls
        or "SDK createBoard() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK createBoard() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_create_board_body(value: object) -> bool:" not in live_connection_source
        or "CREATE_BOARD_BODY_FIELDS" not in live_connection_source
        or "all(key in CREATE_BOARD_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK createBoard() probe body must match CreateBoardBody" not in live_connection_source
        or "not _sdk_create_board_body(create_board_body)" not in live_connection_source
        or "SDK createBoard() returned malformed board result" not in live_connection_source
        or "not _sdk_kanban_board(created_board)" not in live_connection_source
        or "live Arinova createBoard OK: " not in live_connection_source
        or "--update-board-id" not in live_connection_source
        or "--update-board-body-json" not in live_connection_source
        or "updateBoard" not in live_agent_sdk_calls
        or "SDK updateBoard() probe requires both board id and board body JSON" not in live_connection_source
        or "SDK updateBoard() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK updateBoard() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_update_board_body(value: object) -> bool:" not in live_connection_source
        or "UPDATE_BOARD_BODY_FIELDS" not in live_connection_source
        or "all(key in UPDATE_BOARD_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK updateBoard() probe body must match UpdateBoardBody" not in live_connection_source
        or "not _sdk_update_board_body(update_board_body)" not in live_connection_source
        or "SDK updateBoard() returned malformed board result" not in live_connection_source
        or "not _sdk_kanban_board(updated_board)" not in live_connection_source
        or "live Arinova updateBoard OK: " not in live_connection_source
        or "--archive-board-id" not in live_connection_source
        or "archiveBoard" not in live_agent_sdk_calls
        or 'await _expect_sdk_void(adapter, "archiveBoard", archive_board_id)' not in live_connection_source
        or "live Arinova archiveBoard OK: " not in live_connection_source
        or "--create-card-body-json" not in live_connection_source
        or "createCard" not in live_agent_sdk_calls
        or "SDK createCard() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK createCard() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_create_card_body(value: object) -> bool:" not in live_connection_source
        or "CREATE_CARD_BODY_FIELDS" not in live_connection_source
        or "all(key in CREATE_CARD_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK createCard() probe body must match CreateCardBody" not in live_connection_source
        or "not _sdk_create_card_body(create_card_body)" not in live_connection_source
        or "SDK createCard() returned malformed card result" not in live_connection_source
        or "not _sdk_kanban_card(created_card)" not in live_connection_source
        or "live Arinova createCard OK: " not in live_connection_source
        or "--update-card-id" not in live_connection_source
        or "--update-card-body-json" not in live_connection_source
        or "updateCard" not in live_agent_sdk_calls
        or "SDK updateCard() probe requires both card id and card body JSON" not in live_connection_source
        or "SDK updateCard() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK updateCard() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_update_card_body(value: object) -> bool:" not in live_connection_source
        or "UPDATE_CARD_BODY_FIELDS" not in live_connection_source
        or "all(key in UPDATE_CARD_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK updateCard() probe body must match UpdateCardBody" not in live_connection_source
        or "not _sdk_update_card_body(update_card_body)" not in live_connection_source
        or "SDK updateCard() returned malformed card result" not in live_connection_source
        or "not _sdk_kanban_card(updated_card)" not in live_connection_source
        or "live Arinova updateCard OK: " not in live_connection_source
        or "--complete-card-id" not in live_connection_source
        or "completeCard" not in live_agent_sdk_calls
        or "SDK completeCard() returned malformed card result" not in live_connection_source
        or "not _sdk_kanban_card(completed_card)" not in live_connection_source
        or "live Arinova completeCard OK: " not in live_connection_source
        or "--create-column-board" not in live_connection_source
        or "--create-column-body-json" not in live_connection_source
        or "createColumn" not in live_agent_sdk_calls
        or "SDK createColumn() probe requires both board id and column body JSON" not in live_connection_source
        or "SDK createColumn() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK createColumn() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_create_column_body(value: object) -> bool:" not in live_connection_source
        or "CREATE_COLUMN_BODY_FIELDS" not in live_connection_source
        or "all(key in CREATE_COLUMN_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK createColumn() probe body must match CreateColumnBody" not in live_connection_source
        or "not _sdk_create_column_body(create_column_body)" not in live_connection_source
        or "SDK createColumn() returned malformed column result" not in live_connection_source
        or "not _sdk_kanban_column(created_column)" not in live_connection_source
        or "live Arinova createColumn OK: " not in live_connection_source
        or "--update-column-id" not in live_connection_source
        or "--update-column-body-json" not in live_connection_source
        or "updateColumn" not in live_agent_sdk_calls
        or "SDK updateColumn() probe requires both column id and column body JSON" not in live_connection_source
        or "SDK updateColumn() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK updateColumn() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_update_column_body(value: object) -> bool:" not in live_connection_source
        or "UPDATE_COLUMN_BODY_FIELDS" not in live_connection_source
        or "all(key in UPDATE_COLUMN_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK updateColumn() probe body must match UpdateColumnBody" not in live_connection_source
        or "not _sdk_update_column_body(update_column_body)" not in live_connection_source
        or "SDK updateColumn() returned malformed column result" not in live_connection_source
        or "not _sdk_kanban_column(updated_column)" not in live_connection_source
        or "live Arinova updateColumn OK: " not in live_connection_source
        or "--delete-column-id" not in live_connection_source
        or "deleteColumn" not in live_agent_sdk_calls
        or 'await _expect_sdk_void(adapter, "deleteColumn", delete_column_id)' not in live_connection_source
        or "live Arinova deleteColumn OK: " not in live_connection_source
        or "--reorder-columns-board" not in live_connection_source
        or "--reorder-columns-json" not in live_connection_source
        or "reorderColumns" not in live_agent_sdk_calls
        or "SDK reorderColumns() probe requires both board id and column ids JSON" not in live_connection_source
        or "SDK reorderColumns() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK reorderColumns() probe column ids must be a JSON string array" not in live_connection_source
        or 'await _expect_sdk_void(adapter, "reorderColumns", reorder_columns_board, reorder_column_ids)' not in live_connection_source
        or "live Arinova reorderColumns OK: " not in live_connection_source
        or "--add-card-commit-card" not in live_connection_source
        or "--add-card-commit-body-json" not in live_connection_source
        or "addCardCommit" not in live_agent_sdk_calls
        or "SDK addCardCommit() probe requires both card id and commit body JSON" not in live_connection_source
        or "SDK addCardCommit() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK addCardCommit() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_add_commit_body(value: object) -> bool:" not in live_connection_source
        or "ADD_COMMIT_BODY_FIELDS" not in live_connection_source
        or "all(key in ADD_COMMIT_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK addCardCommit() probe body must match AddCommitBody" not in live_connection_source
        or "not _sdk_add_commit_body(add_card_commit_body)" not in live_connection_source
        or "SDK addCardCommit() returned malformed commit result" not in live_connection_source
        or "not _sdk_card_commit(card_commit)" not in live_connection_source
        or "live Arinova addCardCommit OK: " not in live_connection_source
        or "--link-card-note-card" not in live_connection_source
        or "--link-card-note-note" not in live_connection_source
        or "linkCardNote" not in live_agent_sdk_calls
        or "SDK linkCardNote() probe requires both card id and note id" not in live_connection_source
        or 'await _expect_sdk_void(adapter, "linkCardNote", link_card_note_card, link_card_note_note)' not in live_connection_source
        or "live Arinova linkCardNote OK: " not in live_connection_source
        or "--unlink-card-note-card" not in live_connection_source
        or "--unlink-card-note-note" not in live_connection_source
        or "unlinkCardNote" not in live_agent_sdk_calls
        or "SDK unlinkCardNote() probe requires both card id and note id" not in live_connection_source
        or 'await _expect_sdk_void(adapter, "unlinkCardNote", unlink_card_note_card, unlink_card_note_note)' not in live_connection_source
        or "live Arinova unlinkCardNote OK: " not in live_connection_source
        or "--create-label-board" not in live_connection_source
        or "--create-label-body-json" not in live_connection_source
        or "createLabel" not in live_agent_sdk_calls
        or "SDK createLabel() probe requires both board id and label body JSON" not in live_connection_source
        or "SDK createLabel() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK createLabel() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_create_label_body(value: object) -> bool:" not in live_connection_source
        or "CREATE_LABEL_BODY_FIELDS" not in live_connection_source
        or "all(key in CREATE_LABEL_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK createLabel() probe body must match CreateLabelBody" not in live_connection_source
        or "not _sdk_create_label_body(create_label_body)" not in live_connection_source
        or "SDK createLabel() returned malformed label result" not in live_connection_source
        or "not _sdk_kanban_label(created_label)" not in live_connection_source
        or "live Arinova createLabel OK: " not in live_connection_source
        or "--update-label-id" not in live_connection_source
        or "--update-label-body-json" not in live_connection_source
        or "updateLabel" not in live_agent_sdk_calls
        or "SDK updateLabel() probe requires both label id and label body JSON" not in live_connection_source
        or "SDK updateLabel() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK updateLabel() probe body must be a JSON object" not in live_connection_source
        or "def _sdk_update_label_body(value: object) -> bool:" not in live_connection_source
        or "UPDATE_LABEL_BODY_FIELDS" not in live_connection_source
        or "all(key in UPDATE_LABEL_BODY_FIELDS for key in value)" not in live_connection_source
        or "SDK updateLabel() probe body must match UpdateLabelBody" not in live_connection_source
        or "not _sdk_update_label_body(update_label_body)" not in live_connection_source
        or "SDK updateLabel() returned malformed label result" not in live_connection_source
        or "not _sdk_kanban_label(updated_label)" not in live_connection_source
        or "live Arinova updateLabel OK: " not in live_connection_source
        or "--delete-label-id" not in live_connection_source
        or "deleteLabel" not in live_agent_sdk_calls
        or 'await _expect_sdk_void(adapter, "deleteLabel", delete_label_id)' not in live_connection_source
        or "live Arinova deleteLabel OK: " not in live_connection_source
        or "--add-card-label-card" not in live_connection_source
        or "--add-card-label-label" not in live_connection_source
        or "addCardLabel" not in live_agent_sdk_calls
        or "SDK addCardLabel() probe requires both card id and label id" not in live_connection_source
        or 'await _expect_sdk_void(adapter, "addCardLabel", add_card_label_card, add_card_label_label)' not in live_connection_source
        or "live Arinova addCardLabel OK: " not in live_connection_source
        or "--remove-card-label-card" not in live_connection_source
        or "--remove-card-label-label" not in live_connection_source
        or "removeCardLabel" not in live_agent_sdk_calls
        or "SDK removeCardLabel() probe requires both card id and label id" not in live_connection_source
        or 'await _expect_sdk_void(adapter, "removeCardLabel", remove_card_label_card, remove_card_label_label)' not in live_connection_source
        or "live Arinova removeCardLabel OK: " not in live_connection_source
        or "--send-message-conversation" not in live_connection_source
        or "--send-message-content" not in live_connection_source
        or "DEFAULT_SEND_MESSAGE_CONTENT" not in live_connection_source
        or "sendMessage" not in live_agent_sdk_calls
        or "SDK sendMessage() probe requires conversation id when message content is provided" not in live_connection_source
        or 'await _expect_sdk_void(adapter, "sendMessage", send_conversation, send_message_content)' not in live_connection_source
        or "live Arinova sendMessage OK: conversation_id=" not in live_connection_source
        or "--fetch-history-conversation" not in live_connection_source
        or "--fetch-history-limit" not in live_connection_source
        or "--fetch-history-options-json" not in live_connection_source
        or "DEFAULT_FETCH_HISTORY_LIMIT" not in live_connection_source
        or "SDK fetchHistory() probe requires conversation id when history limit is provided" not in live_connection_source
        or "SDK fetchHistory() probe requires conversation id when history options JSON is provided" not in live_connection_source
        or "fetchHistory" not in live_agent_sdk_calls
        or "def _sdk_fetch_history_options(value: object) -> bool:" not in live_connection_source
        or "FETCH_HISTORY_OPTION_FIELDS" not in live_connection_source
        or "all(key in FETCH_HISTORY_OPTION_FIELDS for key in value)" not in live_connection_source
        or "SDK fetchHistory() probe options JSON argument could not be parsed" not in live_connection_source
        or "SDK fetchHistory() probe options must be a JSON object" not in live_connection_source
        or "SDK fetchHistory() probe options must match FetchHistoryOptions" not in live_connection_source
        or "not _sdk_fetch_history_options(fetch_history_options)" not in live_connection_source
        or "SDK fetchHistory() returned malformed history" not in live_connection_source
        or "def _sdk_task_attachment(value: object) -> bool:" not in live_connection_source
        or "def _sdk_history_message(value: object) -> bool:" not in live_connection_source
        or '_sdk_number(value.get("seq"))' not in live_connection_source
        or any(
            live_connection_source.count(f'_sdk_optional_str(value, "{field}")') != 1
            for field in (
                "senderAgentId",
                "senderAgentName",
                "senderUserId",
                "senderUsername",
                "replyToId",
                "threadId",
            )
        )
        or "def _sdk_optional_task_attachment_array(value: dict[str, object], key: str) -> bool:" not in live_connection_source
        or '_sdk_optional_task_attachment_array(value, "attachments")' not in live_connection_source
        or "attachments is None" in live_connection_source
        or 'not _sdk_paginated_result(history, "messages")' not in live_connection_source
        or "any(not _sdk_history_message(message) for message in history.get(\"messages\", []))" not in live_connection_source
        or "hasMore={history.get('hasMore')}" not in live_connection_source
        or "live Arinova fetchHistory OK: " not in live_connection_source
        or "--upload-file-conversation" not in live_connection_source
        or "--upload-file-path" not in live_connection_source
        or "--upload-file-name" not in live_connection_source
        or "--upload-file-type" not in live_connection_source
        or "SDK uploadFile() probe requires conversation id when upload file path is provided" not in live_connection_source
        or "SDK uploadFile() probe requires conversation id when upload file name is provided" not in live_connection_source
        or "SDK uploadFile() probe requires conversation id when upload file type is provided" not in live_connection_source
        or "DEFAULT_UPLOAD_FILE_TYPE" not in live_connection_source
        or "SDK uploadFile() probe file path does not exist" not in live_connection_source
        or "uploadFile" not in live_agent_sdk_calls
        or "SDK uploadFile() returned malformed upload result" not in live_connection_source
        or "def _sdk_upload_result(value: object) -> bool:" not in live_connection_source
        or "not _sdk_upload_result(upload)" not in live_connection_source
        or "SDK uploadFile() returned mismatched upload metadata" not in live_connection_source
        or "fileType={upload.get('fileType')} fileSize={upload.get('fileSize')}" not in live_connection_source
        or "live Arinova uploadFile OK: " not in live_connection_source
        or "--call-action" not in live_connection_source
        or "--call-action-args-json" not in live_connection_source
        or "--call-action-options-json" not in live_connection_source
        or "DEFAULT_CALL_ACTION_ARGS_JSON" not in live_connection_source
        or "DEFAULT_CALL_ACTION_OPTIONS_JSON" not in live_connection_source
        or "callAction" not in live_agent_sdk_calls
        or "SDK callAction() returned malformed action result" not in live_connection_source
        or "def _sdk_action_call_result(value: object, action_name: str) -> bool:" not in live_connection_source
        or "def _sdk_action_error(value: object) -> bool:" not in live_connection_source
        or "def _sdk_action_confirmation(value: object) -> bool:" not in live_connection_source
        or "def _sdk_action_call_options(value: object) -> bool:" not in live_connection_source
        or "TASK_ACTION_CALL_OPTION_FIELDS = ACTION_CALL_OPTION_FIELDS - {\"taskId\", \"conversationId\", \"messageId\"}" not in live_connection_source
        or "def _sdk_task_action_call_options(value: object) -> bool:" not in live_connection_source
        or "ACTION_CALL_OPTION_FIELDS" not in live_connection_source
        or "any(key not in ACTION_CALL_OPTION_FIELDS for key in value)" not in live_connection_source
        or "ACTION_STATUSES" not in live_connection_source
        or "TERMINAL_ACTION_STATUSES" not in live_connection_source
        or 'value.get("status") in TERMINAL_ACTION_STATUSES' not in live_connection_source
        or "(result is None or isinstance(result, dict))" not in live_connection_source
        or "(error is None or _sdk_action_error(error))" not in live_connection_source
        or "(confirmation is None or _sdk_action_confirmation(confirmation))" not in live_connection_source
        or "def _sdk_optional_str(value: dict[str, object], key: str) -> bool:" not in live_connection_source
        or "def _sdk_optional_object(value: dict[str, object], key: str) -> bool:" not in live_connection_source
        or '_sdk_optional_object(value, "details")' not in live_connection_source
        or "def _sdk_optional_bool(value: dict[str, object], key: str) -> bool:" not in live_connection_source
        or '_sdk_optional_bool(value, "dryRun")' not in live_connection_source
        or '_sdk_optional_str(value, "traceId")' not in live_connection_source
        or '_sdk_optional_str(value, "actionVersion")' not in live_connection_source
        or "not _sdk_action_call_result(action_result, call_action_name)" not in live_connection_source
        or "SDK callAction() probe requires action name when args JSON is provided" not in live_connection_source
        or "SDK callAction() probe requires action name when options JSON is provided" not in live_connection_source
        or "_loads_probe_json(call_action_args_json)" not in live_connection_source
        or "_loads_probe_json(call_action_options_json)" not in live_connection_source
        or "_loads_probe_json(task_call_action_args_json)" not in live_connection_source
        or "_loads_probe_json(task_call_action_options_json)" not in live_connection_source
        or "SDK callAction() probe JSON argument could not be parsed" not in live_connection_source
        or "SDK callAction() probe args must be a JSON object" not in live_connection_source
        or "SDK callAction() probe options must be a JSON object" not in live_connection_source
        or "SDK callAction() probe options must match ActionCallOptions" not in live_connection_source
        or "not _sdk_action_call_options(call_action_options)" not in live_connection_source
        or "live Arinova callAction OK: " not in live_connection_source
        or "Task SDK fetchHistory() probe requires task id when history limit is provided" not in live_connection_source
        or "Task SDK fetchHistory() probe requires task id when history options JSON is provided" not in live_connection_source
        or "Task SDK fetchHistory() probe options JSON argument could not be parsed" not in live_connection_source
        or "Task SDK fetchHistory() probe options must be a JSON object" not in live_connection_source
        or "Task SDK fetchHistory() probe options must match FetchHistoryOptions" not in live_connection_source
        or 'adapter.call_task_sdk(\n                    task_history_task,\n                    "fetchHistory",' not in live_connection_source
        or "Task SDK fetchHistory() returned malformed history" not in live_connection_source
        or "live Arinova task fetchHistory OK: " not in live_connection_source
        or "Task SDK uploadFile() probe requires task id when upload file path is provided" not in live_connection_source
        or "Task SDK uploadFile() probe requires task id when upload file name is provided" not in live_connection_source
        or "Task SDK uploadFile() probe requires task id when upload file type is provided" not in live_connection_source
        or "Task SDK uploadFile() probe file path does not exist" not in live_connection_source
        or 'adapter.call_task_sdk(\n                        task_upload_task,\n                        "uploadFile",' not in live_connection_source
        or "Task SDK uploadFile() returned malformed upload result" not in live_connection_source
        or "Task SDK uploadFile() returned mismatched upload metadata" not in live_connection_source
        or "live Arinova task uploadFile OK: " not in live_connection_source
        or "Task SDK callAction() probe requires task id when action name is provided" not in live_connection_source
        or "Task SDK callAction() probe requires action name when task id is provided" not in live_connection_source
        or "Task SDK callAction() probe options must match TaskContext ActionCallOptions" not in live_connection_source
        or "not _sdk_task_action_call_options(task_call_action_options)" not in live_connection_source
        or 'adapter.call_task_sdk(\n                    task_call_action_task,\n                    "callAction",' not in live_connection_source
        or "live Arinova task callAction OK: " not in live_connection_source
        or "live Arinova smoke OK: connected agent_id=" not in live_connection_source
    )
    live_credential_gate_contract_count = 1
    live_credential_resolution_contract_count = 1
    live_gate_import_config_contract_count = 1
    live_gate_sdk_probe_contract_count = 1
    live_gate_probe_validation_contract_count = 1
    live_probe_strict_json_contracts = {
        "loader": (
            "def _loads_probe_json(raw: str) -> object:",
            "parse_constant=_reject_probe_json_constant",
            "object_pairs_hook=_reject_probe_duplicate_json_keys",
        ),
        "constant-error": (
            "JSON contains non-finite constant",
            "JSON contains non-finite constant: NaN",
            "bad callAction args non-finite live smoke",
            "bad task callAction args non-finite live smoke",
        ),
        "duplicate-key-error": (
            "JSON object contains duplicate key",
            "JSON object contains duplicate key: dryRun",
            "bad callAction options duplicate key live smoke",
            "bad task callAction options duplicate key live smoke",
        ),
        "agent-action-json": (
            "_loads_probe_json(call_action_args_json)",
            "_loads_probe_json(call_action_options_json)",
        ),
        "task-action-json": (
            "_loads_probe_json(task_call_action_args_json)",
            "_loads_probe_json(task_call_action_options_json)",
        ),
    }
    live_probe_strict_json_contract_missing = sorted(
        label
        for label, required in live_probe_strict_json_contracts.items()
        if any(
            token
            not in (
                live_connection_source
                if label in {"loader", "agent-action-json", "task-action-json"}
                else live_connection_source + live_connection_gate_source
            )
            for token in required
        )
    )
    if (
        "json.loads(call_action_args_json)" in live_connection_source
        or "json.loads(call_action_options_json)" in live_connection_source
        or "json.loads(task_call_action_args_json)" in live_connection_source
        or "json.loads(task_call_action_options_json)" in live_connection_source
    ):
        live_probe_strict_json_contract_missing.append("stale-action-json-loads")
    live_probe_strict_json_contract_count = len(live_probe_strict_json_contracts) - len(
        live_probe_strict_json_contract_missing
    )
    hermes_connection_contract_count = 4
    live_agent_sdk_call_missing = sorted((exposed - INTENTIONALLY_LOCAL) - live_agent_sdk_calls)
    live_agent_sdk_call_contract_count = len((exposed - INTENTIONALLY_LOCAL) & live_agent_sdk_calls)
    live_probe_identity_methods = {"getAgentId", "getOnboardingSeed"}
    live_probe_message_file_history_methods = {"sendMessage", "uploadFile", "fetchHistory"}
    live_probe_note_methods = {"listNotes", "createNote", "updateNote", "deleteNote", "shareNote"}
    live_probe_kanban_methods = {
        "listBoards",
        "createCard",
        "updateCard",
        "createBoard",
        "updateBoard",
        "archiveBoard",
        "listColumns",
        "createColumn",
        "updateColumn",
        "deleteColumn",
        "reorderColumns",
        "listCards",
        "completeCard",
        "listArchivedCards",
        "addCardCommit",
        "listCardCommits",
        "linkCardNote",
        "unlinkCardNote",
        "listCardNotes",
        "listLabels",
        "createLabel",
        "updateLabel",
        "deleteLabel",
        "addCardLabel",
        "removeCardLabel",
    }
    live_probe_memory_skill_methods = {"queryMemory", "fetchSkillPrompt"}
    live_probe_telemetry_action_methods = {"sendTelemetry", "sendHud", "sendTaskUpdate", "reportToolCall", "callAction"}
    live_probe_category_members = (
        live_probe_identity_methods
        | live_probe_message_file_history_methods
        | live_probe_note_methods
        | live_probe_kanban_methods
        | live_probe_memory_skill_methods
        | live_probe_telemetry_action_methods
    )
    live_probe_category_drift = {}
    live_probe_target_methods = exposed - INTENTIONALLY_LOCAL
    if live_probe_target_methods - live_probe_category_members:
        live_probe_category_drift["uncategorized"] = sorted(live_probe_target_methods - live_probe_category_members)
    if live_probe_category_members - live_probe_target_methods:
        live_probe_category_drift["stale"] = sorted(live_probe_category_members - live_probe_target_methods)
    live_probe_identity_contract_count = len(live_probe_identity_methods)
    live_probe_message_file_history_contract_count = len(live_probe_message_file_history_methods)
    live_probe_note_contract_count = len(live_probe_note_methods)
    live_probe_kanban_contract_count = len(live_probe_kanban_methods)
    live_probe_memory_skill_contract_count = len(live_probe_memory_skill_methods)
    live_probe_telemetry_action_contract_count = len(live_probe_telemetry_action_methods)
    live_gate_sdk_assertion_methods = set(re.findall(r'"method": "([A-Za-z0-9_]+)"', live_connection_gate_source))
    live_gate_sdk_assertion_missing = sorted(live_probe_target_methods - live_gate_sdk_assertion_methods)
    live_gate_sdk_assertion_category_drift = {}
    if live_gate_sdk_assertion_methods - live_probe_category_members:
        live_gate_sdk_assertion_category_drift["uncategorized"] = sorted(
            live_gate_sdk_assertion_methods - live_probe_category_members
        )
    if live_probe_category_members - live_gate_sdk_assertion_methods:
        live_gate_sdk_assertion_category_drift["missing"] = sorted(
            live_probe_category_members - live_gate_sdk_assertion_methods
        )
    live_gate_sdk_assertion_contract_count = len(
        live_probe_target_methods & live_gate_sdk_assertion_methods
    )
    live_gate_assertion_identity_contract_count = len(live_probe_identity_methods & live_gate_sdk_assertion_methods)
    live_gate_assertion_message_file_history_contract_count = len(
        live_probe_message_file_history_methods & live_gate_sdk_assertion_methods
    )
    live_gate_assertion_note_contract_count = len(live_probe_note_methods & live_gate_sdk_assertion_methods)
    live_gate_assertion_kanban_contract_count = len(live_probe_kanban_methods & live_gate_sdk_assertion_methods)
    live_gate_assertion_memory_skill_contract_count = len(
        live_probe_memory_skill_methods & live_gate_sdk_assertion_methods
    )
    live_gate_assertion_telemetry_action_contract_count = len(
        live_probe_telemetry_action_methods & live_gate_sdk_assertion_methods
    )
    live_return_identity_contracts = {
        "updateNote": (
            "SDK updateNote() returned mismatched note id",
            "ARINOVA_FAKE_MISMATCH_UPDATE_NOTE_ID",
            "mismatch updateNote id live smoke",
        ),
        "updateBoard": (
            "SDK updateBoard() returned mismatched board id",
            "ARINOVA_FAKE_MISMATCH_UPDATE_BOARD_ID",
            "mismatch updateBoard id live smoke",
        ),
        "updateCard": (
            "SDK updateCard() returned mismatched card id",
            "ARINOVA_FAKE_MISMATCH_UPDATE_CARD_ID",
            "mismatch updateCard id live smoke",
        ),
        "completeCard": (
            "SDK completeCard() returned mismatched card id",
            "ARINOVA_FAKE_MISMATCH_COMPLETE_CARD_ID",
            "mismatch completeCard id live smoke",
        ),
        "createColumn": (
            "SDK createColumn() returned mismatched board id",
            "ARINOVA_FAKE_MISMATCH_CREATE_COLUMN_BOARD_ID",
            "mismatch createColumn board id live smoke",
        ),
        "updateColumn": (
            "SDK updateColumn() returned mismatched column id",
            "ARINOVA_FAKE_MISMATCH_UPDATE_COLUMN_ID",
            "mismatch updateColumn id live smoke",
        ),
        "addCardCommit": (
            "SDK addCardCommit() returned mismatched card id",
            "ARINOVA_FAKE_MISMATCH_ADD_CARD_COMMIT_CARD_ID",
            "mismatch addCardCommit card id live smoke",
        ),
        "createLabel": (
            "SDK createLabel() returned mismatched board id",
            "ARINOVA_FAKE_MISMATCH_CREATE_LABEL_BOARD_ID",
            "mismatch createLabel board id live smoke",
        ),
        "updateLabel": (
            "SDK updateLabel() returned mismatched label id",
            "ARINOVA_FAKE_MISMATCH_UPDATE_LABEL_ID",
            "mismatch updateLabel id live smoke",
        ),
        "callAction": (
            "SDK callAction() returned mismatched call id",
            "ARINOVA_FAKE_MISMATCH_CALL_ACTION_CALL_ID",
            "mismatch callAction call id live smoke",
        ),
        "task.callAction": (
            "Task SDK callAction() returned mismatched call id",
            "ARINOVA_FAKE_MISMATCH_TASK_CALL_ACTION_CALL_ID",
            "mismatch task callAction call id live smoke",
        ),
    }
    live_return_identity_contract_missing = sorted(
        method
        for method, (live_error, gate_env, gate_label) in live_return_identity_contracts.items()
        if (
            "def _expect_sdk_field(value: object, field: str, expected: str, message: str) -> None:" not in live_connection_source
            or live_error not in live_connection_source
            or gate_env not in live_connection_gate_source
            or live_error not in live_connection_gate_source
            or gate_label not in live_connection_gate_source
        )
    )
    live_return_identity_contract_count = len(live_return_identity_contracts) - len(
        live_return_identity_contract_missing
    )
    live_action_result_correlation_contracts = {
        "callAction.dryRun": (
            "SDK callAction() returned mismatched dryRun",
            "ARINOVA_FAKE_MISMATCH_CALL_ACTION_DRY_RUN",
            "mismatch callAction dryRun live smoke",
        ),
        "task.callAction.dryRun": (
            "Task SDK callAction() returned mismatched dryRun",
            "ARINOVA_FAKE_MISMATCH_TASK_CALL_ACTION_DRY_RUN",
            "mismatch task callAction dryRun live smoke",
        ),
        "callAction.statusPayload": (
            "SDK callAction() returned inconsistent action result",
            "ARINOVA_FAKE_INCONSISTENT_SUCCESS_CALL_ACTION",
            "inconsistent success callAction live smoke",
        ),
        "callAction.errorStatusPayload": (
            "SDK callAction() returned inconsistent action result",
            "ARINOVA_FAKE_INCONSISTENT_ERROR_CALL_ACTION",
            "inconsistent error callAction live smoke",
        ),
        "callAction.confirmationStatusPayload": (
            "SDK callAction() returned inconsistent action result",
            "ARINOVA_FAKE_INCONSISTENT_CONFIRMATION_CALL_ACTION",
            "inconsistent confirmation callAction live smoke",
        ),
        "callAction.cancelledStatusPayload": (
            "SDK callAction() returned inconsistent action result",
            "ARINOVA_FAKE_INCONSISTENT_CANCELLED_CALL_ACTION",
            "inconsistent cancelled callAction live smoke",
        ),
        "task.callAction.statusPayload": (
            "Task SDK callAction() returned inconsistent action result",
            "ARINOVA_FAKE_INCONSISTENT_TASK_SUCCESS_CALL_ACTION",
            "inconsistent task success callAction live smoke",
        ),
        "task.callAction.errorStatusPayload": (
            "Task SDK callAction() returned inconsistent action result",
            "ARINOVA_FAKE_INCONSISTENT_TASK_ERROR_CALL_ACTION",
            "inconsistent task error callAction live smoke",
        ),
        "task.callAction.confirmationStatusPayload": (
            "Task SDK callAction() returned inconsistent action result",
            "ARINOVA_FAKE_INCONSISTENT_TASK_CONFIRMATION_CALL_ACTION",
            "inconsistent task confirmation callAction live smoke",
        ),
        "task.callAction.cancelledStatusPayload": (
            "Task SDK callAction() returned inconsistent action result",
            "ARINOVA_FAKE_INCONSISTENT_TASK_CANCELLED_CALL_ACTION",
            "inconsistent task cancelled callAction live smoke",
        ),
    }
    live_action_result_correlation_contract_missing = sorted(
        label
        for label, (live_error, gate_env, gate_label) in live_action_result_correlation_contracts.items()
        if (
            "def _expect_sdk_optional_field(value: object, field: str, expected: object, message: str) -> None:" not in live_connection_source
            or "def _sdk_action_result_status_payload(value: object) -> bool:" not in live_connection_source
            or live_error not in live_connection_source
            or gate_env not in live_connection_gate_source
            or live_error not in live_connection_gate_source
            or gate_label not in live_connection_gate_source
        )
    )
    live_action_result_correlation_contract_count = len(live_action_result_correlation_contracts) - len(
        live_action_result_correlation_contract_missing
    )
    live_task_helper_probe_methods = {"uploadFile", "fetchHistory", "callAction"}
    live_task_helper_probe_stale = sorted(live_task_helper_probe_methods - exposed_task)
    live_task_helper_gate_assertion_methods = set(
        re.findall(
            r'"taskId":\s*"[^"]+"[\s\S]{0,400}?"method":\s*"([A-Za-z0-9_]+)"',
            live_connection_gate_source,
        )
    )
    live_task_helper_gate_assertion_missing = sorted(
        live_task_helper_probe_methods - live_task_helper_gate_assertion_methods
    )
    live_task_helper_probe_contract_count = len(live_task_helper_probe_methods)
    live_task_helper_gate_assertion_contract_count = len(
        live_task_helper_probe_methods & live_task_helper_gate_assertion_methods
    )
    python_task_handler_check_missing = sorted(exposed_task - python_task_handler_check_calls)
    env_enablement_coverage_missing = (
        "env_enablement enabled Arinova without required credentials" not in hermes_plugin_load_source
        or '"home_channel": {"chat_id": "arinova", "name": "Arinova Chat"}' not in hermes_plugin_load_source
        or '"home_channel": {"chat_id": "conv-env", "name": "Env Home"}' not in hermes_plugin_load_source
    )
    env_enablement_contract_count = 1
    hermes_platform_metadata_coverage_missing = (
        "def assert_platform_metadata(platform_entry) -> None:" not in hermes_plugin_load_source
        or "Arinova platform source drifted" not in hermes_plugin_load_source
        or "Arinova platform plugin_name drifted" not in hermes_plugin_load_source
        or "Arinova platform required_env drifted" not in hermes_plugin_load_source
        or "Arinova allowed users env drifted" not in hermes_plugin_load_source
        or "Arinova allow-all env drifted" not in hermes_plugin_load_source
        or "Arinova install hint drifted" not in hermes_plugin_load_source
        or "Arinova platform hint drifted" not in hermes_plugin_load_source
        or "assert_platform_metadata(platform_entry)" not in hermes_plugin_load_source
        or "def assert_platform_registry_factory(platform_registry, module, platform_config) -> None:" not in hermes_plugin_load_source
        or "platform_registry.create_adapter(\"arinova\", valid_config)" not in hermes_plugin_load_source
        or "Arinova platform registry factory returned unexpected adapter" not in hermes_plugin_load_source
        or "Arinova platform registry factory did not preserve PlatformConfig object" not in hermes_plugin_load_source
        or "Arinova platform registry factory did not hydrate adapter credentials" not in hermes_plugin_load_source
        or "Arinova platform registry factory accepted missing credentials" not in hermes_plugin_load_source
        or "Arinova platform registry created adapter for an unregistered platform" not in hermes_plugin_load_source
        or "assert_platform_registry_factory(platform_registry, loaded.module, PlatformConfig)" not in hermes_plugin_load_source
    )
    hermes_platform_metadata_contract_count = 1
    hermes_platform_factory_contract_count = 1
    config_callback_coverage_missing = (
        "arinova validate_config callback was not registered" not in hermes_plugin_load_source
        or "arinova is_connected callback was not registered" not in hermes_plugin_load_source
        or "Arinova config callbacks accepted missing credentials" not in hermes_plugin_load_source
        or "Arinova config callbacks accepted blank env credentials" not in hermes_plugin_load_source
        or "blank env credentials shadowed YAML extra credentials" not in hermes_plugin_load_source
        or "Arinova platform callbacks rejected YAML extra credentials" not in hermes_plugin_load_source
        or "Arinova module callbacks rejected YAML agent_skills list" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted non-array YAML agent_skills_json" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted duplicate-key YAML agent_skills_json" not in hermes_plugin_load_source
        or "Arinova platform callbacks accepted non-finite YAML agent_skills_json" not in hermes_plugin_load_source
        or "Arinova platform callbacks accepted malformed YAML agent_skills list" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted duplicate YAML agent_skills ids" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted unsupported YAML agent_skills field" not in hermes_plugin_load_source
        or "Arinova platform callbacks accepted blank YAML agent_skills id" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted non-finite YAML agent_skills list" not in hermes_plugin_load_source
        or "Arinova module callbacks rejected ARINOVA_AGENT_SKILLS alias" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted malformed ARINOVA_AGENT_SKILLS alias" not in hermes_plugin_load_source
        or "Arinova platform callbacks accepted duplicate ARINOVA_AGENT_SKILLS alias ids" not in hermes_plugin_load_source
        or "Arinova platform callbacks accepted unsupported ARINOVA_AGENT_SKILLS alias field"
        not in hermes_plugin_load_source
        or "Arinova module callbacks accepted malformed env agent skills" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted invalid YAML concurrency_mode" not in hermes_plugin_load_source
        or "Arinova platform callbacks accepted invalid YAML agent_concurrency_mode" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted invalid YAML numeric SDK option" not in hermes_plugin_load_source
        or "Arinova platform callbacks accepted invalid env numeric option" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted boolean YAML numeric option" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted plus-signed YAML numeric option" not in hermes_plugin_load_source
        or "Arinova module callbacks accepted invalid env concurrency mode" not in hermes_plugin_load_source
        or 'default_adapter.concurrency_mode != "per-conversation"' not in hermes_plugin_load_source
        or "adapter default concurrency mode drifted from SDK per-conversation default" not in hermes_plugin_load_source
        or "Arinova platform callbacks rejected PlatformConfig.token credentials" not in hermes_plugin_load_source
        or "Arinova platform callbacks rejected env credentials" not in hermes_plugin_load_source
        or "YAML bridge wrote blank Arinova credentials into env" not in hermes_plugin_load_source
        or "YAML bridge wrote blank ARINOVA_NODE_BIN into env" not in hermes_plugin_load_source
        or "normalized = _csv(value).strip()" not in plugin_source
        or "if not normalized:" not in plugin_source
        or "CONCURRENCY_MODES" not in adapter_source
        or "NONNEGATIVE_INT_SETTINGS" not in adapter_source
        or "def _first_nonempty_str" not in adapter_source
        or "_first_nonempty_str(os.getenv(\"ARINOVA_SERVER_URL\"), extra.get(\"server_url\"))" not in adapter_source
        or "_first_nonempty_str(os.getenv(\"ARINOVA_BOT_TOKEN\"), cfg.token, extra.get(\"bot_token\"))" not in adapter_source
        or "def _parse_nonnegative_int" not in adapter_source
        or "normalized.isdecimal()" not in adapter_source
        or "_concurrency_mode_setting" not in adapter_source
        or 'or "per-conversation"' not in adapter_source
        or "_valid_agent_skills_setting" not in adapter_source
        or "_agent_skills_raw_setting" not in adapter_source
        or "json.dumps(raw, allow_nan=False) if raw not in (None, \"\") else \"\"" not in adapter_source
        or "parse_constant=_reject_json_constant" not in adapter_source
        or "object_pairs_hook=_reject_duplicate_json_keys" not in adapter_source
        or "skill_ids: set[str] = set()" not in adapter_source
        or 'set(skill) - {"id", "name", "description"}' not in adapter_source
        or "_valid_nonnegative_int_settings" not in adapter_source
        or '"sidecar_bind": "127.0.0.2"' not in hermes_plugin_load_source
        or '"adapter_bind": "127.0.0.3"' not in hermes_plugin_load_source
        or '"agent_sdk_root": "/tmp/hermes-arinova-agent-sdk-root"' not in hermes_plugin_load_source
        or 'adapter.sidecar_host != "127.0.0.2"' not in hermes_plugin_load_source
        or 'adapter.bind_host != "127.0.0.3"' not in hermes_plugin_load_source
        or 'adapter.agent_sdk_root != "/tmp/hermes-arinova-agent-sdk-root"' not in hermes_plugin_load_source
        or "control_max_body_bytes" not in hermes_plugin_load_source
        or "ARINOVA_CONTROL_MAX_BODY_BYTES" not in hermes_plugin_load_source
        or "adapter coerced boolean YAML numeric config into required integer settings" not in hermes_plugin_load_source
        or "boolean optional SDK timing config leaked into sidecar env" not in hermes_plugin_load_source
        or "adapter accepted float YAML numeric config for required integer settings" not in hermes_plugin_load_source
        or "adapter accepted plus-signed env numeric config for required integer settings" not in hermes_plugin_load_source
        or "plus-signed optional SDK timing config leaked into sidecar env" not in hermes_plugin_load_source
        or "adapter did not JSON-normalize parsed agent_skills_json list for sidecar env" not in hermes_plugin_load_source
        or "adapter did not normalize ARINOVA_AGENT_SKILLS alias over config extras in sidecar env" not in hermes_plugin_load_source
    )
    config_callback_contract_count = 1
    hermes_registry_schema_coverage_missing = (
        "def assert_registry_schemas(registry, module, expected_tools: set[str])" not in hermes_plugin_load_source
        or "registry.get_definitions(\n            expected_tools" not in hermes_plugin_load_source
        or "set(by_name) != expected_tools" not in hermes_plugin_load_source
        or "def expected_tool_schemas(module)" not in hermes_plugin_load_source
        or "Hermes plugin schema parameters drifted from generated schema" not in hermes_plugin_load_source
        or "definition_by_name = assert_registry_schemas(registry, loaded.module, expected_tools)" not in hermes_plugin_load_source
        or "def assert_registry_toolset_index(registry, expected_tools: set[str]) -> None:" not in hermes_plugin_load_source
        or 'registry.get_tool_names_for_toolset("hermes-arinova")' not in hermes_plugin_load_source
        or "registry.get_tool_to_toolset_map()" not in hermes_plugin_load_source
        or "registry.get_available_toolsets()" not in hermes_plugin_load_source
        or "Hermes plugin registry toolset index did not match manifest tools" not in hermes_plugin_load_source
        or "Hermes plugin available toolset metadata did not expose manifest tools" not in hermes_plugin_load_source
        or "assert_registry_toolset_index(registry, expected_tools)" not in hermes_plugin_load_source
        or "def assert_model_tools_enabled_toolset(module, expected_tools: set[str]) -> None:" not in hermes_plugin_load_source
        or 'get_tool_definitions(\n            enabled_toolsets=["hermes-arinova"]' not in hermes_plugin_load_source
        or "invalidate_check_fn_cache()" not in hermes_plugin_load_source
        or "Hermes model_tools enabled_toolsets did not expose manifest Arinova tools" not in hermes_plugin_load_source
        or "tool_search.ToolSearchConfig(" not in hermes_plugin_load_source
        or 'enabled="on"' not in hermes_plugin_load_source
        or '"tool_search"' not in hermes_plugin_load_source
        or '"tool_describe"' not in hermes_plugin_load_source
        or '"tool_call"' not in hermes_plugin_load_source
        or "Hermes model_tools tool_call did not block out-of-scope Arinova bridge call" not in hermes_plugin_load_source
        or "Hermes model_tools Tool Search did not defer Arinova tools" not in hermes_plugin_load_source
        or "Hermes tool_search did not surface arinova_send_message" not in hermes_plugin_load_source
        or "Hermes tool_describe did not expose arinova_send_message schema" not in hermes_plugin_load_source
        or "assert_model_tools_enabled_toolset(loaded.module, expected_tools)" not in hermes_plugin_load_source
        or "def assert_real_agent_init_enabled_toolset(module, expected_tools: set[str]) -> None:" not in hermes_plugin_load_source
        or "agent = run_agent.AIAgent(" not in hermes_plugin_load_source
        or 'enabled_toolsets=["hermes-arinova"]' not in hermes_plugin_load_source
        or "ssl_guard.verify_ca_bundle_with_fallback = lambda: None" not in hermes_plugin_load_source
        or "Hermes AIAgent init did not expose Tool Search bridge tools" not in hermes_plugin_load_source
        or "Hermes AIAgent init leaked direct Arinova tools with Tool Search enabled" not in hermes_plugin_load_source
        or "Hermes AIAgent init valid_tool_names missed bridge tools" not in hermes_plugin_load_source
        or "Hermes AIAgent init tool_search could not find Arinova tool" not in hermes_plugin_load_source
        or "assert_real_agent_init_enabled_toolset(loaded.module, expected_tools)" not in hermes_plugin_load_source
        or "expected_upload_schema = loaded.module.arinova_tools.UPLOAD_FILE_SCHEMA" not in hermes_plugin_load_source
        or "upload file schema did not expose base64/path alternatives" not in hermes_plugin_load_source
        or 'required_sets != {("base64",), ("path",)}' not in hermes_plugin_load_source
        or 'upload_entry = registry.get_entry("arinova_upload_file")' not in hermes_plugin_load_source
        or 'registry.get_entry("arinova_sdk_call").handler' not in hermes_plugin_load_source
        or 'task_upload_entry = registry.get_entry("arinova_task_upload_file")' not in hermes_plugin_load_source
        or 'registry.get_entry("arinova_task_call").handler' not in hermes_plugin_load_source
        or '"file": {"base64": "R0E="}' not in hermes_plugin_load_source
        or '"file": {"base64": "SGk="}' not in hermes_plugin_load_source
        or '"file": {"base64": "R0k="}' not in hermes_plugin_load_source
        or '"file": {"base64": "IQ=="}' not in hermes_plugin_load_source
        or "non_object_payload_errors" not in hermes_plugin_load_source
        or "Hermes plugin registry dispatch did not reject non-object tool payloads" not in hermes_plugin_load_source
        or "Hermes plugin registry dispatch did not route expected SDK calls" not in hermes_plugin_load_source
        or "Hermes plugin registry dispatch did not preserve no-conversation task guard" not in hermes_plugin_load_source
        or "taskKind=cron_wakeup" not in hermes_plugin_load_source
        or "from agent import agent_runtime_helpers" not in hermes_plugin_load_source
        or "agent_runtime_helpers._ra = lambda: model_tools" not in hermes_plugin_load_source
        or "agent_runtime_helpers.invoke_tool(" not in hermes_plugin_load_source
        or "Hermes plugin agent runtime invoke did not preserve positional argument bound error" not in hermes_plugin_load_source
        or "args for sendMessage requires at least 2 item(s)" not in hermes_plugin_load_source
        or 'sys.modules.setdefault("httpx", types.ModuleType("httpx"))' not in hermes_plugin_load_source
        or 'sys.modules.setdefault("requests", types.ModuleType("requests"))' not in hermes_plugin_load_source
        or "import run_agent" not in hermes_plugin_load_source
        or "from agent import tool_executor" not in hermes_plugin_load_source
        or "run_agent.AIAgent._invoke_tool(" not in hermes_plugin_load_source
        or "tool_executor.execute_tool_calls_sequential(" not in hermes_plugin_load_source
        or "tool_executor.execute_tool_calls_concurrent(" not in hermes_plugin_load_source
        or "tool_executor._ra = lambda: model_tools" not in hermes_plugin_load_source
        or "previous_agent_runtime_ra = agent_runtime_helpers._ra" not in hermes_plugin_load_source
        or "Hermes plugin tool_executor did not preserve bridge argument object error" not in hermes_plugin_load_source
        or "Hermes plugin concurrent tool_executor did not preserve bridge argument object error" not in hermes_plugin_load_source
        or "tool_call 'arguments' must be an object" not in hermes_plugin_load_source
        or "class OutOfScopeToolExecutorAgent" not in hermes_plugin_load_source
        or "Hermes plugin tool_executor did not block out-of-scope Arinova bridge call" not in hermes_plugin_load_source
        or "Hermes plugin concurrent tool_executor did not block out-of-scope Arinova bridge call" not in hermes_plugin_load_source
        or "_tool_worker_threads_lock = threading.Lock()" not in hermes_plugin_load_source
        or 'enabled_toolsets = ["hermes-arinova"]' not in hermes_plugin_load_source
        or '"tool_call"' not in hermes_plugin_load_source
        or "hello from Hermes tool_call bridge" not in hermes_plugin_load_source
        or "hello from Hermes tool executor bridge" not in hermes_plugin_load_source
        or "hello from Hermes concurrent tool executor bridge" not in hermes_plugin_load_source
        or "Hermes plugin tool_call bridge invoke failed" not in hermes_plugin_load_source
        or "Hermes plugin agent runtime invoke did not route expected SDK call" not in hermes_plugin_load_source
        or "Hermes plugin tool_executor did not unwrap tool_call through enabled Arinova toolset" not in hermes_plugin_load_source
        or "Hermes plugin concurrent tool_executor did not unwrap tool_call through enabled Arinova toolset" not in hermes_plugin_load_source
        or '"arinova_send_message",' not in hermes_plugin_load_source
        or '"arinova_sdk_call", "arinova_task_call", "arinova_send_message"' in hermes_plugin_load_source
    )
    hermes_registry_schema_contract_count = 1
    hermes_agent_runtime_bridge_contract_count = 1
    hermes_agent_init_contract_count = 1
    hermes_tool_search_bridge_contract_count = 1
    hermes_python_guard_missing = sorted(
        name
        for name, source in {
            "scripts/check_gateway_config_load.py": gateway_config_source,
            "scripts/check_hermes_plugin_load.py": hermes_plugin_load_source,
            "scripts/check_user_install.py": user_install_source,
            "scripts/check_clean_install.py": clean_install_source,
            "scripts/check_live_connection.py": live_connection_source,
        }.items()
        if "def require_hermes_python()" not in source or "Python 3.10+" not in source
    )
    hermes_python_guard_contract_count = 5
    readme_live_gate_drift = (
        "sidecar `/healthz`" not in readme_source
        or "`ok: true`" not in readme_source
        or "`connected: true`" not in readme_source
        or "`agentId` matching SDK `getAgentId()`" not in readme_source
        or "SDK `getAgentId()`" not in readme_source
        or "SDK `getOnboardingSeed()`" not in readme_source
        or "SDK `sendTelemetry()`" not in readme_source
        or "Credentialed live probes exercise global `ArinovaAgent` methods" not in readme_source
        or "`TaskContext` helpers usually require an active inbound Arinova task" not in readme_source
        or "covered by the sidecar runtime/e2e checks" not in readme_source
        or "`--task-fetch-history-task <task-id>`" not in readme_source
        or "`--task-upload-file-task <task-id>`" not in readme_source
        or "`--task-call-action-task <task-id>`" not in readme_source
        or "`--task-call-action <action-name>`" not in readme_source
        or "task-scoped SDK\n`fetchHistory()`" not in readme_source
        or "task-scoped SDK\n`uploadFile()`" not in readme_source
        or "task-scoped SDK `callAction()`" not in readme_source
        or "through the plugin's `/task-sdk` bridge" not in readme_source
        or "`taskId`, `conversationId`, and `messageId`" not in readme_source
        or "`TaskContext.callAction()` derives those from the task" not in readme_source
        or "`--skip-telemetry`" not in readme_source
        or "`--send-telemetry-event <event-name>`" not in readme_source
        or "`--send-telemetry-json '<json-object>'`" not in readme_source
        or "those custom telemetry flags cannot be combined with\n`--skip-telemetry`" not in readme_source
        or "`--send-hud-json '<json-object>'`" not in readme_source
        or "`--send-hud-conversation <conversation-id>`" not in readme_source
        or "conversation-scoped SDK `sendHud()` overload" not in readme_source
        or "it must be paired with\n`--send-hud-json`" not in readme_source
        or "SDK `sendHud()`" not in readme_source
        or "`--send-task-update-json '<json-object>'`" not in readme_source
        or "SDK `sendTaskUpdate()`" not in readme_source
        or "`--report-tool-call-json '<json-object>'`" not in readme_source
        or "SDK `reportToolCall()`" not in readme_source
        or "`--query-memory-json '<json-object>'`" not in readme_source
        or "SDK `queryMemory()`" not in readme_source
        or "`--fetch-skill-prompt <skill-slug>`" not in readme_source
        or "SDK `fetchSkillPrompt()`" not in readme_source
        or "`--list-boards`" not in readme_source
        or "SDK `listBoards()`" not in readme_source
        or "`--list-cards-json '<json-object>'`" not in readme_source
        or "SDK `listCards()`" not in readme_source
        or "`--list-notes-conversation <conversation-id>`" not in readme_source
        or "SDK `listNotes()`" not in readme_source
        or "`--list-notes-options-json`" not in readme_source
        or "`--list-notes-options-json` requires\n`--list-notes-conversation`" not in readme_source
        or "`--list-columns-board <board-id>`" not in readme_source
        or "SDK `listColumns()`" not in readme_source
        or "`--list-labels-board <board-id>`" not in readme_source
        or "SDK `listLabels()`" not in readme_source
        or "`--list-archived-cards-board <board-id>`" not in readme_source
        or "SDK `listArchivedCards()`" not in readme_source
        or "`--list-archived-cards-options-json`" not in readme_source
        or "`--list-archived-cards-options-json` requires `--list-archived-cards-board`" not in readme_source
        or "`--list-card-commits-card <card-id>`" not in readme_source
        or "SDK `listCardCommits()`" not in readme_source
        or "`--list-card-notes-card <card-id>`" not in readme_source
        or "SDK `listCardNotes()`" not in readme_source
        or "`--share-note-conversation <conversation-id>`" not in readme_source
        or "`--share-note-id <note-id>`" not in readme_source
        or "SDK `shareNote()`" not in readme_source
        or "`--create-note-conversation <conversation-id>`" not in readme_source
        or "`--create-note-body-json '<json-object>'`" not in readme_source
        or "SDK `createNote()`" not in readme_source
        or "`--update-note-conversation <conversation-id>`" not in readme_source
        or "`--update-note-id <note-id>`" not in readme_source
        or "`--update-note-body-json '<json-object>'`" not in readme_source
        or "SDK `updateNote()`" not in readme_source
        or "`--delete-note-conversation <conversation-id>`" not in readme_source
        or "`--delete-note-id <note-id>`" not in readme_source
        or "SDK `deleteNote()`" not in readme_source
        or "`--create-board-body-json '<json-object>'`" not in readme_source
        or "SDK `createBoard()`" not in readme_source
        or "`--update-board-id <board-id>`" not in readme_source
        or "`--update-board-body-json '<json-object>'`" not in readme_source
        or "SDK `updateBoard()`" not in readme_source
        or "`--archive-board-id <board-id>`" not in readme_source
        or "SDK `archiveBoard()`" not in readme_source
        or "`--create-card-body-json '<json-object>'`" not in readme_source
        or "SDK `createCard()`" not in readme_source
        or "`--update-card-id <card-id>`" not in readme_source
        or "`--update-card-body-json '<json-object>'`" not in readme_source
        or "SDK `updateCard()`" not in readme_source
        or "`--complete-card-id <card-id>`" not in readme_source
        or "SDK `completeCard()`" not in readme_source
        or "`--create-column-board <board-id>`" not in readme_source
        or "`--create-column-body-json '<json-object>'`" not in readme_source
        or "SDK `createColumn()`" not in readme_source
        or "`--update-column-id <column-id>`" not in readme_source
        or "`--update-column-body-json '<json-object>'`" not in readme_source
        or "SDK `updateColumn()`" not in readme_source
        or "`--delete-column-id <column-id>`" not in readme_source
        or "SDK `deleteColumn()`" not in readme_source
        or "`--reorder-columns-board <board-id>`" not in readme_source
        or "`--reorder-columns-json '<json-array>'`" not in readme_source
        or "SDK `reorderColumns()`" not in readme_source
        or "`--add-card-commit-card <card-id>`" not in readme_source
        or "`--add-card-commit-body-json '<json-object>'`" not in readme_source
        or "SDK `addCardCommit()`" not in readme_source
        or "`--link-card-note-card <card-id>`" not in readme_source
        or "`--link-card-note-note <note-id>`" not in readme_source
        or "SDK `linkCardNote()`" not in readme_source
        or "`--unlink-card-note-card <card-id>`" not in readme_source
        or "`--unlink-card-note-note <note-id>`" not in readme_source
        or "SDK `unlinkCardNote()`" not in readme_source
        or "`--create-label-board <board-id>`" not in readme_source
        or "`--create-label-body-json '<json-object>'`" not in readme_source
        or "SDK `createLabel()`" not in readme_source
        or "`--update-label-id <label-id>`" not in readme_source
        or "`--update-label-body-json '<json-object>'`" not in readme_source
        or "SDK `updateLabel()`" not in readme_source
        or "`--delete-label-id <label-id>`" not in readme_source
        or "SDK `deleteLabel()`" not in readme_source
        or "`--add-card-label-card <card-id>`" not in readme_source
        or "`--add-card-label-label <label-id>`" not in readme_source
        or "SDK `addCardLabel()`" not in readme_source
        or "`--remove-card-label-card <card-id>`" not in readme_source
        or "`--remove-card-label-label <label-id>`" not in readme_source
        or "SDK `removeCardLabel()`" not in readme_source
        or "`--send-message-conversation <conversation-id>`" not in readme_source
        or "Custom `--send-message-content` requires `--send-message-conversation`" not in readme_source
        or "SDK `sendMessage()`" not in readme_source
        or "`--fetch-history-conversation <conversation-id>`" not in readme_source
        or "SDK `fetchHistory()`" not in readme_source
        or "`--fetch-history-limit`" not in readme_source
        or "`--fetch-history-options-json '<json-object>'`" not in readme_source
        or "full SDK `FetchHistoryOptions` pagination fields" not in readme_source
        or "Both history option flags\nrequire `--fetch-history-conversation`" not in readme_source
        or "`--upload-file-conversation <conversation-id>`" not in readme_source
        or "SDK `uploadFile()`" not in readme_source
        or "`--upload-file-path`" not in readme_source
        or "must point to an existing local file" not in readme_source
        or "must be paired with\n`--upload-file-conversation`" not in readme_source
        or "those metadata flags\nalso require `--upload-file-conversation`" not in readme_source
        or "File upload calls in the sidecar control API pass bytes as base64" not in readme_source
        or "Hermes tool calls also accept a local file path" not in readme_source
        or '"file": {"path": "/absolute/path/hello.txt"}' not in readme_source
        or "`--call-action <action-name>`" not in readme_source
        or "SDK `callAction()`" not in readme_source
        or "`--call-action-args-json`" not in readme_source
        or "`--call-action-options-json`" not in readme_source
        or "Both call-action JSON flags require `--call-action`" not in readme_source
        or "`--task-fetch-history-limit`" not in readme_source
        or "`--task-fetch-history-options-json '<json-object>'`" not in readme_source
        or "Both task history option flags require\n`--task-fetch-history-task`" not in readme_source
        or "`--task-upload-file-path`" not in readme_source
        or "paired with `--task-upload-file-task`" not in readme_source
        or "`--task-upload-file-name`" not in readme_source
        or "`--task-upload-file-type`" not in readme_source
        or "`--task-call-action-args-json`" not in readme_source
        or "`--task-call-action-options-json`" not in readme_source
        or "Task call-action options accept `callId`, `parentCallId`, `reason`, `metadata`,\n`dryRun`, and `timeoutMs`" not in readme_source
        or "reject explicit `taskId`, `conversationId`, and\n`messageId` attribution fields" not in readme_source
        or "`dryRun: true`" not in readme_source
        or "`--require-credentials`" not in readme_source
        or "`--resolve-credentials-only`" not in readme_source
        or "The credentialed live smoke also verifies the bundled sidecar\n`@arinova-ai/agent-sdk` package against the selected `--sdk-root` checkout before\nopening the SDK websocket." not in readme_source
        or "Pass `--sdk-root` to\n`scripts/check_local.py`, `scripts/check_sdk_surface.py`, or\n`scripts/check_agent_sdk_source.py`" not in readme_source
        or "local SDK source files and installed package declarations are treated as\nauthoritative" not in readme_source
        or "README omissions\ndo not hide source-exported SDK methods, task helpers, events, options, or\ntypes" not in readme_source
        or "`scripts/check_local.py` runs the local gate" not in readme_source
        or "add `--require-credentials` to make real\nArinova connectivity mandatory for a release gate" not in readme_source
        or "preflights credential resolution before running the slower local checks" not in readme_source
        or "Hermes source clean; local\nagent-sdk source clean" not in readme_source
        or "does not patch either\nprotected source checkout" not in readme_source
        or "Hermes `config.yaml` credentials" not in readme_source
        or "environment credentials take precedence" not in readme_source
        or "missing keys after checking both environment variables and Hermes\n`config.yaml`" not in readme_source
        or "`ARINOVA_SERVER_URL`\nor only `ARINOVA_BOT_TOKEN`" not in readme_source
        or "partial credentials fail before Hermes or Arinova" not in readme_source
        or "`--hermes-root` import handling" not in readme_source
        or "optional send-telemetry, send-hud, send-task-update,\nreport-tool-call, query-memory, fetch-skill-prompt, list-boards, list-cards,\nlist-notes, list-columns, list-labels, list-archived-cards, list-card-commits,\nlist-card-notes, share-note, create-note, update-note, delete-note, create-board, update-board, archive-board, create-card, update-card, complete-card, create-column, update-column, delete-column, reorder-columns, add-card-commit, link-card-note, unlink-card-note, create-label, update-label, delete-label, add-card-label, remove-card-label, send-message, fetch-history, upload-file, call-action, task-fetch-history, task-upload-file, and task-call-action probes" not in readme_source
        or "python3.13 scripts/check_live_connection.py --hermes-root ~/hermes-agent" not in readme_source
        or "PYTHONPATH=~/hermes-agent python3.13 scripts/check_live_connection.py" in readme_source
    )
    user_install_contract_count = 1
    release_gate_documentation_contract_count = 1
    readme_check_snippets_missing = sorted(
        snippet for snippet in EXPECTED_README_CHECK_SNIPPETS if snippet not in readme_source
    )
    readme_surface_check_drift = (
        "serialized" not in readme_source
        or "`TaskContext` field shapes" not in readme_source
        or "exported type aliases" not in readme_source
        or "requiredness and broad type shapes" not in readme_source
        or "agent and task" not in readme_source
        or "SDK void return contract counts" not in readme_source
        or "SDK nullable return contract counts" not in readme_source
        or "SDK array return contract counts" not in readme_source
        or "SDK object return contract counts" not in readme_source
        or "SDK task void return contract counts" not in readme_source
        or "SDK task nullable return contract counts" not in readme_source
        or "SDK task array return contract counts" not in readme_source
        or "SDK task object return contract counts" not in readme_source
        or "SDK task required-parameter helper contract counts" not in readme_source
        or "SDK task optional-only helper contract counts" not in readme_source
        or "direct Hermes plugin loading" not in readme_source
        or "Hermes gateway config loading" not in readme_source
        or "enabled user install loading" not in readme_source
        or "clean install loading" not in readme_source
        or "runs\nthe copied gateway config-load smoke" not in readme_source
        or "Python 3.10+ interpreter with Hermes Python dependencies" not in readme_source
        or "`--hermes-python`" not in readme_source
        or "The SDK surface checker reports and enforces coverage for SDK constructor\noptions" not in readme_source
        or "helper parameter contract counts" not in readme_source
        or "HTTP-backed SDK method coverage counts" not in readme_source
        or "HTTP message/file/history method contract counts" not in readme_source
        or "HTTP note method contract counts" not in readme_source
        or "HTTP kanban method contract counts" not in readme_source
        or "HTTP memory and skill method contract counts" not in readme_source
        or "query option contract counts" not in readme_source
        or "HTTP return payload contract counts" not in readme_source
        or "HTTP backend behavior contract counts" not in readme_source
        or "HTTP upload MIME contract counts" not in readme_source
        or "HTTP return required-field contract counts" not in readme_source
        or "HTTP return shape contract counts" not in readme_source
        or "HTTP query option field contract counts" not in readme_source
        or "HTTP runtime method contract counts" not in readme_source
        or "HTTP runtime method order contract counts" not in readme_source
        or "HTTP error propagation contract counts" not in readme_source
        or "HTTP return required field contract counts" not in readme_source
        or "HTTP return shape field contract counts" not in readme_source
        or "HTTP return fixture field contract counts" not in readme_source
        or "sidecar runtime SDK method coverage" not in readme_source
        or "live SDK probe" not in readme_source
        or "live probe identity contract counts" not in readme_source
        or "live probe message/file/history contract counts" not in readme_source
        or "live probe note contract counts" not in readme_source
        or "live probe kanban contract counts" not in readme_source
        or "live probe memory and skill contract counts" not in readme_source
        or "live probe telemetry and action contract counts" not in readme_source
        or "live task helper probe contract counts" not in readme_source
        or "live credential gate contract counts" not in readme_source
        or "live gate assertion identity contract counts" not in readme_source
        or "live gate assertion message/file/history contract counts" not in readme_source
        or "live gate assertion note contract counts" not in readme_source
        or "live gate assertion kanban contract counts" not in readme_source
        or "live gate assertion memory and skill contract counts" not in readme_source
        or "live gate assertion telemetry and action contract counts" not in readme_source
        or "live task helper gate assertion contract counts" not in readme_source
        or "credential-gate" not in readme_source
        or "live validator contract" not in readme_source
        or "Hermes connection contract counts" not in readme_source
        or "Hermes tool schema contract counts" not in readme_source
        or "Hermes registry schema contract counts" not in readme_source
        or "Hermes platform metadata contract counts" not in readme_source
        or "Hermes platform factory contract counts" not in readme_source
        or "Hermes Python guard contract counts" not in readme_source
        or "env enablement contract counts" not in readme_source
        or "config callback contract counts" not in readme_source
        or "Python tool wrapper contract counts" not in readme_source
        or "tool report hook contract counts" not in readme_source
        or "SDK schema alignment contract counts" not in readme_source
        or "SDK schema field alignment contract counts" not in readme_source
        or "SDK schema requiredness alignment contract counts" not in readme_source
        or "SDK schema shape alignment contract counts" not in readme_source
        or "SDK install integrity contract counts" not in readme_source
        or "clean install contract counts" not in readme_source
        or "clean install YAML bridge contract counts" not in readme_source
        or "clean install platform callback contract counts" not in readme_source
        or "clean install platform metadata contract counts" not in readme_source
        or "clean install platform factory contract counts" not in readme_source
        or "clean install registry schema contract counts" not in readme_source
        or "clean install registry dispatch contract counts" not in readme_source
        or "clean install agent runtime/bridge invoke contract counts" not in readme_source
        or "clean install Tool Search bridge contract counts" not in readme_source
        or "clean install AIAgent init contract counts" not in readme_source
        or "clean install gateway runner toolset contract counts" not in readme_source
        or "clean install sidecar check contract counts" not in readme_source
        or "user install contract counts" not in readme_source
        or "user install YAML bridge contract counts" not in readme_source
        or "user install platform callback contract counts" not in readme_source
        or "user install platform metadata contract counts" not in readme_source
        or "user install platform factory contract counts" not in readme_source
        or "user install registry schema contract counts" not in readme_source
        or "user install registry dispatch contract counts" not in readme_source
        or "user install agent runtime/bridge invoke contract counts" not in readme_source
        or "user install Tool Search bridge contract counts" not in readme_source
        or "user install AIAgent init contract counts" not in readme_source
        or "user install gateway runner toolset contract counts" not in readme_source
        or "user install sidecar check contract counts" not in readme_source
        or "gateway config contract counts" not in readme_source
        or "gateway runner toolset contract counts" not in readme_source
        or "Hermes agent runtime/bridge invoke contract counts" not in readme_source
        or "Hermes Tool Search bridge contract counts" not in readme_source
        or "Hermes AIAgent init contract counts" not in readme_source
        or "sidecar SDK lockfile contract counts" not in readme_source
        or "duplicate-key scanner contract counts" not in readme_source
        or "manifest skill contract counts" not in readme_source
        or "adapter behavior contract counts" not in readme_source
        or "send_message compatibility contract counts" not in readme_source
        or "completion mention metadata contract counts" not in readme_source
        or "terminal task completion contract counts" not in readme_source
        or "TaskContext metadata behavior contract counts" not in readme_source
        or "same-conversation task contract counts" not in readme_source
        or "sidecar lifecycle contract counts" not in readme_source
        or "adapter TaskContext metadata contract counts" not in readme_source
        or "release-gate documentation contract counts" not in readme_source
        or "SDK surface CLI contract counts" not in readme_source
        or "install schema documentation contract counts" not in readme_source
        or "sidecar upload schema contract counts" not in readme_source
        or "nested schema field contract counts" not in readme_source
        or "nested schema requiredness contract counts" not in readme_source
        or "nested schema shape contract counts" not in readme_source
        or "sidecar schema field parity contract counts" not in readme_source
        or "sidecar schema requiredness parity contract counts" not in readme_source
        or "sidecar schema shape parity contract counts" not in readme_source
        or "sidecar nested schema field parity contract counts" not in readme_source
        or "sidecar nested schema requiredness parity contract counts" not in readme_source
        or "sidecar nested schema shape parity contract counts" not in readme_source
        or "installed SDK agent parameter parity contract counts" not in readme_source
        or "installed SDK task parameter parity contract counts" not in readme_source
        or "installed SDK agent return parity contract counts" not in readme_source
        or "installed SDK task return parity contract counts" not in readme_source
        or "installed SDK TaskContext callable parameter parity contract counts" not in readme_source
        or "installed SDK TaskContext callable return parity contract counts" not in readme_source
        or "TaskContext reply callable contract counts" not in readme_source
        or "TaskContext SDK helper callable contract counts" not in readme_source
        or "installed SDK TaskContext reply callable contract counts" not in readme_source
        or "installed SDK TaskContext SDK helper callable contract counts" not in readme_source
        or "installed SDK type symbol parity contract counts" not in readme_source
        or "installed SDK interface field parity contract counts" not in readme_source
        or "installed SDK interface requiredness parity contract counts" not in readme_source
        or "installed SDK interface shape parity contract counts" not in readme_source
        or "installed SDK nested TaskContext field parity contract counts" not in readme_source
        or "installed SDK nested TaskContext requiredness parity contract counts" not in readme_source
        or "installed SDK nested TaskContext shape parity contract counts" not in readme_source
        or "installed SDK type alias parity contract counts" not in readme_source
        or "installed SDK public type parity contract counts" not in readme_source
        or "installed SDK public value parity contract counts" not in readme_source
        or "installed SDK action protocol parity contract counts" not in readme_source
        or "Python named argument contract counts" not in readme_source
        or "Python task named argument contract counts" not in readme_source
        or "Python required argument count contract counts" not in readme_source
        or "Python task required argument count contract counts" not in readme_source
        or "Python max argument count contract counts" not in readme_source
        or "Python task max argument count contract counts" not in readme_source
        or "Hermes positional argument bound contract counts" not in readme_source
        or "Hermes task positional argument bound contract counts" not in readme_source
        or "sidecar required argument count contract counts" not in readme_source
        or "sidecar task required argument count contract counts" not in readme_source
        or "sidecar max argument count contract counts" not in readme_source
        or "sidecar task max argument count contract counts" not in readme_source
        or "sidecar agent argument type contract counts" not in readme_source
        or "sidecar task argument type contract counts" not in readme_source
        or "sidecar agent argument schema contract counts" not in readme_source
        or "sidecar task argument schema contract counts" not in readme_source
        or "Python direct argument type validation contract counts" not in readme_source
        or "Python positional argument type validation contract counts" not in readme_source
        or "Python method description contract counts" not in readme_source
        or "manifest tool exposure contract counts" not in readme_source
        or "manifest tool order contract counts" not in readme_source
        or "manifest env contract counts" not in readme_source
        or "manifest concurrency default contract counts" not in readme_source
        or "README manifest tool contract counts" not in readme_source
        or "README env contract counts" not in readme_source
        or "runtime env contract counts" not in readme_source
        or "YAML special-key contract counts" not in readme_source
        or "README YAML contract counts" not in readme_source
        or "SDK package version contract counts" not in readme_source
        or "SDK package metadata contract counts" not in readme_source
        or "adapter SDK metadata key contract counts" not in readme_source
        or "adapter SDK package file contract counts" not in readme_source
        or "adapter SDK package name contract counts" not in readme_source
        or "adapter SDK package type contract counts" not in readme_source
        or "adapter SDK package exports contract counts" not in readme_source
        or "SDK dist file parity contract counts" not in readme_source
        or "clean install required plugin file contract counts" not in readme_source
        or "user install required plugin file contract counts" not in readme_source
        or "clean install SDK package file contract counts" not in readme_source
        or "user install SDK package file contract counts" not in readme_source
        or "clean install SDK metadata key contract counts" not in readme_source
        or "user install SDK metadata key contract counts" not in readme_source
        or "SDK method exposure contract counts" not in readme_source
        or "sidecar method order contract counts" not in readme_source
        or "Python method order contract counts" not in readme_source
        or "local lifecycle method contract counts" not in readme_source
        or "local lifecycle documentation contract counts" not in readme_source
        or "SDK README bridge contract counts" not in readme_source
        or "task helper exposure contract counts" not in readme_source
        or "sidecar task helper order contract counts" not in readme_source
        or "Python task helper order contract counts" not in readme_source
        or "TaskContext field contract counts" not in readme_source
        or "TaskContext field shape contract counts" not in readme_source
        or "installed SDK method contract counts" not in readme_source
        or "installed SDK task helper contract counts" not in readme_source
        or "installed SDK TaskContext field contract counts" not in readme_source
        or "installed SDK AgentSkill field contract counts" not in readme_source
        or "sidecar AgentSkill field contract counts" not in readme_source
        or "sidecar AgentSkill requiredness contract counts" not in readme_source
        or "sidecar AgentSkill shape contract counts" not in readme_source
        or "installed SDK option field contract counts" not in readme_source
        or "sidecar option field contract counts" not in readme_source
        or "SDK connection/auth option contract counts" not in readme_source
        or "SDK skill option contract counts" not in readme_source
        or "SDK timing option contract counts" not in readme_source
        or "SDK scheduler option contract counts" not in readme_source
        or "sidecar connection/auth option contract counts" not in readme_source
        or "sidecar skill option contract counts" not in readme_source
        or "sidecar timing option contract counts" not in readme_source
        or "sidecar scheduler option contract counts" not in readme_source
        or "installed SDK connection/auth option contract counts" not in readme_source
        or "installed SDK skill option contract counts" not in readme_source
        or "installed SDK timing option contract counts" not in readme_source
        or "installed SDK scheduler option contract counts" not in readme_source
        or "sidecar option requiredness contract counts" not in readme_source
        or "sidecar option shape contract counts" not in readme_source
        or "control env surface contract counts" not in readme_source
        or "installed SDK AgentEvent contract counts" not in readme_source
        or "SDK AgentEvent connection contract counts" not in readme_source
        or "SDK AgentEvent error/auth contract counts" not in readme_source
        or "SDK AgentEvent token contract counts" not in readme_source
        or "sidecar AgentEvent connection contract counts" not in readme_source
        or "sidecar AgentEvent error/auth contract counts" not in readme_source
        or "sidecar AgentEvent token contract counts" not in readme_source
        or "installed SDK AgentEvent connection contract counts" not in readme_source
        or "installed SDK AgentEvent error/auth contract counts" not in readme_source
        or "installed SDK AgentEvent token contract counts" not in readme_source
        or "installed SDK TaskUpdateData status contract counts" not in readme_source
        or "SDK TaskUpdateData start status contract counts" not in readme_source
        or "SDK TaskUpdateData completion status contract counts" not in readme_source
        or "installed SDK TaskUpdateData start status contract counts" not in readme_source
        or "installed SDK TaskUpdateData completion status contract counts" not in readme_source
        or "installed SDK TaskUpdateData variant contract counts" not in readme_source
        or "installed SDK ActionCallResult status contract counts" not in readme_source
        or "ActionCallResult terminal status contract counts" not in readme_source
        or "ActionCallResult transient coverage contract counts" not in readme_source
        or "ActionCallResult terminal coverage contract counts" not in readme_source
        or "installed SDK ActionCallResult terminal status contract counts" not in readme_source
        or "installed SDK ActionCallResult transient status contract counts" not in readme_source
        or "SDK ActionCallResult identity contract counts" not in readme_source
        or "SDK ActionCallResult payload contract counts" not in readme_source
        or "SDK ActionCallResult trace contract counts" not in readme_source
        or "SDK ActionCallResult execution contract counts" not in readme_source
        or "installed SDK ActionCallResult identity contract counts" not in readme_source
        or "installed SDK ActionCallResult payload contract counts" not in readme_source
        or "installed SDK ActionCallResult trace contract counts" not in readme_source
        or "installed SDK ActionCallResult execution contract counts" not in readme_source
        or "SDK MemoryOrigin literal contract counts" not in readme_source
        or "SDK MemoryOrigin template contract counts" not in readme_source
        or "installed SDK MemoryOrigin literal contract counts" not in readme_source
        or "installed SDK MemoryOrigin template contract counts" not in readme_source
        or "SDK OnboardingSeed kind contract counts" not in readme_source
        or "installed SDK OnboardingSeed kind contract counts" not in readme_source
        or "SDK OnboardingSeed identity contract counts" not in readme_source
        or "SDK OnboardingSeed action contract counts" not in readme_source
        or "SDK OnboardingSeed content contract counts" not in readme_source
        or "installed SDK OnboardingSeed identity contract counts" not in readme_source
        or "installed SDK OnboardingSeed action contract counts" not in readme_source
        or "installed SDK OnboardingSeed content contract counts" not in readme_source
        or "SDK TokenClaimedData field contract counts" not in readme_source
        or "installed SDK TokenClaimedData field contract counts" not in readme_source
        or "TokenClaimedData required-field contract counts" not in readme_source
        or "TokenClaimedData nullable agent contract counts" not in readme_source
        or "SDK ActionCallOptions correlation contract counts" not in readme_source
        or "SDK ActionCallOptions attribution contract counts" not in readme_source
        or "SDK ActionCallOptions context contract counts" not in readme_source
        or "SDK ActionCallOptions execution contract counts" not in readme_source
        or "installed SDK ActionCallOptions correlation contract counts" not in readme_source
        or "installed SDK ActionCallOptions attribution contract counts" not in readme_source
        or "installed SDK ActionCallOptions context contract counts" not in readme_source
        or "installed SDK ActionCallOptions execution contract counts" not in readme_source
        or "SDK ToolCallReport identity contract counts" not in readme_source
        or "SDK ToolCallReport tool contract counts" not in readme_source
        or "SDK ToolCallReport outcome contract counts" not in readme_source
        or "installed SDK ToolCallReport identity contract counts" not in readme_source
        or "installed SDK ToolCallReport tool contract counts" not in readme_source
        or "installed SDK ToolCallReport outcome contract counts" not in readme_source
        or "SDK ActionErrorBody identity contract counts" not in readme_source
        or "SDK ActionErrorBody detail contract counts" not in readme_source
        or "installed SDK ActionErrorBody identity contract counts" not in readme_source
        or "installed SDK ActionErrorBody detail contract counts" not in readme_source
        or "SDK ActionConfirmationPayload identity contract counts" not in readme_source
        or "SDK ActionConfirmationPayload content contract counts" not in readme_source
        or "SDK ActionConfirmationPayload timing contract counts" not in readme_source
        or "installed SDK ActionConfirmationPayload identity contract counts" not in readme_source
        or "installed SDK ActionConfirmationPayload content contract counts" not in readme_source
        or "installed SDK ActionConfirmationPayload timing contract counts" not in readme_source
        or "SDK TaskAttachment identity contract counts" not in readme_source
        or "SDK TaskAttachment name/type contract counts" not in readme_source
        or "SDK TaskAttachment size contract counts" not in readme_source
        or "SDK TaskAttachment URL contract counts" not in readme_source
        or "installed SDK TaskAttachment identity contract counts" not in readme_source
        or "installed SDK TaskAttachment name/type contract counts" not in readme_source
        or "installed SDK TaskAttachment size contract counts" not in readme_source
        or "installed SDK TaskAttachment URL contract counts" not in readme_source
        or "SDK UploadResult name/type contract counts" not in readme_source
        or "SDK UploadResult size contract counts" not in readme_source
        or "SDK UploadResult URL contract counts" not in readme_source
        or "installed SDK UploadResult name/type contract counts" not in readme_source
        or "installed SDK UploadResult size contract counts" not in readme_source
        or "installed SDK UploadResult URL contract counts" not in readme_source
        or "SDK AgentRuntimeInfo identity contract counts" not in readme_source
        or "SDK AgentRuntimeInfo environment contract counts" not in readme_source
        or "installed SDK AgentRuntimeInfo identity contract counts" not in readme_source
        or "installed SDK AgentRuntimeInfo environment contract counts" not in readme_source
        or "SDK HistoryMessage identity contract counts" not in readme_source
        or "SDK HistoryMessage content/status contract counts" not in readme_source
        or "SDK HistoryMessage sender contract counts" not in readme_source
        or "SDK HistoryMessage thread contract counts" not in readme_source
        or "SDK HistoryMessage timestamp contract counts" not in readme_source
        or "SDK HistoryMessage attachment contract counts" not in readme_source
        or "installed SDK HistoryMessage identity contract counts" not in readme_source
        or "installed SDK HistoryMessage content/status contract counts" not in readme_source
        or "installed SDK HistoryMessage sender contract counts" not in readme_source
        or "installed SDK HistoryMessage thread contract counts" not in readme_source
        or "installed SDK HistoryMessage timestamp contract counts" not in readme_source
        or "installed SDK HistoryMessage attachment contract counts" not in readme_source
        or "SDK FetchHistoryOptions cursor contract counts" not in readme_source
        or "SDK FetchHistoryOptions pagination contract counts" not in readme_source
        or "installed SDK FetchHistoryOptions cursor contract counts" not in readme_source
        or "installed SDK FetchHistoryOptions pagination contract counts" not in readme_source
        or "SDK FetchHistoryResult collection contract counts" not in readme_source
        or "SDK FetchHistoryResult pagination contract counts" not in readme_source
        or "installed SDK FetchHistoryResult collection contract counts" not in readme_source
        or "installed SDK FetchHistoryResult pagination contract counts" not in readme_source
        or "SDK Note identity contract counts" not in readme_source
        or "SDK Note creator contract counts" not in readme_source
        or "SDK Note agent attribution contract counts" not in readme_source
        or "SDK Note content contract counts" not in readme_source
        or "SDK Note tag contract counts" not in readme_source
        or "SDK Note timestamp contract counts" not in readme_source
        or "installed SDK Note identity contract counts" not in readme_source
        or "installed SDK Note creator contract counts" not in readme_source
        or "installed SDK Note agent attribution contract counts" not in readme_source
        or "installed SDK Note content contract counts" not in readme_source
        or "installed SDK Note tag contract counts" not in readme_source
        or "installed SDK Note timestamp contract counts" not in readme_source
        or "SDK ListNotesOptions pagination contract counts" not in readme_source
        or "SDK ListNotesOptions filter contract counts" not in readme_source
        or "SDK ListNotesOptions archive contract counts" not in readme_source
        or "installed SDK ListNotesOptions pagination contract counts" not in readme_source
        or "installed SDK ListNotesOptions filter contract counts" not in readme_source
        or "installed SDK ListNotesOptions archive contract counts" not in readme_source
        or "SDK ListNotesResult collection contract counts" not in readme_source
        or "SDK ListNotesResult pagination contract counts" not in readme_source
        or "installed SDK ListNotesResult collection contract counts" not in readme_source
        or "installed SDK ListNotesResult pagination contract counts" not in readme_source
        or "SDK CreateNoteBody content contract counts" not in readme_source
        or "SDK CreateNoteBody tag contract counts" not in readme_source
        or "SDK CreateNoteBody notebook contract counts" not in readme_source
        or "installed SDK CreateNoteBody content contract counts" not in readme_source
        or "installed SDK CreateNoteBody tag contract counts" not in readme_source
        or "installed SDK CreateNoteBody notebook contract counts" not in readme_source
        or "SDK UpdateNoteBody content contract counts" not in readme_source
        or "SDK UpdateNoteBody tag contract counts" not in readme_source
        or "installed SDK UpdateNoteBody content contract counts" not in readme_source
        or "installed SDK UpdateNoteBody tag contract counts" not in readme_source
        or "SDK QueryMemoryOptions query contract counts" not in readme_source
        or "SDK QueryMemoryOptions pagination contract counts" not in readme_source
        or "installed SDK QueryMemoryOptions query contract counts" not in readme_source
        or "installed SDK QueryMemoryOptions pagination contract counts" not in readme_source
        or "SDK MemoryEntry content contract counts" not in readme_source
        or "SDK MemoryEntry classification contract counts" not in readme_source
        or "SDK MemoryEntry scoring contract counts" not in readme_source
        or "installed SDK MemoryEntry content contract counts" not in readme_source
        or "installed SDK MemoryEntry classification contract counts" not in readme_source
        or "installed SDK MemoryEntry scoring contract counts" not in readme_source
        or "SDK ShareNoteResult identity contract counts" not in readme_source
        or "SDK ShareNoteResult display contract counts" not in readme_source
        or "SDK ShareNoteResult tag contract counts" not in readme_source
        or "installed SDK ShareNoteResult identity contract counts" not in readme_source
        or "installed SDK ShareNoteResult display contract counts" not in readme_source
        or "installed SDK ShareNoteResult tag contract counts" not in readme_source
        or "SDK SkillPrompt content contract counts" not in readme_source
        or "SDK SkillPrompt template contract counts" not in readme_source
        or "SDK SkillPrompt parameter contract counts" not in readme_source
        or "installed SDK SkillPrompt content contract counts" not in readme_source
        or "installed SDK SkillPrompt template contract counts" not in readme_source
        or "installed SDK SkillPrompt parameter contract counts" not in readme_source
        or "SDK KanbanBoard identity contract counts" not in readme_source
        or "SDK KanbanBoard display contract counts" not in readme_source
        or "SDK KanbanBoard timestamp contract counts" not in readme_source
        or "installed SDK KanbanBoard identity contract counts" not in readme_source
        or "installed SDK KanbanBoard display contract counts" not in readme_source
        or "installed SDK KanbanBoard timestamp contract counts" not in readme_source
        or "SDK KanbanColumn identity contract counts" not in readme_source
        or "SDK KanbanColumn parent contract counts" not in readme_source
        or "SDK KanbanColumn display contract counts" not in readme_source
        or "SDK KanbanColumn ordering contract counts" not in readme_source
        or "installed SDK KanbanColumn identity contract counts" not in readme_source
        or "installed SDK KanbanColumn parent contract counts" not in readme_source
        or "installed SDK KanbanColumn display contract counts" not in readme_source
        or "installed SDK KanbanColumn ordering contract counts" not in readme_source
        or "SDK KanbanCard identity contract counts" not in readme_source
        or "SDK KanbanCard placement contract counts" not in readme_source
        or "SDK KanbanCard content contract counts" not in readme_source
        or "SDK KanbanCard scheduling contract counts" not in readme_source
        or "SDK KanbanCard creator contract counts" not in readme_source
        or "SDK KanbanCard timestamp contract counts" not in readme_source
        or "SDK KanbanCard archive contract counts" not in readme_source
        or "installed SDK KanbanCard identity contract counts" not in readme_source
        or "installed SDK KanbanCard placement contract counts" not in readme_source
        or "installed SDK KanbanCard content contract counts" not in readme_source
        or "installed SDK KanbanCard scheduling contract counts" not in readme_source
        or "installed SDK KanbanCard creator contract counts" not in readme_source
        or "installed SDK KanbanCard timestamp contract counts" not in readme_source
        or "installed SDK KanbanCard archive contract counts" not in readme_source
        or "SDK ListBoardsResult board contract counts" not in readme_source
        or "SDK ListBoardsResult column contract counts" not in readme_source
        or "SDK ListBoardsResult card contract counts" not in readme_source
        or "installed SDK ListBoardsResult board contract counts" not in readme_source
        or "installed SDK ListBoardsResult column contract counts" not in readme_source
        or "installed SDK ListBoardsResult card contract counts" not in readme_source
        or "SDK KanbanLabel identity contract counts" not in readme_source
        or "SDK KanbanLabel parent contract counts" not in readme_source
        or "SDK KanbanLabel display contract counts" not in readme_source
        or "SDK KanbanLabel color contract counts" not in readme_source
        or "installed SDK KanbanLabel identity contract counts" not in readme_source
        or "installed SDK KanbanLabel parent contract counts" not in readme_source
        or "installed SDK KanbanLabel display contract counts" not in readme_source
        or "installed SDK KanbanLabel color contract counts" not in readme_source
        or "SDK CreateBoardBody display contract counts" not in readme_source
        or "SDK CreateBoardBody column contract counts" not in readme_source
        or "installed SDK CreateBoardBody display contract counts" not in readme_source
        or "installed SDK CreateBoardBody column contract counts" not in readme_source
        or "SDK UpdateBoardBody display contract counts" not in readme_source
        or "installed SDK UpdateBoardBody display contract counts" not in readme_source
        or "SDK CreateCardBody content contract counts" not in readme_source
        or "SDK CreateCardBody placement contract counts" not in readme_source
        or "installed SDK CreateCardBody content contract counts" not in readme_source
        or "installed SDK CreateCardBody placement contract counts" not in readme_source
        or "SDK UpdateCardBody content contract counts" not in readme_source
        or "SDK UpdateCardBody placement contract counts" not in readme_source
        or "SDK UpdateCardBody ordering contract counts" not in readme_source
        or "installed SDK UpdateCardBody content contract counts" not in readme_source
        or "installed SDK UpdateCardBody placement contract counts" not in readme_source
        or "installed SDK UpdateCardBody ordering contract counts" not in readme_source
        or "SDK CreateColumnBody display contract counts" not in readme_source
        or "SDK CreateColumnBody ordering contract counts" not in readme_source
        or "installed SDK CreateColumnBody display contract counts" not in readme_source
        or "installed SDK CreateColumnBody ordering contract counts" not in readme_source
        or "SDK UpdateColumnBody display contract counts" not in readme_source
        or "SDK UpdateColumnBody ordering contract counts" not in readme_source
        or "installed SDK UpdateColumnBody display contract counts" not in readme_source
        or "installed SDK UpdateColumnBody ordering contract counts" not in readme_source
        or "SDK AddCommitBody commit contract counts" not in readme_source
        or "SDK AddCommitBody content contract counts" not in readme_source
        or "installed SDK AddCommitBody commit contract counts" not in readme_source
        or "installed SDK AddCommitBody content contract counts" not in readme_source
        or "SDK CreateLabelBody display contract counts" not in readme_source
        or "SDK CreateLabelBody color contract counts" not in readme_source
        or "installed SDK CreateLabelBody display contract counts" not in readme_source
        or "installed SDK CreateLabelBody color contract counts" not in readme_source
        or "SDK UpdateLabelBody display contract counts" not in readme_source
        or "SDK UpdateLabelBody color contract counts" not in readme_source
        or "installed SDK UpdateLabelBody display contract counts" not in readme_source
        or "installed SDK UpdateLabelBody color contract counts" not in readme_source
        or "SDK CardCommit identity contract counts" not in readme_source
        or "SDK CardCommit content contract counts" not in readme_source
        or "SDK CardCommit timestamp contract counts" not in readme_source
        or "installed SDK CardCommit identity contract counts" not in readme_source
        or "installed SDK CardCommit content contract counts" not in readme_source
        or "installed SDK CardCommit timestamp contract counts" not in readme_source
        or "SDK CardNote identity contract counts" not in readme_source
        or "SDK CardNote display contract counts" not in readme_source
        or "SDK CardNote tag contract counts" not in readme_source
        or "SDK CardNote timestamp contract counts" not in readme_source
        or "installed SDK CardNote identity contract counts" not in readme_source
        or "installed SDK CardNote display contract counts" not in readme_source
        or "installed SDK CardNote tag contract counts" not in readme_source
        or "installed SDK CardNote timestamp contract counts" not in readme_source
        or "SDK ArchivedCardsResult collection contract counts" not in readme_source
        or "SDK ArchivedCardsResult pagination contract counts" not in readme_source
        or "installed SDK ArchivedCardsResult collection contract counts" not in readme_source
        or "installed SDK ArchivedCardsResult pagination contract counts" not in readme_source
        or "adapter TaskUpdateData status contract counts" not in readme_source
        or "adapter TaskUpdateData start status contract counts" not in readme_source
        or "adapter TaskUpdateData completion status contract counts" not in readme_source
        or "sidecar AgentEvent contract counts" not in readme_source
        or "SDK client test inventory contract counts" not in readme_source
        or "SDK client test uniqueness contract counts" not in readme_source
        or "SDK client HTTP validation test contract counts" not in readme_source
        or "SDK client task scheduling test contract counts" not in readme_source
        or "SDK client reconnect buffer test contract counts" not in readme_source
        or "SDK client task action test contract counts" not in readme_source
        or "SDK client no-conversation test contract counts" not in readme_source
        or "SDK client auth retry test contract counts" not in readme_source
        or "SDK client onboarding test contract counts" not in readme_source
        or "SDK types test inventory contract counts" not in readme_source
        or "SDK types test uniqueness contract counts" not in readme_source
        or "SDK types action context test contract counts" not in readme_source
        or "SDK types ActionCallResult test contract counts" not in readme_source
        or "SDK types upload attachment test contract counts" not in readme_source
        or "SDK types TaskContext helper test contract counts" not in readme_source
        or "SDK README method inventory contract counts" not in readme_source
        or "SDK README method uniqueness contract counts" not in readme_source
        or "SDK README lifecycle method contract counts" not in readme_source
        or "SDK README message/file method contract counts" not in readme_source
        or "SDK README note method contract counts" not in readme_source
        or "SDK README kanban method contract counts" not in readme_source
        or "SDK README memory method contract counts" not in readme_source
        or "SDK README type inventory contract counts" not in readme_source
        or "SDK README type uniqueness contract counts" not in readme_source
        or "SDK README kanban type contract counts" not in readme_source
        or "SDK README note and memory type contract counts" not in readme_source
        or "SDK README option inventory contract counts" not in readme_source
        or "SDK README option uniqueness contract counts" not in readme_source
        or "SDK README auth option contract counts" not in readme_source
        or "SDK README timing option contract counts" not in readme_source
        or "SDK README TaskContext inventory contract counts" not in readme_source
        or "SDK README TaskContext uniqueness contract counts" not in readme_source
        or "SDK README TaskContext field contract counts" not in readme_source
        or "SDK README TaskContext reply helper contract counts" not in readme_source
        or "live validator field-set contract counts" not in readme_source
        or "live validator status-set contract counts" not in readme_source
        or "live validator field usage contract counts" not in readme_source
        or "live validator shape contract counts" not in readme_source
        or "live validator kanban contract counts" not in readme_source
        or "live validator note and memory contract counts" not in readme_source
        or "live validator file and history contract counts" not in readme_source
        or "live validator input contract counts" not in readme_source
        or "live validator action contract counts" not in readme_source
        or "SDK option config" not in readme_source
        or "SDK package file" not in readme_source
        or "metadata key" not in readme_source
        or "required" not in readme_source
        or "plugin file" not in readme_source
        or "script counts" not in readme_source
        or "auth protocol" not in readme_source
        or "SDK auth," not in readme_source
        or "command, and runtime" not in readme_source
        or "frame" not in readme_source
        or "auth frame detail contract counts" not in readme_source
        or "command frame detail contract counts" not in readme_source
        or "runtime frame detail contract counts" not in readme_source
        or "behavior contract" not in readme_source
        or "runtime E2E coverage contract counts" not in readme_source
        or "runtime E2E queue and cron contract counts" not in readme_source
        or "runtime E2E skill config contract counts" not in readme_source
        or "runtime E2E outbound delivery contract counts" not in readme_source
        or "runtime E2E TaskContext action contract counts" not in readme_source
        or "runtime E2E tool report contract counts" not in readme_source
        or "runtime E2E reconnect buffer contract counts" not in readme_source
        or "runtime E2E concurrency mode contract counts" not in readme_source
        or "runtime E2E auth reconnect contract counts" not in readme_source
        or "runtime E2E shutdown cleanup contract counts" not in readme_source
        or "runtime upload validation contract counts" not in readme_source
        or "runtime control validation contract counts" not in readme_source
        or "runtime structured argument validation contract counts" not in readme_source
        or "gateway config runtime option contract counts" not in readme_source
        or "gateway config agent skill contract counts" not in readme_source
        or "gateway config alias contract counts" not in readme_source
        or "live credential resolution contract counts" not in readme_source
        or "live gate import and config contract counts" not in readme_source
        or "live gate SDK probe contract counts" not in readme_source
        or "live gate probe validation contract counts" not in readme_source
        or "queue overflow contract counts" not in readme_source
        or "auth retry contract counts" not in readme_source
        or "task heartbeat contract counts" not in readme_source
        or "ping interval contract counts" not in readme_source
        or "ping timeout contract counts" not in readme_source
        or "reconnect interval contract counts" not in readme_source
        or "action timeout contract counts" not in readme_source
        or "generated callId contract counts" not in readme_source
        or "onboarding seed contract counts" not in readme_source
        or "control result contract counts" not in readme_source
        or "listBoards return contract counts" not in readme_source
        or "TaskContext nested" not in readme_source
        or "agent and task" not in readme_source
        or "helper return contract counts" not in readme_source
        or "TaskContext" not in readme_source
        or "shape" not in readme_source
        or "Hermes" not in readme_source
        or "sidecar JSON" not in readme_source
        or "schema" not in readme_source
        or "contract counts" not in readme_source
        or "contract counts" not in readme_source
        or "ActionCallResult" not in readme_source
        or "ActionCallResult" not in readme_source
        or "status" not in readme_source
        or "coverage," not in readme_source
        or "generated JavaScript" not in readme_source
        or "`index.ts` type/value exports" not in readme_source
        or "public value export counts" not in readme_source
        or "consumed `dist`" not in readme_source
        or "generated" not in readme_source
        or "JavaScript," not in readme_source
        or "declarations," not in readme_source
        or "declarations," not in readme_source
        or "named" not in readme_source
        or "tool parameters" not in readme_source
        or "exported interface and type-alias counts" not in readme_source
        or "completion mention options forwarded through SDK `sendComplete()`" not in readme_source
        or "`mentions`, `arinova_mentions`, `complete_mentions`, or nested\n  `arinova.mentions`" not in readme_source
        or "upstream" not in readme_source
        or "SDK client" not in readme_source
        or "type tests" not in readme_source
        or "behavior contracts" not in readme_source
        or "force" not in readme_source
        or "parity review" not in readme_source
        or "parity review" not in readme_source
        or "every exposed" not in readme_source
        or "SDK method" not in readme_source
        or "live" not in readme_source
        or "`call_agent_sdk()` probe" not in readme_source
        or "every task-scoped" not in readme_source
        or "Python tool-wrapper" not in readme_source
        or "Python" not in readme_source
        or "tool-wrapper" not in readme_source
        or "Not yet implemented:" in readme_source
        or "the current agent SDK rich preview card API is `shareNote()`" not in readme_source
        or "Additional rich outbound card types should be added here when the SDK exports\n  concrete methods for them." not in readme_source
        or "the plugin preserves\nthe SDK default `per-conversation`" not in readme_source
        or "set either concurrency key to `agent-wide`\nor `unbounded` to override" not in readme_source
    )
    readme_install_schema_drift = (
        "manifest-declared Arinova platform/tools, indexes every Arinova tool under\nthe `hermes-arinova` registry toolset" not in readme_source
        or "exposes usable generic and named SDK\ntool schemas" not in readme_source
        or "index every Arinova tool under the\n`hermes-arinova` registry toolset" not in readme_source
        or "SDK-native camelCase aliases" not in readme_source
        or "`conversationId`" not in readme_source
        or "`actionArgs`" not in readme_source
        or "both interactive and\nbackground `AIAgent` creation paths resolve platform toolsets with" not in readme_source
        or "pass the resolved `enabled_toolsets` into the agent" not in readme_source
        or "enabled sidecar" not in readme_source
        or "fresh dependency install" not in readme_source
        or "`@arinova-ai/agent-sdk` package version, public package metadata\nincluding runtime `dependencies`, consumed `dist` files, and" not in readme_source
        or "`check_requirements()` result exactly match the selected `--sdk-root` checkout" not in readme_source
        or "configured SDK options are passed into the supervised sidecar\nenvironment" not in readme_source
        or "copied gateway config-load smoke" not in readme_source
        or "copied sidecar's consumed SDK\npackage version, package metadata including runtime `dependencies`, and `dist` files" not in readme_source
        or "against the same selected `--sdk-root` checkout" not in readme_source
        or "`~/.arinova-bridge/workspace/projects/arinova-packages/packages/agent-sdk`" not in readme_source
    )
    install_schema_documentation_contract_count = 1
    send_message_compat_coverage_missing = (
        "_parse_target_ref(\"arinova\"" not in hermes_plugin_load_source
        or "arinova:conv-explicit" not in hermes_plugin_load_source
        or "_send_to_platform(" not in hermes_plugin_load_source
        or "conv-media-only" not in hermes_plugin_load_source
        or "media_files=[(str(media_path), False)]" not in hermes_plugin_load_source
        or "Arinova media-only send_message route failed" not in hermes_plugin_load_source
        or "conv-chunked-media" not in hermes_plugin_load_source
        or "Arinova chunked send attached media before final chunk" not in hermes_plugin_load_source
        or "Arinova chunked send did not attach media to final chunk" not in hermes_plugin_load_source
        or "Arinova chunked send did not preserve force_document" not in hermes_plugin_load_source
        or "media upload bytes were not base64 encoded for sidecar control API" not in hermes_plugin_load_source
        or "active media task bytes were not base64 encoded for sidecar control API" not in hermes_plugin_load_source
        or "proactive media send accepted uploadFile response without url" not in hermes_plugin_load_source
        or "proactive media send accepted uploadFile response without fileName" not in hermes_plugin_load_source
        or "proactive media send accepted uploadFile response without fileType" not in hermes_plugin_load_source
        or "proactive media send accepted uploadFile response without fileSize" not in hermes_plugin_load_source
        or "proactive media send accepted uploadFile response with non-finite fileSize" not in hermes_plugin_load_source
        or "active media send accepted uploadFile response without url" not in hermes_plugin_load_source
        or "active media send accepted uploadFile response without fileName" not in hermes_plugin_load_source
        or "active media send accepted uploadFile response without fileType" not in hermes_plugin_load_source
        or "active media send accepted uploadFile response without fileSize" not in hermes_plugin_load_source
        or "active media send accepted uploadFile response with non-finite fileSize" not in hermes_plugin_load_source
        or "task-media-upload-then-missing" not in hermes_plugin_load_source
        or "media upload followed by missing active task left stale state" not in hermes_plugin_load_source
        or "standalone send accepted uploadFile response without url" not in hermes_plugin_load_source
        or "standalone send posted message after malformed uploadFile response" not in hermes_plugin_load_source
        or "standalone send accepted non-UTF-8 response" not in hermes_plugin_load_source
        or "standalone send accepted malformed JSON response" not in hermes_plugin_load_source
        or "standalone send accepted non-JSON response content type" not in hermes_plugin_load_source
        or "standalone send accepted non-finite JSON response" not in hermes_plugin_load_source
        or "standalone send accepted duplicate-key JSON response" not in hermes_plugin_load_source
        or "standalone send accepted non-object JSON response" not in hermes_plugin_load_source
        or "standalone send accepted transport failure" not in hermes_plugin_load_source
        or "standalone send accepted timeout" not in hermes_plugin_load_source
        or "standalone upload accepted non-UTF-8 response" not in hermes_plugin_load_source
        or "standalone upload accepted non-JSON response content type" not in hermes_plugin_load_source
        or "standalone upload accepted malformed JSON response" not in hermes_plugin_load_source
        or "standalone upload accepted non-finite JSON response" not in hermes_plugin_load_source
        or "standalone upload accepted duplicate-key JSON response" not in hermes_plugin_load_source
        or "standalone upload accepted non-object JSON response" not in hermes_plugin_load_source
        or "standalone upload accepted response without fileName" not in hermes_plugin_load_source
        or "standalone upload accepted response without fileType" not in hermes_plugin_load_source
        or "standalone upload accepted response without fileSize" not in hermes_plugin_load_source
        or "standalone upload accepted response with non-finite fileSize" not in hermes_plugin_load_source
        or "standalone upload accepted transport failure" not in hermes_plugin_load_source
        or "standalone upload accepted timeout" not in hermes_plugin_load_source
        or "posted message after failed upload" not in hermes_plugin_load_source
        or "uploadFile response missing url" not in adapter_source
        or "uploadFile response missing fileName" not in adapter_source
        or "uploadFile response missing fileType" not in adapter_source
        or "uploadFile response missing fileSize" not in adapter_source
        or "uploadFile response fileSize must be finite" not in adapter_source
        or "attachment download response normalization failed" not in hermes_plugin_load_source
        or "attachment download used unexpected request target or timeout" not in hermes_plugin_load_source
        or "attachment download accepted HTTP failure" not in hermes_plugin_load_source
        or "attachment download accepted transport failure" not in hermes_plugin_load_source
        or "attachment download accepted timeout" not in hermes_plugin_load_source
        or "attachment download failed (" not in adapter_source
        or "attachment download timed out" not in adapter_source
        or "Hermes-Arinova-Plugin/0.1" not in hermes_plugin_load_source
        or "agent SDK args were not recursively JSON-safe encoded" not in hermes_plugin_load_source
        or "task SDK args were not recursively JSON-safe encoded" not in hermes_plugin_load_source
        or "direct task SDK call did not trim explicit task id" not in hermes_plugin_load_source
        or "task_id = self._task_id_value(task_id) or self.active_task_id() or \"\"" not in adapter_source
        or "_raise_for_sidecar_control_response" not in adapter_source
        or 'return response["result"]' not in adapter_source
        or "returned malformed success response" not in adapter_source
        or "agent SDK ok=false response was treated as success" not in hermes_plugin_load_source
        or "task SDK ok=false response was treated as success" not in hermes_plugin_load_source
        or "agent SDK missing-result response was treated as success" not in hermes_plugin_load_source
        or "task SDK missing-result response was treated as success" not in hermes_plugin_load_source
        or "agent SDK malformed-ok response was treated as success" not in hermes_plugin_load_source
        or "task SDK malformed-ok response was treated as success" not in hermes_plugin_load_source
        or "VOID_AGENT_METHODS" not in adapter_source
        or "returned non-null void result" not in adapter_source
        or "void response regression args do not match VOID_AGENT_METHODS" not in hermes_plugin_load_source
        or "for void_method, method_args in void_method_args.items()" not in hermes_plugin_load_source
        or "agent SDK {void_method} non-null void result was treated as success" not in hermes_plugin_load_source
        or "allow_nan=False" not in adapter_source
        or "_post_sidecar accepted non-finite JSON payload" not in hermes_plugin_load_source
        or "_post_sidecar attempted to send non-finite JSON payload" not in hermes_plugin_load_source
        or "returned non-JSON response content type" not in adapter_source
        or "_post_sidecar accepted non-JSON sidecar response content type" not in hermes_plugin_load_source
        or "returned non-UTF-8 response body" not in adapter_source
        or "_post_sidecar accepted non-UTF-8 sidecar response" not in hermes_plugin_load_source
        or "returned malformed JSON" not in adapter_source
        or "_post_sidecar accepted malformed sidecar JSON" not in hermes_plugin_load_source
        or "_post_sidecar accepted empty sidecar JSON response" not in hermes_plugin_load_source
        or "_post_sidecar accepted non-finite sidecar JSON response" not in hermes_plugin_load_source
        or "_post_sidecar accepted duplicate-key sidecar JSON response" not in hermes_plugin_load_source
        or "_post_sidecar accepted non-object sidecar JSON" not in hermes_plugin_load_source
        or "except urllib.error.URLError" not in adapter_source
        or "_post_sidecar accepted sidecar transport failure" not in hermes_plugin_load_source
        or "except TimeoutError" not in adapter_source
        or "_post_sidecar accepted sidecar timeout" not in hermes_plugin_load_source
        or "standalone send accepted empty JSON response" not in hermes_plugin_load_source
        or "standalone upload accepted empty JSON response" not in hermes_plugin_load_source
        or '"memoryview": {"base64": "Z2hp"}' not in hermes_plugin_load_source
        or '"tuple": [{"base64": "amts"}, {"nested": {"base64": "bW5v"}}]' not in hermes_plugin_load_source
    )
    send_message_compat_contract_count = 1
    mention_metadata_coverage_missing = (
        '"complete_mentions": [{"userId": "user-2"}]' not in hermes_plugin_load_source
        or '"mentions": [{"agent_id": "agent-3"}]' not in hermes_plugin_load_source
        or '"complete_mentions": [{"id": "agent-2"}]' not in hermes_plugin_load_source
        or "processing complete task update used unexpected agent name" not in hermes_plugin_load_source
        or 'set(complete_update) != {"status", "durationMs"}' not in hermes_plugin_load_source
        or 'complete_update.get("durationMs") < 0' not in hermes_plugin_load_source
        or "task update failure prevented processing start bookkeeping" not in hermes_plugin_load_source
        or "telemetry failure prevented terminal task error" not in hermes_plugin_load_source
        or "telemetry failure left active task state" not in hermes_plugin_load_source
        or "/agent-sdk sendTaskUpdate failed (500): task update unavailable" not in hermes_plugin_load_source
        or "/agent-sdk sendTelemetry failed (500): telemetry unavailable" not in hermes_plugin_load_source
    )
    mention_metadata_contract_count = 1
    terminal_task_completion_coverage_missing = (
        "asyncio.run(adapter.on_processing_complete(media_event, ProcessingOutcome.SUCCESS))" not in hermes_plugin_load_source
        or '"/complete",\n        {"taskId": "task-media", "content": "completion mentions", "mentions": ["user-1", "agent-1"]},' not in hermes_plugin_load_source
        or "processing complete did not finish task" not in hermes_plugin_load_source
        or "processing start did not trim event task id" not in hermes_plugin_load_source
        or "processing complete did not trim event task id" not in hermes_plugin_load_source
        or "trimmed processing lifecycle left active task state" not in hermes_plugin_load_source
        or "task_id = self._event_task_id(event)" not in adapter_source
        or "processing success left active task state" not in hermes_plugin_load_source
        or "asyncio.run(adapter.on_processing_complete(failure_event, ProcessingOutcome.FAILURE))" not in hermes_plugin_load_source
        or "processing failure emitted a completed task update" not in hermes_plugin_load_source
        or '"args": ["task_terminal", {"taskId": "task-fail", "outcome": "failure"}]' not in hermes_plugin_load_source
        or '("/error", {"taskId": "task-fail", "error": "Hermes failed while processing the task"})' not in hermes_plugin_load_source
        or "processing failure left active task state" not in hermes_plugin_load_source
        or "asyncio.run(adapter.on_processing_complete(cancel_event, ProcessingOutcome.CANCELLED))" not in hermes_plugin_load_source
        or "processing cancellation emitted a completed task update" not in hermes_plugin_load_source
        or '"args": ["task_terminal", {"taskId": "task-cancel", "outcome": "cancelled"}]' not in hermes_plugin_load_source
        or '("/error", {"taskId": "task-cancel", "error": "cancelled"})' not in hermes_plugin_load_source
        or "processing cancellation left active task state" not in hermes_plugin_load_source
        or "terminal sidecar failure incorrectly cleared active task state" not in hermes_plugin_load_source
        or "terminal_post_failures.add((\"/complete\", \"task-terminal-post-fail\"))" not in hermes_plugin_load_source
    )
    terminal_task_completion_contract_count = 1
    task_context_metadata_coverage_missing = (
        "conversationName: Project Memo" not in hermes_plugin_load_source
        or "conversationType: direct" not in hermes_plugin_load_source
        or 'hasOwn(task, "conversationName")' not in sidecar_source
        or 'conversationName: "Project Memo"' not in sidecar_runtime_check_source
        or 'history: [{ role: "user", content: "earlier", senderAgentName: "Helper", senderUsername: "User", createdAt: "now" }]' not in sidecar_runtime_check_source
        or "task-empty-conversation-name" not in sidecar_runtime_check_source
        or "_task_conversation_name" not in adapter_source
        or "explicit empty conversationName was not preserved in Hermes source" not in hermes_plugin_load_source
        or "explicit empty conversationName was not preserved in task text" not in hermes_plugin_load_source
        or "explicit empty conversationName was not preserved in chat cache" not in hermes_plugin_load_source
        or "explicit empty task skills invented a skills section" not in hermes_plugin_load_source
        or "role=assistant" not in hermes_plugin_load_source
        or "User @ 2026-06-29T01:00:00Z (role=user): earlier question" not in hermes_plugin_load_source
        or "Arinova conversation agents:" not in hermes_plugin_load_source
        or "Researcher (agent-2)" not in hermes_plugin_load_source
        or "Available Arinova skills (use arinova_fetch_skill_prompt with slug for full prompt):" not in hermes_plugin_load_source
        or "Memo | slug=memo | slash=/memo | Use memos" not in hermes_plugin_load_source
        or "a.txt (text/plain, id=att-1, 3 bytes): https://files.example/a.txt" not in hermes_plugin_load_source
        or '("conversationType", "conversationType")' not in adapter_source
        or 'task.get("senderAgentName")\n                if task.get("senderAgentId")' not in adapter_source
        or '"senderUsername": "Workspace Owner"' not in hermes_plugin_load_source
        or "agent-authored source used senderUsername instead of senderAgentName" not in hermes_plugin_load_source
        or "no-conversation task text invented conversation metadata" not in hermes_plugin_load_source
    )
    task_context_metadata_behavior_contract_count = 1
    same_conversation_task_coverage_missing = (
        "task-parallel-a" not in hermes_plugin_load_source
        or "task-parallel-b" not in hermes_plugin_load_source
        or "task-duplicate-conversation" not in hermes_plugin_load_source
        or "duplicate Arinova task id left stale conversation mapping" not in hermes_plugin_load_source
        or "default Arinova task unexpectedly split conversation session" not in hermes_plugin_load_source
        or "adapter.concurrency_mode = \"unbounded\"" not in hermes_plugin_load_source
        or "same-conversation Arinova tasks shared a Hermes session" not in hermes_plugin_load_source
        or "forgetting first same-conversation task removed newer task mapping" not in hermes_plugin_load_source
        or "previous_conversation_id" not in adapter_source
        or "_task_id_for_send" not in adapter_source
        or '"taskId", "thread_id"' not in adapter_source
        or 'metadata={"taskId": "task-parallel-a"}' not in hermes_plugin_load_source
        or 'metadata={"taskId": "  task-parallel-a  "}' not in hermes_plugin_load_source
        or 'metadata={"arinova": {"task_id": "  task-parallel-b  "}}' not in hermes_plugin_load_source
        or 'metadata={"task_id": "task-parallel-b"}' not in hermes_plugin_load_source
        or 'metadata={"arinova_task_id": "task-parallel-a"}' not in hermes_plugin_load_source
        or "trimmed metadata task id did not route active task send" not in hermes_plugin_load_source
        or "_metadata_task_id_value" not in adapter_source
        or "_task_thread_id" not in adapter_source
    )
    same_conversation_task_contract_count = 1
    sidecar_lifecycle_coverage_missing = (
        "_start_sidecar passed without @arinova-ai/agent-sdk package marker" not in hermes_plugin_load_source
        or "_sidecar_dependency_error" not in adapter_source
        or "sidecar SDK version mismatch" not in adapter_source
        or "sidecar SDK package metadata drifted" not in adapter_source
        or "SDK_PACKAGE_PUBLIC_METADATA_KEYS" not in adapter_source
        or "ARINOVA_AGENT_SDK_ROOT" not in adapter_source
        or "def _local_sdk_package(sdk_root: str | Path | None = None) -> Path | None:" not in adapter_source
        or "def _sdk_public_metadata(package: dict[str, Any]) -> dict[str, Any]:" not in adapter_source
        or "def _sdk_package_file_drift(installed_sdk_dir: Path, local_sdk_dir: Path) -> list[str]:" not in adapter_source
        or "def _sidecar_lockfile_error(sidecar_package: dict[str, Any], sdk_package: dict[str, Any]) -> str | None:" not in adapter_source
        or "sidecar package-lock.json SDK package tarball drifted" not in adapter_source
        or "sidecar package-lock.json SDK package license drifted" not in adapter_source
        or "sidecar package-lock.json SDK package integrity is missing or not sha512" not in adapter_source
        or "lockfile.get(\"lockfileVersion\") != 3" not in adapter_source
        or "lockfile.get(\"requires\") is not True" not in adapter_source
        or "installed_metadata != local_metadata" not in adapter_source
        or "sidecar SDK package files drifted" not in adapter_source
        or "override-agent-sdk" not in hermes_plugin_load_source
        or '"ARINOVA_AGENT_SDK_ROOT"' not in hermes_plugin_load_source
        or "check_requirements ignored ARINOVA_AGENT_SDK_ROOT metadata override" not in hermes_plugin_load_source
        or "check_requirements passed with drifted SDK package metadata" not in hermes_plugin_load_source
        or "_start_sidecar passed with drifted SDK package metadata" not in hermes_plugin_load_source
        or "check_requirements passed with drifted SDK package files" not in hermes_plugin_load_source
        or "_start_sidecar passed with drifted SDK package files" not in hermes_plugin_load_source
        or "check_requirements passed with drifted SDK runtime dependencies" not in hermes_plugin_load_source
        or "_start_sidecar passed with drifted SDK runtime dependencies" not in hermes_plugin_load_source
        or "sidecar SDK package exports drifted" not in adapter_source
        or "sidecar SDK package files are missing" not in adapter_source
        or "SDK_DIST_FILES" not in adapter_source
        or "SDK_PACKAGE_FILES" not in adapter_source
        or "SIDECAR_JS_CHECK_FILES" not in adapter_source
        or "def _node_syntax_error" not in adapter_source
        or 'node_bin, "--check"' not in adapter_source
        or "sidecar JavaScript syntax check failed" not in adapter_source
        or '"README.md"' not in adapter_source
        or '"dist/client.js"' not in adapter_source
        or '"dist/client.js.map"' not in adapter_source
        or '"node_modules/@arinova-ai/agent-sdk/dist/index.js"' not in adapter_source
        or '"dist/types.d.ts"' not in adapter_source
        or '"dist/types.js.map"' not in adapter_source
        or "export class ArinovaAgent" not in hermes_plugin_load_source
        or "check_requirements passed without SDK package files" not in hermes_plugin_load_source
        or "_start_sidecar passed without SDK package files" not in hermes_plugin_load_source
        or "check_requirements passed with invalid SDK JavaScript" not in hermes_plugin_load_source
        or "_start_sidecar passed with invalid SDK JavaScript" not in hermes_plugin_load_source
        or "write_fake_lockfile" not in hermes_plugin_load_source
        or "check_requirements passed with invalid sidecar package-lock.json SDK tarball" not in hermes_plugin_load_source
        or "_start_sidecar passed with invalid sidecar package-lock.json SDK tarball" not in hermes_plugin_load_source
        or "check_requirements passed with invalid sidecar package-lock.json SDK license" not in hermes_plugin_load_source
        or "_start_sidecar passed with invalid sidecar package-lock.json SDK license" not in hermes_plugin_load_source
        or "check_requirements passed with invalid sidecar package-lock.json SDK integrity" not in hermes_plugin_load_source
        or "_start_sidecar passed with invalid sidecar package-lock.json SDK integrity" not in hermes_plugin_load_source
        or "check_requirements passed with mismatched @arinova-ai/agent-sdk package metadata" not in hermes_plugin_load_source
        or "_start_sidecar passed with mismatched @arinova-ai/agent-sdk package metadata" not in hermes_plugin_load_source
        or "check_requirements failed with valid SDK package marker present" not in hermes_plugin_load_source
        or "ExitedSidecarProc" not in hermes_plugin_load_source
        or "sidecar exited before SDK authentication (exit 7)" not in hermes_plugin_load_source
        or "recent sidecar output: booting sidecar | missing env | fatal startup" not in hermes_plugin_load_source
        or 'health.get("ok") is not True' not in adapter_source
        or "sidecar control server reported unhealthy state" not in adapter_source
        or "_wait_for_sidecar accepted unhealthy sidecar health" not in hermes_plugin_load_source
        or "_wait_for_sidecar recorded agent id from unhealthy sidecar health" not in hermes_plugin_load_source
        or 'health.get("agentId")' not in adapter_source
        or "adapter did not record healthz agent id during sidecar readiness" not in hermes_plugin_load_source
        or "connection-status true did not register active adapter singleton" not in hermes_plugin_load_source
        or "connection-status false did not clear active adapter singleton" not in hermes_plugin_load_source
        or "connection-status string false did not clear active adapter singleton" not in hermes_plugin_load_source
        or "_active_adapter = self" not in adapter_source
        or "if _active_adapter is self:\n            _active_adapter = None" not in adapter_source
        or "shutdown endpoint unavailable" not in hermes_plugin_load_source
        or "disconnect did not clean up supervised sidecar after shutdown post failure" not in hermes_plugin_load_source
        or "except Exception:\n            pass" not in adapter_source
        or "_sidecar_log_tail" not in adapter_source
        or "_sidecar_exit_error" not in adapter_source
        or "supervised sidecar process exited" not in hermes_plugin_load_source
        or "check_requirements passed with unsupported Node version" not in hermes_plugin_load_source
        or "requires Node >=20" not in hermes_plugin_load_source
        or "_node_version_supported" not in adapter_source
        or "Node.js 20+" not in readme_source
        or "disconnect did not ask sidecar to shut down first" not in hermes_plugin_load_source
        or "disconnect did not gracefully terminate supervised sidecar" not in hermes_plugin_load_source
        or "disconnect did not clear sidecar process handle" not in hermes_plugin_load_source
        or "disconnect did not kill and reap stubborn supervised sidecar" not in hermes_plugin_load_source
        or "sidecar process did not exit after kill" not in adapter_source
        or "let shuttingDown = false" not in sidecar_index_source
        or "if (shuttingDown) return" not in sidecar_index_source
        or "shuttingDown = true" not in sidecar_index_source
        or "clearControlState();" not in sidecar_index_source
        or "try {\n  await agent.connect();" not in sidecar_index_source
        or "shutdown(1);" not in sidecar_index_source
        or "function shutdown(exitCode = 0)" not in sidecar_index_source
        or "process.exit(exitCode)" not in sidecar_index_source
        or "transient SDK websocket disconnects preserve active task mappings" not in readme_source
        or "shutdownCalls" not in sidecar_runtime_check_source
        or '(await post("/shutdown")).body, { ok: true }' not in sidecar_runtime_check_source
        or "agent.disconnected, true" not in sidecar_runtime_check_source
        or "control request without Content-Length must be rejected before reading body" not in sidecar_runtime_check_source
        or 'Buffer.byteLength(chunk, "utf8")' not in sidecar_source
        or "request body must be a JSON object" not in adapter_source
        or "_is_json_content_type" not in adapter_source
        or "_callback_content_length" not in adapter_source
        or "callback request body must use application/json" not in adapter_source
        or "callback request body exceeds" not in adapter_source
        or "callback Content-Length is required" not in adapter_source
        or "callback Content-Length must be a non-negative integer" not in adapter_source
        or "parse_constant=_reject_json_constant" not in adapter_source
        or "object_pairs_hook=_reject_duplicate_json_keys" not in adapter_source
        or "JSON object contains duplicate key" not in adapter_source
        or "ADAPTER_CALLBACK_FIELDS" not in adapter_source
        or "ADAPTER_CALLBACK_REQUIRED_FIELDS" not in adapter_source
        or "TASK_ATTACHMENT_FIELDS" not in adapter_source
        or "TASK_SKILL_FIELDS" not in adapter_source
        or "_validate_task_context_payload(payload)" not in adapter_source
        or "callback request body has unsupported field(s)" not in adapter_source
        or "callback request body is missing required field(s)" not in adapter_source
        or "fileSize must be a finite number" not in adapter_source
        or "slashCommand must be a string or null" not in adapter_source
        or "_validate_adapter_callback_payload(self.path, payload)" not in adapter_source
        or "inbound server accepted request with wrong bridge token" not in hermes_plugin_load_source
        or "inbound server accepted oversized callback body" not in hermes_plugin_load_source
        or "inbound server accepted malformed callback Content-Length" not in hermes_plugin_load_source
        or "inbound server accepted callback without Content-Length" not in hermes_plugin_load_source
        or "inbound callback without Content-Length changed adapter state" not in hermes_plugin_load_source
        or "inbound server accepted non-JSON callback content type" not in hermes_plugin_load_source
        or "inbound server did not reject malformed JSON" not in hermes_plugin_load_source
        or "inbound server did not reject non-finite JSON callback" not in hermes_plugin_load_source
        or "inbound server did not reject duplicate JSON callback key" not in hermes_plugin_load_source
        or "inbound server did not reject non-object JSON payload" not in hermes_plugin_load_source
        or "inbound server did not reject task callback without taskId" not in hermes_plugin_load_source
        or "inbound task did not trim event message id" not in hermes_plugin_load_source
        or "inbound task did not store trimmed task state" not in hermes_plugin_load_source
        or 'task_id = self._task_id_value(task.get("taskId"))' not in adapter_source
        or "inbound server did not reject task callback with non-string content" not in hermes_plugin_load_source
        or "inbound server did not reject task callback with malformed attachment" not in hermes_plugin_load_source
        or "inbound server did not reject task callback with malformed availableSkills" not in hermes_plugin_load_source
        or "inbound server applied callback with malformed nested task context" not in hermes_plugin_load_source
        or "inbound server did not reject cancel callback with blank taskId" not in hermes_plugin_load_source
        or 'asyncio.run(adapter._handle_arinova_cancel({"taskId": "  task-inbound-cancel  "}))' not in hermes_plugin_load_source
        or 'task_id = self._task_id_value(payload.get("taskId"))' not in adapter_source
        or "inbound server did not reject connection-status callback with non-boolean connected" not in hermes_plugin_load_source
        or "inbound server did not reject unknown callback field" not in hermes_plugin_load_source
        or "inbound server applied callback with unknown fields" not in hermes_plugin_load_source
        or "inbound server accepted unknown authenticated path" not in hermes_plugin_load_source
        or "inbound server did not dispatch authorized connection-status callback" not in hermes_plugin_load_source
        or "inbound server did not dispatch authorized token-claimed callback" not in hermes_plugin_load_source
        or "inbound malformed token-claimed callback changed adapter state" not in hermes_plugin_load_source
        or "inbound server did not dispatch authorized onboarding-seed callback" not in hermes_plugin_load_source
        or "inbound malformed onboarding-seed callback changed adapter state" not in hermes_plugin_load_source
        or "inbound server did not dispatch authorized sdk-error callback" not in hermes_plugin_load_source
        or "inbound server did not dispatch authorized auth-failed callback" not in hermes_plugin_load_source
        or 'assert_active_task_state_present("connection-status false"' not in hermes_plugin_load_source
        or "did not preserve active task state" not in hermes_plugin_load_source
        or "_task_context_by_task[task_id]" not in hermes_plugin_load_source
        or "contexts={adapter._task_context_by_task}" not in hermes_plugin_load_source
        or "self._task_context_by_task.clear()" not in adapter_source
        or "_schedule_cancel_sessions" not in adapter_source
        or "auth_failed did not cancel active Hermes sessions" not in hermes_plugin_load_source
        or "cancel_session_processing(key, release_guard=True, discard_pending=True)" not in adapter_source
        or "processing success left active task state" not in hermes_plugin_load_source
        or "processing failure left active task state" not in hermes_plugin_load_source
        or "processing cancellation left active task state" not in hermes_plugin_load_source
        or "terminal sidecar failure incorrectly cleared active task state" not in hermes_plugin_load_source
        or 'adapter._task_started_at.get("task-terminal-post-fail") != 123.0' not in hermes_plugin_load_source
        or "started_at={adapter._task_started_at}" not in hermes_plugin_load_source
        or "terminal_post_failures" not in hermes_plugin_load_source
        or "task without taskId should not download attachments or dispatch events" not in hermes_plugin_load_source
        or "non-finite attachment size leaked into task text" not in hermes_plugin_load_source
        or "disabled-nonfinite.txt (text/plain, id=att-disabled-nonfinite): https://files.example/disabled-nonfinite.txt" not in hermes_plugin_load_source
        or "math.isfinite(size)" not in adapter_source
        or "received task without taskId" not in adapter_source
        or "adapter accepted malformed onboarding seed state" not in hermes_plugin_load_source
        or "adapter rejected SDK-valid empty-string onboarding seed state" not in hermes_plugin_load_source
        or "function requiredTextField" not in sidecar_source
        or "content must be a string" not in sidecar_runtime_check_source
        or "error must be a string" not in sidecar_runtime_check_source
    )
    sidecar_lifecycle_contract_count = 1
    adapter_behavior_contract_count = 5
    tool_wrapper_coverage_missing = (
        "hello named fallback" not in arinova_tools_check_source
        or "sample_agent_args" not in arinova_tools_check_source
        or "set(sample_agent_args) == set(arinova_tools.AGENT_METHODS)" not in arinova_tools_check_source
        or "sample_task_args" not in arinova_tools_check_source
        or "set(sample_task_args) == set(arinova_tools.TASK_METHODS)" not in arinova_tools_check_source
        or 'generic_agent_props["method"]["enum"] == list(arinova_tools.AGENT_METHODS)' not in arinova_tools_check_source
        or 'generic_task_props["method"]["enum"] == list(arinova_tools.TASK_METHODS)' not in arinova_tools_check_source
        or "hello generic fallback" not in arinova_tools_check_source
        or "named_message_empty_content" not in arinova_tools_check_source
        or "generic_named_message_empty_content" not in arinova_tools_check_source
        or "bad_task_action_missing_args" not in arinova_tools_check_source
        or "bad_task_action_only" not in arinova_tools_check_source
        or "task_action_full_options" not in arinova_tools_check_source
        or '"parentCallId": "parent-call"' not in arinova_tools_check_source
        or '"metadata": {"source": "tool-wrapper"}' not in arinova_tools_check_source
        or '"dryRun": True' not in arinova_tools_check_source
        or "bad_task_action_args_type" not in arinova_tools_check_source
        or "bad_action_call_id_type" not in arinova_tools_check_source
        or "options.callId must be a string" not in arinova_tools_check_source
        or "bad_action_parent_call_id_type" not in arinova_tools_check_source
        or "options.parentCallId must be a string" not in arinova_tools_check_source
        or "bad_action_reason_type" not in arinova_tools_check_source
        or "options.reason must be a string" not in arinova_tools_check_source
        or "bad_action_conversation_id_type" not in arinova_tools_check_source
        or "options.conversationId must be a string" not in arinova_tools_check_source
        or "bad_action_task_id_type" not in arinova_tools_check_source
        or "options.taskId must be a string" not in arinova_tools_check_source
        or "bad_action_message_id_type" not in arinova_tools_check_source
        or "options.messageId must be a string" not in arinova_tools_check_source
        or "bad_action_metadata_type" not in arinova_tools_check_source
        or "options.metadata must be an object" not in arinova_tools_check_source
        or "bad_action_metadata_nonfinite" not in arinova_tools_check_source
        or "options.metadata.score contains a non-finite number" not in arinova_tools_check_source
        or "bad_action_args_nonfinite" not in arinova_tools_check_source
        or "action_args.score contains a non-finite number" not in arinova_tools_check_source
        or "bad_action_args_circular" not in arinova_tools_check_source
        or "action_args.self contains a circular reference" not in arinova_tools_check_source
        or "bad_action_dry_run_type" not in arinova_tools_check_source
        or "options.dryRun must be a boolean" not in arinova_tools_check_source
        or "bad_task_action_timeout_type" not in arinova_tools_check_source
        or "bad_global_action_missing_args" not in arinova_tools_check_source
        or "bad_global_action_args_type" not in arinova_tools_check_source
        or "action_args must be an object" not in arinova_tools_check_source
        or "bad_global_action_only" not in arinova_tools_check_source
        or "global_action_full_options" not in arinova_tools_check_source
        or '"taskId": "task-1"' not in arinova_tools_check_source
        or '"messageId": "msg-1"' not in arinova_tools_check_source
        or "schema missing" not in arinova_tools_check_source
        or "task {method} schema missing" not in arinova_tools_check_source
        or "generic-named-agent.txt" not in arinova_tools_check_source
        or "task-upload-explicit" not in arinova_tools_check_source
        or "hello camel" not in arinova_tools_check_source
        or "generic-camel-agent.txt" not in arinova_tools_check_source
        or "task-upload-camel" not in arinova_tools_check_source
        or "actionArgs" not in arinova_tools_check_source
        or "_payload_value" not in tools_source
        or "_schema_properties_with_aliases" not in tools_source
        or "_generic_schema_properties_with_aliases" not in tools_source
        or "_merge_generic_property_schema" not in tools_source
        or "Named `data` parameter for the selected SDK method." not in arinova_tools_check_source
        or '"oneOf" not in generic_agent_props["data"]' not in arinova_tools_check_source
        or "UPLOAD_FILE_SCHEMA" not in tools_source
        or '"oneOf": [' not in tools_source
        or '"required": ["base64"]' not in tools_source
        or '"required": ["path"]' not in tools_source
        or '"base64": {"type": "string", "description": "Base64-encoded file bytes."}' not in tools_source
        or '"path": {"type": "string", "description": "Local file path to read before upload."}' not in tools_source
        or "if schema is UPLOAD_FILE_SCHEMA:\n        if not isinstance(value, dict):" not in tools_source
        or "expected_upload_schema" not in arinova_tools_check_source
        or 'generic_agent_props["file"] == expected_upload_schema' not in arinova_tools_check_source
        or 'generic_task_props["file"] == expected_upload_schema' not in arinova_tools_check_source
        or 'upload_schema["parameters"]["properties"]["file"] == expected_upload_schema' not in arinova_tools_check_source
        or 'task_upload_schema["parameters"]["properties"]["file"] == expected_upload_schema' not in arinova_tools_check_source
        or "upload file path does not exist" not in arinova_tools_check_source
        or "upload file path must be a non-empty string" not in tools_source
        or "bad_path_type_upload" not in arinova_tools_check_source
        or "blank_task_path_upload" not in arinova_tools_check_source
        or "upload file path is not a file" not in arinova_tools_check_source
        or "BASE64_PATTERN" not in tools_source
        or "invalid_base64_upload" not in arinova_tools_check_source
        or "upload file base64 data is invalid" not in arinova_tools_check_source
        or "missing_upload_source" not in arinova_tools_check_source
        or "upload file must be {'base64':'...'} or {'path':'...'}" not in arinova_tools_check_source
        or 'set(value) - {"path", "base64"}' not in tools_source
        or "upload file has unsupported field(s)" not in tools_source
        or "unknown_upload_source" not in arinova_tools_check_source
        or "unknown_task_upload_source" not in arinova_tools_check_source
        or "upload file has unsupported field(s): extra" not in arinova_tools_check_source
        or "ambiguous_upload_source" not in arinova_tools_check_source
        or "ambiguous_task_upload_source" not in arinova_tools_check_source
        or "upload file must provide only one of path or base64" not in tools_source
        or "upload file must provide only one of path or base64" not in arinova_tools_check_source
        or 'CONVERSATION_SCOPED_TASK_METHODS: frozenset[str] = frozenset(("uploadFile", "fetchHistory"))' not in tools_source
        or "_task_conversation_scoped_error" not in tools_source
        or "cron_fetch_history" not in arinova_tools_check_source
        or "cron_upload_file" not in arinova_tools_check_source
        or "cron_call_action" not in arinova_tools_check_source
        or "generic_cron_call_action" not in arinova_tools_check_source
        or '"arinova.cron.generic"' not in arinova_tools_check_source
        or "taskKind=cron_wakeup" not in arinova_tools_check_source
        or "task_base64_type_upload" not in arinova_tools_check_source
        or "upload file base64 data must be a string" not in arinova_tools_check_source
        or "bad_named_file" not in arinova_tools_check_source
        or "bad_named_task_file" not in arinova_tools_check_source
        or "bad_named_file_name_type" not in arinova_tools_check_source
        or "bad_named_task_file_name_type" not in arinova_tools_check_source
        or "file_name must be a string" not in arinova_tools_check_source
        or "bad_named_file_type_type" not in arinova_tools_check_source
        or "bad_named_task_file_type_type" not in arinova_tools_check_source
        or "file_type must be a string" not in arinova_tools_check_source
        or "named_skill_prompt" not in arinova_tools_check_source
        or "named_share_note" not in arinova_tools_check_source
        or "generic_named_share_note" not in arinova_tools_check_source
        or "class FakeToolContext" not in arinova_tools_check_source
        or "arinova_tools.register_tools(tool_ctx)" not in arinova_tools_check_source
        or "expected_registered_tools" not in arinova_tools_check_source
        or "expected_registered_schemas" not in arinova_tools_check_source
        or "set(expected_registered_schemas) == set(expected_registered_tools)" not in arinova_tools_check_source
        or '"arinova_sdk_call", "arinova_task_call"' not in arinova_tools_check_source
        or 'tool["check_fn"] is arinova_tools.check_arinova_available' not in arinova_tools_check_source
        or 'tool["is_async"] is True' not in arinova_tools_check_source
        or 'tool["schema"]["name"] == name' not in arinova_tools_check_source
        or 'tool["schema"] == expected_registered_schemas[name]' not in arinova_tools_check_source
        or '"method": "shareNote", "conversationId": "conv-camel", "noteId": "note-camel"' not in arinova_tools_check_source
        or '("file", UPLOAD_FILE_SCHEMA)' not in tools_source
        or "path.exists()" not in tools_source
        or "path.is_file()" not in tools_source
        or "args must be an array when provided" not in tools_source
        or "bad_named_task_args" not in arinova_tools_check_source
        or "_required_string" not in tools_source
        or "_optional_string" not in tools_source
        or "return value.strip()" not in tools_source
        or "TRIMMED_STRING_ARGUMENTS" not in tools_source
        or "TRIMMED_STRING_FIELDS" not in tools_source
        or "TRIMMED_STRING_FIELDS_BY_ARGUMENT" not in tools_source
        or "TRIMMED_STRING_ARRAY_ARGUMENTS" not in tools_source
        or "_normalize_named_argument" not in tools_source
        or "trimmed_named_column_ids" not in arinova_tools_check_source
        or '"  col-a  "' not in arinova_tools_check_source
        or "trimmed_positional_column_ids" not in arinova_tools_check_source
        or '"  col-pos-a  "' not in arinova_tools_check_source
        or "trimmed_structured_history_cursors" not in arinova_tools_check_source
        or '"  msg-before  "' not in arinova_tools_check_source
        or "trimmed_structured_card_ids" not in arinova_tools_check_source
        or '" keep card title padding "' not in arinova_tools_check_source
        or "trimmed_report_identity_fields" not in arinova_tools_check_source
        or '"  session-report-trim  "' not in arinova_tools_check_source
        or '" keep tool name padding "' not in arinova_tools_check_source
        or "task_action_trimmed_option_ids" not in arinova_tools_check_source
        or '"callId": "  task-call-trim  "' not in arinova_tools_check_source
        or '"reason": " keep task reason padding "' not in arinova_tools_check_source
        or "global_action_trimmed_option_ids" not in arinova_tools_check_source
        or '"conversationId": "  conv-option-trim  "' not in arinova_tools_check_source
        or '"reason": " keep global reason padding "' not in arinova_tools_check_source
        or "generic_trimmed_method_message" not in arinova_tools_check_source
        or '"method": "  sendMessage  "' not in arinova_tools_check_source
        or "generic_trimmed_named_message_arg" not in arinova_tools_check_source
        or '"conversation_id": "  conv-generic-trim-arg  "' not in arinova_tools_check_source
        or "generic_trimmed_positional_message_arg" not in arinova_tools_check_source
        or '"  conv-generic-pos-trim  "' not in arinova_tools_check_source
        or "generic_trimmed_share_note_arg" not in arinova_tools_check_source
        or '"noteId": "  note-camel-trim  "' not in arinova_tools_check_source
        or "generic_trimmed_positional_share_note_arg" not in arinova_tools_check_source
        or '"  note-pos-trim  "' not in arinova_tools_check_source
        or "_validate_named_value" not in tools_source
        or "_validate_positional_args" not in tools_source
        or "_require_payload_object" not in tools_source
        or "tool payload must be a JSON object" not in tools_source
        or "non_object_generic_agent_payload" not in arinova_tools_check_source
        or "non_object_named_agent_payload" not in arinova_tools_check_source
        or "non_object_generic_task_payload" not in arinova_tools_check_source
        or "non_object_named_task_payload" not in arinova_tools_check_source
        or "_reject_unknown_payload_keys" not in tools_source
        or "bad_empty_positional_required" not in arinova_tools_check_source
        or "bad_missing_generic_required_args" not in arinova_tools_check_source
        or "bad_missing_named_required_args" not in arinova_tools_check_source
        or "bad_missing_task_required_args" not in arinova_tools_check_source
        or "bad_send_message_content_type" not in arinova_tools_check_source
        or "content must be a string" not in arinova_tools_check_source
        or "bad_send_hud_conversation_id_type" not in arinova_tools_check_source
        or "bad_skill_slug_type" not in arinova_tools_check_source
        or "skill_slug must be a string" not in arinova_tools_check_source
        or "bad_share_note_note_id_type" not in arinova_tools_check_source
        or "note_id must be a string" not in arinova_tools_check_source
        or "bad_update_card_id_type" not in arinova_tools_check_source
        or "card_id must be a string" not in arinova_tools_check_source
        or "bad_archive_board_id_type" not in arinova_tools_check_source
        or "board_id must be a string" not in arinova_tools_check_source
        or "bad_add_card_label_id_type" not in arinova_tools_check_source
        or "label_id must be a string" not in arinova_tools_check_source
        or "bad_delete_note_id_type" not in arinova_tools_check_source
        or "bad_delete_column_id_type" not in arinova_tools_check_source
        or "column_id must be a string" not in arinova_tools_check_source
        or "bad_link_card_note_card_id_type" not in arinova_tools_check_source
        or "bad_complete_card_id_type" not in arinova_tools_check_source
        or "bad_list_labels_board_id_type" not in arinova_tools_check_source
        or "bad_unlink_card_note_note_id_type" not in arinova_tools_check_source
        or "bad_list_columns_board_id_type" not in arinova_tools_check_source
        or "bad_list_card_commits_card_id_type" not in arinova_tools_check_source
        or "bad_remove_card_label_card_id_type" not in arinova_tools_check_source
        or "bad_delete_label_id_type" not in arinova_tools_check_source
        or "bad_update_board_id_type" not in arinova_tools_check_source
        or "bad_create_column_board_id_type" not in arinova_tools_check_source
        or "bad_archived_cards_board_id_type" not in arinova_tools_check_source
        or "bad_add_card_commit_card_id_type" not in arinova_tools_check_source
        or "bad_short_positional_required" not in arinova_tools_check_source
        or "bad_extra_no_arg_method" not in arinova_tools_check_source
        or "bad_positional_type" not in arinova_tools_check_source
        or "bad_task_positional_required" not in arinova_tools_check_source
        or "bad_task_positional_extra" not in arinova_tools_check_source
        or '"minItems"] == arinova_tools.REQUIRED_ARG_COUNTS.get(method, 0)' not in arinova_tools_check_source
        or '"maxItems"] == len(specs)' not in arinova_tools_check_source
        or '"minItems"] == arinova_tools.TASK_REQUIRED_ARG_COUNTS.get(method, 0)' not in arinova_tools_check_source
        or "expected_alias_props" not in arinova_tools_check_source
        or "schema missing aliases" not in arinova_tools_check_source
        or "task {method} schema missing aliases" not in arinova_tools_check_source
        or "min_items: int | None = None" not in tools_source
        or "schema[\"minItems\"] = min_items" not in tools_source
        or "schema[\"maxItems\"] = max_items" not in tools_source
        or "empty_task_id_alias" not in arinova_tools_check_source
        or "bad_named_options" not in arinova_tools_check_source
        or "global_optional_omitted" not in arinova_tools_check_source
        or "generic_optional_omitted" not in arinova_tools_check_source
        or "required_plus_optional_omitted" not in arinova_tools_check_source
        or "generic_required_plus_optional_omitted" not in arinova_tools_check_source
        or "required_plus_optional_present" not in arinova_tools_check_source
        or '"method": "listArchivedCards", "boardId": "board-camel"' not in arinova_tools_check_source
        or "path_upload_global" not in arinova_tools_check_source
        or "path_upload_task" not in arinova_tools_check_source
        or '"file": {"path": str(upload_path)}' not in arinova_tools_check_source
        or "task_optional_omitted" not in arinova_tools_check_source
        or "generic_task_optional_omitted" not in arinova_tools_check_source
        or "FETCH_HISTORY_OPTIONS_SCHEMA" not in tools_source
        or "CREATE_NOTE_BODY_SCHEMA" not in tools_source
        or "TASK_ACTION_OPTIONS_SCHEMA" not in tools_source
        or "TASK_UPDATE_DATA_SCHEMA" not in tools_source
        or "oneOf" not in tools_source
        or "enum" not in tools_source
        or "bad_task_update_missing_task" not in arinova_tools_check_source
        or "bad_task_update_status" not in arinova_tools_check_source
        or "bad_task_update_extra" not in arinova_tools_check_source
        or "bad_task_update_duration_type" not in arinova_tools_check_source
        or "data.durationMs must be a number" not in arinova_tools_check_source
        or "bad_task_update_cost_type" not in arinova_tools_check_source
        or "data.costUsd must be a number" not in arinova_tools_check_source
        or "bad_task_update_turns_type" not in arinova_tools_check_source
        or "data.numTurns must be a number" not in arinova_tools_check_source
        or "bad_task_update_agent_name_type" not in arinova_tools_check_source
        or "agent_name must be a string" not in arinova_tools_check_source
        or "global_hud" not in arinova_tools_check_source
        or '{"data": {"status": "global"}}' not in arinova_tools_check_source
        or 'global_hud["result"] is None' not in arinova_tools_check_source
        or "bad_telemetry_missing_data" not in arinova_tools_check_source
        or "bad_telemetry_event_type" not in arinova_tools_check_source
        or "event must be a string" not in arinova_tools_check_source
        or "VOID_AGENT_METHODS" not in arinova_tools_check_source
        or "VOID_AGENT_METHODS" not in tools_source
        or "method in VOID_AGENT_METHODS and result is not None" not in tools_source
        or "returned non-null void result" not in tools_source
        or "named_non_null_void" not in arinova_tools_check_source
        or "generic_non_null_void" not in arinova_tools_check_source
        or "Arinova SDK method {method} returned non-null void result" not in arinova_tools_check_source
        or "assert set(void_method_args) == VOID_AGENT_METHODS" not in arinova_tools_check_source
        or "assert VOID_AGENT_METHODS == set(arinova_tools.VOID_AGENT_METHODS)" not in arinova_tools_check_source
        or "return_void_agent_results" not in arinova_tools_check_source
        or 'assert named_void["result"] is None, method' not in arinova_tools_check_source
        or 'assert generic_void["result"] is None, method' not in arinova_tools_check_source
        or '"agentId": "agent-1"' not in arinova_tools_check_source
        or '"action": "open"' not in arinova_tools_check_source
        or "REQUIRED_ARG_COUNTS" not in tools_source
        or "TASK_REQUIRED_ARG_COUNTS" not in tools_source
        or "TOOL_CALL_REPORT_SCHEMA" not in tools_source
        or "bad_report_missing_required" not in arinova_tools_check_source
        or "bad_report_unknown_field" not in arinova_tools_check_source
        or "bad_report_input_type" not in arinova_tools_check_source
        or "bad_report_success_type" not in arinova_tools_check_source
        or "report.success must be a boolean" not in arinova_tools_check_source
        or "bad_report_seq_order_type" not in arinova_tools_check_source
        or "report.seqOrder must be a number" not in arinova_tools_check_source
        or "bad_report_session_id_type" not in arinova_tools_check_source
        or "report.sessionId must be a string" not in arinova_tools_check_source
        or "bad_report_tool_name_type" not in arinova_tools_check_source
        or "report.toolName must be a string" not in arinova_tools_check_source
        or "bad_report_duration_type" not in arinova_tools_check_source
        or "report.durationMs must be a number" not in arinova_tools_check_source
        or "math.isfinite" not in tools_source
        or "_validate_json_compliant" not in tools_source
        or "contains a non-finite number" not in tools_source
        or "contains a circular reference" not in tools_source
        or "allow_nan=False" not in tools_source
        or "Arinova tool result is not JSON-compliant" not in tools_source
        or "bad_report_duration_infinite" not in arinova_tools_check_source
        or "bad_report_output_nonfinite" not in arinova_tools_check_source
        or "report.output.value contains a non-finite number" not in arinova_tools_check_source
        or "nonfinite_agent_result" not in arinova_tools_check_source
        or "nonfinite_task_result" not in arinova_tools_check_source
        or "bad_report_message_id_type" not in arinova_tools_check_source
        or "report.messageId must be a string" not in arinova_tools_check_source
        or "failed_reported" not in arinova_tools_check_source
        or '"toolName": "arinova_sdk_call"' not in arinova_tools_check_source
        or '"error": "tool failed"' not in arinova_tools_check_source
        or "bad_nested_option" not in arinova_tools_check_source
        or "bad_fetch_history_limit_type" not in arinova_tools_check_source
        or "bad_fetch_history_limit_nan" not in arinova_tools_check_source
        or "bad_fetch_history_before_type" not in arinova_tools_check_source
        or "bad_fetch_history_after_type" not in arinova_tools_check_source
        or "bad_fetch_history_around_type" not in arinova_tools_check_source
        or "options.before must be a string" not in arinova_tools_check_source
        or "options.after must be a string" not in arinova_tools_check_source
        or "options.around must be a string" not in arinova_tools_check_source
        or "bad_nested_option_type" not in arinova_tools_check_source
        or "bad_list_notes_limit_type" not in arinova_tools_check_source
        or "bad_list_notes_before_type" not in arinova_tools_check_source
        or "bad_list_notes_offset_type" not in arinova_tools_check_source
        or "options.limit must be a number" not in arinova_tools_check_source
        or "bad_list_notes_tags_type" not in arinova_tools_check_source
        or "options.tags must be an array" not in arinova_tools_check_source
        or "bad_list_notes_archived_type" not in arinova_tools_check_source
        or "options.archived must be a boolean" not in arinova_tools_check_source
        or "bad_list_cards_limit_type" not in arinova_tools_check_source
        or "bad_list_cards_search_type" not in arinova_tools_check_source
        or "options.search must be a string" not in arinova_tools_check_source
        or "bad_list_cards_offset_type" not in arinova_tools_check_source
        or "options.offset must be a number" not in arinova_tools_check_source
        or "bad_archived_cards_page_type" not in arinova_tools_check_source
        or "options.page must be a number" not in arinova_tools_check_source
        or "bad_archived_cards_limit_type" not in arinova_tools_check_source
        or "bad_query_missing_required" not in arinova_tools_check_source
        or "bad_query_memory_query_type" not in arinova_tools_check_source
        or "bad_query_memory_limit_infinite" not in arinova_tools_check_source
        or "options.query must be a string" not in arinova_tools_check_source
        or "bad_query_memory_limit_type" not in arinova_tools_check_source
        or "empty_update_note" not in arinova_tools_check_source
        or "empty_update_card" not in arinova_tools_check_source
        or "empty_update_column" not in arinova_tools_check_source
        or "empty_update_label" not in arinova_tools_check_source
        or "empty_optional_arrays" not in arinova_tools_check_source
        or "bad_body_missing_required" not in arinova_tools_check_source
        or "bad_create_note_tags_item_type" not in arinova_tools_check_source
        or "bad_create_note_tags_type" not in arinova_tools_check_source
        or "bad_create_note_notebook_id_type" not in arinova_tools_check_source
        or "body.notebookId must be a string" not in arinova_tools_check_source
        or "bad_create_note_title_type" not in arinova_tools_check_source
        or "bad_create_note_content_type" not in arinova_tools_check_source
        or "bad_update_note_title_type" not in arinova_tools_check_source
        or "bad_update_note_content_type" not in arinova_tools_check_source
        or "body.content must be a string" not in arinova_tools_check_source
        or "bad_update_note_tags_item_type" not in arinova_tools_check_source
        or "bad_update_note_tags_type" not in arinova_tools_check_source
        or "body.tags must be an array" not in arinova_tools_check_source
        or "body.tags items must be strings" not in arinova_tools_check_source
        or "bad_update_card_sort_order_type" not in arinova_tools_check_source
        or "bad_create_column_sort_order_type" not in arinova_tools_check_source
        or "bad_update_column_sort_order_type" not in arinova_tools_check_source
        or "body.sortOrder must be a number" not in arinova_tools_check_source
        or "bad_update_card_title_type" not in arinova_tools_check_source
        or "bad_update_card_description_type" not in arinova_tools_check_source
        or "bad_update_card_priority_type" not in arinova_tools_check_source
        or "bad_update_card_column_id_type" not in arinova_tools_check_source
        or "bad_create_board_name_type" not in arinova_tools_check_source
        or "bad_create_board_column_name_type" not in arinova_tools_check_source
        or "bad_create_board_column_missing_name" not in arinova_tools_check_source
        or "bad_create_board_columns_type" not in arinova_tools_check_source
        or "bad_update_board_name_type" not in arinova_tools_check_source
        or "bad_column_missing_required" not in arinova_tools_check_source
        or "bad_create_column_name_type" not in arinova_tools_check_source
        or "bad_update_column_name_type" not in arinova_tools_check_source
        or "body.columns[0].name must be a string" not in arinova_tools_check_source
        or "body.columns[0].name is required" not in arinova_tools_check_source
        or "body.columns must be an array" not in arinova_tools_check_source
        or "bad_label_missing_required" not in arinova_tools_check_source
        or "bad_create_label_name_type" not in arinova_tools_check_source
        or "bad_create_label_color_type" not in arinova_tools_check_source
        or "bad_update_label_name_type" not in arinova_tools_check_source
        or "bad_update_label_color_type" not in arinova_tools_check_source
        or "body.color must be a string" not in arinova_tools_check_source
        or '"error": "body.name is required"' not in arinova_tools_check_source
        or "bad_commit_missing_required" not in arinova_tools_check_source
        or "bad_commit_hash_type" not in arinova_tools_check_source
        or "bad_commit_message_type" not in arinova_tools_check_source
        or "body.commitHash must be a string" not in arinova_tools_check_source
        or "body.message must be a string" not in arinova_tools_check_source
        or '"error": "body.commitHash is required"' not in arinova_tools_check_source
        or "bad_create_card_title_type" not in arinova_tools_check_source
        or "body.title must be a string" not in arinova_tools_check_source
        or "bad_create_card_column_id_type" not in arinova_tools_check_source
        or "body.columnId must be a string" not in arinova_tools_check_source
        or "bad_create_card_column_name_type" not in arinova_tools_check_source
        or "body.columnName must be a string" not in arinova_tools_check_source
        or "bad_create_card_board_id_type" not in arinova_tools_check_source
        or "body.boardId must be a string" not in arinova_tools_check_source
        or "bad_create_card_priority_type" not in arinova_tools_check_source
        or "body.priority must be a string" not in arinova_tools_check_source
        or "bad_create_card_description_type" not in arinova_tools_check_source
        or "body.description must be a string" not in arinova_tools_check_source
        or "schema_rejects_unknown_fields" not in arinova_tools_check_source
        or "with_unknown_field" not in arinova_tools_check_source
        or "named_payload_for" not in arinova_tools_check_source
        or 'for method, specs in arinova_tools.ARG_SPECS.items()' not in arinova_tools_check_source
        or 'for method, specs in arinova_tools.TASK_ARG_SPECS.items()' not in arinova_tools_check_source
        or '"__unknown_field__"' not in arinova_tools_check_source
        or "bad_body_unknown" not in arinova_tools_check_source
        or "bad_nested_body_item" not in arinova_tools_check_source
        or "bad_nested_body_item_type" not in arinova_tools_check_source
        or "body.columns[0] must be an object" not in arinova_tools_check_source
        or "bad_task_action_option" not in arinova_tools_check_source
        or "bad_action_timeout_type" not in arinova_tools_check_source
        or "bad_agent_action_name_type" not in arinova_tools_check_source
        or "bad_task_action_name_type" not in arinova_tools_check_source
        or "action must be a string" not in arinova_tools_check_source
        or "has unsupported field(s)" not in tools_source
        or "is required" not in tools_source
        or "bad_named_array" not in arinova_tools_check_source
        or "bad_named_array_items" not in arinova_tools_check_source
        or "items must be strings" not in tools_source
        or "bad_named_string" not in arinova_tools_check_source
        or "unknown_task_arg" not in arinova_tools_check_source
        or "irrelevant_generic_arg" not in arinova_tools_check_source
        or "irrelevant_task_arg" not in arinova_tools_check_source
        or "duplicate_alias_arg" not in arinova_tools_check_source
        or "duplicate_task_id_alias" not in arinova_tools_check_source
        or "duplicate_upload_file_name_alias" not in arinova_tools_check_source
        or "duplicate_task_action_args_alias" not in arinova_tools_check_source
        or "_provided_payload_keys" not in tools_source
        or "was provided more than once" not in tools_source
        or "mixed_args_and_named" not in arinova_tools_check_source
        or "mixed_named_tool_args" not in arinova_tools_check_source
        or "mixed_task_args_and_named" not in arinova_tools_check_source
        or "generic_named_message_with_empty_args" not in arinova_tools_check_source
        or "task_with_empty_args" not in arinova_tools_check_source
        or "args cannot be combined with named arguments" not in tools_source
        or "if has_args:" not in tools_source
        or "named_arg_gap" not in arinova_tools_check_source
        or "task_named_arg_gap" not in arinova_tools_check_source
        or "is required when using later named arguments" not in tools_source
        or '"additionalProperties": False' not in tools_source
        or '"additionalProperties"] is False' not in arinova_tools_check_source
        or "unsupported_task" not in arinova_tools_check_source
        or "unsupported_with_named_arg" not in arinova_tools_check_source
        or "unsupported_task_with_named_arg" not in arinova_tools_check_source
        or "stale_agent_handler" not in arinova_tools_check_source
        or "stale_agent_handler_named" not in arinova_tools_check_source
        or "stale_agent_handler_unknown" not in arinova_tools_check_source
        or "stale_task_handler" not in arinova_tools_check_source
        or "stale_task_handler_named" not in arinova_tools_check_source
        or "stale_task_handler_unknown" not in arinova_tools_check_source
        or "if method not in AGENT_METHODS:" not in tools_source
        or "if method not in TASK_METHODS:" not in tools_source
        or "Unsupported Arinova task SDK method: staleTaskMethod" not in arinova_tools_check_source
        or '"path": str(path)' not in arinova_tools_check_source
        or "agent_base64_upload" not in arinova_tools_check_source
        or "named_agent_base64_upload" not in arinova_tools_check_source
        or "named_agent_upload_without_type" not in arinova_tools_check_source
        or "task_base64_upload" not in arinova_tools_check_source
        or "task_upload_without_type" not in arinova_tools_check_source
        or "generic_task_base64_upload" not in arinova_tools_check_source
        or '"base64-agent.txt"' not in arinova_tools_check_source
        or '"named-agent-no-type.txt"' not in arinova_tools_check_source
        or '"task-no-type.txt"' not in arinova_tools_check_source
        or '"generic-base64-task.txt"' not in arinova_tools_check_source
        or "RunningDisconnectedAdapter" not in arinova_tools_check_source
        or "_adapter_active_task_id" not in tools_source
        or "_normalize_task_id" not in tools_source
        or "generic_trimmed_task" not in arinova_tools_check_source
        or "generic_trimmed_task_method" not in arinova_tools_check_source
        or '"method": "  callAction  "' not in arinova_tools_check_source
        or "generic_trimmed_task_action_arg" not in arinova_tools_check_source
        or '"action": "  noop  "' not in arinova_tools_check_source
        or "generic_trimmed_task_positional_action_arg" not in arinova_tools_check_source
        or '"task_id": "task-positional"' not in arinova_tools_check_source
        or "named_trimmed_task" not in arinova_tools_check_source
        or "MissingActiveTaskAdapter" not in arinova_tools_check_source
        or "explicit_task_without_active_helper" not in arinova_tools_check_source
        or "NonStringActiveTaskAdapter" not in arinova_tools_check_source
        or "No active Arinova task; provide task_id or call this while handling one task." not in arinova_tools_check_source
    )
    python_tool_wrapper_contract_count = len(expected_tools)
    tool_report_hook_missing = (
        manifest_hook_exposed != {"post_tool_call"}
        or 'ctx.register_hook("post_tool_call", _on_post_tool_call)' not in plugin_source
        or "reportToolCall" not in plugin_source
        or "math.isfinite" not in plugin_source
        or "_active_report_context" not in plugin_source
        or 'kwargs.get("function_name")' not in plugin_source
        or 'kwargs.get("function_args")' not in plugin_source
        or "post_tool_call hook reported a non-Arinova session" not in hermes_plugin_load_source
        or "post_tool_call hook reported while Arinova adapter was stopped" not in hermes_plugin_load_source
        or "post_tool_call hook reported while Arinova adapter was disconnected" not in hermes_plugin_load_source
        or "post_tool_call hook reported without a running adapter loop" not in hermes_plugin_load_source
        or "post_tool_call hook built unexpected report with derived session id" not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule second same-turn reportToolCall" not in hermes_plugin_load_source
        or "post_tool_call hook did not increment same-turn seqOrder" not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule function-name alias reportToolCall" not in hermes_plugin_load_source
        or "post_tool_call hook did not map function-name aliases" not in hermes_plugin_load_source
        or '"toolName": "terminal_alias"' not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule cross-session reportToolCall" not in hermes_plugin_load_source
        or "post_tool_call hook leaked seqOrder across sessions" not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule session-id fallback reportToolCall" not in hermes_plugin_load_source
        or "post_tool_call hook built unexpected session-id fallback report" not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule trimmed identity reportToolCall" not in hermes_plugin_load_source
        or "post_tool_call hook built unexpected trimmed identity report" not in hermes_plugin_load_source
        or "session_id = session_id.strip()" not in plugin_source
        or "hook_task_id = str(kwargs.get(\"task_id\") or \"\").strip()" not in plugin_source
        or '"output": "looked up by session"' not in hermes_plugin_load_source
        or "post_tool_call hook built unexpected failed report" not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule truncated reportToolCall" not in hermes_plugin_load_source
        or "...[truncated 50 chars]" not in hermes_plugin_load_source
        or "post_tool_call hook did not truncate long input" not in hermes_plugin_load_source
        or "post_tool_call hook did not truncate long output" not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule explicit-error reportToolCall" not in hermes_plugin_load_source
        or "explicit tool failure" not in hermes_plugin_load_source
        or "post_tool_call hook built unexpected explicit-error report" not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule error-type reportToolCall" not in hermes_plugin_load_source
        or "TypedToolFailure" not in hermes_plugin_load_source
        or "post_tool_call hook built unexpected error-type report" not in hermes_plugin_load_source
        or "error_type = kwargs.get(\"error_type\")" not in plugin_source
        or "post_tool_call hook did not schedule non-json reportToolCall" not in hermes_plugin_load_source
        or "PosixPath('/tmp/arinova-tool-result')" not in hermes_plugin_load_source
        or "post_tool_call hook built unexpected non-json report" not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule normalized-success reportToolCall" not in hermes_plugin_load_source
        or "post_tool_call hook did not schedule non-finite reportToolCall" not in hermes_plugin_load_source
        or 'status="SUCCESS"' not in hermes_plugin_load_source
        or '"durationMs": 0' not in hermes_plugin_load_source
        or "post_tool_call hook built unexpected normalized-success report" not in hermes_plugin_load_source
        or "post_tool_call hook built unexpected non-finite report" not in hermes_plugin_load_source
        or '"output": {"value": "-inf"}' not in hermes_plugin_load_source
        or "unknown-session" not in plugin_source
        or "_message_by_task" not in adapter_source
        or "_message_by_task" not in plugin_source
        or "msg-active" not in hermes_plugin_load_source
        or "did not preserve userMessageId for tool reports" not in hermes_plugin_load_source
        or "_tool_report_success" not in plugin_source
        or "automatic Hermes `post_tool_call`" not in readme_source
    )
    tool_report_hook_contract_count = 1
    schema_interface_map = {
        "FETCH_HISTORY_OPTIONS_SCHEMA": "FetchHistoryOptions",
        "LIST_NOTES_OPTIONS_SCHEMA": "ListNotesOptions",
        "CREATE_NOTE_BODY_SCHEMA": "CreateNoteBody",
        "UPDATE_NOTE_BODY_SCHEMA": "UpdateNoteBody",
        "CREATE_CARD_BODY_SCHEMA": "CreateCardBody",
        "UPDATE_CARD_BODY_SCHEMA": "UpdateCardBody",
        "CREATE_BOARD_BODY_SCHEMA": "CreateBoardBody",
        "UPDATE_BOARD_BODY_SCHEMA": "UpdateBoardBody",
        "CREATE_COLUMN_BODY_SCHEMA": "CreateColumnBody",
        "COLUMN_BODY_SCHEMA": "UpdateColumnBody",
        "ADD_COMMIT_BODY_SCHEMA": "AddCommitBody",
        "CREATE_LABEL_BODY_SCHEMA": "CreateLabelBody",
        "LABEL_BODY_SCHEMA": "UpdateLabelBody",
        "QUERY_MEMORY_OPTIONS_SCHEMA": "QueryMemoryOptions",
        "ACTION_OPTIONS_SCHEMA": "ActionCallOptions",
        "TOOL_CALL_REPORT_SCHEMA": "ToolCallReport",
    }
    schema_field_drift = {
        schema_name: {
            "expected": sorted(sdk_interface_fields.get(interface_name, set())),
            "actual": sorted(python_schema_fields(arinova_tools_path, schema_name)),
            "interface": interface_name,
        }
        for schema_name, interface_name in schema_interface_map.items()
        if python_schema_fields(arinova_tools_path, schema_name)
        != sdk_interface_fields.get(interface_name, set())
    }
    schema_required_drift = {
        schema_name: {
            "expected": sorted(interface_required_fields(sdk_types, interface_name)),
            "actual": sorted(python_schema_required_fields(arinova_tools_path, schema_name)),
            "interface": interface_name,
        }
        for schema_name, interface_name in schema_interface_map.items()
        if python_schema_required_fields(arinova_tools_path, schema_name)
        != interface_required_fields(sdk_types, interface_name)
    }
    schema_shape_drift = {
        schema_name: {
            "expected": interface_field_shapes(sdk_types, interface_name),
            "actual": python_schema_property_shapes(arinova_tools_path, schema_name),
            "interface": interface_name,
        }
        for schema_name, interface_name in schema_interface_map.items()
        if python_schema_property_shapes(arinova_tools_path, schema_name)
        != interface_field_shapes(sdk_types, interface_name)
    }
    task_action_expected_fields = sdk_interface_fields.get("ActionCallOptions", set()) - {
        "taskId",
        "conversationId",
        "messageId",
    }
    task_action_actual_fields = python_schema_fields(arinova_tools_path, "TASK_ACTION_OPTIONS_SCHEMA")
    if task_action_actual_fields != task_action_expected_fields:
        schema_field_drift["TASK_ACTION_OPTIONS_SCHEMA"] = {
            "expected": sorted(task_action_expected_fields),
            "actual": sorted(task_action_actual_fields),
            "interface": "Omit<ActionCallOptions, taskId | conversationId | messageId>",
        }
    task_action_expected_required = interface_required_fields(sdk_types, "ActionCallOptions") - {
        "taskId",
        "conversationId",
        "messageId",
    }
    task_action_actual_required = python_schema_required_fields(
        arinova_tools_path,
        "TASK_ACTION_OPTIONS_SCHEMA",
    )
    if task_action_actual_required != task_action_expected_required:
        schema_required_drift["TASK_ACTION_OPTIONS_SCHEMA"] = {
            "expected": sorted(task_action_expected_required),
            "actual": sorted(task_action_actual_required),
            "interface": "Omit<ActionCallOptions, taskId | conversationId | messageId>",
        }
    task_action_expected_shapes = {
        key: value
        for key, value in interface_field_shapes(sdk_types, "ActionCallOptions").items()
        if key not in {"taskId", "conversationId", "messageId"}
    }
    task_action_actual_shapes = python_schema_property_shapes(
        arinova_tools_path,
        "TASK_ACTION_OPTIONS_SCHEMA",
    )
    if task_action_actual_shapes != task_action_expected_shapes:
        schema_shape_drift["TASK_ACTION_OPTIONS_SCHEMA"] = {
            "expected": task_action_expected_shapes,
            "actual": task_action_actual_shapes,
            "interface": "Omit<ActionCallOptions, taskId | conversationId | messageId>",
        }
    task_update_expected_variants = type_alias_object_variants(sdk_types, "TaskUpdateData", "status")
    task_update_actual_variants = python_oneof_schema_variants(
        arinova_tools_path,
        "TASK_UPDATE_DATA_SCHEMA",
        "status",
    )
    for variant in sorted(set(task_update_expected_variants) | set(task_update_actual_variants)):
        expected = task_update_expected_variants.get(variant, {"fields": set(), "required": set(), "shapes": {}})
        actual = task_update_actual_variants.get(variant, {"fields": set(), "required": set(), "shapes": {}})
        schema_name = f"TASK_UPDATE_DATA_SCHEMA[{variant}]"
        if actual["fields"] != expected["fields"]:
            schema_field_drift[schema_name] = {
                "expected": sorted(expected["fields"]),
                "actual": sorted(actual["fields"]),
                "interface": f"TaskUpdateData status={variant}",
            }
        if actual["required"] != expected["required"]:
            schema_required_drift[schema_name] = {
                "expected": sorted(expected["required"]),
                "actual": sorted(actual["required"]),
                "interface": f"TaskUpdateData status={variant}",
            }
        if actual["shapes"] != expected["shapes"]:
            schema_shape_drift[schema_name] = {
                "expected": expected["shapes"],
                "actual": actual["shapes"],
                "interface": f"TaskUpdateData status={variant}",
            }
    list_cards_options_expected_fields = method_inline_object_param_fields(
        sdk_client_source,
        "export class ArinovaAgent",
        "listCards",
        "options",
    )
    list_cards_options_actual_fields = python_schema_fields(
        arinova_tools_path,
        "LIST_CARDS_OPTIONS_SCHEMA",
    )
    if list_cards_options_actual_fields != list_cards_options_expected_fields:
        schema_field_drift["LIST_CARDS_OPTIONS_SCHEMA"] = {
            "expected": sorted(list_cards_options_expected_fields),
            "actual": sorted(list_cards_options_actual_fields),
            "interface": "listCards options",
        }
    list_cards_options_expected_required = method_inline_object_param_required_fields(
        sdk_client_source,
        "export class ArinovaAgent",
        "listCards",
        "options",
    )
    list_cards_options_actual_required = python_schema_required_fields(
        arinova_tools_path,
        "LIST_CARDS_OPTIONS_SCHEMA",
    )
    if list_cards_options_actual_required != list_cards_options_expected_required:
        schema_required_drift["LIST_CARDS_OPTIONS_SCHEMA"] = {
            "expected": sorted(list_cards_options_expected_required),
            "actual": sorted(list_cards_options_actual_required),
            "interface": "listCards options",
        }
    list_cards_options_expected_shapes = method_inline_object_param_shapes(
        sdk_client_source,
        "export class ArinovaAgent",
        "listCards",
        "options",
    )
    list_cards_options_actual_shapes = python_schema_property_shapes(
        arinova_tools_path,
        "LIST_CARDS_OPTIONS_SCHEMA",
    )
    if list_cards_options_actual_shapes != list_cards_options_expected_shapes:
        schema_shape_drift["LIST_CARDS_OPTIONS_SCHEMA"] = {
            "expected": list_cards_options_expected_shapes,
            "actual": list_cards_options_actual_shapes,
            "interface": "listCards options",
        }
    archived_options_expected_fields = method_inline_object_param_fields(
        sdk_client_source,
        "export class ArinovaAgent",
        "listArchivedCards",
        "options",
    )
    archived_options_actual_fields = python_schema_fields(
        arinova_tools_path,
        "LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA",
    )
    if archived_options_actual_fields != archived_options_expected_fields:
        schema_field_drift["LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA"] = {
            "expected": sorted(archived_options_expected_fields),
            "actual": sorted(archived_options_actual_fields),
            "interface": "listArchivedCards options",
        }
    archived_options_expected_required = method_inline_object_param_required_fields(
        sdk_client_source,
        "export class ArinovaAgent",
        "listArchivedCards",
        "options",
    )
    archived_options_actual_required = python_schema_required_fields(
        arinova_tools_path,
        "LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA",
    )
    if archived_options_actual_required != archived_options_expected_required:
        schema_required_drift["LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA"] = {
            "expected": sorted(archived_options_expected_required),
            "actual": sorted(archived_options_actual_required),
            "interface": "listArchivedCards options",
        }
    archived_options_expected_shapes = method_inline_object_param_shapes(
        sdk_client_source,
        "export class ArinovaAgent",
        "listArchivedCards",
        "options",
    )
    archived_options_actual_shapes = python_schema_property_shapes(
        arinova_tools_path,
        "LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA",
    )
    if archived_options_actual_shapes != archived_options_expected_shapes:
        schema_shape_drift["LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA"] = {
            "expected": archived_options_expected_shapes,
            "actual": archived_options_actual_shapes,
            "interface": "listArchivedCards options",
        }
    complete_options_expected_fields = interface_callable_inline_object_param_fields(
        sdk_types,
        "TaskContext",
        "sendComplete",
        "options",
    )
    complete_options_actual_fields = sidecar_complete_option_fields(sidecar_source)
    if complete_options_actual_fields != complete_options_expected_fields:
        schema_field_drift["TASK_COMPLETE_OPTIONS"] = {
            "expected": sorted(complete_options_expected_fields),
            "actual": sorted(complete_options_actual_fields),
            "interface": "TaskContext.sendComplete options",
        }
    complete_options_expected_required = interface_callable_inline_object_param_required_fields(
        sdk_types,
        "TaskContext",
        "sendComplete",
        "options",
    )
    complete_options_actual_required: set[str] = set()
    if complete_options_actual_required != complete_options_expected_required:
        schema_required_drift["TASK_COMPLETE_OPTIONS"] = {
            "expected": sorted(complete_options_expected_required),
            "actual": sorted(complete_options_actual_required),
            "interface": "TaskContext.sendComplete options",
        }
    complete_options_expected_shapes = interface_callable_inline_object_param_shapes(
        sdk_types,
        "TaskContext",
        "sendComplete",
        "options",
    )
    complete_options_actual_shapes = sidecar_complete_option_shapes(sidecar_source)
    if complete_options_actual_shapes != complete_options_expected_shapes:
        schema_shape_drift["TASK_COMPLETE_OPTIONS"] = {
            "expected": complete_options_expected_shapes,
            "actual": complete_options_actual_shapes,
            "interface": "TaskContext.sendComplete options",
        }
    available_skills_expected_fields = interface_inline_array_object_fields(
        sdk_types,
        "TaskContext",
        "availableSkills",
    )
    available_skills_actual_fields = sidecar_fallback_available_skill_fields(sidecar_source)
    if available_skills_actual_fields != available_skills_expected_fields:
        schema_field_drift["TASK_AVAILABLE_SKILLS_FALLBACK"] = {
            "expected": sorted(available_skills_expected_fields),
            "actual": sorted(available_skills_actual_fields),
            "interface": "TaskContext.availableSkills[]",
        }
    available_skills_expected_required = interface_inline_array_object_required_fields(
        sdk_types,
        "TaskContext",
        "availableSkills",
    )
    available_skills_actual_required = available_skills_actual_fields
    if available_skills_actual_required != available_skills_expected_required:
        schema_required_drift["TASK_AVAILABLE_SKILLS_FALLBACK"] = {
            "expected": sorted(available_skills_expected_required),
            "actual": sorted(available_skills_actual_required),
            "interface": "TaskContext.availableSkills[]",
        }
    available_skills_expected_shapes = interface_inline_array_object_shapes(
        sdk_types,
        "TaskContext",
        "availableSkills",
        preserve_null=True,
    )
    available_skills_actual_shapes = sidecar_fallback_available_skill_shapes(sidecar_source)
    if available_skills_actual_shapes != available_skills_expected_shapes:
        schema_shape_drift["TASK_AVAILABLE_SKILLS_FALLBACK"] = {
            "expected": available_skills_expected_shapes,
            "actual": available_skills_actual_shapes,
            "interface": "TaskContext.availableSkills[]",
        }
    schema_alignment_contract_count = len(schema_interface_map) + 1 + len(task_update_expected_variants) + 4
    schema_field_alignment_contract_count = schema_alignment_contract_count
    schema_required_alignment_contract_count = schema_alignment_contract_count
    schema_shape_alignment_contract_count = schema_alignment_contract_count
    task_context_nested_e2e_drift = {}
    task_context_nested_e2e_specs = {
        "TaskContext.members[]": (
            interface_inline_array_object_fields(sdk_types, "TaskContext", "members"),
            object_literal_fields_after(sidecar_e2e_check_source, "members: [{"),
        ),
        "TaskContext.replyTo": (
            interface_inline_object_fields(sdk_types, "TaskContext", "replyTo"),
            object_literal_fields_after(sidecar_e2e_check_source, "replyTo: {"),
        ),
        "TaskContext.history[]": (
            interface_inline_array_object_fields(sdk_types, "TaskContext", "history"),
            object_literal_fields_after(sidecar_e2e_check_source, "history: [{"),
        ),
        "TaskContext.attachments[]": (
            interface_fields(sdk_types, "TaskAttachment"),
            object_literal_fields_after(sidecar_e2e_check_source, "attachments: [{"),
        ),
        "TaskContext.availableSkills[]": (
            interface_inline_array_object_fields(sdk_types, "TaskContext", "availableSkills"),
            object_literal_fields_after(sidecar_e2e_check_source, "availableSkills: [{"),
        ),
    }
    for label, (expected_fields, actual_fields) in task_context_nested_e2e_specs.items():
        if actual_fields != expected_fields:
            task_context_nested_e2e_drift[label] = {
                "expected": sorted(expected_fields),
                "actual": sorted(actual_fields),
            }
    task_context_nested_e2e_shape_drift = {}
    task_context_nested_e2e_shape_specs = {
        "TaskContext.members[]": (
            interface_inline_array_object_shapes(sdk_types, "TaskContext", "members", preserve_null=True),
            object_literal_array_item_shapes_after(sidecar_e2e_check_source, "members: ["),
        ),
        "TaskContext.replyTo": (
            interface_inline_object_shapes(sdk_types, "TaskContext", "replyTo", preserve_null=True),
            object_literal_shapes_after(sidecar_e2e_check_source, "replyTo: {"),
        ),
        "TaskContext.history[]": (
            interface_inline_array_object_shapes(sdk_types, "TaskContext", "history", preserve_null=True),
            object_literal_array_item_shapes_after(sidecar_e2e_check_source, "history: ["),
        ),
        "TaskContext.attachments[]": (
            interface_field_shapes(sdk_types, "TaskAttachment"),
            object_literal_array_item_shapes_after(sidecar_e2e_check_source, "attachments: ["),
        ),
        "TaskContext.availableSkills[]": (
            interface_inline_array_object_shapes(sdk_types, "TaskContext", "availableSkills", preserve_null=True),
            object_literal_array_item_shapes_after(sidecar_e2e_check_source, "availableSkills: ["),
        ),
    }
    for label, (expected_shapes, actual_shapes) in task_context_nested_e2e_shape_specs.items():
        if actual_shapes != expected_shapes:
            task_context_nested_e2e_shape_drift[label] = {
                "expected": expected_shapes,
                "actual": actual_shapes,
            }
    nested_schema_field_drift = {}
    board_column_expected_fields = interface_inline_array_object_fields(
        sdk_types,
        "CreateBoardBody",
        "columns",
    )
    board_column_actual_fields = python_schema_array_item_fields(
        arinova_tools_path,
        "CREATE_BOARD_BODY_SCHEMA",
        "columns",
    )
    if board_column_actual_fields != board_column_expected_fields:
        nested_schema_field_drift["CREATE_BOARD_BODY_SCHEMA.columns[]"] = {
            "expected": sorted(board_column_expected_fields),
            "actual": sorted(board_column_actual_fields),
            "interface": "CreateBoardBody.columns[]",
        }
    nested_schema_required_drift = {}
    board_column_expected_required = interface_inline_array_object_required_fields(
        sdk_types,
        "CreateBoardBody",
        "columns",
    )
    board_column_actual_required = python_schema_array_item_required_fields(
        arinova_tools_path,
        "CREATE_BOARD_BODY_SCHEMA",
        "columns",
    )
    if board_column_actual_required != board_column_expected_required:
        nested_schema_required_drift["CREATE_BOARD_BODY_SCHEMA.columns[]"] = {
            "expected": sorted(board_column_expected_required),
            "actual": sorted(board_column_actual_required),
            "interface": "CreateBoardBody.columns[]",
        }
    nested_schema_shape_drift = {}
    board_column_expected_shapes = interface_inline_array_object_shapes(
        sdk_types,
        "CreateBoardBody",
        "columns",
    )
    board_column_actual_shapes = python_schema_array_item_shapes(
        arinova_tools_path,
        "CREATE_BOARD_BODY_SCHEMA",
        "columns",
    )
    if board_column_actual_shapes != board_column_expected_shapes:
        nested_schema_shape_drift["CREATE_BOARD_BODY_SCHEMA.columns[]"] = {
            "expected": board_column_expected_shapes,
            "actual": board_column_actual_shapes,
            "interface": "CreateBoardBody.columns[]",
        }
    sidecar_schema_name_map = {
        schema_name: camel_schema_name(schema_name)
        for schema_name in {
            *schema_interface_map,
            "TASK_ACTION_OPTIONS_SCHEMA",
            "TASK_UPDATE_DATA_SCHEMA",
            "LIST_CARDS_OPTIONS_SCHEMA",
            "LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA",
            "STRING_ARRAY_SCHEMA",
        }
    }
    hermes_schema_contract_count = (
        len(schema_interface_map)
        + 1  # TASK_ACTION_OPTIONS_SCHEMA
        + len(task_update_expected_variants)
        + 2  # LIST_CARDS_OPTIONS_SCHEMA, LIST_ARCHIVED_CARDS_OPTIONS_SCHEMA
        + 3  # TASK_COMPLETE_OPTIONS, TASK_AVAILABLE_SKILLS_FALLBACK, STRING_ARRAY_SCHEMA
    )
    nested_schema_contract_count = 1  # CREATE_BOARD_BODY_SCHEMA.columns[]
    nested_schema_field_contract_count = nested_schema_contract_count
    nested_schema_required_contract_count = nested_schema_contract_count
    nested_schema_shape_contract_count = nested_schema_contract_count
    sidecar_schema_exports = sidecar_schema_values(
        ROOT / "sidecar/runtime.mjs",
        {*set(sidecar_schema_name_map.values()), "uploadFileSchema"},
    )
    sidecar_upload_schema_drift = {}
    sidecar_upload_schema = sidecar_schema_exports.get("uploadFileSchema")
    expected_sidecar_upload_schema = {
        "type": "object",
        "properties": {"base64": {"type": "string"}},
        "required": ["base64"],
        "additionalProperties": False,
    }
    sidecar_upload_schema_contract_count = 1
    if sidecar_upload_schema != expected_sidecar_upload_schema:
        sidecar_upload_schema_drift["uploadFileSchema"] = {
            "expected": expected_sidecar_upload_schema,
            "actual": sidecar_upload_schema,
        }
    sidecar_schema_field_drift: dict[str, dict[str, Any]] = {}
    sidecar_schema_required_drift: dict[str, dict[str, Any]] = {}
    sidecar_schema_shape_drift: dict[str, dict[str, Any]] = {}
    sidecar_nested_schema_field_drift: dict[str, dict[str, Any]] = {}
    sidecar_nested_schema_required_drift: dict[str, dict[str, Any]] = {}
    sidecar_nested_schema_shape_drift: dict[str, dict[str, Any]] = {}
    sidecar_schema_field_contract_count = len(sidecar_schema_name_map) - 1  # STRING_ARRAY_SCHEMA is root-shape only.
    sidecar_schema_required_contract_count = sidecar_schema_field_contract_count
    sidecar_schema_shape_contract_count = len(sidecar_schema_name_map)
    sidecar_nested_schema_field_contract_count = nested_schema_contract_count
    sidecar_nested_schema_required_contract_count = nested_schema_contract_count
    sidecar_nested_schema_shape_contract_count = nested_schema_contract_count
    for python_schema_name, sidecar_schema_name in sorted(sidecar_schema_name_map.items()):
        python_value = python_module_value(arinova_tools_path, python_schema_name)
        sidecar_value = sidecar_schema_exports.get(sidecar_schema_name)
        if sidecar_value is None:
            sidecar_schema_field_drift[python_schema_name] = {
                "expected": sorted(schema_fields_value(python_value, f"Python `{python_schema_name}`"))
                if isinstance(python_value, dict) and isinstance(python_value.get("properties"), dict)
                else [],
                "actual": [],
                "interface": f"sidecar {sidecar_schema_name}",
            }
            continue
        if isinstance(python_value, dict) and isinstance(python_value.get("properties"), dict):
            python_fields = schema_fields_value(python_value, f"Python `{python_schema_name}`")
            sidecar_fields = schema_fields_value(sidecar_value, f"sidecar `{sidecar_schema_name}`")
            if sidecar_fields != python_fields:
                sidecar_schema_field_drift[python_schema_name] = {
                    "expected": sorted(python_fields),
                    "actual": sorted(sidecar_fields),
                    "interface": f"sidecar {sidecar_schema_name}",
                }
            python_required = schema_required_fields_value(python_value, f"Python `{python_schema_name}`")
            sidecar_required = schema_required_fields_value(sidecar_value, f"sidecar `{sidecar_schema_name}`")
            if sidecar_required != python_required:
                sidecar_schema_required_drift[python_schema_name] = {
                    "expected": sorted(python_required),
                    "actual": sorted(sidecar_required),
                    "interface": f"sidecar {sidecar_schema_name}",
                }
            python_shapes = schema_property_shapes_value(python_value, f"Python `{python_schema_name}`")
            sidecar_shapes = schema_property_shapes_value(sidecar_value, f"sidecar `{sidecar_schema_name}`")
            if sidecar_shapes != python_shapes:
                sidecar_schema_shape_drift[python_schema_name] = {
                    "expected": python_shapes,
                    "actual": sidecar_shapes,
                    "interface": f"sidecar {sidecar_schema_name}",
                }
        elif python_schema_name == "TASK_UPDATE_DATA_SCHEMA":
            python_variants = oneof_schema_variants_value(
                python_value,
                f"Python `{python_schema_name}`",
                "status",
            )
            sidecar_variants = oneof_schema_variants_value(
                sidecar_value,
                f"sidecar `{sidecar_schema_name}`",
                "status",
            )
            for variant in sorted(set(python_variants) | set(sidecar_variants)):
                python_variant = python_variants.get(variant, {"fields": set(), "required": set(), "shapes": {}})
                sidecar_variant = sidecar_variants.get(variant, {"fields": set(), "required": set(), "shapes": {}})
                variant_name = f"{python_schema_name}[{variant}]"
                if sidecar_variant["fields"] != python_variant["fields"]:
                    sidecar_schema_field_drift[variant_name] = {
                        "expected": sorted(python_variant["fields"]),
                        "actual": sorted(sidecar_variant["fields"]),
                        "interface": f"sidecar {sidecar_schema_name}",
                    }
                if sidecar_variant["required"] != python_variant["required"]:
                    sidecar_schema_required_drift[variant_name] = {
                        "expected": sorted(python_variant["required"]),
                        "actual": sorted(sidecar_variant["required"]),
                        "interface": f"sidecar {sidecar_schema_name}",
                    }
                if sidecar_variant["shapes"] != python_variant["shapes"]:
                    sidecar_schema_shape_drift[variant_name] = {
                        "expected": python_variant["shapes"],
                        "actual": sidecar_variant["shapes"],
                        "interface": f"sidecar {sidecar_schema_name}",
                    }
        elif json_schema_property_shape(sidecar_value) != json_schema_property_shape(python_value):
            sidecar_schema_shape_drift[python_schema_name] = {
                "expected": {"<root>": json_schema_property_shape(python_value)},
                "actual": {"<root>": json_schema_property_shape(sidecar_value)},
                "interface": f"sidecar {sidecar_schema_name}",
            }
    sidecar_board_column_fields = schema_array_item_fields_value(
        sidecar_schema_exports["createBoardBodySchema"],
        "sidecar `createBoardBodySchema`",
        "columns",
    )
    if sidecar_board_column_fields != board_column_actual_fields:
        sidecar_nested_schema_field_drift["CREATE_BOARD_BODY_SCHEMA.columns[]"] = {
            "expected": sorted(board_column_actual_fields),
            "actual": sorted(sidecar_board_column_fields),
            "interface": "sidecar createBoardBodySchema.columns[]",
        }
    sidecar_board_column_required = schema_array_item_required_fields_value(
        sidecar_schema_exports["createBoardBodySchema"],
        "sidecar `createBoardBodySchema`",
        "columns",
    )
    if sidecar_board_column_required != board_column_actual_required:
        sidecar_nested_schema_required_drift["CREATE_BOARD_BODY_SCHEMA.columns[]"] = {
            "expected": sorted(board_column_actual_required),
            "actual": sorted(sidecar_board_column_required),
            "interface": "sidecar createBoardBodySchema.columns[]",
        }
    sidecar_board_column_shapes = schema_array_item_shapes_value(
        sidecar_schema_exports["createBoardBodySchema"],
        "sidecar `createBoardBodySchema`",
        "columns",
    )
    if sidecar_board_column_shapes != board_column_actual_shapes:
        sidecar_nested_schema_shape_drift["CREATE_BOARD_BODY_SCHEMA.columns[]"] = {
            "expected": board_column_actual_shapes,
            "actual": sidecar_board_column_shapes,
            "interface": "sidecar createBoardBodySchema.columns[]",
        }
    tab_indented_files = sorted(
        name
        for name, source in {
            "sidecar/runtime.mjs": sidecar_source,
            "sidecar/index.mjs": sidecar_index_source,
            "sidecar/check-runtime.mjs": sidecar_runtime_check_source,
            "sidecar/check-sdk-e2e.mjs": sidecar_e2e_check_source,
            "sidecar/check-sdk-http.mjs": sidecar_http_check_source,
            "arinova_tools.py": tools_source,
            "adapter.py": adapter_source,
            "__init__.py": plugin_source,
        }.items()
        if "\t" in source
    )
    runtime_param_drift = {
        method: sdk_method_params.get(method)
        for method in sorted(sdk_methods & installed_methods)
        if sdk_method_params.get(method) != installed_method_params.get(method)
    }
    runtime_task_param_drift = {
        method: sdk_task_helper_params.get(method)
        for method in sorted(sdk_task_helpers & installed_task_helpers)
        if sdk_task_helper_params.get(method) != installed_task_helper_params.get(method)
    }
    runtime_return_drift = {
        method: sdk_method_returns.get(method)
        for method in sorted(sdk_methods & installed_methods)
        if sdk_method_returns.get(method) != installed_method_returns.get(method)
    }
    python_void_return_missing = sorted(sdk_void_agent_methods - python_void_agent_methods)
    python_void_return_stale = sorted(python_void_agent_methods - sdk_void_agent_methods)
    adapter_void_return_missing = sorted(sdk_void_agent_methods - adapter_void_agent_methods)
    adapter_void_return_stale = sorted(adapter_void_agent_methods - sdk_void_agent_methods)
    runtime_task_return_drift = {
        method: sdk_task_helper_returns.get(method)
        for method in sorted(sdk_task_helpers & installed_task_helpers)
        if sdk_task_helper_returns.get(method) != installed_task_helper_returns.get(method)
    }
    runtime_task_callable_param_drift = {
        name: sdk_task_callable_params.get(name)
        for name in sorted(set(sdk_task_callable_params) & set(installed_task_callable_params))
        if sdk_task_callable_params.get(name) != installed_task_callable_params.get(name)
    }
    runtime_task_callable_return_drift = {
        name: sdk_task_callable_returns.get(name)
        for name in sorted(set(sdk_task_callable_returns) & set(installed_task_callable_returns))
        if sdk_task_callable_returns.get(name) != installed_task_callable_returns.get(name)
    }
    installed_task_callable_names = set(installed_task_callable_params) | set(installed_task_callable_returns)
    runtime_task_callable_category_drift = {}
    if installed_task_callable_names - sdk_task_callable_category_members:
        runtime_task_callable_category_drift["uncategorized"] = sorted(
            installed_task_callable_names - sdk_task_callable_category_members
        )
    if sdk_task_callable_category_members - installed_task_callable_names:
        runtime_task_callable_category_drift["missing"] = sorted(
            sdk_task_callable_category_members - installed_task_callable_names
        )
    runtime_type_symbol_missing = sorted(sdk_type_symbols - installed_type_symbols)
    runtime_type_symbol_extra = sorted(installed_type_symbols - sdk_type_symbols)
    runtime_interface_field_drift = {
        name: sorted(sdk_interface_fields[name])
        for name in sorted(set(sdk_interface_fields) & set(installed_interface_fields))
        if sdk_interface_fields[name] != installed_interface_fields[name]
    }
    runtime_interface_required_drift = {
        name: sorted(sdk_interface_required_fields[name])
        for name in sorted(set(sdk_interface_required_fields) & set(installed_interface_required_fields))
        if sdk_interface_required_fields[name] != installed_interface_required_fields[name]
    }
    runtime_interface_shape_drift = {
        name: sdk_interface_shapes[name]
        for name in sorted(set(sdk_interface_shapes) & set(installed_interface_shapes))
        if sdk_interface_shapes[name] != installed_interface_shapes[name]
    }
    runtime_task_context_nested_field_drift = {}
    runtime_task_context_nested_required_drift = {}
    runtime_task_context_nested_shape_drift = {}
    runtime_task_context_nested_specs = {
        "TaskContext.members[]": (
            interface_inline_array_object_fields(sdk_types, "TaskContext", "members"),
            interface_inline_array_object_fields(installed_types, "TaskContext", "members"),
            interface_inline_array_object_required_fields(sdk_types, "TaskContext", "members"),
            interface_inline_array_object_required_fields(installed_types, "TaskContext", "members"),
            interface_inline_array_object_shapes(sdk_types, "TaskContext", "members", preserve_null=True),
            interface_inline_array_object_shapes(installed_types, "TaskContext", "members", preserve_null=True),
        ),
        "TaskContext.replyTo": (
            interface_inline_object_fields(sdk_types, "TaskContext", "replyTo"),
            interface_inline_object_fields(installed_types, "TaskContext", "replyTo"),
            interface_inline_object_required_fields(sdk_types, "TaskContext", "replyTo"),
            interface_inline_object_required_fields(installed_types, "TaskContext", "replyTo"),
            interface_inline_object_shapes(sdk_types, "TaskContext", "replyTo", preserve_null=True),
            interface_inline_object_shapes(installed_types, "TaskContext", "replyTo", preserve_null=True),
        ),
        "TaskContext.history[]": (
            interface_inline_array_object_fields(sdk_types, "TaskContext", "history"),
            interface_inline_array_object_fields(installed_types, "TaskContext", "history"),
            interface_inline_array_object_required_fields(sdk_types, "TaskContext", "history"),
            interface_inline_array_object_required_fields(installed_types, "TaskContext", "history"),
            interface_inline_array_object_shapes(sdk_types, "TaskContext", "history", preserve_null=True),
            interface_inline_array_object_shapes(installed_types, "TaskContext", "history", preserve_null=True),
        ),
        "TaskContext.attachments[]": (
            interface_fields(sdk_types, "TaskAttachment"),
            interface_fields(installed_types, "TaskAttachment"),
            interface_required_fields(sdk_types, "TaskAttachment"),
            interface_required_fields(installed_types, "TaskAttachment"),
            interface_field_shapes(sdk_types, "TaskAttachment"),
            interface_field_shapes(installed_types, "TaskAttachment"),
        ),
        "TaskContext.availableSkills[]": (
            interface_inline_array_object_fields(sdk_types, "TaskContext", "availableSkills"),
            interface_inline_array_object_fields(installed_types, "TaskContext", "availableSkills"),
            interface_inline_array_object_required_fields(sdk_types, "TaskContext", "availableSkills"),
            interface_inline_array_object_required_fields(installed_types, "TaskContext", "availableSkills"),
            interface_inline_array_object_shapes(sdk_types, "TaskContext", "availableSkills", preserve_null=True),
            interface_inline_array_object_shapes(installed_types, "TaskContext", "availableSkills", preserve_null=True),
        ),
    }
    for label, (
        expected_fields,
        actual_fields,
        expected_required,
        actual_required,
        expected_shapes,
        actual_shapes,
    ) in (
        runtime_task_context_nested_specs.items()
    ):
        if actual_fields != expected_fields:
            runtime_task_context_nested_field_drift[label] = {
                "expected": sorted(expected_fields),
                "actual": sorted(actual_fields),
            }
        if actual_required != expected_required:
            runtime_task_context_nested_required_drift[label] = {
                "expected": sorted(expected_required),
                "actual": sorted(actual_required),
            }
        if actual_shapes != expected_shapes:
            runtime_task_context_nested_shape_drift[label] = {
                "expected": expected_shapes,
                "actual": actual_shapes,
            }
    runtime_type_alias_body_drift = {
        name: {
            "expected": sdk_type_alias_bodies[name],
            "actual": installed_type_alias_bodies.get(name, ""),
        }
        for name in sorted(set(sdk_type_alias_bodies) & set(installed_type_alias_bodies))
        if sdk_type_alias_bodies[name] != installed_type_alias_bodies[name]
    }
    runtime_public_type_missing = sorted(sdk_public_types - installed_public_types)
    runtime_public_type_extra = sorted(installed_public_types - sdk_public_types)
    runtime_public_value_missing = sorted(sdk_public_values - installed_public_values)
    runtime_public_value_extra = sorted(installed_public_values - sdk_public_values)
    runtime_action_protocol_drift = sdk_action_protocol != installed_action_protocol
    runtime_agent_param_contract_count = len(sdk_methods & installed_methods)
    runtime_task_param_contract_count = len(sdk_task_helpers & installed_task_helpers)
    runtime_agent_return_contract_count = runtime_agent_param_contract_count
    runtime_task_return_contract_count = runtime_task_param_contract_count
    runtime_task_callable_param_contract_count = len(
        set(sdk_task_callable_params) & set(installed_task_callable_params)
    )
    runtime_task_callable_return_contract_count = len(
        set(sdk_task_callable_returns) & set(installed_task_callable_returns)
    )
    runtime_task_reply_callable_contract_count = len(sdk_task_reply_callables & installed_task_callable_names)
    runtime_task_sdk_helper_callable_contract_count = len(
        sdk_task_sdk_helper_callables & installed_task_callable_names
    )
    runtime_type_symbol_contract_count = len(sdk_type_symbols | installed_type_symbols)
    runtime_interface_field_contract_count = len(set(sdk_interface_fields) & set(installed_interface_fields))
    runtime_interface_required_contract_count = len(
        set(sdk_interface_required_fields) & set(installed_interface_required_fields)
    )
    runtime_interface_shape_contract_count = len(set(sdk_interface_shapes) & set(installed_interface_shapes))
    runtime_task_context_nested_field_contract_count = len(runtime_task_context_nested_specs)
    runtime_task_context_nested_required_contract_count = len(runtime_task_context_nested_specs)
    runtime_task_context_nested_shape_contract_count = len(runtime_task_context_nested_specs)
    runtime_type_alias_contract_count = len(set(sdk_type_alias_bodies) & set(installed_type_alias_bodies))
    runtime_public_type_contract_count = len(sdk_public_types | installed_public_types)
    runtime_public_value_contract_count = len(sdk_public_values | installed_public_values)
    runtime_action_protocol_contract_count = 1
    python_drift = sorted(exposed ^ python_exposed)
    python_task_drift = sorted(exposed_task ^ python_task_exposed)
    python_duplicate_literal_keys = {
        name: duplicates
        for name, duplicates in {
            "adapter.py": python_duplicate_string_literal_keys(adapter_source),
            "__init__.py": python_duplicate_string_literal_keys(plugin_source),
            "arinova_tools.py": python_duplicate_string_literal_keys(tools_source),
            "scripts/check_local.py": python_duplicate_string_literal_keys(local_check_source),
            "scripts/check_agent_sdk_source.py": python_duplicate_string_literal_keys(agent_sdk_source_check_source),
            "scripts/check_arinova_tools.py": python_duplicate_string_literal_keys(arinova_tools_check_source),
            "scripts/check_clean_install.py": python_duplicate_string_literal_keys(clean_install_source),
            "scripts/check_gateway_config_load.py": python_duplicate_string_literal_keys(gateway_config_source),
            "scripts/check_hermes_plugin_load.py": python_duplicate_string_literal_keys(hermes_plugin_load_source),
            "scripts/check_live_connection.py": python_duplicate_string_literal_keys(live_connection_source),
            "scripts/check_live_connection_gate.py": python_duplicate_string_literal_keys(live_connection_gate_source),
            "scripts/check_user_install.py": python_duplicate_string_literal_keys(user_install_source),
        }.items()
        if duplicates
    }
    duplicate_key_scanner_contract_missing = (
        len(python_duplicate_string_literal_keys('x = {"a": 1, "a": 2, "b": {"c": 1, "c": 2}}')) != 2
        or len(js_duplicate_string_literal_keys('const x = { a: 1, "a": 2, b: { c: 1, c: 2 } };')) != 2
        or js_map_duplicate_string_keys(
            'const sdkCounts = new Map([\n  ["a", 1],\n  ["b", 2],\n  ["a", 3]\n]);',
            "sdkCounts",
        ) != ["a"]
    )
    sidecar_duplicate_literal_keys = {
        name: duplicates
        for name, duplicates in {
            "sidecar/index.mjs": js_duplicate_string_literal_keys(sidecar_index_source),
            "sidecar/runtime.mjs": js_duplicate_string_literal_keys(sidecar_source),
            "sidecar/check-runtime.mjs": js_duplicate_string_literal_keys(sidecar_runtime_check_source),
            "sidecar/check-sdk-e2e.mjs": js_duplicate_string_literal_keys(sidecar_e2e_check_source),
            "sidecar/check-sdk-http.mjs": js_duplicate_string_literal_keys(sidecar_http_check_source),
        }.items()
        if duplicates
    }
    duplicate_key_scanner_contract_count = 16
    sidecar_duplicate_map_keys = {
        name: duplicates
        for name, duplicates in {
            "agentRequiredArgCounts": js_map_duplicate_string_keys(sidecar_source, "agentRequiredArgCounts"),
            "agentMaxArgCounts": js_map_duplicate_string_keys(sidecar_source, "agentMaxArgCounts"),
            "taskRequiredArgCounts": js_map_duplicate_string_keys(sidecar_source, "taskRequiredArgCounts"),
            "taskMaxArgCounts": js_map_duplicate_string_keys(sidecar_source, "taskMaxArgCounts"),
            "agentArgTypes": js_map_duplicate_string_keys(sidecar_source, "agentArgTypes"),
            "taskArgTypes": js_map_duplicate_string_keys(sidecar_source, "taskArgTypes"),
            "agentArgNames": js_map_duplicate_string_keys(sidecar_source, "agentArgNames"),
            "taskArgNames": js_map_duplicate_string_keys(sidecar_source, "taskArgNames"),
            "agentArgSchemas": js_map_duplicate_string_keys(sidecar_source, "agentArgSchemas"),
            "taskArgSchemas": js_map_duplicate_string_keys(sidecar_source, "taskArgSchemas"),
        }.items()
        if duplicates
    }
    sidecar_duplicate_map_key_contract_count = 10
    expected_named_args = {
        method: [tool_param_name(param) for param in sdk_method_params.get(method, [])]
        for method in exposed
        if sdk_method_params.get(method)
    }
    expected_task_named_args = {
        method: [tool_param_name(param) for param in sdk_task_helper_params.get(method, [])]
        for method in exposed_task
        if sdk_task_helper_params.get(method)
    }
    expected_required_arg_counts = {
        method: required_count
        for method in exposed
        for required_count in [sdk_method_required_counts.get(method, 0)]
        if required_count > 0
    }
    expected_task_required_arg_counts = {
        method: required_count
        for method in exposed_task
        for required_count in [sdk_task_helper_required_counts.get(method, 0)]
        if required_count > 0
    }
    expected_sidecar_max_arg_counts = {
        method: sdk_method_max_counts.get(method, 0)
        for method in exposed
    }
    expected_sidecar_task_max_arg_counts = {
        method: sdk_task_helper_max_counts.get(method, 0)
        for method in exposed_task
    }
    expected_agent_schema_arg_bounds = {
        method: {
            "minItems": sdk_method_required_counts.get(method, 0),
            "maxItems": sdk_method_max_counts.get(method, 0),
        }
        for method in exposed
    }
    expected_task_schema_arg_bounds = {
        method: {
            "minItems": sdk_task_helper_required_counts.get(method, 0),
            "maxItems": sdk_task_helper_max_counts.get(method, 0),
        }
        for method in exposed_task
    }
    python_max_arg_counts = {
        method: len(python_named_args.get(method, []))
        for method in exposed
    }
    python_task_max_arg_counts = {
        method: len(python_task_named_args.get(method, []))
        for method in exposed_task
    }
    named_arg_missing = {
        method: expected
        for method, expected in expected_named_args.items()
        if python_named_args.get(method) != expected
    }
    named_arg_stale = sorted(set(python_named_args) - set(expected_named_args))
    task_named_arg_missing = {
        method: expected
        for method, expected in expected_task_named_args.items()
        if python_task_named_args.get(method) != expected
    }
    task_named_arg_stale = sorted(set(python_task_named_args) - set(expected_task_named_args))
    required_arg_count_drift = {
        method: expected
        for method, expected in expected_required_arg_counts.items()
        if python_required_arg_counts.get(method) != expected
    }
    required_arg_count_stale = sorted(set(python_required_arg_counts) - set(expected_required_arg_counts))
    task_required_arg_count_drift = {
        method: expected
        for method, expected in expected_task_required_arg_counts.items()
        if python_task_required_arg_counts.get(method) != expected
    }
    task_required_arg_count_stale = sorted(
        set(python_task_required_arg_counts) - set(expected_task_required_arg_counts)
    )
    max_arg_count_drift = {
        method: expected
        for method, expected in expected_sidecar_max_arg_counts.items()
        if python_max_arg_counts.get(method) != expected
    }
    task_max_arg_count_drift = {
        method: expected
        for method, expected in expected_sidecar_task_max_arg_counts.items()
        if python_task_max_arg_counts.get(method) != expected
    }
    agent_schema_arg_bound_drift = {
        method: {
            "expected": expected,
            "actual": python_agent_schema_arg_bounds.get(method),
        }
        for method, expected in sorted(expected_agent_schema_arg_bounds.items())
        if python_agent_schema_arg_bounds.get(method) != expected
    }
    agent_schema_arg_bound_stale = sorted(set(python_agent_schema_arg_bounds) - set(expected_agent_schema_arg_bounds))
    task_schema_arg_bound_drift = {
        method: {
            "expected": expected,
            "actual": python_task_schema_arg_bounds.get(method),
        }
        for method, expected in sorted(expected_task_schema_arg_bounds.items())
        if python_task_schema_arg_bounds.get(method) != expected
    }
    task_schema_arg_bound_stale = sorted(set(python_task_schema_arg_bounds) - set(expected_task_schema_arg_bounds))
    sidecar_required_arg_count_drift = {
        method: expected
        for method, expected in expected_required_arg_counts.items()
        if sidecar_agent_required_counts.get(method) != expected
    }
    sidecar_required_arg_count_stale = sorted(
        set(sidecar_agent_required_counts) - set(expected_required_arg_counts)
    )
    sidecar_task_required_arg_count_drift = {
        method: expected
        for method, expected in expected_task_required_arg_counts.items()
        if sidecar_task_required_counts.get(method) != expected
    }
    sidecar_task_required_arg_count_stale = sorted(
        set(sidecar_task_required_counts) - set(expected_task_required_arg_counts)
    )
    sidecar_max_arg_count_drift = {
        method: expected
        for method, expected in expected_sidecar_max_arg_counts.items()
        if sidecar_agent_max_counts.get(method) != expected
    }
    sidecar_max_arg_count_stale = sorted(set(sidecar_agent_max_counts) - set(expected_sidecar_max_arg_counts))
    sidecar_task_max_arg_count_drift = {
        method: expected
        for method, expected in expected_sidecar_task_max_arg_counts.items()
        if sidecar_task_max_counts.get(method) != expected
    }
    sidecar_task_max_arg_count_stale = sorted(
        set(sidecar_task_max_counts) - set(expected_sidecar_task_max_arg_counts)
    )
    python_named_arg_contract_count = len(expected_named_args)
    python_task_named_arg_contract_count = len(expected_task_named_args)
    python_required_arg_count_contract_count = len(expected_required_arg_counts)
    python_task_required_arg_count_contract_count = len(expected_task_required_arg_counts)
    python_max_arg_count_contract_count = len(expected_sidecar_max_arg_counts)
    python_task_max_arg_count_contract_count = len(expected_sidecar_task_max_arg_counts)
    hermes_agent_schema_arg_bound_contract_count = len(expected_agent_schema_arg_bounds)
    hermes_task_schema_arg_bound_contract_count = len(expected_task_schema_arg_bounds)
    sidecar_required_arg_count_contract_count = len(expected_required_arg_counts)
    sidecar_task_required_arg_count_contract_count = len(expected_task_required_arg_counts)
    sidecar_max_arg_count_contract_count = len(expected_sidecar_max_arg_counts)
    sidecar_task_max_arg_count_contract_count = len(expected_sidecar_task_max_arg_counts)
    sidecar_agent_arg_type_contract_count = len(python_agent_arg_types)
    sidecar_task_arg_type_contract_count = len(python_task_arg_types)
    sidecar_agent_arg_schema_contract_count = len(python_agent_arg_schemas)
    sidecar_task_arg_schema_contract_count = len(python_task_arg_schemas)
    python_direct_arg_type_validation_contract_count = len(
        python_direct_arg_type_validation_errors(tools_source, "ARG_SPECS")
        | python_direct_arg_type_validation_errors(tools_source, "TASK_ARG_SPECS")
    )
    python_positional_arg_type_validation_contract_count = len(
        python_positional_arg_type_validation_errors(tools_source, "ARG_SPECS")
        | python_positional_arg_type_validation_errors(tools_source, "TASK_ARG_SPECS")
    )
    description_expected = exposed | exposed_task
    description_missing = sorted(description_expected - python_method_descriptions)
    description_stale = sorted(python_method_descriptions - description_expected)
    manifest_drift = sorted(expected_tools ^ manifest_exposed)
    readme_manifest_tool_missing = sorted(tool for tool in manifest_order if f"`{tool}`" not in readme_source)
    expected_manifest_order = [
        "arinova_sdk_call",
        "arinova_task_call",
        *(f"arinova_{snake(method)}" for method in python_ordered),
        *(f"arinova_task_{snake(method)}" for method in python_task_ordered),
    ]
    manifest_order_drift = manifest_order != expected_manifest_order
    manifest_env_drift = sorted(EXPECTED_MANIFEST_ENV ^ manifest_env_exposed)
    manifest_concurrency_default_drift = (
        "default per-conversation" not in manifest_source
        or "default agent-wide" in manifest_source
    )
    manifest_skill_contract_drift = (
        "unique non-empty id" not in manifest_source
        or "non-empty name" not in manifest_source
        or "unique non-empty `id` values" not in readme_source
        or "non-empty\n`name` values" not in readme_source
        or "slash-command slug" not in readme_source
        or "id: chat" not in readme_source
        or "Chat handoff helper" not in readme_source
    )
    manifest_skill_contract_count = 1
    readme_env_drift = sorted(EXPECTED_MANIFEST_ENV ^ readme_env_exposed)
    runtime_env_missing = sorted(EXPECTED_MANIFEST_ENV - runtime_env_exposed)
    yaml_special_drift = sorted(EXPECTED_YAML_SPECIAL_KEYS ^ yaml_special_keys)
    readme_yaml_drift = sorted(expected_readme_yaml_keys ^ readme_yaml_exposed)
    local_package_path = sdk_root / "package.json"
    installed_package_path = installed_sdk / "package.json"
    local_version = sdk_package_version
    installed_version = package_version(installed_package_path)
    local_package_metadata = package_public_metadata(local_package_path)
    installed_package_metadata = package_public_metadata(installed_package_path)
    adapter_sdk_package_files = python_literal_tuple(adapter_source, "SDK_PACKAGE_FILES")
    adapter_sdk_metadata_keys = python_literal_tuple(adapter_source, "SDK_PACKAGE_PUBLIC_METADATA_KEYS")
    local_package = json.loads(local_package_path.read_text())
    adapter_sdk_package_name = python_get_comparison_literal(adapter_source, "sdk_package", "name")
    adapter_sdk_package_type = python_get_comparison_literal(adapter_source, "sdk_package", "type")
    expected_adapter_sdk_package_exports = local_package.get("exports", {}).get(".")
    sdk_dist_drift = [
        relative_path
        for relative_path in SDK_PACKAGE_FILES
        if (sdk_root / relative_path).read_text()
        != (installed_sdk / relative_path).read_text()
    ]
    sidecar_pkg = json.loads((ROOT / "sidecar/package.json").read_text())
    sidecar_lock = json.loads((ROOT / "sidecar/package-lock.json").read_text())
    sidecar_check_script = str(sidecar_pkg.get("scripts", {}).get("check") or "")
    missing_sidecar_check_scripts = sorted(
        script
        for script in EXPECTED_SIDECAR_CHECKS
        if f"node --check {script}" not in sidecar_check_script or f"node {script}" not in sidecar_check_script
    )
    dependency_spec = sidecar_pkg["dependencies"]["@arinova-ai/agent-sdk"]
    lockfile_version = sidecar_lock.get("lockfileVersion")
    lockfile_requires = sidecar_lock.get("requires")
    lock_root_package = sidecar_lock.get("packages", {}).get("", {})
    lock_root_name = lock_root_package.get("name")
    lock_root_version = lock_root_package.get("version")
    lock_root_dependencies = lock_root_package.get("dependencies")
    lock_root_engines = lock_root_package.get("engines")
    lock_dependency_spec = (
        lock_root_package
        .get("dependencies", {})
        .get("@arinova-ai/agent-sdk")
    )
    lock_package_version = (
        sidecar_lock.get("packages", {})
        .get("node_modules/@arinova-ai/agent-sdk", {})
        .get("version")
    )
    lock_package_resolved = (
        sidecar_lock.get("packages", {})
        .get("node_modules/@arinova-ai/agent-sdk", {})
        .get("resolved")
    )
    lock_package_license = (
        sidecar_lock.get("packages", {})
        .get("node_modules/@arinova-ai/agent-sdk", {})
        .get("license")
    )
    lock_package_integrity = (
        sidecar_lock.get("packages", {})
        .get("node_modules/@arinova-ai/agent-sdk", {})
        .get("integrity")
    )
    expected_lock_package_resolved = (
        "https://registry.npmjs.org/@arinova-ai/agent-sdk/-/"
        f"agent-sdk-{local_version}.tgz"
    )
    version_drift = local_version != installed_version
    package_metadata_drift = local_package_metadata != installed_package_metadata
    adapter_sdk_metadata_key_drift = list(adapter_sdk_metadata_keys) != list(SDK_PACKAGE_PUBLIC_METADATA_KEYS)
    adapter_sdk_package_metadata_contract_drift = (
        "DEFAULT_SDK_ROOT" not in adapter_source
        or "ARINOVA_AGENT_SDK_ROOT" not in adapter_source
        or "def _local_sdk_package(sdk_root: str | Path | None = None) -> Path | None:" not in adapter_source
        or "def _sidecar_dependency_error(node_bin: str | None = None, sdk_root: str | Path | None = None) -> str | None:" not in adapter_source
        or "_sidecar_dependency_error(self.node_bin, self.agent_sdk_root)" not in adapter_source
        or "def _sdk_public_metadata(package: dict[str, Any]) -> dict[str, Any]:" not in adapter_source
        or "local_metadata = _sdk_public_metadata(local_sdk_package)" not in adapter_source
        or "installed_metadata = _sdk_public_metadata(sdk_package)" not in adapter_source
        or "if installed_metadata != local_metadata:" not in adapter_source
        or "sidecar SDK package metadata drifted" not in adapter_source
    )
    adapter_sdk_package_file_drift = list(adapter_sdk_package_files) != list(SDK_PACKAGE_FILES)
    adapter_sdk_package_name_drift = adapter_sdk_package_name != local_package.get("name")
    adapter_sdk_package_type_drift = adapter_sdk_package_type != local_package.get("type")
    adapter_sdk_package_exports_contract_drift = (
        expected_adapter_sdk_package_exports is None
        or 'if not isinstance(exports, dict) or not exports.get("import") or not exports.get("types"):' not in adapter_source
        or "sidecar SDK package exports drifted" not in adapter_source
    )
    dependency_spec_drift = dependency_spec != local_version
    lockfile_version_drift = lockfile_version != 3
    lockfile_requires_drift = lockfile_requires is not True
    lock_root_name_drift = lock_root_name != sidecar_pkg.get("name")
    lock_root_version_drift = lock_root_version != sidecar_pkg.get("version")
    lock_root_dependencies_drift = lock_root_dependencies != sidecar_pkg.get("dependencies")
    lock_root_engines_drift = lock_root_engines != sidecar_pkg.get("engines")
    lock_dependency_spec_drift = lock_dependency_spec != local_version
    lock_package_version_drift = lock_package_version != local_version
    lock_package_resolved_drift = lock_package_resolved != expected_lock_package_resolved
    lock_package_license_drift = lock_package_license != local_package.get("license")
    lock_package_integrity_missing = (
        not isinstance(lock_package_integrity, str)
        or not lock_package_integrity.startswith("sha512-")
    )
    sidecar_sdk_lock_contract_count = 12
    clean_install_required_files = python_literal_tuple(clean_install_source, "REQUIRED_PLUGIN_FILES")
    user_install_required_files = python_literal_tuple(user_install_source, "REQUIRED_PLUGIN_FILES")
    clean_sdk_package_files = python_literal_tuple(clean_install_source, "SDK_PACKAGE_FILES")
    user_sdk_package_files = python_literal_tuple(user_install_source, "SDK_PACKAGE_FILES")
    clean_sdk_metadata_keys = python_literal_tuple(clean_install_source, "SDK_PACKAGE_PUBLIC_METADATA_KEYS")
    user_sdk_metadata_keys = python_literal_tuple(user_install_source, "SDK_PACKAGE_PUBLIC_METADATA_KEYS")
    clean_required_file_drift = list(clean_install_required_files) != list(REQUIRED_PLUGIN_FILES)
    user_required_file_drift = list(user_install_required_files) != list(REQUIRED_PLUGIN_FILES)
    clean_sdk_package_file_drift = list(clean_sdk_package_files) != list(SDK_PACKAGE_FILES)
    user_sdk_package_file_drift = list(user_sdk_package_files) != list(SDK_PACKAGE_FILES)
    clean_sdk_metadata_key_drift = list(clean_sdk_metadata_keys) != list(SDK_PACKAGE_PUBLIC_METADATA_KEYS)
    user_sdk_metadata_key_drift = list(user_sdk_metadata_keys) != list(SDK_PACKAGE_PUBLIC_METADATA_KEYS)
    python_method_description_contract_count = len(description_expected)
    manifest_tool_exposure_contract_count = len(expected_tools)
    manifest_tool_order_contract_count = len(expected_manifest_order)
    manifest_env_contract_count = len(EXPECTED_MANIFEST_ENV)
    manifest_concurrency_default_contract_count = 1
    readme_manifest_tool_contract_count = len(manifest_order)
    readme_env_contract_count = len(EXPECTED_MANIFEST_ENV)
    runtime_env_contract_count = len(EXPECTED_MANIFEST_ENV)
    yaml_special_key_contract_count = len(EXPECTED_YAML_SPECIAL_KEYS)
    readme_yaml_contract_count = len(expected_readme_yaml_keys)
    sdk_package_version_contract_count = 1
    sdk_package_metadata_contract_count = len(SDK_PACKAGE_PUBLIC_METADATA_KEYS)
    adapter_sdk_metadata_key_contract_count = len(SDK_PACKAGE_PUBLIC_METADATA_KEYS)
    adapter_sdk_package_file_contract_count = len(SDK_PACKAGE_FILES)
    adapter_sdk_package_name_contract_count = 1
    adapter_sdk_package_type_contract_count = 1
    adapter_sdk_package_exports_contract_count = 1
    sdk_dist_file_contract_count = len(SDK_PACKAGE_FILES)
    clean_required_plugin_file_contract_count = len(REQUIRED_PLUGIN_FILES)
    user_required_plugin_file_contract_count = len(REQUIRED_PLUGIN_FILES)
    clean_sdk_package_file_contract_count = len(SDK_PACKAGE_FILES)
    user_sdk_package_file_contract_count = len(SDK_PACKAGE_FILES)
    clean_sdk_metadata_key_contract_count = len(SDK_PACKAGE_PUBLIC_METADATA_KEYS)
    user_sdk_metadata_key_contract_count = len(SDK_PACKAGE_PUBLIC_METADATA_KEYS)
    missing_required_plugin_files = [
        relative_path for relative_path in REQUIRED_PLUGIN_FILES if not (ROOT / relative_path).is_file()
    ]
    if (
        missing
        or stale
        or local_lifecycle_method_drift
        or local_lifecycle_sdk_drift
        or local_lifecycle_docs_missing
        or sidecar_order_drift
        or python_order_drift
        or task_missing
        or task_stale
        or sidecar_task_order_drift
        or python_task_order_drift
        or task_field_missing
        or task_field_stale
        or task_field_shape_drift
        or adapter_task_metadata_field_drift
        or runtime_missing
        or runtime_extra
        or runtime_task_missing
        or runtime_task_extra
        or runtime_task_field_missing
        or runtime_task_field_extra
        or runtime_skill_field_missing
        or runtime_skill_field_extra
        or skill_field_missing
        or skill_field_stale
        or skill_required_drift
        or skill_shape_drift
        or runtime_option_field_missing
        or runtime_option_field_extra
        or option_field_missing
        or option_field_stale
        or option_required_drift
        or option_shape_drift
        or sdk_option_category_drift
        or sidecar_option_category_drift
        or runtime_option_category_drift
        or sdk_runtime_info_category_drift
        or runtime_runtime_info_category_drift
        or control_env_drift
        or control_options_unwired
        or sidecar_port_parser_unwired
        or sidecar_required_env_unwired
        or runtime_agent_event_missing
        or runtime_agent_event_extra
        or sdk_agent_event_category_drift
        or sidecar_agent_event_category_drift
        or runtime_agent_event_category_drift
        or runtime_task_update_status_missing
        or runtime_task_update_status_extra
        or sdk_task_update_status_category_drift
        or runtime_task_update_status_category_drift
        or runtime_task_update_variant_drift
        or runtime_action_result_status_missing
        or runtime_action_result_status_extra
        or sdk_action_result_status_category_drift
        or runtime_action_result_status_category_drift
        or sdk_action_result_field_category_drift
        or runtime_action_result_field_category_drift
        or sdk_memory_origin_literal_drift
        or sdk_memory_origin_template_drift
        or runtime_memory_origin_literal_drift
        or runtime_memory_origin_template_drift
        or sdk_onboarding_seed_kind_drift
        or runtime_onboarding_seed_kind_drift
        or sdk_onboarding_seed_category_drift
        or runtime_onboarding_seed_category_drift
        or sdk_action_option_category_drift
        or runtime_action_option_category_drift
        or sdk_tool_report_category_drift
        or runtime_tool_report_category_drift
        or sdk_action_error_category_drift
        or runtime_action_error_category_drift
        or sdk_action_confirmation_category_drift
        or runtime_action_confirmation_category_drift
        or sdk_task_attachment_category_drift
        or runtime_task_attachment_category_drift
        or sdk_upload_result_category_drift
        or runtime_upload_result_category_drift
        or sdk_history_message_category_drift
        or runtime_history_message_category_drift
        or sdk_fetch_history_option_category_drift
        or runtime_fetch_history_option_category_drift
        or sdk_fetch_history_result_category_drift
        or runtime_fetch_history_result_category_drift
        or sdk_note_category_drift
        or runtime_note_category_drift
        or sdk_list_notes_option_category_drift
        or runtime_list_notes_option_category_drift
        or sdk_list_notes_result_category_drift
        or runtime_list_notes_result_category_drift
        or sdk_create_note_body_category_drift
        or runtime_create_note_body_category_drift
        or sdk_update_note_body_category_drift
        or runtime_update_note_body_category_drift
        or sdk_query_memory_option_category_drift
        or runtime_query_memory_option_category_drift
        or sdk_memory_entry_category_drift
        or runtime_memory_entry_category_drift
        or sdk_share_note_result_category_drift
        or runtime_share_note_result_category_drift
        or sdk_skill_prompt_category_drift
        or runtime_skill_prompt_category_drift
        or sdk_kanban_board_category_drift
        or runtime_kanban_board_category_drift
        or sdk_kanban_column_category_drift
        or runtime_kanban_column_category_drift
        or sdk_kanban_card_category_drift
        or runtime_kanban_card_category_drift
        or sdk_list_boards_result_category_drift
        or runtime_list_boards_result_category_drift
        or sdk_kanban_label_category_drift
        or runtime_kanban_label_category_drift
        or sdk_create_board_body_category_drift
        or runtime_create_board_body_category_drift
        or sdk_update_board_body_category_drift
        or runtime_update_board_body_category_drift
        or sdk_create_card_body_category_drift
        or runtime_create_card_body_category_drift
        or sdk_update_card_body_category_drift
        or runtime_update_card_body_category_drift
        or sdk_create_column_body_category_drift
        or runtime_create_column_body_category_drift
        or sdk_update_column_body_category_drift
        or runtime_update_column_body_category_drift
        or sdk_add_commit_body_category_drift
        or runtime_add_commit_body_category_drift
        or sdk_create_label_body_category_drift
        or runtime_create_label_body_category_drift
        or sdk_update_label_body_category_drift
        or runtime_update_label_body_category_drift
        or sdk_card_commit_category_drift
        or runtime_card_commit_category_drift
        or sdk_card_note_category_drift
        or runtime_card_note_category_drift
        or sdk_archived_cards_result_category_drift
        or runtime_archived_cards_result_category_drift
        or action_result_terminal_status_missing
        or action_result_transient_status_missing
        or action_result_terminal_coverage_missing
        or adapter_task_update_status_drift
        or adapter_task_update_status_category_drift
        or agent_event_missing
        or agent_event_stale
        or sidecar_check_method_missing
        or sidecar_check_method_stale
        or sidecar_http_method_missing
        or sidecar_http_method_stale
        or http_method_category_drift
        or http_runtime_method_drift
        or http_runtime_method_order_drift
        or sidecar_check_task_method_missing
        or sidecar_check_task_method_stale
        or task_runtime_method_drift
        or task_runtime_method_order_drift
        or sdk_error_unwired
        or token_claimed_payload_coverage_missing
        or sdk_token_claimed_field_drift
        or runtime_token_claimed_field_drift
        or token_claimed_required_field_drift
        or sidecar_token_claimed_nullable_agent_contract_missing
        or onboarding_seed_contract_missing
        or control_result_contract_missing
        or http_error_coverage_missing
        or http_query_option_field_drift
        or http_upload_mime_contract_drift
        or http_return_payload_contract_missing
        or http_return_payload_required_drift
        or http_return_payload_shape_drift
        or sdk_list_boards_return_contract_drift
        or auth_frame_contract_drift
        or auth_protocol_coverage_drift
        or command_frame_contract_drift
        or runtime_frame_contract_drift
        or queue_overflow_contract_drift
        or auth_retry_contract_drift
        or task_heartbeat_contract_drift
        or ping_interval_contract_drift
        or ping_timeout_contract_drift
        or reconnect_interval_contract_drift
        or action_timeout_contract_drift
        or generated_call_id_contract_drift
        or e2e_runtime_coverage_missing
        or clean_install_platform_contract_missing
        or user_install_contract_missing
        or gateway_config_contract_missing
        or live_gate_contract_missing
        or live_agent_sdk_call_missing
        or live_probe_category_drift
        or live_gate_sdk_assertion_missing
        or live_return_identity_contract_missing
        or live_action_result_correlation_contract_missing
        or live_probe_strict_json_contract_missing
        or live_gate_sdk_assertion_category_drift
        or live_task_helper_probe_stale
        or live_task_helper_gate_assertion_missing
        or python_task_handler_check_missing
        or env_enablement_coverage_missing
        or config_callback_coverage_missing
        or hermes_platform_metadata_coverage_missing
        or hermes_toolset_name_contract_missing
        or hermes_registry_schema_coverage_missing
        or hermes_python_guard_missing
        or readme_live_gate_drift
        or readme_manifest_tool_missing
        or readme_check_snippets_missing
        or readme_surface_check_drift
        or readme_install_schema_drift
        or local_check_drift
        or sdk_surface_cli_drift
        or agent_sdk_source_check_drift
        or live_validator_category_drift
        or live_validator_field_drift
        or live_validator_field_usage_drift
        or live_validator_field_shape_drift
        or send_message_compat_coverage_missing
        or mention_metadata_coverage_missing
        or terminal_task_completion_coverage_missing
        or task_context_metadata_coverage_missing
        or same_conversation_task_coverage_missing
        or sidecar_lifecycle_coverage_missing
        or control_endpoint_drift
        or missing_control_endpoint_check_coverage
        or tool_wrapper_coverage_missing
        or tool_report_hook_missing
        or schema_field_drift
        or schema_required_drift
        or schema_shape_drift
        or task_context_nested_e2e_drift
        or task_context_nested_e2e_shape_drift
        or nested_schema_field_drift
        or nested_schema_required_drift
        or nested_schema_shape_drift
        or sidecar_schema_field_drift
        or sidecar_schema_required_drift
        or sidecar_schema_shape_drift
        or sidecar_upload_schema_drift
        or sidecar_nested_schema_field_drift
        or sidecar_nested_schema_required_drift
        or sidecar_nested_schema_shape_drift
        or tab_indented_files
        or runtime_param_drift
        or runtime_task_param_drift
        or runtime_return_drift
        or sdk_return_shape_category_drift
        or python_void_return_missing
        or python_void_return_stale
        or adapter_void_return_missing
        or adapter_void_return_stale
        or runtime_task_return_drift
        or sdk_task_return_shape_category_drift
        or sdk_task_param_arity_category_drift
        or sdk_task_callable_category_drift
        or runtime_task_callable_param_drift
        or runtime_task_callable_return_drift
        or runtime_task_callable_category_drift
        or runtime_type_symbol_missing
        or runtime_type_symbol_extra
        or runtime_interface_field_drift
        or runtime_interface_required_drift
        or runtime_interface_shape_drift
        or runtime_task_context_nested_field_drift
        or runtime_task_context_nested_required_drift
        or runtime_task_context_nested_shape_drift
        or runtime_type_alias_body_drift
        or runtime_public_type_missing
        or runtime_public_type_extra
        or runtime_public_value_missing
        or runtime_public_value_extra
        or runtime_action_protocol_drift
        or python_drift
        or python_task_drift
        or python_duplicate_literal_keys
        or duplicate_key_scanner_contract_missing
        or sidecar_duplicate_literal_keys
        or sidecar_duplicate_map_keys
        or named_arg_missing
        or named_arg_stale
        or task_named_arg_missing
        or task_named_arg_stale
        or sidecar_agent_arg_type_drift
        or sidecar_task_arg_type_drift
        or sidecar_agent_arg_type_stale
        or sidecar_task_arg_type_stale
        or sidecar_agent_arg_name_drift
        or sidecar_task_arg_name_drift
        or sidecar_agent_arg_name_stale
        or sidecar_task_arg_name_stale
        or sidecar_agent_arg_schema_drift
        or sidecar_task_arg_schema_drift
        or sidecar_agent_arg_schema_stale
        or sidecar_task_arg_schema_stale
        or python_direct_arg_type_validation_missing
        or python_positional_arg_type_validation_missing
        or python_direct_helper_validation_contract_missing
        or required_arg_count_drift
        or required_arg_count_stale
        or task_required_arg_count_drift
        or task_required_arg_count_stale
        or max_arg_count_drift
        or task_max_arg_count_drift
        or agent_schema_arg_bound_drift
        or agent_schema_arg_bound_stale
        or task_schema_arg_bound_drift
        or task_schema_arg_bound_stale
        or sidecar_required_arg_count_drift
        or sidecar_required_arg_count_stale
        or sidecar_task_required_arg_count_drift
        or sidecar_task_required_arg_count_stale
        or sidecar_max_arg_count_drift
        or sidecar_max_arg_count_stale
        or sidecar_task_max_arg_count_drift
        or sidecar_task_max_arg_count_stale
        or description_missing
        or description_stale
        or manifest_drift
        or manifest_order_drift
        or manifest_env_drift
        or manifest_concurrency_default_drift
        or manifest_skill_contract_drift
        or readme_env_drift
        or runtime_env_missing
        or sdk_option_config_coverage_missing
        or stale_sdk_option_config
        or yaml_special_drift
        or readme_yaml_drift
        or version_drift
        or package_metadata_drift
        or adapter_sdk_metadata_key_drift
        or adapter_sdk_package_metadata_contract_drift
        or adapter_sdk_package_file_drift
        or adapter_sdk_package_name_drift
        or adapter_sdk_package_type_drift
        or adapter_sdk_package_exports_contract_drift
        or sdk_dist_drift
        or missing_sidecar_check_scripts
        or dependency_spec_drift
        or lockfile_version_drift
        or lockfile_requires_drift
        or lock_root_name_drift
        or lock_root_version_drift
        or lock_root_dependencies_drift
        or lock_root_engines_drift
        or lock_dependency_spec_drift
        or lock_package_version_drift
        or lock_package_resolved_drift
        or lock_package_license_drift
        or lock_package_integrity_missing
        or clean_required_file_drift
        or user_required_file_drift
        or clean_sdk_package_file_drift
        or user_sdk_package_file_drift
        or clean_sdk_metadata_key_drift
        or user_sdk_metadata_key_drift
        or missing_required_plugin_files
        or sdk_test_inventory_missing
        or sdk_test_inventory_new
        or sdk_test_inventory_duplicates
        or sdk_client_http_validation_test_missing
        or sdk_client_task_scheduling_test_missing
        or sdk_client_reconnect_buffer_test_missing
        or sdk_client_task_action_test_missing
        or sdk_client_no_conversation_test_missing
        or sdk_client_auth_retry_test_missing
        or sdk_client_onboarding_test_missing
        or sdk_types_test_inventory_missing
        or sdk_types_test_inventory_new
        or sdk_types_test_inventory_duplicates
        or sdk_types_action_context_test_missing
        or sdk_types_action_result_test_missing
        or sdk_types_upload_attachment_test_missing
        or sdk_types_task_context_helper_test_missing
        or sdk_readme_method_heading_missing
        or sdk_readme_method_heading_new
        or sdk_readme_method_heading_duplicates
        or sdk_readme_lifecycle_method_missing
        or sdk_readme_message_file_method_missing
        or sdk_readme_note_method_missing
        or sdk_readme_kanban_method_missing
        or sdk_readme_memory_method_missing
        or sdk_readme_method_heading_stale
        or sdk_readme_bridge_coverage_missing
        or sdk_readme_type_symbol_missing
        or sdk_readme_type_symbol_new
        or sdk_readme_type_symbol_duplicates
        or sdk_readme_kanban_type_missing
        or sdk_readme_note_memory_type_missing
        or sdk_readme_type_symbol_stale
        or sdk_readme_option_name_missing
        or sdk_readme_option_name_new
        or sdk_readme_option_name_duplicates
        or sdk_readme_auth_option_missing
        or sdk_readme_timing_option_missing
        or sdk_readme_option_name_stale
        or sdk_readme_task_context_item_missing
        or sdk_readme_task_context_item_new
        or sdk_readme_task_context_item_duplicates
        or sdk_readme_task_context_field_item_missing
        or sdk_readme_task_context_reply_item_missing
        or sdk_readme_task_context_item_stale
    ):
        if missing:
            print("Missing sidecar SDK methods:", ", ".join(missing), file=sys.stderr)
        if sdk_test_inventory_missing:
            print(
                "Reviewed upstream SDK client tests disappeared or were renamed:",
                "; ".join(sdk_test_inventory_missing),
                file=sys.stderr,
            )
        if sdk_test_inventory_new:
            print(
                "New upstream SDK client tests need bridge parity review:",
                "; ".join(sdk_test_inventory_new),
                file=sys.stderr,
            )
        if sdk_test_inventory_duplicates:
            print(
                "Duplicate upstream SDK client test names make parity inventory ambiguous:",
                "; ".join(sdk_test_inventory_duplicates),
                file=sys.stderr,
            )
        for category, category_missing in (
            ("HTTP/auth validation", sdk_client_http_validation_test_missing),
            ("task scheduling", sdk_client_task_scheduling_test_missing),
            ("reconnect buffering", sdk_client_reconnect_buffer_test_missing),
            ("task action protocol", sdk_client_task_action_test_missing),
            ("no-conversation task", sdk_client_no_conversation_test_missing),
            ("auth retry", sdk_client_auth_retry_test_missing),
            ("onboarding/token-claim", sdk_client_onboarding_test_missing),
        ):
            if category_missing:
                print(
                    f"Reviewed upstream SDK client {category} tests disappeared or were renamed:",
                    "; ".join(category_missing),
                    file=sys.stderr,
                )
        if sdk_types_test_inventory_missing:
            print(
                "Reviewed upstream SDK type tests disappeared or were renamed:",
                "; ".join(sdk_types_test_inventory_missing),
                file=sys.stderr,
            )
        if sdk_types_test_inventory_new:
            print(
                "New upstream SDK type tests need bridge parity review:",
                "; ".join(sdk_types_test_inventory_new),
                file=sys.stderr,
            )
        if sdk_types_test_inventory_duplicates:
            print(
                "Duplicate upstream SDK type test names make parity inventory ambiguous:",
                "; ".join(sdk_types_test_inventory_duplicates),
                file=sys.stderr,
            )
        for category, category_missing in (
            ("action context/file-reference", sdk_types_action_context_test_missing),
            ("ActionCallResult variant", sdk_types_action_result_test_missing),
            ("upload/attachment metadata", sdk_types_upload_attachment_test_missing),
            ("TaskContext helper alignment", sdk_types_task_context_helper_test_missing),
        ):
            if category_missing:
                print(
                    f"Reviewed upstream SDK type {category} tests disappeared or were renamed:",
                    "; ".join(category_missing),
                    file=sys.stderr,
                )
        if sdk_readme_method_heading_missing:
            print(
                "Reviewed upstream SDK README method headings disappeared or were renamed:",
                "; ".join(sdk_readme_method_heading_missing),
                file=sys.stderr,
            )
        if sdk_readme_method_heading_new:
            print(
                "New upstream SDK README method headings need bridge parity review:",
                "; ".join(sdk_readme_method_heading_new),
                file=sys.stderr,
            )
        if sdk_readme_method_heading_duplicates:
            print(
                "Duplicate upstream SDK README method headings make parity inventory ambiguous:",
                "; ".join(sdk_readme_method_heading_duplicates),
                file=sys.stderr,
            )
        for category, category_missing in (
            ("lifecycle", sdk_readme_lifecycle_method_missing),
            ("message/file/history", sdk_readme_message_file_method_missing),
            ("note", sdk_readme_note_method_missing),
            ("kanban", sdk_readme_kanban_method_missing),
            ("memory", sdk_readme_memory_method_missing),
        ):
            if category_missing:
                print(
                    f"Reviewed upstream SDK README {category} method headings disappeared or were renamed:",
                    "; ".join(category_missing),
                    file=sys.stderr,
                )
        if sdk_readme_method_heading_stale:
            print(
                "Upstream SDK README documents methods missing from ArinovaAgent:",
                "; ".join(sdk_readme_method_heading_stale),
                file=sys.stderr,
            )
        if sdk_readme_bridge_coverage_missing:
            print(
                "Upstream SDK README methods missing from sidecar bridge exposure:",
                "; ".join(sdk_readme_bridge_coverage_missing),
                file=sys.stderr,
            )
        if sdk_readme_type_symbol_missing:
            print(
                "Reviewed upstream SDK README type symbols disappeared or were renamed:",
                "; ".join(sdk_readme_type_symbol_missing),
                file=sys.stderr,
            )
        if sdk_readme_type_symbol_new:
            print(
                "New upstream SDK README type symbols need bridge parity review:",
                "; ".join(sdk_readme_type_symbol_new),
                file=sys.stderr,
            )
        if sdk_readme_type_symbol_duplicates:
            print(
                "Duplicate upstream SDK README type symbols make parity inventory ambiguous:",
                "; ".join(sdk_readme_type_symbol_duplicates),
                file=sys.stderr,
            )
        for category, category_missing in (
            ("kanban", sdk_readme_kanban_type_missing),
            ("note/memory", sdk_readme_note_memory_type_missing),
        ):
            if category_missing:
                print(
                    f"Reviewed upstream SDK README {category} type symbols disappeared or were renamed:",
                    "; ".join(category_missing),
                    file=sys.stderr,
                )
        if sdk_readme_type_symbol_stale:
            print(
                "Upstream SDK README documents type symbols missing from src/types.ts:",
                "; ".join(sdk_readme_type_symbol_stale),
                file=sys.stderr,
            )
        if sdk_readme_option_name_missing:
            print(
                "Reviewed upstream SDK README option names disappeared or were renamed:",
                "; ".join(sdk_readme_option_name_missing),
                file=sys.stderr,
            )
        if sdk_readme_option_name_new:
            print(
                "New upstream SDK README option names need bridge parity review:",
                "; ".join(sdk_readme_option_name_new),
                file=sys.stderr,
            )
        if sdk_readme_option_name_duplicates:
            print(
                "Duplicate upstream SDK README option names make parity inventory ambiguous:",
                "; ".join(sdk_readme_option_name_duplicates),
                file=sys.stderr,
            )
        for category, category_missing in (
            ("auth", sdk_readme_auth_option_missing),
            ("timing", sdk_readme_timing_option_missing),
        ):
            if category_missing:
                print(
                    f"Reviewed upstream SDK README {category} option names disappeared or were renamed:",
                    "; ".join(category_missing),
                    file=sys.stderr,
                )
        if sdk_readme_option_name_stale:
            print(
                "Upstream SDK README documents option names missing from ArinovaAgentOptions:",
                "; ".join(sdk_readme_option_name_stale),
                file=sys.stderr,
            )
        if sdk_readme_task_context_item_missing:
            print(
                "Reviewed upstream SDK README TaskContext items disappeared or were renamed:",
                "; ".join(sdk_readme_task_context_item_missing),
                file=sys.stderr,
            )
        if sdk_readme_task_context_item_new:
            print(
                "New upstream SDK README TaskContext items need bridge parity review:",
                "; ".join(sdk_readme_task_context_item_new),
                file=sys.stderr,
            )
        if sdk_readme_task_context_item_duplicates:
            print(
                "Duplicate upstream SDK README TaskContext items make parity inventory ambiguous:",
                "; ".join(sdk_readme_task_context_item_duplicates),
                file=sys.stderr,
            )
        for category, category_missing in (
            ("field", sdk_readme_task_context_field_item_missing),
            ("reply helper", sdk_readme_task_context_reply_item_missing),
        ):
            if category_missing:
                print(
                    f"Reviewed upstream SDK README TaskContext {category} items disappeared or were renamed:",
                    "; ".join(category_missing),
                    file=sys.stderr,
                )
        if sdk_readme_task_context_item_stale:
            print(
                "Upstream SDK README documents TaskContext items missing from src/types.ts:",
                "; ".join(sdk_readme_task_context_item_stale),
                file=sys.stderr,
            )
        if stale:
            print("Stale sidecar SDK methods:", ", ".join(stale), file=sys.stderr)
        if local_lifecycle_method_drift:
            print(
                "INTENTIONALLY_LOCAL must only contain sidecar-owned SDK lifecycle methods:",
                ", ".join(local_lifecycle_method_drift),
                file=sys.stderr,
            )
        if local_lifecycle_sdk_drift:
            print(
                "Expected sidecar-owned lifecycle methods are no longer SDK public methods:",
                ", ".join(local_lifecycle_sdk_drift),
                file=sys.stderr,
            )
        if local_lifecycle_docs_missing:
            print("README is missing sidecar-owned SDK lifecycle method documentation", file=sys.stderr)
        if sidecar_order_drift:
            print(
                f"Sidecar SDK method order drift: expected={sdk_method_order} actual={sidecar_ordered}",
                file=sys.stderr,
            )
        if python_order_drift:
            print(
                f"Python SDK method order drift: expected={sdk_method_order} actual={python_ordered}",
                file=sys.stderr,
            )
        if task_missing:
            print("Missing sidecar task SDK helpers:", ", ".join(task_missing), file=sys.stderr)
        if task_stale:
            print("Stale sidecar task SDK helpers:", ", ".join(task_stale), file=sys.stderr)
        if sidecar_task_order_drift:
            print(
                f"Sidecar task SDK helper order drift: expected={sdk_task_helper_order} actual={sidecar_task_ordered}",
                file=sys.stderr,
            )
        if python_task_order_drift:
            print(
                f"Python task SDK helper order drift: expected={sdk_task_helper_order} actual={python_task_ordered}",
                file=sys.stderr,
            )
        if task_field_missing:
            print("Missing sidecar task context fields:", ", ".join(task_field_missing), file=sys.stderr)
        if task_field_stale:
            print("Stale sidecar task context fields:", ", ".join(task_field_stale), file=sys.stderr)
        if task_field_shape_drift:
            for field, expected in sorted(task_field_shape_drift.items()):
                actual = exposed_task_field_shapes.get(field)
                print(
                    f"Sidecar task context field shape drift for {field}: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if adapter_task_metadata_field_drift:
            print(
                "Adapter rendered TaskContext metadata field drift: "
                f"expected={sorted(expected_adapter_task_metadata_fields)} "
                f"actual={sorted(adapter_task_metadata_fields)}",
                file=sys.stderr,
            )
        if runtime_missing:
            print("Installed SDK is missing local methods:", ", ".join(runtime_missing), file=sys.stderr)
        if runtime_extra:
            print("Installed SDK has methods not in local source:", ", ".join(runtime_extra), file=sys.stderr)
        if sdk_dist_drift:
            print(
                "Installed SDK package files differ from local agent-sdk package:",
                ", ".join(sdk_dist_drift),
                file=sys.stderr,
            )
        if runtime_task_missing:
            print("Installed SDK is missing local task helpers:", ", ".join(runtime_task_missing), file=sys.stderr)
        if runtime_task_extra:
            print("Installed SDK has task helpers not in local source:", ", ".join(runtime_task_extra), file=sys.stderr)
        if runtime_task_field_missing:
            print("Installed SDK is missing local task fields:", ", ".join(runtime_task_field_missing), file=sys.stderr)
        if runtime_task_field_extra:
            print("Installed SDK has task fields not in local source:", ", ".join(runtime_task_field_extra), file=sys.stderr)
        if runtime_skill_field_missing:
            print("Installed SDK is missing local AgentSkill fields:", ", ".join(runtime_skill_field_missing), file=sys.stderr)
        if runtime_skill_field_extra:
            print("Installed SDK has AgentSkill fields not in local source:", ", ".join(runtime_skill_field_extra), file=sys.stderr)
        if skill_field_missing:
            print("Sidecar parseSkills drops AgentSkill fields:", ", ".join(skill_field_missing), file=sys.stderr)
        if skill_field_stale:
            print("Sidecar parseSkills has stale AgentSkill fields:", ", ".join(skill_field_stale), file=sys.stderr)
        if skill_required_drift:
            print(
                "Sidecar parseSkills AgentSkill required-field drift: "
                f"expected={skill_required_drift} actual={sorted(exposed_skill_required_fields)}",
                file=sys.stderr,
            )
        if skill_shape_drift:
            print(
                "Sidecar parseSkills AgentSkill type-shape drift: "
                f"expected={skill_shape_drift} actual={exposed_skill_shapes}",
                file=sys.stderr,
            )
        if runtime_option_field_missing:
            print("Installed SDK is missing local ArinovaAgentOptions fields:", ", ".join(runtime_option_field_missing), file=sys.stderr)
        if runtime_option_field_extra:
            print("Installed SDK has ArinovaAgentOptions fields not in local source:", ", ".join(runtime_option_field_extra), file=sys.stderr)
        if option_field_missing:
            print("Sidecar buildAgentOptions drops ArinovaAgentOptions fields:", ", ".join(option_field_missing), file=sys.stderr)
        if option_field_stale:
            print("Sidecar buildAgentOptions has stale ArinovaAgentOptions fields:", ", ".join(option_field_stale), file=sys.stderr)
        if option_required_drift:
            print(
                "Sidecar buildAgentOptions ArinovaAgentOptions required-field drift: "
                f"expected={option_required_drift} actual={sorted(exposed_option_required_fields)}",
                file=sys.stderr,
            )
        if option_shape_drift:
            print(
                "Sidecar buildAgentOptions ArinovaAgentOptions type-shape drift: "
                f"expected={option_shape_drift} actual={exposed_option_shapes}",
                file=sys.stderr,
            )
        if sdk_option_category_drift:
            for label, fields in sorted(sdk_option_category_drift.items()):
                print(
                    f"SDK ArinovaAgentOptions category {label} drift: " + ", ".join(fields),
                    file=sys.stderr,
                )
        if sidecar_option_category_drift:
            for label, fields in sorted(sidecar_option_category_drift.items()):
                print(
                    f"Sidecar ArinovaAgentOptions category {label} drift: " + ", ".join(fields),
                    file=sys.stderr,
                )
        if runtime_option_category_drift:
            for label, fields in sorted(runtime_option_category_drift.items()):
                print(
                    f"Installed SDK ArinovaAgentOptions category {label} drift: " + ", ".join(fields),
                    file=sys.stderr,
                )
        if control_env_drift:
            print("Sidecar control env drift:", ", ".join(control_env_drift), file=sys.stderr)
        if control_options_unwired:
            print("Sidecar index.mjs does not pass buildControlServerOptions() into createControlServer", file=sys.stderr)
        if sidecar_port_parser_unwired:
            print("Sidecar index.mjs does not parse ARINOVA_SIDECAR_PORT with strict intEnv()", file=sys.stderr)
        if sidecar_required_env_unwired:
            print("Sidecar index.mjs does not parse required credentials with trimmed requiredEnv()", file=sys.stderr)
        if control_endpoint_drift:
            for owner, endpoints in sorted(control_endpoint_drift.items()):
                print(
                    f"Sidecar control endpoint drift in {owner}: "
                    f"expected={sorted(expected_control_endpoints)} actual={endpoints}",
                    file=sys.stderr,
                )
        if missing_control_endpoint_check_coverage:
            print(
                "sidecar/check-runtime.mjs does not exercise control endpoint(s): "
                + ", ".join(missing_control_endpoint_check_coverage),
                file=sys.stderr,
            )
        if runtime_agent_event_missing:
            print(
                "Installed SDK is missing local AgentEvent names:",
                ", ".join(runtime_agent_event_missing),
                file=sys.stderr,
            )
        if runtime_agent_event_extra:
            print(
                "Installed SDK has AgentEvent names not in local source:",
                ", ".join(runtime_agent_event_extra),
                file=sys.stderr,
            )
        if sdk_agent_event_category_drift:
            for label, events in sorted(sdk_agent_event_category_drift.items()):
                print(
                    f"SDK AgentEvent category {label} drift: " + ", ".join(events),
                    file=sys.stderr,
                )
        if sidecar_agent_event_category_drift:
            for label, events in sorted(sidecar_agent_event_category_drift.items()):
                print(
                    f"Sidecar AgentEvent category {label} drift: " + ", ".join(events),
                    file=sys.stderr,
                )
        if runtime_agent_event_category_drift:
            for label, events in sorted(runtime_agent_event_category_drift.items()):
                print(
                    f"Installed SDK AgentEvent category {label} drift: " + ", ".join(events),
                    file=sys.stderr,
                )
        if runtime_task_update_status_missing:
            print(
                "Installed SDK is missing local TaskUpdateData statuses:",
                ", ".join(runtime_task_update_status_missing),
                file=sys.stderr,
            )
        if runtime_task_update_status_extra:
            print(
                "Installed SDK has TaskUpdateData statuses not in local source:",
                ", ".join(runtime_task_update_status_extra),
                file=sys.stderr,
            )
        if sdk_task_update_status_category_drift:
            for label, statuses in sorted(sdk_task_update_status_category_drift.items()):
                print(
                    f"SDK TaskUpdateData status category {label} drift: " + ", ".join(statuses),
                    file=sys.stderr,
                )
        if runtime_task_update_status_category_drift:
            for label, statuses in sorted(runtime_task_update_status_category_drift.items()):
                print(
                    f"Installed SDK TaskUpdateData status category {label} drift: " + ", ".join(statuses),
                    file=sys.stderr,
                )
        if runtime_task_update_variant_drift:
            for status, drift in sorted(runtime_task_update_variant_drift.items()):
                print(
                    f"Installed SDK TaskUpdateData variant drift for {status}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if runtime_action_result_status_missing:
            print(
                "Installed SDK is missing local ActionCallResult statuses:",
                ", ".join(runtime_action_result_status_missing),
                file=sys.stderr,
            )
        if runtime_action_result_status_extra:
            print(
                "Installed SDK has ActionCallResult statuses not in local source:",
                ", ".join(runtime_action_result_status_extra),
                file=sys.stderr,
            )
        if sdk_action_result_status_category_drift:
            for label, statuses in sorted(sdk_action_result_status_category_drift.items()):
                print(
                    f"SDK ActionCallResult status category {label} drift: " + ", ".join(statuses),
                    file=sys.stderr,
                )
        if runtime_action_result_status_category_drift:
            for label, statuses in sorted(runtime_action_result_status_category_drift.items()):
                print(
                    f"Installed SDK ActionCallResult status category {label} drift: " + ", ".join(statuses),
                    file=sys.stderr,
                )
        for source_label, drift in (
            ("SDK MemoryOrigin literal", sdk_memory_origin_literal_drift),
            ("SDK MemoryOrigin template", sdk_memory_origin_template_drift),
            ("Installed SDK MemoryOrigin literal", runtime_memory_origin_literal_drift),
            ("Installed SDK MemoryOrigin template", runtime_memory_origin_template_drift),
            ("SDK ActionCallResult field", sdk_action_result_field_category_drift),
            ("Installed SDK ActionCallResult field", runtime_action_result_field_category_drift),
            ("SDK OnboardingSeed kind", sdk_onboarding_seed_kind_drift),
            ("Installed SDK OnboardingSeed kind", runtime_onboarding_seed_kind_drift),
            ("SDK OnboardingSeed field", sdk_onboarding_seed_category_drift),
            ("Installed SDK OnboardingSeed field", runtime_onboarding_seed_category_drift),
            ("SDK ActionCallOptions field", sdk_action_option_category_drift),
            ("Installed SDK ActionCallOptions field", runtime_action_option_category_drift),
            ("SDK ToolCallReport field", sdk_tool_report_category_drift),
            ("Installed SDK ToolCallReport field", runtime_tool_report_category_drift),
            ("SDK ActionErrorBody field", sdk_action_error_category_drift),
            ("Installed SDK ActionErrorBody field", runtime_action_error_category_drift),
            ("SDK ActionConfirmationPayload field", sdk_action_confirmation_category_drift),
            ("Installed SDK ActionConfirmationPayload field", runtime_action_confirmation_category_drift),
            ("SDK TaskAttachment field", sdk_task_attachment_category_drift),
            ("Installed SDK TaskAttachment field", runtime_task_attachment_category_drift),
            ("SDK UploadResult field", sdk_upload_result_category_drift),
            ("Installed SDK UploadResult field", runtime_upload_result_category_drift),
            ("SDK HistoryMessage field", sdk_history_message_category_drift),
            ("Installed SDK HistoryMessage field", runtime_history_message_category_drift),
            ("SDK FetchHistoryOptions field", sdk_fetch_history_option_category_drift),
            ("Installed SDK FetchHistoryOptions field", runtime_fetch_history_option_category_drift),
            ("SDK FetchHistoryResult field", sdk_fetch_history_result_category_drift),
            ("Installed SDK FetchHistoryResult field", runtime_fetch_history_result_category_drift),
            ("SDK Note field", sdk_note_category_drift),
            ("Installed SDK Note field", runtime_note_category_drift),
            ("SDK ListNotesOptions field", sdk_list_notes_option_category_drift),
            ("Installed SDK ListNotesOptions field", runtime_list_notes_option_category_drift),
            ("SDK ListNotesResult field", sdk_list_notes_result_category_drift),
            ("Installed SDK ListNotesResult field", runtime_list_notes_result_category_drift),
            ("SDK CreateNoteBody field", sdk_create_note_body_category_drift),
            ("Installed SDK CreateNoteBody field", runtime_create_note_body_category_drift),
            ("SDK UpdateNoteBody field", sdk_update_note_body_category_drift),
            ("Installed SDK UpdateNoteBody field", runtime_update_note_body_category_drift),
            ("SDK QueryMemoryOptions field", sdk_query_memory_option_category_drift),
            ("Installed SDK QueryMemoryOptions field", runtime_query_memory_option_category_drift),
            ("SDK MemoryEntry field", sdk_memory_entry_category_drift),
            ("Installed SDK MemoryEntry field", runtime_memory_entry_category_drift),
            ("SDK ShareNoteResult field", sdk_share_note_result_category_drift),
            ("Installed SDK ShareNoteResult field", runtime_share_note_result_category_drift),
            ("SDK SkillPrompt field", sdk_skill_prompt_category_drift),
            ("Installed SDK SkillPrompt field", runtime_skill_prompt_category_drift),
            ("SDK KanbanBoard field", sdk_kanban_board_category_drift),
            ("Installed SDK KanbanBoard field", runtime_kanban_board_category_drift),
            ("SDK KanbanColumn field", sdk_kanban_column_category_drift),
            ("Installed SDK KanbanColumn field", runtime_kanban_column_category_drift),
            ("SDK KanbanCard field", sdk_kanban_card_category_drift),
            ("Installed SDK KanbanCard field", runtime_kanban_card_category_drift),
            ("SDK ListBoardsResult field", sdk_list_boards_result_category_drift),
            ("Installed SDK ListBoardsResult field", runtime_list_boards_result_category_drift),
            ("SDK KanbanLabel field", sdk_kanban_label_category_drift),
            ("Installed SDK KanbanLabel field", runtime_kanban_label_category_drift),
            ("SDK CreateBoardBody field", sdk_create_board_body_category_drift),
            ("Installed SDK CreateBoardBody field", runtime_create_board_body_category_drift),
            ("SDK UpdateBoardBody field", sdk_update_board_body_category_drift),
            ("Installed SDK UpdateBoardBody field", runtime_update_board_body_category_drift),
            ("SDK CreateCardBody field", sdk_create_card_body_category_drift),
            ("Installed SDK CreateCardBody field", runtime_create_card_body_category_drift),
            ("SDK UpdateCardBody field", sdk_update_card_body_category_drift),
            ("Installed SDK UpdateCardBody field", runtime_update_card_body_category_drift),
            ("SDK CreateColumnBody field", sdk_create_column_body_category_drift),
            ("Installed SDK CreateColumnBody field", runtime_create_column_body_category_drift),
            ("SDK UpdateColumnBody field", sdk_update_column_body_category_drift),
            ("Installed SDK UpdateColumnBody field", runtime_update_column_body_category_drift),
            ("SDK AddCommitBody field", sdk_add_commit_body_category_drift),
            ("Installed SDK AddCommitBody field", runtime_add_commit_body_category_drift),
            ("SDK CreateLabelBody field", sdk_create_label_body_category_drift),
            ("Installed SDK CreateLabelBody field", runtime_create_label_body_category_drift),
            ("SDK UpdateLabelBody field", sdk_update_label_body_category_drift),
            ("Installed SDK UpdateLabelBody field", runtime_update_label_body_category_drift),
            ("SDK CardCommit field", sdk_card_commit_category_drift),
            ("Installed SDK CardCommit field", runtime_card_commit_category_drift),
            ("SDK CardNote field", sdk_card_note_category_drift),
            ("Installed SDK CardNote field", runtime_card_note_category_drift),
            ("SDK ArchivedCardsResult field", sdk_archived_cards_result_category_drift),
            ("Installed SDK ArchivedCardsResult field", runtime_archived_cards_result_category_drift),
            ("SDK AgentRuntimeInfo field", sdk_runtime_info_category_drift),
            ("Installed SDK AgentRuntimeInfo field", runtime_runtime_info_category_drift),
        ):
            if drift:
                for label, values in sorted(drift.items()):
                    print(
                        f"{source_label} category {label} drift: " + ", ".join(values),
                        file=sys.stderr,
                    )
        if action_result_terminal_status_missing:
            print(
                "SDK handleActionResult accepts statuses not declared by ActionCallResult:",
                ", ".join(action_result_terminal_status_missing),
                file=sys.stderr,
            )
        if action_result_transient_status_missing:
            print(
                "Sidecar e2e is missing non-terminal ActionCallResult status coverage:",
                ", ".join(action_result_transient_status_missing),
                file=sys.stderr,
            )
        if action_result_terminal_coverage_missing:
            print(
                "Sidecar e2e is missing terminal ActionCallResult status coverage:",
                ", ".join(action_result_terminal_coverage_missing),
                file=sys.stderr,
            )
        if adapter_task_update_status_drift:
            print(
                "Adapter emits TaskUpdateData statuses not in SDK:",
                ", ".join(adapter_task_update_status_drift),
                file=sys.stderr,
            )
        if adapter_task_update_status_category_drift:
            for label, statuses in sorted(adapter_task_update_status_category_drift.items()):
                print(
                    f"Adapter TaskUpdateData status category {label} drift: " + ", ".join(statuses),
                    file=sys.stderr,
                )
        if agent_event_missing:
            print("Sidecar does not handle SDK AgentEvent names:", ", ".join(agent_event_missing), file=sys.stderr)
        if agent_event_stale:
            print("Sidecar handles stale SDK AgentEvent names:", ", ".join(agent_event_stale), file=sys.stderr)
        if sidecar_check_method_missing:
            print(
                "Sidecar SDK checks do not exercise methods:",
                ", ".join(sidecar_check_method_missing),
                file=sys.stderr,
            )
        if sidecar_check_method_stale:
            print(
                "Sidecar SDK checks exercise stale methods:",
                ", ".join(sidecar_check_method_stale),
                file=sys.stderr,
            )
        if sidecar_http_method_missing:
            print(
                "sidecar/check-sdk-http.mjs does not exercise HTTP-backed SDK methods:",
                ", ".join(sidecar_http_method_missing),
                file=sys.stderr,
            )
        if sidecar_http_method_stale:
            print(
                "sidecar/check-sdk-http.mjs exercises stale SDK methods:",
                ", ".join(sidecar_http_method_stale),
                file=sys.stderr,
            )
        if http_method_category_drift:
            for label, methods in sorted(http_method_category_drift.items()):
                print(
                    f"HTTP-backed SDK method category {label} drift: " + ", ".join(methods),
                    file=sys.stderr,
                )
        if http_runtime_method_drift:
            print(
                "sidecar/check-sdk-http.mjs EXPECTED_HTTP_SDK_METHODS drift: "
                f"expected={sorted(sdk_http_methods & exposed)} actual={sorted(expected_http_runtime_methods)}",
                file=sys.stderr,
            )
        if http_runtime_method_order_drift:
            print(
                "sidecar/check-sdk-http.mjs EXPECTED_HTTP_SDK_METHODS order drift: "
                f"expected={[method for method in sidecar_ordered if method in (sdk_http_methods & exposed)]} "
                f"actual={expected_http_runtime_methods}",
                file=sys.stderr,
            )
        if sidecar_check_task_method_missing:
            print(
                "Sidecar SDK checks do not exercise task helpers:",
                ", ".join(sidecar_check_task_method_missing),
                file=sys.stderr,
            )
        if sidecar_check_task_method_stale:
            print(
                "Sidecar SDK checks exercise stale task helpers:",
                ", ".join(sidecar_check_task_method_stale),
                file=sys.stderr,
            )
        if task_runtime_method_drift:
            print(
                "sidecar/check-sdk-e2e.mjs EXPECTED_TASK_SDK_METHODS drift: "
                f"expected={sorted(exposed_task)} actual={sorted(expected_task_runtime_methods)}",
                file=sys.stderr,
            )
        if task_runtime_method_order_drift:
            print(
                "sidecar/check-sdk-e2e.mjs EXPECTED_TASK_SDK_METHODS order drift: "
                f"expected={sidecar_task_ordered} actual={expected_task_runtime_methods}",
                file=sys.stderr,
            )
        if sdk_error_unwired:
            print("SDK error AgentEvent is not bridged through sidecar and adapter /sdk-error", file=sys.stderr)
        if token_claimed_payload_coverage_missing:
            print("TokenClaimedData payload forwarding/adapter coverage is missing", file=sys.stderr)
        for source_label, drift in (
            ("SDK TokenClaimedData field", sdk_token_claimed_field_drift),
            ("Installed SDK TokenClaimedData field", runtime_token_claimed_field_drift),
        ):
            if drift:
                for label, fields in sorted(drift.items()):
                    print(
                        f"{source_label} category {label} drift: " + ", ".join(fields),
                        file=sys.stderr,
                    )
        if token_claimed_required_field_drift:
            for label, drift in sorted(token_claimed_required_field_drift.items()):
                print(
                    f"TokenClaimedData required-field drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if sidecar_token_claimed_nullable_agent_contract_missing:
            print("TokenClaimedData nullable agentId sidecar/adapter coverage is missing", file=sys.stderr)
        if onboarding_seed_contract_missing:
            print("OnboardingSeed validation/forwarding/live-smoke coverage is missing", file=sys.stderr)
        if control_result_contract_missing:
            print("Sidecar control result/null response contract coverage is missing", file=sys.stderr)
        if http_error_coverage_missing:
            print("sidecar/check-sdk-http.mjs is missing SDK backend error propagation coverage", file=sys.stderr)
        if http_query_option_field_drift:
            for label, drift in sorted(http_query_option_field_drift.items()):
                print(
                    f"sidecar/check-sdk-http.mjs query option drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if http_upload_mime_contract_drift:
            print("sidecar/check-sdk-http.mjs upload MIME coverage drifted from SDK MIME_TYPES", file=sys.stderr)
        if http_return_payload_contract_missing:
            print("sidecar/check-sdk-http.mjs is missing SDK return payload interface coverage", file=sys.stderr)
        if http_return_payload_required_drift:
            for name, drift in sorted(http_return_payload_required_drift.items()):
                print(
                    f"SDK HTTP return payload required-field drift for {name}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if http_return_payload_shape_drift:
            for name, drift in sorted(http_return_payload_shape_drift.items()):
                print(
                    f"SDK HTTP return payload type-shape drift for {name}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if sdk_list_boards_return_contract_drift:
            print("SDK listBoards() return contract or HTTP array payload coverage drifted", file=sys.stderr)
        if auth_frame_contract_drift:
            for label, drift in sorted(auth_frame_contract_drift.items()):
                print(
                    f"SDK auth frame contract drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if auth_protocol_coverage_drift:
            print(
                f"sidecar/check-sdk-e2e.mjs auth protocol assertion drifted from SDK ACTION_PROTOCOL_VERSION: {sdk_action_protocol}",
                file=sys.stderr,
            )
        if command_frame_contract_drift:
            for label, drift in sorted(command_frame_contract_drift.items()):
                print(
                    f"SDK command frame contract drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if runtime_frame_contract_drift:
            for label, drift in sorted(runtime_frame_contract_drift.items()):
                print(
                    f"SDK runtime frame contract drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if queue_overflow_contract_drift:
            print(
                "sidecar/check-sdk-e2e.mjs queue overflow coverage drifted from SDK MAX_QUEUE_SIZE",
                file=sys.stderr,
            )
        if auth_retry_contract_drift:
            print(
                "sidecar/check-sdk-e2e.mjs auth retry coverage drifted from SDK AUTH_ERROR_MAX_RETRIES, AUTH_ERROR_BASE_DELAY, or AUTH_ERROR_MAX_DELAY",
                file=sys.stderr,
            )
        if task_heartbeat_contract_drift:
            print(
                "sidecar/check-sdk-e2e.mjs task heartbeat coverage drifted from SDK TASK_HEARTBEAT_INTERVAL",
                file=sys.stderr,
            )
        if ping_interval_contract_drift:
            print(
                "sidecar/check-sdk-e2e.mjs default ping coverage drifted from SDK DEFAULT_PING_INTERVAL",
                file=sys.stderr,
            )
        if ping_timeout_contract_drift:
            print(
                "sidecar/check-sdk-e2e.mjs default ping timeout coverage drifted from SDK pingTimeout default",
                file=sys.stderr,
            )
        if reconnect_interval_contract_drift:
            print(
                "sidecar/check-sdk-e2e.mjs default reconnect coverage drifted from SDK DEFAULT_RECONNECT_INTERVAL",
                file=sys.stderr,
            )
        if action_timeout_contract_drift:
            print(
                "sidecar/check-sdk-e2e.mjs action timeout coverage drifted from SDK DEFAULT_ACTION_TIMEOUT",
                file=sys.stderr,
            )
        if generated_call_id_contract_drift:
            print(
                "sidecar/check-sdk-e2e.mjs generated callId coverage drifted from SDK generateCallId()",
                file=sys.stderr,
            )
        if e2e_runtime_coverage_missing:
            print("sidecar/check-sdk-e2e.mjs is missing SDK runtime queue/cron/mentions coverage", file=sys.stderr)
        if clean_install_platform_contract_missing:
            print("scripts/check_clean_install.py is missing Arinova platform contract coverage", file=sys.stderr)
        if user_install_contract_missing:
            print("scripts/check_user_install.py is missing real Hermes home install coverage", file=sys.stderr)
        if gateway_config_contract_missing:
            print("scripts/check_gateway_config_load.py is missing Hermes config.yaml load coverage", file=sys.stderr)
        if live_gate_contract_missing:
            print("scripts/check_live_connection*.py are missing live credential gate coverage", file=sys.stderr)
        if live_agent_sdk_call_missing:
            print(
                "scripts/check_live_connection.py is missing live call_agent_sdk coverage:",
                ", ".join(live_agent_sdk_call_missing),
                file=sys.stderr,
            )
        if live_probe_category_drift:
            for label, methods in sorted(live_probe_category_drift.items()):
                print(
                    f"Live SDK probe category {label} drift: " + ", ".join(methods),
                    file=sys.stderr,
                )
        if live_gate_sdk_assertion_missing:
            print(
                "scripts/check_live_connection_gate.py is missing SDK call assertion coverage:",
                ", ".join(live_gate_sdk_assertion_missing),
                file=sys.stderr,
            )
        if live_return_identity_contract_missing:
            print(
                "scripts/check_live_connection*.py are missing live returned-resource identity coverage:",
                ", ".join(live_return_identity_contract_missing),
                file=sys.stderr,
            )
        if live_action_result_correlation_contract_missing:
            print(
                "scripts/check_live_connection*.py are missing live action-result correlation coverage:",
                ", ".join(live_action_result_correlation_contract_missing),
                file=sys.stderr,
            )
        if live_probe_strict_json_contract_missing:
            print(
                "scripts/check_live_connection*.py are missing strict live probe JSON coverage:",
                ", ".join(live_probe_strict_json_contract_missing),
                file=sys.stderr,
            )
        if live_gate_sdk_assertion_category_drift:
            for label, methods in sorted(live_gate_sdk_assertion_category_drift.items()):
                print(
                    f"Live SDK credential-gate assertion category {label} drift: " + ", ".join(methods),
                    file=sys.stderr,
                )
        if live_task_helper_probe_stale:
            print(
                "Live task helper probe methods are not exposed TaskContext helpers:",
                ", ".join(live_task_helper_probe_stale),
                file=sys.stderr,
            )
        if live_task_helper_gate_assertion_missing:
            print(
                "scripts/check_live_connection_gate.py is missing task helper SDK call assertion coverage:",
                ", ".join(live_task_helper_gate_assertion_missing),
                file=sys.stderr,
            )
        if python_task_handler_check_missing:
            print(
                "scripts/check_arinova_tools.py is missing task helper handler coverage:",
                ", ".join(python_task_handler_check_missing),
                file=sys.stderr,
            )
        if env_enablement_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing env_enablement coverage", file=sys.stderr)
        if config_callback_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing config callback coverage", file=sys.stderr)
        if hermes_platform_metadata_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing Arinova platform metadata coverage", file=sys.stderr)
        if hermes_toolset_name_contract_missing:
            print("Arinova tools are not registered under the hermes-arinova toolset", file=sys.stderr)
        if hermes_registry_schema_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing all-tool registry schema coverage", file=sys.stderr)
        if hermes_python_guard_missing:
            print(
                "Hermes-dependent check scripts are missing Python 3.10+ guards:",
                ", ".join(hermes_python_guard_missing),
                file=sys.stderr,
            )
        if readme_live_gate_drift:
            print("README is missing live Arinova health/getAgentId release-gate documentation", file=sys.stderr)
        if readme_manifest_tool_missing:
            print(
                "README is missing manifest-declared Hermes tool names:",
                ", ".join(readme_manifest_tool_missing),
                file=sys.stderr,
            )
        if readme_check_snippets_missing:
            print("README development check command drift:", ", ".join(readme_check_snippets_missing), file=sys.stderr)
        if readme_surface_check_drift:
            print("README is missing SDK surface drift verification documentation", file=sys.stderr)
        if readme_install_schema_drift:
            print("README is missing install-time SDK tool schema verification documentation", file=sys.stderr)
        if local_check_drift:
            print("scripts/check_local.py is missing aggregate local gate coverage", file=sys.stderr)
        if sdk_surface_cli_drift:
            print("scripts/check_sdk_surface.py is missing SDK root CLI coverage", file=sys.stderr)
        if agent_sdk_source_check_drift:
            print("scripts/check_agent_sdk_source.py is missing source SDK health or bundled package parity coverage", file=sys.stderr)
        if live_validator_category_drift:
            for category, missing in sorted(live_validator_category_drift.items()):
                print(
                    f"Live smoke validator category {category} is missing field-set mappings: "
                    + ", ".join(missing),
                    file=sys.stderr,
                )
        if live_validator_field_drift:
            for name, drift in sorted(live_validator_field_drift.items()):
                print(
                    f"Live smoke validator field drift for {name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if live_validator_field_usage_drift:
            for field_set_name, drift in sorted(live_validator_field_usage_drift.items()):
                print(
                    f"Live smoke validator {drift['validator']} does not validate fields from {field_set_name}: "
                    + ", ".join(drift["missing"]),
                    file=sys.stderr,
                )
        if live_validator_field_shape_drift:
            for field_set_name, drift in sorted(live_validator_field_shape_drift.items()):
                missing = ", ".join(
                    f"{field}:{shape}" for field, shape in sorted(drift["missing"].items())
                )
                print(
                    f"Live smoke validator {drift['validator']} shape drift for {field_set_name} "
                    f"({drift['interface']}): {missing}",
                    file=sys.stderr,
                )
        if send_message_compat_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing Arinova send_message compatibility coverage", file=sys.stderr)
        if mention_metadata_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing Arinova completion mention metadata coverage", file=sys.stderr)
        if terminal_task_completion_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing Arinova terminal task completion coverage", file=sys.stderr)
        if task_context_metadata_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing Arinova task context metadata coverage", file=sys.stderr)
        if same_conversation_task_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing same-conversation Arinova task routing coverage", file=sys.stderr)
        if sidecar_lifecycle_coverage_missing:
            print("scripts/check_hermes_plugin_load.py is missing Arinova sidecar lifecycle coverage", file=sys.stderr)
        if tool_wrapper_coverage_missing:
            print("scripts/check_arinova_tools.py is missing Hermes tool wrapper behavior coverage", file=sys.stderr)
        if tool_report_hook_missing:
            print("Arinova post_tool_call reportToolCall hook coverage or manifest declaration is missing", file=sys.stderr)
        if schema_field_drift:
            for schema_name, drift in sorted(schema_field_drift.items()):
                print(
                    f"Hermes tool schema field drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if schema_required_drift:
            for schema_name, drift in sorted(schema_required_drift.items()):
                print(
                    f"Hermes tool schema required-field drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if schema_shape_drift:
            for schema_name, drift in sorted(schema_shape_drift.items()):
                print(
                    f"Hermes tool schema type-shape drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if task_context_nested_e2e_drift:
            for label, drift in sorted(task_context_nested_e2e_drift.items()):
                print(
                    f"sidecar/check-sdk-e2e.mjs TaskContext nested field coverage drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if task_context_nested_e2e_shape_drift:
            for label, drift in sorted(task_context_nested_e2e_shape_drift.items()):
                print(
                    f"sidecar/check-sdk-e2e.mjs TaskContext nested type-shape coverage drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if nested_schema_field_drift:
            for schema_name, drift in sorted(nested_schema_field_drift.items()):
                print(
                    f"Hermes nested tool schema field drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if nested_schema_required_drift:
            for schema_name, drift in sorted(nested_schema_required_drift.items()):
                print(
                    f"Hermes nested tool schema required-field drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if nested_schema_shape_drift:
            for schema_name, drift in sorted(nested_schema_shape_drift.items()):
                print(
                    f"Hermes nested tool schema type-shape drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if sidecar_schema_field_drift:
            for schema_name, drift in sorted(sidecar_schema_field_drift.items()):
                print(
                    f"Sidecar schema field drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if sidecar_schema_required_drift:
            for schema_name, drift in sorted(sidecar_schema_required_drift.items()):
                print(
                    f"Sidecar schema required-field drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if sidecar_schema_shape_drift:
            for schema_name, drift in sorted(sidecar_schema_shape_drift.items()):
                print(
                    f"Sidecar schema type-shape drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if sidecar_upload_schema_drift:
            for schema_name, drift in sorted(sidecar_upload_schema_drift.items()):
                print(
                    f"Sidecar upload schema drift for {schema_name}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if sidecar_nested_schema_field_drift:
            for schema_name, drift in sorted(sidecar_nested_schema_field_drift.items()):
                print(
                    f"Sidecar nested schema field drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if sidecar_nested_schema_required_drift:
            for schema_name, drift in sorted(sidecar_nested_schema_required_drift.items()):
                print(
                    f"Sidecar nested schema required-field drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if sidecar_nested_schema_shape_drift:
            for schema_name, drift in sorted(sidecar_nested_schema_shape_drift.items()):
                print(
                    f"Sidecar nested schema type-shape drift for {schema_name} "
                    f"({drift['interface']}): expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if tab_indented_files:
            print(
                "Critical sidecar/plugin files contain tab indentation:",
                ", ".join(tab_indented_files),
                file=sys.stderr,
            )
        if runtime_param_drift:
            for method, expected in sorted(runtime_param_drift.items()):
                actual = installed_method_params.get(method)
                print(
                    f"Installed SDK parameter drift for {method}: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if runtime_task_param_drift:
            for method, expected in sorted(runtime_task_param_drift.items()):
                actual = installed_task_helper_params.get(method)
                print(
                    f"Installed SDK task parameter drift for {method}: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sdk_task_param_arity_category_drift:
            for label, methods in sorted(sdk_task_param_arity_category_drift.items()):
                print(
                    f"SDK task helper parameter arity category {label} drift: " + ", ".join(methods),
                    file=sys.stderr,
                )
        if runtime_return_drift:
            for method, expected in sorted(runtime_return_drift.items()):
                actual = installed_method_returns.get(method)
                print(
                    f"Installed SDK return drift for {method}: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sdk_return_shape_category_drift:
            for label, methods in sorted(sdk_return_shape_category_drift.items()):
                print(
                    f"SDK method return-shape category {label} drift: " + ", ".join(methods),
                    file=sys.stderr,
                )
        if python_void_return_missing:
            print(
                "scripts/check_arinova_tools.py VOID_AGENT_METHODS is missing SDK void-return methods:",
                ", ".join(python_void_return_missing),
                file=sys.stderr,
            )
        if python_void_return_stale:
            print(
                "scripts/check_arinova_tools.py VOID_AGENT_METHODS has non-void SDK methods:",
                ", ".join(python_void_return_stale),
                file=sys.stderr,
            )
        if adapter_void_return_missing:
            print(
                "adapter.py VOID_AGENT_METHODS is missing SDK void-return methods:",
                ", ".join(adapter_void_return_missing),
                file=sys.stderr,
            )
        if adapter_void_return_stale:
            print(
                "adapter.py VOID_AGENT_METHODS has non-void SDK methods:",
                ", ".join(adapter_void_return_stale),
                file=sys.stderr,
            )
        if runtime_task_return_drift:
            for method, expected in sorted(runtime_task_return_drift.items()):
                actual = installed_task_helper_returns.get(method)
                print(
                    f"Installed SDK task return drift for {method}: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sdk_task_return_shape_category_drift:
            for label, methods in sorted(sdk_task_return_shape_category_drift.items()):
                print(
                    f"SDK task helper return-shape category {label} drift: " + ", ".join(methods),
                    file=sys.stderr,
                )
        if runtime_task_callable_param_drift:
            for name, expected in sorted(runtime_task_callable_param_drift.items()):
                actual = installed_task_callable_params.get(name)
                print(
                    f"Installed SDK TaskContext callable params drift for {name}: "
                    f"expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sdk_task_callable_category_drift:
            for label, names in sorted(sdk_task_callable_category_drift.items()):
                print(
                    f"SDK TaskContext callable category {label} drift: " + ", ".join(names),
                    file=sys.stderr,
                )
        if runtime_task_callable_return_drift:
            for name, expected in sorted(runtime_task_callable_return_drift.items()):
                actual = installed_task_callable_returns.get(name)
                print(
                    f"Installed SDK TaskContext callable return drift for {name}: "
                    f"expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if runtime_task_callable_category_drift:
            for label, names in sorted(runtime_task_callable_category_drift.items()):
                print(
                    f"Installed SDK TaskContext callable category {label} drift: " + ", ".join(names),
                    file=sys.stderr,
                )
        if runtime_type_symbol_missing:
            print(
                "Installed SDK is missing local exported types:",
                ", ".join(runtime_type_symbol_missing),
                file=sys.stderr,
            )
        if runtime_type_symbol_extra:
            print(
                "Installed SDK has exported types not in local source:",
                ", ".join(runtime_type_symbol_extra),
                file=sys.stderr,
            )
        if runtime_interface_field_drift:
            for name, expected in sorted(runtime_interface_field_drift.items()):
                actual = sorted(installed_interface_fields.get(name, set()))
                print(
                    f"Installed SDK interface field drift for {name}: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if runtime_interface_required_drift:
            for name, expected in sorted(runtime_interface_required_drift.items()):
                actual = sorted(installed_interface_required_fields.get(name, set()))
                print(
                    f"Installed SDK interface required-field drift for {name}: "
                    f"expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if runtime_interface_shape_drift:
            for name, expected in sorted(runtime_interface_shape_drift.items()):
                actual = installed_interface_shapes.get(name, {})
                print(
                    f"Installed SDK interface type-shape drift for {name}: "
                    f"expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if runtime_task_context_nested_field_drift:
            for label, drift in sorted(runtime_task_context_nested_field_drift.items()):
                print(
                    f"Installed SDK TaskContext nested field drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if runtime_task_context_nested_required_drift:
            for label, drift in sorted(runtime_task_context_nested_required_drift.items()):
                print(
                    f"Installed SDK TaskContext nested required-field drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if runtime_task_context_nested_shape_drift:
            for label, drift in sorted(runtime_task_context_nested_shape_drift.items()):
                print(
                    f"Installed SDK TaskContext nested type-shape drift for {label}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if runtime_type_alias_body_drift:
            for name, drift in sorted(runtime_type_alias_body_drift.items()):
                print(
                    f"Installed SDK type alias drift for {name}: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if runtime_public_type_missing:
            print(
                "Installed SDK public entrypoint is missing local type exports:",
                ", ".join(runtime_public_type_missing),
                file=sys.stderr,
            )
        if runtime_public_type_extra:
            print(
                "Installed SDK public entrypoint has type exports not in local source:",
                ", ".join(runtime_public_type_extra),
                file=sys.stderr,
            )
        if runtime_public_value_missing:
            print(
                "Installed SDK public entrypoint is missing local value exports:",
                ", ".join(runtime_public_value_missing),
                file=sys.stderr,
            )
        if runtime_public_value_extra:
            print(
                "Installed SDK public entrypoint has value exports not in local source:",
                ", ".join(runtime_public_value_extra),
                file=sys.stderr,
            )
        if runtime_action_protocol_drift:
            print(
                f"Installed SDK action protocol drift: "
                f"expected={sdk_action_protocol} actual={installed_action_protocol}",
                file=sys.stderr,
            )
        if python_drift:
            print("Python/sidecar SDK method drift:", ", ".join(python_drift), file=sys.stderr)
        if python_task_drift:
            print("Python/sidecar task SDK helper drift:", ", ".join(python_task_drift), file=sys.stderr)
        if python_duplicate_literal_keys:
            for name, duplicates in sorted(python_duplicate_literal_keys.items()):
                print(
                    f"Python file has duplicate string literal dict key(s) in {name}: "
                    + ", ".join(duplicates),
                    file=sys.stderr,
                )
        if duplicate_key_scanner_contract_missing:
            print("Duplicate-key scanner contract check failed", file=sys.stderr)
        if sidecar_duplicate_literal_keys:
            for name, duplicates in sorted(sidecar_duplicate_literal_keys.items()):
                print(
                    f"Sidecar file has duplicate object key(s) in {name}: "
                    + ", ".join(duplicates),
                    file=sys.stderr,
                )
        if sidecar_duplicate_map_keys:
            for name, duplicates in sorted(sidecar_duplicate_map_keys.items()):
                print(
                    f"Sidecar SDK contract map has duplicate method key(s) in {name}: "
                    + ", ".join(duplicates),
                    file=sys.stderr,
                )
        if named_arg_missing:
            for method, expected in sorted(named_arg_missing.items()):
                actual = python_named_args.get(method)
                print(
                    f"Python named args for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if named_arg_stale:
            print("Python named args for non-parameter SDK methods:", ", ".join(named_arg_stale), file=sys.stderr)
        if task_named_arg_missing:
            for method, expected in sorted(task_named_arg_missing.items()):
                actual = python_task_named_args.get(method)
                print(
                    f"Python task named args for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if task_named_arg_stale:
            print(
                "Python task named args for non-parameter SDK helpers:",
                ", ".join(task_named_arg_stale),
                file=sys.stderr,
            )
        if sidecar_agent_arg_type_drift:
            for method, expected in sorted(sidecar_agent_arg_type_drift.items()):
                actual = sidecar_agent_arg_types.get(method)
                print(
                    f"Sidecar agent arg types for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_task_arg_type_drift:
            for method, expected in sorted(sidecar_task_arg_type_drift.items()):
                actual = sidecar_task_arg_types.get(method)
                print(
                    f"Sidecar task arg types for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_agent_arg_type_stale:
            print("Sidecar agent arg types for non-parameter SDK methods:", ", ".join(sidecar_agent_arg_type_stale), file=sys.stderr)
        if sidecar_task_arg_type_stale:
            print("Sidecar task arg types for non-parameter SDK helpers:", ", ".join(sidecar_task_arg_type_stale), file=sys.stderr)
        if sidecar_agent_arg_name_drift:
            for method, expected in sorted(sidecar_agent_arg_name_drift.items()):
                actual = sidecar_agent_arg_names.get(method)
                print(
                    f"Sidecar agent arg names for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_task_arg_name_drift:
            for method, expected in sorted(sidecar_task_arg_name_drift.items()):
                actual = sidecar_task_arg_names.get(method)
                print(
                    f"Sidecar task arg names for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_agent_arg_name_stale:
            print("Sidecar agent arg names for non-parameter SDK methods:", ", ".join(sidecar_agent_arg_name_stale), file=sys.stderr)
        if sidecar_task_arg_name_stale:
            print("Sidecar task arg names for non-parameter SDK helpers:", ", ".join(sidecar_task_arg_name_stale), file=sys.stderr)
        if sidecar_agent_arg_schema_drift:
            for method, expected in sorted(sidecar_agent_arg_schema_drift.items()):
                actual = sidecar_agent_arg_schemas.get(method)
                print(
                    f"Sidecar agent arg schemas for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_task_arg_schema_drift:
            for method, expected in sorted(sidecar_task_arg_schema_drift.items()):
                actual = sidecar_task_arg_schemas.get(method)
                print(
                    f"Sidecar task arg schemas for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_agent_arg_schema_stale:
            print("Sidecar agent arg schemas for non-structured SDK methods:", ", ".join(sidecar_agent_arg_schema_stale), file=sys.stderr)
        if sidecar_task_arg_schema_stale:
            print("Sidecar task arg schemas for non-structured SDK helpers:", ", ".join(sidecar_task_arg_schema_stale), file=sys.stderr)
        if python_direct_arg_type_validation_missing:
            print(
                "scripts/check_arinova_tools.py is missing direct argument type validation coverage:",
                ", ".join(python_direct_arg_type_validation_missing),
                file=sys.stderr,
            )
        if python_positional_arg_type_validation_missing:
            print(
                "scripts/check_arinova_tools.py is missing positional argument type validation coverage:",
                ", ".join(python_positional_arg_type_validation_missing),
                file=sys.stderr,
            )
        if python_direct_helper_validation_contract_missing:
            print("Python direct SDK helper validation contract is missing", file=sys.stderr)
        if required_arg_count_drift:
            for method, expected in sorted(required_arg_count_drift.items()):
                actual = python_required_arg_counts.get(method)
                print(
                    f"Python required arg count for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if required_arg_count_stale:
            print(
                "Python required arg counts for SDK methods without required args:",
                ", ".join(required_arg_count_stale),
                file=sys.stderr,
            )
        if task_required_arg_count_drift:
            for method, expected in sorted(task_required_arg_count_drift.items()):
                actual = python_task_required_arg_counts.get(method)
                print(
                    f"Python task required arg count for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if task_required_arg_count_stale:
            print(
                "Python task required arg counts for helpers without required args:",
                ", ".join(task_required_arg_count_stale),
                file=sys.stderr,
            )
        if max_arg_count_drift:
            for method, expected in sorted(max_arg_count_drift.items()):
                actual = python_max_arg_counts.get(method)
                print(
                    f"Python max arg count for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if task_max_arg_count_drift:
            for method, expected in sorted(task_max_arg_count_drift.items()):
                actual = python_task_max_arg_counts.get(method)
                print(
                    f"Python task max arg count for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if agent_schema_arg_bound_drift:
            for method, drift in sorted(agent_schema_arg_bound_drift.items()):
                print(
                    f"Hermes tool positional args bounds for {method} drift: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if agent_schema_arg_bound_stale:
            print(
                "Hermes tool positional args bounds for stale SDK methods:",
                ", ".join(agent_schema_arg_bound_stale),
                file=sys.stderr,
            )
        if task_schema_arg_bound_drift:
            for method, drift in sorted(task_schema_arg_bound_drift.items()):
                print(
                    f"Hermes task tool positional args bounds for {method} drift: "
                    f"expected={drift['expected']} actual={drift['actual']}",
                    file=sys.stderr,
                )
        if task_schema_arg_bound_stale:
            print(
                "Hermes task tool positional args bounds for stale SDK helpers:",
                ", ".join(task_schema_arg_bound_stale),
                file=sys.stderr,
            )
        if sidecar_required_arg_count_drift:
            for method, expected in sorted(sidecar_required_arg_count_drift.items()):
                actual = sidecar_agent_required_counts.get(method)
                print(
                    f"Sidecar required arg count for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_required_arg_count_stale:
            print(
                "Sidecar required arg counts for SDK methods without required args:",
                ", ".join(sidecar_required_arg_count_stale),
                file=sys.stderr,
            )
        if sidecar_task_required_arg_count_drift:
            for method, expected in sorted(sidecar_task_required_arg_count_drift.items()):
                actual = sidecar_task_required_counts.get(method)
                print(
                    f"Sidecar task required arg count for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_task_required_arg_count_stale:
            print(
                "Sidecar task required arg counts for helpers without required args:",
                ", ".join(sidecar_task_required_arg_count_stale),
                file=sys.stderr,
            )
        if sidecar_max_arg_count_drift:
            for method, expected in sorted(sidecar_max_arg_count_drift.items()):
                actual = sidecar_agent_max_counts.get(method)
                print(
                    f"Sidecar max arg count for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_max_arg_count_stale:
            print(
                "Sidecar max arg counts for non-SDK methods:",
                ", ".join(sidecar_max_arg_count_stale),
                file=sys.stderr,
            )
        if sidecar_task_max_arg_count_drift:
            for method, expected in sorted(sidecar_task_max_arg_count_drift.items()):
                actual = sidecar_task_max_counts.get(method)
                print(
                    f"Sidecar task max arg count for {method} drift: expected={expected} actual={actual}",
                    file=sys.stderr,
                )
        if sidecar_task_max_arg_count_stale:
            print(
                "Sidecar task max arg counts for non-helper methods:",
                ", ".join(sidecar_task_max_arg_count_stale),
                file=sys.stderr,
            )
        if description_missing:
            print("Python method descriptions missing:", ", ".join(description_missing), file=sys.stderr)
        if description_stale:
            print("Python method descriptions stale:", ", ".join(description_stale), file=sys.stderr)
        if manifest_drift:
            print("Manifest tool drift:", ", ".join(manifest_drift), file=sys.stderr)
        if manifest_order_drift:
            print(
                "Manifest tool order drift: "
                f"expected={expected_manifest_order} actual={manifest_order}",
                file=sys.stderr,
            )
        if manifest_env_drift:
            print("Manifest env drift:", ", ".join(manifest_env_drift), file=sys.stderr)
        if manifest_concurrency_default_drift:
            print("Manifest concurrency default description drifted from SDK default", file=sys.stderr)
        if manifest_skill_contract_drift:
            print("Manifest/README skill config contract drifted from runtime validation", file=sys.stderr)
        if readme_env_drift:
            print("README env drift:", ", ".join(readme_env_drift), file=sys.stderr)
        if runtime_env_missing:
            print("Manifest env vars missing runtime ownership:", ", ".join(runtime_env_missing), file=sys.stderr)
        if sdk_option_config_coverage_missing:
            print(
                "ArinovaAgentOptions config coverage missing: "
                + "; ".join(sdk_option_config_coverage_missing),
                file=sys.stderr,
            )
        if stale_sdk_option_config:
            print(
                "ArinovaAgentOptions config contract has stale entries: "
                + ", ".join(stale_sdk_option_config),
                file=sys.stderr,
            )
        if yaml_special_drift:
            print("YAML special-key bridge drift:", ", ".join(yaml_special_drift), file=sys.stderr)
        if readme_yaml_drift:
            print("README YAML config drift:", ", ".join(readme_yaml_drift), file=sys.stderr)
        if version_drift:
            print(
                f"Installed SDK version drift: local={local_version} installed={installed_version}",
                file=sys.stderr,
            )
        if package_metadata_drift:
            print(
                "Installed SDK package metadata drift: "
                f"expected={local_package_metadata} actual={installed_package_metadata}",
                file=sys.stderr,
            )
        if adapter_sdk_metadata_key_drift:
            print(
                "adapter.py SDK_PACKAGE_PUBLIC_METADATA_KEYS drift: "
                f"expected={list(SDK_PACKAGE_PUBLIC_METADATA_KEYS)} actual={list(adapter_sdk_metadata_keys)}",
                file=sys.stderr,
            )
        if adapter_sdk_package_metadata_contract_drift:
            print(
                "adapter.py SDK package metadata guard drifted from local agent-sdk comparison contract",
                file=sys.stderr,
            )
        if adapter_sdk_package_file_drift:
            print(
                "adapter.py SDK_PACKAGE_FILES drift: "
                f"expected={list(SDK_PACKAGE_FILES)} actual={list(adapter_sdk_package_files)}",
                file=sys.stderr,
            )
        if adapter_sdk_package_name_drift:
            print(
                "adapter.py SDK package name drift: "
                f"expected={local_package.get('name')!r} actual={adapter_sdk_package_name!r}",
                file=sys.stderr,
            )
        if adapter_sdk_package_type_drift:
            print(
                "adapter.py SDK package type drift: "
                f"expected={local_package.get('type')!r} actual={adapter_sdk_package_type!r}",
                file=sys.stderr,
            )
        if adapter_sdk_package_exports_contract_drift:
            print(
                "adapter.py SDK package exports guard drifted: expected import/types export validation "
                f"for local exports={expected_adapter_sdk_package_exports!r}",
                file=sys.stderr,
            )
        if missing_sidecar_check_scripts:
            print(
                "sidecar package.json check script is missing verifier(s): "
                + ", ".join(missing_sidecar_check_scripts),
                file=sys.stderr,
            )
        if dependency_spec_drift:
            print(
                f"Sidecar SDK dependency must be pinned to local version: "
                f"dependency={dependency_spec} local={local_version}",
                file=sys.stderr,
            )
        if lockfile_version_drift:
            print(
                "Sidecar lockfile version drift: "
                f"expected=3 actual={lockfile_version!r}",
                file=sys.stderr,
            )
        if lockfile_requires_drift:
            print(
                "Sidecar lockfile requires flag drift: "
                f"expected=True actual={lockfile_requires!r}",
                file=sys.stderr,
            )
        if lock_root_name_drift:
            print(
                "Sidecar lockfile root package name drift: "
                f"expected={sidecar_pkg.get('name')!r} actual={lock_root_name!r}",
                file=sys.stderr,
            )
        if lock_root_version_drift:
            print(
                "Sidecar lockfile root package version drift: "
                f"expected={sidecar_pkg.get('version')!r} actual={lock_root_version!r}",
                file=sys.stderr,
            )
        if lock_root_dependencies_drift:
            print(
                "Sidecar lockfile root dependencies drift: "
                f"expected={sidecar_pkg.get('dependencies')!r} actual={lock_root_dependencies!r}",
                file=sys.stderr,
            )
        if lock_root_engines_drift:
            print(
                "Sidecar lockfile root engines drift: "
                f"expected={sidecar_pkg.get('engines')!r} actual={lock_root_engines!r}",
                file=sys.stderr,
            )
        if lock_dependency_spec_drift:
            print(
                f"Sidecar lockfile SDK dependency must be pinned to local version: "
                f"dependency={lock_dependency_spec} local={local_version}",
                file=sys.stderr,
            )
        if lock_package_version_drift:
            print(
                f"Sidecar lockfile SDK package version drift: "
                f"lock={lock_package_version} local={local_version}",
                file=sys.stderr,
            )
        if lock_package_resolved_drift:
            print(
                "Sidecar lockfile SDK package tarball drift: "
                f"expected={expected_lock_package_resolved!r} actual={lock_package_resolved!r}",
                file=sys.stderr,
            )
        if lock_package_license_drift:
            print(
                "Sidecar lockfile SDK package license drift: "
                f"expected={local_package.get('license')!r} actual={lock_package_license!r}",
                file=sys.stderr,
            )
        if lock_package_integrity_missing:
            print(
                "Sidecar lockfile SDK package integrity is missing or not sha512: "
                f"actual={lock_package_integrity!r}",
                file=sys.stderr,
            )
        if clean_required_file_drift:
            print(
                "scripts/check_clean_install.py REQUIRED_PLUGIN_FILES drift: "
                f"expected={list(REQUIRED_PLUGIN_FILES)} actual={list(clean_install_required_files)}",
                file=sys.stderr,
            )
        if user_required_file_drift:
            print(
                "scripts/check_user_install.py REQUIRED_PLUGIN_FILES drift: "
                f"expected={list(REQUIRED_PLUGIN_FILES)} actual={list(user_install_required_files)}",
                file=sys.stderr,
            )
        if clean_sdk_package_file_drift:
            print(
                "scripts/check_clean_install.py SDK_PACKAGE_FILES drift: "
                f"expected={list(SDK_PACKAGE_FILES)} actual={list(clean_sdk_package_files)}",
                file=sys.stderr,
            )
        if user_sdk_package_file_drift:
            print(
                "scripts/check_user_install.py SDK_PACKAGE_FILES drift: "
                f"expected={list(SDK_PACKAGE_FILES)} actual={list(user_sdk_package_files)}",
                file=sys.stderr,
            )
        if clean_sdk_metadata_key_drift:
            print(
                "scripts/check_clean_install.py SDK_PACKAGE_PUBLIC_METADATA_KEYS drift: "
                f"expected={list(SDK_PACKAGE_PUBLIC_METADATA_KEYS)} actual={list(clean_sdk_metadata_keys)}",
                file=sys.stderr,
            )
        if user_sdk_metadata_key_drift:
            print(
                "scripts/check_user_install.py SDK_PACKAGE_PUBLIC_METADATA_KEYS drift: "
                f"expected={list(SDK_PACKAGE_PUBLIC_METADATA_KEYS)} actual={list(user_sdk_metadata_keys)}",
                file=sys.stderr,
            )
        if missing_required_plugin_files:
            print(
                "Checkout is missing required plugin file(s): "
                + ", ".join(missing_required_plugin_files),
                file=sys.stderr,
            )
        return 1

    print(
        f"sidecar/Python/manifest SDK surface OK "
        f"({len(exposed)} exposed methods, {len(exposed_task)} task helpers, "
        f"{agent_param_contract_count} agent parameter contracts, "
        f"{task_param_contract_count} task parameter contracts, "
        f"{sdk_task_required_param_helper_contract_count} SDK task required-parameter helper contracts, "
        f"{sdk_task_optional_only_param_helper_contract_count} SDK task optional-only helper contracts, "
        f"{agent_return_contract_count} agent return contracts, "
        f"{task_return_contract_count} task return contracts, "
        f"{sdk_task_reply_callable_contract_count} TaskContext reply callable contracts, "
        f"{sdk_task_sdk_helper_callable_contract_count} TaskContext SDK helper callable contracts, "
        f"{sdk_task_void_return_contract_count} SDK task void return contracts, "
        f"{sdk_task_nullable_return_contract_count} SDK task nullable return contracts, "
        f"{sdk_task_array_return_contract_count} SDK task array return contracts, "
        f"{sdk_task_object_return_contract_count} SDK task object return contracts, "
        f"{len(exposed_task_fields)} task fields, {len(exposed_skill_fields)} skill fields, "
        f"{len(exposed_option_fields)} option fields, "
        f"{len(exposed_control_env)} control env options, "
        f"{len(exposed_agent_events)} agent events, "
        f"{len(sdk_task_update_statuses)} task update statuses, "
        f"{len(sdk_action_result_statuses)} action result statuses, "
        f"{sdk_void_return_contract_count} SDK void return contracts, "
        f"{sdk_nullable_return_contract_count} SDK nullable return contracts, "
        f"{sdk_array_return_contract_count} SDK array return contracts, "
        f"{sdk_object_return_contract_count} SDK object return contracts, "
        f"{auth_protocol_contract_count} auth protocol contract, "
        f"{auth_frame_contract_count} auth frame contracts, "
        f"{auth_frame_detail_contract_count} auth frame detail contracts, "
        f"{command_frame_contract_count} command frame contracts, "
        f"{command_frame_detail_contract_count} command frame detail contracts, "
        f"{runtime_frame_contract_count} runtime frame contracts, "
        f"{runtime_frame_detail_contract_count} runtime frame detail contracts, "
        f"{sdk_behavior_contract_count} SDK behavior contracts, "
        f"{e2e_runtime_coverage_contract_count} runtime E2E coverage contract, "
        f"{e2e_queue_cron_contract_count} runtime E2E queue and cron contract, "
        f"{e2e_skill_config_contract_count} runtime E2E skill config contract, "
        f"{e2e_outbound_delivery_contract_count} runtime E2E outbound delivery contract, "
        f"{e2e_task_context_action_contract_count} runtime E2E TaskContext action contract, "
        f"{e2e_tool_report_contract_count} runtime E2E tool report contract, "
        f"{e2e_reconnect_buffer_contract_count} runtime E2E reconnect buffer contract, "
        f"{e2e_concurrency_mode_contract_count} runtime E2E concurrency mode contract, "
        f"{e2e_auth_reconnect_contract_count} runtime E2E auth reconnect contract, "
        f"{e2e_shutdown_cleanup_contract_count} runtime E2E shutdown cleanup contract, "
        f"{runtime_upload_validation_contract_count} runtime upload validation contract, "
        f"{runtime_control_validation_contract_count} runtime control validation contract, "
        f"{runtime_structured_arg_validation_contract_count} runtime structured argument validation contract, "
        f"{queue_overflow_contract_count} queue overflow contract, "
        f"{auth_retry_contract_count} auth retry contract, "
        f"{task_heartbeat_contract_count} task heartbeat contract, "
        f"{ping_interval_contract_count} ping interval contract, "
        f"{ping_timeout_contract_count} ping timeout contract, "
        f"{reconnect_interval_contract_count} reconnect interval contract, "
        f"{action_timeout_contract_count} action timeout contract, "
        f"{generated_call_id_contract_count} generated callId contract, "
        f"{onboarding_seed_contract_count} onboarding seed contract, "
        f"{control_result_contract_count} control result contract, "
        f"{http_method_contract_count} HTTP-backed method contracts, "
        f"{http_message_file_history_contract_count} HTTP message/file/history method contracts, "
        f"{http_note_contract_count} HTTP note method contracts, "
        f"{http_kanban_contract_count} HTTP kanban method contracts, "
        f"{http_memory_skill_contract_count} HTTP memory and skill method contracts, "
        f"{http_query_option_contract_count} HTTP query option contracts, "
        f"{http_query_option_field_contract_count} HTTP query option field contracts, "
        f"{http_backend_behavior_contract_count} HTTP backend behavior contract, "
        f"{http_error_propagation_contract_count} HTTP error propagation contract, "
        f"{http_upload_mime_contract_count} HTTP upload MIME contract, "
        f"{http_return_payload_contract_count} HTTP return payload contracts, "
        f"{http_return_required_contract_count} HTTP return required-field contracts, "
        f"{http_return_required_field_contract_count} HTTP return required field contracts, "
        f"{http_return_shape_contract_count} HTTP return shape contracts, "
        f"{http_return_shape_field_contract_count} HTTP return shape field contracts, "
        f"{http_return_fixture_field_contract_count} HTTP return fixture field contracts, "
        f"{sdk_list_boards_return_contract_count} listBoards return contract, "
        f"{http_runtime_method_contract_count} HTTP runtime method contracts, "
        f"{http_runtime_method_order_contract_count} HTTP runtime method order contracts, "
        f"{sidecar_check_method_contract_count} sidecar method check contracts, "
        f"{sidecar_check_task_contract_count} sidecar task check contracts, "
        f"{live_agent_sdk_call_contract_count} live SDK probe contracts, "
        f"{live_probe_identity_contract_count} live probe identity contracts, "
        f"{live_probe_message_file_history_contract_count} live probe message/file/history contracts, "
        f"{live_probe_note_contract_count} live probe note contracts, "
        f"{live_probe_kanban_contract_count} live probe kanban contracts, "
        f"{live_probe_memory_skill_contract_count} live probe memory and skill contracts, "
        f"{live_probe_telemetry_action_contract_count} live probe telemetry and action contracts, "
        f"{live_task_helper_probe_contract_count} live task helper probe contracts, "
        f"{live_credential_gate_contract_count} live credential gate contract, "
        f"{live_credential_resolution_contract_count} live credential resolution contract, "
        f"{live_gate_import_config_contract_count} live gate import and config contract, "
        f"{live_gate_sdk_probe_contract_count} live gate SDK probe contract, "
        f"{live_gate_probe_validation_contract_count} live gate probe validation contract, "
        f"{live_gate_sdk_assertion_contract_count} live gate assertion contracts, "
        f"{live_gate_assertion_identity_contract_count} live gate assertion identity contracts, "
        f"{live_gate_assertion_message_file_history_contract_count} live gate assertion message/file/history contracts, "
        f"{live_gate_assertion_note_contract_count} live gate assertion note contracts, "
        f"{live_gate_assertion_kanban_contract_count} live gate assertion kanban contracts, "
        f"{live_gate_assertion_memory_skill_contract_count} live gate assertion memory and skill contracts, "
        f"{live_gate_assertion_telemetry_action_contract_count} live gate assertion telemetry and action contracts, "
        f"{live_return_identity_contract_count} live returned-resource identity contracts, "
        f"{live_action_result_correlation_contract_count} live action-result correlation contracts, "
        f"{live_probe_strict_json_contract_count} live probe strict JSON contracts, "
        f"{live_task_helper_gate_assertion_contract_count} live task helper gate assertion contracts, "
        f"{live_validator_contract_count} live validator contracts, "
        f"{hermes_connection_contract_count} Hermes connection contracts, "
        f"{hermes_tool_schema_contract_count} Hermes tool schema contracts, "
        f"{hermes_toolset_name_contract_count} Hermes toolset name contract, "
        f"{hermes_registry_schema_contract_count} Hermes registry schema contract, "
        f"{hermes_platform_metadata_contract_count} Hermes platform metadata contract, "
        f"{hermes_platform_factory_contract_count} Hermes platform factory contract, "
        f"{hermes_agent_runtime_bridge_contract_count} Hermes agent runtime/bridge invoke contract, "
        f"{hermes_tool_search_bridge_contract_count} Hermes Tool Search bridge contract, "
        f"{hermes_agent_init_contract_count} Hermes AIAgent init contract, "
        f"{hermes_python_guard_contract_count} Hermes Python guard contracts, "
        f"{env_enablement_contract_count} env enablement contract, "
        f"{config_callback_contract_count} config callback contract, "
        f"{python_tool_wrapper_contract_count} Python tool wrapper contracts, "
        f"{tool_report_hook_contract_count} tool report hook contract, "
        f"{schema_alignment_contract_count} SDK schema alignment contracts, "
        f"{schema_field_alignment_contract_count} SDK schema field alignment contracts, "
        f"{schema_required_alignment_contract_count} SDK schema requiredness alignment contracts, "
        f"{schema_shape_alignment_contract_count} SDK schema shape alignment contracts, "
        f"{sdk_install_integrity_contract_count} SDK install integrity contracts, "
        f"{sdk_surface_cli_contract_count} SDK surface CLI contract, "
        f"{clean_install_contract_count} clean install contract, "
        f"{clean_install_yaml_bridge_contract_count} clean install YAML bridge contract, "
        f"{clean_install_platform_callback_contract_count} clean install platform callback contract, "
        f"{clean_install_platform_metadata_contract_count} clean install platform metadata contract, "
        f"{clean_install_platform_factory_contract_count} clean install platform factory contract, "
        f"{clean_install_registry_schema_contract_count} clean install registry schema contract, "
        f"{clean_install_registry_dispatch_contract_count} clean install registry dispatch contract, "
        f"{clean_install_agent_runtime_bridge_contract_count} clean install agent runtime/bridge invoke contract, "
        f"{clean_install_tool_search_bridge_contract_count} clean install Tool Search bridge contract, "
        f"{clean_install_agent_init_contract_count} clean install AIAgent init contract, "
        f"{clean_install_gateway_runner_toolset_contract_count} clean install gateway runner toolset contract, "
        f"{clean_install_sidecar_check_contract_count} clean install sidecar check contract, "
        f"{user_install_contract_count} user install contract, "
        f"{user_install_yaml_bridge_contract_count} user install YAML bridge contract, "
        f"{user_install_platform_callback_contract_count} user install platform callback contract, "
        f"{user_install_platform_metadata_contract_count} user install platform metadata contract, "
        f"{user_install_platform_factory_contract_count} user install platform factory contract, "
        f"{user_install_registry_schema_contract_count} user install registry schema contract, "
        f"{user_install_registry_dispatch_contract_count} user install registry dispatch contract, "
        f"{user_install_agent_runtime_bridge_contract_count} user install agent runtime/bridge invoke contract, "
        f"{user_install_tool_search_bridge_contract_count} user install Tool Search bridge contract, "
        f"{user_install_agent_init_contract_count} user install AIAgent init contract, "
        f"{user_install_gateway_runner_toolset_contract_count} user install gateway runner toolset contract, "
        f"{user_install_sidecar_check_contract_count} user install sidecar check contract, "
        f"{gateway_config_contract_count} gateway config contract, "
        f"{gateway_config_runtime_option_contract_count} gateway config runtime option contract, "
        f"{gateway_config_agent_skill_contract_count} gateway config agent skill contract, "
        f"{gateway_config_alias_contract_count} gateway config alias contract, "
        f"{gateway_runner_toolset_contract_count} gateway runner toolset contract, "
        f"{sidecar_sdk_lock_contract_count} sidecar SDK lockfile contracts, "
        f"{duplicate_key_scanner_contract_count} duplicate-key scanner contracts, "
        f"{sidecar_duplicate_map_key_contract_count} sidecar SDK contract map uniqueness contracts, "
        f"{manifest_skill_contract_count} manifest skill contract, "
        f"{adapter_behavior_contract_count} adapter behavior contracts, "
        f"{send_message_compat_contract_count} send_message compatibility contract, "
        f"{mention_metadata_contract_count} completion mention metadata contract, "
        f"{terminal_task_completion_contract_count} terminal task completion contract, "
        f"{task_context_metadata_behavior_contract_count} TaskContext metadata behavior contract, "
        f"{same_conversation_task_contract_count} same-conversation task contract, "
        f"{sidecar_lifecycle_contract_count} sidecar lifecycle contract, "
        f"{adapter_task_metadata_contract_count} adapter TaskContext metadata contracts, "
        f"{release_gate_documentation_contract_count} release-gate documentation contract, "
        f"{install_schema_documentation_contract_count} install schema documentation contract, "
        f"{sdk_option_config_contract_count} SDK option config contracts, "
        f"{len(python_method_descriptions)} tool descriptions, "
        f"{len(readme_env_exposed)} documented env vars, "
        f"{len(readme_yaml_exposed)} documented YAML keys, "
        f"{len(REQUIRED_PLUGIN_FILES)} required plugin files, "
        f"{len(EXPECTED_SIDECAR_CHECKS)} sidecar check scripts, "
        f"{len(SDK_PACKAGE_FILES)} SDK package files, "
        f"{len(SDK_PACKAGE_PUBLIC_METADATA_KEYS)} SDK package metadata keys, "
        f"{len(sdk_public_types)} public type exports, "
        f"{len(sdk_public_values)} public value exports, "
        f"{len(sdk_interface_fields)} exported interfaces, "
        f"{len(sdk_type_alias_bodies)} exported type aliases, "
        f"{len(task_context_nested_e2e_specs)} TaskContext nested contracts, "
        f"{hermes_schema_contract_count} Hermes schema contracts, "
        f"{len(sidecar_schema_name_map)} sidecar schema contracts, "
        f"{sidecar_upload_schema_contract_count} sidecar upload schema contract, "
        f"{nested_schema_contract_count} nested schema contracts, "
        f"{nested_schema_field_contract_count} nested schema field contract, "
        f"{nested_schema_required_contract_count} nested schema requiredness contract, "
        f"{nested_schema_shape_contract_count} nested schema shape contract, "
        f"{sidecar_schema_field_contract_count} sidecar schema field parity contracts, "
        f"{sidecar_schema_required_contract_count} sidecar schema requiredness parity contracts, "
        f"{sidecar_schema_shape_contract_count} sidecar schema shape parity contracts, "
        f"{sidecar_nested_schema_field_contract_count} sidecar nested schema field parity contract, "
        f"{sidecar_nested_schema_required_contract_count} sidecar nested schema requiredness parity contract, "
        f"{sidecar_nested_schema_shape_contract_count} sidecar nested schema shape parity contract, "
        f"{runtime_agent_param_contract_count} installed SDK agent parameter parity contracts, "
        f"{runtime_task_param_contract_count} installed SDK task parameter parity contracts, "
        f"{runtime_agent_return_contract_count} installed SDK agent return parity contracts, "
        f"{runtime_task_return_contract_count} installed SDK task return parity contracts, "
        f"{runtime_task_callable_param_contract_count} installed SDK TaskContext callable parameter parity contracts, "
        f"{runtime_task_callable_return_contract_count} installed SDK TaskContext callable return parity contracts, "
        f"{runtime_task_reply_callable_contract_count} installed SDK TaskContext reply callable contracts, "
        f"{runtime_task_sdk_helper_callable_contract_count} installed SDK TaskContext SDK helper callable contracts, "
        f"{runtime_type_symbol_contract_count} installed SDK type symbol parity contracts, "
        f"{runtime_interface_field_contract_count} installed SDK interface field parity contracts, "
        f"{runtime_interface_required_contract_count} installed SDK interface requiredness parity contracts, "
        f"{runtime_interface_shape_contract_count} installed SDK interface shape parity contracts, "
        f"{runtime_task_context_nested_field_contract_count} installed SDK nested TaskContext field parity contracts, "
        f"{runtime_task_context_nested_required_contract_count} installed SDK nested TaskContext requiredness parity contracts, "
        f"{runtime_task_context_nested_shape_contract_count} installed SDK nested TaskContext shape parity contracts, "
        f"{runtime_type_alias_contract_count} installed SDK type alias parity contracts, "
        f"{runtime_public_type_contract_count} installed SDK public type parity contracts, "
        f"{runtime_public_value_contract_count} installed SDK public value parity contracts, "
        f"{runtime_action_protocol_contract_count} installed SDK action protocol parity contract, "
        f"{python_named_arg_contract_count} Python named argument contracts, "
        f"{python_task_named_arg_contract_count} Python task named argument contracts, "
        f"{python_required_arg_count_contract_count} Python required argument count contracts, "
        f"{python_task_required_arg_count_contract_count} Python task required argument count contracts, "
        f"{python_max_arg_count_contract_count} Python max argument count contracts, "
        f"{python_task_max_arg_count_contract_count} Python task max argument count contracts, "
        f"{hermes_agent_schema_arg_bound_contract_count} Hermes positional argument bound contracts, "
        f"{hermes_task_schema_arg_bound_contract_count} Hermes task positional argument bound contracts, "
        f"{sidecar_required_arg_count_contract_count} sidecar required argument count contracts, "
        f"{sidecar_task_required_arg_count_contract_count} sidecar task required argument count contracts, "
        f"{sidecar_max_arg_count_contract_count} sidecar max argument count contracts, "
        f"{sidecar_task_max_arg_count_contract_count} sidecar task max argument count contracts, "
        f"{sidecar_agent_arg_type_contract_count} sidecar agent argument type contracts, "
        f"{sidecar_task_arg_type_contract_count} sidecar task argument type contracts, "
        f"{sidecar_agent_arg_name_contract_count} sidecar agent argument name contracts, "
        f"{sidecar_task_arg_name_contract_count} sidecar task argument name contracts, "
        f"{sidecar_agent_arg_schema_contract_count} sidecar agent argument schema contracts, "
        f"{sidecar_task_arg_schema_contract_count} sidecar task argument schema contracts, "
        f"{python_direct_arg_type_validation_contract_count} Python direct argument type validation contracts, "
        f"{python_positional_arg_type_validation_contract_count} Python positional argument type validation contracts, "
        f"{python_direct_helper_validation_contract_count} Python direct helper validation contracts, "
        f"{python_method_description_contract_count} Python method description contracts, "
        f"{manifest_tool_exposure_contract_count} manifest tool exposure contracts, "
        f"{manifest_tool_order_contract_count} manifest tool order contracts, "
        f"{manifest_env_contract_count} manifest env contracts, "
        f"{manifest_concurrency_default_contract_count} manifest concurrency default contract, "
        f"{readme_manifest_tool_contract_count} README manifest tool contracts, "
        f"{readme_env_contract_count} README env contracts, "
        f"{runtime_env_contract_count} runtime env contracts, "
        f"{yaml_special_key_contract_count} YAML special-key contracts, "
        f"{readme_yaml_contract_count} README YAML contracts, "
        f"{sdk_package_version_contract_count} SDK package version contract, "
        f"{sdk_package_metadata_contract_count} SDK package metadata contracts, "
        f"{adapter_sdk_metadata_key_contract_count} adapter SDK metadata key contracts, "
        f"{adapter_sdk_package_file_contract_count} adapter SDK package file contracts, "
        f"{adapter_sdk_package_name_contract_count} adapter SDK package name contract, "
        f"{adapter_sdk_package_type_contract_count} adapter SDK package type contract, "
        f"{adapter_sdk_package_exports_contract_count} adapter SDK package exports contract, "
        f"{sdk_dist_file_contract_count} SDK dist file parity contracts, "
        f"{clean_required_plugin_file_contract_count} clean install required plugin file contracts, "
        f"{user_required_plugin_file_contract_count} user install required plugin file contracts, "
        f"{clean_sdk_package_file_contract_count} clean install SDK package file contracts, "
        f"{user_sdk_package_file_contract_count} user install SDK package file contracts, "
        f"{clean_sdk_metadata_key_contract_count} clean install SDK metadata key contracts, "
        f"{user_sdk_metadata_key_contract_count} user install SDK metadata key contracts, "
        f"{sdk_method_exposure_contract_count} SDK method exposure contracts, "
        f"{sidecar_method_order_contract_count} sidecar method order contracts, "
        f"{python_method_order_contract_count} Python method order contracts, "
        f"{local_lifecycle_method_contract_count} local lifecycle method contracts, "
        f"{local_lifecycle_documentation_contract_count} local lifecycle documentation contract, "
        f"{sdk_readme_bridge_contract_count} SDK README bridge contracts, "
        f"{task_helper_exposure_contract_count} task helper exposure contracts, "
        f"{sidecar_task_helper_order_contract_count} sidecar task helper order contracts, "
        f"{python_task_helper_order_contract_count} Python task helper order contracts, "
        f"{task_context_field_contract_count} TaskContext field contracts, "
        f"{task_context_field_shape_contract_count} TaskContext field shape contracts, "
        f"{installed_method_contract_count} installed SDK method contracts, "
        f"{installed_task_helper_contract_count} installed SDK task helper contracts, "
        f"{installed_task_context_field_contract_count} installed SDK TaskContext field contracts, "
        f"{installed_agent_skill_field_contract_count} installed SDK AgentSkill field contracts, "
        f"{sidecar_agent_skill_field_contract_count} sidecar AgentSkill field contracts, "
        f"{sidecar_agent_skill_required_contract_count} sidecar AgentSkill requiredness contract, "
        f"{sidecar_agent_skill_shape_contract_count} sidecar AgentSkill shape contract, "
        f"{installed_option_field_contract_count} installed SDK option field contracts, "
        f"{sidecar_option_field_contract_count} sidecar option field contracts, "
        f"{sdk_option_connection_auth_contract_count} SDK connection/auth option contracts, "
        f"{sdk_option_skill_contract_count} SDK skill option contract, "
        f"{sdk_option_timing_contract_count} SDK timing option contracts, "
        f"{sdk_option_scheduler_contract_count} SDK scheduler option contracts, "
        f"{sidecar_option_connection_auth_contract_count} sidecar connection/auth option contracts, "
        f"{sidecar_option_skill_contract_count} sidecar skill option contract, "
        f"{sidecar_option_timing_contract_count} sidecar timing option contracts, "
        f"{sidecar_option_scheduler_contract_count} sidecar scheduler option contracts, "
        f"{installed_option_connection_auth_contract_count} installed SDK connection/auth option contracts, "
        f"{installed_option_skill_contract_count} installed SDK skill option contract, "
        f"{installed_option_timing_contract_count} installed SDK timing option contracts, "
        f"{installed_option_scheduler_contract_count} installed SDK scheduler option contracts, "
        f"{sidecar_option_required_contract_count} sidecar option requiredness contract, "
        f"{sidecar_option_shape_contract_count} sidecar option shape contract, "
        f"{control_env_surface_contract_count} control env surface contracts, "
        f"{installed_agent_event_contract_count} installed SDK AgentEvent contracts, "
        f"{sdk_agent_connection_event_contract_count} SDK AgentEvent connection contracts, "
        f"{sdk_agent_error_auth_event_contract_count} SDK AgentEvent error/auth contracts, "
        f"{sdk_agent_token_event_contract_count} SDK AgentEvent token contract, "
        f"{sidecar_agent_connection_event_contract_count} sidecar AgentEvent connection contracts, "
        f"{sidecar_agent_error_auth_event_contract_count} sidecar AgentEvent error/auth contracts, "
        f"{sidecar_agent_token_event_contract_count} sidecar AgentEvent token contract, "
        f"{installed_agent_connection_event_contract_count} installed SDK AgentEvent connection contracts, "
        f"{installed_agent_error_auth_event_contract_count} installed SDK AgentEvent error/auth contracts, "
        f"{installed_agent_token_event_contract_count} installed SDK AgentEvent token contract, "
        f"{installed_task_update_status_contract_count} installed SDK TaskUpdateData status contracts, "
        f"{sdk_task_update_start_status_contract_count} SDK TaskUpdateData start status contract, "
        f"{sdk_task_update_completion_status_contract_count} SDK TaskUpdateData completion status contract, "
        f"{installed_task_update_start_status_contract_count} installed SDK TaskUpdateData start status contract, "
        f"{installed_task_update_completion_status_contract_count} installed SDK TaskUpdateData completion status contract, "
        f"{installed_task_update_variant_contract_count} installed SDK TaskUpdateData variant contracts, "
        f"{installed_action_result_status_contract_count} installed SDK ActionCallResult status contracts, "
        f"{action_result_terminal_status_contract_count} ActionCallResult terminal status contracts, "
        f"{action_result_transient_coverage_contract_count} ActionCallResult transient coverage contracts, "
        f"{action_result_terminal_coverage_contract_count} ActionCallResult terminal coverage contracts, "
        f"{installed_action_result_terminal_status_contract_count} installed SDK ActionCallResult terminal status contracts, "
        f"{installed_action_result_transient_status_contract_count} installed SDK ActionCallResult transient status contracts, "
        f"{sdk_action_result_identity_contract_count} SDK ActionCallResult identity contracts, "
        f"{sdk_action_result_payload_contract_count} SDK ActionCallResult payload contracts, "
        f"{sdk_action_result_trace_contract_count} SDK ActionCallResult trace contracts, "
        f"{sdk_action_result_execution_contract_count} SDK ActionCallResult execution contract, "
        f"{installed_action_result_identity_contract_count} installed SDK ActionCallResult identity contracts, "
        f"{installed_action_result_payload_contract_count} installed SDK ActionCallResult payload contracts, "
        f"{installed_action_result_trace_contract_count} installed SDK ActionCallResult trace contracts, "
        f"{installed_action_result_execution_contract_count} installed SDK ActionCallResult execution contract, "
        f"{sdk_memory_origin_literal_contract_count} SDK MemoryOrigin literal contracts, "
        f"{sdk_memory_origin_template_contract_count} SDK MemoryOrigin template contract, "
        f"{installed_memory_origin_literal_contract_count} installed SDK MemoryOrigin literal contracts, "
        f"{installed_memory_origin_template_contract_count} installed SDK MemoryOrigin template contract, "
        f"{sdk_onboarding_seed_kind_contract_count} SDK OnboardingSeed kind contract, "
        f"{installed_onboarding_seed_kind_contract_count} installed SDK OnboardingSeed kind contract, "
        f"{sdk_onboarding_seed_identity_contract_count} SDK OnboardingSeed identity contracts, "
        f"{sdk_onboarding_seed_action_contract_count} SDK OnboardingSeed action contract, "
        f"{sdk_onboarding_seed_content_contract_count} SDK OnboardingSeed content contract, "
        f"{installed_onboarding_seed_identity_contract_count} installed SDK OnboardingSeed identity contracts, "
        f"{installed_onboarding_seed_action_contract_count} installed SDK OnboardingSeed action contract, "
        f"{installed_onboarding_seed_content_contract_count} installed SDK OnboardingSeed content contract, "
        f"{sdk_token_claimed_field_contract_count} SDK TokenClaimedData field contracts, "
        f"{installed_token_claimed_field_contract_count} installed SDK TokenClaimedData field contracts, "
        f"{token_claimed_required_field_contract_count} TokenClaimedData required-field contracts, "
        f"{sidecar_token_claimed_nullable_agent_contract_count} TokenClaimedData nullable agent contract, "
        f"{sdk_action_option_correlation_contract_count} SDK ActionCallOptions correlation contracts, "
        f"{sdk_action_option_attribution_contract_count} SDK ActionCallOptions attribution contracts, "
        f"{sdk_action_option_context_contract_count} SDK ActionCallOptions context contracts, "
        f"{sdk_action_option_execution_contract_count} SDK ActionCallOptions execution contracts, "
        f"{installed_action_option_correlation_contract_count} installed SDK ActionCallOptions correlation contracts, "
        f"{installed_action_option_attribution_contract_count} installed SDK ActionCallOptions attribution contracts, "
        f"{installed_action_option_context_contract_count} installed SDK ActionCallOptions context contracts, "
        f"{installed_action_option_execution_contract_count} installed SDK ActionCallOptions execution contracts, "
        f"{sdk_tool_report_identity_contract_count} SDK ToolCallReport identity contracts, "
        f"{sdk_tool_report_tool_contract_count} SDK ToolCallReport tool contracts, "
        f"{sdk_tool_report_outcome_contract_count} SDK ToolCallReport outcome contracts, "
        f"{installed_tool_report_identity_contract_count} installed SDK ToolCallReport identity contracts, "
        f"{installed_tool_report_tool_contract_count} installed SDK ToolCallReport tool contracts, "
        f"{installed_tool_report_outcome_contract_count} installed SDK ToolCallReport outcome contracts, "
        f"{sdk_action_error_identity_contract_count} SDK ActionErrorBody identity contracts, "
        f"{sdk_action_error_detail_contract_count} SDK ActionErrorBody detail contract, "
        f"{installed_action_error_identity_contract_count} installed SDK ActionErrorBody identity contracts, "
        f"{installed_action_error_detail_contract_count} installed SDK ActionErrorBody detail contract, "
        f"{sdk_action_confirmation_identity_contract_count} SDK ActionConfirmationPayload identity contract, "
        f"{sdk_action_confirmation_content_contract_count} SDK ActionConfirmationPayload content contracts, "
        f"{sdk_action_confirmation_timing_contract_count} SDK ActionConfirmationPayload timing contract, "
        f"{installed_action_confirmation_identity_contract_count} installed SDK ActionConfirmationPayload identity contract, "
        f"{installed_action_confirmation_content_contract_count} installed SDK ActionConfirmationPayload content contracts, "
        f"{installed_action_confirmation_timing_contract_count} installed SDK ActionConfirmationPayload timing contract, "
        f"{sdk_task_attachment_identity_contract_count} SDK TaskAttachment identity contract, "
        f"{sdk_task_attachment_name_type_contract_count} SDK TaskAttachment name/type contracts, "
        f"{sdk_task_attachment_size_contract_count} SDK TaskAttachment size contract, "
        f"{sdk_task_attachment_url_contract_count} SDK TaskAttachment URL contract, "
        f"{installed_task_attachment_identity_contract_count} installed SDK TaskAttachment identity contract, "
        f"{installed_task_attachment_name_type_contract_count} installed SDK TaskAttachment name/type contracts, "
        f"{installed_task_attachment_size_contract_count} installed SDK TaskAttachment size contract, "
        f"{installed_task_attachment_url_contract_count} installed SDK TaskAttachment URL contract, "
        f"{sdk_upload_result_name_type_contract_count} SDK UploadResult name/type contracts, "
        f"{sdk_upload_result_size_contract_count} SDK UploadResult size contract, "
        f"{sdk_upload_result_url_contract_count} SDK UploadResult URL contract, "
        f"{installed_upload_result_name_type_contract_count} installed SDK UploadResult name/type contracts, "
        f"{installed_upload_result_size_contract_count} installed SDK UploadResult size contract, "
        f"{installed_upload_result_url_contract_count} installed SDK UploadResult URL contract, "
        f"{sdk_history_message_identity_contract_count} SDK HistoryMessage identity contracts, "
        f"{sdk_history_message_content_status_contract_count} SDK HistoryMessage content/status contracts, "
        f"{sdk_history_message_sender_contract_count} SDK HistoryMessage sender contracts, "
        f"{sdk_history_message_thread_contract_count} SDK HistoryMessage thread contracts, "
        f"{sdk_history_message_timestamp_contract_count} SDK HistoryMessage timestamp contracts, "
        f"{sdk_history_message_attachment_contract_count} SDK HistoryMessage attachment contract, "
        f"{installed_history_message_identity_contract_count} installed SDK HistoryMessage identity contracts, "
        f"{installed_history_message_content_status_contract_count} installed SDK HistoryMessage content/status contracts, "
        f"{installed_history_message_sender_contract_count} installed SDK HistoryMessage sender contracts, "
        f"{installed_history_message_thread_contract_count} installed SDK HistoryMessage thread contracts, "
        f"{installed_history_message_timestamp_contract_count} installed SDK HistoryMessage timestamp contracts, "
        f"{installed_history_message_attachment_contract_count} installed SDK HistoryMessage attachment contract, "
        f"{sdk_fetch_history_option_cursor_contract_count} SDK FetchHistoryOptions cursor contracts, "
        f"{sdk_fetch_history_option_pagination_contract_count} SDK FetchHistoryOptions pagination contract, "
        f"{installed_fetch_history_option_cursor_contract_count} installed SDK FetchHistoryOptions cursor contracts, "
        f"{installed_fetch_history_option_pagination_contract_count} installed SDK FetchHistoryOptions pagination contract, "
        f"{sdk_fetch_history_result_collection_contract_count} SDK FetchHistoryResult collection contract, "
        f"{sdk_fetch_history_result_pagination_contract_count} SDK FetchHistoryResult pagination contracts, "
        f"{installed_fetch_history_result_collection_contract_count} installed SDK FetchHistoryResult collection contract, "
        f"{installed_fetch_history_result_pagination_contract_count} installed SDK FetchHistoryResult pagination contracts, "
        f"{sdk_note_identity_contract_count} SDK Note identity contracts, "
        f"{sdk_note_creator_contract_count} SDK Note creator contracts, "
        f"{sdk_note_agent_attribution_contract_count} SDK Note agent attribution contracts, "
        f"{sdk_note_content_contract_count} SDK Note content contracts, "
        f"{sdk_note_tag_contract_count} SDK Note tag contract, "
        f"{sdk_note_timestamp_contract_count} SDK Note timestamp contracts, "
        f"{installed_note_identity_contract_count} installed SDK Note identity contracts, "
        f"{installed_note_creator_contract_count} installed SDK Note creator contracts, "
        f"{installed_note_agent_attribution_contract_count} installed SDK Note agent attribution contracts, "
        f"{installed_note_content_contract_count} installed SDK Note content contracts, "
        f"{installed_note_tag_contract_count} installed SDK Note tag contract, "
        f"{installed_note_timestamp_contract_count} installed SDK Note timestamp contracts, "
        f"{sdk_list_notes_option_pagination_contract_count} SDK ListNotesOptions pagination contracts, "
        f"{sdk_list_notes_option_filter_contract_count} SDK ListNotesOptions filter contract, "
        f"{sdk_list_notes_option_archive_contract_count} SDK ListNotesOptions archive contract, "
        f"{installed_list_notes_option_pagination_contract_count} installed SDK ListNotesOptions pagination contracts, "
        f"{installed_list_notes_option_filter_contract_count} installed SDK ListNotesOptions filter contract, "
        f"{installed_list_notes_option_archive_contract_count} installed SDK ListNotesOptions archive contract, "
        f"{sdk_list_notes_result_collection_contract_count} SDK ListNotesResult collection contract, "
        f"{sdk_list_notes_result_pagination_contract_count} SDK ListNotesResult pagination contracts, "
        f"{installed_list_notes_result_collection_contract_count} installed SDK ListNotesResult collection contract, "
        f"{installed_list_notes_result_pagination_contract_count} installed SDK ListNotesResult pagination contracts, "
        f"{sdk_create_note_body_content_contract_count} SDK CreateNoteBody content contracts, "
        f"{sdk_create_note_body_tag_contract_count} SDK CreateNoteBody tag contract, "
        f"{sdk_create_note_body_notebook_contract_count} SDK CreateNoteBody notebook contract, "
        f"{installed_create_note_body_content_contract_count} installed SDK CreateNoteBody content contracts, "
        f"{installed_create_note_body_tag_contract_count} installed SDK CreateNoteBody tag contract, "
        f"{installed_create_note_body_notebook_contract_count} installed SDK CreateNoteBody notebook contract, "
        f"{sdk_update_note_body_content_contract_count} SDK UpdateNoteBody content contracts, "
        f"{sdk_update_note_body_tag_contract_count} SDK UpdateNoteBody tag contract, "
        f"{installed_update_note_body_content_contract_count} installed SDK UpdateNoteBody content contracts, "
        f"{installed_update_note_body_tag_contract_count} installed SDK UpdateNoteBody tag contract, "
        f"{sdk_query_memory_option_query_contract_count} SDK QueryMemoryOptions query contract, "
        f"{sdk_query_memory_option_pagination_contract_count} SDK QueryMemoryOptions pagination contract, "
        f"{installed_query_memory_option_query_contract_count} installed SDK QueryMemoryOptions query contract, "
        f"{installed_query_memory_option_pagination_contract_count} installed SDK QueryMemoryOptions pagination contract, "
        f"{sdk_memory_entry_content_contract_count} SDK MemoryEntry content contract, "
        f"{sdk_memory_entry_classification_contract_count} SDK MemoryEntry classification contracts, "
        f"{sdk_memory_entry_scoring_contract_count} SDK MemoryEntry scoring contract, "
        f"{installed_memory_entry_content_contract_count} installed SDK MemoryEntry content contract, "
        f"{installed_memory_entry_classification_contract_count} installed SDK MemoryEntry classification contracts, "
        f"{installed_memory_entry_scoring_contract_count} installed SDK MemoryEntry scoring contract, "
        f"{sdk_share_note_result_identity_contract_count} SDK ShareNoteResult identity contracts, "
        f"{sdk_share_note_result_display_contract_count} SDK ShareNoteResult display contracts, "
        f"{sdk_share_note_result_tag_contract_count} SDK ShareNoteResult tag contract, "
        f"{installed_share_note_result_identity_contract_count} installed SDK ShareNoteResult identity contracts, "
        f"{installed_share_note_result_display_contract_count} installed SDK ShareNoteResult display contracts, "
        f"{installed_share_note_result_tag_contract_count} installed SDK ShareNoteResult tag contract, "
        f"{sdk_skill_prompt_content_contract_count} SDK SkillPrompt content contract, "
        f"{sdk_skill_prompt_template_contract_count} SDK SkillPrompt template contract, "
        f"{sdk_skill_prompt_parameter_contract_count} SDK SkillPrompt parameter contract, "
        f"{installed_skill_prompt_content_contract_count} installed SDK SkillPrompt content contract, "
        f"{installed_skill_prompt_template_contract_count} installed SDK SkillPrompt template contract, "
        f"{installed_skill_prompt_parameter_contract_count} installed SDK SkillPrompt parameter contract, "
        f"{sdk_kanban_board_identity_contract_count} SDK KanbanBoard identity contract, "
        f"{sdk_kanban_board_display_contract_count} SDK KanbanBoard display contract, "
        f"{sdk_kanban_board_timestamp_contract_count} SDK KanbanBoard timestamp contract, "
        f"{installed_kanban_board_identity_contract_count} installed SDK KanbanBoard identity contract, "
        f"{installed_kanban_board_display_contract_count} installed SDK KanbanBoard display contract, "
        f"{installed_kanban_board_timestamp_contract_count} installed SDK KanbanBoard timestamp contract, "
        f"{sdk_kanban_column_identity_contract_count} SDK KanbanColumn identity contract, "
        f"{sdk_kanban_column_parent_contract_count} SDK KanbanColumn parent contract, "
        f"{sdk_kanban_column_display_contract_count} SDK KanbanColumn display contract, "
        f"{sdk_kanban_column_ordering_contract_count} SDK KanbanColumn ordering contract, "
        f"{installed_kanban_column_identity_contract_count} installed SDK KanbanColumn identity contract, "
        f"{installed_kanban_column_parent_contract_count} installed SDK KanbanColumn parent contract, "
        f"{installed_kanban_column_display_contract_count} installed SDK KanbanColumn display contract, "
        f"{installed_kanban_column_ordering_contract_count} installed SDK KanbanColumn ordering contract, "
        f"{sdk_kanban_card_identity_contract_count} SDK KanbanCard identity contract, "
        f"{sdk_kanban_card_placement_contract_count} SDK KanbanCard placement contracts, "
        f"{sdk_kanban_card_content_contract_count} SDK KanbanCard content contracts, "
        f"{sdk_kanban_card_scheduling_contract_count} SDK KanbanCard scheduling contracts, "
        f"{sdk_kanban_card_creator_contract_count} SDK KanbanCard creator contract, "
        f"{sdk_kanban_card_timestamp_contract_count} SDK KanbanCard timestamp contracts, "
        f"{sdk_kanban_card_archive_contract_count} SDK KanbanCard archive contract, "
        f"{installed_kanban_card_identity_contract_count} installed SDK KanbanCard identity contract, "
        f"{installed_kanban_card_placement_contract_count} installed SDK KanbanCard placement contracts, "
        f"{installed_kanban_card_content_contract_count} installed SDK KanbanCard content contracts, "
        f"{installed_kanban_card_scheduling_contract_count} installed SDK KanbanCard scheduling contracts, "
        f"{installed_kanban_card_creator_contract_count} installed SDK KanbanCard creator contract, "
        f"{installed_kanban_card_timestamp_contract_count} installed SDK KanbanCard timestamp contracts, "
        f"{installed_kanban_card_archive_contract_count} installed SDK KanbanCard archive contract, "
        f"{sdk_list_boards_result_board_contract_count} SDK ListBoardsResult board contract, "
        f"{sdk_list_boards_result_column_contract_count} SDK ListBoardsResult column contract, "
        f"{sdk_list_boards_result_card_contract_count} SDK ListBoardsResult card contract, "
        f"{installed_list_boards_result_board_contract_count} installed SDK ListBoardsResult board contract, "
        f"{installed_list_boards_result_column_contract_count} installed SDK ListBoardsResult column contract, "
        f"{installed_list_boards_result_card_contract_count} installed SDK ListBoardsResult card contract, "
        f"{sdk_kanban_label_identity_contract_count} SDK KanbanLabel identity contract, "
        f"{sdk_kanban_label_parent_contract_count} SDK KanbanLabel parent contract, "
        f"{sdk_kanban_label_display_contract_count} SDK KanbanLabel display contract, "
        f"{sdk_kanban_label_color_contract_count} SDK KanbanLabel color contract, "
        f"{installed_kanban_label_identity_contract_count} installed SDK KanbanLabel identity contract, "
        f"{installed_kanban_label_parent_contract_count} installed SDK KanbanLabel parent contract, "
        f"{installed_kanban_label_display_contract_count} installed SDK KanbanLabel display contract, "
        f"{installed_kanban_label_color_contract_count} installed SDK KanbanLabel color contract, "
        f"{sdk_create_board_body_display_contract_count} SDK CreateBoardBody display contract, "
        f"{sdk_create_board_body_column_contract_count} SDK CreateBoardBody column contract, "
        f"{installed_create_board_body_display_contract_count} installed SDK CreateBoardBody display contract, "
        f"{installed_create_board_body_column_contract_count} installed SDK CreateBoardBody column contract, "
        f"{sdk_update_board_body_display_contract_count} SDK UpdateBoardBody display contract, "
        f"{installed_update_board_body_display_contract_count} installed SDK UpdateBoardBody display contract, "
        f"{sdk_create_card_body_content_contract_count} SDK CreateCardBody content contracts, "
        f"{sdk_create_card_body_placement_contract_count} SDK CreateCardBody placement contracts, "
        f"{installed_create_card_body_content_contract_count} installed SDK CreateCardBody content contracts, "
        f"{installed_create_card_body_placement_contract_count} installed SDK CreateCardBody placement contracts, "
        f"{sdk_update_card_body_content_contract_count} SDK UpdateCardBody content contracts, "
        f"{sdk_update_card_body_placement_contract_count} SDK UpdateCardBody placement contract, "
        f"{sdk_update_card_body_ordering_contract_count} SDK UpdateCardBody ordering contract, "
        f"{installed_update_card_body_content_contract_count} installed SDK UpdateCardBody content contracts, "
        f"{installed_update_card_body_placement_contract_count} installed SDK UpdateCardBody placement contract, "
        f"{installed_update_card_body_ordering_contract_count} installed SDK UpdateCardBody ordering contract, "
        f"{sdk_create_column_body_display_contract_count} SDK CreateColumnBody display contract, "
        f"{sdk_create_column_body_ordering_contract_count} SDK CreateColumnBody ordering contract, "
        f"{installed_create_column_body_display_contract_count} installed SDK CreateColumnBody display contract, "
        f"{installed_create_column_body_ordering_contract_count} installed SDK CreateColumnBody ordering contract, "
        f"{sdk_update_column_body_display_contract_count} SDK UpdateColumnBody display contract, "
        f"{sdk_update_column_body_ordering_contract_count} SDK UpdateColumnBody ordering contract, "
        f"{installed_update_column_body_display_contract_count} installed SDK UpdateColumnBody display contract, "
        f"{installed_update_column_body_ordering_contract_count} installed SDK UpdateColumnBody ordering contract, "
        f"{sdk_add_commit_body_commit_contract_count} SDK AddCommitBody commit contract, "
        f"{sdk_add_commit_body_content_contract_count} SDK AddCommitBody content contract, "
        f"{installed_add_commit_body_commit_contract_count} installed SDK AddCommitBody commit contract, "
        f"{installed_add_commit_body_content_contract_count} installed SDK AddCommitBody content contract, "
        f"{sdk_create_label_body_display_contract_count} SDK CreateLabelBody display contract, "
        f"{sdk_create_label_body_color_contract_count} SDK CreateLabelBody color contract, "
        f"{installed_create_label_body_display_contract_count} installed SDK CreateLabelBody display contract, "
        f"{installed_create_label_body_color_contract_count} installed SDK CreateLabelBody color contract, "
        f"{sdk_update_label_body_display_contract_count} SDK UpdateLabelBody display contract, "
        f"{sdk_update_label_body_color_contract_count} SDK UpdateLabelBody color contract, "
        f"{installed_update_label_body_display_contract_count} installed SDK UpdateLabelBody display contract, "
        f"{installed_update_label_body_color_contract_count} installed SDK UpdateLabelBody color contract, "
        f"{sdk_card_commit_identity_contract_count} SDK CardCommit identity contracts, "
        f"{sdk_card_commit_content_contract_count} SDK CardCommit content contract, "
        f"{sdk_card_commit_timestamp_contract_count} SDK CardCommit timestamp contract, "
        f"{installed_card_commit_identity_contract_count} installed SDK CardCommit identity contracts, "
        f"{installed_card_commit_content_contract_count} installed SDK CardCommit content contract, "
        f"{installed_card_commit_timestamp_contract_count} installed SDK CardCommit timestamp contract, "
        f"{sdk_card_note_identity_contract_count} SDK CardNote identity contract, "
        f"{sdk_card_note_display_contract_count} SDK CardNote display contract, "
        f"{sdk_card_note_tag_contract_count} SDK CardNote tag contract, "
        f"{sdk_card_note_timestamp_contract_count} SDK CardNote timestamp contract, "
        f"{installed_card_note_identity_contract_count} installed SDK CardNote identity contract, "
        f"{installed_card_note_display_contract_count} installed SDK CardNote display contract, "
        f"{installed_card_note_tag_contract_count} installed SDK CardNote tag contract, "
        f"{installed_card_note_timestamp_contract_count} installed SDK CardNote timestamp contract, "
        f"{sdk_archived_cards_result_collection_contract_count} SDK ArchivedCardsResult collection contract, "
        f"{sdk_archived_cards_result_pagination_contract_count} SDK ArchivedCardsResult pagination contracts, "
        f"{installed_archived_cards_result_collection_contract_count} installed SDK ArchivedCardsResult collection contract, "
        f"{installed_archived_cards_result_pagination_contract_count} installed SDK ArchivedCardsResult pagination contracts, "
        f"{sdk_runtime_info_identity_contract_count} SDK AgentRuntimeInfo identity contracts, "
        f"{sdk_runtime_info_environment_contract_count} SDK AgentRuntimeInfo environment contracts, "
        f"{installed_runtime_info_identity_contract_count} installed SDK AgentRuntimeInfo identity contracts, "
        f"{installed_runtime_info_environment_contract_count} installed SDK AgentRuntimeInfo environment contracts, "
        f"{adapter_task_update_status_contract_count} adapter TaskUpdateData status contracts, "
        f"{adapter_task_update_start_status_contract_count} adapter TaskUpdateData start status contract, "
        f"{adapter_task_update_completion_status_contract_count} adapter TaskUpdateData completion status contract, "
        f"{sidecar_agent_event_contract_count} sidecar AgentEvent contracts, "
        f"{sdk_client_test_inventory_contract_count} SDK client test inventory contracts, "
        f"{sdk_client_test_uniqueness_contract_count} SDK client test uniqueness contracts, "
        f"{sdk_client_http_validation_test_contract_count} SDK client HTTP validation test contracts, "
        f"{sdk_client_task_scheduling_test_contract_count} SDK client task scheduling test contracts, "
        f"{sdk_client_reconnect_buffer_test_contract_count} SDK client reconnect buffer test contracts, "
        f"{sdk_client_task_action_test_contract_count} SDK client task action test contracts, "
        f"{sdk_client_no_conversation_test_contract_count} SDK client no-conversation test contracts, "
        f"{sdk_client_auth_retry_test_contract_count} SDK client auth retry test contracts, "
        f"{sdk_client_onboarding_test_contract_count} SDK client onboarding test contracts, "
        f"{sdk_types_test_inventory_contract_count} SDK types test inventory contracts, "
        f"{sdk_types_test_uniqueness_contract_count} SDK types test uniqueness contracts, "
        f"{sdk_types_action_context_test_contract_count} SDK types action context test contracts, "
        f"{sdk_types_action_result_test_contract_count} SDK types ActionCallResult test contracts, "
        f"{sdk_types_upload_attachment_test_contract_count} SDK types upload attachment test contracts, "
        f"{sdk_types_task_context_helper_test_contract_count} SDK types TaskContext helper test contracts, "
        f"{sdk_readme_method_inventory_contract_count} SDK README method inventory contracts, "
        f"{sdk_readme_method_uniqueness_contract_count} SDK README method uniqueness contracts, "
        f"{sdk_readme_lifecycle_method_contract_count} SDK README lifecycle method contracts, "
        f"{sdk_readme_message_file_method_contract_count} SDK README message/file method contracts, "
        f"{sdk_readme_note_method_contract_count} SDK README note method contracts, "
        f"{sdk_readme_kanban_method_contract_count} SDK README kanban method contracts, "
        f"{sdk_readme_memory_method_contract_count} SDK README memory method contracts, "
        f"{sdk_readme_type_inventory_contract_count} SDK README type inventory contracts, "
        f"{sdk_readme_type_uniqueness_contract_count} SDK README type uniqueness contracts, "
        f"{sdk_readme_kanban_type_contract_count} SDK README kanban type contracts, "
        f"{sdk_readme_note_memory_type_contract_count} SDK README note and memory type contracts, "
        f"{sdk_readme_option_inventory_contract_count} SDK README option inventory contracts, "
        f"{sdk_readme_option_uniqueness_contract_count} SDK README option uniqueness contracts, "
        f"{sdk_readme_auth_option_contract_count} SDK README auth option contracts, "
        f"{sdk_readme_timing_option_contract_count} SDK README timing option contracts, "
        f"{sdk_readme_task_context_inventory_contract_count} SDK README TaskContext inventory contracts, "
        f"{sdk_readme_task_context_uniqueness_contract_count} SDK README TaskContext uniqueness contracts, "
        f"{sdk_readme_task_context_field_contract_count} SDK README TaskContext field contracts, "
        f"{sdk_readme_task_context_reply_contract_count} SDK README TaskContext reply helper contracts, "
        f"{live_validator_field_set_contract_count} live validator field-set contracts, "
        f"{live_validator_status_set_contract_count} live validator status-set contracts, "
        f"{live_validator_field_usage_contract_count} live validator field usage contracts, "
        f"{live_validator_shape_contract_count} live validator shape contracts, "
        f"{live_validator_kanban_contract_count} live validator kanban contracts, "
        f"{live_validator_note_memory_contract_count} live validator note and memory contracts, "
        f"{live_validator_file_history_contract_count} live validator file and history contracts, "
        f"{live_validator_input_contract_count} live validator input contracts, "
        f"{live_validator_action_contract_count} live validator action contracts, "
        f"{len(sdk_test_names)} reviewed client tests, "
        f"{len(sdk_types_test_names)} reviewed type tests, "
        f"{len(sdk_readme_method_headings)} reviewed SDK README methods, "
        f"{len(sdk_readme_type_symbols)} reviewed SDK README types, "
        f"{len(sdk_readme_option_names)} reviewed SDK README options, "
        f"{len(sdk_readme_task_context_items)} reviewed SDK README task context items, "
        f"SDK {installed_version})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
