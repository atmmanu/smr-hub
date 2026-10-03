export function convertNumber(value: string, base: number) {
  const patterns: Record<number, RegExp> = { 2: /^[01]+$/, 10: /^\d+$/, 16: /^[\da-f]+$/i };
  const input = value.trim();
  if (input.length > 256 || !patterns[base]?.test(input)) throw new Error("Introduce un entero positivo o cero válido para la base seleccionada (máximo 256 caracteres).");
  const number = BigInt(base === 2 ? `0b${input}` : base === 16 ? `0x${input}` : input);
  return { Decimal: number.toString(10), Binario: number.toString(2), Hexadecimal: number.toString(16).toUpperCase() };
}

export const units = ["bits", "bytes", "KB", "MB", "GB", "TB"];
export function convertStorage(value: string, unit: string, binary: boolean) {
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) throw new Error("Introduce una cantidad positiva o cero.");
  const amount = Number(value.replace(",", "."));
  const index = units.indexOf(unit);
  if (index < 0) throw new Error("Unidad no válida.");
  const base = binary ? 1024 : 1000;
  const bits = amount * (index === 0 ? 1 : 8 * base ** (index - 1));
  if (!Number.isFinite(bits)) throw new Error("La cantidad es demasiado grande.");
  return Object.fromEntries(units.map((name, i) => [binary && i > 1 ? ["", "", "KiB", "MiB", "GiB", "TiB"][i] : name, bits / (i === 0 ? 1 : 8 * base ** (i - 1))]));
}

function ipNumber(value: string) {
  const pieces = value.split(".");
  if (pieces.length !== 4 || pieces.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) throw new Error("IPv4 no válida. Ejemplo: 192.168.1.10");
  return pieces.reduce((result, p) => result * 256 + Number(p), 0);
}
function ipText(value: number) {
  return [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join(".");
}
export function calculateIPv4(ip: string, mask: string) {
  const address = ipNumber(ip.trim());
  const input = mask.trim().replace(/^\//, "");
  let cidr: number;
  if (input.includes(".")) {
    const bits = ipNumber(input).toString(2).padStart(32, "0");
    if (!/^1*0*$/.test(bits)) throw new Error("La máscara debe tener unos consecutivos seguidos de ceros.");
    cidr = bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
  } else {
    if (!/^\d{1,2}$/.test(input) || Number(input) > 32) throw new Error("El CIDR debe estar entre 0 y 32.");
    cidr = Number(input);
  }
  const netmask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
  const network = (address & netmask) >>> 0;
  const broadcast = (network | ~netmask) >>> 0;
  const hosts = cidr >= 31 ? 2 ** (32 - cidr) : 2 ** (32 - cidr) - 2;
  return { IP: ipText(address), Máscara: ipText(netmask), CIDR: `/${cidr}`, Red: ipText(network), Broadcast: cidr >= 31 ? "No aplica" : ipText(broadcast), "Primer host": ipText(cidr >= 31 ? network : network + 1), "Último host": ipText(cidr >= 31 ? broadcast : broadcast - 1), "Hosts disponibles": String(hosts) };
}
