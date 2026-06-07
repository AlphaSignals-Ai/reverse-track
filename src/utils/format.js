export function shortHash(value, left = 8, right = 6) {
  if (!value) return "-";
  const text = String(value);
  if (text.length <= left + right + 3) return text;
  return `${text.slice(0, left)}...${text.slice(-right)}`;
}

export function shortAddress(value, left = 8, right = 6) {
  return shortHash(value, left, right);
}

export function formatNumber(value, maxDigits = 8) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  const abs = Math.abs(num);
  const digits = abs >= 1 ? 4 : maxDigits;
  return num.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

export function formatCurrency(value, symbol = "") {
  const formatted = formatNumber(value, 8);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

export function formatStatus(status) {
  if (!status) return "Unknown";
  return String(status)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function isPlaceholderKey(value) {
  return !value || String(value).includes("YOUR_MULTI_CHAIN_API_KEY");
}
