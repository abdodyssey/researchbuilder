"""
Runs Router — Pipeline status, downloads, content, history, cleanup.
"""

import glob
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from auth import get_current_user
from config.runtime import OUTPUT_DIR, active_runs
from database import get_db
from models import User
from utils.llm_client import get_usage
from utils.research_store import load_state, save_state, list_user_runs, delete_run

router = APIRouter(prefix="/api", tags=["runs"])


@router.get("/status/{pipeline_id}")
async def api_status(pipeline_id: str, current_user: User = Depends(get_current_user)):
    state = load_state(OUTPUT_DIR, pipeline_id)
    if not state:
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

    if state.status == "running" and bg_status == "unknown":
        res["status"] = "failed"
        res["background_status"] = "failed: Proses terhenti karena server melakukan restart."
        try:
            state.status = "failed"
            save_state(state, OUTPUT_DIR)
        except Exception:
            pass

    return res


@router.get("/runs")
async def api_runs(current_user: User = Depends(get_current_user)):
    return list_user_runs(current_user.id)


@router.get("/download/{pipeline_id}/{filename}")
async def api_download_file(
    pipeline_id: str,
    filename: str,
    current_user: User = Depends(get_current_user),
):
    state = load_state(OUTPUT_DIR, pipeline_id)
    if state and state.user_id is not None and state.user_id != current_user.id:
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


@router.get("/content/{pipeline_id}")
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

    return {"article": article_content, "references": references_content}


@router.post("/clean")
async def api_clean(current_user: User = Depends(get_current_user)):
    for f in ["draft_article.md", "draft_article.docx", "references.md", "pipeline_state.json"]:
        p = Path(OUTPUT_DIR) / f
        if p.exists():
            p.unlink()
    return {"status": "success"}


@router.delete("/runs/{pipeline_id}")
async def api_delete_run(pipeline_id: str, current_user: User = Depends(get_current_user)):
    delete_run(pipeline_id, current_user.id)
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


@router.get("/token-usage/{pipeline_id}")
async def api_token_usage(pipeline_id: str, current_user: User = Depends(get_current_user)):
    state = load_state(OUTPUT_DIR, pipeline_id)
    if state and state.user_id is not None and state.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak ke dokumen ini")
    return get_usage(pipeline_id)
