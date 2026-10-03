import test from "node:test";
import assert from "node:assert/strict";
import { calculateIPv4, convertNumber, convertStorage } from "../src/lib/tools.ts";
test("conversiones exactas y entradas inválidas", () => {
  assert.deepEqual(convertNumber("FF", 16), { Decimal: "255", Binario: "11111111", Hexadecimal: "FF" });
  assert.equal(convertNumber("9007199254740993", 10).Decimal, "9007199254740993");
  assert.equal(convertNumber("000", 2).Decimal, "0");
  for (const [value,base] of [["102",2],["-1",10],["1.5",10],["G",16],["",10]] as const) assert.throws(() => convertNumber(value,base));
});
test("almacenamiento: bits, bytes y convenciones decimal y binaria", () => {
  assert.equal(convertStorage("1", "GB", false).bytes, 1_000_000_000);
  assert.equal(convertStorage("1", "GB", true).bytes, 1_073_741_824);
  assert.equal(convertStorage("8", "bits", false).bytes, 1);
  assert.equal(convertStorage("1,5", "KB", false).bytes, 1500);
  assert.throws(() => convertStorage("-1", "KB", false));
  assert.throws(() => convertStorage("Infinity", "KB", false));
});
test("IPv4: /24 y máscara equivalente", () => {
  const result = calculateIPv4("192.168.1.10", "24");
  assert.deepEqual(result, { IP: "192.168.1.10", Máscara: "255.255.255.0", CIDR: "/24", Red: "192.168.1.0", Broadcast: "192.168.1.255", "Primer host": "192.168.1.1", "Último host": "192.168.1.254", "Hosts disponibles": "254" });
  assert.deepEqual(calculateIPv4("192.168.1.10", "255.255.255.0"), result);
});
test("IPv4: límites /0, /31, /32 y entradas inválidas", () => {
  assert.equal(calculateIPv4("255.255.255.255", "0")["Hosts disponibles"], "4294967294");
  assert.equal(calculateIPv4("10.0.0.3", "31")["Primer host"], "10.0.0.2");
  assert.equal(calculateIPv4("10.0.0.3", "31")["Hosts disponibles"], "2");
  assert.equal(calculateIPv4("10.0.0.3", "32")["Último host"], "10.0.0.3");
  assert.equal(calculateIPv4("10.0.0.3", "32").Broadcast, "No aplica");
  for (const mask of ["33", "-1", "255.0.255.0", "24abc", ""]) assert.throws(() => calculateIPv4("10.0.0.1", mask));
  for (const ip of ["256.0.0.1", "10.0.0", "10.a.0.1"]) assert.throws(() => calculateIPv4(ip, "24"));
});
