import argparse
import os
import glob
import json
from pathlib import Path
from dotenv import load_dotenv
from orchestrator import run_pipeline

load_dotenv()

def list_runs(output_dir: str):
    run_files = glob.glob(os.path.join(output_dir, "runs", "pipeline_state_*.json"))
    if not run_files:
        print("No pipeline runs found.")
        return
        
    runs = []
    for fpath in run_files:
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
                runs.append({
                    "id": data.get("pipeline_id"),
                    "created_at": data.get("created_at"),
                    "status": data.get("status"),
                    "tema": data.get("input", {}).get("tema_umum"),
                    "score": data.get("stages", {}).get("review", {}).get("output", {}).get("overall_score")
                })
        except Exception:
            pass
            
    runs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    print("\n--- Pipeline Runs History ---")
    for r in runs:
        score_str = f"Score: {r['score']}/100" if r['score'] else "Score: N/A"
        print(f"[{r['created_at']}] ID: {r['id']} | Status: {r['status']} | {score_str}")
        print(f"  Tema: {r['tema']}")
        print("-" * 50)

def clean_workspace(output_dir: str):
    print(f"Cleaning workspace files in {output_dir}...")
    for filename in ["draft_article.md", "draft_article.docx", "references.md", "pipeline_state.json"]:
        p = Path(output_dir) / filename
        if p.exists():
            p.unlink()
            print(f"  Removed: {filename}")
    print("Workspace cleaned successfully.")

def main():
    parser = argparse.ArgumentParser(description="ResearchPilot - AI Research Article Generator")
    parser.add_argument("--tema", help="Tema umum artikel")
    parser.add_argument("--bahasa", default=os.getenv("DEFAULT_LANGUAGE", "id"), choices=["id", "en"])
    parser.add_argument("--output", default=os.getenv("OUTPUT_DIR", "./output"))
    parser.add_argument("--resume", action="store_true", help="Resume pipeline yang interrupted")
    parser.add_argument("--clean", action="store_true", help="Bersihkan draf/state lama sebelum run baru")
    parser.add_argument("--list-runs", action="store_true", help="Melihat daftar riwayat pipeline run")
    args = parser.parse_args()

    output_dir = args.output

    if args.clean:
        clean_workspace(output_dir)

    if args.list_runs:
        list_runs(output_dir)
        return

    if not args.tema and not args.clean:
        parser.error("Argument --tema diperlukan kecuali jika menggunakan --clean or --list-runs")

    if args.tema:
        run_pipeline(
            tema=args.tema,
            bahasa=args.bahasa,
            output_dir=output_dir,
            resume=args.resume,
        )

if __name__ == "__main__":
    main()
