"""
JTWC TC Warning Scraper
Source: https://www.metoc.navy.mil/jtwc/rss/jtwc.rss

Primary data source  : JMV 3.0 (.tcw) files
                         - Compact T-lines for current + forecast position/wind/radii
                         - Full 6-hourly historical track since genesis
                         - Text section for gusts, MSLP, movement vectors
Fallback data source : TC Warning Text (.web.txt) files
                         - Used automatically when the .tcw file is unavailable
                         - Provides current position + forecasts only (no history)

Output format matches the reference JSON schema.

Usage:
    py scripts/jtwc_scraper.py [output_dir]
"""

import requests
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup, NavigableString
import json
import re
from datetime import datetime, timezone
from pathlib import Path

RSS_URL = "https://www.metoc.navy.mil/jtwc/rss/jtwc.rss"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.metoc.navy.mil/jtwc/jtwc.html",
}

# ---------------------------------------------------------------------------
# Category codes (1-min sustained kt — derived from reference data)
# ---------------------------------------------------------------------------
def wind_to_category(wind_kt: int | None, dissipating: bool = False) -> str | None:
    if wind_kt is None:
        return None
    if wind_kt < 25:
        return "XX"
    if wind_kt < 34:
        return "DS" if dissipating else "XX"
    if wind_kt < 64:
        return "TS"
    if wind_kt < 83:
        return "TC1"
    if wind_kt < 96:
        return "TC2"
    if wind_kt < 113:
        return "TC3"
    if wind_kt < 137:
        return "TC4"
    return "TC5"

# ---------------------------------------------------------------------------
# Storm suffix → basin / ATCF prefix
# ---------------------------------------------------------------------------
SUFFIX_TO_BASIN       = {"W":"WP","E":"EP","C":"CP","L":"AL","A":"IO","B":"IO","S":"SI","P":"SP"}
SUFFIX_TO_ATCF_PREFIX = {"W":"WP","E":"EP","C":"CP","L":"AL","A":"IO","B":"IO","S":"SH","P":"SH"}
SUFFIX_TO_SUBBASIN    = {"W":"MM","E":"EE","C":"CC","L":"LL","A":"AA","B":"BB","S":"IO","P":"EA"}

def parse_storm_suffix(storm_id: str) -> tuple[str, str]:
    """'30P' → ('30', 'P')"""
    m = re.match(r"(\d+)([A-Z])", storm_id.upper())
    return (m.group(1).zfill(2), m.group(2)) if m else (storm_id, "")

def build_atcf_id(storm_id: str, year: int) -> str:
    number, suffix = parse_storm_suffix(storm_id)
    return f"{SUFFIX_TO_ATCF_PREFIX.get(suffix,'XX')}{number}{year}"

# ---------------------------------------------------------------------------
# Date/time helpers
# ---------------------------------------------------------------------------
def parse_info_dt(dt10: str) -> datetime:
    """'2026041000' → datetime(2026,4,10,0,0, utc)"""
    return datetime(int(dt10[:4]), int(dt10[4:6]), int(dt10[6:8]),
                    int(dt10[8:10]), 0, tzinfo=timezone.utc)

def parse_history_dt(nn: str, yy: str, mm: str, dd: str, hh: str) -> datetime:
    """nn=storm#, yy=year2, mm=month, dd=day, hh=hour → datetime"""
    return datetime(2000 + int(yy), int(mm), int(dd), int(hh), 0, tzinfo=timezone.utc)

def resolve_forecast_dt(dtg6: str, issued_dt: datetime) -> datetime:
    """
    Resolve a 6-char forecast DTG like '101200' (DDHHMM) relative to issued_dt.
    Handles month rollover.
    """
    day, hour = int(dtg6[:2]), int(dtg6[2:4])
    year, month = issued_dt.year, issued_dt.month
    if day < issued_dt.day:          # rolled into next month
        month += 1
        if month > 12:
            month, year = 1, year + 1
    try:
        return datetime(year, month, day, hour, 0, tzinfo=timezone.utc)
    except ValueError:
        month += 1
        if month > 12:
            month, year = 1, year + 1
        return datetime(year, month, day, hour, 0, tzinfo=timezone.utc)

