/** Parse JSON while rejecting duplicate object keys, including escaped aliases. */
export function parseJsonWithoutDuplicateKeys(raw: string): unknown {
  let index = 0;

  const skipWhitespace = () => {
    while (/\s/.test(raw[index] ?? "")) index++;
  };

  const parseString = (): string => {
    const start = index++;
    while (index < raw.length) {
      if (raw[index] === "\\") {
        index += 2;
        continue;
      }
      if (raw[index++] === '"') {
        return JSON.parse(raw.slice(start, index)) as string;
      }
    }
    throw new SyntaxError("unterminated JSON string");
  };

  const skipLiteral = () => {
    while (index < raw.length && !/[\s,\]}]/.test(raw[index] ?? "")) index++;
  };

  const parseValue = (): void => {
    skipWhitespace();
    if (raw[index] === "{") parseObject();
    else if (raw[index] === "[") parseArray();
    else if (raw[index] === '"') void parseString();
    else skipLiteral();
  };

  const parseArray = (): void => {
    index++;
    skipWhitespace();
    if (raw[index] === "]") {
      index++;
      return;
    }
    while (index < raw.length) {
      parseValue();
      skipWhitespace();
      if (raw[index] === ",") {
        index++;
        continue;
      }
      if (raw[index] === "]") index++;
      return;
    }
  };

  const parseObject = (): void => {
    const keys = new Set<string>();
    index++;
    skipWhitespace();
    if (raw[index] === "}") {
      index++;
      return;
    }
    while (index < raw.length) {
      skipWhitespace();
      if (raw[index] !== '"') return;
      const key = parseString();
      if (keys.has(key)) throw new SyntaxError(`JSON object contains duplicate key: ${key}`);
      keys.add(key);
      skipWhitespace();
      if (raw[index] !== ":") return;
      index++;
      parseValue();
      skipWhitespace();
      if (raw[index] === ",") {
        index++;
        continue;
      }
      if (raw[index] === "}") index++;
      return;
    }
  };

  // JSON.parse remains the authority for syntax; the scanner adds the key invariant.
  const parsed = JSON.parse(raw) as unknown;
  parseValue();
  return parsed;
}
