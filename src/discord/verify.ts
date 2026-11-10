import { verifyKey } from 'discord-interactions';

/**
 * Verify Discord's Ed25519 signature for an interaction request.
 *
 * discord-interactions v4: verifyKey is async — it MUST be awaited.
 * Unawaited, the returned Promise is truthy and every request would pass
 * signature validation (this bit us once in production).
 */
export async function verifySignature(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string
): Promise<boolean> {
  return await verifyKey(body, signature, timestamp, publicKey);
}