# ---------------------------------------------------------------------------
# RSS helpers
# ---------------------------------------------------------------------------
def fetch(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        print(f"  ERROR fetching {url}: {e}")
        return None


def get_storm_links(rss_text: str) -> list[dict]:
    """
    Parse the RSS feed and return one entry per active storm containing both
    the JMV 3.0 (.tcw) URL and the TC Warning Text URL.

    Returns: [{basin_label, storm_header_text, jmv_url, warning_text_url, feed_pub_date}]
    jmv_url or warning_text_url may be None if not present in the RSS item.
    """
    root = ET.fromstring(rss_text)
    results = []

    for item in root.findall(".//item"):
        cat_el  = item.find("category")
        desc_el = item.find("description")
        pub_el  = item.find("pubDate")
        if desc_el is None:
            continue
        basin    = cat_el.text.strip() if cat_el is not None else "Unknown"
        pub_date = pub_el.text.strip()  if pub_el  is not None else ""
        html     = desc_el.text or ""
        soup     = BeautifulSoup(html, "html.parser")

        # Flat text for extracting storm header text before each product list
        flat = " ".join(
            str(el).strip()
            for el in soup.descendants
            if isinstance(el, NavigableString) and str(el).strip()
        )

        # Header regex — matches "Tropical Cyclone 30P (Maila) Warning #17 ..."
        header_pat = re.compile(
            r"((?:Super\s+)?(?:Typhoon|Tropical\s+(?:Storm|Cyclone|Depression)"
            r"|Subtropical\s+Storm|Cyclone|Severe\s+Tropical\s+Storm)"
            r"\s+\w+\s+\(\w+\)\s+Warning\s+#\d+(?:[^I]*Issued\s+at\s+[\d/Z]+)?)",
            re.IGNORECASE,
        )

        # Walk each <ul> block — one per storm in this basin item
        for ul in soup.find_all("ul"):
            jmv_url          = None
            warning_text_url = None

            for a in ul.find_all("a", href=True):
                link_text = a.get_text(strip=True)
                href      = a["href"]
                if re.search(r"JMV\s*3\.0", link_text, re.IGNORECASE) or href.endswith(".tcw"):
                    jmv_url = href
                elif re.search(r"TC\s*Warning\s*Text", link_text, re.IGNORECASE):
                    warning_text_url = href

            # Only add entry if at least one usable URL was found
            if not jmv_url and not warning_text_url:
                continue

            # Find the storm header text that precedes this <ul> in the flat text
            # Use the TC Warning Text link text as an anchor (it's always present)
            anchor_link = ul.find("a", href=True)
            anchor_text = anchor_link.get_text(strip=True) if anchor_link else ""
            pos         = flat.find(anchor_text)
            preceding   = flat[:pos] if pos > 0 else flat
            matches     = list(header_pat.finditer(preceding))
            header_text = matches[-1].group(1).strip() if matches else preceding[-200:].strip()

            results.append({
                "basin_label":       basin,
                "storm_header_text": header_text,
                "jmv_url":           jmv_url,
                "warning_text_url":  warning_text_url,
                "feed_pub_date":     pub_date,
            })

    return results

# ---------------------------------------------------------------------------
# TCW file parser
# ---------------------------------------------------------------------------
def parse_tcw(raw: str) -> dict:
    """
    Parse a JTWC JMV 3.0 (.tcw) file.

    Returns a dict with:
      storm_id, storm_name, warning_number, issued_dt,
      movement_direction, movement_speed,
      current  : {lat, lon, wind, gusts, mslp, radii, move_dir, move_spd}
      forecasts: [{tau_h, valid_dt, lat, lon, wind, gusts, radii,
                   move_dir, move_spd, dissipating}]
      history  : [{valid_dt, lat, lon, wind}]
      is_final : bool
    """
    lines = raw.splitlines()
    result = {}

    # ------------------------------------------------------------------ #
    # 1.  Storm info line: '2026041000 04W SINLAKU    005  01 250 03 ...' #
    # ------------------------------------------------------------------ #
    info_pat = re.compile(
        r"^(20\d{8})\s+(\d+[WPSBECLA])\s+(\S+)\s+(\d+)\s+\d+\s+(\d+)\s+(\d+)",
        re.IGNORECASE,
    )
    for line in lines:
        m = info_pat.match(line.strip())
        if m:
            result["issued_dt"]          = parse_info_dt(m.group(1))
            result["storm_id"]           = m.group(2).upper()
            result["storm_name"]         = m.group(3).capitalize()
            result["warning_number"]     = int(m.group(4))
            result["movement_direction"] = int(m.group(5))
            result["movement_speed"]     = int(m.group(6))
            break

    # ------------------------------------------------------------------ #
    # 2.  T-lines: current (T000) + forecast (T012 … T120)               #
    #     Format: T{tau} {lat}{N|S} {lon}{E|W} {wind}                    #
    #             [R{thr} {ne} NE QD {se} SE QD {sw} SW QD {nw} NW QD]  #
    # ------------------------------------------------------------------ #
    t_pat   = re.compile(r"^T(\d{3})\s+(\d+)([NS])\s+(\d+)([EW])\s+(\d+)(.*)", re.IGNORECASE)
    rad_pat = re.compile(r"R(\d{3})\s+(\d+)\s+NE QD\s+(\d+)\s+SE QD\s+(\d+)\s+SW QD\s+(\d+)\s+NW QD",
                         re.IGNORECASE)
    t_entries = {}  # tau_h → {lat, lon, wind, radii}

    for line in lines:
        m = t_pat.match(line.strip())
        if not m:
            continue
        tau   = int(m.group(1))
        lat   = round(float(m.group(2)) / 10 * (1 if m.group(3).upper()=="N" else -1), 1)
        lon   = round(float(m.group(4)) / 10 * (1 if m.group(5).upper()=="E" else -1), 1)
        wind  = int(m.group(6))
        rest  = m.group(7)
        radii = []
        for rm in rad_pat.finditer(rest):
            ws   = int(rm.group(1))
            ne,se,sw,nw = int(rm.group(2)),int(rm.group(3)),int(rm.group(4)),int(rm.group(5))
            radii.append({
                "wind_speed": ws,
                "ne": ne if ne > 0 else None,
                "se": se if se > 0 else None,
                "sw": sw if sw > 0 else None,
                "nw": nw if nw > 0 else None,
            })
        t_entries[tau] = {"lat": lat, "lon": lon, "wind": wind, "radii": radii}

    # ------------------------------------------------------------------ #
    # 3.  Text section: gusts (per tau), movement vectors, MSLP, final   #
    # ------------------------------------------------------------------ #
    # Gusts — extract in order; first = current position, rest = forecast taus
    gusts_all = [int(g) for g in re.findall(r"GUSTS\s+(\d+)\s+KT", raw, re.IGNORECASE)]

    # Movement vectors for forecast blocks:
    # "VECTOR TO NNN HR POSIT: DDD DEG/ SS KTS"  (appears after each forecast block)
    vector_pat = re.compile(r"VECTOR TO\s+(\d+)\s+HR POSIT:\s*(\d+)\s+DEG/\s*(\d+)\s+KT", re.IGNORECASE)
    # Map: {next_tau_h: (dir, spd)} — vector in block at tau T points toward tau T+12
    # We'll store as list in order and pair with forecast taus
    vectors = [(int(m.group(1)), int(m.group(2)), int(m.group(3)))
               for m in vector_pat.finditer(raw)]
    # vectors[i] = (next_tau, dir, spd), so movement AT tau vectors[i][0]-12
    # Build dict: tau → (dir, spd)
    vector_map = {}
    for (next_tau, direction, speed) in vectors:
        current_tau = next_tau - 12
        vector_map[current_tau] = (direction, speed)

    # MSLP from REMARKS
    result["mslp"] = None
    m = re.search(r"MINIMUM CENTRAL PRESSURE AT \d{6}Z IS (\d{3,4}) MB", raw, re.IGNORECASE)
    if m:
        result["mslp"] = int(m.group(1))

    # Is final warning?
    result["is_final"] = bool(re.search(r"FINAL WARNING", raw, re.IGNORECASE))

    # Dissipating taus — find "NNN HR" before "DISSIPAT" in AMP / text section
    dissipating_taus = set()
    for dm in re.finditer(r"(\d+)HR\s+DISSIPAT|DISSIPAT[^.]*?(\d+)\s*HRS?", raw, re.IGNORECASE):
        tau_val = dm.group(1) or dm.group(2)
        if tau_val:
            dissipating_taus.add(int(tau_val))
    # Also detect within forecast blocks that contain "DISSIPAT"
    for block_m in re.finditer(
        r"(\d+)\s+HRS?,\s+VALID\s+AT:.*?(?=\d+\s+HRS?,|\Z)", raw, re.DOTALL | re.IGNORECASE
    ):
        if re.search(r"DISSIPAT", block_m.group(0), re.IGNORECASE):
            dissipating_taus.add(int(block_m.group(1)))

    # ------------------------------------------------------------------ #
    # 4.  Build current (T000) and forecast entries                       #
    # ------------------------------------------------------------------ #
    issued_dt = result.get("issued_dt")

    # Current position (T000)
    t0 = t_entries.get(0, {})
    result["current"] = {
        "lat":   t0.get("lat"),
        "lon":   t0.get("lon"),
        "wind":  t0.get("wind"),
        "gusts": gusts_all[0] if gusts_all else None,
        "mslp":  result["mslp"],
        "radii": t0.get("radii", []),
        "move_dir": result.get("movement_direction"),
        "move_spd": result.get("movement_speed"),
    }

    # Forecast positions
    sorted_taus = sorted(k for k in t_entries if k > 0)
    forecasts = []
    gust_idx  = 1  # index into gusts_all for forecasts
    for tau in sorted_taus:
        te = t_entries[tau]
        valid_dt = resolve_forecast_dt(
            (issued_dt + __import__("datetime").timedelta(hours=tau)).strftime("%d%H00"),
            issued_dt,
        ) if issued_dt else None
        mv = vector_map.get(tau, (None, None))
        forecasts.append({
            "tau_h":        tau,
            "valid_dt":     valid_dt,
            "lat":          te["lat"],
            "lon":          te["lon"],
            "wind":         te["wind"],
            "gusts":        gusts_all[gust_idx] if gust_idx < len(gusts_all) else None,
            "radii":        te["radii"],
            "move_dir":     mv[0],
            "move_spd":     mv[1],
            "dissipating":  tau in dissipating_taus,
        })
        gust_idx += 1
    result["forecasts"] = forecasts

    # ------------------------------------------------------------------ #
    # 5.  Historical track lines                                          #
    #     Format: {nn}{yy}{MM}{DD}{HH}  {lat_x10}{N|S}{lon_x10}{E|W}    #
    # ------------------------------------------------------------------ #
    hist_pat = re.compile(
        r"^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s+(\d+)([NS])(\d{4})([EW])\s+(\d+)\s*$"
    )
    seen = set()
    history = []
    for line in lines:
        m = hist_pat.match(line.strip())
        if not m:
            continue
        nn, yy, mm, dd, hh = m.group(1),m.group(2),m.group(3),m.group(4),m.group(5)
        lat = round(int(m.group(6)) / 10 * (1 if m.group(7).upper()=="N" else -1), 1)
        lon = round(int(m.group(8)) / 10 * (1 if m.group(9).upper()=="E" else -1), 1)
        wind = int(m.group(10))
        dt   = parse_history_dt(nn, yy, mm, dd, hh)
        key  = dt.isoformat()
        if key in seen:
            continue
        seen.add(key)
        history.append({"valid_dt": dt, "lat": lat, "lon": lon, "wind": wind})

    history.sort(key=lambda x: x["valid_dt"])
    result["history"] = history

    return result


# ---------------------------------------------------------------------------
# TC Warning Text (.web.txt) fallback parser
# Produces the same dict structure as parse_tcw() but without history rows.
# ---------------------------------------------------------------------------
def _parse_radii_text(block: str) -> list[dict]:
    """
    Extract wind radii from a verbose text block, e.g.:
      RADIUS OF 064 KT WINDS - 040 NM NORTHEAST QUADRANT
                               040 NM SOUTHEAST QUADRANT
                               040 NM SOUTHWEST QUADRANT
                               040 NM NORTHWEST QUADRANT
    """
    radii = []
    pat = re.compile(
        r"RADIUS OF (\d+) KT WINDS\s*[-–]\s*(\d+)\s+NM\s+NORTHEAST QUADRANT\s*\n"
        r"\s*(\d+)\s+NM\s+SOUTHEAST QUADRANT\s*\n"
        r"\s*(\d+)\s+NM\s+SOUTHWEST QUADRANT\s*\n"
        r"\s*(\d+)\s+NM\s+NORTHWEST QUADRANT",
        re.IGNORECASE,
    )
    for m in pat.finditer(block):
        ws = int(m.group(1))
        ne, se, sw, nw = int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5))
        radii.append({
            "wind_speed": ws,
            "ne": ne if ne > 0 else None,
            "se": se if se > 0 else None,
            "sw": sw if sw > 0 else None,
            "nw": nw if nw > 0 else None,
        })
    return radii


