import os
import sys

# Add the current directory (api/) to sys.path so Vercel can resolve local imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

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
from auth import get_current_user, check_token_limit, decode_token
from config.plans import get_plan


load_dotenv()

app = FastAPI(title="ResearchBuilder Web UI")

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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
    document_type: Optional[str] = "artikel"

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
    user_id: Optional[str] = None,
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
        
        if user_id:
            from database import SessionLocal
            from models import User
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    usage = get_usage(pipeline_id)
                    total_tokens = usage.get("total", {}).get("total_tokens", 0)
                    user.tokens_used += total_tokens
                    db.commit()
            finally:
                db.close()
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

    # 1.1 Protect with Auth + Token Check
    check_token_limit(current_user, db)

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
            base_dir = os.path.dirname(os.path.abspath(__file__))
            library_path = os.path.join(base_dir, "templates", template_filename)
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
            draft_file_path=draft_path,
            document_type=req.document_type
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
        current_user.id,
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
        raise HTTPException(status_code=403, detail="Akses ditolak ke dokumen ini")
        
    res = state.model_dump()
    bg_status = active_runs.get(pipeline_id, "unknown")
    if bg_status == "running" and state.background_status:
        res["background_status"] = state.background_status
    else:
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
                        "review_score": data.get("stages", {}).get("review", {}).get("output", {}).get("overall_score"),
                        "token_usage_total": data.get("token_usage", {}).get("total", {}).get("total_tokens", 0),
                        "document_type": data.get("input", {}).get("document_type", "artikel"),
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
        raise HTTPException(status_code=403, detail="Akses ditolak ke dokumen ini")

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
        raise HTTPException(status_code=403, detail="Akses ditolak ke dokumen ini")
        
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
        raise HTTPException(status_code=403, detail="Akses ditolak ke dokumen ini")
        
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
    return {"message": "Welcome to ResearchBuilder API"}

@app.get("/api/token-usage/{pipeline_id}")
async def api_token_usage(pipeline_id: str, current_user: User = Depends(get_current_user)):
    state = load_state(OUTPUT_DIR, pipeline_id)
    if state and state.user_id is not None and state.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak ke dokumen ini")
    return get_usage(pipeline_id)


# ── Document Extraction & Export Endpoints ────────────────────────────────────

class ExtractDocRequest(BaseModel):
    """Request untuk mengekstrak struktur dari teks draf mentah."""
    raw_text: str
    template_file_base64: Optional[str] = None
    template_file_name: Optional[str] = None


class ExportDocxRequest(BaseModel):
    """Request untuk mengekspor structured_doc ke file .docx."""
    structured_doc: dict
    template_file_base64: Optional[str] = None
    template_file_name: Optional[str] = None
    pipeline_id: Optional[str] = None


