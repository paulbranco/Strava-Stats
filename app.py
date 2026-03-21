import json
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, redirect, render_template, request, session, url_for

from strava_client import StravaAPIError, StravaClient

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key-change-this")

CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID")
CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET")
REDIRECT_URI = os.environ.get("STRAVA_REDIRECT_URI", "http://localhost:5000/auth/callback")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

CACHE_TTL = 3600  # 1 hour


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_client() -> StravaClient | None:
    if "access_token" not in session:
        return None
    return StravaClient(
        access_token=session["access_token"],
        refresh_token=session.get("refresh_token"),
        expires_at=session.get("expires_at"),
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )


def _update_session_tokens(data: dict):
    session["access_token"] = data["access_token"]
    session["refresh_token"] = data["refresh_token"]
    session["expires_at"] = data["expires_at"]


def _cache_path(athlete_id: int) -> Path:
    return DATA_DIR / f"cache_{athlete_id}.json"


def _load_cache(athlete_id: int) -> list | None:
    path = _cache_path(athlete_id)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
        if time.time() - payload.get("fetched_at", 0) < CACHE_TTL:
            return payload["activities"]
    except (json.JSONDecodeError, KeyError):
        pass
    return None


def _save_cache(athlete_id: int, activities: list):
    _cache_path(athlete_id).write_text(json.dumps({
        "fetched_at": time.time(),
        "activities": activities,
    }))


def _bust_cache(athlete_id: int):
    path = _cache_path(athlete_id)
    if path.exists():
        path.unlink()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/login")
def login():
    if "access_token" in session:
        return redirect(url_for("dashboard"))
    return render_template("login.html")


@app.route("/auth")
def auth():
    auth_url = (
        "https://www.strava.com/oauth/authorize"
        f"?client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        "&response_type=code"
        "&scope=read,activity:read_all"
        "&approval_prompt=auto"
    )
    return redirect(auth_url)


@app.route("/auth/callback")
def auth_callback():
    error = request.args.get("error")
    if error:
        return render_template("login.html", error=f"Authorization denied: {error}")

    code = request.args.get("code")
    if not code:
        return render_template("login.html", error="No authorization code received.")

    resp = requests.post("https://www.strava.com/oauth/token", data={
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
    })
    data = resp.json()

    if "access_token" not in data:
        msg = data.get("message", "Unknown error during token exchange.")
        return render_template("login.html", error=msg)

    _update_session_tokens(data)
    return redirect(url_for("dashboard"))


@app.route("/")
def dashboard():
    client = _get_client()
    if not client:
        return redirect(url_for("login"))

    # Refresh token if it's about to expire; update session if refreshed
    try:
        refreshed = client._refresh_if_needed()
        if refreshed:
            _update_session_tokens(refreshed)

        athlete = client.get_athlete()
        athlete_id = athlete["id"]

        force_sync = request.args.get("sync") == "1"
        if force_sync:
            _bust_cache(athlete_id)

        activities = _load_cache(athlete_id)
        if activities is None:
            activities = client.get_all_activities()
            _save_cache(athlete_id, activities)

    except StravaAPIError:
        session.clear()
        return redirect(url_for("login"))

    return render_template(
        "dashboard.html",
        athlete=athlete,
        activities_json=json.dumps(activities),
    )


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


if __name__ == "__main__":
    app.run(debug=True)
