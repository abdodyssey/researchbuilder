"""
Agent 5.5: Draft Adapter — Adaptasi Draft ke Format Jurnal Target
===================================================================
Mengadaptasi setiap section artikel agar sesuai dengan panduan format
jurnal target (JournalConstraints dari template_parser).

Dijalankan SETELAH Agent 5 (Writing) dan SEBELUM Agent 6 (Review).
Hanya aktif jika user mengupload template jurnal target.

Prinsip utama:
- PERTAHANKAN semua konten asli (tidak boleh mengurangi/meringkas)
- PERTAHANKAN semua sitasi yang sudah ada
- Yang berubah: gaya bahasa (lebih akademis), struktur paragraf, judul section
- Jika ada isu dari reviewer (pass kedua), perbaiki section yang bermasalah
- Section yang tidak ada di template tapi required → ditambah sebagai placeholder

Fitur:
- Per-section adaptation: setiap section diadaptasi satu per satu ke LLM
- Missing section detection: cek required_sections vs existing sections (fuzzy match)
- Section name mapping: mengenali sinonim antar bahasa (e.g. "Pendahuluan" = "Introduction")
- Fallback: jika LLM gagal adapt satu section, gunakan konten asli
"""

from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import JournalConstraints
from utils.prompt_builder import build_system_prompt
from utils.token_counter import truncate_to_tokens
from utils.llm_client import call_llm, extract_json

SYSTEM = build_system_prompt("expert academic manuscript adapter and restructuring specialist")


@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def _adapt_section(
    section: dict,
    constraints: JournalConstraints,
    bahasa: str,
    tema: str,
    required_sections: list[str],
    all_sections_overview: str,
    section_issues: list[str] = None,
) -> dict:
    """
    Adaptasi satu section ke format jurnal target.
    Dipanggil oleh run() untuk setiap section secara berurutan.
    """
    content = section.get("content", "")
    word_count = len(content.split())

    issues_text = ""
    if section_issues:
        issues_text = "\nMASALAH & PERBAIKAN YANG HARUS DISELESAIKAN DI SECTION INI:\n" + "\n".join(f"- {issue}" for issue in section_issues)

    user_msg = f"""
Kamu adalah editor naskah akademik profesional.
Tugas: Adaptasi section draf berikut agar sesuai dengan panduan format jurnal target.

PENTING - ATURAN UTAMA:
- PERTAHANKAN SELURUH konten, argumen, data, dan sitasi dari draf asli secara LENGKAP dan AKURAT
- JANGAN membuang, meringkas, atau menghilangkan bagian apapun dari konten asli
- JANGAN mengarang data, fakta, atau referensi baru yang tidak ada di konten asli
- JANGAN mengubah atau menerjemahkan judul section khusus seperti "Abstrak" menjadi "Abstract" or sebaliknya agar format dwi-bahasa (bilingual) tetap terjaga
- Yang boleh diubah: struktur paragraf, gaya bahasa agar lebih akademis, urutan penyajian
- Semua sitasi yang ada (format apapun: (Author, Year), [1], [ref_001], dll) HARUS dipertahankan

SECTION YANG HARUS DIADAPTASI:
Judul: "{section.get('title', '')}"
Jumlah kata asli: {word_count} kata
{issues_text}

Konten asli:
{content}

PANDUAN FORMAT JURNAL TARGET:
- Gaya sitasi: {constraints.citation_style}
- Format abstrak: {constraints.abstract_format} (maks {constraints.abstract_max_words} kata)
- Bahasa: {"Bahasa Indonesia" if bahasa == "id" else "English"}
- Section wajib jurnal: {required_sections}
- Catatan tambahan: {constraints.additional_notes}

TOPIK ARTIKEL: {tema}

SELURUH SECTION DALAM DRAF: {all_sections_overview}

TUGAS SPESIFIK:
1. Sesuaikan gaya bahasa menjadi akademis formal sesuai standar jurnal
2. Perbaiki struktur paragraf agar mengalir logis
3. Pertahankan SEMUA konten substantif — jangan kurangi
4. Pertahankan SEMUA sitasi/referensi yang sudah ada
5. Sesuaikan judul section jika perlu agar cocok dengan template jurnal
6. Hasil adaptasi harus memiliki jumlah kata MINIMAL sama atau lebih dari aslinya ({word_count} kata)

Balas HANYA JSON valid:
{{
  "section_id": "{section.get('section_id', section.get('id', ''))}",
  "title": "judul section yang sudah disesuaikan dengan format jurnal",
  "content": "SELURUH konten section yang sudah diadaptasi dalam paragraf markdown - harus lengkap",
  "word_count": 0,
  "citations_used": []
}}
"""
    raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.2,
        max_tokens=8000,
        agent="draft_adaptation",
    )
    data = extract_json(raw)
    data["word_count"] = len(data.get("content", "").split())
    if "citations_used" not in data:
        data["citations_used"] = []
    return data


