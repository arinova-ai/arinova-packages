import type { Command } from "commander";
import { apiCall, getOpts, output } from "../api.js";

export function registerUserCommands(program: Command): void {
  const user = program.command("user").description("Current user resources");

  user.command("profile").description("Show the current user profile").action(async () => {
    const { token, apiUrl } = getOpts(user);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/user/profile`, token }));
  });

  user.command("agents").description("List agents owned by the current user").action(async () => {
    const { token, apiUrl } = getOpts(user);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/v1/user/agents`, token }));
  });
}
