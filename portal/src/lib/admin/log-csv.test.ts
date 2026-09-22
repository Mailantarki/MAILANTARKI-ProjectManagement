import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "./log-csv";

describe("access log CSV", () => {
  it("neutralizes spreadsheet formulas, including leading whitespace", () => {
    for (const value of ["=1+1", "+SUM(1)", "-2+3", "@cmd", "  =2+2"])
      expect(csvCell(value)).toBe(`"'${value}"`);
  });
  it("quotes commas, newlines and embedded quotes", () => {
    expect(csvRow(['a,"b"', "one\ntwo"])).toBe('"a,""b""","one\ntwo"\r\n');
  });
});
