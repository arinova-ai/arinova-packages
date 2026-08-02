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
  public readonly statusCode?: number;
  public readonly details?: Record<string, unknown>;
  public readonly callId?: string;

  constructor(
    code: string,
    message: string,
    options: {
      statusCode?: number;
      details?: Record<string, unknown>;
      callId?: string;
    } = {},
  ) {
    super(message);
    this.name = "ActionExecutionError";
    this.code = code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.callId = options.callId;
  }
}
