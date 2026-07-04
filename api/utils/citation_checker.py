"""
Citation Checker — Validasi Sitasi dalam Artikel
===================================================
Memeriksa konsistensi sitasi antara isi artikel dan daftar referensi.

Deteksi:
- hallucinated: Sitasi [ref_xxx] yang ada di teks tapi TIDAK ada di daftar referensi
  (artinya LLM mengarang ID referensi yang tidak exist)
- uncited: Referensi yang ada di daftar tapi TIDAK pernah disitasi di teks
  (referensi yang "mubazir" — tidak digunakan)

Digunakan oleh file_writer.py saat export artikel untuk menampilkan warning.
"""

import re


def extract_inline_citations(text: str) -> set[str]:
    """Ekstrak semua ID sitasi [ref_xxx] dari teks."""
    found = set()
    for m in re.finditer(r"\[([ref_\d,\s]+)\]", text):
        for part in m.group(1).split(","):
            part = part.strip()
            if re.match(r"ref_\d+", part):
                found.add(part)
    return found


def check_citations(sections: list[dict], references: list[dict]) -> dict:
    """
    Bandingkan sitasi inline vs daftar referensi.

    Returns dict:
    - all_inline: semua ID yang ditemukan di teks
    - hallucinated: ID yang ada di teks tapi tidak di referensi (LLM ngarang)
    - uncited: ID referensi yang tidak pernah disitasi
    - total_inline / total_hallucinated: counts
    """
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
