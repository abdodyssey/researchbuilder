def build_system_prompt(role: str, output_format: str = "JSON") -> str:
    return (
        f"You are a {role}. "
        f"Respond ONLY in valid {output_format} format. "
        "No preamble, no explanation, no markdown code blocks. "
        "Output must be parseable directly by json.loads()."
    )


def refs_to_text(references: list[dict]) -> str:
    lines = []
    for r in references:
        lines.append(f"[{r['id']}] {r['title']}\n{r['snippet']}\nURL: {r['url']}")
    return "\n\n".join(lines)


def sections_to_text(sections: list[dict]) -> str:
    lines = []
    for s in sections:
        lines.append(f"## {s['title']}\n{s.get('content', '')}")
    return "\n\n".join(lines)
