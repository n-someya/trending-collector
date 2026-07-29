export function deterministicJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(deterministicJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${deterministicJson(entry)}`,
      )
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Cannot serialize undefined as deterministic JSON");
  }
  return serialized;
}
