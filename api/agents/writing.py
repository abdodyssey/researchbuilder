"""
Agent 5: Writing
==================
Tulis konten tiap section artikel berdasarkan outline yang sudah disusun.

Fitur utama:
- Per-section writing: setiap section ditulis independen dengan referensi yang relevan
- Reference filtering: hanya referensi yang relevan dengan section yg dikirim ke LLM
- Citation validation: sitasi yang dihasilkan LLM divalidasi terhadap daftar referensi global
- Methodology guard: khusus section metodologi, ada instruksi tambahan agar tidak mengarang
- Chain-of-thought: LLM diminta lakukan fact_extraction dulu sebelum menulis (reduce hallucination)

Input: WritingInput (section + context + references)
Output: WritingSectionOutput (section_id, title, content, word_count, citations_used)
"""

import json
import re
from tenacity import retry, stop_after_attempt, wait_fixed
from schemas.agent_schemas import WritingInput, WritingOutput, WritingSectionOutput
from utils.prompt_builder import build_system_prompt
from utils.token_counter import truncate_to_tokens
from utils.llm_client import call_llm, extract_json

SYSTEM_JSON = build_system_prompt("academic writer producing formal research article sections")
SYSTEM_PROSE = build_system_prompt("academic writer producing formal research article sections", output_format="Markdown")


def get_relevant_references(section, all_references, top_n=8) -> list:
    """
    Filter referensi: hanya kirim yang relevan ke LLM untuk section ini.
    Mencegah prompt overflow dan mengurangi hallucination sitasi.

    Strategi:
      1. Prioritaskan referensi yang di-assign eksplisit di outline (references_to_cite)
      2. Jika belum cukup top_n, cari referensi dengan keyword overlap tertinggi
         (cocokkan title + key_points section dengan title + snippet referensi)
    """
    explicit_ids = []
    if hasattr(section, "references_to_cite") and section.references_to_cite:
        for r_id in section.references_to_cite:
            cleaned = re.sub(r'[^a-zA-Z0-9_]', '', r_id).lower().strip()
            explicit_ids.append(cleaned)
            
    relevant_refs = []
    seen_ids = set()
    
    # Prioritize explicit references
    for ref in all_references:
        ref_dict = ref.model_dump() if hasattr(ref, "model_dump") else ref
        ref_id = ref_dict.get("id", "").lower().strip()
        clean_ref_id = re.sub(r'[^a-zA-Z0-9_]', '', ref_id)
        if ref_id in explicit_ids or clean_ref_id in explicit_ids:
            relevant_refs.append(ref)
            seen_ids.add(ref_id)
            
    # If we need more references to reach top_n, or if no explicit references are found,
    # find references with highest keyword overlap with the section title and key points
    if len(relevant_refs) < top_n:
        query_text = (section.title + " " + " ".join(section.key_points)).lower()
        query_words = set(re.findall(r'\w+', query_text))
        
        scored_refs = []
        for ref in all_references:
            ref_dict = ref.model_dump() if hasattr(ref, "model_dump") else ref
            ref_id = ref_dict.get("id", "").lower().strip()
            if ref_id in seen_ids:
                continue
                
            ref_title = ref_dict.get("title", "").lower()
            ref_snippet = ref_dict.get("snippet", "").lower()
            ref_words = set(re.findall(r'\w+', ref_title + " " + ref_snippet))
            
            overlap = len(query_words.intersection(ref_words))
            scored_refs.append((overlap, ref))
            
        # Sort by overlap score descending
        scored_refs.sort(key=lambda x: x[0], reverse=True)
        
        # Append top scoring references
        for _, ref in scored_refs:
            if len(relevant_refs) >= top_n:
                break
            ref_dict = ref.model_dump() if hasattr(ref, "model_dump") else ref
            ref_id = ref_dict.get("id", "").lower().strip()
            relevant_refs.append(ref)
            seen_ids.add(ref_id)
            
    return relevant_refs


def sanitize_citations(content: str, allowed_ids: set) -> str:
    """
    Validasi semua sitasi [ref_xxx] di dalam konten.
    Hapus sitasi yang ID-nya tidak ada di daftar referensi global (allowed_ids).
    Mencegah LLM mengarang ID referensi yang tidak exist.
    """
    def replace_fn(match):
        parts = match.group(1).split(",")
        valid_parts = []
        for p in parts:
            p_clean = p.strip()
            if p_clean.lower() in allowed_ids:
                valid_parts.append(p_clean)
        if not valid_parts:
            return ""
        return "[" + ", ".join(valid_parts) + "]"
    
    # Match any brackets containing ref_xxx
    cleaned = re.sub(r'\[([ref_\d,\s\-\+]+)\]', replace_fn, content)
    # Clean up empty brackets
    cleaned = cleaned.replace("[]", "")
    return cleaned


