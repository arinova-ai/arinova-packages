import { Command } from "commander";
import { listProfiles, removeProfile, getEndpoint, getEnvironmentLabel, resolveProfileName, getProfile } from "../config.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerProfile(program: Command): void {
  const profile = program
    .command("profile")
    .description("Profile management — manage identities (user/bot)")
    .addHelpText(
      "after",
      `
Add a profile:
  User profile (your own account, opens browser):
    arinova auth login

  Bot profile (for an agent — requires an existing ari_ token):
    arinova --profile <name> auth set-token ari_xxxxxxxx

Use a profile:
    arinova --profile <name> <command>

Inspect profiles:
    arinova profile list
    arinova --profile <name> profile show

Remove a profile:
    arinova profile remove <name>
`,
    );

  profile
    .command("list")
    .description("List all configured profiles")
    .action(() => {
      const profiles = listProfiles();
      if (profiles.length === 0) {
        console.log("No profiles configured.");
        console.log("  User:  arinova auth login");
        console.log("  Bot:   arinova --profile <name> auth set-token <key>");
        return;
      }
      table(
        profiles.map((p) => ({
          name: p.name,
          type: p.profile.type,
          key: `${p.profile.apiKey.slice(0, 12)}...`,
        })),
        [
          { key: "name", label: "Profile" },
          { key: "type", label: "Type" },
          { key: "key", label: "API Key" },
        ],
      );
      console.log(`\nEnvironment: ${getEnvironmentLabel()}`);
      console.log(`Endpoint:    ${getEndpoint()}`);
    });

  profile
    .command("remove <name>")
    .description("Remove a profile")
    .action((name: string) => {
      if (removeProfile(name)) {
        printSuccess(`Profile '${name}' removed.`);
      } else {
        printError(new Error(`Profile '${name}' not found.`));
      }
    });

  profile
    .command("show")
    .description("Show the active profile (from --profile)")
    .action(() => {
      const profileFlag = program.optsWithGlobals().profile as string | undefined;

      if (!profileFlag) {
        printError(new Error("--profile <name> is required."));
        return;
      }
      const activeName = profileFlag;

      const match = getProfile(activeName);
      if (!match) {
        printError(new Error(`Profile '${activeName}' not found. Run 'arinova profile list'.`));
        return;
      }

      printResult({
        profile: activeName,
        type: match.type,
        keyPrefix: `${match.apiKey.slice(0, 12)}...`,
        environment: getEnvironmentLabel(),
        endpoint: getEndpoint(),
      });
    });
}
