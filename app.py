import os
import glob
import json
import uuid
import hmac
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from orchestrator import run_pipeline
from utils.llm_client import get_usage
from utils.state_manager import load_state, STATE_FILE, PipelineState

from sqlalchemy.orm import Session
from database import get_db, init_db
from models import User
from auth import get_current_user, check_and_consume_credit, decode_token
from config.plans import get_plan


load_dotenv()

app = FastAPI(title="ResearchPilot Web UI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = "/tmp" if os.environ.get("VERCEL") else os.getenv("OUTPUT_DIR", "./output")
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
Path(os.path.join(OUTPUT_DIR, "runs")).mkdir(parents=True, exist_ok=True)

class GenerateRequest(BaseModel):
    tema: str
    bahasa: Optional[str] = "id"
    resume: Optional[bool] = False
    pipeline_id: Optional[str] = None
    template_file_base64: Optional[str] = None
    template_file_name: Optional[str] = None
    template_id: Optional[str] = None
    citation_style: Optional[str] = "default"
    draft_file_base64: Optional[str] = None
    draft_file_name: Optional[str] = None
    is_draft_review: Optional[bool] = False

# Track background running states
# Store pipeline_id: status
active_runs = {}

def bg_run_pipeline(
    tema: str,
    bahasa: str,
    output_dir: str,
    resume: bool,
    pipeline_id: str,
    template_path: Optional[str] = None,
    max_references: Optional[int] = None,
):
    try:
        active_runs[pipeline_id] = "running"
        run_pipeline(
            tema=tema,
            bahasa=bahasa,
            output_dir=output_dir,
            resume=resume,
            pipeline_id=pipeline_id,
            template_path=template_path,
            max_references=max_references,
        )
        active_runs[pipeline_id] = "completed"
    except Exception as e:
        print(f"Error in background pipeline: {e}")
        active_runs[pipeline_id] = f"failed: {str(e)}"

@app.post("/api/generate")
async def api_generate(
    req: GenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not req.tema:
        raise HTTPException(status_code=400, detail="Tema is required")

    # 1.1 Protect with Auth + Credit Check
    check_and_consume_credit(current_user, db)

    # 1.3 Enforce Template Upload per Plan
    plan = get_plan(current_user.plan)
    if req.template_file_base64 and not plan.get("template_upload"):
        raise HTTPException(
            status_code=403,
            detail="Fitur upload template hanya tersedia untuk pengguna plan Premium."
        )

    # 1.2 Max Refs per Plan
    max_refs = plan.get("max_refs", 10)

    # Generate unique ID or resume
    if req.resume and req.pipeline_id:
        pid = req.pipeline_id
        state = load_state(OUTPUT_DIR, pid)
        if not state:
            raise HTTPException(status_code=404, detail="Pipeline state not found for resume")
        template_path = state.template_path
    else:
        # Auto-clean active root files to prevent displaying stale results
        for f in ["draft_article.md", "draft_article.docx", "references.md", "pipeline_state.json"]:
            p = Path(OUTPUT_DIR) / f
            if p.exists():
                try:
                    p.unlink()
                except Exception:
                    pass
                    
        # Create a temp state just to get the ID
        from utils.state_manager import create_pipeline, save_state
        
        # Save template if uploaded or selected from library
        pid = str(uuid.uuid4()) # pre-generate ID for template file name
        template_path = None
        if req.template_id:
            import shutil
            template_filename = f"{req.template_id}.docx"
            library_path = os.path.join("templates", template_filename)
            if os.path.exists(library_path):
                temp_name = f"template_{pid}.docx"
                template_path = os.path.join(OUTPUT_DIR, temp_name)
                try:
                    shutil.copy2(library_path, template_path)
                except Exception as e:
                    print(f"Failed to copy library template: {e}")
                    template_path = None
        elif req.template_file_base64 and req.template_file_name:
            import base64
            suffix = Path(req.template_file_name).suffix
            temp_name = f"template_{pid}{suffix}"
            template_path = os.path.join(OUTPUT_DIR, temp_name)
            try:
                data_str = req.template_file_base64
                if "," in data_str:
                    data_str = data_str.split(",")[1]
                file_bytes = base64.b64decode(data_str)
                with open(template_path, "wb") as f:
                    f.write(file_bytes)
            except Exception as e:
                print(f"Failed to write template file: {e}")
                template_path = None

        # Save draft if uploaded
        draft_path = None
        if req.draft_file_base64 and req.draft_file_name:
            import base64
            suffix = Path(req.draft_file_name).suffix
            draft_name = f"draft_{pid}{suffix}"
            draft_path = os.path.join(OUTPUT_DIR, draft_name)
            try:
                data_str = req.draft_file_base64
                if "," in data_str:
                    data_str = data_str.split(",")[1]
                file_bytes = base64.b64decode(data_str)
                with open(draft_path, "wb") as f:
                    f.write(file_bytes)
            except Exception as e:
                print(f"Failed to write draft file: {e}")
                draft_path = None

        temp_state = create_pipeline(
            req.tema,
            req.bahasa,
            template_path,
            user_id=current_user.id,
            citation_style=req.citation_style,
            is_draft_review=req.is_draft_review or bool(draft_path),
            draft_file_path=draft_path
        )
        # Override pipeline_id so it matches our pre-generated pid
        temp_state.pipeline_id = pid
        save_state(temp_state, OUTPUT_DIR)

        
    background_tasks.add_task(
        bg_run_pipeline,
        req.tema,
        req.bahasa,
        OUTPUT_DIR,
        req.resume,
        pid,
        template_path,
        max_refs,
    )
    
    return {"status": "started", "pipeline_id": pid}

@app.get("/api/status/{pipeline_id}")
async def api_status(pipeline_id: str, current_user: User = Depends(get_current_user)):
    # Load state from file
    state = load_state(OUTPUT_DIR, pipeline_id)
    if not state:
        # Try checking active runs
        if pipeline_id in active_runs:
            return {"status": active_runs[pipeline_id]}
        raise HTTPException(status_code=404, detail="Pipeline run not found")
        
    if state.user_id is not None and state.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak ke draf ini")
        
    res = state.model_dump()
    bg_status = active_runs.get(pipeline_id, "unknown")
    res["background_status"] = bg_status
    
    # Handle stuck background processes gracefully (e.g. server restarted or reloaded)
    if state.status == "running" and bg_status == "unknown":
        res["status"] = "failed"
        res["background_status"] = "failed: Proses terhenti karena server melakukan restart."
        try:
            state.status = "failed"
            save_state(state, OUTPUT_DIR)
        except Exception:
            pass
            
    return res

@app.get("/api/templates")
async def api_templates(current_user: User = Depends(get_current_user)):
    return [
        {
            "id": "jurnal_komputer_sinta_v2",
            "name": "Template Jurnal SINTA - Rumpun Komputer (Book Antiqua)",
            "description": "Template standar nasional SINTA untuk bidang IT, sistem informasi, dan ilmu komputer dengan layout satu kolom, menggunakan font Book Antiqua."
        },
        {
            "id": "sinta2kolom_v2",
            "name": "Template Jurnal Nasional SINTA (Double Column)",
            "description": "Template standar nasional SINTA dengan tata letak dua kolom (double column), ideal untuk bidang teknik, sains, dan multidisiplin."
        },
        {
            "id": "jurnal_sains_aquaculture_v2",
            "name": "Template Jurnal Sains & Aquaculture (English/Bilingual)",
            "description": "Template untuk jurnal sains, biologi, perikanan/budidaya, menggunakan font Arial/Times New Roman dengan tabel terstruktur."
        }
    ]

@app.get("/api/runs")
async def api_runs(current_user: User = Depends(get_current_user)):
    # Scan output/runs directory for all pipeline states
    runs = []
    run_files = glob.glob(os.path.join(OUTPUT_DIR, "runs", "pipeline_state_*.json"))
    for file_path in run_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                run_user_id = data.get("user_id")
                # Secure filtering: only show if user_id matches, or if it is None and current_id is 1
                if run_user_id == current_user.id or (run_user_id is None and current_user.id == 1):
                    runs.append({
                        "pipeline_id": data.get("pipeline_id"),
                        "created_at": data.get("created_at"),
                        "status": data.get("status"),
                        "tema_umum": data.get("input", {}).get("tema_umum"),
                        "bahasa": data.get("input", {}).get("bahasa"),
                        "review_score": data.get("stages", {}).get("review", {}).get("output", {}).get("overall_score")
                    })
        except Exception:
            pass
            
    # 1.4 Enforce History Retention
    from datetime import datetime, timezone, timedelta
    plan = get_plan(current_user.plan)
    history_days = plan.get("history_days", -1)
    
    filtered_runs = []
    if history_days == -1:
        filtered_runs = runs
    else:
        now = datetime.now(timezone.utc)
        for r in runs:
            created_at_str = r.get("created_at")
            if not created_at_str:
                continue
            try:
                dt = datetime.fromisoformat(created_at_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                cutoff = now - timedelta(days=history_days)
                if dt >= cutoff:
                    filtered_runs.append(r)
            except Exception:
                # Keep run if parsing fails
                filtered_runs.append(r)

    # Sort by created_at desc
    filtered_runs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return filtered_runs

@app.get("/api/download/{pipeline_id}/{filename}")
async def api_download_file(
    pipeline_id: str,
    filename: str,
    request: Request,
    token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    token_str = token
    if not token_str:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token_str = auth_header.split(" ")[1]
            
    if not token_str:
        raise HTTPException(status_code=401, detail="Token required")
        
    user_id = decode_token(token_str)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    state = load_state(OUTPUT_DIR, pipeline_id)
    if state and state.user_id is not None and state.user_id != user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak ke draf ini")

    if filename.endswith(".docx") or filename == "docx":
        file_path = Path(OUTPUT_DIR) / "runs" / f"draft_article_{pipeline_id}.docx"
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        dl_name = f"draft_article_{pipeline_id}.docx"
        if not file_path.exists():
            if state and state.status == "completed":
                fallback = Path(OUTPUT_DIR) / "draft_article.docx"
                if fallback.exists():
                    return FileResponse(fallback, media_type=media_type, filename=dl_name)
            raise HTTPException(status_code=404, detail="DOCX file not found")
        return FileResponse(file_path, media_type=media_type, filename=dl_name)
    else:
        file_path = Path(OUTPUT_DIR) / "runs" / f"draft_article_{pipeline_id}.md"
        media_type = "text/markdown"
        dl_name = f"draft_article_{pipeline_id}.md"
        if not file_path.exists():
            if state and state.status == "completed":
                fallback = Path(OUTPUT_DIR) / "draft_article.md"
                if fallback.exists():
                    return FileResponse(fallback, media_type=media_type, filename=dl_name)
            raise HTTPException(status_code=404, detail="Markdown file not found")
        return FileResponse(file_path, media_type=media_type, filename=dl_name)

@app.get("/api/content/{pipeline_id}")
async def api_get_content(pipeline_id: str, current_user: User = Depends(get_current_user)):
    state = load_state(OUTPUT_DIR, pipeline_id)
    if state and state.user_id is not None and state.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak ke draf ini")
        
    md_path = Path(OUTPUT_DIR) / "runs" / f"draft_article_{pipeline_id}.md"
    ref_path = Path(OUTPUT_DIR) / "runs" / f"references_{pipeline_id}.md"
    
    if not md_path.exists() and state and state.status == "completed":
        md_path = Path(OUTPUT_DIR) / "draft_article.md"
    if not ref_path.exists() and state and state.status == "completed":
        ref_path = Path(OUTPUT_DIR) / "references.md"
        
    article_content = md_path.read_text(encoding="utf-8") if md_path.exists() else ""
    references_content = ref_path.read_text(encoding="utf-8") if ref_path.exists() else ""
    
    return {
        "article": article_content,
        "references": references_content
    }

@app.post("/api/clean")
async def api_clean():
    # Delete active files in output directory root to start fresh
    for f in ["draft_article.md", "draft_article.docx", "references.md", "pipeline_state.json"]:
        p = Path(OUTPUT_DIR) / f
        if p.exists():
            p.unlink()
    return {"status": "success"}

@app.delete("/api/runs/{pipeline_id}")
async def api_delete_run(pipeline_id: str, current_user: User = Depends(get_current_user)):
    state = load_state(OUTPUT_DIR, pipeline_id)
    if state and state.user_id is not None and state.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak ke draf ini")
        
    state_file = Path(OUTPUT_DIR) / "runs" / f"pipeline_state_{pipeline_id}.json"
    if state_file.exists():
        try:
            state_file.unlink()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete state: {e}")
            
    # Delete other generated files for this run
    for prefix in ["draft_article_", "references_", "template_", "draft_"]:
        for suffix in [".docx", ".md", ".json", ".txt"]:
            for f in glob.glob(os.path.join(OUTPUT_DIR, "runs", f"{prefix}{pipeline_id}*{suffix}")):
                try:
                    Path(f).unlink()
                except Exception:
                    pass
            for f in glob.glob(os.path.join(OUTPUT_DIR, f"{prefix}{pipeline_id}*{suffix}")):
                try:
                    Path(f).unlink()
                except Exception:
                    pass
    return {"status": "success"}

@app.get("/")
async def home():
    return {"message": "Welcome to ResearchPilot API"}

@app.get("/api/token-usage/{pipeline_id}")
async def api_token_usage(pipeline_id: str, current_user: User = Depends(get_current_user)):
    state = load_state(OUTPUT_DIR, pipeline_id)
    if state and state.user_id is not None and state.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak ke draf ini")
    return get_usage(pipeline_id)


# ── Auth Endpoints ────────────────────────────────────────────────────────────
from pydantic import BaseModel as PydanticBase
from auth import hash_password, verify_password, create_access_token

init_db()

class RegisterRequest(PydanticBase):
    email: str
    password: str
    full_name: str = ""

class LoginRequest(PydanticBase):
    email: str
    password: str

@app.post("/api/auth/register")
async def api_register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    return {"token": token, "user": {"id": user.id, "email": user.email, "plan": user.plan}}

@app.post("/api/auth/login")
async def api_login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    token = create_access_token(user.id)
    return {"token": token, "user": {"id": user.id, "email": user.email, "plan": user.plan}}

@app.get("/api/auth/me")
async def api_me(current_user: User = Depends(get_current_user)):
    plan = get_plan(current_user.plan)
    credits = plan["credits"]
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "plan": current_user.plan,
        "credits_used": current_user.credits_used,
        "credits_total": credits,
        "credits_remaining": current_user.credits_remaining(credits),
        "trial_ends_at": current_user.trial_ends_at.isoformat() if current_user.trial_ends_at else None,
        "trial_expired": current_user.is_trial_expired(),
    }

# ── Payment & Webhook Endpoints ────────────────────────────────────────────────
import httpx
from models import Payment
from fastapi import Request

class PaymentCreateRequest(PydanticBase):
    plan: str

@app.post("/api/payment/create")
async def create_payment_link(
    req: PaymentCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if req.plan not in ["basic", "premium"]:
        raise HTTPException(status_code=400, detail="Plan tidak valid")
        
    amount = 49000 if req.plan == "basic" else 99000
    plan_name = "Basic Monthly" if req.plan == "basic" else "Premium Monthly"
    
    # Check if MAYAR_API_KEY is available
    mayar_api_key = os.getenv("MAYAR_API_KEY")
    
    if not mayar_api_key:
        # Development / Sandbox Mode
        mock_payment_id = f"pay_{uuid.uuid4().hex[:8]}"
        
        # Save to DB
        payment = Payment(
            user_id=current_user.id,
            mayar_payment_id=mock_payment_id,
            plan=req.plan,
            amount=amount,
            status="pending"
        )
        db.add(payment)
        db.commit()
        
        referer = request.headers.get("referer", "http://127.0.0.1:8000/")
        base_url = str(request.base_url)
        checkout_url = f"{base_url}api/payment/mock-checkout?payment_id={mock_payment_id}&plan={req.plan}&email={current_user.email}&redirect_url={referer}"
        return {"payment_url": checkout_url}
        
    # Real Mayar API integration
    product_id = os.getenv(f"MAYAR_{req.plan.upper()}_PRODUCT_ID")
    if not product_id:
        raise HTTPException(status_code=500, detail=f"MAYAR_{req.plan.upper()}_PRODUCT_ID tidak dikonfigurasi di .env")
        
    headers = {
        "Authorization": f"Bearer {mayar_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "name": f"ResearchPilot {plan_name}",
        "amount": amount,
        "description": f"Upgrade ke {plan_name} ResearchPilot",
        "redirectUrl": "http://127.0.0.1:8000/",
        "email": current_user.email,
        "customerName": current_user.full_name or "User"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post("https://api.mayar.id/v2/payment/link", json=payload, headers=headers, timeout=10.0)
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Gagal menghubungi Mayar API: {resp.text}")
            data = resp.json()
            link_data = data.get("data", {})
            payment_url = link_data.get("link")
            mayar_id = link_data.get("id")
            
            if not payment_url or not mayar_id:
                raise HTTPException(status_code=502, detail="Format respon Mayar API tidak valid")
                
            # Save to DB
            payment = Payment(
                user_id=current_user.id,
                mayar_payment_id=mayar_id,
                plan=req.plan,
                amount=amount,
                status="pending"
            )
            db.add(payment)
            db.commit()
            
            return {"payment_url": payment_url}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error membuat payment link: {str(e)}")

@app.post("/api/webhook/mayar")
async def webhook_mayar(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    
    signature = request.headers.get("x-mayar-signature")
    webhook_secret = os.getenv("MAYAR_WEBHOOK_SECRET")
    
    is_mock = request.headers.get("x-mock-payment") == "true"
    
    if webhook_secret and not is_mock:
        if not signature:
            raise HTTPException(status_code=400, detail="Missing signature header")
        
        expected_sig = hmac.new(
            webhook_secret.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(expected_sig, signature):
            raise HTTPException(status_code=400, detail="Invalid signature")
            
    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    data = payload.get("data", {})
    payment_id = data.get("paymentId") or data.get("id")
    email = data.get("email")
    if not email and "customer" in data:
        email = data["customer"].get("email")
        
    if not payment_id or not email:
        raise HTTPException(status_code=400, detail="Missing paymentId or email in payload")
        
    payment = db.query(Payment).filter(Payment.mayar_payment_id == payment_id).first()
    if not payment:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found for this webhook email")
        plan = "basic"
        amount = data.get("amount", 49000)
        if amount >= 99000:
            plan = "premium"
            
        payment = Payment(
            user_id=user.id,
            mayar_payment_id=payment_id,
            plan=plan,
            amount=amount,
            status="pending"
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
        
    user = payment.user
    if payment.status != "paid":
        payment.status = "paid"
        user.plan = payment.plan
        user.credits_used = 0
        user.credits_reset_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        
    return {"status": "success", "message": f"User upgraded to {user.plan}"}

@app.get("/api/payment/mock-checkout", response_class=HTMLResponse)
async def mock_checkout_page(payment_id: str, plan: str, email: str, redirect_url: Optional[str] = "/"):
    plan_name = "Basic Monthly" if plan == "basic" else "Premium Monthly"
    amount_str = "Rp 49.000" if plan == "basic" else "Rp 99.000"
    
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ResearchPilot — Sandboxed Checkout</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {{
            --bg-main: #f8fafc;
            --bg-card: #ffffff;
            --border-color: #e2e8f0;
            --border-hover: #cbd5e1;
            --text-primary: #0f172a;
            --text-secondary: #475569;
            --text-muted: #94a3b8;
            --color-primary: #4f46e5;
            --color-primary-hover: #4338ca;
            --color-success: #16a34a;
            --color-error: #dc2626;
        }}
        @media (prefers-color-scheme: dark) {{
            :root {{
                --bg-main: #09090b;
                --bg-card: #18181b;
                --border-color: #27272a;
                --border-hover: #3f3f46;
                --text-primary: #fafafa;
                --text-secondary: #a1a1aa;
                --text-muted: #71717a;
            }}
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            background-color: var(--bg-main);
            color: var(--text-primary);
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
            -webkit-font-smoothing: antialiased;
        }}
        .checkout-card {{
            width: 100%;
            max-width: 420px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 32px;
            text-align: center;
        }}
        .badge {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(79, 70, 229, 0.1);
            color: var(--color-primary);
            border: 1px solid rgba(79, 70, 229, 0.2);
            font-size: 10px;
            font-weight: 700;
            padding: 3px 10px;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 20px;
        }}
        h2 {{
            font-family: 'Outfit', sans-serif;
            font-size: 1.25rem;
            font-weight: 800;
            color: var(--text-primary);
            margin-bottom: 6px;
            letter-spacing: -0.02em;
        }}
        .desc {{
            color: var(--text-muted);
            font-size: 0.75rem;
            margin-bottom: 24px;
        }}
        .invoice-details {{
            background: var(--bg-main);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 16px;
            text-align: left;
            margin-bottom: 24px;
            font-size: 0.8125rem;
        }}
        .detail-row {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }}
        .detail-row:last-child {{
            margin-bottom: 0;
            padding-top: 10px;
            border-top: 1px solid var(--border-color);
            font-weight: 700;
            font-size: 0.875rem;
        }}
        .detail-label {{ color: var(--text-secondary); font-size: 0.75rem; }}
        .detail-value {{ color: var(--text-primary); font-size: 0.8125rem; font-weight: 500; }}
        .detail-value.highlight {{ color: var(--color-primary); font-weight: 700; }}
        .btn {{
            width: 100%;
            background: var(--color-primary);
            color: #ffffff;
            border: 1px solid transparent;
            padding: 10px 16px;
            font-weight: 600;
            font-size: 0.8125rem;
            font-family: 'Inter', sans-serif;
            border-radius: 6px;
            cursor: pointer;
            transition: background-color 0.15s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }}
        .btn:hover {{
            background: var(--color-primary-hover);
        }}
        .btn:active {{
            transform: scale(0.98);
        }}
        .btn:disabled {{
            opacity: 0.5;
            pointer-events: none;
        }}
        .btn-cancel {{
            background: var(--bg-card);
            color: var(--text-secondary);
            border: 1px solid var(--border-color);
            margin-top: 8px;
        }}
        .btn-cancel:hover {{
            background: var(--bg-main);
            border-color: var(--border-hover);
            color: var(--text-primary);
        }}
        .status-message {{
            display: none;
            margin-top: 16px;
            padding: 10px;
            border-radius: 6px;
            font-size: 0.8125rem;
            font-weight: 500;
        }}
        .status-success {{
            background: rgba(22, 163, 74, 0.1);
            border: 1px solid rgba(22, 163, 74, 0.2);
            color: var(--color-success);
        }}
        @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
        .fa-spin {{ animation: spin 1s linear infinite; }}
    </style>
</head>
<body>
    <div class="checkout-card">
        <span class="badge"><i class="fa-solid fa-flask"></i> Sandbox Mode</span>
        <h2>Simulasi Pembayaran</h2>
        <p class="desc">Gerbang pembayaran tiruan untuk pengujian lokal</p>
        
        <div class="invoice-details">
            <div class="detail-row">
                <span class="detail-label">Produk</span>
                <span class="detail-value">ResearchPilot {plan_name}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Email Pengguna</span>
                <span class="detail-value">{email}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">ID Transaksi</span>
                <span class="detail-value" style="font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 0.75rem;">{payment_id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Total Bayar</span>
                <span class="detail-value highlight">{amount_str}</span>
            </div>
        </div>

        <button id="btn-pay" class="btn"><i class="fa-solid fa-credit-card"></i> Bayar Sekarang</button>
        <button id="btn-cancel" class="btn btn-cancel">Batal</button>
        
        <div id="status" class="status-message status-success">
            <i class="fa-solid fa-circle-check"></i> Pembayaran Berhasil! Mengalihkan...
        </div>
    </div>

    <script>
        const btnPay = document.getElementById('btn-pay');
        const btnCancel = document.getElementById('btn-cancel');
        const statusDiv = document.getElementById('status');
        
        btnCancel.addEventListener('click', () => {{
            window.location.href = "{redirect_url}";
        }});
        
        btnPay.addEventListener('click', async () => {{
            btnPay.disabled = true;
            btnPay.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
            
            const payload = {{
                event: "payment.success",
                data: {{
                    paymentId: "{payment_id}",
                    amount: {49000 if plan == 'basic' else 99000},
                    customer: {{
                        email: "{email}",
                        name: "User"
                    }}
                }}
            }};
            
            try {{
                const response = await fetch('/api/webhook/mayar', {{
                    method: 'POST',
                    headers: {{
                        'Content-Type': 'application/json',
                        'x-mock-payment': 'true'
                    }},
                    body: JSON.stringify(payload)
                }});
                
                if (response.ok) {{
                    statusDiv.style.display = 'block';
                    setTimeout(() => {{
                        window.location.href = "{redirect_url}";
                    }}, 2000);
                }} else {{
                    throw new Error('Webhook failed');
                }}
            }} catch (e) {{
                alert('Simulasi gagal: ' + e.message);
                btnPay.disabled = false;
                btnPay.innerHTML = '<i class="fa-solid fa-credit-card"></i> Bayar Sekarang';
            }}
        }});
    </script>
</body>
</html>
"""
    return HTMLResponse(content=html)