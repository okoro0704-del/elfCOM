/**
 * Build a Netlify-safe zip of apps/web/dist.
 * Windows Compress-Archive uses `\`; Netlify also lowercases paths —
 * this script emits `/`-separated lowercase entry names and rewrites
 * index.html / sw.js / manifests to match.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../dist");
const outZip = path.resolve(process.env.TEMP || "/tmp", "elfcom-netlify-safe.zip");

function walk(dir, base = dist) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full, base));
    else out.push(full);
  }
  return out;
}

function rewriteRefs(text) {
  return text
    .replace(/\/assets\/([^"'`\s>]+)/g, (_, name) => `/assets/${String(name).toLowerCase()}`)
    .replace(/(?<![./])assets\/([^"'`\s>]+)/g, (_, name) => `assets/${String(name).toLowerCase()}`);
}

for (const name of ["index.html", "sw.js", "manifest.webmanifest", "manifest.json"]) {
  const p = path.join(dist, name);
  if (!fs.existsSync(p)) continue;
  const raw = fs.readFileSync(p, "utf8");
  const next = rewriteRefs(raw);
  if (next !== raw) fs.writeFileSync(p, next);
}

if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

// Prefer system `zip` if present; else use PowerShell ZipArchive with explicit names.
const files = walk(dist);
const staging = path.join(path.dirname(outZip), "elfcom-netlify-stage");
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

for (const full of files) {
  const rel = path.relative(dist, full).split(path.sep).join("/");
  const lowerRel = rel
    .split("/")
    .map((seg, i, arr) => (i === arr.length - 1 ? seg.toLowerCase() : seg.toLowerCase()))
    .join("/");
  const dest = path.join(staging, ...lowerRel.split("/"));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(full, dest);
}

// Create zip via .NET with forward slashes
const ps = `
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path '${outZip.replace(/'/g, "''")}') { Remove-Item '${outZip.replace(/'/g, "''")}' -Force }
$archive = [System.IO.Compression.ZipFile]::Open('${outZip.replace(/'/g, "''")}', 'Create')
$root = '${staging.replace(/'/g, "''")}'
Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length + 1).Replace('\\','/')
  [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $rel, 'Optimal')
}
$archive.Dispose()
Write-Output $root
`;
execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { stdio: "inherit" });

console.log(JSON.stringify({ outZip, files: files.length }));
