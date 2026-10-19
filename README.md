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

## Commands

- `npm run dev` — start the API and React development server.
- `npm run build` — build the client for production.
- `npm start` — serve the production client and API.
- `npm test` — run API tests.

GitHub search totals cover all matching public activity; each status list shows
up to 100 recent results. The activity stream is limited to the public events
GitHub makes available, and is not a complete contribution calendar.
