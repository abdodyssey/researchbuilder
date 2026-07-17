"""
Prompt Builder — Utility untuk Membangun Prompt LLM
=====================================================
Helper functions untuk membuat system prompt dan memformat data
yang akan dikirim ke LLM.

Semua agent menggunakan build_system_prompt() untuk membuat instruksi
yang konsisten: output HANYA JSON, tanpa markdown, tanpa penjelasan.
"""


_WRITER_SYSTEM = (
    "You are a senior academic researcher and skilled scientific writer with expertise in producing "
    "publication-ready research articles. Your writing is characterized by:\n"
    "- Precise, evidence-based argumentation with proper citations\n"
    "- Clear topic sentences that advance the argument, not restate section headings\n"
    "- Smooth logical transitions between paragraphs (avoid abrupt jumps)\n"
    "- Dense, substantive prose — every sentence carries information or analysis\n"
    "- Strictly NO filler phrases ('di era modern ini', 'menyingkap tabir', 'menggali lebih dalam', "
    "'Dengan demikian penelitian ini berkontribusi...', 'Diharapkan penelitian ini...')\n"
    "- Active voice preferred; passive only when the actor is irrelevant\n"
    "- Quantitative data and specific details over vague generalizations\n"
    "- Critical synthesis: compare, contrast, and evaluate sources — do not merely list them"
)


def build_system_prompt(role: str, output_format: str = "JSON") -> str:
    if output_format == "Markdown":
        if "writ" in role.lower():
            return _WRITER_SYSTEM + "\n\nRespond ONLY in clean Markdown prose. No JSON, no code blocks."
        return (
            f"You are a {role}. "
            "Respond ONLY in clean Markdown prose. No JSON, no code blocks."
        )

    if "writ" in role.lower():
        return (
            _WRITER_SYSTEM + "\n\n"
            f"Respond ONLY in valid {output_format} format. "
            "No preamble, no explanation, no markdown code blocks. "
            "Output must be parseable directly by json.loads()."
        )

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
