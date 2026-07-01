def estimate_tokens(text: str) -> int:
    """Rough estimate: 1 token ≈ 4 chars."""
    return len(text) // 4


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n... [truncated]"


_usage_log: list[dict] = []

def record_usage(agent: str, prompt_token: int, completion_token: int) -> None:
    _usage_log.append({
        "agent": agent,
        "prompt_token": prompt_token,
        "completion_token": completion_token,
        "total": prompt_token + completion_token
    })

def get_usage_summary() -> dict:
    total_prompt = sum(u["prompt_token"] for u in _usage_log)
    total_completion = sum(u["completion_token"] for u in _usage_log)
    return {
        "per_agent": _usage_log,
        "total_prompt": total_prompt,
        "total_completion": total_completion,
        "total": total_prompt + total_completion
    }

