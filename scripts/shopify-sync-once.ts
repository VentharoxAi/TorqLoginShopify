import { getDatabase } from "../src/lib/db";
import { runShopifyWorker } from "../src/lib/shopify-outbox";

type Summary = {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
};

const summary: Summary = {
  processed: 0,
  succeeded: 0,
  failed: 0,
  errors: [],
};

async function main(): Promise<void> {
  let exitCode = 0;
  let database: Awaited<ReturnType<typeof getDatabase>> | undefined;

  try {
    database = await getDatabase();
    const result = await runShopifyWorker();
    summary.processed = result.processed;
    summary.succeeded = result.succeeded;
    summary.failed = result.failed;
    summary.errors = result.errors;
    if (result.failed > 0 || result.errors.length > 0) exitCode = 1;
  } catch {
    summary.errors.push("Shopify sync worker failed.");
    exitCode = 1;
  } finally {
    if (database) {
      try {
        await database.client.close();
      } catch {
        summary.errors.push("Database connection could not be closed cleanly.");
        exitCode = 1;
      }
    }
  }

  console.log(JSON.stringify(summary));
  process.exitCode = exitCode;
}

void main();
