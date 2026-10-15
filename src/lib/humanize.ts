/** `listen_port` → `Listen Port`; acronyms the core spells keep their case. */
export function humanize(key: string): string {
  return key
    .split("_")
    .map((word, at) => spell(word, at === 0))
    .join(" ");
}

function spell(word: string, first: boolean): string {
  const acronym = ACRONYMS[word];
  if (acronym) return acronym;
  // The rule a title uses: the little words stay down unless they lead, so
  // `udp_over_tcp` reads "UDP over TCP" rather than the shoutier "UDP Over TCP".
  if (!first && MINOR.has(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Words that stay lowercase inside a title. */
const MINOR = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "nor",
  "of",
  "on",
  "onto",
  "or",
  "over",
  "per",
  "the",
  "to",
  "up",
  "via",
  "with",
  "without",
]);

const ACRONYMS: Record<string, string> = {
  tls: "TLS",
  dns: "DNS",
  ip: "IP",
  ipv4: "IPv4",
  ipv6: "IPv6",
  tcp: "TCP",
  udp: "UDP",
  http: "HTTP",
  https: "HTTPS",
  url: "URL",
  uuid: "UUID",
  sni: "SNI",
  alpn: "ALPN",
  ech: "ECH",
  utls: "uTLS",
  mtu: "MTU",
  api: "API",
  acme: "ACME",
  cidr: "CIDR",
  id: "ID",
  ntp: "NTP",
  ssh: "SSH",
  ui: "UI",
  fakeip: "FakeIP",
  quic: "QUIC",
  inet4: "IPv4",
  inet6: "IPv6",
  vmess: "VMess",
  vless: "VLESS",
  tuic: "TUIC",
  mptcp: "MPTCP",
  nfqueue: "NFQueue",
  uid: "UID",
  mac: "MAC",
  dhcp: "DHCP",
  mdns: "mDNS",
  grpc: "gRPC",
  ws: "WS",
  v2ray: "V2Ray",
};
