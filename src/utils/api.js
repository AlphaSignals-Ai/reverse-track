import { NETWORKS } from "./chains";
import { formatCurrency, isPlaceholderKey } from "./format";

const MULTI_CHAIN_API_KEY = "YOUR_MULTI_CHAIN_API_KEY"; // ضع مفتاح Moralis أو Tatum الخاص بك هنا لاحقاً

async function jsonRpc(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC error: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "RPC returned an error");
  return data.result;
}

async function resolveBitcoinTransaction(txHash) {
  // Using mempool.space free public API for Bitcoin
  const url = `https://mempool.space/api/tx/${txHash}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Bitcoin transaction not found.");
  const tx = await response.json();
  
  const sender = tx.vin[0]?.prevout?.scriptpubkey_address || "Unknown";
  const receiver = tx.vout[0]?.scriptpubkey_address || "Unknown";
  const amount = tx.vout[0]?.value ? tx.vout[0].value / 1e8 : 0;

  return {
    networkId: "bitcoin",
    networkLabel: NETWORKS.bitcoin.label,
    chainName: "mainnet",
    explorerUrl: `${NETWORKS.bitcoin.explorerUrl}${txHash}`,
    sender,
    receiver,
    amount: formatCurrency(amount, "BTC"),
    amountRaw: amount,
    nativeSymbol: "BTC",
    status: tx.status.confirmed ? "Success" : "Pending",
    confirmations: null,
    blockNumber: tx.status.block_height || null,
    source: "mempool.space API",
    raw: tx,
  };
}

async function resolveSolanaTransaction(txHash) {
  const url = NETWORKS.solana.rpcUrls[0];
  const response = await jsonRpc(url, "getTransaction", [
    txHash,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);

  if (!response) throw new Error("Solana transaction not found.");

  const meta = response?.meta || {};
  const nativeDeltaLamports = (meta.preBalances?.[0] ?? 0) - (meta.postBalances?.[0] ?? 0);
  const nativeAmount = Math.abs(nativeDeltaLamports) / 1e9;
  
  const accountKeys = response.transaction?.message?.accountKeys || [];
  let receiver = accountKeys[1]?.pubkey || accountKeys[1]?.address || "-";
  const signer = accountKeys.find(k => k.signer);

  const sender = signer?.pubkey || signer?.address || accountKeys[0]?.pubkey || "-";
  const status = meta.err ? "Failed" : "Success";

  return {
    networkId: "solana",
    networkLabel: NETWORKS.solana.label,
    chainName: "mainnet-beta",
    explorerUrl: `${NETWORKS.solana.explorerUrl}${txHash}`,
    sender,
    receiver,
    amount: formatCurrency(nativeAmount, "SOL"),
    amountRaw: nativeAmount,
    nativeSymbol: "SOL",
    status,
    confirmations: null,
    blockNumber: response.slot ?? null,
    source: "solana-rpc",
    raw: response,
  };
}

async function resolveNearTransaction(txHash, senderAccountId) {
  if (!senderAccountId) {
    senderAccountId = "system"; // Fallback dummy account to attempt fetch
  }

  const url = NETWORKS.near.rpcUrls[0];
  const response = await jsonRpc(url, "tx", [txHash, senderAccountId]);
  const tx = response?.transaction;
  const status = response?.status?.Failure ? "Failed" : "Success";
  const actions = tx?.actions || [];

  let amountYocto = 0n;
  for (const action of actions) {
    if (action?.Transfer?.deposit) {
      amountYocto += BigInt(action.Transfer.deposit);
    }
  }

  const amount = Number(amountYocto) / 10 ** 24;
  return {
    networkId: "near",
    networkLabel: NETWORKS.near.label,
    chainName: "mainnet",
    explorerUrl: `${NETWORKS.near.explorerUrl}${txHash}`,
    sender: tx?.signer_id || senderAccountId,
    receiver: tx?.receiver_id || "-",
    amount: formatCurrency(amount, "NEAR"),
    amountRaw: amount,
    nativeSymbol: "NEAR",
    status,
    confirmations: null,
    blockNumber: response?.transaction_outcome?.block_hash || null,
    source: "near-rpc",
    raw: response,
  };
}

async function resolveEvmFromRpc(txHash, preferredChain) {
  // If a specific EVM chain is detected, use it, otherwise default to Ethereum
  const chain = preferredChain || NETWORKS.ethereum;
  const rpcUrl = chain.rpcUrls[0];
  
  const tx = await jsonRpc(rpcUrl, "eth_getTransactionByHash", [txHash]);
  if (!tx) throw new Error("Transaction not found on the detected EVM RPC.");

  const receipt = await jsonRpc(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  const status = receipt ? (receipt.status === "0x1" ? "Success" : "Failed") : "Pending";
  const amount = parseInt(tx.value, 16) / 1e18;

  return {
    networkId: chain.id,
    networkLabel: chain.label,
    chainName: chain.chainName,
    explorerUrl: `${chain.explorerUrl}${txHash}`,
    sender: tx.from,
    receiver: tx.to || "Contract Creation",
    amount: formatCurrency(amount, chain.nativeSymbol),
    amountRaw: amount,
    nativeSymbol: chain.nativeSymbol,
    status,
    confirmations: null,
    blockNumber: tx.blockNumber ? parseInt(tx.blockNumber, 16) : null,
    source: "public-rpc",
    raw: { tx, receipt },
  };
}

export async function resolveTransaction({ txHash, network, senderAccountId = null }) {
  if (!txHash) throw new Error("Transaction hash is missing.");

  const normalizedNetwork = network?.kind || "unknown";
  const preferredChain = network?.id && NETWORKS[network.id]?.kind === "evm" ? NETWORKS[network.id] : null;

  if (normalizedNetwork === "bitcoin") return resolveBitcoinTransaction(txHash);
  if (normalizedNetwork === "solana") return resolveSolanaTransaction(txHash);
  if (normalizedNetwork === "near") return resolveNearTransaction(txHash, senderAccountId || network?.senderAccountId);
  if (normalizedNetwork === "evm") return resolveEvmFromRpc(txHash, preferredChain);

  throw new Error("Network not supported or not confidently detected.");
}
