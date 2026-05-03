import { SiweMessage } from "siwe";

export function buildSiweMessage(address, chainId) {
  const message = new SiweMessage({
    domain:    window.location.host,
    address,
    statement: "Sign in to the Pharma Anti-Counterfeit Supply Chain Portal",
    uri:       window.location.origin,
    version:   "1",
    chainId,
    nonce:     Math.random().toString(36).slice(2),
    issuedAt:  new Date().toISOString(),
  });
  return message.prepareMessage();
}