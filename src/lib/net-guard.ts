// Pure SSRF guards for user-supplied integration URLs (no network here; unit-tested).

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".private",
  ".arpa",
];
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

/** Parses dotted IPv4 (the WHATWG URL parser already normalises hex/octal/decimal forms). */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local / cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function inV4Block(n: number, base: string, bits: number) {
  const b = ipv4ToInt(base)!;
  const size = 2 ** (32 - bits);
  return n >= b && n < b + size;
}

export function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return V4_BLOCKS.some(([base, bits]) => inV4Block(n, base, bits));
}

/** Expands an IPv6 literal (no brackets) into 8 hextets, or null if malformed. */
function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const maybeV4 = s.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const n = ipv4ToInt(maybeV4);
    if (n === null) return null;
    tail = [Math.floor(n / 65536), n % 65536];
    s = s.slice(0, lastColon + 1) + "0:0";
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (h: string) =>
    h ? h.split(":").map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN)) : [];
  const head = parse(halves[0] ?? "");
  const rest = halves.length === 2 ? parse(halves[1] ?? "") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const all = [...head, ...Array(Math.max(0, fill)).fill(0), ...rest];
  if (all.length !== 8 || all.some((x) => Number.isNaN(x))) return null;
  if (tail.length) {
    all[6] = tail[0]!;
    all[7] = tail[1]!;
  }
  return all;
}

export function isPrivateIPv6(ip: string): boolean {
  const h = expandIPv6(ip);
  if (!h) return true; // malformed literal: refuse
  const [a, , , , , f, g, i] = h as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const allZeroPrefix = h.slice(0, 5).every((x) => x === 0);
  if (allZeroPrefix && f === 0 && g === 0 && (i === 0 || i === 1)) return true; // :: and ::1
  if (allZeroPrefix && f === 0xffff) {
    // IPv4-mapped ::ffff:a.b.c.d
    return isPrivateIPv4(`${g >> 8}.${g & 255}.${i >> 8}.${i & 255}`);
  }
  if (h.slice(0, 6).every((x) => x === 0)) return true; // deprecated IPv4-compatible
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x64 && h[1] === 0xff9b) return true; // NAT64 can reach internal v4
  if (a === 0x2001 && h[1] === 0x0db8) return true; // documentation
  if (a === 0x2002) return true; // 6to4 embeds arbitrary v4
  return false;
}

export function isIpLiteral(host: string) {
  return ipv4ToInt(host) !== null || host.includes(":");
}

export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  return bare.includes(":") ? isPrivateIPv6(bare) : isPrivateIPv4(bare);
}

export type UrlPolicy = { allowHttp?: boolean; allowedPorts?: number[] };

/**
 * Validates a URL for outbound calls to third-party APIs: public http(s) host only,
 * no embedded credentials, no internal names, no private/metadata IP literals, standard ports.
 * DNS resolution is checked separately at request time (see safe-fetch.server.ts).
 */
export function checkOutboundUrl(raw: string, policy: UrlPolicy = {}): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }
  const allowed = policy.allowHttp ? ["https:", "http:"] : ["https:"];
  if (!allowed.includes(url.protocol)) {
    return {
      ok: false,
      reason: policy.allowHttp ? "Use http:// ou https://" : "Use apenas https://",
    };
  }
  if (url.username || url.password)
    return { ok: false, reason: "Não coloque usuário/senha na URL" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "URL sem host" };
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "Endereços internos não são permitidos" };
  }
  const bare = host.replace(/^\[|\]$/g, "");
  if (isIpLiteral(bare)) {
    if (isPrivateAddress(bare))
      return { ok: false, reason: "Endereços IP privados ou internos não são permitidos" };
  } else if (!host.includes(".")) {
    return { ok: false, reason: "Use um domínio público completo" };
  }
  const ports = policy.allowedPorts ?? [443, 8443, 80, 8080];
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!ports.includes(port)) return { ok: false, reason: `Porta ${port} não permitida` };
  return { ok: true, url };
}
