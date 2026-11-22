# Bills Command Dashboard

A **new, independent Buffalo Bills dashboard project** inspired by the dense, dark, panel-driven layout of Weather Command Dashboard. It has its **own** source files, `package.json`, and `render.yaml` and does not replace or modify the weather project.

## Features

- Buffalo Bills blue (`#00338D`), red (`#C60C30`), white and team logo
- Game-day center with opponent, status, time, score and last play when the upstream feed supplies it
- NFL live scoreboard: refreshes every 30 seconds while Auto is enabled
- Bills win/loss record, AFC East standings, win percentage, point differential
- Season team stats and player leaders from ESPN; no invented player figures
- Roster directory, position filters and name/number search
- Reported injuries and availability, plus links to the **official** Bills injury report and game-day inactive lists
- Completed-game scoring chart and previous five results
- Next eight games, news, opponent logos and local kickoff times
- Super Bowl LXI likelihood meter: current market-implied probability **only when** a sportsbook futures feed is configured. Otherwise, a dated, visibly non-live ESPN FPI snapshot is displayed briefly, then expires
- Dark, information-dense 3-column desktop layout; responsive tablet and phone views
- Fullscreen wall mode, fit/compact mode, expand panels, drag-to-arrange within columns, reset and saved layout
- Per-feed errors, source links, data timestamps, fallback to last-good API data during temporary interruptions

## Running on Windows

1. Install **Node.js 22 or later** if it is not installed: https://nodejs.org/
2. **Right-click the downloaded ZIP and choose `Extract All` before opening anything inside it.** Do not double-click `start-windows.bat` while browsing inside the compressed ZIP: Windows may copy only the launcher into a temporary folder and then report `Cannot find module ... server.mjs`.
3. Open the **extracted** `Bills-Command-Dashboard` folder (the folder containing `server.mjs`, `app.js`, and `start-windows.bat`) and double-click `start-windows.bat`.
4. Open `http://localhost:3000` in a browser. If your browser opens before the server finishes starting, refresh the page.
5. Keep the command window open while using the dashboard. `Ctrl+C` stops the server.

Or open a terminal in the project folder and run `npm start`. This project has **no third-party npm dependencies**.

On Mac/Linux run `./start-mac-linux.sh` (requires Node.js 22+).

## Separate Render deployment

Create a **new GitHub repository** such as `Bills-Command-Dashboard`, upload only this extracted project into it, then use Render **New → Blueprint** with its `render.yaml` or create a new Node Web Service with:

- Build: `npm install`
- Start: `npm start`
- Health check: `/api/health`
- Node >=22

Use a **different Render service** from the Weather Command Dashboard. Do not change the existing weather service or its repo settings. The app will run on its own URL. The `ODDS_API_KEY` is optional and is not required at deployment; add it later under the **new Bills service → Environment** if you subscribe to a futures-odds API.

### Refrigerator screen

Open the new Render URL in the refrigerator browser, ideally with `?fridge=1` added to the end (for example, `https://YOUR-BILLS-APP.onrender.com/?fridge=1`). Bookmark that address. FRIDGE mode hides the extra banner/navigation and moves the game center to the top, using a touch-friendly responsive layout. You can also toggle **FRIDGE** in the header; the preference stays saved in that browser. **Auto** refresh remains enabled by default. Your refrigerator needs a browser capable of running modern JavaScript; support varies by model.

Free Render services may spin down after fifteen minutes without inbound traffic; a newly reopened fridge page may initially take time to wake the server.

### Data feeds

| Component | Source | Key? | Update policy |
| --- | --- | --- | --- |
| Live scores | ESPN public NFL site scoreboard endpoint | No | Frontend every 30 seconds, server caches 25 seconds |
| NFL games, Bills record, AFC East standings | ESPN site endpoint | No | Server caches 90–180 seconds |
| Bills roster | ESPN team roster endpoint | No | Server caches 15 minutes |
| Bills injuries | ESPN team injury endpoint | No | Server caches 3 minutes |
| Bills player leaders & team statistics | ESPN site/core NFL endpoints | No | Server caches 5 minutes |
| Team news | ESPN NFL news | No | Server caches 5 minutes |
| Super Bowl outright futures | [The Odds API](https://the-odds-api.com/sports/super-bowl-winner-odds.html) | **Yes**, optional | Server requests at most once every 2 hours |

ESPN public site endpoints are not an officially guaranteed commercial API contract, can change without notice, and need live verification on your deployed environment. Official [Buffalo Bills injury report](https://www.buffalobills.com/team/injury-report/) and [NFL team page](https://www.nfl.com/teams/buffalo-bills/) are linked for validation. Do not assume an inactive player is injured; inactive and injury listings are different.

### Super Bowl probability details

If you supply `ODDS_API_KEY` as a secret environment variable, the backend fetches the **NFL Super Bowl Winner** futures odds and calculates the Buffalo Bills' share of the normalized probability pool for each listed sportsbook, then averages the available books. This removes each book's overround approximately but does **not** make sportsbook prices a perfect model of championship probability. The UI labels the value as market-implied, identifies the source and its timestamp, and updates after the configured cache duration. An active provider plan may incur charges; check pricing and licensing.

Without a key, a **dated November 20, 2026 ESPN FPI snapshot of 15.4%** (as reported by SportsGrid) may display until November 28, 2026. This is explicitly labelled **not real-time**. After that date, the dashboard displays no probability rather than endlessly displaying stale data. Source: https://www.sportsgrid.com/nfl/article/espn-ranks-all-32-nfl-teams-by-their-chances-of-making-the-2026-playoffs

Store secrets on the **server only**, never in `app.js` or in a browser field. For local development create a `.env` file based on `.env.example`. Never commit your `.env` file or secret key to GitHub.

## Layout controls

- **AUTO** — updates scores in view every 30 seconds and other feeds every 3 minutes; tab reactivation triggers a refresh
- **REFRESH** — forces a refresh (individual upstream caches apply)
- **FRIDGE** — touch-friendly fridge and tablet layout, also activate with `?fridge=1` URL
- **FIT** — compact layout for laptop/TV displays
- **WALL** — browser fullscreen for a public display
- **⤢** on any panel — expands that panel and preserves its contents and controls
- **ARRANGE PANELS** — drag panels to reorder them inside their column, automatically saves the arrangement in the browser
- **RESET LAYOUT** — restores the original arrangement

## Tests

`npm test` executes data-normalization tests (roster, game/score merges, injuries, standings, stats, odds). `npm run check` checks syntax. For a server smoke test, start the server and visit `http://localhost:3000/api/health`.

## Known limitations

- Access to live ESPN/odds upstream services was **not testable from the artifact-building environment**. The package, normalization tests, and local server health can be checked, but upstream availability requires internet access when running or deploying.
- Team injuries and player stats can have gaps if the public ESPN feed changes or is incomplete. These panels explain the issue instead of fabricating values.
- No separate native app is required; it is a responsive web app. On smart TVs, use a browser or a Fire TV browser to open the deployed URL and enable Wall/Fit modes.
- ESPN and NFL team logos are loaded from ESPN's public CDN, not bundled. Such marks may be subject to trademark licensing restrictions, especially if you distribute this commercially. This is an independent fan project.
- Browser localStorage for layout and compact settings is per browser/device.

Copyright © 2026. Independent unofficial fan dashboard; not affiliated with or endorsed by the Buffalo Bills, NFL, ESPN, or the futures data provider.
