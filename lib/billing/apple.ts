import { X509Certificate, createHash, verify as verifySignature } from "node:crypto";

/**
 * Verification of App Store signed data (JWS): transactions from StoreKit 2,
 * renewal info, and App Store Server Notifications v2.
 *
 * Apple signs these with ES256 and puts the certificate chain in the
 * header's `x5c`: a leaf (App Store receipt signing), an intermediate (Apple
 * Worldwide Developer Relations), and Apple Root CA - G3. Trusting the chain
 * means checking it ourselves against a pinned copy of that root — the copy
 * in the header proves nothing, anyone can paste it. This follows what
 * Apple's own `app-store-server-library` does (SignedDataVerifier), with
 * node:crypto instead of a dependency:
 *
 *   1. header alg is ES256 and x5c has the leaf and the intermediate;
 *   2. the intermediate was issued and signed by the pinned root, and is a CA;
 *   3. the leaf was issued and signed by the intermediate;
 *   4. the leaf carries Apple's App Store receipt-signing marker OID and the
 *      intermediate the WWDR marker OID — without this, any developer
 *      certificate issued under the same root could sign a fake purchase;
 *   5. every certificate is valid at the payload's `signedDate`;
 *   6. the JWS signature verifies with the leaf's key.
 *
 * Online revocation (OCSP) is not checked, as in Apple's library with
 * online checks off.
 */

/** Apple Root CA - G3, from https://www.apple.com/certificateauthority/ (also in macOS's system roots). */
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/** Its published SHA-256 fingerprint. Checked at load so a corrupted paste fails loudly. */
export const APPLE_ROOT_CA_G3_SHA256 =
  "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";

export const BUNDLE_ID = "com.shivvyas.astra";

/** The Astrya Plus products, in the "Astrya Plus" subscription group. Keep in step with PlusProducts.swift and Astrya.storekit. */
export const PLUS_PRODUCT_IDS = [
  "com.shivvyas.astra.plus.monthly",
  "com.shivvyas.astra.plus.yearly",
] as const;

// DER-encoded OBJECT IDENTIFIER values of the extensions Apple's library checks for.
/** 1.2.840.113635.100.6.11.1 — Mac App Store receipt signing; on the leaf. */
const LEAF_MARKER_OID = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01]);
/** 1.2.840.113635.100.6.2.1 — Apple WWDR intermediate; on the intermediate. */
const INTERMEDIATE_MARKER_OID = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01]);

type Tlv = { tag: number; start: number; end: number; next: number };

/** Reads one DER tag-length-value at `offset`. */
function readTlv(buf: Buffer, offset: number): Tlv {
  if (offset + 2 > buf.length) throw new Error("truncated DER");
  const tag = buf[offset];
  let len = buf[offset + 1];
  let start = offset + 2;
  if (len & 0x80) {
    const bytes = len & 0x7f;
    if (bytes === 0 || bytes > 4 || start + bytes > buf.length) throw new Error("bad DER length");
    len = 0;
    for (let i = 0; i < bytes; i++) len = len * 256 + buf[start + i];
    start += bytes;
  }
  const end = start + len;
  if (end > buf.length) throw new Error("truncated DER");
  return { tag, start, end, next: end };
}

/** The OIDs of a certificate's X.509v3 extensions (TBSCertificate [3]). */
export function extensionOids(cert: X509Certificate): Buffer[] {
  const der = cert.raw;
  const certificate = readTlv(der, 0);
  const tbs = readTlv(der, certificate.start);
  const oids: Buffer[] = [];
  for (let at = tbs.start; at < tbs.end; ) {
    const field = readTlv(der, at);
    if (field.tag === 0xa3) {
      const list = readTlv(der, field.start);
      for (let e = list.start; e < list.end; ) {
        const ext = readTlv(der, e);
        const oid = readTlv(der, ext.start);
        if (oid.tag === 0x06) oids.push(der.subarray(oid.start, oid.end));
        e = ext.next;
      }
    }
    at = field.next;
  }
  return oids;
}

function hasExtension(cert: X509Certificate, oid: Buffer): boolean {
  try {
    return extensionOids(cert).some((o) => o.equals(oid));
  } catch {
    return false;
  }
}

export class AppleJwsError extends Error {
  constructor(public readonly reason: string) {
    super(`Apple JWS rejected: ${reason}`);
    this.name = "AppleJwsError";
  }
}

let pinnedRoot: X509Certificate | null = null;

/** The production trust anchor. Throws if the embedded certificate is not the one Apple publishes. */
export function appleRootCertificate(): X509Certificate {
  if (pinnedRoot) return pinnedRoot;
  const cert = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  if (cert.fingerprint256 !== APPLE_ROOT_CA_G3_SHA256) {
    throw new Error("Embedded Apple Root CA - G3 does not match its pinned fingerprint");
  }
  pinnedRoot = cert;
  return cert;
}

export type VerifyOptions = {
  /**
   * Trust anchors. Production callers never pass this: the default is the
   * pinned Apple Root CA - G3. Tests inject a self-signed test root here.
   */
  roots?: X509Certificate[];
  /** Used when the payload has no `signedDate`. Defaults to now. */
  now?: Date;
};

