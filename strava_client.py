import time
import requests

STRAVA_API_BASE = "https://www.strava.com/api/v3"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"


class StravaAPIError(Exception):
    pass


class StravaClient:
    def __init__(self, access_token, refresh_token=None, expires_at=None,
                 client_id=None, client_secret=None):
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.expires_at = expires_at
        self.client_id = client_id
        self.client_secret = client_secret

    def _headers(self):
        return {"Authorization": f"Bearer {self.access_token}"}

    def _refresh_if_needed(self):
        """Refresh the access token if it expires within 5 minutes.
        Returns the new token dict if a refresh occurred, else None."""
        if not self.expires_at:
            return None
        if time.time() < self.expires_at - 300:
            return None

        response = requests.post(STRAVA_TOKEN_URL, data={
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token,
        })
        response.raise_for_status()
        data = response.json()
        self.access_token = data["access_token"]
        self.refresh_token = data["refresh_token"]
        self.expires_at = data["expires_at"]
        return data

    def _get(self, path, params=None):
        response = requests.get(
            f"{STRAVA_API_BASE}{path}",
            headers=self._headers(),
            params=params,
        )
        if response.status_code == 401:
            raise StravaAPIError("Unauthorized — token may be expired or revoked")
        response.raise_for_status()
        return response.json()

    def get_athlete(self):
        """Return the authenticated athlete's profile."""
        return self._get("/athlete")

    def get_all_activities(self):
        """Fetch every activity for the authenticated athlete by paginating
        through /athlete/activities until an empty page is returned."""
        activities = []
        page = 1
        while True:
            batch = self._get("/athlete/activities", params={
                "per_page": 100,
                "page": page,
            })
            if not batch:
                break
            activities.extend(batch)
            if len(batch) < 100:
                break
            page += 1
        return activities
