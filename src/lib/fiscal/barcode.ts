/**
 * Code 128, set C: the barcode of the access key in the DANFE. Set C packs two
 * digits per symbol, so the 44 digits become 22 symbols between the start, the
 * check symbol and the stop. Each symbol is six widths (bar, space, bar…); the
 * stop has seven.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const;
const START_C = 105;
const STOP = 106;

/** The symbols of an even string of digits: start C, the pairs, the check symbol (modulus 103) and the stop. */
export function code128cSymbols(digits: string): number[] {
  if (!/^(\d\d)+$/.test(digits)) throw new Error("O código de barras C leva um número par de dígitos.");
  const pairs = digits.match(/\d\d/g)!.map(Number);
  const check = pairs.reduce((sum, value, index) => sum + value * (index + 1), START_C) % 103;
  return [START_C, ...pairs, check, STOP];
}

/** The bars as widths in modules, starting with a bar and alternating with spaces. */
export function code128cWidths(digits: string): number[] {
  return code128cSymbols(digits).flatMap((symbol) => [...PATTERNS[symbol]].map(Number));
}
