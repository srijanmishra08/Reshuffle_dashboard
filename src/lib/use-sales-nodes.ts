"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type SalesNodeOption = { id: string; name: string; kind: string; kindLabel: string };

/** The active sales nodes (staff, freelancers, agencies, individuals) a lead can be credited to. */
export function useSalesNodes() {
  const [nodes, setNodes] = useState<SalesNodeOption[]>([]);
  const reload = useCallback(async () => {
    try {
      setNodes(await api<SalesNodeOption[]>("/api/sales-nodes?active=true"));
    } catch {
      /* the lead form still works without the list */
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload]);
  return { nodes, reload };
}
