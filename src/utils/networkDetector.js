import { NETWORKS, EVM_CHAIN_LIST } from "./chains";

const HEX_RE = /^(?:0x)?[0-9a-fA-F]+$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractNearAccountId(text) {
  const match = text.match(/\b([a-z0-9_-]+\.near)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function classifyHash(value) {
  if (!value) return { kind: "unknown", label: "Empty", confidence: 0 };

  if (HEX_RE.test(value) && value.length === 66 && value.startsWith("0x")) {
    return { kind: "evm", label: "EVM tx hash", confidence: 0.98 };
  }

  if (HEX_RE.test(value) && value.length === 64 && !value.startsWith("0x")) {
    return { kind: "bitcoin", label: "Bitcoin txid", confidence: 0.94 };
  }

  if (BASE58_RE.test(value) && (value.length === 87 || value.length === 88)) {
    return { kind: "solana", label: "Solana signature", confidence: 0.92 };
  }

  if (BASE58_RE.test(value) && (value.length === 43 || value.length === 44)) {
    return { kind: "near", label: "NEAR tx hash", confidence: 0.9 };
  }

  if (BASE58_RE.test(value) && value.length >= 32 && value.length <= 96) {
    return { kind: "unknown_base58", label: "Base58 candidate", confidence: 0.55 };
  }

  if (HEX_RE.test(value) && value.length >= 32) {
    return { kind: "unknown_hex", label: "Hex candidate", confidence: 0.5 };
  }

  return { kind: "unknown", label: "Unknown", confidence: 0 };
}

function keywordScore(text, keywords = []) {
  const lower = text.toLowerCase();
  return keywords.reduce((score, keyword) => {
    if (lower.includes(keyword)) return score + 1;
    return score;
  }, 0);
}

function pickEvmChain(text) {
  let best = null;
  for (const chain of EVM_CHAIN_LIST) {
    const score = keywordScore(text, chain.keywords);
    if (!best || score > best.score) {
      best = { chain, score };
    }
  }
  return best;
}

export function detectNetworkFromText(text, txHash, extra = {}) {
  const source = normalize(text);
  const hashClass = classifyHash(txHash);
  const nearAccountId = extra.senderAccountId || extractNearAccountId(source);
  const evmChainGuess = pickEvmChain(source);

  if (hashClass.kind === "evm") {
    if (evmChainGuess?.score > 0) {
      return {
        id: evmChainGuess.chain.id,
        label: evmChainGuess.chain.label,
        kind: "evm",
        chainName: evmChainGuess.chain.chainName,
        explorerUrl: evmChainGuess.chain.explorerUrl,
        nativeSymbol: evmChainGuess.chain.nativeSymbol,
        confidence: Math.min(0.99, 0.7 + evmChainGuess.score * 0.08),
        reason: `0x-prefixed 66-character hash with context hint: ${evmChainGuess.chain.label}.`,
      };
    }

    return {
      id: "evm",
      label: NETWORKS.evm.label,
      kind: "evm",
      chainName: null,
      explorerUrl: null,
      nativeSymbol: "ETH",
      confidence: 0.72,
      reason: "0x-prefixed 66-character transaction hash. No specific chain keyword found, so probing EVM networks.",
    };
  }

  if (hashClass.kind === "bitcoin") {
    const confidence = keywordScore(source, NETWORKS.bitcoin.keywords) > 0 ? 0.96 : 0.9;
    return {
      id: "bitcoin",
      label: NETWORKS.bitcoin.label,
      kind: "bitcoin",
      explorerUrl: NETWORKS.bitcoin.explorerUrl,
      nativeSymbol: NETWORKS.bitcoin.nativeSymbol,
      confidence,
      reason: "64-character hex txid without 0x prefix.",
    };
  }

  if (hashClass.kind === "solana") {
    const confidence = keywordScore(source, NETWORKS.solana.keywords) > 0 ? 0.96 : 0.9;
    return {
      id: "solana",
      label: NETWORKS.solana.label,
      kind: "solana",
      explorerUrl: NETWORKS.solana.explorerUrl,
      nativeSymbol: NETWORKS.solana.nativeSymbol,
      confidence,
      reason: "Base58 signature with 87-88 characters.",
    };
  }

  if (hashClass.kind === "near") {
    const confidence = keywordScore(source, NETWORKS.near.keywords) > 0 ? 0.95 : 0.88;
    return {
      id: "near",
      label: NETWORKS.near.label,
      kind: "near",
      explorerUrl: NETWORKS.near.explorerUrl,
      nativeSymbol: NETWORKS.near.nativeSymbol,
      senderAccountId: nearAccountId,
      confidence,
      reason: "Base58 signature with 43-44 characters.",
    };
  }

  if (hashClass.kind === "unknown_base58") {
    return {
      id: "unknown",
      label: "Unrecognized base58 network",
      kind: "unknown",
      explorerUrl: null,
      nativeSymbol: null,
      confidence: hashClass.confidence,
      reason: "The extracted value looks like a base58 transaction-like string but does not match Solana or NEAR lengths.",
    };
  }

  if (hashClass.kind === "unknown_hex") {
    return {
      id: "unknown",
      label: "Unrecognized hex network",
      kind: "unknown",
      explorerUrl: null,
      nativeSymbol: null,
      confidence: hashClass.confidence,
      reason: "The extracted value is a hex string but does not match the supported formats.",
    };
  }

  return {
    id: "unknown",
    label: "Unknown network",
    kind: "unknown",
    explorerUrl: null,
    nativeSymbol: null,
    confidence: 0,
    reason: "No supported transaction hash format found.",
  };
}
