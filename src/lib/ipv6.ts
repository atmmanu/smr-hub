function parseIPv6(input: string): number[] {
  let address = input;
  const invalid = () => new Error("IPv6 no válida. Usa ocho grupos hexadecimales o una abreviatura con un solo ::. Ejemplo: 2001:db8::1");
  if (!address || address.length > 45) throw invalid();

  // La notación mixta representa los últimos 32 bits mediante una IPv4.
  if (address.includes(".")) {
    const separator = address.lastIndexOf(":");
    const octets = address.slice(separator + 1).split(".");
    if (separator < 0 || octets.length !== 4 || octets.some(o => !/^(0|[1-9]\d{0,2})$/.test(o) || Number(o) > 255)) throw invalid();
    address = `${address.slice(0, separator + 1)}${(Number(octets[0]) * 256 + Number(octets[1])).toString(16)}:${(Number(octets[2]) * 256 + Number(octets[3])).toString(16)}`;
  }
  if (!/^[\da-f:]+$/i.test(address)) throw invalid();
  const sides = address.split("::");
  if (sides.length > 2) throw invalid();
  const left = sides[0] ? sides[0].split(":") : [];
  const right = sides.length === 2 && sides[1] ? sides[1].split(":") : [];
  if ([...left, ...right].some(group => !/^[\da-f]{1,4}$/i.test(group))) throw invalid();
  const count = left.length + right.length;
  if (sides.length === 1 ? count !== 8 : count >= 8) throw invalid();
  return [...left, ...Array(sides.length === 2 ? 8 - count : 0).fill("0"), ...right].map(group => parseInt(group, 16));
}

function compressIPv6(groups: number[]): string {
  let bestStart = -1;
  let bestLength = 1;
  // Comprimir la secuencia más larga; en empate, la primera. No abreviar un cero aislado.
  for (let i = 0; i < groups.length;) {
    if (groups[i] !== 0) { i++; continue; }
    const start = i;
    while (i < groups.length && groups[i] === 0) i++;
    if (i - start > bestLength) { bestStart = start; bestLength = i - start; }
  }
  const text = groups.map(group => group.toString(16));
  return bestStart < 0 ? text.join(":") : `${text.slice(0, bestStart).join(":")}::${text.slice(bestStart + bestLength).join(":")}`;
}

function addressType(groups: number[], value: bigint): string {
  if (value === 0n) return "Unspecified";
  if (value === 1n) return "Loopback";
  if ((groups[0] & 0xff00) === 0xff00) return "Multicast";
  if ((groups[0] & 0xffc0) === 0xfe80) return "Link-Local";
  if ((groups[0] & 0xfe00) === 0xfc00) return "Unique Local";
  if ((groups[0] & 0xe000) === 0x2000) return "Global Unicast";
  return "Otro / no identificado";
}

function groupBits(bits: string): string {
  return bits.match(/.{1,16}/g)?.join("\n") || "Sin bits";
}

export function calculateIPv6(ip: string, cidr: string) {
  const input = ip.trim();
  const groups = parseIPv6(input);
  const prefixText = cidr.trim().replace(/^\//, "");
  if (!/^(0|[1-9]\d{0,2})$/.test(prefixText) || Number(prefixText) > 128) throw new Error("El prefijo CIDR debe ser un entero entre 0 y 128. Ejemplo: /64");
  const prefix = Number(prefixText);
  const expanded = groups.map(group => group.toString(16).padStart(4, "0")).join(":");
  const value = BigInt(`0x${expanded.replaceAll(":", "")}`);
  const hostLength = BigInt(128 - prefix);
  const networkValue = (value >> hostLength) << hostLength;
  const networkGroups = networkValue.toString(16).padStart(32, "0").match(/.{4}/g)!.map(group => parseInt(group, 16));
  const bits = value.toString(2).padStart(128, "0");
  return {
    input,
    expanded,
    compressed: compressIPv6(groups),
    prefix,
    network: compressIPv6(networkGroups),
    networkPart: groupBits(bits.slice(0, prefix)),
    hostPart: groupBits(bits.slice(prefix)),
    type: addressType(groups, value),
    binary: groupBits(bits),
  };
}
