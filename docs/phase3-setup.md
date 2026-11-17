# Phase 3 setup

## Requirements

- Node.js 20.11 or newer.
- MongoDB Atlas or another MongoDB replica set; customer status, its immutable audit event, and its Shopify outbox job are committed in one transaction.
- A Shopify Admin API custom app for the store with customer read/write access, including customer metafields and tags.
- A Netlify site with scheduled functions enabled.

The Shopify Admin GraphQL API version is pinned in `src/lib/shopify.ts`. Configure `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, and `SHOPIFY_CLIENT_SECRET` as server-side environment variables only; never prefix them with `NEXT_PUBLIC_`. The server obtains Admin API tokens with Shopify's client credentials grant and stores them encrypted in the shared MongoDB database, refreshing before expiry. No scheduled token refresh is required.

## Local environment and data migration

1. Copy `.env.example` to `.env.local` and set `MONGODB_URI`, `MONGODB_DB`, `APP_URL`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, and `SHOPIFY_CLIENT_SECRET`.
2. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` (or `FIRST_ADMIN_USERNAME` and `FIRST_ADMIN_PASSWORD`) to a private 3–64 character username and a unique password of at least 14 characters.
3. Before deploying the new application code, run the migration once against the existing database:

   ```sh
   npm install
   npm run migrate:phase3
   ```

   The migration moves legacy customer status and shop fields into `customers.shop_details`, preserves each valid local status (otherwise defaults to `pending`), removes the old top-level copies, and creates the Phase 3 indexes. Run it during a maintenance window with a current database backup. It is safe to rerun.

4. Create the first portal admin:

   ```sh
   npm run seed:admin
   ```

   The command refuses to run if any staff account already exists. Remove the admin credential variables from the environment after seeding. There is no public staff signup.
5. Start and test locally:

   ```sh
   npm run dev
   npm test
   npm run typecheck
   ```

   Staff sign in at `/admin/login`; the same staff accounts manage verification at `/admin` and other staff at `/admin/staff`.
6. To process one local outbox batch in Codespaces, run `npm run shopify:sync-once`. It loads `.env.local`, reuses the existing worker, processes up to eight jobs, prints sanitized counts/errors, and exits non-zero if any job fails.

## Netlify deploy and scheduled worker

1. Configure the environment variables above in Netlify Site configuration. Keep Shopify credentials server-only. Token caching uses the existing shared MongoDB database, so each serverless instance can safely reuse the encrypted token. Add the admin credential variables only long enough to seed the initial admin, then remove them.
2. Run the migration and initial-admin seed against the production database before directing traffic to the new deployment. Back up the database before migrating.
3. Deploy the site. `netlify/functions/shopify-reconciliation.mts` is a Netlify scheduled function configured for `*/15 * * * *`. It processes a bounded outbox batch and a bounded, checkpointed customer reconciliation batch on each run; Shopify status tags are repaired to match the portal database, never the other way around.
4. Check Netlify function logs for each scheduled invocation and inspect customer details in the staff panel. Sync errors remain visible there, and staff can queue a retry.

After a customer details save, staff status change, or staff retry, the request awaits a bounded attempt (up to 20 seconds) for only that customer's outbox job and reports the resulting sync state. Customer details and local verification status remain saved if Shopify is unavailable. Failed jobs remain retryable by the scheduled worker with exponential backoff; reconciliation also repairs tag drift. Approval in the portal is the only source of truth.
