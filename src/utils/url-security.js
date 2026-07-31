import dns from "node:dns";
import net from "node:net";

function privateIpv4(address) {
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

export function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return privateIpv4(address);
  if (family !== 6) return true;
  const value = address.toLowerCase();
  if (value === "::" || value === "::1" || /^(fc|fd|fe[89ab])/.test(value)) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped && privateIpv4(mapped[1]));
}

export async function assertSafeHttpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("URL invÃ¡lida"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("URL no permitida");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("Host interno no permitido");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("IP privada no permitida");
    return url;
  }
  const addresses = await dns.promises.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Host no permitido");
  return url;
}

export function safeLookup(hostname, options, callback) {
  const done = typeof options === "function" ? options : callback;
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return done(error);
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) return done(new Error("Host no permitido"));
    return done(null, addresses[0].address, addresses[0].family);
  });
}