def refs_to_citation_list(references) -> str:
    """
    Format daftar referensi menjadi teks yang dikirim ke LLM.
    Tiap referensi menampilkan: ID, Penulis, Tahun, Judul, Isi (max 3000 char).
    Format ini memudahkan LLM mengutip dengan ID yang benar.
    """
    lines = []
    for r in references:
        ref = r.model_dump() if hasattr(r, "model_dump") else r
        content_to_show = ref.get("raw_content") or ref.get("snippet") or ""
        lines.append(
            f"ID: {ref['id']}\n"
            f"Penulis: {ref.get('author', 'Anonim')} ({ref.get('year', 'n.d.')})\n"
            f"Judul: {ref['title']}\n"
            f"Isi Referensi: {content_to_show[:3000]}"
        )
    return "\n\n".join(lines)


@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def write_section(inp: WritingInput, template_text: str = "", constraints=None) -> WritingSectionOutput:
    relevant_refs = get_relevant_references(inp.section, inp.references_detail, top_n=8)

    refs_text = refs_to_citation_list(relevant_refs)
    refs_text = truncate_to_tokens(refs_text, 12000)

    global_allowed_ids = {
        r.id.lower().strip() if hasattr(r, "id") else r.get("id", "").lower().strip()
        for r in inp.references_detail
    }

    title_lower = inp.section.title.lower()
    is_methodology = any(x in title_lower for x in [
        "method", "metode", "metodologi", "literature search",
        "metode pencarian",
    ])
    methodology_instruction = ""
    if is_methodology:
        methodology_instruction = """
KHUSUS UNTUK SECTION METODE/METODOLOGI:
- Jika ini adalah literature review: jelaskan protokol pencarian (database, kata kunci, kriteria inklusi/eksklusi). JANGAN mengarang survei, kuesioner, atau wawancara lapangan fiktif.
- Jika ini adalah empirical study: jelaskan desain, sampel, instrumen, dan metode analisis secara realistis.
- Jika ini adalah conceptual: jelaskan pendekatan analisis konseptual dan sumber literatur yang digunakan.
- DILARANG KERAS mengarang data responden, eksperimen, atau instrumen yang tidak nyata."""

    # === PASS 1: Fact Extraction (JSON) ===
    fact_prompt = f"""Ekstrak fakta-fakta spesifik dari referensi berikut yang relevan untuk menulis section "{inp.section.title}".

Section purpose: {inp.section.purpose}
Key points yang harus dibahas:
{chr(10).join(f"- {p}" for p in inp.section.key_points)}

DAFTAR REFERENSI:
{refs_text}

Untuk setiap fakta, sertakan ID referensi sumbernya. Fokus pada data kuantitatif, temuan spesifik, definisi, dan argumen kunci.

Return JSON:
{{
  "facts": [
    {{"fact": "deskripsi fakta spesifik", "ref_ids": ["ref_001"]}},
    {{"fact": "fakta lainnya", "ref_ids": ["ref_002", "ref_003"]}}
  ]
}}"""

    facts_raw = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM_JSON},
            {"role": "user", "content": fact_prompt},
        ],
        temperature=0.2,
        max_tokens=2000,
        agent="writing",
    )
    facts_data = extract_json(facts_raw)
    facts_list = facts_data.get("facts", [])

    facts_text = ""
    for i, f in enumerate(facts_list, 1):
        refs_str = ", ".join(f.get("ref_ids", []))
        facts_text += f"{i}. {f.get('fact', '')} [{refs_str}]\n"

    # === PASS 2: Prose Writing (Markdown) ===
    constraints_text = ""
    if constraints:
        abstract_note = ""
        if "abstrak" in inp.section.title.lower() or "abstract" in inp.section.title.lower():
            abstract_note = f"PENTING: Abstrak maksimal {constraints.abstract_max_words} kata. Format: {constraints.abstract_format}. Tanpa sitasi."

        constraints_text = f"""
PANDUAN JURNAL:
{abstract_note}
- Format sitasi: {constraints.citation_style}
- Jika butuh tabel: gunakan format markdown tabel (| col | col |)
- Jika butuh gambar/grafik: tulis [FIGURE: deskripsi gambar yang dibutuhkan]
- Bahasa output: {constraints.language}
"""

    prev_context_prompt = ""
    if hasattr(inp, "previous_content") and inp.previous_content:
        prev_context_prompt = f"\n\nKONTEKS BAB SEBELUMNYA (JANGAN DIULANG, LANJUTKAN DARI SINI):\n{inp.previous_content}"

    prose_prompt = f"""Tulis section "{inp.section.title}" artikel ilmiah dalam bahasa {inp.context.bahasa}.

KONTEKS:
- Topik: {inp.context.focused_topic}
- Tipe: {inp.context.article_type}
- Positioning: {inp.context.positioning_statement}
- Tujuan section: {inp.section.purpose}

POIN YANG HARUS DIBAHAS:
{chr(10).join(f"- {p}" for p in inp.section.key_points)}

FAKTA YANG SUDAH DIEKSTRAK DARI REFERENSI (gunakan sebagai bahan penulisan):
{facts_text}

ATURAN SITASI:
- Gunakan ID referensi dalam kurung siku: [ref_001], [ref_003]
- HANYA gunakan ref_id yang muncul di fakta di atas
- Jika informasi tidak punya sumber, tulis tanpa sitasi — JANGAN mengarang

ATURAN PENULISAN:
- Target: {inp.section.word_target} kata (toleransi ±20%)
- Gaya: akademik, objektif, padat — SETIAP kalimat harus membawa informasi atau analisis
- Tulis dalam paragraf yang mengalir, bukan daftar poin
- DILARANG: bahasa dramatis, metafora, kalimat filler, pengulangan template
- Bandingkan dan evaluasi sumber secara kritis, jangan hanya mendaftar temuan{methodology_instruction}
- GAYA PENULISAN TARGET: {template_text}
{constraints_text}{prev_context_prompt}

Tulis langsung dalam Markdown. JANGAN bungkus dalam JSON atau code block."""

    content = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM_PROSE},
            {"role": "user", "content": prose_prompt},
        ],
        temperature=0.3,
        max_tokens=8000,
        agent="writing",
    )

    content = content.strip()
    content = re.sub(r"^```(?:markdown)?", "", content).strip()
    content = re.sub(r"```$", "", content).strip()

    content = sanitize_citations(content, global_allowed_ids)

    citations_used = list({m.lower().strip() for m in re.findall(r'ref_\d+', content)} & global_allowed_ids)

    return WritingSectionOutput(
        section_id=inp.section.id,
        title=inp.section.title,
        content=content,
        word_count=len(content.split()),
        citations_used=citations_used,
    )


