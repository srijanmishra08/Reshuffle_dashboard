/** Money is always integer paise. Never store or add floats. */
export type Paise = number & { readonly __brand: "Paise" };

export function paise(value: number): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Paise must be a safe integer, got ${value}`);
  }
  return value as Paise;
}

/** Parse a rupee amount ("1234.50", 1234.5) to paise without float drift. */
export function toPaise(rupees: string | number): Paise {
  const text = typeof rupees === "number" ? rupees.toFixed(2) : rupees.trim().replace(/,/g, "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);

  if (!match) {
    throw new Error(`Invalid rupee amount: ${String(rupees)}`);
  }

  const [, sign, whole, fraction = ""] = match;
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return paise(sign === "-" ? -value : value);
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display only. Example: 12345650 -> "₹1,23,456.50". */
export function formatINR(amount: Paise | number): string {
  return inr.format(Number(amount) / 100);
}

const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) {
    return ones[n];
  }
  return [tens[Math.floor(n / 10)], ones[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ones[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** Indian numbering: crore, lakh, thousand. */
export function numberToWordsIndian(n: number): string {
  if (n === 0) {
    return "Zero";
  }

  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** "Rupees One Lakh Only", "Rupees Twelve Crore ... and Fifty Paise Only". */
export function amountInWords(amount: Paise | number): string {
  const total = Number(amount);

  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("amountInWords expects a non-negative integer number of paise");
  }

  const rupees = Math.floor(total / 100);
  const paisePart = total % 100;
  const rupeeWords = `Rupees ${numberToWordsIndian(rupees)}`;

  return paisePart
    ? `${rupeeWords} and ${numberToWordsIndian(paisePart)} Paise Only`
    : `${rupeeWords} Only`;
}
