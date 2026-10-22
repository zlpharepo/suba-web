import {
  ownProperties,
  type JsonObject,
  type JsonSchema,
  type SchemaTree,
} from "./schema.ts";
import type { GenerateCommand } from "./types.ts";

export interface FieldGeneration {
  command: GenerateCommand;
  format: "uuid" | "hex" | "base64" | "reality" | "wireguard" | "tls" | "ech";
  fields: string[];
  length?: number;
  name?: string;
}

export function fieldGeneration(
  tree: SchemaTree,
  schema: JsonSchema,
  object: JsonObject,
  field: string,
  root: JsonObject,
): FieldGeneration | null {
  const node = tree.resolve(schema);
  const properties = ownProperties(tree, node);
  if (!properties[field]) return null;
  const defined = (name: string) => node === tree.root.$defs?.[name];
  const scalar = tree.resolve(properties[field]).type === "string";
  const single = (
    command: GenerateCommand,
    format: FieldGeneration["format"],
    length?: number,
  ): FieldGeneration => ({
    command,
    format,
    fields: [field],
    ...(length === undefined ? {} : { length }),
  });

  if (field === "uuid" && scalar) return single("uuid", "uuid");
  if (field === "password" && scalar) {
    const shadowsocks =
      object.type === "shadowsocks" ||
      defined("ShadowsocksUser") ||
      defined("ShadowsocksDestination");
    if (shadowsocks) {
      const method = object.method ?? root.method;
      if (typeof method !== "string" || method === "none") return null;
      if (method.startsWith("2022-")) {
        const length = {
          "2022-blake3-aes-128-gcm": 16,
          "2022-blake3-aes-256-gcm": 32,
          "2022-blake3-chacha20-poly1305": 32,
        }[method];
        return length ? single("rand", "base64", length) : null;
      }
    }
    return single("rand", "hex", 32);
  }
  if (defined("InboundRealityOptions")) {
    if (field === "private_key") return single("reality-keypair", "reality");
    if (field === "short_id") return single("rand", "hex", 8);
  }
  if (field === "private_key" && object.type === "wireguard") {
    return single("wg-keypair", "wireguard");
  }
  if (field === "pre_shared_key" && defined("WireGuardPeer")) {
    return single("rand", "base64", 32);
  }
  if (
    (field === "certificate" || field === "key") &&
    defined("InboundTLSOptions")
  ) {
    return {
      command: "tls-keypair",
      format: "tls",
      fields: ["certificate", "key"],
      name: typeof object.server_name === "string" ? object.server_name : "",
    };
  }
  if (field === "key" && defined("InboundECHOptions")) {
    return { command: "ech-keypair", format: "ech", fields: ["key"], name: "" };
  }
  return null;
}

export function validGenerationName(name: string): boolean {
  return (
    name.length > 0 &&
    new TextEncoder().encode(name).length <= 253 &&
    !name.startsWith("-") &&
    !/[\s\0]/.test(name)
  );
}

export interface GeneratedFields {
  values: Record<string, string>;
  companion?: { label: string; value: string };
}

export function generatedFields(
  plan: FieldGeneration,
  output: string,
): GeneratedFields {
  const text = output.trim().replace(/\r\n/g, "\n");
  const invalid = () => new Error("generate.output: unexpected format");
  const single = (value: string): GeneratedFields => ({
    values: { [plan.fields[0]]: value },
  });
  const pem = (label: string) => {
    const pattern = new RegExp(
      `-----BEGIN ${label}-----\\n([A-Za-z0-9+/=\\n]+)\\n-----END ${label}-----`,
      "g",
    );
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 1) throw invalid();
    return matches[0][0];
  };

  switch (plan.format) {
    case "uuid":
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
      ) throw invalid();
      return single(text);
    case "hex":
    case "base64": {
      if (
        !plan.length ||
        text.length !== plan.length * 2 ||
        !/^[0-9a-f]+$/i.test(text)
      ) throw invalid();
      // The existing API always asks rand for hex, including fixed-size binary keys.
      const value = plan.format === "hex" ? text : btoa(
        String.fromCharCode(
          ...text.match(/../g)!.map((byte) => Number.parseInt(byte, 16)),
        ),
      );
      return single(value);
    }
    case "reality":
    case "wireguard": {
      const pattern = plan.format === "reality"
        ? "[A-Za-z0-9_-]{43}" : "[A-Za-z0-9+/]{43}=";
      const match = text.match(
        new RegExp(`^PrivateKey: (${pattern})\\nPublicKey: (${pattern})$`),
      );
      if (!match) throw invalid();
      return {
        ...single(match[1]),
        companion: { label: "Public Key", value: match[2] },
      };
    }
    case "tls":
      return {
        values: { certificate: pem("CERTIFICATE"), key: pem("PRIVATE KEY") },
      };
    case "ech":
      return {
        values: { key: pem("ECH KEYS") },
        companion: { label: "ECH Config", value: pem("ECH CONFIGS") },
      };
  }
}

export function applyGeneratedFields(
  current: JsonObject,
  previous: JsonObject,
  generated: GeneratedFields,
): JsonObject | null {
  // A late answer must not replace a manual edit or a different array entry.
  if (current !== previous) return null;
  return {
    ...current,
    ...Object.fromEntries(Object.entries(generated.values).map(([key, value]) =>
      [key, Array.isArray(current[key]) ? [value] : value],
    )),
  };
}
