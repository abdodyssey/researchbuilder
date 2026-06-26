import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from schemas.agent_schemas import PipelineState, StageState, TopicNarrowingInput


STATE_FILE = "pipeline_state.json"


def create_pipeline(tema: str, bahasa: str = "id", template_path: str = None) -> PipelineState:
    return PipelineState(
        pipeline_id=str(uuid.uuid4()),
        created_at=datetime.now(timezone.utc).isoformat(),
        input=TopicNarrowingInput(tema_umum=tema, bahasa=bahasa),
        template_path=template_path,
    )


def save_state(state: PipelineState, output_dir: str = "./output") -> None:
    # Save active state (backward compatible)
    path = Path(output_dir) / STATE_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(state.model_dump_json(indent=2))

    # Save historical state
    history_dir = Path(output_dir) / "runs"
    history_dir.mkdir(parents=True, exist_ok=True)
    history_path = history_dir / f"pipeline_state_{state.pipeline_id}.json"
    history_path.write_text(state.model_dump_json(indent=2))



def load_state(output_dir: str = "./output", pipeline_id: str = None) -> PipelineState | None:
    if pipeline_id:
        path = Path(output_dir) / "runs" / f"pipeline_state_{pipeline_id}.json"
    else:
        path = Path(output_dir) / STATE_FILE
    if not path.exists():
        return None
    return PipelineState.model_validate_json(path.read_text())



def mark_stage(state: PipelineState, stage: str, status: str,
               output: dict = None, error: str = None) -> PipelineState:
    state.stages[stage] = StageState(status=status, output=output, error=error)
    return state
