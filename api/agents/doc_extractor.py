"""
Document Extraction Agent
--------------------------
Tugas tunggal: Terima teks draf mentah → keluarkan JSON terstruktur.
Tidak menulis konten baru. Tidak mengarang sitasi. Tidak mengubah kalimat ilmiah.

Prinsip: Separation of Concerns
- Agent ini = NLP / Structuring
- Backend Python = Layout / Template Injection (deterministik)
"""
from tenacity import retry, stop_after_attempt, wait_fixed
from utils.llm_client import call_llm, extract_json
from utils.prompt_builder import build_system_prompt

SYSTEM = build_system_prompt(
    "scientific document extraction specialist who converts raw academic text into structured JSON without altering the scientific content"
)

EXTRACTION_PROMPT = """Anda adalah Agen Ekstraksi Dokumen Ilmiah. Tugas Anda HANYA menganalisis teks draf ilmiah yang diberikan dan mengekstrak METADATA-nya ke dalam format JSON. TIDAK menulis konten baru.

ATURAN KETAT:
1. Ekstrak Judul Artikel secara akurat.
2. Ekstrak Abstrak secara utuh (jika ada).
3. Ekstrak Kata Kunci (Keywords) sebagai list array.
4. Identifikasi DAFTAR JUDUL BAB (Section Headings) yang ada di dalam teks (misal: "1. Pendahuluan", "2. Tinjauan Pustaka", "3. Metodologi Penelitian", dll). Tuliskan persis seperti yang tertera di teks!
5. JANGAN mengekstrak isi paragraf dari bab. Output Anda hanya berupa daftar nama bab.
6. Output HANYA berupa JSON valid — dimulai dengan {{ dan diakhiri dengan }}.

TUGAS:
Analisis anatomi dokumen berikut dan petakan ke JSON.

TEKS DRAF ILMIAH:
{raw_text}

OUTPUT JSON WAJIB:
{{
  "title": "Judul artikel",
  "abstract": "Teks abstrak utuh...",
  "keywords": ["kata kunci 1", "kata kunci 2"],
  "section_headings": [
    "1. Pendahuluan",
    "2. Tinjauan Pustaka",
    "3. Metodologi"
  ]
}}"""


@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def extract_document_structure(raw_text: str) -> dict:
    """
    Ekstrak struktur dokumen ilmiah dari teks mentah ke format JSON.
    Menggunakan AI hanya untuk identifikasi heading & metadata, 
    sementara pemotongan teks dilakukan deterministik menggunakan Python.
    """
    if not raw_text or not raw_text.strip():
        return {
            "title": "",
            "abstract": "",
            "keywords": [],
            "sections": []
        }

    max_chars = 25000 # Kita bisa muat lebih banyak karena output token LLM sangat kecil
    prompt_text = raw_text
    if len(prompt_text) > max_chars:
        prompt_text = prompt_text[:max_chars] + "\n\n[...teks terpotong...]"

    prompt = EXTRACTION_PROMPT.format(raw_text=prompt_text)

    raw_response = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        max_tokens=2000, # Hanya butuh token kecil untuk JSON metadata
        agent="doc_extraction",
    )

    data = extract_json(raw_response)

    # Validasi dan normalisasi metadata
    title = str(data.get("title", "") or "").strip()
    abstract = str(data.get("abstract", "") or "").strip()
    
    kw = data.get("keywords", [])
    keywords = []
    if isinstance(kw, list):
        keywords = [str(k).strip() for k in kw if k]
    elif isinstance(kw, str) and kw:
        keywords = [k.strip() for k in kw.split(",") if k.strip()]
        
    headings = data.get("section_headings", [])
    if not isinstance(headings, list):
        headings = []

    # Deterministik Slicing: Potong dokumen asli berdasarkan headings
    sections = []
    positions = []
    current_search_idx = 0
    
    # Cari posisi setiap heading di teks asli
    for heading in headings:
        heading = str(heading).strip()
        if not heading:
            continue
        idx = raw_text.find(heading, current_search_idx)
        if idx != -1:
            positions.append((heading, idx))
            current_search_idx = idx + len(heading)
            
    # Jika LLM gagal menemukan heading sama sekali, buat 1 section default
    if not positions:
        paras = [p.strip() for p in raw_text.split('\n\n') if p.strip()]
        sections.append({
            "heading": "Isi Dokumen",
            "paragraphs": paras
        })
    else:
        # Ekstrak konten antar heading
        for i, (heading, start_idx) in enumerate(positions):
            end_idx = positions[i+1][1] if i + 1 < len(positions) else len(raw_text)
            content = raw_text[start_idx + len(heading):end_idx].strip()
            paras = [p.strip() for p in content.split('\n\n') if p.strip()]
            sections.append({
                "heading": heading,
                "paragraphs": paras
            })

    return {
        "title": title,
        "abstract": abstract,
        "keywords": keywords,
        "sections": sections
    }

def _normalize_extraction_output(data: dict) -> dict:
    pass # Digantikan langsung oleh logic di atas
