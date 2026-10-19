# GitHub Profile Explorer

A React and Express app for exploring public GitHub profiles, contributions,
pull requests, issues, repositories, and recent activity. Data is fetched live
from GitHub. Profiles and searches are not stored.

## Run locally

Requirements: Node.js 20 or later and npm.

```sh
npm install
npm run dev
```

Open <http://localhost:5173>. The API runs at <http://localhost:4000>.

GitHub's unauthenticated API limit is low. To increase it, create a classic
personal access token with no scopes and put it in `server/.env`:

```env
GITHUB_TOKEN=your_token_here
```

Never share or commit this token. `server/.env` is ignored by Git. Restart the
development server after adding or changing it.

## Deploy to Vercel

The repository includes Vercel configuration for the React client and serverless
API routes.

1. Push the project to a GitHub repository and import that repository in Vercel.
2. Set the project root to the repository root. Use these build settings:
   - Build command: `npm run build`
   - Output directory: `client/dist`
   - Install command: `npm install`
3. In the Vercel project, open **Settings → Environment Variables** and add
   `GITHUB_TOKEN` with your personal access token. Select the Production and
   Preview environments you need. Do not name it `VITE_GITHUB_TOKEN` or expose
   it in any client-side variable.
4. Redeploy after saving the environment variable.

The token stays on Vercel's server and is read only by the `/api/profile/:username`
serverless function. It is not included in the built frontend. You can verify the
deployment at `/api/health`.

## Commands

- `npm run dev` — start the API and React development server.
- `npm run build` — build the client for production.
- `npm start` — serve the production client and API.
- `npm test` — run API tests.

GitHub search totals cover all matching public activity; each status list shows
up to 100 recent results. The activity stream is limited to the public events
GitHub makes available, and is not a complete contribution calendar.
