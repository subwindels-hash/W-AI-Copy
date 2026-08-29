import { api } from "../api";

/**
 * Thin wrapper over the WebAuthn PublicKeyCredential API for platform authenticators
 * (Touch ID / Face ID / Android Biometric Prompt / Windows Hello) used by the
 * mobile app shell. Desktop browsers also support this, which is a nice bonus.
 */
function bufToB64u(buf: ArrayBuffer | Uint8Array): string {
  let src: Uint8Array;
  if (buf instanceof Uint8Array) {
    src = buf;
  } else {
    src = new Uint8Array(buf);
  }
  const len = src.length;
  const bytes = new Uint8Array(new ArrayBuffer(len));
  bytes.set(src);
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uToBuf(s: string): ArrayBuffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  const binary = atob(s);
  const len: number = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer.slice(0) as ArrayBuffer;
}

function publicKeyFromOpts(opts: any): PublicKeyCredentialCreationOptions {
  return {
    ...opts,
    challenge: b64uToBuf(opts.challenge),
    user: { ...opts.user, id: b64uToBuf(opts.user.id) },
    excludeCredentials: (opts.excludeCredentials ?? []).map((c: any) => ({ ...c, id: b64uToBuf(c.id) })),
  };
}
function publicKeyFromAssertion(opts: any): PublicKeyCredentialRequestOptions {
  return {
    ...opts,
    challenge: b64uToBuf(opts.challenge),
    allowCredentials: (opts.allowCredentials ?? []).map((c: any) => ({ ...c, id: b64uToBuf(c.id) })),
  };
}

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    return typeof window !== "undefined" &&
      "PublicKeyCredential" in window &&
      // @ts-ignore
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function" &&
      // @ts-ignore
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) === true;
  } catch { return false; }
}

export async function registerBiometric(deviceId: string): Promise<{ ok: true }> {
  const rpId = window.location.hostname || "localhost";
  const opts = await api.post<{ challenge: string; rp: { name: string; id: string }; user: { id: string; name: string; displayName: string }; pubKeyCredParams: any }>("/mobile/biometric/register-challenge", {});
  const cred = (await navigator.credentials.create({ publicKey: publicKeyFromOpts({ ...opts, rpId }) })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometric registration cancelled");
  const att = (cred as any).response as AuthenticatorAttestationResponse;
  const transports = (att as any).getTransports?.() ?? [];
  return api.post("/mobile/biometric/register-verify", {
    deviceId,
    rpId,
    id: cred.id,
    rawId: bufToB64u(cred.rawId),
    type: cred.type,
    transports,
    response: {
      clientDataJSON: bufToB64u(att.clientDataJSON),
      attestationObject: bufToB64u(att.attestationObject),
    },
  });
}

export async function verifyBiometric(): Promise<{ ok: true }> {
  const rpId = window.location.hostname || "localhost";
  const opts = await api.post<{ challenge: string; rpId: string; allowCredentials: any[] }>("/mobile/biometric/auth-challenge", {});
  const assertion = (await navigator.credentials.get({ publicKey: publicKeyFromAssertion({ ...opts, rpId }) })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("Biometric verification cancelled");
  const ar = assertion.response as AuthenticatorAssertionResponse;
  return api.post("/mobile/biometric/auth-verify", {
    rpId,
    id: assertion.id,
    rawId: bufToB64u(assertion.rawId),
    type: assertion.type,
    response: {
      clientDataJSON: bufToB64u(ar.clientDataJSON),
      authenticatorData: bufToB64u(ar.authenticatorData),
      signature: bufToB64u(ar.signature),
      userHandle: ar.userHandle ? bufToB64u(ar.userHandle) : undefined,
    },
  });
}
