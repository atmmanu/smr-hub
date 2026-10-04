import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("La clave de cifrado debe tener 32 bytes en base64.");
  return key;
}

export function encryptToken(token: string, userId: string, key: Buffer): string {
  if (!/^[a-zA-Z0-9_-]{16,512}$/.test(token)) throw new Error("Token Moodle no válido.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(`smr-hub:moodle:v1:${userId}`));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptToken(value: string, userId: string, key: Buffer): string {
  const [version, nonceText, tagText, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !nonceText || !tagText || !ciphertext || extra !== undefined || value.length > 1024) throw new Error("Token cifrado no válido.");
  const nonce = Buffer.from(nonceText, "base64");
  const tag = Buffer.from(tagText, "base64");
  if (nonce.length !== 12 || tag.length !== 16) throw new Error("Token cifrado no válido.");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(`smr-hub:moodle:v1:${userId}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}
