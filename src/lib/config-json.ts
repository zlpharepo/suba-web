import { isObject, type JsonObject } from "./schema.ts";

export const configKey = (name: string) => ["singbox", "config", name];

export function parseConfigJson(text: string):
  | { value: JsonObject; error: null }
  | { value: null; error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Parser messages can include fragments of credentials from the document.
    return { value: null, error: "configuration: invalid JSON" };
  }
  return isObject(value)
    ? { value, error: null }
    : { value: null, error: "configuration: expected a JSON object" };
}
