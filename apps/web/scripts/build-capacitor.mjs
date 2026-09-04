import { spawnSync } from "node:child_process";

process.env.CAPACITOR_BUILD = "1";
// Never bake server HMAC secrets into the APK / WebView bundle.
delete process.env.VITE_ELFCOM_NODE_SECRET;
delete process.env.ELFCOM_NODE_SECRET;
delete process.env.LIFEOS_JWT_SECRET;

const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);
