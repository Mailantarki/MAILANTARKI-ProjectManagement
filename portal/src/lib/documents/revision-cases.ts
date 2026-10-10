// Shared by revision.test.ts (TypeScript) and revision.integration.test.ts (Postgres), so both
// implementations of the order are checked against the same list.
export const ORDERED_REVISIONS = ["", "0", "1", "2", "10", "A", "B", "C", "C1", "C2", "P01", "P02", "Z", "AA", "AB", "BA"];
export const EQUIVALENT_REVISIONS: [string, string][] = [["Rev B", "B"], ["rev-b", "b"], ["c 1", "C1"], ["01", "1"], ["REVISION 3", "3"]];
