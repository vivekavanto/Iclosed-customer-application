import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type { IclosedFees } from "@/lib/iclosedFees";

const FEES_PATH = path.join(process.cwd(), "src", "config", "iclosed-fees.yaml");

let cached: IclosedFees | null = null;

/** Reads the fee file; cached only in production. */
export function loadIclosedFees(): IclosedFees {
  if (cached) return cached;
  const fees = yaml.load(fs.readFileSync(FEES_PATH, "utf8")) as IclosedFees;
  if (process.env.NODE_ENV === "production") cached = fees;
  return fees;
}
