"""
LLM Client — Wrapper untuk Groq API
======================================
Abstraksi untuk semua panggilan ke LLM (Groq Cloud).

Fitur:
- Auto-fallback: Jika model utama (llama-3.3-70b) rate limited atau error,
  otomatis fallback ke model kecil (llama-3.1-8b-instant)
- Token tracking: Setiap panggilan dicatat per-agent per-pipeline (thread-safe)
- JSON extraction: Robust parser yang bisa handle malformed LLM output
  (markdown wrappers, unescaped newlines, truncated JSON dari max_tokens)
- Lazy init: Client hanya diinisialisasi saat pertama kali dipanggil
  (supaya import di Vercel tidak crash tanpa API key)

Model default: GROQ_MODEL env var (default: llama-3.3-70b-versatile)
"""

import json
import os
import re
import threading

import groq
from config.settings import settings

# Lazy-initialized Groq client (singleton pattern)
_client = None

def get_client():
    """Inisialisasi Groq client hanya saat pertama dipanggil (lazy init)."""
    global _client
    if _client is None:
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client

# Thread-local storage untuk pipeline_id aktif dan model saat ini.
# Diperlukan karena background tasks berjalan di thread berbeda.
_thread_local = threading.local()

# In-memory store untuk token usage per pipeline.
# Dibatasi _MAX_USAGE_ENTRIES agar tidak membengkak di long-running server.
_usage_store: dict = {}
_usage_store_lock = threading.Lock()
_MAX_USAGE_ENTRIES = 200


def set_active_pipeline_id(pipeline_id: str):
    """Set pipeline_id untuk thread saat ini. Digunakan untuk token tracking otomatis."""
    _thread_local.active_pipeline_id = pipeline_id

def _get_active_pipeline_id() -> str:
    """Ambil pipeline_id thread saat ini (kosong jika belum di-set)."""
    return getattr(_thread_local, "active_pipeline_id", "")


def call_llm_with_usage(
    message: list, temperature: float = 0.3, max_tokens: int = 1000
) -> tuple[str, dict]:
    """
    Panggil LLM dan kembalikan (response_text, usage_dict).
    Versi lama — gunakan call_llm() untuk kode baru (tracking otomatis).
    """
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
    """Public API untuk mencatat usage secara manual (deprecated, pakai call_llm)."""
    track_usage(pipeline_id, agent, usage)


def _record_resp_usage(agent: str, resp):
    """Internal: catat usage dari response Groq ke store berdasarkan active pipeline."""
    pid = _get_active_pipeline_id()
    if pid and agent:
        usage_dict = {
            "prompt_tokens": getattr(resp.usage, "prompt_tokens", 0),
            "completion_tokens": getattr(resp.usage, "completion_tokens", 0),
            "total_tokens": getattr(resp.usage, "total_tokens", 0)
        }
        track_usage(pid, agent, usage_dict)


def get_usage(pipeline_id: str) -> dict:
    """
    Ambil data token usage untuk sebuah pipeline.
    Cek in-memory store dulu, fallback ke file state di disk.
    """
    if pipeline_id in _usage_store:
        return _usage_store[pipeline_id]
    try:
        from utils.state_manager import load_state
        output_dir = "/tmp" if os.environ.get("VERCEL") else "./output"
        state = load_state(output_dir, pipeline_id)
        if state and state.token_usage:
            _usage_store[pipeline_id] = state.token_usage
            return state.token_usage
    except Exception:
        pass
    return {}


def get_current_model() -> str:
    """Ambil model LLM aktif di thread ini (default dari env GROQ_MODEL)."""
    model = getattr(_thread_local, "current_model", None)
    if model is None:
        model = settings.GROQ_MODEL
        _thread_local.current_model = model
    return model


def set_current_model(model_name: str):
    """Override model LLM untuk thread ini (biasanya untuk fallback)."""
    _thread_local.current_model = model_name


def track_usage(pipeline_id: str, agent: str, usage: dict):
    """
    Thread-safe: akumulasi token usage per agent per pipeline.
    Otomatis hitung total kumulatif. Dibatasi _MAX_USAGE_ENTRIES.
    """
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
    """
    Fungsi utama untuk memanggil LLM (Groq).

    Fitur:
    - Retry 2x jika rate limited (sleep 2s between)
    - Auto-fallback ke model kecil (llama-3.1-8b) jika model utama gagal
    - Token usage otomatis dicatat jika agent name diberikan

    Args:
        messages:    List chat messages [{"role": "system/user", "content": "..."}]
        temperature: Kreativitas LLM (0.0-1.0, rendah = deterministik)
        max_tokens:  Batas maksimal token output
        agent:       Nama agent pemanggil (untuk token tracking)

    Returns:
        String response dari LLM
    """
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
    Perbaiki JSON rusak dari output LLM.

    Masalah umum yang diperbaiki:
    - Newline literal di dalam string value (\\n yang seharusnya \\\\n)
    - Double quotes yang tidak di-escape di dalam string
    - Carriage return dan tab yang rusak

    Menggunakan state machine: track apakah kita di dalam/luar string JSON.
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
    """
    Robust JSON extractor dari output LLM.

    Strategi parsing (berurutan, berhenti di yang pertama berhasil):
    1. json.loads langsung (ideal case)
    2. Repair newlines/quotes → json.loads
    3. Regex cari blok {...} di teks yang sudah di-repair
    4. Regex cari blok {...} di teks original
    5. Truncation repair: tutup braces/brackets yang terbuka (max_tokens cutoff)
    6. Jika semua gagal, simpan response ke file debug & raise ValueError

    Dipanggil oleh semua agent setelah menerima response dari LLM.
    """
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
        with open(os.path.join("./output", "runs", "failed_llm_response.txt"), "w", encoding="utf-8") as f:
            f.write(text)
    except Exception:
        pass

    raise ValueError(f"No valid JSON found in LLM response: {text[:200]}")
