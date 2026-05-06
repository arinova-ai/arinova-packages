export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class ManifestError extends Error {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "ManifestError";
    this.statusCode = statusCode;
  }
}

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export class ActionExecutionError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ActionExecutionError";
    this.code = code;
  }
}
