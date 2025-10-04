# services/ai_service.py
import json, os, re, httpx
from typing import List, Dict, Any, Optional
from firebase.firebase_config import db

# -------- Helpers (new/updated) --------

def _safe_str(x):
    return "" if x is None else str(x)

def _int_or_none(x):
    try:
        return int(x)
    except Exception:
        return None

def _order_key_from_docid(doc_id: str) -> int:
    """
    Fallback order if the 'order' field is missing.
    For ids like 'location_0', returns 0, else 999999.
    """
    if not doc_id:
        return 999_999
    if "_" in doc_id:
        n = _int_or_none(doc_id.split("_")[-1])
        if n is not None:
            return n
    return 999_999

def _load_case_locations(case_id: str):
    """Fetches locations subcollection, returns a list ordered by 'order' (or by doc id suffix)."""
    loc_ref = db.collection("cases").document(case_id).collection("locations")
    # Firestore Admin SDK: .order_by is valid; we also tolerate missing 'order' by sorting in Python.
    loc_docs = list(loc_ref.stream())  # each is a DocumentSnapshot

    raw = []
    for d in loc_docs:
        data = d.to_dict() or {}
        raw.append({
            "__doc_id": d.id,
            **data,
        })

    # Prefer 'order' if present; else parse number from doc id like 'location_7'
    raw.sort(key=lambda r: (r.get("order") if isinstance(r.get("order"), int) else _order_key_from_docid(r.get("__doc_id"))))
    return raw

# --- in services/ai_service.py ---
def _build_report_block(case_id: str, cdata: dict) -> dict:
    """
    Builds a 'report' block by combining case-level fields and the locations subcollection.
    Respects 'selectedForReport' indices against the ORDERED locations list.
    """
    intro      = _safe_str(cdata.get("reportIntro", "")).strip()
    conclusion = _safe_str(cdata.get("reportConclusion", "")).strip()
    selected   = cdata.get("selectedForReport") or []
    titles_ovr = cdata.get("locationTitles") or []

    # NEW: pull evidence & technical terms (always arrays)
    evidence_items   = cdata.get("evidenceItems") or []
    technical_terms  = cdata.get("technicalTerms") or []

    # Pull locations subcollection
    locs = _load_case_locations(case_id)

    # If no explicit selection, default to all in order
    if not isinstance(selected, list) or len(selected) == 0:
        selected = list(range(len(locs)))

    report_locs = []
    for i in selected:
        if not isinstance(i, int) or i < 0 or i >= len(locs):
            continue
        loc = locs[i] or {}

        # Title priority: explicit override array > doc.title > originalData.rawData.Name > address > fallback
        if i < len(titles_ovr) and titles_ovr[i]:
            title = titles_ovr[i]
        else:
            title = (
                loc.get("title")
                or (loc.get("originalData") or {}).get("rawData", {}).get("Name")
                or loc.get("address")
                or f"Location {i+1}"
            )

        pretty_addr = (loc.get("originalData") or {}).get("rawData", {}).get("Name")
        address = loc.get("address") or pretty_addr

        report_locs.append({
            "index": i,
            "title": title,
            "address": address,
            "lat": loc.get("lat"),
            "lng": loc.get("lng"),
            "timestamp": loc.get("timestamp") or _safe_str(loc.get("createdAt", "")),
            "description": loc.get("description") or "",
            "mapSnapshotUrl": loc.get("mapSnapshotUrl"),
            "streetViewSnapshotUrl": loc.get("streetViewSnapshotUrl"),
            "ignitionStatus": loc.get("ignitionStatus"),
        })

    has_any = bool(intro or conclusion or report_locs or evidence_items or technical_terms)
    return {
        "hasContent": has_any,
        "intro": intro,
        "conclusion": conclusion,
        # NEW: include arrays in the report block
        "evidence": evidence_items,
        "technicalTerms": technical_terms,
        "locations": report_locs,
    }