def polish_section(title: str, content: str, bahasa: str = "id") -> str:
    polish_prompt = f"""Perbaiki kualitas penulisan section "{title}" berikut. JANGAN ubah substansi, fakta, atau sitasi.

Yang harus diperbaiki:
1. Hapus kalimat filler dan pengulangan
2. Perbaiki transisi antar paragraf agar mengalir natural
3. Perkuat kalimat pembuka setiap paragraf (topic sentence)
4. Pastikan setiap kalimat membawa informasi — hapus yang redundan
5. Perbaiki diksi agar lebih akademik dan presisi
6. Pertahankan semua sitasi [ref_xxx] persis seperti aslinya

Bahasa output: {"Bahasa Indonesia" if bahasa == "id" else "English"}

KONTEN ASLI:
{content}

Tulis ulang versi yang sudah dipoles. Output langsung dalam Markdown, tanpa JSON atau penjelasan."""

    polished = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM_PROSE},
            {"role": "user", "content": polish_prompt},
        ],
        temperature=0.2,
        max_tokens=8000,
        agent="writing",
    )
    polished = polished.strip()
    polished = re.sub(r"^```(?:markdown)?", "", polished).strip()
    polished = re.sub(r"```$", "", polished).strip()
    return polished if len(polished.split()) > 50 else content


def run(sections, context, references_detail, template_text: str = "", constraints=None) -> WritingOutput:
    """
    Tulis semua sections secara berurutan (batch mode).
    Jika satu section gagal, tetap lanjut ke section berikutnya dengan error message.
    """
    results = []
    for section in sections:
        inp = WritingInput(
            section=section,
            context=context,
            references_detail=references_detail,
        )
        try:
            result = write_section(inp, template_text, constraints=constraints)
        except Exception as e:
            result = WritingSectionOutput(
                section_id=section.id,
                title=section.title,
                content=f"[ERROR: {str(e)}]\n\n" + "\n".join(f"- {p}" for p in section.key_points),
                word_count=0,
                citations_used=[],
            )
        results.append(result)
    return WritingOutput(sections=results)

