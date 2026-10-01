/** `listen_port` → `Listen port`; acronyms the core spells keep their case. */
export function humanize(key: string): string {
  const words = key.split("_").map((word) => ACRONYMS[word] ?? word);
  const first = words[0] ?? "";
  return [
    first.charAt(0).toUpperCase() + first.slice(1),
    ...words.slice(1),
  ].join(" ");
}

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
};
