import sys
import os
from pathlib import Path

# Add the api directory to the Python path
sys.path.append(str(Path(__file__).parent))

try:
    import groq
except ImportError:
    print("Error: 'groq' package is not installed in this environment.")
    sys.exit(1)

try:
    import openai
except ImportError:
    print("Error: 'openai' package is not installed in this environment.")
    sys.exit(1)

from config.settings import settings

print("==================================================")
print("             DIAGNOSTIC REPORT                    ")
print("==================================================")
print("ENVIRONMENT         :", settings.ENVIRONMENT)
print("DATABASE_URL set   :", bool(settings.DATABASE_URL))
print("GROQ_MODEL          :", settings.GROQ_MODEL)
print("OPENROUTER_MODEL    :", settings.OPENROUTER_MODEL)

# Mask Groq Key
groq_key = settings.GROQ_API_KEY
if groq_key and groq_key != "missing_api_key_on_vercel" and not groq_key.startswith("missing_api_key"):
    masked_groq = groq_key[:8] + "..." + groq_key[-4:] if len(groq_key) > 12 else "invalid format"
    print(f"GROQ_API_KEY        : {masked_groq} (len={len(groq_key)})")
else:
    print("GROQ_API_KEY        : NOT SET / MISSING")

# Mask OpenAlex Key
openalex_key = settings.OPENALEX_API_KEY
if openalex_key:
    masked_openalex = openalex_key[:4] + "..." if len(openalex_key) > 6 else "invalid format"
    print(f"OPENALEX_API_KEY    : {masked_openalex} (len={len(openalex_key)})")
else:
    print("OPENALEX_API_KEY    : NOT SET / MISSING")

# Mask OpenRouter Key
openrouter_key = settings.OPENROUTER_API_KEY
if openrouter_key:
    masked_or = openrouter_key[:8] + "..." + openrouter_key[-4:] if len(openrouter_key) > 12 else "invalid format"
    print(f"OPENROUTER_API_KEY  : {masked_or} (len={len(openrouter_key)})")
else:
    print("OPENROUTER_API_KEY  : NOT SET / MISSING")

print("\n--------------------------------------------------")
print("1. Testing Main Groq Model Connection...")
print("--------------------------------------------------")
try:
    client = groq.Groq(api_key=groq_key)
    resp = client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": "Hello, respond with 'Success'"}],
        max_tokens=10
    )
    print("RESULT              : SUCCESS")
    print("LLM RESPONSE        :", resp.choices[0].message.content.strip())
except Exception as e:
    print("RESULT              : FAILED")
    print("ERROR TYPE          :", type(e).__name__)
    print("ERROR MESSAGE       :", str(e))

print("\n--------------------------------------------------")
print("2. Testing Fallback Groq Model Connection...")
print("--------------------------------------------------")
try:
    client = groq.Groq(api_key=groq_key)
    resp = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": "Hello, respond with 'Success'"}],
        max_tokens=10
    )
    print("RESULT              : SUCCESS")
    print("LLM RESPONSE        :", resp.choices[0].message.content.strip())
except Exception as e:
    print("RESULT              : FAILED")
    print("ERROR TYPE          :", type(e).__name__)
    print("ERROR MESSAGE       :", str(e))

print("\n--------------------------------------------------")
print("3. Testing OpenRouter Connection...")
print("--------------------------------------------------")
try:
    client = openai.OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=openrouter_key,
    )
    resp = client.chat.completions.create(
        model=settings.OPENROUTER_MODEL,
        messages=[{"role": "user", "content": "Hello, respond with 'Success'"}],
        max_tokens=10,
        extra_headers={
            "HTTP-Referer": "https://researchbuilder.com",
            "X-Title": "ResearchBuilder",
        }
    )
    print("RESULT              : SUCCESS")
    print("LLM RESPONSE        :", resp.choices[0].message.content.strip())
except Exception as e:
    print("RESULT              : FAILED")
    print("ERROR TYPE          :", type(e).__name__)
    print("ERROR MESSAGE       :", str(e))
print("==================================================")
