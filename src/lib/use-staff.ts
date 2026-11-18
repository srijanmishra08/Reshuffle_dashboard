"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type StaffMember = { id: string; name: string; email: string; role: string };

/** The team members a lead can be assigned to, and the id of the signed-in user. */
export function useStaff() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      api<{ currentUserId: string; staff: StaffMember[] }>("/api/staff")
        .then((r) => {
          setStaff(r.staff);
          setCurrentUserId(r.currentUserId);
        })
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  return { staff, currentUserId };
}