function b64urlToBuffer(part: string): Buffer {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function parseJson(part: string, what: string): Record<string, unknown> {
  try {
    const value = JSON.parse(b64urlToBuffer(part).toString("utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new AppleJwsError(`malformed ${what}`);
}

function validAt(cert: X509Certificate, at: Date): boolean {
  const from = new Date(cert.validFrom).getTime();
  const to = new Date(cert.validTo).getTime();
  const t = at.getTime();
  return Number.isFinite(from) && Number.isFinite(to) && t >= from && t <= to;
}

function sameCert(a: X509Certificate, b: X509Certificate): boolean {
  return createHash("sha256").update(a.raw).digest().equals(createHash("sha256").update(b.raw).digest());
}

/** Verifies an App Store JWS and returns its decoded payload. Throws AppleJwsError. */
export function verifyAppleJws<T = Record<string, unknown>>(jws: string, options: VerifyOptions = {}): T {
  if (typeof jws !== "string") throw new AppleJwsError("not a string");
  const parts = jws.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) throw new AppleJwsError("not a compact JWS");
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = parseJson(headerPart, "header");
  if (header.alg !== "ES256") throw new AppleJwsError("unexpected alg");
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.length > 3 || !x5c.every((c) => typeof c === "string")) {
    throw new AppleJwsError("missing certificate chain");
  }

  let leaf: X509Certificate;
  let intermediate: X509Certificate;
  let presentedRoot: X509Certificate | null = null;
  try {
    leaf = new X509Certificate(Buffer.from(x5c[0] as string, "base64"));
    intermediate = new X509Certificate(Buffer.from(x5c[1] as string, "base64"));
    if (x5c.length === 3) presentedRoot = new X509Certificate(Buffer.from(x5c[2] as string, "base64"));
  } catch {
    throw new AppleJwsError("unparseable certificate");
  }

  const roots = options.roots ?? [appleRootCertificate()];
  const root = roots.find((r) => intermediate.checkIssued(r) && intermediate.verify(r.publicKey));
  if (!root) throw new AppleJwsError("chain does not end at a trusted root");
  // If the header carries a root, it must be the trusted one itself.
  if (presentedRoot && !sameCert(presentedRoot, root)) throw new AppleJwsError("presented root is not trusted");
  if (!intermediate.ca) throw new AppleJwsError("intermediate is not a CA");
  if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) {
    throw new AppleJwsError("leaf not issued by intermediate");
  }
  if (!hasExtension(leaf, LEAF_MARKER_OID)) throw new AppleJwsError("leaf is not an App Store signing certificate");
  if (!hasExtension(intermediate, INTERMEDIATE_MARKER_OID)) throw new AppleJwsError("intermediate is not Apple WWDR");

  const payload = parseJson(payloadPart, "payload");
  const signedDate = typeof payload.signedDate === "number" ? new Date(payload.signedDate) : (options.now ?? new Date());
  for (const [name, cert] of [["leaf", leaf], ["intermediate", intermediate], ["root", root]] as const) {
    if (!validAt(cert, signedDate)) throw new AppleJwsError(`${name} certificate not valid at signing date`);
  }

  const signature = b64urlToBuffer(signaturePart);
  if (signature.length !== 64) throw new AppleJwsError("bad signature length");
  const ok = verifySignature(
    "sha256",
    Buffer.from(`${headerPart}.${payloadPart}`, "ascii"),
    { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
    signature,
  );
  if (!ok) throw new AppleJwsError("bad signature");
  return payload as T;
}

// MARK: - Transactions

/** The fields of JWSTransactionDecodedPayload this app uses. */
export type AppleTransactionPayload = {
  bundleId?: string;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  expiresDate?: number;
  revocationDate?: number;
  environment?: string;
  appAccountToken?: string;
  type?: string;
  signedDate?: number;
};

export type AppleEnvironment = "Sandbox" | "Production";

export type VerifiedTransaction = {
  productId: (typeof PLUS_PRODUCT_IDS)[number];
  transactionId: string;
  originalTransactionId: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  environment: AppleEnvironment;
  /** The UUID the app attached at purchase (the Supabase user id), when present. */
  appAccountToken: string | null;
};

/**
 * Verifies a signed transaction and checks it is an Astrya Plus purchase for
 * this app. An expired or revoked subscription still verifies — it is a true
 * statement about the past — and maps to that status in `statusOf`.
 */
export function verifyTransaction(jws: string, options: VerifyOptions = {}): VerifiedTransaction {
  const p = verifyAppleJws<AppleTransactionPayload>(jws, options);
  if (p.bundleId !== BUNDLE_ID) throw new AppleJwsError("wrong bundle id");
  if (!PLUS_PRODUCT_IDS.includes(p.productId as (typeof PLUS_PRODUCT_IDS)[number])) {
    throw new AppleJwsError("unknown product");
  }
  if (p.environment !== "Sandbox" && p.environment !== "Production") throw new AppleJwsError("unsupported environment");
  if (!p.originalTransactionId || !p.transactionId) throw new AppleJwsError("missing transaction id");
  return {
    productId: p.productId as (typeof PLUS_PRODUCT_IDS)[number],
    transactionId: String(p.transactionId),
    originalTransactionId: String(p.originalTransactionId),
    expiresAt: typeof p.expiresDate === "number" ? new Date(p.expiresDate) : null,
    revokedAt: typeof p.revocationDate === "number" ? new Date(p.revocationDate) : null,
    environment: p.environment,
    appAccountToken: typeof p.appAccountToken === "string" ? p.appAccountToken.toLowerCase() : null,
  };
}

export type SubscriptionStatus = "active" | "grace" | "expired" | "revoked";

/** What a verified transaction says about the subscription right now. */
export function statusOf(tx: Pick<VerifiedTransaction, "expiresAt" | "revokedAt">, now = new Date()): SubscriptionStatus {
  if (tx.revokedAt) return "revoked";
  if (!tx.expiresAt || tx.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}
