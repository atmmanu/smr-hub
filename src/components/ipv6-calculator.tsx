"use client";
import { useState } from "react";
import { calculateIPv6 } from "@/lib/ipv6";

export function IPv6Calculator() {
  const [ip, setIp] = useState("2001:db8:1234:5678::1");
  const [prefix, setPrefix] = useState("/64");
  let results: Record<string, string> = {};
  let error = "";
  try {
    const value = calculateIPv6(ip, prefix);
    results = {
      "Dirección introducida": value.input,
      "Dirección expandida": value.expanded,
      "Dirección comprimida": value.compressed,
      "Prefijo CIDR": `/${value.prefix}`,
      "Dirección de red": `${value.network}/${value.prefix}`,
      "Tipo de dirección": value.type,
      [`Parte de red · ${value.prefix} bits`]: value.networkPart,
      [`Parte de interfaz/host · ${128 - value.prefix} bits`]: value.hostPart,
      "Representación binaria · 128 bits": value.binary,
    };
  } catch (e) { error = (e as Error).message; }
  return <div className="grid gap-6 lg:grid-cols-2">
    <section className="panel field-grid self-start">
      <h2 className="text-xl font-semibold">Entiende una dirección IPv6</h2>
      <label>Dirección IPv6<input value={ip} maxLength={45} onChange={e => setIp(e.target.value)} placeholder="2001:db8::1" spellCheck={false} autoCapitalize="none" autoComplete="off"/></label>
      <label>Prefijo CIDR IPv6<input value={prefix} maxLength={4} onChange={e => setPrefix(e.target.value)} placeholder="/64"/></label>
      <p className="muted text-sm leading-6">Una IPv6 tiene 128 bits: ocho grupos de 16 bits. Cada grupo usa hasta cuatro dígitos hexadecimales. La abreviatura :: sustituye grupos de ceros y solo puede aparecer una vez.</p>
      <p className="muted text-sm leading-6">El prefijo indica cuántos bits pertenecen a la red. Los restantes forman la parte de host; con /64 son 64 y 64. Aquí se muestran ambas partes en binario, en líneas de hasta 16 bits. Con otros prefijos, esta división no implica un identificador de interfaz estándar.</p>
      <p className="muted text-sm leading-6">IPv6 no usa broadcast. La clasificación es orientativa y no comprueba conectividad; 2001:db8::/32 está reservado para ejemplos. Introduce la dirección y el prefijo por separado, sin puertos, corchetes ni identificadores de zona (%eth0).</p>
    </section>
    <section className="panel min-w-0" aria-live="polite"><p className="eyebrow mb-4">Resultado</p>{error ? <p className="message error" role="alert">{error}</p> : <dl>{Object.entries(results).map(([label, value]) => <div className="result-row !flex-col !gap-2" key={label}><dt className="muted text-sm">{label}</dt><dd className="font-mono text-sm leading-6 whitespace-pre-wrap break-all">{value}</dd></div>)}</dl>}</section>
  </div>;
}
