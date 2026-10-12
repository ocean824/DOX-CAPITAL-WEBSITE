"""Loan underwriting pre-screening checklist — source of truth for client document readiness.

Derived verbatim from the D.O.X "Loan Underwriting Pre-Screening Checklist" (Sections 1-8).
Pure data + pure functions only; no DB or FastAPI imports so server.py can own the routes.
"""
from typing import Any, Dict, List, Optional

TRACKS = {
    "pre_revenue": "Pre-Revenue / Development",
    "operating": "Profitable Operating Company",
}

# track: "all" | "pre_revenue" | "operating"
SECTIONS: List[Dict[str, Any]] = [
    {
        "id": "s1",
        "number": "1",
        "title": "Borrower Identification",
        "track": "all",
        "items": [
            {"id": "borrower_application", "title": "Completed borrower application", "required": True,
             "note": "Legal name, DBA, entity type, state of incorporation, EIN and principal contact."},
            {"id": "entity_docs", "title": "Certificate of formation / incorporation", "required": True,
             "note": "Plus operating agreement or bylaws and any DBA registration."},
            {"id": "ein_letter", "title": "EIN confirmation letter", "required": True,
             "note": "IRS CP-575 or equivalent."},
        ],
    },
    {
        "id": "s1a",
        "number": "1A",
        "title": "Ownership Structure — every owner with ≥10% stake",
        "track": "all",
        "items": [
            {"id": "owner_resumes", "title": "Resume for each ≥10% owner", "required": True, "note": None},
            {"id": "owner_pfs", "title": "Personal financial statement for each ≥10% owner", "required": True, "note": None},
            {"id": "owner_id", "title": "Passport or driver's licence copy for each ≥10% owner", "required": True, "note": None},
        ],
    },
    {
        "id": "s2",
        "number": "2",
        "title": "Loan Request Details",
        "track": "all",
        "items": [
            {"id": "debt_schedule", "title": "Current debt schedule", "required": True,
             "note": "All business and personal obligations with balances and monthly payments."},
            {"id": "existing_loan_docs", "title": "Statements for existing mortgages / loans on the collateral", "required": False, "note": None},
        ],
    },
    {
        "id": "s3",
        "number": "3",
        "title": "Down Payment / Equity Requirement",
        "track": "all",
        "items": [
            {"id": "proof_of_funds", "title": "Proof of funds for the required equity", "required": True,
             "note": "Standard is 20% minimum for pre-revenue deals."},
            {"id": "equity_source_statement", "title": "Wire confirmation or bank statement evidencing the equity", "required": True,
             "note": "Funds must be immediately available; state the source."},
        ],
    },
    {
        "id": "s4",
        "number": "4",
        "title": "Collateral Assets",
        "track": "all",
        "items": [
            {"id": "collateral_schedule", "title": "Collateral schedule", "required": True,
             "note": "Addresses, parcel IDs, zoning, equipment serial numbers, AR / inventory listings."},
            {"id": "collateral_valuation", "title": "Preliminary valuation or broker opinion of value", "required": True, "note": None},
            {"id": "title_commitment", "title": "Title commitment / title search", "required": True,
             "note": "Mark N/A if the collateral is not real property."},
            {"id": "environmental_report", "title": "Environmental report (Phase I)", "required": False,
             "note": "Required for most project sites and industrial property."},
        ],
    },
    {
        "id": "s5a",
        "number": "5A",
        "title": "Pre-Revenue Development Track",
        "track": "pre_revenue",
        "items": [
            {"id": "permits", "title": "Zoning, building, environmental and utility approvals", "required": True,
             "note": "Include dates secured; pending permits are a red flag."},
            {"id": "plans", "title": "Architectural plans, engineering drawings and site plan", "required": True, "note": None},
            {"id": "specs_boq", "title": "Specifications / bill of quantities", "required": False, "note": None},
            {"id": "proforma_5y", "title": "Pro forma financials — 5-year minimum", "required": True, "note": None},
            {"id": "construction_budget", "title": "Construction budget — hard and soft costs", "required": True,
             "note": "Must carry a contingency allocation of at least 10%."},
            {"id": "timeline", "title": "Completion timeline / construction schedule", "required": True, "note": None},
            {"id": "gc_bid", "title": "General contractor bid or quote", "required": True, "note": None},
            {"id": "gc_license", "title": "GC licence and insurance certificates", "required": True, "note": None},
            {"id": "exit_strategy", "title": "Exit strategy memo", "required": True,
             "note": "Sale on completion, refinance on stabilisation, or long-term hold with expected NOI."},
        ],
    },
    {
        "id": "s5b",
        "number": "5B",
        "title": "Profitable Operating Company Track",
        "track": "operating",
        "items": [
            {"id": "audited_financials", "title": "3 years audited financial statements", "required": True, "note": None},
            {"id": "ytd_financials", "title": "Current-year YTD financials", "required": True, "note": None},
            {"id": "business_tax_returns", "title": "Last 2 years federal business tax returns", "required": True, "note": None},
            {"id": "personal_tax_returns", "title": "Last 2 years federal personal tax returns — all owners", "required": True, "note": None},
            {"id": "bank_statements", "title": "Bank statements — all accounts, last 12 months", "required": True, "note": None},
            {"id": "ar_aging", "title": "Accounts receivable aging report", "required": True,
             "note": "Highlight balances under 90 days."},
            {"id": "ap_aging", "title": "Accounts payable aging report", "required": True, "note": None},
            {"id": "sales_ledgers", "title": "Sales ledgers / revenue documentation", "required": False, "note": None},
            {"id": "loan_agreements", "title": "Loan agreements for all existing debt", "required": True, "note": None},
            {"id": "payment_history", "title": "Evidence of payment history", "required": True,
             "note": "No defaults or late payments."},
            {"id": "proforma_impact", "title": "Pro forma showing the impact of the new loan", "required": True, "note": None},
            {"id": "use_of_proceeds", "title": "Use of proceeds — how the funds increase profitability", "required": True, "note": None},
            {"id": "customer_concentration", "title": "Customer concentration schedule", "required": True,
             "note": "Top three customers as a % of revenue; mitigating factors if the top 3 exceed 60%."},
        ],
    },
    {
        "id": "s6",
        "number": "6",
        "title": "Risk Assessment",
        "track": "all",
        "items": [
            {"id": "credit_reports", "title": "Business and personal credit reports", "required": True,
             "note": "Experian or Dun & Bradstreet for the business, plus every ≥10% owner."},
            {"id": "legal_disclosure", "title": "Litigation, bankruptcy, lien and disciplinary disclosure", "required": True,
             "note": "Signed statement with details of anything pending."},
        ],
    },
]