@app.post("/api/extract-doc")
async def api_extract_doc(
    req: ExtractDocRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Endpoint: Ekstraksi Dokumen Ilmiah Mentah → JSON Terstruktur
    
    Terima teks draf mentah → agent ekstraksi memparse struktur →
    kembalikan JSON (title, abstract, keywords, sections).
    
    Agent ini TIDAK menulis konten baru. Ia hanya memindahkan teks
    ke dalam format JSON yang valid.
    """
    from agents.doc_extractor import extract_document_structure
    
    if not req.raw_text or not req.raw_text.strip():
        raise HTTPException(status_code=400, detail="raw_text tidak boleh kosong")

    try:
        structured = extract_document_structure(req.raw_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengekstrak dokumen: {str(e)}")

    return {
        "status": "success",
        "structured_doc": structured,
        "stats": {
            "sections_found": len(structured.get("sections", [])),
            "keywords_found": len(structured.get("keywords", [])),
            "has_abstract": bool(structured.get("abstract")),
            "has_title": bool(structured.get("title")),
        }
    }


@app.post("/api/export-docx")
async def api_export_docx(
    req: ExportDocxRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Endpoint: Export Structured Doc → DOCX via Template Injection
    
    Terima structured_doc JSON + template .docx → inject konten ke template →
    kembalikan file .docx yang siap didownload.
    
    Layout 100% dikontrol oleh template. AI tidak mengatur font/margin.
    """
    import base64
    from utils.docx_injector import inject_into_template

    structured_doc = req.structured_doc
    if not structured_doc:
        raise HTTPException(status_code=400, detail="structured_doc tidak boleh kosong")

    # Simpan template sementara jika diunggah
    template_path = None
    if req.template_file_base64 and req.template_file_name:
        try:
            template_data = base64.b64decode(req.template_file_base64)
            pid = req.pipeline_id or str(uuid.uuid4())[:8]
            template_path = str(Path(OUTPUT_DIR) / f"template_export_{pid}.docx")
            Path(template_path).write_bytes(template_data)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Gagal memproses file template: {e}")

    # Generate output path
    export_id = req.pipeline_id or str(uuid.uuid4())[:8]
    runs_dir = Path(OUTPUT_DIR) / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(runs_dir / f"export_{export_id}.docx")

    try:
        result_path, warnings = inject_into_template(
            structured_doc=structured_doc,
            template_path=template_path,
            output_path=output_path,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengekspor DOCX: {str(e)}")
    finally:
        # Bersihkan file template sementara
        if template_path and Path(template_path).exists():
            try:
                Path(template_path).unlink()
            except Exception:
                pass

    if not Path(result_path).exists():
        raise HTTPException(status_code=500, detail="File DOCX tidak berhasil dibuat")

    filename = f"dokumen_{export_id}.docx"
    response = FileResponse(
        path=result_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )
    
    # Tambahkan warnings ke header response jika ada
    if warnings:
        response.headers["X-Export-Warnings"] = " | ".join(warnings)

    return response

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
    tokens = plan["tokens"]
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "plan": current_user.plan,
        "tokens_used": current_user.tokens_used,
        "tokens_total": tokens,
        "tokens_remaining": current_user.tokens_remaining(tokens),
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
        "name": f"ResearchBuilder {plan_name}",
        "amount": amount,
        "description": f"Upgrade ke {plan_name} ResearchBuilder",
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
        user.tokens_used = 0
        user.tokens_reset_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        
    return {"status": "success", "message": f"User upgraded to {user.plan}"}

@app.get("/api/payments/history")
async def api_payment_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payments = (
        db.query(Payment)
        .filter(Payment.user_id == current_user.id, Payment.status == "paid")
        .order_by(Payment.created_at.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": p.id[:8],
            "plan": p.plan,
            "amount": p.amount,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in payments
    ]


# ── Interactive Research Wizard Endpoints ─────────────────────────────────────

from schemas.agent_schemas import ResearchSession, TitleOption

RESEARCH_DIR = os.path.join(OUTPUT_DIR, "runs")


def _fallback_title_options(tema: str, bahasa: str, document_type: str):
    """Mock title options when LLM is unavailable."""
    from schemas.agent_schemas import TitleOptionsOutput
    angles = [
        ("Analisis Sistematis", "systematic review", "Menganalisis secara sistematis literatur terkait"),
        ("Tinjauan Komparatif", "literature_review", "Membandingkan berbagai pendekatan dan temuan"),
        ("Perspektif Konseptual", "conceptual", "Membangun kerangka konseptual baru"),
    ]
    options = []
    for i, (angle, art_type, desc) in enumerate(angles):
        options.append(TitleOption(
            title=f"{angle}: {tema}" if bahasa == "id" else f"{angle} of {tema}",
            focused_topic=tema,
            description=f"[FALLBACK] {desc} tentang {tema}.",
            research_questions=[
                f"Bagaimana perkembangan terkini terkait {tema}?",
                f"Apa faktor utama yang mempengaruhi {tema}?",
            ],
            keywords=[tema.split()[0], tema.split()[-1] if len(tema.split()) > 1 else "penelitian", "analisis"],
            article_type=art_type,
        ))
    return TitleOptionsOutput(options=options)


def _fallback_literature(focused_topic: str, keywords: list[str]):
    """Mock literature search output."""
    refs = []
    for i in range(5):
        refs.append({
            "id": f"ref_{i+1:03d}",
            "title": f"[Fallback] Studi tentang {focused_topic} — Perspektif {i+1}",
            "url": f"https://example.com/paper-{i+1}",
            "snippet": f"Penelitian ini membahas aspek penting dari {focused_topic} dengan pendekatan yang komprehensif. Temuan menunjukkan bahwa topik ini memiliki relevansi yang signifikan dalam konteks akademis terkini.",
            "raw_content": f"Studi ini mengkaji {focused_topic} melalui analisis mendalam. Hasil menunjukkan beberapa temuan kunci yang mendukung pengembangan lebih lanjut di bidang ini.",
            "relevance_score": round(0.9 - i * 0.1, 2),
            "source_type": "web",
            "author": f"Penulis {chr(65+i)} et al.",
            "year": str(2024 - i),
        })
    return {"references": refs, "search_queries_used": keywords[:3]}


def _fallback_synthesis(focused_topic: str, research_questions: list[str]):
    """Mock synthesis output."""
    return {
        "key_themes": [
            {"theme_name": f"Tema Utama: {focused_topic}", "synthesis": f"Berbagai studi menunjukkan pentingnya {focused_topic} dalam konteks akademis.", "supporting_refs": ["ref_001", "ref_002"]},
            {"theme_name": "Metodologi dan Pendekatan", "synthesis": "Pendekatan yang digunakan bervariasi, mulai dari kualitatif hingga kuantitatif.", "supporting_refs": ["ref_003", "ref_004"]},
        ],
        "research_gaps": [
            {"gap_description": f"Masih terbatasnya penelitian komprehensif tentang {focused_topic}", "how_we_address_it": "Penelitian ini bertujuan mengisi gap tersebut melalui tinjauan sistematis"},
        ],
        "key_findings": [
            {"finding": f"Topik {focused_topic} menunjukkan tren peningkatan dalam publikasi akademis", "supported_by": ["ref_001", "ref_002"]},
        ],
        "synthesis_summary": f"[FALLBACK] Sintesis literatur menunjukkan bahwa {focused_topic} merupakan area penelitian yang aktif dengan berbagai perspektif yang saling melengkapi.",
        "positioning_statement": f"Penelitian ini berkontribusi pada pemahaman yang lebih mendalam tentang {focused_topic} melalui pendekatan tinjauan sistematis.",
    }


def _fallback_outline(focused_topic: str, title: str, bahasa: str, structure_preset: str):
    """Mock outline output."""
    if structure_preset == "skripsi":
        secs = [
            ("sec_1", "Pendahuluan", "Menyajikan latar belakang dan tujuan", ["Latar belakang masalah", "Rumusan masalah", "Tujuan penelitian"], 500),
            ("sec_2", "Tinjauan Pustaka", "Mengkaji teori dan literatur terkait", ["Landasan teori", "Penelitian terdahulu", "Kerangka konseptual"], 800),
            ("sec_3", "Metodologi", "Menjelaskan metode penelitian", ["Pendekatan penelitian", "Teknik pengumpulan data", "Analisis data"], 500),
            ("sec_4", "Hasil dan Pembahasan", "Menyajikan dan membahas temuan", ["Hasil analisis", "Pembahasan temuan", "Implikasi"], 800),
            ("sec_5", "Kesimpulan", "Merangkum kesimpulan dan saran", ["Kesimpulan utama", "Saran penelitian selanjutnya"], 400),
        ]
    else:
        secs = [
            ("sec_1", "Introduction", "Menyajikan latar belakang dan tujuan", ["Latar belakang masalah", "Rumusan masalah", "Tujuan penelitian"], 500),
            ("sec_2", "Methods", "Menjelaskan metode penelitian", ["Pendekatan penelitian", "Pencarian literatur", "Kriteria seleksi"], 500),
            ("sec_3", "Results", "Menyajikan temuan utama", ["Temuan literatur", "Analisis tematik", "Perbandingan studi"], 800),
            ("sec_4", "Discussion", "Membahas implikasi temuan", ["Interpretasi hasil", "Keterbatasan", "Implikasi praktis dan teoretis", "Saran penelitian lanjutan"], 700),
        ]
    return {
        "title": title or f"[Fallback] Tinjauan Sistematis: {focused_topic}",
        "abstract_hint": f"Artikel ini membahas {focused_topic} melalui tinjauan pustaka sistematis.",
        "sections": [
            {"id": sid, "title": t, "purpose": p, "key_points": kp, "word_target": wt, "references_to_cite": []}
            for sid, t, p, kp, wt in secs
        ],
        "estimated_total_words": sum(s[4] for s in secs),
    }


def _fallback_review(focused_topic: str, sections: list[dict]):
    """Mock review output."""
    return {
        "overall_score": 65,
        "issues": [
            {"type": "info", "location": "General", "description": "[FALLBACK] Artikel dibuat dengan data placeholder karena AI tidak tersedia. Harap generate ulang saat layanan AI aktif.", "suggestion": "Ulangi proses saat layanan AI tersedia", "severity": "low"},
        ],
        "abstract": f"[FALLBACK] Artikel ini menyajikan tinjauan tentang {focused_topic}. Konten ini dibuat sebagai placeholder — harap generate ulang untuk hasil yang sesungguhnya.",
        "keywords_final": [focused_topic.split()[0], "tinjauan", "analisis"],
        "review_summary": "[FALLBACK] Review dilakukan dengan data placeholder. Score tidak mencerminkan kualitas sebenarnya.",
    }

def _save_research_session(session: ResearchSession):
    path = Path(RESEARCH_DIR) / f"research_{session.research_id}.json"
    path.write_text(session.model_dump_json(indent=2))

def _load_research_session(research_id: str) -> ResearchSession | None:
    path = Path(RESEARCH_DIR) / f"research_{research_id}.json"
    if not path.exists():
        return None
    return ResearchSession.model_validate_json(path.read_text())

class ResearchTitlesRequest(PydanticBase):
    tema: str
    bahasa: Optional[str] = "id"
    document_type: Optional[str] = "artikel"
    structure_preset: Optional[str] = "imrad"
    uploaded_doc_base64: Optional[str] = None
    uploaded_doc_name: Optional[str] = None

class SelectTitleRequest(PydanticBase):
    title_index: int

class ConfirmOutlineRequest(PydanticBase):
    sections: Optional[list[dict]] = None


@app.post("/api/research/titles")
async def api_research_titles(
    req: ResearchTitlesRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_token_limit(current_user, db)

    research_id = str(uuid.uuid4())

    uploaded_doc_text = None
    if req.uploaded_doc_base64 and req.uploaded_doc_name:
        import base64
        try:
            data_str = req.uploaded_doc_base64
            if "," in data_str:
                data_str = data_str.split(",")[1]
            file_bytes = base64.b64decode(data_str)

            suffix = Path(req.uploaded_doc_name).suffix.lower()
            if suffix == ".docx":
                temp_path = os.path.join(OUTPUT_DIR, f"upload_{research_id}.docx")
                with open(temp_path, "wb") as f:
                    f.write(file_bytes)
                from utils.docx_exporter import extract_template_text
                uploaded_doc_text = extract_template_text(temp_path)
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass
            elif suffix == ".pdf":
                temp_path = os.path.join(OUTPUT_DIR, f"upload_{research_id}.pdf")
                with open(temp_path, "wb") as f:
                    f.write(file_bytes)
                try:
                    from pypdf import PdfReader
                    with open(temp_path, "rb") as pf:
                        reader = PdfReader(pf)
                        uploaded_doc_text = "\n".join(
                            page.extract_text() or "" for page in reader.pages
                        )
                except ImportError:
                    print("[WARNING] pypdf not installed — PDF upload ignored")
                    uploaded_doc_text = None
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass
            elif suffix == ".txt":
                uploaded_doc_text = file_bytes.decode("utf-8", errors="ignore")
        except Exception as e:
            print(f"Failed to extract uploaded doc: {e}")

    session = ResearchSession(
        research_id=research_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        status="generating_titles",
        step=1,
        tema=req.tema,
        bahasa=req.bahasa,
        document_type=req.document_type,
        structure_preset=req.structure_preset,
        uploaded_doc_text=uploaded_doc_text,
        user_id=current_user.id,
    )
    _save_research_session(session)

    background_tasks.add_task(
        _bg_generate_titles, research_id, req.tema, req.bahasa,
        req.document_type, req.structure_preset, uploaded_doc_text or "",
    )
    return {"research_id": research_id, "status": "generating_titles"}


def _bg_generate_titles(
    research_id: str, tema: str, bahasa: str,
    document_type: str, structure_preset: str, uploaded_doc_context: str,
):
    try:
        from agents.topic_narrowing import generate_title_options
        try:
            result = generate_title_options(
                tema=tema, bahasa=bahasa, document_type=document_type,
                structure_preset=structure_preset,
                uploaded_doc_context=uploaded_doc_context,
            )
        except Exception as e:
            print(f"Title generation failed, using fallback: {e}")
            result = _fallback_title_options(tema, bahasa, document_type)

        session = _load_research_session(research_id)
        if session:
            session.title_options = result.options
            session.status = "titles_ready"
            _save_research_session(session)
    except Exception as e:
        session = _load_research_session(research_id)
        if session:
            session.status = "failed"
            session.error = str(e)
            _save_research_session(session)


@app.post("/api/research/{research_id}/select-title")
async def api_research_select_title(
    research_id: str,
    req: SelectTitleRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _load_research_session(research_id)
    if not session:
        raise HTTPException(status_code=404, detail="Research session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    if not session.title_options or req.title_index >= len(session.title_options):
        raise HTTPException(status_code=400, detail="Invalid title index")

    check_token_limit(current_user, db)

    selected = session.title_options[req.title_index]
    session.selected_title_index = req.title_index
    session.status = "processing_literature"
    session.step = 2

    from utils.state_manager import create_pipeline, save_state, mark_stage
    pipeline_state = create_pipeline(
        tema=selected.focused_topic,
        bahasa=session.bahasa,
        user_id=current_user.id,
        document_type=session.document_type,
    )
    pipeline_state = mark_stage(pipeline_state, "topic_narrowing", "done", {
        "focused_topic": selected.focused_topic,
        "research_questions": selected.research_questions,
        "keywords": selected.keywords,
        "article_type": selected.article_type,
        "suggested_title": selected.title,
    })
    save_state(pipeline_state, OUTPUT_DIR)

    session.pipeline_id = pipeline_state.pipeline_id
    _save_research_session(session)

    plan = get_plan(current_user.plan)
    max_refs = plan.get("max_refs", 10)

    background_tasks.add_task(
        _bg_run_literature_to_outline,
        research_id, pipeline_state.pipeline_id, max_refs,
        session.structure_preset, current_user.id,
    )
    return {"status": "processing_literature", "pipeline_id": pipeline_state.pipeline_id}


def _bg_run_literature_to_outline(
    research_id: str, pipeline_id: str, max_refs: int,
    structure_preset: str, user_id: str,
):
    try:
        import agents.literature_search as a2
        import agents.synthesis as a3
        import agents.outline as a4
        from schemas.agent_schemas import (
            LiteratureSearchInput, SynthesisInput, OutlineInput, Reference,
        )
        from utils.state_manager import load_state, save_state, mark_stage
        from utils.llm_client import set_active_pipeline_id

        state = load_state(OUTPUT_DIR, pipeline_id)
        if not state:
            raise ValueError("Pipeline state not found")

        set_active_pipeline_id(pipeline_id)
        t = state.stages["topic_narrowing"].output

        # Literature search
        state.background_status = "Mencari literatur akademis..."
        save_state(state, OUTPUT_DIR)
        try:
            lit_out = a2.run(LiteratureSearchInput(
                focused_topic=t["focused_topic"],
                keywords=t["keywords"],
                research_questions=t["research_questions"],
                max_references=max_refs,
            ))
            lit_data = lit_out.model_dump()
        except Exception as e:
            print(f"Literature search failed, using fallback: {e}")
            lit_data = _fallback_literature(t["focused_topic"], t["keywords"])
        state = mark_stage(state, "literature_search", "done", lit_data)
        save_state(state, OUTPUT_DIR)

        # Synthesis
        state.background_status = "Menyintesis temuan pustaka..."
        save_state(state, OUTPUT_DIR)
        refs = [Reference(**r) for r in state.stages["literature_search"].output["references"]]
        try:
            syn_out = a3.run(SynthesisInput(
                focused_topic=t["focused_topic"],
                research_questions=t["research_questions"],
                references=refs,
            ))
            syn_data = syn_out.model_dump()
        except Exception as e:
            print(f"Synthesis failed, using fallback: {e}")
            syn_data = _fallback_synthesis(t["focused_topic"], t["research_questions"])
        state = mark_stage(state, "synthesis", "done", syn_data)
        save_state(state, OUTPUT_DIR)

        # Outline
        s = state.stages["synthesis"].output
        state.background_status = "Menyusun kerangka artikel..."
        save_state(state, OUTPUT_DIR)

        key_themes_str = []
        for theme in s.get("key_themes", []):
            if isinstance(theme, dict):
                key_themes_str.append(f"{theme.get('theme_name', '')}: {theme.get('synthesis', '')}")
            else:
                key_themes_str.append(str(theme))
        research_gaps_str = []
        for gap in s.get("research_gaps", []):
            if isinstance(gap, dict):
                research_gaps_str.append(f"Gap: {gap.get('gap_description', '')} | Solusi: {gap.get('how_we_address_it', '')}")
            else:
                research_gaps_str.append(str(gap))

        structure_hint = ""
        if structure_preset == "imrad":
            structure_hint = "Gunakan struktur IMRAD: Introduction, Methods, Results, and Discussion."
        elif structure_preset == "skripsi":
            structure_hint = "Gunakan struktur skripsi: Pendahuluan, Tinjauan Pustaka, Metodologi, Hasil & Pembahasan, Kesimpulan."

        try:
            outline_out = a4.run(OutlineInput(
                focused_topic=t["focused_topic"],
                article_type=t["article_type"],
                research_questions=t["research_questions"],
                synthesis_summary=s["synthesis_summary"],
                key_themes=key_themes_str,
                research_gaps=research_gaps_str,
                bahasa=state.input.bahasa,
                references=refs,
            ), template_text=structure_hint)
            outline_data = outline_out.model_dump()
        except Exception as e:
            print(f"Outline failed, using fallback: {e}")
            outline_data = _fallback_outline(
                t["focused_topic"], t.get("suggested_title", ""),
                state.input.bahasa, structure_preset,
            )

        state = mark_stage(state, "outline", "done", outline_data)
        save_state(state, OUTPUT_DIR)

        session = _load_research_session(research_id)
        if session:
            session.status = "outline_ready"
            session.step = 3
            _save_research_session(session)

        _track_research_tokens(pipeline_id, user_id)

    except Exception as e:
        print(f"Error in research pipeline (lit→outline): {e}")
        session = _load_research_session(research_id)
        if session:
            session.status = "failed"
            session.error = str(e)
            _save_research_session(session)


def _track_research_tokens(pipeline_id: str, user_id: str):
    try:
        from database import SessionLocal
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                usage = get_usage(pipeline_id)
                total_tokens = usage.get("total", {}).get("total_tokens", 0)
                user.tokens_used += total_tokens
                db.commit()
        finally:
            db.close()
    except Exception:
        pass


@app.post("/api/research/{research_id}/confirm-outline")
async def api_research_confirm_outline(
    research_id: str,
    req: ConfirmOutlineRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = _load_research_session(research_id)
    if not session:
        raise HTTPException(status_code=404, detail="Research session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    if not session.pipeline_id:
        raise HTTPException(status_code=400, detail="No pipeline linked")

    check_token_limit(current_user, db)

    if req.sections:
        from utils.state_manager import load_state, save_state, mark_stage
        state = load_state(OUTPUT_DIR, session.pipeline_id)
        if state:
            state = mark_stage(state, "outline", "done", {
                **state.stages["outline"].output,
                "sections": req.sections,
            })
            save_state(state, OUTPUT_DIR)

    session.status = "writing"
    session.step = 4
    _save_research_session(session)

    background_tasks.add_task(
        _bg_run_writing_to_review, research_id, session.pipeline_id, current_user.id,
    )
    return {"status": "writing"}


def _bg_run_writing_to_review(research_id: str, pipeline_id: str, user_id: str):
    try:
        import agents.writing as a5
        import agents.review as a6
        from schemas.agent_schemas import (
            Section, Reference, WritingContext, WritingSectionOutput, ReviewInput,
        )
        from utils.state_manager import load_state, save_state, mark_stage
        from utils.llm_client import set_active_pipeline_id

        state = load_state(OUTPUT_DIR, pipeline_id)
        if not state:
            raise ValueError("Pipeline state not found")

        set_active_pipeline_id(pipeline_id)
        t = state.stages["topic_narrowing"].output
        l = state.stages["literature_search"].output
        s = state.stages["synthesis"].output
        o = state.stages["outline"].output

        sections = [Section(**sec) for sec in o["sections"]]
        refs = [Reference(**r) for r in l["references"]]
        context = WritingContext(
            focused_topic=t["focused_topic"],
            article_type=t["article_type"],
            synthesis_summary=s["synthesis_summary"],
            positioning_statement=s["positioning_statement"],
            bahasa=state.input.bahasa,
        )

        written_sections = []
        for idx, section in enumerate(sections):
            state.background_status = f"Menulis bab {idx+1}/{len(sections)}: {section.title}"
            save_state(state, OUTPUT_DIR)

            try:
                result = a5.write_section(
                    a5.WritingInput(section=section, context=context, references_detail=refs),
                    template_text="",
                )
            except Exception as e:
                print(f"Writing section {idx+1} failed, using fallback: {e}")
                fallback_content = f"[FALLBACK — AI tidak tersedia]\n\n"
                fallback_content += f"Bagian ini membahas: {section.purpose}\n\n"
                fallback_content += "Poin-poin utama:\n" + "\n".join(f"- {p}" for p in section.key_points)
                result = WritingSectionOutput(
                    section_id=section.id,
                    title=section.title,
                    content=fallback_content,
                    word_count=len(fallback_content.split()),
                    citations_used=[],
                )
            written_sections.append(result.model_dump())
            state.stages["writing"].output = {"sections": written_sections}
            save_state(state, OUTPUT_DIR)

        state = mark_stage(state, "writing", "done", {"sections": written_sections})
        state = mark_stage(state, "draft_adaptation", "done", {"skipped": True})
        save_state(state, OUTPUT_DIR)

        # Review
        state.background_status = "Melakukan review kualitas artikel..."
        save_state(state, OUTPUT_DIR)
        full_draft = "\n\n".join(
            f"## {sec['title']}\n{sec['content']}" for sec in written_sections
        )
        try:
            review_out = a6.run(
                ReviewInput(
                    full_draft=full_draft,
                    focused_topic=t["focused_topic"],
                    research_questions=t["research_questions"],
                    references=refs,
                ),
                article_type=t["article_type"],
            )
            review_data = review_out.model_dump()
        except Exception as e:
            print(f"Review failed, using fallback: {e}")
            review_data = _fallback_review(t["focused_topic"], written_sections)
        state = mark_stage(state, "review", "done", review_data)
        save_state(state, OUTPUT_DIR)

        # Export
        from tools.file_writer import write_article, write_references
        from utils.llm_client import get_current_model
        refs_list = [Reference(**x).model_dump() for x in l["references"]]
        article_path = write_article(
            output_dir=OUTPUT_DIR, title=o["title"],
            abstract=review_data.get("abstract", ""),
            sections=written_sections,
            references=refs_list,
            keywords=review_data.get("keywords_final", []),
            review_score=review_data.get("overall_score", 0),
            models_used=[get_current_model()],
        )
        write_references(OUTPUT_DIR, refs_list)

        import shutil
        history_dir = Path(OUTPUT_DIR) / "runs"
        shutil.copy(article_path, history_dir / f"draft_article_{pipeline_id}.md")
        shutil.copy(
            Path(OUTPUT_DIR) / "references.md",
            history_dir / f"references_{pipeline_id}.md",
        )

        try:
            from utils.docx_injector import inject_into_template, structured_doc_from_pipeline
            from utils.citation_formatter import format_citations_in_text, format_bibliography
            formatted_refs = format_bibliography(refs_list, "default")
            structured_doc = structured_doc_from_pipeline(
                title=o.get("title", ""),
                abstract=review_data.get("abstract", ""),
                keywords=review_data.get("keywords_final", []),
                sections=[{
                    "heading": sec.get("title", ""),
                    "paragraphs": [format_citations_in_text(sec.get("content", ""), refs_list, "default")],
                } for sec in written_sections],
                references_formatted=[{"teks_sitasi": line.lstrip("- ")} for line in formatted_refs],
            )
            docx_path = Path(OUTPUT_DIR) / "draft_article.docx"
            inject_into_template(structured_doc=structured_doc, template_path=None, output_path=str(docx_path))
            shutil.copy(str(docx_path), history_dir / f"draft_article_{pipeline_id}.docx")
        except Exception as e:
            print(f"DOCX export warning: {e}")

        state.status = "completed"
        state.final_output_path = str(article_path)
        save_state(state, OUTPUT_DIR)

        session = _load_research_session(research_id)
        if session:
            session.status = "completed"
            session.step = 5
            _save_research_session(session)

        _track_research_tokens(pipeline_id, user_id)

    except Exception as e:
        print(f"Error in research pipeline (writing→review): {e}")
        session = _load_research_session(research_id)
        if session:
            session.status = "failed"
            session.error = str(e)
            _save_research_session(session)


@app.get("/api/research/{research_id}/status")
async def api_research_status(
    research_id: str,
    current_user: User = Depends(get_current_user),
):
    session = _load_research_session(research_id)
    if not session:
        raise HTTPException(status_code=404, detail="Research session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak")

    result = session.model_dump()

    if session.pipeline_id:
        state = load_state(OUTPUT_DIR, session.pipeline_id)
        if state:
            result["pipeline"] = {
                "status": state.status,
                "background_status": state.background_status,
                "stages": {k: {"status": v.status} for k, v in state.stages.items()},
            }
            if session.status == "outline_ready" and state.stages["outline"].output:
                result["outline"] = state.stages["outline"].output
            if session.status in ("writing", "completed") and state.stages["writing"].output:
                sections = state.stages["writing"].output.get("sections", [])
                outline_sections = (state.stages["outline"].output or {}).get("sections", [])
                result["writing_progress"] = {
                    "completed": len(sections),
                    "total": len(outline_sections),
                    "current_section": state.background_status or "",
                }
            if session.status == "completed" and state.stages["review"].output:
                result["review"] = state.stages["review"].output

    return result

@app.get("/api/payment/mock-checkout", response_class=HTMLResponse)
async def mock_checkout_page(payment_id: str, plan: str, email: str, redirect_url: Optional[str] = "/"):
    plan_name = "Basic Monthly" if plan == "basic" else "Premium Monthly"
    amount_str = "Rp 49.000" if plan == "basic" else "Rp 99.000"
    
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ResearchBuilder — Sandboxed Checkout</title>
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
                <span class="detail-value">ResearchBuilder {plan_name}</span>
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