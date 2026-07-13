"""
Prompt Builder — Utility untuk Membangun Prompt LLM
=====================================================
Helper functions untuk membuat system prompt dan memformat data
yang akan dikirim ke LLM.

Semua agent menggunakan build_system_prompt() untuk membuat instruksi
yang konsisten: output HANYA JSON, tanpa markdown, tanpa penjelasan.
"""


def build_system_prompt(role: str, output_format: str = "JSON") -> str:
    """
    Buat system prompt standar untuk agent.
    Instruksi ketat agar LLM hanya mengembalikan JSON parseable.
    """
    return (
        f"You are a {role}. "
        f"Respond ONLY in valid {output_format} format. "
        "No preamble, no explanation, no markdown code blocks. "
        "Output must be parseable directly by json.loads()."
    )


def refs_to_text(references: list[dict]) -> str:
    """Format list referensi menjadi teks ringkas dengan metadata akademik.
    Sertakan tahun & jumlah sitasi agar LLM bisa menilai kebaruan & pengaruh
    tiap sumber saat menganalisis research gap dan novelty."""
    lines = []
    for r in references:
        meta = f"({r.get('author', 'Anonim')}, {r.get('year', 'n.d.')}"
        if r.get("citation_count") is not None:
            meta += f" | {r.get('citation_count', 0)} sitasi"
        if r.get("venue"):
            meta += f" | {r.get('venue')}"
        meta += ")"
        lines.append(f"[{r['id']}] {r['title']} {meta}\n{r['snippet']}\nURL: {r['url']}")
    return "\n\n".join(lines)


def sections_to_text(sections: list[dict]) -> str:
    """Format list sections menjadi teks markdown (heading + content)."""
    lines = []
    for s in sections:
        lines.append(f"## {s['title']}\n{s.get('content', '')}")
    return "\n\n".join(lines)
