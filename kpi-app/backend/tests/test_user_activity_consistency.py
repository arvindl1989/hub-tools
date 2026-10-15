"""Step 6: the same word, the same rule, the same shade on every board.

Three of these were cases of one page holding two definitions of one idea — a
frontline, a service, the word "Regular" — and the fourth is the shading, which
re-scaled itself whenever the filter moved so two screenshots of the same estate
could not be compared.
"""
import json
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, "/tmp/claude-0/-home-user-hub-tools/82e410bb-e079-52f1-bbcc-05d4911973ee/scratchpad")
import ua_fixture  # noqa: E402

BASE = "http://127.0.0.1:8822"

rows = ua_fixture.build()
req = urllib.request.Request(f"{BASE}/api/upload-json",
                             data=json.dumps({"rows": rows}).encode(),
                             headers={"Content-Type": "application/json"})
sid = json.loads(urllib.request.urlopen(req).read())["session_id"]


def metrics(**p):
    q = urllib.parse.urlencode({k: v for k, v in p.items() if v})
    return json.loads(urllib.request.urlopen(
        f"{BASE}/api/sessions/{sid}/user-metrics{'?' + q if q else ''}").read())


m = metrics()
cfg = m["config"]

print("TEST 1 — a cell keeps its shade when the filter changes")
filtered = metrics(area="EUR")
shared = set(m["service_adoption"]["grid"]) & set(filtered["service_adoption"]["grid"])
moved = [k for k in shared
         if m["service_adoption"]["grid"][k]["requests"]
         == filtered["service_adoption"]["grid"][k]["requests"]
         and m["service_adoption"]["grid"][k]["band"]
         != filtered["service_adoption"]["grid"][k]["band"]]
print(f"  {len(shared)} cells in both views, {len(moved)} changed shade without changing value")
assert not moved, moved[:5]

# And the published bands are the fixed ones, not derived from this data.
print("  bands:", [f"{b['label']}" for b in m["service_adoption"]["bands"]])
assert [b["label"] for b in m["service_adoption"]["bands"]] == cfg["heatmap_band_labels"]
for b in m["service_adoption"]["bands"]:
    assert [b["from"], b["to"]] in [list(x) for x in cfg["heatmap_bands"]]

print("\nTEST 2 — a value of 40 is the same band everywhere")
bands_for_40 = {m["service_adoption"]["grid"][k]["band"]
                for k in m["service_adoption"]["grid"]
                if m["service_adoption"]["grid"][k]["requests"] == 40}
print(f"  cells holding 40 requests: band(s) {bands_for_40 or '— none in this fixture'}")
assert len(bands_for_40) <= 1

print("\nTEST 3 — one definition of a frontline, used by every board")
non_fl = [r["name"] for r in m["activity_groups"]["by_frontline"] if r["is_frontline"] is False]
fl_rows = [r["name"] for r in m["activity_groups"]["by_frontline"] if r["is_frontline"]]
denominator = m["service_utility"][0]["frontlines"]["total"]
print(f"  breakdown table: {len(fl_rows)} frontlines, {len(non_fl)} hub functions {non_fl}")
print(f"  service denominator: {denominator}   reach card: {m['reach']['frontlines']}")
assert denominator == len(fl_rows) == m["reach"]["frontlines"], \
    (denominator, len(fl_rows), m["reach"]["frontlines"])

print("\nTEST 4 — the top tier needs a sample to be a quartile of")
thin = [t for t in m["service_adoption"]["totals"]]
for t in thin:
    users_of_service = t["top"] + t["regular"] + t["dormant"]
    if users_of_service and t["top"]:
        assert users_of_service >= 4 or t["top"] == 0, t
print(f"  {len(thin)} services checked; no top tier declared on fewer than four users")

print("\nTEST 5 — the per-user view is a different reading of the same cells")
diff = [k for k, c in m["service_adoption"]["grid"].items()
        if c["requests"] and c["band"] != c["band_per_user"]]
print(f"  {len(diff)} of {len(m['service_adoption']['grid'])} cells shade differently per user")
assert diff, "the per-user view is identical to the totals — it adds nothing"

print("\nTEST 6 — one kind of cell per column, whatever the group size")
rows = m["activity_groups"]["by_frontline"]
assert all(isinstance(r["utility_pct"], (int, float)) for r in rows)
assert not any("show_pct" in r for r in rows)
print(f"  all {len(rows)} frontline rows print a rate, "
      f"the smallest over {min(r['users'] for r in rows)} user(s)")

print("\nALL CHECKS PASSED")
