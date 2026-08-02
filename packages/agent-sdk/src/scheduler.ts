export function taskConversationKey(data: Record<string, unknown>): string {
  return typeof data.conversationId === "string" && data.conversationId
    ? data.conversationId
    : "__no_conversation__";
}

export function validateTaskFrame(data: Record<string, unknown>): string | null {
  if (typeof data.taskId !== "string" || !data.taskId) return "missing_task_id";
  if (
    data.content === undefined &&
    data.taskKind !== "cron_wakeup" &&
    data.taskKind !== "trigger"
  ) {
    return "missing_content";
  }
  if (data.content !== undefined && typeof data.content !== "string") {
    return "invalid_content";
  }
  return null;
}
