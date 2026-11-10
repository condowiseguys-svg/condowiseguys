import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_wqkdcjdujfrchjioaqcl",
  runtime: "node",
  logLevel: "log",
  // Longest a single run may take, in seconds. Large strata packages can take a while.
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
});
