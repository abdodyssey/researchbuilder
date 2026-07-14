"""
Research Store — Persistensi State Riset ke Database
=====================================================
Menggantikan penyimpanan berbasis file JSON (research_*.json + pipeline_state_*.json)
dengan satu tabel `research_jobs` di database (Neon Postgres produksi).

Kenapa:
- File JSON nempel ke satu filesystem → tidak bisa horizontal scale, hilang di
  serverless yang ephemeral.
- DB-backed: konsisten, bisa di-query per user, siap multi-instance.

Desain:
- Satu baris `ResearchJob` = satu sesi riset. Kolom `session_data` menyimpan
  snapshot ResearchSession (Pydantic), `pipeline_data` menyimpan PipelineState.
- Kolom yang sering di-query (user_id, status, step, pipeline_id, created_at)
  dipromosikan jadi kolom asli agar bisa di-index & difilter tanpa parse JSON.
- Fungsi di sini menerima/mengembalikan objek Pydantic yang SAMA seperti dulu,
  jadi kode pemanggil (endpoints, background tasks) minim berubah.

Batch/CLI pipeline (orchestrator.py + main.py) TETAP memakai file via
utils/state_manager.py — tidak disentuh. Modul ini khusus untuk web flow.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from database import SessionLocal
from models import ResearchJob
from schemas.agent_schemas import ResearchSession, PipelineState


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Research Session (menggantikan _save/_load_research_session) ──────────────

def save_research_session(session: ResearchSession) -> None:
    """Simpan/replace ResearchSession ke DB (upsert by research_id)."""
    db: Session = SessionLocal()
    try:
        job = db.get(ResearchJob, session.research_id)
        if job is None:
            job = ResearchJob(id=session.research_id)
            db.add(job)
        # Promosikan field yang di-query, simpan snapshot lengkap di JSON.
        job.user_id = session.user_id
        job.status = session.status
        job.step = session.step
        job.pipeline_id = session.pipeline_id
        job.error = session.error
        job.session_data = session.model_dump(mode="json")
        job.updated_at = _utcnow()
        db.commit()
    finally:
        db.close()


def load_research_session(research_id: str) -> Optional[ResearchSession]:
    """Load ResearchSession dari DB. Return None jika tidak ada."""
    db: Session = SessionLocal()
    try:
        job = db.get(ResearchJob, research_id)
        if job is None or not job.session_data:
            return None
        return ResearchSession.model_validate(job.session_data)
    finally:
        db.close()


# ── Pipeline State (menggantikan file pipeline_state_{id}.json untuk web) ─────

def save_pipeline_state(state: PipelineState) -> None:
    """Simpan PipelineState ke DB, di-link ke ResearchJob lewat pipeline_id.

    Otomatis attach token usage terbaru (sama seperti state_manager.save_state).
    Baris dicari berdasarkan pipeline_id; jika sesi riset belum punya baris
    (mis. pemakaian di luar web flow), buat baris standalone.
    """
    try:
        from utils.llm_client import get_usage
        usage = get_usage(state.pipeline_id)
        if usage:
            state.token_usage = usage
    except Exception:
        pass

    db: Session = SessionLocal()
    try:
        job = (
            db.query(ResearchJob)
            .filter(ResearchJob.pipeline_id == state.pipeline_id)
            .first()
        )
        if job is None:
            # Tidak ada sesi riset terkait — buat baris berbasis pipeline saja.
            job = ResearchJob(
                id=state.pipeline_id,
                user_id=state.user_id,
                pipeline_id=state.pipeline_id,
            )
            db.add(job)
        job.pipeline_data = state.model_dump(mode="json")
        job.updated_at = _utcnow()
        db.commit()
    finally:
        db.close()


def load_pipeline_state(pipeline_id: str) -> Optional[PipelineState]:
    """Load PipelineState dari DB by pipeline_id. Return None jika tidak ada."""
    db: Session = SessionLocal()
    try:
        job = (
            db.query(ResearchJob)
            .filter(ResearchJob.pipeline_id == pipeline_id)
            .first()
        )
        if job is None or not job.pipeline_data:
            return None
        return PipelineState.model_validate(job.pipeline_data)
    finally:
        db.close()


# ── Alias kompatibel dengan utils.state_manager (drop-in untuk web flow) ──────
# Signature dibuat identik dengan state_manager.save_state/load_state agar
# blok background task cukup mengganti sumber import, tanpa ubah call site.

def save_state(state: PipelineState, output_dir: str = None) -> None:
    save_pipeline_state(state)


def load_state(output_dir: str = None, pipeline_id: str = None) -> Optional[PipelineState]:
    return load_pipeline_state(pipeline_id)


# ── Listing (menggantikan glob pipeline_state_*.json di /api/runs) ────────────

def list_user_runs(user_id: str) -> list[dict]:
    """Daftar run milik user, terbaru dulu — diambil dari pipeline_data.

    Hanya baris yang punya pipeline_data (sudah masuk tahap penulisan) yang
    relevan untuk halaman 'Dokumen Saya'.
    """
    db: Session = SessionLocal()
    try:
        jobs = (
            db.query(ResearchJob)
            .filter(ResearchJob.user_id == user_id)
            .filter(ResearchJob.pipeline_data.isnot(None))
            .order_by(ResearchJob.created_at.desc())
            .all()
        )
        runs = []
        for job in jobs:
            data = job.pipeline_data or {}
            inp = data.get("input") or {}
            stages = data.get("stages") or {}
            review_out = (stages.get("review") or {}).get("output") or {}
            token_total = (data.get("token_usage") or {}).get("total") or {}
            runs.append({
                "research_id": job.id,
                "pipeline_id": data.get("pipeline_id"),
                "created_at": data.get("created_at"),
                "status": data.get("status"),
                "tema_umum": inp.get("tema_umum"),
                "bahasa": inp.get("bahasa"),
                "review_score": review_out.get("overall_score"),
                "token_usage_total": token_total.get("total_tokens", 0),
                "document_type": inp.get("document_type", "artikel"),
            })
        return runs
    finally:
        db.close()


def delete_run(pipeline_id: str, user_id: str) -> bool:
    """Hapus run milik user (guard by user_id). Return True jika ada yang dihapus."""
    db: Session = SessionLocal()
    try:
        job = (
            db.query(ResearchJob)
            .filter(ResearchJob.pipeline_id == pipeline_id)
            .filter(ResearchJob.user_id == user_id)
            .first()
        )
        if job is None:
            return False
        db.delete(job)
        db.commit()
        return True
    finally:
        db.close()
