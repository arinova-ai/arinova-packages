import type { Command } from "commander";
import { registerActionCommands } from "./automation/action.js";
import { registerAutopilotCommands } from "./automation/autopilot.js";
import { registerCronCommands } from "./automation/cron.js";
import { registerDeliveryCommands } from "./automation/delivery.js";
import { registerTriggerCommands } from "./automation/trigger.js";
import { registerWebhookCommands } from "./automation/webhook.js";
import { registerWorkflowCommands } from "./automation/workflow.js";

export function registerAutomationCommands(program: Command): void {
  registerActionCommands(program);
  registerWorkflowCommands(program);
  registerCronCommands(program);
  registerTriggerCommands(program);
  registerWebhookCommands(program);
  registerDeliveryCommands(program);
  registerAutopilotCommands(program);
}
