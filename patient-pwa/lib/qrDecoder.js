/**
 * Decode the Hidden QR payload.
 *
 * The Hidden QR URL looks like:
 * http://localhost:3001/verify?data=BASE64PAYLOAD
 *
 * The BASE64PAYLOAD decodes to JSON:
 * { secret: "0x...", batchId: "COMP-A-B1", leafIndex: 0 }
 *
 * This runs entirely in the browser.
 *
 * @param {string} base64 - The `data` query parameter from the URL
 * @returns {{ secret: string, batchId: string, leafIndex: number }}
 */
export function decodeHiddenPayload(base64) {
  try {
    const json = atob(base64); // Browser-native base64 decode
    return JSON.parse(json);
  } catch {
    throw new Error("Invalid QR code payload. This QR may be corrupted or fake.");
  }
}

/**
 * Extract the `data` parameter from the current page URL.
 * Called on the /verify page after the consumer scans the Hidden QR.
 *
 * @returns {string | null}
 */
export function extractPayloadFromURL() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("data");
}

/**
 * Extract the `drugId` parameter from the current page URL.
 * Called on the /track page after the consumer scans the Public QR.
 *
 * @returns {string | null}
 */
export function extractDrugIdFromURL() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("drugId");
}