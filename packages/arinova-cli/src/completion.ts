import { Argument, type Command } from "commander";

function visibleTopLevelCommands(program: Command): string[] {
  return program.commands
    .filter((command) =>
      !(command as Command & { _hidden?: boolean })._hidden
    )
    .map((command) => command.name())
    .sort();
}

export function renderCompletion(
  program: Command,
  shell: "bash" | "zsh",
): string {
  const commands = visibleTopLevelCommands(program).join(" ");
  if (shell === "bash") {
    return `# bash completion for arinova
_arinova_complete() {
  local current="\${COMP_WORDS[COMP_CWORD]}"
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${commands}" -- "\${current}") )
  fi
}
complete -F _arinova_complete arinova
`;
  }
  return `#compdef arinova
_arinova() {
  local -a commands
  commands=(${commands})
  if (( CURRENT == 2 )); then
    _describe 'command' commands
  fi
}
compdef _arinova arinova
`;
}

export function registerCompletion(program: Command): void {
  program
    .command("completion")
    .addArgument(new Argument("<shell>").choices(["bash", "zsh"]))
    .description("Generate shell completion (bash or zsh)")
    .action((shell: "bash" | "zsh") => {
      process.stdout.write(renderCompletion(program, shell));
    });
}
