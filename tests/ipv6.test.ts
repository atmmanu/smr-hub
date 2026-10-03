import test from "node:test";
import assert from "node:assert/strict";
import { isIP } from "node:net";
import { calculateIPv6 } from "../src/lib/ipv6.ts";

test("IPv6: expande, comprime y calcula una red /64", () => {
  const result = calculateIPv6(" 2001:0DB8:1234:5678:0000:0000:0000:0001 ", "/64");
  assert.equal(result.input, "2001:0DB8:1234:5678:0000:0000:0000:0001");
  assert.equal(result.expanded, "2001:0db8:1234:5678:0000:0000:0000:0001");
  assert.equal(result.compressed, "2001:db8:1234:5678::1");
  assert.equal(result.network, "2001:db8:1234:5678::");
  assert.equal(result.prefix, 64);
  assert.equal(result.networkPart.replaceAll("\n", "").length, 64);
  assert.equal(result.hostPart.replaceAll("\n", ""), "0".repeat(63) + "1");
  assert.equal(result.binary.split("\n").length, 8);
  assert.ok(result.binary.split("\n").every(group => /^[01]{16}$/.test(group)));
});

test("IPv6: compresión al principio y final, empate y cero aislado", () => {
  for (const [input, expected] of [
    ["0:0:1:2:3:4:5:6", "::1:2:3:4:5:6"],
    ["1:2:3:4:5:6:0:0", "1:2:3:4:5:6::"],
    ["2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"],
    ["1:0:2:3:4:5:6:7", "1:0:2:3:4:5:6:7"],
    ["1:0:0:2:0:0:0:3", "1:0:0:2::3"],
    ["::", "::"],
    ["::1", "::1"],
  ]) assert.equal(calculateIPv6(input, "64").compressed, expected);
});

test("IPv6: identifica categorías y sus límites de prefijo", () => {
  for (const [input, type] of [
    ["::", "Unspecified"], ["::1", "Loopback"],
    ["2001:db8::1", "Global Unicast"], ["3fff::1", "Global Unicast"],
    ["fe80::1", "Link-Local"], ["febf::1", "Link-Local"],
    ["fc00::1", "Unique Local"], ["fdff::1", "Unique Local"],
    ["ff02::1", "Multicast"], ["ffff::1", "Multicast"],
    ["fec0::1", "Otro / no identificado"], ["4000::1", "Otro / no identificado"],
    ["::ffff:192.0.2.128", "Otro / no identificado"],
  ]) assert.equal(calculateIPv6(input, "64").type, type);
});

test("IPv6: /0, /128 y división que atraviesa un grupo hexadecimal", () => {
  const input = "2001:db8:1234:5678:abcd:ef01:2345:6789";
  const zero = calculateIPv6(input, "0");
  assert.equal(zero.network, "::");
  assert.equal(zero.networkPart, "Sin bits");
  assert.equal(zero.hostPart, zero.binary);
  const full = calculateIPv6(input, "/128");
  assert.equal(full.network, input);
  assert.equal(full.networkPart, full.binary);
  assert.equal(full.hostPart, "Sin bits");
  const partial = calculateIPv6(input, "/65");
  assert.equal(partial.network, "2001:db8:1234:5678:8000::");
  assert.equal(partial.networkPart.replaceAll("\n", "").length, 65);
  assert.equal(partial.hostPart.replaceAll("\n", "").length, 63);
  assert.equal(partial.networkPart.replaceAll("\n", "") + partial.hostPart.replaceAll("\n", ""), partial.binary.replaceAll("\n", ""));
});

test("IPv6: admite IPv4 final y abreviatura de un solo grupo", () => {
  const result = calculateIPv6("::ffff:192.0.2.128", "96");
  assert.equal(result.expanded, "0000:0000:0000:0000:0000:ffff:c000:0280");
  assert.equal(result.compressed, "::ffff:c000:280");
  assert.equal(result.network, "::ffff:0:0");
  assert.equal(calculateIPv6("1:2:3:4:5:6::8", "64").compressed, "1:2:3:4:5:6:0:8");
});

test("IPv6: rechaza direcciones y prefijos incorrectos", () => {
  for (const input of ["", "192.168.1.1", "1:2:3", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7::8", "1::2::3", ":::1", "1:::2", ":1:2:3:4:5:6:7", "1:2:3:4:5:6:7:", "12345::", "2001:gggg::1", "fe80::1%eth0", "[::1]", "2001:db8::1/64", "::ffff:256.0.2.1", "::ffff:192.00.2.1", "192.0.2.1::", "1:2:3:4:5:6:7:192.0.2.1"])
    assert.throws(() => calculateIPv6(input, "64"), /IPv6 no válida/, input);
  for (const prefix of ["", "/", "-1", "129", "64.5", "64abc", "//64", "064", "1e2", "Infinity"])
    assert.throws(() => calculateIPv6("::1", prefix), /prefijo CIDR/, prefix);
});

test("IPv6: redes válidas y bits coherentes para todos los prefijos", () => {
  const inputs = ["::", "::1", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "2001:db8:1234:5678:9abc:def0:1234:5678", "::ffff:192.0.2.128"];
  for (const input of inputs) {
    assert.equal(isIP(input), 6);
    const expanded = calculateIPv6(input, "128").expanded;
    const value = BigInt(`0x${expanded.replaceAll(":", "")}`);
    for (let prefix = 0; prefix <= 128; prefix++) {
      const result = calculateIPv6(input, String(prefix));
      assert.equal(isIP(result.network), 6);
      assert.equal(isIP(result.compressed), 6);
      const netBits = result.networkPart === "Sin bits" ? "" : result.networkPart.replaceAll("\n", "");
      const hostBits = result.hostPart === "Sin bits" ? "" : result.hostPart.replaceAll("\n", "");
      assert.equal(netBits.length, prefix);
      assert.equal(hostBits.length, 128 - prefix);
      assert.equal(netBits + hostBits, value.toString(2).padStart(128, "0"));
      const network = calculateIPv6(result.network, "128").binary.replaceAll("\n", "");
      assert.equal(network, netBits + "0".repeat(128 - prefix));
    }
  }
});