def _case_can_be_seen_by_user(case_dict: dict, user_id: str, user_role: str) -> bool:
    """Admins can see everything; others only their own."""
    if user_role == "admin":
        return True
    return case_dict.get("userID") == user_id

def build_briefing_payload(user_id: str, user_role: str, case_ids: List[str]) -> Dict[str, Any]:
    cases = []
    for cid in case_ids:
        cdoc = db.collection("cases").document(cid).get()
        if not cdoc.exists:
            continue
        cdata = cdoc.to_dict() or {}

        if not _case_can_be_seen_by_user(cdata, user_id, user_role):
            # silently skip cases the user can’t see
            continue

        rollup_doc = db.collection("cases").document(cid).collection("derived").document("rollup").get()
        rollup = rollup_doc.to_dict() if rollup_doc.exists else {}

        # NEW: pull saved report content (intro, conclusion, selected locations)
        report = _build_report_block(cid, cdata)

        cases.append({
            "caseId": cid,
            "title": cdata.get("caseTitle"),
            "caseNumber": cdata.get("caseNumber"),
            "region": cdata.get("region"),
            "status": cdata.get("status"),
            "urgency": cdata.get("urgency"),
            "rollup": rollup,
            "report": report
        })

    return {
        "userId": user_id,
        "cases": cases
    }

# --- in services/ai_service.py ---
def _render_prompt(payload: Dict[str, Any]) -> str:
    system = (
        "You are a forensic case summarizer. Use ONLY the provided data. "
        "If a case includes a 'report' block (intro, evidence, technicalTerms, locations, conclusion), "
        "treat that as the primary source. Use 'rollup' only as a fallback/complement. "
        "Cite caseIds and timestamps in-line when referencing events. "
        "Be concise, bullet-point heavy, and action-oriented."
    )
    user = (
        "Create an investigator briefing. Prioritize the saved *report* content if present; "
        "otherwise use the *rollup*. For each case include:\n"
        "• Overview: title, caseNumber, region, status, urgency\n"
        "• Key points from the report intro\n"
        "• Evidence list (use numbering if provided)\n"
        "• Technical terms (define briefly if unclear)\n"
        "• Per selected report location: title/address, coords, timestamp, brief description\n"
        "• Conclusion highlights\n"
        "• If report is missing: summarize from rollup (stops, longest dwell, active hours, anomalies)\n"
        "• Cross-case overlaps (same or near-identical locations) if any\n"
        "• 2–3 suggested next actions with rationale\n\n"
        "Data (JSON):\n" + json.dumps(payload, separators=(',',':'))
    )
    return f"<<SYS>>\n{system}\n<</SYS>>\n{user}"


def _normalize_summary(text: str) -> str:
    if not text:
        return ""

    lines: List[str] = []
    for line in text.splitlines():
        stripped = line.strip()

        # Detect unordered bullet marker before removing it
        has_bullet = bool(re.match(r'^[\*\-\+]\s+', stripped))

        # Remove markdown headings, blockquotes, and bullet markers
        stripped = re.sub(r'^#{1,6}\s*', '', stripped)
        stripped = re.sub(r'^[\*\-\+]\s+', '', stripped)
        stripped = re.sub(r'^>\s*', '', stripped)

        # Remove emphasis markers but keep inner text
        stripped = re.sub(r'\*{2}(.*?)\*{2}', r'\1', stripped)
        stripped = re.sub(r'_(.*?)_', r'\1', stripped)
        stripped = re.sub(r'\*(.*?)\*', r'\1', stripped)

        # Collapse extra whitespace
        stripped = re.sub(r'\s{2,}', ' ', stripped).strip()

        if has_bullet and stripped:
            stripped = f"• {stripped}"

        lines.append(stripped)

    return "\n".join(lines).strip()


# -------- Backends --------

async def call_ollama(prompt: str, model: str = None) -> str:
    """
    Calls a local Ollama server. Default model can be set via AI_MODEL env var.
    Run ollama locally: `ollama run llama3.1:8b-instruct-q8_0`
    """
    model = model or os.getenv("AI_MODEL", "llama3.1:8b-instruct-q8_0")
    url = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json={"model": model, "prompt": prompt, "stream": False})
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", "").strip()

