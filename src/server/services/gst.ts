import { paise, type Paise } from "@/server/lib/money";

export type TaxMode = "INTRA" | "INTER";

export type TaxLine = {
  amountPaise: number;
  /** Defaults to true. Untaxed lines add to the subtotal but carry no GST. */
  taxable?: boolean;
};

export type TaxInput = {
  items: TaxLine[];
  /** State code of the issuing org (e.g. "22"). */
  orgState: string;
  /** State code of the place of supply (client state). Empty means same as org. */
  placeOfSupply: string;
  /** False means B2C: tax is charged on the org's own state. */
  hasGstin: boolean;
  /** Combined GST rate in basis points. Default 1800 = 18%. */
  rateBps?: number;
};

export type TaxResult = {
  mode: TaxMode;
  subtotal: Paise;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  /** total - (subtotal + taxes). Can be negative. Shown as a visible line. */
  roundOff: Paise;
  /** Rounded to the nearest whole rupee. */
  total: Paise;
};

export const DEFAULT_GST_BPS = 1800;

/** Round-half-up for non-negative integers: round(amount * bps / 10000). */
function percentOf(amountPaise: number, bps: number): number {
  return Math.floor((amountPaise * bps + 5000) / 10000);
}

function normaliseState(value: string): string {
  return value.trim().toUpperCase();
}

export function resolveTaxMode(input: Pick<TaxInput, "orgState" | "placeOfSupply" | "hasGstin">): TaxMode {
  const org = normaliseState(input.orgState);
  const supply = normaliseState(input.placeOfSupply);

  if (!input.hasGstin || !supply || supply === org) {
    return "INTRA";
  }

  return "INTER";
}

/**
 * GST for B2B services. Tax is rounded per line to the paisa, then the invoice
 * total is rounded to the nearest rupee with an explicit round-off.
 * The CA must confirm rates, SAC codes and round-off rules before real use.
 */
export function computeTax(input: TaxInput): TaxResult {
  const rateBps = input.rateBps ?? DEFAULT_GST_BPS;
  const mode = resolveTaxMode(input);
  const halfBps = rateBps / 2;

  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  for (const line of input.items) {
    if (!Number.isSafeInteger(line.amountPaise) || line.amountPaise < 0) {
      throw new Error("Line amounts must be non-negative integer paise");
    }

    subtotal += line.amountPaise;

    if (line.taxable === false) {
      continue;
    }

    if (mode === "INTRA") {
      cgst += percentOf(line.amountPaise, halfBps);
      sgst += percentOf(line.amountPaise, halfBps);
    } else {
      igst += percentOf(line.amountPaise, rateBps);
    }
  }

  const raw = subtotal + cgst + sgst + igst;
  const total = Math.floor((raw + 50) / 100) * 100;

  return {
    mode,
    subtotal: paise(subtotal),
    cgst: paise(cgst),
    sgst: paise(sgst),
    igst: paise(igst),
    roundOff: paise(total - raw),
    total: paise(total),
  };
}
