import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await Promise.all([
  build({ entryPoints: ["src/content/content.ts"], bundle: true, outfile: "dist/content.js", format: "iife", target: "chrome120", minify: false }),
  build({ entryPoints: ["src/popup/popup.ts"], bundle: true, outfile: "dist/popup.js", format: "iife", target: "chrome120", minify: true })
]);

await cp("src/popup/popup.html", "dist/popup.html");
await cp("src/popup/popup.css", "dist/popup.css");
await cp("manifest.json", "dist/manifest.json");

const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
manifest.version = pkg.version;
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
