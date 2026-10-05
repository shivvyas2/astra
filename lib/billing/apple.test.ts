import { describe, it, expect } from "vitest";
import { X509Certificate, createPrivateKey, sign } from "node:crypto";
import {
  APPLE_ROOT_CA_G3_SHA256,
  AppleJwsError,
  appleRootCertificate,
  extensionOids,
  statusOf,
  verifyAppleJws,
  verifyTransaction,
} from "./apple";
import { notificationOverride } from "./notifications";
import * as fx from "./__fixtures__/testChain";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const der = (pem: string) => new X509Certificate(pem).raw.toString("base64");

const testRoot = new X509Certificate(fx.rootPem);
const roots = [testRoot];

/** Signs `payload` as Apple would: ES256 over header.payload, chain in x5c. */
function jws(payload: object, opts: { chain?: string[]; key?: string; alg?: string } = {}): string {
  const chain = opts.chain ?? [der(fx.leafPem), der(fx.interPem), der(fx.rootPem)];
  const header = b64url(JSON.stringify({ alg: opts.alg ?? "ES256", x5c: chain }));
  const body = b64url(JSON.stringify(payload));
  const signature = sign("sha256", Buffer.from(`${header}.${body}`), {
    key: createPrivateKey(opts.key ?? fx.leafKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${body}.${b64url(signature)}`;
}

const NOW = Date.parse("2026-10-05T12:00:00Z");
const DAY = 86_400_000;

function txPayload(over: Record<string, unknown> = {}) {
  return {
    bundleId: "com.shivvyas.astra",
    productId: "com.shivvyas.astra.plus.monthly",
    transactionId: "2000000111",
    originalTransactionId: "2000000100",
    expiresDate: NOW + 30 * DAY,
    environment: "Sandbox",
    signedDate: NOW,
    type: "Auto-Renewable Subscription",
    ...over,
  };
}

function reason(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppleJwsError) return err.reason;
    throw err;
  }
  return "accepted";
}

describe("pinned Apple root", () => {
  it("is Apple Root CA - G3 with the published fingerprint", () => {
    const root = appleRootCertificate();
    expect(root.subject).toContain("Apple Root CA - G3");
    expect(root.fingerprint256).toBe(APPLE_ROOT_CA_G3_SHA256);
    expect(root.ca).toBe(true);
  });

  it("rejects the test chain when no roots are injected (production pinning)", () => {
    expect(reason(() => verifyAppleJws(jws(txPayload())))).toBe("chain does not end at a trusted root");
  });
});

describe("verifyAppleJws", () => {
  it("accepts a correctly signed JWS chained to the trusted root", () => {
    const payload = verifyAppleJws<{ productId: string }>(jws(txPayload()), { roots });
    expect(payload.productId).toBe("com.shivvyas.astra.plus.monthly");
  });

  it("accepts a chain without the root certificate in x5c", () => {
    const token = jws(txPayload(), { chain: [der(fx.leafPem), der(fx.interPem)] });
    expect(reason(() => verifyAppleJws(token, { roots }))).toBe("accepted");
  });

  it("rejects a chain to an untrusted root even with Apple's marker OIDs", () => {
    const token = jws(txPayload(), {
      chain: [der(fx.rogueleafPem), der(fx.rogueinterPem), der(fx.roguerootPem)],
      key: fx.rogueleafKey,
    });
    expect(reason(() => verifyAppleJws(token, { roots }))).toBe("chain does not end at a trusted root");
  });

  it("rejects a header that presents a different root than the trusted one", () => {
    const token = jws(txPayload(), { chain: [der(fx.leafPem), der(fx.interPem), der(fx.roguerootPem)] });
    expect(reason(() => verifyAppleJws(token, { roots }))).toBe("presented root is not trusted");
  });

  it("rejects a leaf issued under the right intermediate without the App Store marker", () => {
    const token = jws(txPayload(), {
      chain: [der(fx.plainleafPem), der(fx.interPem), der(fx.rootPem)],
      key: fx.plainleafKey,
    });
    expect(reason(() => verifyAppleJws(token, { roots }))).toBe("leaf is not an App Store signing certificate");
  });

  it("rejects when the leaf and intermediate are swapped", () => {
    const token = jws(txPayload(), { chain: [der(fx.interPem), der(fx.leafPem), der(fx.rootPem)] });
    expect(reason(() => verifyAppleJws(token, { roots }))).toBe("chain does not end at a trusted root");
  });

  it("rejects a tampered payload", () => {
    const [h, , s] = jws(txPayload()).split(".");
    const forged = b64url(JSON.stringify(txPayload({ expiresDate: NOW + 3650 * DAY })));
    expect(reason(() => verifyAppleJws(`${h}.${forged}.${s}`, { roots }))).toBe("bad signature");
  });

  it("rejects a signature by a key other than the leaf's", () => {
    const token = jws(txPayload(), { key: fx.rogueleafKey });
    expect(reason(() => verifyAppleJws(token, { roots }))).toBe("bad signature");
  });

  it("rejects certificates outside their validity at the signing date", () => {
    const token = jws(txPayload({ signedDate: Date.parse("2041-01-01T00:00:00Z") }));
    expect(reason(() => verifyAppleJws(token, { roots }))).toBe("leaf certificate not valid at signing date");
  });

  it("rejects other algorithms and malformed input", () => {
    expect(reason(() => verifyAppleJws(jws(txPayload(), { alg: "none" }), { roots }))).toBe("unexpected alg");
    expect(reason(() => verifyAppleJws("abc.def", { roots }))).toBe("not a compact JWS");
    expect(reason(() => verifyAppleJws(`${b64url("{}")}.${b64url("{}")}.x`, { roots }))).toBe("unexpected alg");
  });

  it("reads extension OIDs from the certificate structure", () => {
    const oids = extensionOids(new X509Certificate(fx.leafPem)).map((o) => o.toString("hex"));
    expect(oids).toContain("2a864886f76364060b01");
  });
});

describe("verifyTransaction", () => {
  it("returns the purchase for this app's Plus products", () => {
    const tx = verifyTransaction(jws(txPayload({ appAccountToken: "AAAAAAAA-0000-4000-8000-000000000001" })), { roots });
    expect(tx).toMatchObject({
      productId: "com.shivvyas.astra.plus.monthly",
      originalTransactionId: "2000000100",
      environment: "Sandbox",
      appAccountToken: "aaaaaaaa-0000-4000-8000-000000000001",
      revokedAt: null,
    });
    expect(tx.expiresAt?.getTime()).toBe(NOW + 30 * DAY);
  });

  it("rejects another app's bundle id", () => {
    expect(reason(() => verifyTransaction(jws(txPayload({ bundleId: "com.example.other" })), { roots }))).toBe("wrong bundle id");
  });

  it("rejects a product that is not Astrya Plus", () => {
    expect(reason(() => verifyTransaction(jws(txPayload({ productId: "com.shivvyas.astra.coins" })), { roots }))).toBe(
      "unknown product",
    );
  });

  it("rejects Xcode local-testing transactions", () => {
    expect(reason(() => verifyTransaction(jws(txPayload({ environment: "Xcode" })), { roots }))).toBe(
      "unsupported environment",
    );
  });

  it("verifies an expired subscription, which maps to expired", () => {
    const tx = verifyTransaction(jws(txPayload({ expiresDate: NOW - DAY })), { roots });
    expect(statusOf(tx, new Date(NOW))).toBe("expired");
  });

  it("maps active and revoked", () => {
    const active = verifyTransaction(jws(txPayload()), { roots });
    expect(statusOf(active, new Date(NOW))).toBe("active");
    const refunded = verifyTransaction(jws(txPayload({ revocationDate: NOW - 1000 })), { roots });
    expect(statusOf(refunded, new Date(NOW))).toBe("revoked");
  });
});

describe("notificationOverride", () => {
  it("keeps Plus through a billing grace period", () => {
    const o = notificationOverride(
      { notificationType: "DID_FAIL_TO_RENEW", subtype: "GRACE_PERIOD" },
      { gracePeriodExpiresDate: NOW + 6 * DAY },
    );
    expect(o).toEqual({ status: "grace", expiresAt: new Date(NOW + 6 * DAY) });
  });

  it("ends on expiry and refund, and defers to the transaction otherwise", () => {
    expect(notificationOverride({ notificationType: "EXPIRED" }, null)).toEqual({ status: "expired" });
    expect(notificationOverride({ notificationType: "REFUND" }, null)).toEqual({ status: "revoked" });
    expect(notificationOverride({ notificationType: "DID_RENEW" }, null)).toBeUndefined();
  });
});
