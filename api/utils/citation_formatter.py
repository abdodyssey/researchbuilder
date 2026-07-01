import re

def get_citation_author(author: str, use_and: bool = False) -> str:
    if not author or author.strip().lower() in ["anonim", "anonymous", ""]:
        return "Anonim"
    
    author = author.strip()
    
    # If semicolon is present, split strictly by semicolon
    if ";" in author:
        parts = [p.strip() for p in author.split(";")]
    else:
        # Otherwise split by " and " or " & "
        parts = re.split(r'\s+and\s+|\s+&\s+', author)
    
    parts = [p.strip() for p in parts if p.strip()]

    def get_last_name(name: str) -> str:
        # If it has a comma, e.g. "Smith, John", last name is "Smith"
        if "," in name:
            sub = name.split(",")[0].strip()
            if sub:
                return sub
        # Otherwise, take the last word (e.g. "John Smith" -> "Smith")
        words = name.split()
        if words:
            # If the last word is an initial like "J." or "J", take the previous word
            last_word = words[-1]
            if len(last_word.replace(".", "")) <= 2 and len(words) > 1:
                return words[-2]
            return last_word
        return name

    last_names = [get_last_name(p) for p in parts]
    
    joiner = " and " if use_and else " & "
    
    if len(last_names) == 1:
        return last_names[0]
    elif len(last_names) == 2:
        return f"{last_names[0]}{joiner}{last_names[1]}"
    else:
        return f"{last_names[0]} et al."


def format_citations_in_text(text: str, references: list[dict], style: str = "default") -> str:
    if style == "default":
        return text

    # Create mapping from ID to index and citation string
    ref_map = {r["id"]: r for r in references}
    ref_keys = list(ref_map.keys())

    def replace_citation(match):
        raw_inner = match.group(1) # e.g. "ref_001, ref_002"
        # Split by comma
        ids = [i.strip() for i in raw_inner.split(",") if i.strip()]
        
        formatted_list = []
        for rid in ids:
            if rid not in ref_map:
                formatted_list.append(rid)
                continue
                
            ref = ref_map[rid]
            author = ref.get("author", "Anonim")
            year = ref.get("year", "2026")
            
            if style == "ieee":
                # Find 1-based index of this reference in the bibliography list
                idx = ref_keys.index(rid) + 1 if rid in ref_keys else 1
                formatted_list.append(str(idx))
            elif style == "apa":
                short_author = get_citation_author(author, use_and=False)
                formatted_list.append(f"{short_author}, {year}")
            elif style == "harvard":
                short_author = get_citation_author(author, use_and=False)
                formatted_list.append(f"{short_author}, {year}")
            elif style == "chicago":
                short_author = get_citation_author(author, use_and=True)
                formatted_list.append(f"{short_author} {year}")
            else:
                formatted_list.append(rid)

        if style == "ieee":
            return "[" + ", ".join(formatted_list) + "]"
        elif style in ["apa", "harvard", "chicago"]:
            # e.g., (Smith, 2023; Doe, 2024)
            return "(" + "; ".join(formatted_list) + ")"
        return match.group(0)

    # Match brackets containing ref_xxx (e.g. [ref_001] or [ref_001, ref_002])
    pattern = r"\[((?:ref_\d+)(?:\s*,\s*ref_\d+)*)\]"
    return re.sub(pattern, replace_citation, text)


def format_bibliography(references: list[dict], style: str = "default") -> list[str]:
    lines = []
    
    for idx, r in enumerate(references):
        author = r.get("author", "Anonim")
        year = r.get("year", "2026")
        title = r.get("title", "")
        url = r.get("url", "")
        rid = r.get("id", "")
        
        if style == "apa":
            lines.append(f"- {author} ({year}). *{title}*. {url}")
        elif style == "ieee":
            lines.append(f"- [{idx+1}] {author}, \"{title}\", {year}. Available: {url}")
        elif style == "harvard":
            lines.append(f"- {author} ({year}) *{title}*. Available at: {url}")
        elif style == "chicago":
            lines.append(f"- {author}. {year}. \"{title}\". {url}")
        else: # default
            lines.append(f"- [{rid}] {title}. {url}")
            
    return lines