def run(
    draft_sections: list[dict],
    constraints: JournalConstraints,
    bahasa: str,
    tema: str,
    issues: list[dict] = None,
) -> list[dict]:
    """
    Adaptasi seluruh draft ke format jurnal target.

    Flow:
    1. Iterasi setiap section → panggil _adapt_section()
    2. Filter isu reviewer yang relevan per section (by title matching)
    3. Jika adapt gagal (exception), fallback ke konten asli
    4. Cek missing sections: jika required_section tidak ada di draft → tambah placeholder

    Args:
        draft_sections: List section dari Agent 5 (Writing)
        constraints: JournalConstraints dari template_parser
        bahasa: "id" atau "en"
        tema: Topik artikel (untuk konteks LLM)
        issues: Isu dari reviewer (opsional, untuk pass revisi kedua)

    Returns:
        List section yang sudah diadaptasi
    """
    required_sections = constraints.required_sections or []

    all_titles = [sec.get("title", "Untitled") for sec in draft_sections]
    overview = ", ".join(all_titles)

    adapted = []
    for sec in draft_sections:
        # Filter issues belonging to this section by title matching
        section_issues = []
        if issues:
            sec_title_lower = sec.get("title", "").lower()
            for iss in issues:
                loc = iss.get("location", "").lower()
                if loc and (loc in sec_title_lower or sec_title_lower in loc):
                    section_issues.append(f"[{iss.get('severity', 'info').upper()}] {iss.get('description', '')} -> Saran: {iss.get('suggestion', '')}")

        try:
            result = _adapt_section(
                section=sec,
                constraints=constraints,
                bahasa=bahasa,
                tema=tema,
                required_sections=required_sections,
                all_sections_overview=overview,
                section_issues=section_issues,
            )
            adapted.append(result)
        except Exception as e:
            adapted.append({
                "section_id": sec.get("section_id", sec.get("id", "")),
                "title": sec.get("title", ""),
                "content": sec.get("content", ""),
                "word_count": len(sec.get("content", "").split()),
                "citations_used": sec.get("citations_used", []),
            })

    if required_sections:
        existing_titles_lower = [s.get("title", "").lower() for s in adapted]
        section_mapping = {
            "introduction": ["pendahuluan", "latar belakang", "introduction"],
            "literature": ["kajian pustaka", "tinjauan pustaka", "literature review", "landasan teori"],
            "method": ["metode", "metodologi", "methodology", "methods", "materials"],
            "result": ["hasil", "pembahasan", "results", "discussion", "findings"],
            "conclusion": ["kesimpulan", "penutup", "conclusion", "saran"],
            "references": ["daftar pustaka", "references", "pustaka"],
        }

        for req_sec in required_sections:
            req_lower = req_sec.lower()
            found = False
            for title_lower in existing_titles_lower:
                if req_lower in title_lower or title_lower in req_lower:
                    found = True
                    break
                for _key, synonyms in section_mapping.items():
                    if any(s in req_lower for s in synonyms) and any(s in title_lower for s in synonyms):
                        found = True
                        break
                if found:
                    break

            if not found and "reference" not in req_lower and "daftar pustaka" not in req_lower:
                adapted.append({
                    "section_id": f"sec_missing_{len(adapted)}",
                    "title": req_sec,
                    "content": f"[Section ini diperlukan oleh template jurnal target namun belum tersedia dalam draf Anda. Silakan lengkapi bagian {req_sec} sebelum melakukan submission.]",
                    "word_count": 0,
                    "citations_used": [],
                })

    return adapted
