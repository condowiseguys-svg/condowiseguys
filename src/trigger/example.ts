import { logger, task, wait } from "@trigger.dev/sdk";

// First task: proves the dev worker is connected. Later tasks will process strata document packages.
export const helloWorldTask = task({
  id: "hello-world",
  maxDuration: 300,
  run: async (payload: { name?: string }, { ctx }) => {
    logger.log("Hello from Condo Wise Guys", { payload, runId: ctx.run.id });

    await wait.for({ seconds: 5 });

    return {
      message: `Hello, ${payload.name ?? "world"}!`,
    };
  },
});
