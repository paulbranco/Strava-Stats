# Strava Stats Dashboard

A personal web dashboard built with Flask that connects to the Strava API and displays all of your activity data — filterable by sport type and year, with summary stats, a weekly trend chart, and a sortable activity table.

---

## Features

- **Connect with Strava** via OAuth2 (no passwords stored)
- **All-time activity history** fetched and cached locally (1-hour TTL)
- **Multi-select sport filter** — pick one, several, or all sports
- **Multi-select year filter** — view a single year, a range, or all time
- **Summary cards** — total distance (miles), moving time, elevation gain (ft), activity count
- **Weekly distance chart** — bar chart showing miles per week (Chart.js)
- **Sport breakdown donut chart** — distance split by sport
- **Sortable activity table** — click any column header to sort; links to Strava
- **Sync button** — force-refresh the activity cache at any time

---

## Setup

### 1. Register a Strava API app

1. Go to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Create a new application (fill in any name/website)
3. Set **"Authorization Callback Domain"** to `localhost`
4. Note your **Client ID** and **Client Secret** from the app settings page

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```
FLASK_SECRET_KEY=some-long-random-string
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abc123def456...
STRAVA_REDIRECT_URI=http://localhost:5000/auth/callback
```

> **Tip:** Generate a strong secret key with:
> ```bash
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## Usage

1. Click **"Connect with Strava"** — you'll be redirected to Strava to authorize the app
2. After authorization you'll land on the dashboard with all your activities loaded
3. Use the **Year** and **Sport** filter pills to narrow the view (multi-select supported)
4. Click any **column header** in the activity table to sort
5. Use the **search box** to filter activities by name
6. Click **Sync** in the navbar to fetch the latest activities from Strava

---

## Project Structure

```
Strava-Stats/
├── app.py              — Flask routes, OAuth flow, cache management
├── strava_client.py    — Strava API v3 client (auth, activity fetching)
├── requirements.txt
├── .env.example
├── data/               — Local activity cache (gitignored)
├── templates/
│   ├── base.html       — Navbar, CDN links
│   ├── login.html      — "Connect with Strava" page
│   └── dashboard.html  — Main dashboard UI
└── static/
    ├── css/style.css   — Custom styles (Strava orange theme)
    └── js/dashboard.js — Client-side filtering, charts, table
```

---

## Notes

- Activity data is cached in `data/cache_{athlete_id}.json` for 1 hour to avoid hitting Strava's rate limits (200 req / 15 min)
- The Strava API does not support server-side sport-type filtering; all filtering is done in the browser
- Access tokens expire after 6 hours and are automatically refreshed using the stored refresh token
- The `data/` directory is gitignored — your activity data stays local
