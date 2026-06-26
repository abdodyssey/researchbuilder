import os
import glob
import json
import uuid
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from orchestrator import run_pipeline
from utils.state_manager import load_state, STATE_FILE, PipelineState

load_dotenv()

app = FastAPI(title="ResearchPilot Web UI")

OUTPUT_DIR = "/tmp" if os.environ.get("VERCEL") else os.getenv("OUTPUT_DIR", "./output")
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
Path(os.path.join(OUTPUT_DIR, "runs")).mkdir(parents=True, exist_ok=True)

# Ensure directories exist
static_dir = Path("static")
static_dir.mkdir(exist_ok=True)
(static_dir / "css").mkdir(exist_ok=True)
(static_dir / "js").mkdir(exist_ok=True)
Path("templates").mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

class GenerateRequest(BaseModel):
    tema: str
    bahasa: Optional[str] = "id"
    resume: Optional[bool] = False
    pipeline_id: Optional[str] = None
    template_file_base64: Optional[str] = None
    template_file_name: Optional[str] = None

# Track background running states
# Store pipeline_id: status
active_runs = {}

def bg_run_pipeline(tema: str, bahasa: str, output_dir: str, resume: bool, pipeline_id: str, template_path: Optional[str] = None):
    try:
        active_runs[pipeline_id] = "running"
        run_pipeline(tema=tema, bahasa=bahasa, output_dir=output_dir, resume=resume, pipeline_id=pipeline_id, template_path=template_path)
        active_runs[pipeline_id] = "completed"
    except Exception as e:
        print(f"Error in background pipeline: {e}")
        active_runs[pipeline_id] = f"failed: {str(e)}"

@app.post("/api/generate")
async def api_generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    if not req.tema:
        raise HTTPException(status_code=400, detail="Tema is required")
        
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
        
        # Save template if uploaded
        pid = str(uuid.uuid4()) # pre-generate ID for template file name
        template_path = None
        if req.template_file_base64 and req.template_file_name:
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
                
        temp_state = create_pipeline(req.tema, req.bahasa, template_path)
        # Override pipeline_id so it matches our pre-generated pid
        temp_state.pipeline_id = pid
        save_state(temp_state, OUTPUT_DIR)

        
    background_tasks.add_task(bg_run_pipeline, req.tema, req.bahasa, OUTPUT_DIR, req.resume, pid, template_path)
    
    return {"status": "started", "pipeline_id": pid}

@app.get("/api/status/{pipeline_id}")
async def api_status(pipeline_id: str):
    # Load state from file
    state = load_state(OUTPUT_DIR, pipeline_id)
    if not state:
        # Try checking active runs
        if pipeline_id in active_runs:
            return {"status": active_runs[pipeline_id]}
        raise HTTPException(status_code=404, detail="Pipeline run not found")
        
    res = state.model_dump()
    # Add active background status
    res["background_status"] = active_runs.get(pipeline_id, "unknown")
    return res

@app.get("/api/runs")
async def api_runs():
    # Scan output/runs directory for all pipeline states
    runs = []
    run_files = glob.glob(os.path.join(OUTPUT_DIR, "runs", "pipeline_state_*.json"))
    for file_path in run_files:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
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
            
    # Sort by created_at desc
    runs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return runs

@app.get("/api/download/{pipeline_id}/{filename}")
async def api_download_file(pipeline_id: str, filename: str):
    if filename.endswith(".docx") or filename == "docx":
        file_path = Path(OUTPUT_DIR) / "runs" / f"draft_article_{pipeline_id}.docx"
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        dl_name = f"draft_article_{pipeline_id}.docx"
        if not file_path.exists():
            state = load_state(OUTPUT_DIR, pipeline_id)
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
            state = load_state(OUTPUT_DIR, pipeline_id)
            if state and state.status == "completed":
                fallback = Path(OUTPUT_DIR) / "draft_article.md"
                if fallback.exists():
                    return FileResponse(fallback, media_type=media_type, filename=dl_name)
            raise HTTPException(status_code=404, detail="Markdown file not found")
        return FileResponse(file_path, media_type=media_type, filename=dl_name)

@app.get("/api/content/{pipeline_id}")
async def api_get_content(pipeline_id: str):
    md_path = Path(OUTPUT_DIR) / "runs" / f"draft_article_{pipeline_id}.md"
    ref_path = Path(OUTPUT_DIR) / "runs" / f"references_{pipeline_id}.md"
    
    # Fallback to root files if matching the active state
    state = load_state(OUTPUT_DIR, pipeline_id)
    
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

@app.get("/", response_class=HTMLResponse)
async def home():
    html_path = Path("templates/index.html")
    if html_path.exists():
        return html_path.read_text(encoding="utf-8")
    return "<h1>HTML Template not found!</h1>"
