import re


def extract_inline_citations(text: str) -> set[str]:
    """Ekstrak semua [ref_xxx] dari teks."""
    # match [ref_001] atau [ref_001, ref_002]
    found = set()
    for m in re.finditer(r"\[([ref_\d,\s]+)\]", text):
        for part in m.group(1).split(","):
            part = part.strip()
            if re.match(r"ref_\d+", part):
                found.add(part)
    return found


def check_citations(sections: list[dict], references: list[dict]) -> dict:
    valid_ids = {r["id"] for r in references}

    all_inline = set()
    for sec in sections:
        all_inline |= extract_inline_citations(sec.get("content", ""))

    hallucinated = sorted(all_inline - valid_ids)
    uncited = sorted(valid_ids - all_inline)

    return {
        "all_inline": sorted(all_inline),
        "hallucinated": hallucinated,
        "uncited": uncited,
        "total_inline": len(all_inline),
        "total_hallucinated": len(hallucinated),
    }
