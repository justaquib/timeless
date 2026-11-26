import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const maxLines = 403;
const roots = [
  "src",
  "src-tauri/src",
  "src-tauri/capabilities",
  "scripts",
  "docs",
  "AGENTS.md",
  ".vscode",
  ".gitignore",
  "README.md",
  "index.html",
  "package.json",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.node.json",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/tauri.conf.json",
];

async function collectFiles(path) {
  const absolutePath = join(root, path);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isDirectory()) return [absolutePath];

  const entries = await readdir(absolutePath);
  const nested = await Promise.all(
    entries.map((entry) => collectFiles(join(path, entry))),
  );
  return nested.flat();
}

const files = (await Promise.all(roots.map(collectFiles))).flat();
const oversized = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  const lines = content.split(/\r\n|\n|\r/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > maxLines) {
    oversized.push(`${relative(root, file)}: ${lines.length} lines`);
  }
}

if (oversized.length) {
  console.error(`Files must be no more than ${maxLines} lines:\n${oversized.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`All ${files.length} maintained files are within the ${maxLines}-line limit.`);
}
