import { createId } from "@paralleldrive/cuid2";

export function newId(): string {
  return createId();
}

export const DEFAULT_ORG_ID = "default";