async def call_openai(prompt: str, model: str = None) -> str:
    """
    Calls OpenAI Chat Completions (requires OPENAI_API_KEY).
    """
    model = model or os.getenv("AI_MODEL", "gpt-4o-mini")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    headers = {"Authorization": f"Bearer {api_key}"}
    url = "https://api.openai.com/v1/chat/completions"
    messages = [
        {"role": "system", "content": "You are a forensic case summarizer. Only use provided facts."},
        {"role": "user", "content": prompt}
    ]
    body = {"model": model, "messages": messages, "temperature": 0.2}

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()

# --- in services/ai_service.py ---
async def generate_briefing_markdown(
    user_id: str,
    user_role: str,
    case_ids: List[str],
    backend: Optional[str] = None,
) -> str:
    payload = build_briefing_payload(user_id, user_role, case_ids)
    if not payload["cases"]:
        return "No accessible cases were provided."

    prompt = _render_prompt(payload)

    backend_choice = (backend or os.getenv("AI_BACKEND", "ollama")).lower()
    if backend_choice == "openai":
        raw = await call_openai(prompt)
    elif backend_choice == "ollama":
        raw = await call_ollama(prompt)
    else:
        # Fallback baseline (no LLM): prefer report content; else rollup
        lines = ["# Briefing (baseline, no-LLM)", ""]
        for c in payload["cases"]:
            r = c.get("rollup", {}) or {}
            rep = (c.get("report") or {})
            rep_locs = rep.get("locations") or []
            ev  = rep.get("evidence") or []
            tts = rep.get("technicalTerms") or []

            lines += [
                f"## {c.get('title') or 'Untitled'} ({c['caseId']})",
                f"- Case Number: {c.get('caseNumber')}",
                f"- Region / Status / Urgency: {c.get('region')} / {c.get('status')} / {c.get('urgency')}",
            ]

            if rep.get("hasContent"):
                if rep.get("intro"):
                    lines.append(f"- Intro: {rep['intro'][:240]}{'…' if len(rep['intro'])>240 else ''}")

                if ev:
                    lines.append("- Evidence:")
                    for i, item in enumerate(ev, 1):
                        lines.append(f"  {i}. {str(item)[:200]}{'…' if len(str(item))>200 else ''}")

                if tts:
                    lines.append("- Technical Terms:")
                    for i, term in enumerate(tts, 1):
                        lines.append(f"  {i}. {str(term)[:120]}{'…' if len(str(term))>120 else ''}")

                if rep_locs:
                    lines.append(f"- Selected locations: {len(rep_locs)}")
                    for loc in rep_locs[:5]:
                        lines.append(f"  • {loc.get('title')}  @({loc.get('lat')},{loc.get('lng')})  {loc.get('timestamp') or ''}")
                        if loc.get('description'):
                            lines.append(f"    – {loc['description'][:160]}{'…' if len(loc['description'])>160 else ''}")

                if rep.get("conclusion"):
                    lines.append(f"- Conclusion: {rep['conclusion'][:240]}{'…' if len(rep['conclusion'])>240 else ''}")
            else:
                lines.append(f"- Points: {r.get('totalPoints', 'n/a')} | Stops: {r.get('stopCount','n/a')}")
                ld = r.get("longestDwell")
                if ld:
                    lines.append(f"- Longest dwell: {ld.get('seconds')}s at ({ld.get('lat')},{ld.get('lng')}) {ld.get('start')} → {ld.get('end')}")
                if r.get("activeHoursBuckets"):
                    lines.append(f"- Active hours: {', '.join(r['activeHoursBuckets'])}")
                if r.get("anomalies"):
                    lines.append(f"- Anomalies: {len(r['anomalies'])}")

            lines.append("")  # spacer between cases
        raw = "\n".join(lines)

    return _normalize_summary(raw)
