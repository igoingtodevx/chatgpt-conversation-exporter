import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

async function collect(dir, root = dir, out = {}) {
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) await collect(full, root, out);
    else out[path.relative(root, full).replaceAll(path.sep, "/")] = new Uint8Array(await readFile(full));
  }
  return out;
}

const pkg = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("release", { recursive: true });
const files = await collect("dist");
const zip = zipSync(files, { level: 9 });
const name = `chatgpt-conversation-exporter-v${pkg.version}.zip`;
await writeFile(path.join("release", name), zip);
console.log(path.join("release", name));