def parse_warning_text(raw: str, ref_year: int, ref_month: int) -> dict:
    """
    Fallback parser for TC Warning Text (.web.txt) files.
    Returns the same structure as parse_tcw() with history=[] and
    date_start derived from issued_dt only.
    """
    result: dict = {"history": [], "source": "warning_text"}

    # ── Storm metadata from SUBJ line ──
    m = re.search(
        r"SUBJ/?\s*(SUPER TYPHOON|TYPHOON|TROPICAL STORM|TROPICAL DEPRESSION"
        r"|TROPICAL CYCLONE|SUBTROPICAL STORM|CYCLONE|SEVERE TROPICAL STORM)"
        r"\s+(\w+)(?:\s+\((\w+)\))?\s+WARNING\s+NR\s+(\d+)",
        raw, re.IGNORECASE,
    )
    if m:
        result["storm_id"]       = m.group(2).upper()
        result["storm_name"]     = (m.group(3) or "").capitalize()
        result["warning_number"] = int(m.group(4))

    # ── Warning position datetime and lat/lon ──
    m = re.search(
        r"WARNING POSITION:\s*\n\s*(\d{6})Z\s*---\s*NEAR\s+([\d.]+)([NS])\s+([\d.]+)([EW])",
        raw, re.IGNORECASE,
    )
    if m:
        dtg = m.group(1)           # e.g. "100000"
        try:
            day, hour = int(dtg[:2]), int(dtg[2:4])
            result["issued_dt"] = datetime(ref_year, ref_month, day, hour, 0, tzinfo=timezone.utc)
        except ValueError:
            result["issued_dt"] = None
        lat_sign = 1 if m.group(3).upper() == "N" else -1
        lon_sign = 1 if m.group(5).upper() == "E" else -1
        cur_lat  = round(float(m.group(2)) * lat_sign, 1)
        cur_lon  = round(float(m.group(4)) * lon_sign, 1)
    else:
        cur_lat = cur_lon = None
        result["issued_dt"] = None

    # ── Movement (MOVEMENT PAST SIX HOURS - DDD DEGREES AT SS KTS) ──
    m = re.search(
        r"MOVEMENT PAST\s+\w+\s+HOURS?\s*[-–]\s*(\d+)\s+DEGREES?\s+AT\s+(\d+)\s+KT",
        raw, re.IGNORECASE,
    )
    result["movement_direction"] = int(m.group(1)) if m else None
    result["movement_speed"]     = int(m.group(2)) if m else None

    # ── Current winds and gusts (first occurrence in PRESENT WIND DISTRIBUTION) ──
    gusts_all = [int(g) for g in re.findall(r"GUSTS\s+(\d+)\s+KT", raw, re.IGNORECASE)]
    m = re.search(r"MAX SUSTAINED WINDS\s*[-–]\s*(\d+)\s+KT", raw, re.IGNORECASE)
    cur_wind  = int(m.group(1)) if m else None

    # Radii for current position (up to the FORECASTS: line)
    pre_fcst_end = raw.find("FORECASTS:") if "FORECASTS:" in raw.upper() else len(raw)
    cur_radii = _parse_radii_text(raw[:pre_fcst_end])

    # ── MSLP from REMARKS ──
    m = re.search(r"MINIMUM CENTRAL PRESSURE AT \d{6}Z IS (\d{3,4}) MB", raw, re.IGNORECASE)
    result["mslp"] = int(m.group(1)) if m else None

    # ── Is final warning? ──
    result["is_final"] = bool(re.search(r"FINAL WARNING", raw, re.IGNORECASE))

    # ── Current position entry ──
    result["current"] = {
        "lat":      cur_lat,
        "lon":      cur_lon,
        "wind":     cur_wind,
        "gusts":    gusts_all[0] if gusts_all else None,
        "mslp":     result["mslp"],
        "radii":    cur_radii,
        "move_dir": result["movement_direction"],
        "move_spd": result["movement_speed"],
    }

    # ── Movement vectors per forecast tau ──
    vector_map = {}
    for vm in re.finditer(
        r"VECTOR TO\s+(\d+)\s+HR POSIT:\s*(\d+)\s+DEG/\s*(\d+)\s+KT", raw, re.IGNORECASE
    ):
        vector_map[int(vm.group(1)) - 12] = (int(vm.group(2)), int(vm.group(3)))

    # ── Dissipating taus ──
    dissipating_taus: set[int] = set()
    for block_m in re.finditer(
        r"(\d+)\s+HRS?,\s+VALID\s+AT:.*?(?=\d+\s+HRS?,\s+VALID|\Z)", raw, re.DOTALL | re.IGNORECASE
    ):
        if re.search(r"DISSIPAT", block_m.group(0), re.IGNORECASE):
            dissipating_taus.add(int(block_m.group(1)))

    # ── Forecast blocks ──
    #  Format: "12 HRS, VALID AT:\n101200Z --- 8.4S 154.2E\nMAX SUSTAINED WINDS - 060 KT, GUSTS 075 KT\n..."
    fcst_pat = re.compile(
        r"(\d+)\s+HRS?,\s+VALID\s+AT:\s*\n\s*(\d{6})Z\s*---\s*([\d.]+)([NS])\s+([\d.]+)([EW])",
        re.IGNORECASE,
    )
    issued_dt  = result.get("issued_dt")
    forecasts  = []
    gust_idx   = 1
    fcst_positions = [(m2.start(), m2.end(), m2) for m2 in fcst_pat.finditer(raw)]

    for idx, (seg_start, seg_end, m2) in enumerate(fcst_positions):
        tau_h    = int(m2.group(1))
        dtg6     = m2.group(2)          # e.g. "101200"
        lat_sign = 1 if m2.group(4).upper() == "N" else -1
        lon_sign = 1 if m2.group(6).upper() == "E" else -1
        f_lat    = round(float(m2.group(3)) * lat_sign, 1)
        f_lon    = round(float(m2.group(5)) * lon_sign, 1)

        # Resolve valid datetime
        if issued_dt:
            valid_dt = resolve_forecast_dt(dtg6, issued_dt)
        else:
            try:
                d, h = int(dtg6[:2]), int(dtg6[2:4])
                valid_dt = datetime(ref_year, ref_month, d, h, 0, tzinfo=timezone.utc)
            except ValueError:
                valid_dt = None

        # Slice this forecast block
        block_end = fcst_positions[idx + 1][0] if idx + 1 < len(fcst_positions) else len(raw)
        block     = raw[seg_end:block_end]

        # Winds and gusts
        wm     = re.search(r"MAX SUSTAINED WINDS\s*[-–]\s*(\d+)\s+KT", block, re.IGNORECASE)
        f_wind = int(wm.group(1)) if wm else None
        f_gust = gusts_all[gust_idx] if gust_idx < len(gusts_all) else None

        # Radii
        f_radii = _parse_radii_text(block)

        # Movement
        mv = vector_map.get(tau_h, (None, None))

        forecasts.append({
            "tau_h":       tau_h,
            "valid_dt":    valid_dt,
            "lat":         f_lat,
            "lon":         f_lon,
            "wind":        f_wind,
            "gusts":       f_gust,
            "radii":       f_radii,
            "move_dir":    mv[0],
            "move_spd":    mv[1],
            "dissipating": tau_h in dissipating_taus,
        })
        gust_idx += 1

    result["forecasts"] = forecasts
    return result


