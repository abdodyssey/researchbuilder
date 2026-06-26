import os
from groq import Groq
import groq
from dotenv import load_dotenv

load_dotenv()

_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
_current_model = None

def get_current_model() -> str:
    global _current_model
    if _current_model is None:
        _current_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    return _current_model

def set_current_model(model_name: str):
    global _current_model
    _current_model = model_name

def call_llm(messages: list, temperature: float = 0.3, max_tokens: int = 1000) -> str:
    model = get_current_model()
    fallback_model = "llama-3.1-8b-instant"
    
    try:
        resp = _client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content
    except groq.RateLimitError as e:
        print(f"\n[WARNING] Rate limit hit for model {model}.")
        if model != fallback_model:
            print(f"[INFO] Falling back to {fallback_model}...")
            set_current_model(fallback_model)
            resp = _client.chat.completions.create(
                model=fallback_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content
        raise
    except groq.APIStatusError as e:
        print(f"\n[ERROR] Groq API Status Error: {e.status_code} - {e.message} for model {model}")
        if model != fallback_model:
            print(f"[INFO] Falling back to {fallback_model} due to API status error...")
            set_current_model(fallback_model)
            try:
                resp = _client.chat.completions.create(
                    model=fallback_model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                return resp.choices[0].message.content
            except Exception as fe:
                print(f"[ERROR] Fallback model {fallback_model} also failed: {fe}")
                raise
        raise


import json
import re

def extract_json(text: str) -> dict:
    text = text.strip()
    # Strip markdown code block wrappers
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Regex fallback to find JSON block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    raise ValueError(f"No valid JSON found in LLM response: {text[:200]}")

