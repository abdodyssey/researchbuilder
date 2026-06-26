import json
import re
from tenacity import retry, stop_after_attempt, wait_fixed
from utils.prompt_builder import build_system_prompt
from utils.llm_client import call_llm, extract_json

SYSTEM = build_system_prompt("expert academic editor and reviewer")


@retry(stop=stop_after_attempt(2), wait=wait_fixed(2))
def run(sections: list[dict], critical_issues: list[dict], references: list[dict], bahasa: str = "id") -> list[dict]:
    # Build text representations
    sections_text = ""
    for sec in sections:
        sections_text += f"\n--- ID: {sec['id']} | Title: {sec['title']} ---\n{sec['content']}\n"
        
    issues_text = ""
    for i, issue in enumerate(critical_issues):
        issues_text += f"{i+1}. Location: {issue.get('location', 'N/A')} | Type: {issue.get('type', 'N/A')}\n   Description: {issue.get('description', '')}\n   Suggestion: {issue.get('suggestion', '')}\n"
        
    refs_text = ""
    for ref in references:
        refs_text += f"- [{ref.get('id', '')}] {ref.get('title', '')}: {ref.get('snippet', '')}\n"

    user_msg = f"""
Revisi bagian draf artikel ilmiah berikut untuk menyelesaikan isu-isu kritis (critical issues) yang ditemukan oleh reviewer.

DRAFT SECTIONS SAAT INI:
{sections_text}

ISU KRITIS YANG HARUS DIPERBAIKI:
{issues_text}

REFERENSI VALID UNTUK SITASI:
{refs_text}

Bahasa Output: {"Bahasa Indonesia" if bahasa == "id" else "English"}

TUGAS ANDA:
1. Perbaiki section yang terkena dampak isu kritis tersebut agar sesuai dengan saran reviewer.
2. Pertahankan gaya penulisan akademik yang formal dan pertahankan sitasi referensi yang valid (seperti [ref_001]).
3. Jangan pernah mengarang data fiktif baru di luar referensi yang disediakan.
4. Section yang tidak memiliki isu kritis HARUS tetap dikembalikan dalam JSON output dengan isi konten asli yang tidak diubah agar draf tetap utuh.

Kembalikan HANYA JSON valid dengan format berikut (tanpa teks penjelasan lain):
{{
  "revised_sections": [
    {{
      "id": "sec_01",
      "title": "Pendahuluan",
      "content": "Konten markdown section yang sudah direvisi atau tetap asli"
    }}
  ]
}}
"""

    resp = call_llm(
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3
    )
    
    data = extract_json(resp)
    return data.get("revised_sections", sections)
