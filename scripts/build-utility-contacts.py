# Usage: python3 scripts/build-utility-contacts.py "docs/Utility Dept Contact Info.docx"
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
OUT = "src/lib/utilityContacts.data.json"


def ptext(p):
    out = []
    for el in p.iter():
        if el.tag == W + "t":
            out.append(el.text or "")
        elif el.tag in (W + "br", W + "cr"):
            out.append("\n")
        elif el.tag == W + "tab":
            out.append(" ")
    return "".join(out)


def cell(tc):
    return "\n".join(ptext(p) for p in tc.findall(W + "p")).strip()


def read_items(path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    items = []
    for el in root.find(W + "body"):
        if el.tag == W + "p":
            t = ptext(el).strip()
            if t:
                items.append(("p", t))
        elif el.tag == W + "tbl":
            rows = [[cell(tc) for tc in tr.findall(W + "tc")] for tr in el.findall(W + "tr")]
            items.append(("t", rows))
    return items


def squash(s):
    return re.sub(r"\s+", " ", s).strip(" /,")


def phone_of(s):
    # Drop a trailing labelled number.
    s = re.sub(r"^[A-Za-z ]+:\s*", "", squash(s))  # "GrandBridge: 1-877-…"
    if not re.search(r"\d", s):
        return ""
    s = re.split(r"\s[A-Za-z]+:\s", s)[0]
    return squash(re.sub(r"(\s+[A-Za-z]+)+$", "", s) if re.search(r"\d", s) else s)


def service_of(first):
    f = first.lower()
    tax = "tax" in f
    water = "water" in f or "sewer" in f
    hydro = "hydro" in f or "power" in f or "energy" in f or "electric" in f
    if tax and water:
        return "Property tax and water"
    if tax:
        return "Property tax"
    if water and hydro:
        return "Water and hydro"
    if water:
        return "Water"
    if hydro:
        return "Hydro"
    return None


VERIFY = re.compile(r"verify|depends|depending|possibly|\bor\b|generally", re.I)


def hydro_provider(lines):
    first = lines[0]
    # e.g. "Hydro – Alectra Utilities".
    m = re.split(r"\s*[–\-:]\s*", first, maxsplit=1)
    name = m[1] if len(m) > 1 else ""
    name = re.sub(r"^(hydro department\s*[–\-:]?\s*)", "", name, flags=re.I)
    name = re.sub(r"^hydro\s*[–\-]\s*", "", name, flags=re.I).strip()
    if name.startswith("(") and name.endswith(")"):
        name = name[1:-1]
    if not name or name.lower() in ("department", "hydro department"):
        # Provider on the next line: "Hydro Department\nElexicon Energy Inc."
        name = lines[1] if len(lines) > 1 else ""
    if re.match(r"^(toronto hydro|greater sudbury hydro|welland hydro-electric|hydro one)", first, re.I):
        name = first
    # "Alectra Utilities / Hydro – Alectra Utilities" -> "Alectra Utilities"
    parts = [squash(re.sub(r"^(water|hydro)\s*[–\-]\s*", "", x.strip(), flags=re.I)) for x in name.split("/")]
    name = parts[0] if len(set(p.lower() for p in parts)) == 1 else " / ".join(parts)
    # Verify wording goes in the flag.
    name = squash(re.sub(r"\s*[–—;-]?\s*\(?\b(verify|depend\w*|possibly)\b.*$", "", name, flags=re.I))
    # An address line is not a provider.
    if name.lower() in ("department", "dept") or re.search(r"\d|p\.?\s?o\.?\s?box", name, re.I):
        return ""
    return name


def title(name):
    keep = {"of", "and", "&"}
    words = re.split(r"(\s+|/|-)", name.lower())
    return "".join(w if w.lower() in keep else w[:1].upper() + w[1:] for w in words)


def aliases(heading):
    base = re.split(r"\s+-\s+", heading)[0]
    parts = re.split(r"[/()]", base)
    out = set()
    for p in parts:
        p = re.sub(r"^(town(ship)? of|county of|city of|municipality of)\s+", "", p.strip(), flags=re.I)
        p = re.sub(r"\s+(county|township)$", "", p, flags=re.I)
        if p:
            out.add(p.strip().lower())
    return sorted(out)


# Correct spellings for names the document gets wrong.
EXTRA_ALIASES = {
    "st. catherines": ["st. catharines"],
    "kirkland lakes": ["kirkland lake"],
    "trent hill": ["trent hills"],
}


def build(path):
    items = read_items(path)
    result, seen = [], set()
    heading = None
    for kind, v in items:
        if kind == "p":
            # The heading is the paragraph right before its table.
            heading = v
            continue
        if not heading:
            continue
        note = (re.split(r"\s+-\s+", heading, maxsplit=1) + [""])[1].strip()
        client_all = bool(re.search(r"stopped accepting|no notice", note, re.I))
        rows = []
        for r in v[1:]:
            lines = [l.strip() for l in r[0].split("\n") if l.strip()]
            if not lines:
                continue
            service = service_of(lines[0])
            if not service:
                continue
            if r[1].strip().upper() == "N/A":
                continue
            calls = client_all or "client" in r[2].lower()
            row = {"service": service, "phone": phone_of(r[1])}
            if "hydro" in service.lower():
                provider = hydro_provider(lines)
                if provider:
                    row["provider"] = provider
                if VERIFY.search(r[0]):
                    row["verify"] = True
            row["clientCalls"] = calls
            rows.append(row)
        name = title(re.split(r"\s+-\s+", heading)[0].split("(")[0].strip())
        key = name.lower()
        if (rows or client_all) and key not in seen:
            seen.add(key)
            names = aliases(heading)
            names += [x for n in names for x in EXTRA_ALIASES.get(n, [])]
            entry = {"name": name, "aliases": sorted(set(names)), "rows": rows}
            if client_all:
                entry["clientContactsAll"] = True
            result.append(entry)
        heading = None
    return result


if __name__ == "__main__":
    data = build(sys.argv[1])
    with open(OUT, "w") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"{len(data)} municipalities -> {OUT}")
