import { describe, expect, it } from "vitest";
import {
  decodeNdefMessage,
  encodeNdefMessage,
  type2TlvSize,
  unwrapType2Ndef,
  wrapType2Ndef,
} from "@windels/shared/nfc";

describe("NDEF codec", () => {
  it("round-trips multiple URI, text, vCard and custom records", () => {
    const encoded = encodeNdefMessage([
      { kind: "url", value: "https://www.windels.ai/profile/john", language: "en" },
      { kind: "text", value: "Hello NFC", language: "en" },
      { kind: "vcard", value: "BEGIN:VCARD\nVERSION:3.0\nFN:John\nEND:VCARD", language: "en" },
      { kind: "custom", tnf: 4, type: "ai.windels:sample", payloadBase64: "AQID", language: "en" },
    ]);
    const decoded = decodeNdefMessage(encoded);
    expect(decoded.map((record) => record.kind)).toEqual(["url", "text", "vcard", "custom"]);
    expect(decoded[0]?.value).toBe("https://www.windels.ai/profile/john");
    expect(decoded[1]).toMatchObject({ value: "Hello NFC", language: "en" });
    expect(decoded[3]).toMatchObject({ tnf: 4, type: "ai.windels:sample", payloadBase64: "AQID" });
  });

  it("wraps and extracts an NFC Forum Type 2 NDEF TLV", () => {
    const message = encodeNdefMessage([{ kind: "url", value: "https://windels.ai", language: "en" }]);
    const tlv = wrapType2Ndef(message);
    expect(tlv.byteLength).toBe(type2TlvSize(message.byteLength));
    expect(unwrapType2Ndef(tlv)).toEqual(message);
  });

  it("uses the extended Type 2 TLV length for messages at least 255 bytes", () => {
    const message = encodeNdefMessage([{ kind: "text", value: "x".repeat(300), language: "en" }]);
    const tlv = wrapType2Ndef(message);
    expect(tlv[1]).toBe(0xff);
    expect(unwrapType2Ndef(tlv)).toEqual(message);
  });

  it("rejects malformed boundaries and chunked records", () => {
    expect(() => decodeNdefMessage(Uint8Array.of(0x11, 0x01, 0x00, 0x54))).toThrow(/message-begin/i);
    expect(() => decodeNdefMessage(Uint8Array.of(0xf1, 0x01, 0x00, 0x54))).toThrow(/chunked/i);
    expect(() => unwrapType2Ndef(Uint8Array.of(0x03, 0x08, 0x01))).toThrow(/exceeds/i);
  });

  it("encodes Wi-Fi WSC without exposing its password in decoded display values", () => {
    const encoded = encodeNdefMessage([{
      kind: "wifi",
      value: "Office WiFi",
      language: "en",
      metadata: { ssid: "Office WiFi", password: "not-for-display", authentication: "WPA2_PERSONAL", encryption: "AES" },
    }]);
    const decoded = decodeNdefMessage(encoded);
    expect(decoded[0]).toMatchObject({ kind: "wifi", type: "application/vnd.wfa.wsc", value: "Wi-Fi credential (protected display)" });
    expect(JSON.stringify(decoded[0])).not.toContain("not-for-display");
  });
});
