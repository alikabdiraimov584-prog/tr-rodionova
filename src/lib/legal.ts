import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function legalDoc(name: "offer" | "privacy") {
  return readFile(path.join(process.cwd(), "docs", "legal", `${name}.md`), "utf8");
}