# ---------------------------------------------------------------------------
# Output format builder
# ---------------------------------------------------------------------------
def iso(dt: datetime | None) -> str | None:
    return dt.isoformat().replace("+00:00", "Z") if dt else None

def build_output(meta: dict, parsed: dict, year: int) -> dict:
    storm_id  = parsed.get("storm_id", "")
    number, suffix = parse_storm_suffix(storm_id)
    atcf_id   = build_atcf_id(storm_id, year)
    basin     = SUFFIX_TO_BASIN.get(suffix, "XX")
    subbasin  = SUFFIX_TO_SUBBASIN.get(suffix, "MM")
    issued_dt = parsed.get("issued_dt")
    warn_nr   = parsed.get("warning_number")
    is_final  = (parsed.get("is_final", False)
                 or bool(re.search(r"Final\s+Warning", meta.get("storm_header_text",""), re.IGNORECASE)))
    is_active = not is_final

    # Storm-level peak (history + current + forecasts)
    all_winds = (
        [h["wind"] for h in parsed.get("history", [])]
        + ([parsed["current"]["wind"]] if parsed.get("current", {}).get("wind") else [])
        + [f["wind"] for f in parsed.get("forecasts", []) if f["wind"]]
    )
    peak_wind = max(all_winds) if all_winds else None
    peak_cat  = wind_to_category(peak_wind)

    # date_start = first history entry (or issued_dt)
    history = parsed.get("history", [])
    date_start = iso(history[0]["valid_dt"]) if history else iso(issued_dt)

    # ---- Build track list ----
    track = []

    # A) Historical observed entries
    for h in history:
        hdt = h["valid_dt"]
        track_id = f"{atcf_id}|observed|{hdt.strftime('%Y-%m-%d %H:%M:%S')}+00:00"
        track.append({
            "track_id":              track_id,
            "track_kind":            "observed",
            "is_forecast":           False,
            "track_advisory_number": warn_nr,
            "issued_at":             None,
            "valid_time":            iso(hdt),
            "forecast_hour":         None,
            "lat":                   h["lat"],
            "lon":                   h["lon"],
            "category_code":         wind_to_category(h["wind"]),
            "wind_gusts":            None,
            "max_sustained_wind":    h["wind"],
            "min_mslp":              None,
            "movement_direction":    None,
            "movement_speed":        None,
            "radii":                 [],
        })

    # B) Current position (T000) — update if already in history, else append
    cur = parsed.get("current", {})
    if issued_dt and cur.get("lat") is not None:
        cur_id = f"{atcf_id}|observed|{issued_dt.strftime('%Y-%m-%d %H:%M:%S')}+00:00"
        cur_entry = {
            "track_id":              cur_id,
            "track_kind":            "observed",
            "is_forecast":           False,
            "track_advisory_number": warn_nr,
            "issued_at":             None,
            "valid_time":            iso(issued_dt),
            "forecast_hour":         None,
            "lat":                   cur["lat"],
            "lon":                   cur["lon"],
            "category_code":         wind_to_category(cur["wind"]),
            "wind_gusts":            cur["gusts"],
            "max_sustained_wind":    cur["wind"],
            "min_mslp":              cur["mslp"],
            "movement_direction":    cur["move_dir"],
            "movement_speed":        cur["move_spd"],
            "radii":                 cur["radii"],
        }
        # Replace history entry for same timestamp if present (richer data)
        replaced = False
        for i, t in enumerate(track):
            if t["track_id"] == cur_id:
                track[i] = cur_entry
                replaced = True
                break
        if not replaced:
            track.append(cur_entry)

    # C) Forecast entries
    for fcst in parsed.get("forecasts", []):
        vdt = fcst["valid_dt"]
        if issued_dt and vdt:
            fcst_id = (
                f"{atcf_id}|forecast"
                f"|{issued_dt.strftime('%Y-%m-%d %H:%M:%S')}+00:00"
                f"|{vdt.strftime('%Y-%m-%d %H:%M:%S')}+00:00"
            )
        else:
            fcst_id = f"{atcf_id}|forecast|{iso(vdt)}"

        track.append({
            "track_id":              fcst_id,
            "track_kind":            "forecast",
            "is_forecast":           True,
            "track_advisory_number": warn_nr,
            "issued_at":             iso(issued_dt),
            "valid_time":            iso(vdt),
            "forecast_hour":         fcst["tau_h"],
            "lat":                   fcst["lat"],
            "lon":                   fcst["lon"],
            "category_code":         wind_to_category(fcst["wind"], fcst["dissipating"]),
            "wind_gusts":            fcst["gusts"],
            "max_sustained_wind":    fcst["wind"],
            "min_mslp":              None,
            "movement_direction":    fcst["move_dir"],
            "movement_speed":        fcst["move_spd"],
            "radii":                 fcst["radii"],
        })

    return {
        "atcf_id":                 atcf_id,
        "storm_name":              parsed.get("storm_name", ""),
        "basin":                   basin,
        "subbasin":                subbasin,
        "season":                  year,
        "is_active":               is_active,
        "advisory_number":         warn_nr,
        "advisory_issuance_time":  iso(issued_dt),
        "max_development_category": peak_cat,
        "storm_max_sustained_wind": peak_wind,
        "storm_min_mslp":          parsed.get("mslp"),
        "date_start":              date_start,
        "date_end":                iso(issued_dt) if is_final else None,
        "track":                   track,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def scrape_jtwc() -> dict:
    print(f"Fetching RSS feed: {RSS_URL}\n")
    rss_text = fetch(RSS_URL)
    if not rss_text:
        return {"code": "0x1", "error": "Failed to fetch RSS feed", "data": []}

    # Reference year/month from RSS pubDate
    root = ET.fromstring(rss_text)
    pub_el = root.find(".//pubDate")
    pub_str = pub_el.text.strip() if pub_el is not None else ""
    now = datetime.now(timezone.utc)
    ref_year, ref_month = now.year, now.month
    m = re.search(r"\d{2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})",
                  pub_str, re.IGNORECASE)
    if m:
        MONTHS = {v:i for i,v in enumerate(
            ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],1)}
        ref_month = MONTHS.get(m.group(1)[:3].capitalize(), ref_month)
        ref_year  = int(m.group(2))

    links = get_storm_links(rss_text)
    if not links:
        print("No active storm links found — no active tropical cyclones.")
        return {"code": "0x0", "error": None, "data": []}

    print(f"Found {len(links)} active storm(s):\n")
    data = []

    for i, link in enumerate(links, 1):
        print(f"  [{i}] {link['storm_header_text'][:80]}")
        print(f"       Basin       : {link['basin_label']}")
        print(f"       JMV URL     : {link['jmv_url'] or 'N/A'}")
        print(f"       Warning URL : {link['warning_text_url'] or 'N/A'}")

        parsed = None
        source = None

        # ── Try JMV 3.0 first ──
        if link["jmv_url"]:
            raw = fetch(link["jmv_url"])
            if raw:
                parsed = parse_tcw(raw)
                source = "JMV 3.0 (.tcw)"

        # ── Fall back to TC Warning Text ──
        if parsed is None and link["warning_text_url"]:
            print(f"       [!] JMV unavailable — falling back to TC Warning Text")
            raw = fetch(link["warning_text_url"])
            if raw:
                parsed = parse_warning_text(raw, ref_year, ref_month)
                source = "TC Warning Text (.txt) [fallback]"

        if parsed is None:
            print(f"       [!] Both sources unavailable — skipping\n")
            continue

        entry  = build_output(link, parsed, ref_year)
        n_obs  = sum(not t["is_forecast"] for t in entry["track"])
        n_fcst = sum(    t["is_forecast"] for t in entry["track"])

        print(f"       Source  : {source}")
        print(f"       ATCF    : {entry['atcf_id']}  basin={entry['basin']}  subbasin={entry['subbasin']}")
        print(f"       Storm   : {parsed.get('storm_id','')} ({entry['storm_name']})  Warn#{entry['advisory_number']}")
        print(f"       Issued  : {entry['advisory_issuance_time']}")
        print(f"       Wind    : {entry['storm_max_sustained_wind']} kt peak  ({entry['max_development_category']})")
        print(f"       MSLP    : {entry['storm_min_mslp']} mb  |  active={entry['is_active']}")
        print(f"       Track   : {len(entry['track'])} pts  ({n_obs} observed + {n_fcst} forecast)")
        print(f"       Start   : {entry['date_start']}")
        print()

        data.append(entry)

    return {"code": "0x0", "error": None, "data": data}


def save(output: dict, output_dir: str) -> None:
    out  = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    ts   = datetime.now(timezone.utc).strftime("%Y%m%d_%H%MZ")
    path = out / f"jtwc_warnings_{ts}.json"
    path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Saved -> {path}")


if __name__ == "__main__":
    import sys
    output_dir = sys.argv[1] if len(sys.argv) > 1 else "jtwc_output"
    output = scrape_jtwc()
    save(output, output_dir)
    n = len(output.get("data", []))
    print(f"\nDone. {n} active warning(s) saved to '{output_dir}/'")
