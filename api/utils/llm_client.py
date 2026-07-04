import json
import os
import re
import threading

import groq
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY", "missing_api_key_on_vercel")
        _client = Groq(api_key=api_key)
    return _client

_thread_local = threading.local()
_usage_store: dict = {}
_usage_store_lock = threading.Lock()
_MAX_USAGE_ENTRIES = 200


def set_active_pipeline_id(pipeline_id: str):
    _thread_local.active_pipeline_id = pipeline_id

def _get_active_pipeline_id() -> str:
    return getattr(_thread_local, "active_pipeline_id", "")


def call_llm_with_usage(
    message: list, temperature: float = 0.3, max_tokens: int = 1000
) -> tuple[str, dict]:
    model = get_current_model()
    fallback_model = "llama-3.1-8b-instant"

    def _call(m):
        return get_client().chat.completions.create(
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
    track_usage(pipeline_id, agent, usage)


def _record_resp_usage(agent: str, resp):
    pid = _get_active_pipeline_id()
    if pid and agent:
        usage_dict = {
            "prompt_tokens": getattr(resp.usage, "prompt_tokens", 0),
            "completion_tokens": getattr(resp.usage, "completion_tokens", 0),
            "total_tokens": getattr(resp.usage, "total_tokens", 0)
        }
        track_usage(pid, agent, usage_dict)


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
    model = getattr(_thread_local, "current_model", None)
    if model is None:
        model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        _thread_local.current_model = model
    return model


def set_current_model(model_name: str):
    _thread_local.current_model = model_name


def track_usage(pipeline_id: str, agent: str, usage: dict):
    with _usage_store_lock:
        if len(_usage_store) > _MAX_USAGE_ENTRIES:
            oldest = next(iter(_usage_store))
            del _usage_store[oldest]

        if pipeline_id not in _usage_store:
            _usage_store[pipeline_id] = {}
        if agent not in _usage_store[pipeline_id]:
            _usage_store[pipeline_id][agent] = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

        _usage_store[pipeline_id][agent]["prompt_tokens"] += usage.get("prompt_tokens", 0)
        _usage_store[pipeline_id][agent]["completion_tokens"] += usage.get("completion_tokens", 0)
        _usage_store[pipeline_id][agent]["total_tokens"] += usage.get("total_tokens", 0)

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

    for attempt in range(1, 3):
        try:
            resp = get_client().chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            _record_resp_usage(agent, resp)
            return resp.choices[0].message.content
        except groq.RateLimitError as e:
            print(f"\n[WARNING] Rate limit hit for model {model} (Attempt {attempt}/3).")
            if attempt < 2:
                sleep_time = 2
                print(f"[INFO] Sleeping for {sleep_time} seconds before retrying...")
                time.sleep(sleep_time)
                continue
            else:
                if model != fallback_model:
                    print(f"[INFO] Falling back to {fallback_model} due to Rate Limit...")
                    try:
                        resp = get_client().chat.completions.create(
                            model=fallback_model,
                            messages=messages,
                            temperature=temperature,
                            max_tokens=max_tokens,
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
                    resp = get_client().chat.completions.create(
                        model=fallback_model,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )
                    _record_resp_usage(agent, resp)
                    return resp.choices[0].message.content
                except Exception as fe:
                    print(f"[ERROR] Fallback model {fallback_model} also failed: {fe}")
                    raise
            raise


def repair_json_newlines_and_quotes(text: str) -> str:
    """
    Repair a JSON string by escaping unescaped newlines, carriage returns, 
    tabs, and unescaped double quotes inside string values.
    """
    output = []
    in_string = False
    escaped = False
    i = 0
    n = len(text)
    
    while i < n:
        char = text[i]
        
        if in_string:
            if escaped:
                output.append(char)
                escaped = False
            elif char == '\\':
                output.append(char)
                escaped = True
            elif char == '"':
                # Peek ahead to see if this is the closing quote
                peek = i + 1
                while peek < n and text[peek].isspace():
                    peek += 1
                
                is_closing = False
                if peek >= n:
                    is_closing = True
                elif text[peek] in (',', '}', ']', ':'):
                    is_closing = True
                
                if is_closing:
                    in_string = False
                    output.append('"')
                else:
                    # Escape internal double quotes
                    output.append('\\"')
            elif char == '\n':
                output.append('\\n')
            elif char == '\r':
                output.append('\\r')
            elif char == '\t':
                output.append('\\t')
            else:
                output.append(char)
        else:
            if char == '"':
                in_string = True
                output.append('"')
            else:
                output.append(char)
        i += 1
        
    return "".join(output)


def extract_json(text: str) -> dict:
    text = text.strip()
    # Strip markdown code block wrappers
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
        
    # Preprocess using the state machine to repair newlines and quotes
    repaired = repair_json_newlines_and_quotes(text)
    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    # Regex fallback to find JSON block in repaired text
    match = re.search(r"\{.*\}", repaired, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Regex fallback on original text
    match_orig = re.search(r"\{.*\}", text, re.DOTALL)
    if match_orig:
        try:
            return json.loads(match_orig.group())
        except json.JSONDecodeError:
            pass

    # Truncation repair — close unclosed braces/brackets from max_tokens cutoff
    for src in (repaired, text):
        match_start = re.search(r"\{", src)
        if match_start:
            fragment = src[match_start.start():]
            open_braces = fragment.count("{") - fragment.count("}")
            open_brackets = fragment.count("[") - fragment.count("]")
            if open_braces > 0 or open_brackets > 0:
                # Truncate trailing partial value (after last comma or colon)
                truncated = re.sub(r'[,:]?\s*"[^"]*$', '', fragment)
                truncated = re.sub(r',\s*$', '', truncated)
                truncated += '"]' * max(0, open_brackets) + '"}' * max(0, open_braces)
                try:
                    return json.loads(truncated)
                except json.JSONDecodeError:
                    pass

    try:
        with open(os.path.join(os.getenv("OUTPUT_DIR", "./output"), "runs", "failed_llm_response.txt"), "w", encoding="utf-8") as f:
            f.write(text)
    except Exception:
        pass

    raise ValueError(f"No valid JSON found in LLM response: {text[:200]}")