# Key numbers the client enters; the red-flag gates below calculate from them.
METRICS: List[Dict[str, Any]] = [
    {"id": "loan_amount", "label": "Total loan amount requested", "type": "currency", "track": "all"},
    {"id": "collateral_value", "label": "Total collateral value", "type": "currency", "track": "all"},
    {"id": "equity_pct", "label": "Equity / down payment available", "type": "percent", "track": "all"},
    {"id": "contingency_pct", "label": "Contingency allocation in the construction budget", "type": "percent", "track": "pre_revenue"},
    {"id": "permits_secured", "label": "All required permits secured", "type": "bool", "track": "pre_revenue"},
    {"id": "gc_identified", "label": "General contractor engaged", "type": "bool", "track": "pre_revenue"},
    {"id": "proforma_y1_positive", "label": "Pro forma shows positive Year 1 cash flow", "type": "bool", "track": "pre_revenue"},
    {"id": "noi", "label": "Net operating income (annual)", "type": "currency", "track": "operating"},
    {"id": "annual_debt_service", "label": "Annual debt service post-loan", "type": "currency", "track": "operating"},
    {"id": "net_income_positive_2y", "label": "Positive net income in each of the last 2 years", "type": "bool", "track": "operating"},
    {"id": "judgments_or_liens", "label": "Outstanding judgments, IRS or government liens", "type": "bool", "track": "operating", "invert": True},
    {"id": "taxes_current", "label": "All tax returns filed and taxes current", "type": "bool", "track": "operating"},
]

MIN_EQUITY_PCT = 20.0
MIN_DSCR = 1.25
MIN_COVERAGE_PCT = 125.0
MIN_CONTINGENCY_PCT = 10.0


