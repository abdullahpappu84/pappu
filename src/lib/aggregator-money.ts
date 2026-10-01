/** Aggregator uses the ISO-4217 minor-unit exponent. The existing wallet stores two decimal places. */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function aggregatorCurrencyExponent(currency: string) {
  const code = currency.toUpperCase();
  return THREE_DECIMAL.has(code) ? 3 : ZERO_DECIMAL.has(code) ? 0 : 2;
}

export function assertAggregatorWalletCurrency(currency: string) {
  if (aggregatorCurrencyExponent(currency) === 3) {
    throw new Error(`The existing wallet supports at most two decimal places; ${currency.toUpperCase()} cannot be used for Aggregator wallet sessions.`);
  }
}
