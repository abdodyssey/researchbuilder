import json
import os
import re
from locale import currency

import groq
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
_current_model = None
_usage_store: dict = {}
_active_pipeline_id: str = ""


def set_active_pipeline_id(pipeline_id: str):
    global _active_pipeline_id
    _active_pipeline_id = pipeline_id


def call_llm_with_usage(
    message: list, temperature: float = 0.3, max_tokens: int = 1000
) -> tuple[str, dict]:
    model = get_current_model()
    fallback_model = "llama-3.1-8b-instant"

    def _call(m):
        return _client.chat.completions.create(
            model=m,
            messages=message,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    try:
        resp = _call(model)
    except groq.RateLimitError:
        set_current_model(fallback_model)
        resp = _call(fallback_model)
    except groq.APIStatusError:
        set_current_model(fallback_model)
        resp = _call(fallback_model)

    usage = {
        "prompt_tokens": resp.usage.prompt_tokens,
        "completion_tokens": resp.usage.completion_tokens,
        "total_tokens": resp.usage.total_tokens,
    }
    return resp.choices[0].message.content, usage


def record_usage(pipeline_id: str, agent: str, usage: dict):
    if pipeline_id not in _usage_store:
        _usage_store[pipeline_id] = usage
    _usage_store[pipeline_id][agent] = usage
    _usage_store[pipeline_id]["total"] = {
        k: sum(v[k] for a, v in _usage_store[pipeline_id].items() if a != "total")
        for k in ["prompt_tokens", "completion_tokens", "total_tokens"]
    }


def _record_resp_usage(agent: str, resp):
    if _active_pipeline_id and agent:
        usage_dict = {
            "prompt_tokens": getattr(resp.usage, "prompt_tokens", 0),
            "completion_tokens": getattr(resp.usage, "completion_tokens", 0),
            "total_tokens": getattr(resp.usage, "total_tokens", 0)
        }
        track_usage(_active_pipeline_id, agent, usage_dict)


def get_usage(pipeline_id: str) -> dict:
    if pipeline_id in _usage_store:
        return _usage_store[pipeline_id]
    try:
        from utils.state_manager import load_state
        output_dir = "/tmp" if os.environ.get("VERCEL") else os.getenv("OUTPUT_DIR", "./output")
        state = load_state(output_dir, pipeline_id)
        if state and state.token_usage:
            _usage_store[pipeline_id] = state.token_usage
            return state.token_usage
    except Exception:
        pass
    return {}


def get_current_model() -> str:
    global _current_model
    if _current_model is None:
        _current_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    return _current_model


def set_current_model(model_name: str):
    global _current_model
    _current_model = model_name


def track_usage(pipeline_id: str, agent: str, usage: dict):
    if pipeline_id not in _usage_store:
        _usage_store[pipeline_id] = {}
    _usage_store[pipeline_id][agent] = {
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
    }
    _usage_store[pipeline_id]["total"] = {
        k: sum(v[k] for a, v in _usage_store[pipeline_id].items() if a != "total")
        for k in ["prompt_tokens", "completion_tokens", "total_tokens"]
    }


def call_llm(
    messages: list, temperature: float = 0.3, max_tokens: int = 1000, agent: str = ""
) -> str:
    import time
    model = get_current_model()
    fallback_model = "llama-3.1-8b-instant"

    for attempt in range(1, 4):
        try:
            resp = _client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            _record_resp_usage(agent, resp)
            return resp.choices[0].message.content
        except groq.RateLimitError as e:
            print(f"\n[WARNING] Rate limit hit for model {model} (Attempt {attempt}/3).")
            if attempt < 3:
                sleep_time = 15
                print(f"[INFO] Sleeping for {sleep_time} seconds before retrying...")
                time.sleep(sleep_time)
                continue
            else:
                if model != fallback_model:
                    print(f"[INFO] Falling back to {fallback_model}...")
                    try:
                        resp = _client.chat.completions.create(
                            model=fallback_model,
                            messages=messages,
                            temperature=temperature,
                            max_tokens=min(max_tokens, 1500),
                        )
                        _record_resp_usage(agent, resp)
                        return resp.choices[0].message.content
                    except Exception as fe:
                        print(f"[ERROR] Fallback model {fallback_model} failed: {fe}")
                        raise
                raise
        except groq.APIStatusError as e:
            print(
                f"\n[ERROR] Groq API Status Error: {e.status_code} - {e.message} for model {model}"
            )
            if model != fallback_model:
                print(f"[INFO] Falling back temporarily to {fallback_model} due to API status error...")
                try:
                    resp = _client.chat.completions.create(
                        model=fallback_model,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=min(max_tokens, 1500),
                    )
                    _record_resp_usage(agent, resp)
                    return resp.choices[0].message.content
                except Exception as fe:
                    print(f"[ERROR] Fallback model {fallback_model} also failed: {fe}")
                    raise
            raise


def extract_json(text: str) -> dict:
    text = text.strip()
    # Strip markdown code block wrappers
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
        
    # Preprocess to fix unescaped double quotes inside string values
    def clean_json_string(txt: str) -> str:
        cleaned_lines = []
        pattern = re.compile(r'^(\s*"[^"]+"\s*:\s*")(.+?)("\s*,?\s*)$')
        for line in txt.splitlines():
            match = pattern.match(line)
            if match:
                g1, g2, g3 = match.groups()
                cleaned_g2 = g2.replace('"', "'")
                cleaned_lines.append(g1 + cleaned_g2 + g3)
            else:
                cleaned_lines.append(line)
        return "\n".join(cleaned_lines)

    cleaned_text = clean_json_string(text)
    try:
        return json.loads(cleaned_text)
    except json.JSONDecodeError:
        pass

    # Regex fallback to find JSON block
    match = re.search(r"\{.*\}", cleaned_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    match_orig = re.search(r"\{.*\}", text, re.DOTALL)
    if match_orig:
        try:
            return json.loads(match_orig.group())
        except json.JSONDecodeError:
            pass

    try:
        with open("/home/devtective/researchpilot/output/runs/failed_llm_response.txt", "w", encoding="utf-8") as f:
            f.write(text)
    except Exception:
        pass

    raise ValueError(f"No valid JSON found in LLM response: {text[:200]}")
