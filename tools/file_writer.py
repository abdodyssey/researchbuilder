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
) -> str:
    path = Path(output_dir) / "draft_article.md"
    now = datetime.now(timezone.utc).isoformat()

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
        abstract,
        "",
    ]

    for sec in sections:
        lines.append(f"## {sec['title']}")
        lines.append(sec.get("content", ""))
        lines.append("")

    lines.append("## Daftar Pustaka")
    for r in references:
        lines.append(f"- [{r['id']}] {r['title']}. {r['url']}")

    # Citation check — hanya satu kali
    try:
        from utils.citation_checker import check_citations
        report = check_citations(sections, references)
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


def write_references(output_dir: str, references: list[dict]) -> str:
    path = Path(output_dir) / "references.md"
    lines = ["# References", ""]
    for r in references:
        lines.append(f"### [{r['id']}] {r['title']}")
        lines.append(f"- URL: {r['url']}")
        lines.append(f"- Snippet: {r['snippet'][:200]}...")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)
