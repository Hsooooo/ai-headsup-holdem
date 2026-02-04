import * as crypto from 'crypto';

// Node 18+ already has globalThis.crypto (WebCrypto). This is a minimal fallback.
if (!globalThis.crypto) {
    // @ts-ignore
    globalThis.crypto = crypto.webcrypto;
}
