import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Browser-safe SHA-256.
// Falls back to @noble/hashes in environments where WebCrypto isn't available
// (some browsers/contexts may not expose crypto.subtle).
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const subtle = (globalThis as any).crypto?.subtle;
  if (subtle?.digest) {
    const hashBuffer = await subtle.digest('SHA-256', msgBuffer);
    return bytesToHex(new Uint8Array(hashBuffer));
  }
  return bytesToHex(nobleSha256(msgBuffer));
}

export function generateSeed(): string {
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj?.getRandomValues) {
    const array = new Uint8Array(32);
    cryptoObj.getRandomValues(array);
    return bytesToHex(array);
  }
  // Very last-resort fallback (non-cryptographic). Good enough for local dev testing.
  let s = '';
  for (let i = 0; i < 64; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
