import type { Command } from "commander";
import { resolveClient } from "../client.js";
import { printResult } from "../output.js";

export function registerUserCommands(program: Command): void {
  const user = program.command("user").description("Current user resources");

  user.command("profile").description("Show the current user profile").action(async () => {
    printResult(await resolveClient(user).get("/api/v1/user/profile"));
  });

  user.command("agents").description("List agents owned by the current user").action(async () => {
    printResult(await resolveClient(user).get("/api/v1/user/agents"));
  });
}
