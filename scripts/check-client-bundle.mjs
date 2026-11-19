// Runs after `next build`. Fails the build if anything private ended up in the files that
// are sent to visitors' browsers (.next/static): secret key names, key prefixes, or the
// wording of the analysis instructions. Run by hand with: node scripts/check-client-bundle.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
const forbidden = [
  // Server-only settings
  "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY", "TRIGGER_SECRET_KEY", "ADMIN_PASSWORD",
  // Key formats
  "sk_live_", "sk_test_", "rk_live_", "whsec_", "tr_prod_", "tr_dev_", "sk-ant-", "re_live",
  // Analysis instructions and libraries that only the server should use
  "careful reviewer of British Columbia strata", "zodOutputFormat", "@anthropic-ai/sdk", "service_role",
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

let all;
try {
  all = files(root);
} catch {
  console.error(`check-client-bundle: ${root} not found. Run next build first.`);
  process.exit(1);
}

const problems = [];
for (const file of all) {
  if (file.endsWith(".map")) problems.push(`${file}: source map published`);
  if (!/\.(js|css|html|json|txt)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const word of forbidden) if (text.includes(word)) problems.push(`${file}: contains "${word}"`);
}

if (problems.length) {
  console.error("Private code or settings found in the browser files:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`check-client-bundle: ${all.length} browser files checked, nothing private found.`);
