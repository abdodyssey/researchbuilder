from pathlib import Path
from datetime import datetime, timezone


def write_article(
    output_dir: str,
    title: str,
    abstract: str,
    sections: list[dict],
    references: list[dict],
    keywords: list[str],
    review_score: int,
    models_used: list[str],
    citation_style: str = "default",
) -> str:
    path = Path(output_dir) / "draft_article.md"
    now = datetime.now(timezone.utc).isoformat()

    # Find abstracts in sections if they exist to support bilingual formats
    abstract_id_content = ""
    abstract_en_content = ""
    for sec in sections:
        sec_title = sec.get("title", "").strip().lower()
        if sec_title == "abstrak":
            abstract_id_content = sec.get("content", "")
        elif sec_title == "abstract":
            abstract_en_content = sec.get("content", "")

    from utils.citation_formatter import format_citations_in_text, format_bibliography

    if abstract_id_content:
        formatted_abstract_id = format_citations_in_text(abstract_id_content, references, citation_style)
    else:
        formatted_abstract_id = format_citations_in_text(abstract, references, citation_style)

    formatted_abstract_en = ""
    if abstract_en_content:
        formatted_abstract_en = format_citations_in_text(abstract_en_content, references, citation_style)

    lines = [
        "---",
        f'title: "{title}"',
        f"keywords: {keywords}",
        f"generated_at: {now}",
        f"models_used: {models_used}",
        f"review_score: {review_score}",
        "---",
        "",
        "> ⚠️ Draft ini dibuat oleh AI. Verifikasi referensi sebelum submit.",
        "",
        f"# {title}",
        "",
        "## Abstrak",
        formatted_abstract_id,
        "",
    ]

    if formatted_abstract_en:
        lines.extend([
            "## Abstract",
            formatted_abstract_en,
            "",
        ])

    has_refs = len(references) > 0

    formatted_sections = []
    for sec in sections:
        sec_title = sec.get("title", "")
        if sec_title.lower().strip() in ["abstrak", "abstract"]:
            continue
        if has_refs and sec_title.lower().strip() in ["daftar pustaka", "references", "daftar rujukan", "rujukan"]:
            continue
        content = format_citations_in_text(sec.get("content", ""), references, citation_style)
        lines.append(f"## {sec_title}")
        lines.append(content)
        lines.append("")
        formatted_sections.append({"title": sec_title, "content": content})

    if has_refs:
        lines.append("## Daftar Pustaka")
        bib_lines = format_bibliography(references, citation_style)
        lines.extend(bib_lines)

    # Citation check — hanya satu kali
    try:
        from utils.citation_checker import check_citations
        report = check_citations(formatted_sections, references)
        if report["total_hallucinated"] > 0:
            lines.append("")
            lines.append("---")
            lines.append("## ⚠️ Peringatan Sitasi")
            lines.append(f"Ditemukan **{report['total_hallucinated']} sitasi tidak valid**:")
            for c in report["hallucinated"]:
                lines.append(f"- {c}")
            lines.append("")
            lines.append("Verifikasi manual sebelum submit.")
    except Exception:
        pass

    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)


def write_references(output_dir: str, references: list[dict], citation_style: str = "default") -> str:
    path = Path(output_dir) / "references.md"
    lines = ["# References", ""]
    for idx, r in enumerate(references):
        title_str = r['title']
        author = r.get('author', 'Anonim')
        year = r.get('year', '2026')
        
        # Determine the header string based on citation style
        if citation_style == "ieee":
            header = f"[{idx+1}] {title_str}"
        elif citation_style in ["apa", "harvard", "chicago"]:
            header = f"{author} ({year}) - {title_str}"
        else:
            header = f"[{r['id']}] {title_str}"
            
        lines.append(f"### {header}")
        lines.append(f"- **URL**: {r['url']}")
        lines.append(f"- **Penulis**: {author}")
        lines.append(f"- **Tahun**: {year}")
        lines.append(f"- **Snippet**: {r['snippet'][:200]}...")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)
