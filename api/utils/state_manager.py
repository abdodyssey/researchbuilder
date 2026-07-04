"""
State Manager — Persistensi Pipeline State
=============================================
Mengelola lifecycle state pipeline: create, save, load, mark_stage.

Setiap pipeline run disimpan sebagai file JSON individual:
  output/runs/pipeline_state_{pipeline_id}.json

Fitur:
- Setiap save otomatis meng-attach token usage terbaru dari llm_client
- Support resume: jika pipeline gagal, state terakhir bisa di-load dan dilanjutkan
- Stage tracking: setiap stage punya status (pending/running/done/failed) + output dict
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from schemas.agent_schemas import PipelineState, StageState, TopicNarrowingInput


STATE_FILE = "pipeline_state.json"


def create_pipeline(
    tema: str,
    bahasa: str = "id",
    template_path: str = None,
    user_id: str = None,
    citation_style: str = "default",
    is_draft_review: bool = False,
    draft_file_path: str = None,
    document_type: str = "artikel"
) -> PipelineState:
    """
    Buat PipelineState baru dengan UUID unik.
    Ini adalah titik awal setiap pipeline run (baik batch maupun interactive).
    """
    return PipelineState(
        pipeline_id=str(uuid.uuid4()),
        created_at=datetime.now(timezone.utc).isoformat(),
        input=TopicNarrowingInput(tema_umum=tema, bahasa=bahasa, document_type=document_type),
        template_path=template_path,
        user_id=user_id,
        citation_style=citation_style,
        is_draft_review=is_draft_review,
        draft_file_path=draft_file_path,
    )


def save_state(state: PipelineState, output_dir: str = "./output") -> None:
    """
    Simpan pipeline state ke file JSON di output/runs/.
    Otomatis attach token usage terbaru dari in-memory store.
    Dipanggil setelah setiap perubahan state (stage complete, error, dll).
    """
    try:
        from utils.llm_client import get_usage
        usage = get_usage(state.pipeline_id)
        if usage:
            state.token_usage = usage
    except Exception:
        pass

    history_dir = Path(output_dir) / "runs"
    history_dir.mkdir(parents=True, exist_ok=True)
    history_path = history_dir / f"pipeline_state_{state.pipeline_id}.json"
    history_path.write_text(state.model_dump_json(indent=2))



def load_state(output_dir: str = "./output", pipeline_id: str = None) -> PipelineState | None:
    """
    Load pipeline state dari file JSON.
    Jika pipeline_id diberikan, load file spesifik; jika tidak, load default state file.
    Return None jika file tidak ditemukan.
    """
    if pipeline_id:
        path = Path(output_dir) / "runs" / f"pipeline_state_{pipeline_id}.json"
    else:
        path = Path(output_dir) / "runs" / STATE_FILE
    if not path.exists():
        return None
    return PipelineState.model_validate_json(path.read_text())



def mark_stage(state: PipelineState, stage: str, status: str,
               output: dict = None, error: str = None) -> PipelineState:
    """
    Update status sebuah stage dalam pipeline.
    Jika status = "failed", otomatis set pipeline status ke "failed" juga.
    """
    state.stages[stage] = StageState(status=status, output=output, error=error)
    if status == "failed":
        state.status = "failed"
    return state
