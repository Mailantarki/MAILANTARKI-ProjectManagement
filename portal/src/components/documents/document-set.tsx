"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { ViewerDocument } from "@/components/pdf/launcher";

/**
 * The drawings listed on the current page, in order. The viewer uses it to step to the previous or
 * next drawing (J/K, swipe) without going back to the list.
 */
const DocumentSet = createContext<ViewerDocument[]>([]);

export function DocumentSetProvider({ documents, children }: { documents: ViewerDocument[]; children: ReactNode }) {
  return <DocumentSet.Provider value={documents}>{children}</DocumentSet.Provider>;
}

export const useDocumentSet = () => useContext(DocumentSet);