def sections_for(track: Optional[str]) -> List[Dict[str, Any]]:
    return [s for s in SECTIONS if s["track"] == "all" or s["track"] == track]


def metrics_for(track: Optional[str]) -> List[Dict[str, Any]]:
    return [m for m in METRICS if m["track"] == "all" or m["track"] == track]


def _num(metrics: Dict[str, Any], key: str) -> Optional[float]:
    v = metrics.get(key)
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def computed_ratios(metrics: Dict[str, Any]) -> Dict[str, Optional[float]]:
    loan = _num(metrics, "loan_amount")
    coll = _num(metrics, "collateral_value")
    noi = _num(metrics, "noi")
    ads = _num(metrics, "annual_debt_service")
    return {
        "ltv": round(loan / coll * 100, 1) if loan and coll else None,
        "coverage": round(coll / loan * 100, 1) if loan and coll else None,
        "dscr": round(noi / ads, 2) if noi and ads else None,
    }


def _flag(fid: str, label: str, state: str, detail: str = "") -> Dict[str, str]:
    return {"id": fid, "label": label, "state": state, "detail": detail}


def red_flags(track: Optional[str], metrics: Dict[str, Any], item_status: Dict[str, str]) -> List[Dict[str, str]]:
    """state: 'open' (must resolve), 'clear', or 'unknown' (data not supplied yet)."""
    r = computed_ratios(metrics)
    out: List[Dict[str, str]] = []

    eq = _num(metrics, "equity_pct")
    if eq is None:
        out.append(_flag("equity", f"At least {MIN_EQUITY_PCT:.0f}% equity available", "unknown", "Equity percentage not supplied."))
    else:
        out.append(_flag("equity", f"At least {MIN_EQUITY_PCT:.0f}% equity available",
                         "clear" if eq >= MIN_EQUITY_PCT else "open", f"{eq:g}% supplied."))

    cov = r["coverage"]
    if cov is None:
        out.append(_flag("coverage", f"Collateral coverage of at least {MIN_COVERAGE_PCT:.0f}%", "unknown", "Loan amount or collateral value not supplied."))
    else:
        out.append(_flag("coverage", f"Collateral coverage of at least {MIN_COVERAGE_PCT:.0f}%",
                         "clear" if cov >= MIN_COVERAGE_PCT else "open", f"{cov:g}% coverage · LTV {r['ltv']:g}%."))

    def bool_flag(fid: str, key: str, label: str, want: bool = True, detail_open: str = ""):
        v = metrics.get(key)
        if v is None:
            out.append(_flag(fid, label, "unknown", "Not yet confirmed."))
        else:
            out.append(_flag(fid, label, "clear" if bool(v) is want else "open", detail_open if bool(v) is not want else ""))

    def doc_flag(fid: str, item_id: str, label: str):
        st = item_status.get(item_id, "missing")
        out.append(_flag(fid, label, "clear" if st in ("received", "verified") else "open",
                         "Document not received." if st not in ("received", "verified") else ""))

    if track == "pre_revenue":
        bool_flag("permits", "permits_secured", "Permits and approvals secured", True, "Permits are not yet secured.")
        doc_flag("budget", "construction_budget", "Detailed construction budget on file")
        cont = _num(metrics, "contingency_pct")
        if cont is None:
            out.append(_flag("contingency", f"Contingency allocation of at least {MIN_CONTINGENCY_PCT:.0f}%", "unknown", "Not supplied."))
        else:
            out.append(_flag("contingency", f"Contingency allocation of at least {MIN_CONTINGENCY_PCT:.0f}%",
                             "clear" if cont >= MIN_CONTINGENCY_PCT else "open", f"{cont:g}% allocated."))
        bool_flag("gc", "gc_identified", "General contractor engaged", True, "No general contractor lined up.")
        bool_flag("proforma", "proforma_y1_positive", "Pro forma shows positive Year 1 cash flow", True,
                  "Pro forma shows negative Year 1 cash flow.")
    elif track == "operating":
        bool_flag("net_income", "net_income_positive_2y", "Positive net income in the last 2 years", True,
                  "Negative net income reported in the last 2 years.")
        d = r["dscr"]
        if d is None:
            out.append(_flag("dscr", f"Debt service coverage ratio of at least {MIN_DSCR}x", "unknown", "NOI or annual debt service not supplied."))
        else:
            out.append(_flag("dscr", f"Debt service coverage ratio of at least {MIN_DSCR}x",
                             "clear" if d >= MIN_DSCR else "open", f"{d:g}x calculated."))
        bool_flag("judgments", "judgments_or_liens", "No outstanding judgments or liens", False,
                  "Outstanding judgments or liens exist.")
        bool_flag("taxes", "taxes_current", "Tax returns filed and taxes current", True,
                  "Tax returns not filed or taxes owed.")

    return out


