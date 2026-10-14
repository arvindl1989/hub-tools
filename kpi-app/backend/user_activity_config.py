"""Every threshold the User Activity page depends on, in one place.

Before this, the same idea was spelled differently in three files: the cards
called a user dormant after 90 days while the list below them flagged one after
56, and the heat map's shade boundaries lived in the component that drew them.
A reader comparing two boards had no way to know they disagreed, and a change
meant finding every copy.

So: one module, imported by the API, and echoed to the browser in the metrics
payload so the page draws its legends and labels from the same numbers rather
than its own. Nothing here should be duplicated anywhere else — if a board
needs a threshold, it reads it from here.

Several values were chosen rather than measured, and are flagged as such. They
are policy, not arithmetic, and changing them is a product decision.
"""
from __future__ import annotations

# ── Recency ──────────────────────────────────────────────────────────────────
# How long since someone's last request before they stop counting as current.
LIFECYCLE_ACTIVE_DAYS = 30      # Active:  0-30 days
LIFECYCLE_DORMANT_DAYS = 90     # Regular: 31-90, Dormant: 91+

# The user list asks a different question — whether an account still needs
# access — so it gets its own pair. These used to be 28 and 56, which made a
# user "At Risk" in the list while the cards above still called them Active.
ACCESS_REVIEW_AT_RISK_DAYS = 30
ACCESS_REVIEW_FLAG_DAYS = 90

# First-ever request within this many days of the as-of date.
NEW_USER_WINDOW_DAYS = 90

# ── Honesty about small numbers ──────────────────────────────────────────────
# A percentage over three people reads as precision the data does not have:
# one person moving swings it 33 points. Below this, the count shows and the
# percentage is suppressed.
MIN_GROUP_SIZE_FOR_PCT = 5

# ── Services ─────────────────────────────────────────────────────────────────
# 3 = the offers the business sells (WCM, DEA, CP), where DEA merges three
# ServiceNow sub-categories. 5 = the raw sub-categories. The heat map has
# always shown 5 and the tables 3, which made "services used" mean two
# different fractions on one page; this is what reconciles them.
SERVICE_MODEL = 3

# ── Frontlines ───────────────────────────────────────────────────────────────
# Global is the hub's own area rather than a market, so its teams are counted
# on their own card and left out of frontline figures.
GLOBAL_AREA = "Global"
FRONTLINE_INCLUDES_GLOBAL = False

# Teams that are not a frontline whatever area they sit in. They still appear,
# but marked, so their rows are not read as a market's performance.
NON_FRONTLINE_TEAMS = ["Other"]

# One person trying a service once does not make the frontline a user of it.
# A frontline counts as using a service when it clears either bar.
FRONTLINE_USES_SERVICE_MIN_USERS = 2
FRONTLINE_USES_SERVICE_MIN_REQUESTS = 3

# ── Engagement and concentration ─────────────────────────────────────────────
# Engaged means came back, so it needs a second request inside the window —
# the old definition was one request ever, which made it the inverse of the
# dormant share and told nobody anything new.
ENGAGED_MIN_REQUESTS = 2

# A fixed "top 10" is the whole population once a filter leaves ten users, so
# the share it carries is 100% and says nothing. A proportion does not break.
TOP_REQUESTOR_SHARE = 0.10

# ── Tickets that should never have counted ───────────────────────────────────
# Dropped at load. Distinct from the existing EXCLUDED_STATES in main.py, which
# means "closed" rather than "invalid" — these are rows that are not work.
# If none of these strings appear in the export this is a no-op, and the API
# says how many rows it actually dropped so that stays visible.
EXCLUDED_TICKET_STATES = ["Cancelled", "Duplicate", "Rejected"]

# ── Heat map shading ─────────────────────────────────────────────────────────
# Fixed boundaries, so a cell of 40 requests is the same shade whatever the
# filter. Ranked or range-relative bands re-shade the whole map every time the
# population changes, which makes two screenshots incomparable. The cost is
# that a filtered view can use only part of the ramp — that is the honest
# picture of a smaller selection.
# (floor, ceiling inclusive; None = no upper bound)
HEATMAP_BANDS = [(1, 5), (6, 20), (21, 50), (51, 150), (151, None)]
HEATMAP_BAND_LABELS = ["1–5", "6–20", "21–50", "51–150", "151+"]


def band_for(requests: int) -> int:
    """0 for never used, else 1 (lowest) to 5 (highest)."""
    if not requests:
        return 0
    for i, (floor, ceiling) in enumerate(HEATMAP_BANDS, start=1):
        if requests >= floor and (ceiling is None or requests <= ceiling):
            return i
    return len(HEATMAP_BANDS)


def show_pct(group_size: int) -> bool:
    """Whether a percentage over this many people is worth printing."""
    return group_size >= MIN_GROUP_SIZE_FOR_PCT


def as_payload() -> dict:
    """What the browser needs so its labels and legends match the maths."""
    return {
        "lifecycle_active_days": LIFECYCLE_ACTIVE_DAYS,
        "lifecycle_dormant_days": LIFECYCLE_DORMANT_DAYS,
        "access_review_at_risk_days": ACCESS_REVIEW_AT_RISK_DAYS,
        "access_review_flag_days": ACCESS_REVIEW_FLAG_DAYS,
        "new_user_window_days": NEW_USER_WINDOW_DAYS,
        "min_group_size_for_pct": MIN_GROUP_SIZE_FOR_PCT,
        "service_model": SERVICE_MODEL,
        "frontline_includes_global": FRONTLINE_INCLUDES_GLOBAL,
        "non_frontline_teams": list(NON_FRONTLINE_TEAMS),
        "frontline_uses_service_min_users": FRONTLINE_USES_SERVICE_MIN_USERS,
        "frontline_uses_service_min_requests": FRONTLINE_USES_SERVICE_MIN_REQUESTS,
        "engaged_min_requests": ENGAGED_MIN_REQUESTS,
        "top_requestor_share": TOP_REQUESTOR_SHARE,
        "heatmap_bands": [list(b) for b in HEATMAP_BANDS],
        "heatmap_band_labels": list(HEATMAP_BAND_LABELS),
    }
