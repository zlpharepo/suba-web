// Wire shapes of the suba management API, as the server serializes them.

export type PatternKind = "name" | "keyword" | "regex";

/** One filter pattern: a single-key object naming how the text is matched. */
export type Pattern =
  | { name: string }
  | { keyword: string }
  | { regex: string };

interface ProviderShared {
  disabled?: boolean;
  includes?: Pattern[];
  excludes?: Pattern[];
}

export interface RemoteProvider extends ProviderShared {
  type: "remote";
  url: string;
  interval?: number;
  /** A header sent more than once is a list of its values. */
  headers?: Record<string, string | string[]>;
  /** Milliseconds. */
  timeout?: number;
}

export interface LocalProvider extends ProviderShared {
  type: "local";
  path: string;
  interval?: number;
}

export interface InlineProvider extends ProviderShared {
  type: "inline";
  payload: string;
}

export type Provider = RemoteProvider | LocalProvider | InlineProvider;
export type ProviderType = Provider["type"];

export type RefreshStatus = "fetched" | "unchanged" | "not-modified";

export interface Refresh {
  name: string;
  status: RefreshStatus;
  bytes: number;
  nodes: number;
  unreadable?: string;
}

export interface SourceView {
  provider: string;
  name: string | null;
  first_seen: number;
  serving: boolean;
}

export interface NodeView {
  id: string;
  name: string | null;
  protocol: string | null;
  endpoint: string | null;
  first_seen: number;
  orphan: boolean;
  sources: SourceView[];
}

export interface ProviderNodes {
  name: string;
  nodes: NodeView[];
  passed_over: number;
  orphans: number;
  unreadable?: string;
}

export interface Collection {
  providers?: string[];
  includes?: Pattern[];
  excludes?: Pattern[];
  /** Token name to the sha256 of the token; the token itself is never kept. */
  tokens?: Record<string, string>;
}

export interface CollectionNodes {
  name: string;
  nodes: NodeView[];
  passed_over: number;
  orphans: number;
  unresolved: string[];
}

export interface DeliveryToken {
  name: string;
  token: string;
  path: string;
}

export interface Artifact {
  body: string;
  format: string | null;
  nodes: number | null;
  skipped: number | null;
}

export interface SystemStatus {
  version: string;
  administrator_configured: boolean;
}

export interface FormatView {
  name: string;
  intents: string[];
  protocols: { support: "everything" } | { support: "only"; kinds: string[] };
}

export interface SystemInfo extends SystemStatus {
  formats: FormatView[];
}

export interface Core {
  version: string | null;
  collections: string[];
  installed: boolean;
  assembled: boolean;
  running: boolean;
  note?: string;
}

export interface Exit {
  at: number;
  code: number | null;
  signal: number | null;
}

export interface Running {
  running: boolean;
  pid: number | null;
  started_at: number | null;
  exits: Exit[];
  log: string[];
}

export type CoreAction = "start" | "stop" | "restart";

export type Installation =
  | { status: "not-installed" }
  | {
      status: "downloading";
      progress: {
        downloaded: number;
        total: number | null;
        percentage: number | null;
      };
    }
  | { status: "installed"; installed_at: number }
  | { status: "failed"; error: string };

export type Runtime =
  | { status: "stopped" }
  | { status: "starting" }
  | { status: "running"; pid: number }
  | { status: "stopping" }
  | { status: "failed"; error: string };

export interface VersionView {
  version: string;
  tag: string;
  asset?: string;
  platform?: string;
  asset_sha256?: string;
  binary_sha256?: string;
  schema_sha256?: string;
  installation: Installation;
  runtime: Runtime;
  current: boolean;
}

export interface Releases {
  stable: string | null;
  latest: string | null;
  versions: { version: string; tag: string; page: string | null }[];
}

export interface Saved {
  unchecked: { what: string; fix: string }[];
  warnings: string[];
}

export interface Versioned<T> {
  value: T;
  etag: string | null;
}

export interface Tag {
  tag: string;
  space: "outbound" | "inbound";
  kind: string | null;
  path: string;
}

export interface References {
  tags: Tag[];
  unchecked: { what: string; reason: string }[];
}

export type GenerateCommand =
  | "uuid"
  | "rand"
  | "reality-keypair"
  | "tls-keypair"
  | "ech-keypair"
  | "wg-keypair"
  | "vapid-keypair";

export interface Generated {
  command: string;
  output: string;
}
