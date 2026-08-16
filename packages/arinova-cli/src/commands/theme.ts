import type { Command } from "commander";
import { registerThemeApiCommands } from "./theme-api.js";
import { registerThemeBuildCommand } from "./theme-build-command.js";
import { registerThemeDevCommand } from "./theme-dev-command.js";
import { registerThemeInitCommand } from "./theme-init-command.js";

export { isSafeBundleFileName, resolveThemeRootFile, validateManifestForBuild } from "./theme-build.js";
export { generateDevHtml } from "./theme-dev.js";
export { scaffoldThemeJs, slugifyThemeId } from "./theme-scaffold.js";

export function registerTheme(program: Command): void {
  const theme = program.command("theme").description("Theme management");
  registerThemeApiCommands(theme);
  registerThemeInitCommand(theme);
  registerThemeDevCommand(theme);
  registerThemeBuildCommand(theme);
}
