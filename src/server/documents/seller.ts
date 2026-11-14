import type { SnapshotSeller } from "./types";

type OrgLike = {
  legalName: string;
  address: string;
  stateCode: string;
  gstin: string;
  pan?: string | null;
  bankDetails?: Record<string, string> | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
};

/** One place that freezes the issuing organisation into a document snapshot. */
export function sellerSnapshot(org: OrgLike): SnapshotSeller {
  return {
    legalName: org.legalName,
    address: org.address,
    stateCode: org.stateCode,
    gstin: org.gstin,
    pan: org.pan || undefined,
    bankDetails: org.bankDetails ?? undefined,
    signatoryName: org.signatoryName || undefined,
    signatoryTitle: org.signatoryTitle || undefined,
    phone: org.phone || undefined,
    email: org.email || undefined,
    website: org.website || undefined,
  };
}