def evaluate(track: Optional[str], metrics: Dict[str, Any], item_status: Dict[str, str]) -> Dict[str, Any]:
    required_ids = [
        i["id"] for s in sections_for(track) for i in s["items"] if i["required"]
    ]
    received = [i for i in required_ids if item_status.get(i) in ("received", "verified")]
    verified = [i for i in required_ids if item_status.get(i) == "verified"]
    flags = red_flags(track, metrics, item_status)
    open_flags = [f for f in flags if f["state"] != "clear"]
    pct = round(len(received) / len(required_ids) * 100) if required_ids else 0
    return {
        "track": track,
        "computed": computed_ratios(metrics),
        "red_flags": flags,
        "open_flag_count": len(open_flags),
        "score": {
            "required_total": len(required_ids),
            "received": len(received),
            "verified": len(verified),
            "pct": pct,
        },
        "ready": bool(track) and pct == 100 and not open_flags,
    }


def as_markdown() -> str:
    """The checklist as a single SOP document for the Workspace knowledge vault."""
    lines = [
        "# Loan Underwriting Pre-Screening Checklist (D.O.X source of truth)",
        "",
        "Purpose: filter incoming loan inquiries. This checklist must be complete before any deal "
        "is submitted to the underwriting desk. Every red-flag item must be resolved before an "
        "offer is issued. Treat this document as authoritative when advising on required client "
        "documentation or deal readiness.",
        "",
        f"Thresholds: minimum equity {MIN_EQUITY_PCT:.0f}% · minimum DSCR {MIN_DSCR}x · "
        f"minimum collateral coverage {MIN_COVERAGE_PCT:.0f}% · minimum construction contingency "
        f"{MIN_CONTINGENCY_PCT:.0f}%.",
        "",
        "Tracks: 5A Pre-Revenue / Development and 5B Profitable Operating Company are mutually "
        "exclusive — complete only the one that matches the borrower.",
        "",
    ]
    for s in SECTIONS:
        scope = {"all": "all borrowers", "pre_revenue": "pre-revenue track only",
                 "operating": "operating-company track only"}[s["track"]]
        lines.append(f"## Section {s['number']} — {s['title']} ({scope})")
        for i in s["items"]:
            req = "REQUIRED" if i["required"] else "optional"
            lines.append(f"- [{req}] {i['title']}" + (f" — {i['note']}" if i.get("note") else ""))
        lines.append("")
    lines.append("## Key figures captured from the borrower")
    for m in METRICS:
        lines.append(f"- {m['label']} ({m['type']}, {m['track']} track)")
    lines.append("")
    lines.append("## Red-flag gates (must be resolved before submission)")
    lines += [
        f"- Equity available below {MIN_EQUITY_PCT:.0f}%",
        f"- Collateral coverage below {MIN_COVERAGE_PCT:.0f}% (loan-to-value too high)",
        "- Pre-revenue: permits not secured; no detailed construction budget; "
        f"contingency under {MIN_CONTINGENCY_PCT:.0f}%; no general contractor engaged; "
        "pro forma shows negative Year 1 cash flow",
        "- Operating company: negative net income in the last 2 years; "
        f"DSCR below {MIN_DSCR}x; outstanding judgments or liens; tax returns not filed or taxes owed",
        "",
        "## Outcomes",
        "- COMPLETE — ready for underwriter review",
        "- INCOMPLETE — missing items must be listed and chased",
        "- NOT ELIGIBLE — does not meet minimum requirements",
        "- REQUIRES SENIOR APPROVAL — exception requested",
    ]
    return "\n".join(lines)
