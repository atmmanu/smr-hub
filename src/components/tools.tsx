"use client";
import { useState } from "react";
import { calculateIPv4, convertNumber, convertStorage, units } from "@/lib/tools";
import { IPv6Calculator } from "./ipv6-calculator";

export function Tools() {
  const [tab, setTab] = useState("bases");
  const [value, setValue] = useState("42");
  const [base, setBase] = useState("10");
  const [storage, setStorage] = useState("1");
  const [unit, setUnit] = useState("GB");
  const [binary, setBinary] = useState(false);
  const [ip, setIp] = useState("192.168.1.10");
  const [mask, setMask] = useState("24");
  let result: Record<string, string | number> = {};
  let error = "";
  try { if (tab !== "ipv6") result = tab === "bases" ? convertNumber(value, Number(base)) : tab === "storage" ? convertStorage(storage, unit, binary) : calculateIPv4(ip, mask); } catch (e) { error = (e as Error).message; }
  return <div><div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Herramientas">{[["bases","Conversor de bases"],["storage","Almacenamiento"],["ipv4","Calculadora IPv4"],["ipv6","Calculadora IPv6"]].map(([id,label]) => <button role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)} className={tab === id ? "primary" : "secondary"}>{label}</button>)}</div>
    {tab === "ipv6" ? <IPv6Calculator/> : <div className="grid gap-6 lg:grid-cols-2"><section className="panel field-grid">
      {tab === "bases" ? <><h2 className="text-xl font-semibold">Un número, tres formas de verlo</h2><label>Base de origen<select value={base} onChange={e => setBase(e.target.value)}><option value="10">Decimal (10)</option><option value="2">Binario (2)</option><option value="16">Hexadecimal (16)</option></select></label><label>Número<input value={value} maxLength={256} onChange={e => setValue(e.target.value)} spellCheck={false}/></label><p className="muted text-sm">Introduce enteros positivos o cero, sin prefijos 0x o 0b.</p></> : tab === "storage" ? <><h2 className="text-xl font-semibold">¿Cuánto espacio necesitas?</h2><label>Cantidad<input inputMode="decimal" value={storage} maxLength={100} onChange={e => setStorage(e.target.value)}/></label><label>Unidad<select value={unit} onChange={e => setUnit(e.target.value)}>{units.map((u,i) => <option key={u} value={u}>{binary && i > 1 ? ["","","KiB","MiB","GiB","TiB"][i] : u}</option>)}</select></label><label>Convención<select value={String(binary)} onChange={e => setBinary(e.target.value === "true")}><option value="false">Decimal · 1 KB = 1000 bytes</option><option value="true">Binaria · 1 KiB = 1024 bytes</option></select></label><p className="muted text-sm">Un byte contiene 8 bits. Los resultados son aproximados para cantidades con decimales.</p></> : <><h2 className="text-xl font-semibold">Conoce tu subred</h2><label>Dirección IPv4<input value={ip} maxLength={15} onChange={e => setIp(e.target.value)}/></label><label>Máscara o CIDR<input value={mask} maxLength={15} onChange={e => setMask(e.target.value)} placeholder="24 o 255.255.255.0"/></label><p className="muted text-sm">/31 se interpreta como enlace punto a punto (2 hosts). /32 identifica un único host; ambos carecen de broadcast.</p></>}
    </section><section className="panel" aria-live="polite"><p className="eyebrow mb-4">Resultado</p>{error ? <p className="message error">{error}</p> : Object.entries(result).map(([key,val]) => <div className="result-row" key={key}><span className="muted shrink-0">{key}</span><span className="font-mono text-right break-all">{typeof val === "number" ? new Intl.NumberFormat("es-ES", { maximumSignificantDigits: 12 }).format(val) : val}</span></div>)}</section></div>}
  </div>;
}
