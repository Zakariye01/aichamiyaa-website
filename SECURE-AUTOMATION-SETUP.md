# Secure automation setup

This additive release keeps the existing public website intact and adds a private owner login, persistent Netlify Blobs storage, duplicate prevention, and an hourly CanadaBuys check.

## Required Netlify secrets

After the files are committed to the existing GitHub repository, open the existing Netlify project and go to **Project configuration → Environment variables**. Add both variables for the Production context and Functions scope, and mark them as secret values:

- `COMMAND_CENTER_PASSWORD`: the private password used to enter the Command Centre.
- `COMMAND_CENTER_SESSION_SECRET`: a separate long random value used to sign owner sessions. Use at least 32 random characters and do not reuse the login password.

Trigger a new Netlify deployment after adding or changing either value.

## Private address

After deployment, use:

`https://aichamiyaasupplier.org/command-center.html`

Unauthenticated visitors are redirected to the owner login. The Command Centre data endpoints also independently verify the owner session.

## Automation behavior

- The CanadaBuys monitor runs hourly on Netlify in UTC.
- Matching records are stored in Netlify Blobs and remain available across deployments.
- Each refresh replaces the official-feed snapshot and deduplicates records by the official reference or solicitation number.
- Manual opportunities, small businesses, and proposal counts are stored in the secure cloud record after login.
- Existing browser-local preview records are migrated on the first authenticated load when the cloud record is empty.

Final pricing, declarations, signatures, and government bid submission remain owner approval points.
