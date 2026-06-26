import os
from pathlib import Path
from dotenv import load_dotenv
from rich.console import Console

from schemas.agent_schemas import (
    TopicNarrowingInput, LiteratureSearchInput,
    SynthesisInput, OutlineInput, WritingContext, ReviewInput, PipelineState
)
from utils.state_manager import create_pipeline, save_state, load_state, mark_stage
from tools.file_writer import write_article, write_references

import agents.topic_narrowing as a1
import agents.literature_search as a2
import agents.synthesis as a3
import agents.outline as a4
import agents.writing as a5
import agents.review as a6
import agents.revision as a7

load_dotenv()
console = Console()


def run_pipeline(tema: str, bahasa: str = "id", output_dir: str = "./output", resume: bool = False, pipeline_id: str = None, template_path: str = None) -> str:
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    state = load_state(output_dir, pipeline_id) if (resume or pipeline_id) else None
    if state is None:
        state = create_pipeline(tema, bahasa, template_path)
        save_state(state, output_dir)
        console.print(f"[bold green]Pipeline started:[/] {state.pipeline_id}")
    else:
        # Reset failed statuses so we can resume properly
        state.status = "running"
        for stage_name, stage in state.stages.items():
            if stage.status == "failed":
                stage.status = "running"
                stage.error = None
        save_state(state, output_dir)
        console.print(f"[bold green]Resuming pipeline:[/] {state.pipeline_id}")


    template_text = ""
    if state.template_path:
        from utils.docx_exporter import extract_template_text
        template_text = extract_template_text(state.template_path)

    # Agent 1
    if state.stages["topic_narrowing"].status != "done":
        console.print("\n[cyan][1/6] Topic Narrowing...[/]")
        try:
            out = a1.run(TopicNarrowingInput(tema_umum=tema, bahasa=bahasa), template_text=template_text)
            state = mark_stage(state, "topic_narrowing", "done", out.model_dump())
            save_state(state, output_dir)
            console.print(f"  v Focused: {out.focused_topic}")
        except Exception as e:
            state = mark_stage(state, "topic_narrowing", "failed", error=str(e))
            save_state(state, output_dir)
            raise

    t = state.stages["topic_narrowing"].output

    # Agent 2
    if state.stages["literature_search"].status != "done":
        console.print("\n[cyan][2/6] Literature Search...[/]")
        try:
            out = a2.run(LiteratureSearchInput(
                focused_topic=t["focused_topic"],
                keywords=t["keywords"],
                research_questions=t["research_questions"],
                max_references=int(os.getenv("MAX_REFERENCES", 10))
            ))
            state = mark_stage(state, "literature_search", "done", out.model_dump())
            save_state(state, output_dir)
            console.print(f"  v Found {len(out.references)} references")
        except Exception as e:
            state = mark_stage(state, "literature_search", "failed", error=str(e))
            save_state(state, output_dir)
            raise

    l = state.stages["literature_search"].output

    # Agent 3
    if state.stages["synthesis"].status != "done":
        console.print("\n[cyan][3/6] Synthesis...[/]")
        try:
            from schemas.agent_schemas import Reference
            refs = [Reference(**r) for r in l["references"]]
            out = a3.run(SynthesisInput(
                focused_topic=t["focused_topic"],
                research_questions=t["research_questions"],
                references=refs
            ))
            state = mark_stage(state, "synthesis", "done", out.model_dump())
            save_state(state, output_dir)
            console.print(f"  v Themes: {len(out.key_themes)}, Gaps: {len(out.research_gaps)}")
        except Exception as e:
            state = mark_stage(state, "synthesis", "failed", error=str(e))
            save_state(state, output_dir)
            raise

    s = state.stages["synthesis"].output

    # Agent 4
    if state.stages["outline"].status != "done":
        console.print("\n[cyan][4/6] Outline...[/]")
        try:
            out = a4.run(OutlineInput(
                focused_topic=t["focused_topic"],
                article_type=t["article_type"],
                research_questions=t["research_questions"],
                synthesis_summary=s["synthesis_summary"],
                key_themes=s["key_themes"],
                research_gaps=s["research_gaps"],
                bahasa=bahasa
            ), template_text=template_text)
            state = mark_stage(state, "outline", "done", out.model_dump())
            save_state(state, output_dir)
            console.print(f"  v {len(out.sections)} sections, ~{out.estimated_total_words} words")
        except Exception as e:
            state = mark_stage(state, "outline", "failed", error=str(e))
            save_state(state, output_dir)
            raise

    o = state.stages["outline"].output

    # Agent 5
    if state.stages["writing"].status != "done":
        console.print("\n[cyan][5/6] Writing sections...[/]")
        try:
            from schemas.agent_schemas import Section, Reference
            sections = [Section(**sec) for sec in o["sections"]]
            refs = [Reference(**r) for r in l["references"]]
            context = WritingContext(
                focused_topic=t["focused_topic"],
                article_type=t["article_type"],
                synthesis_summary=s["synthesis_summary"],
                positioning_statement=s["positioning_statement"],
                bahasa=bahasa
            )
            out = a5.run(sections, context, refs, template_text=template_text)
            state = mark_stage(state, "writing", "done", out.model_dump())
            save_state(state, output_dir)
            total_words = sum(sec.word_count for sec in out.sections)
            console.print(f"  v Written {len(out.sections)} sections, ~{total_words} words")
        except Exception as e:
            state = mark_stage(state, "writing", "failed", error=str(e))
            save_state(state, output_dir)
            raise

    w = state.stages["writing"].output

    # Agent 6
    if state.stages["review"].status != "done":
        console.print("\n[cyan][6/6] Review & Auto-Revision...[/]")
        try:
            from schemas.agent_schemas import Reference
            refs = [Reference(**r) for r in l["references"]]
            
            # Initial full draft
            full_draft = "\n\n".join(
                f"## {sec['title']}\n{sec['content']}" for sec in w["sections"]
            )
            
            # Run initial review
            out = a6.run(ReviewInput(
                full_draft=full_draft,
                focused_topic=t["focused_topic"],
                research_questions=t["research_questions"],
                references=refs
            ), article_type=t["article_type"], template_text=template_text)
            
            # Auto-revision loop if critical issues exist
            critical_issues = [issue for issue in out.issues if issue.severity.lower() == "critical"]
            
            if critical_issues:
                console.print(f"  [yellow]Found {len(critical_issues)} critical issues. Running Auto-Revision pass...[/]")
                
                # Run revision agent
                revised_sections = a7.run(
                    sections=w["sections"],
                    critical_issues=[issue.model_dump() for issue in critical_issues],
                    references=[r.model_dump() for r in refs],
                    bahasa=bahasa
                )
                
                # Update writing stage output with revised sections
                w["sections"] = revised_sections
                state.stages["writing"].output = w
                
                # Rebuild full draft with revised content
                revised_draft = "\n\n".join(
                    f"## {sec['title']}\n{sec['content']}" for sec in revised_sections
                )
                
                # Rerun review on revised draft
                console.print("  [cyan]Running final review on revised draft...[/]")
                out = a6.run(ReviewInput(
                    full_draft=revised_draft,
                    focused_topic=t["focused_topic"],
                    research_questions=t["research_questions"],
                    references=refs
                ), article_type=t["article_type"], template_text=template_text)
            
            state = mark_stage(state, "review", "done", out.model_dump())
            save_state(state, output_dir)
            console.print(f"  v Score: {out.overall_score}/100, Issues: {len(out.issues)}")
        except Exception as e:
            state = mark_stage(state, "review", "failed", error=str(e))
            save_state(state, output_dir)
            raise

    r = state.stages["review"].output

    # Write output
    console.print("\n[cyan]Writing output files...[/]")
    from schemas.agent_schemas import Reference
    from utils.llm_client import get_current_model
    refs_list = [Reference(**x).model_dump() for x in l["references"]]

    article_path = write_article(
        output_dir=output_dir,
        title=o["title"],
        abstract=r["abstract"],
        sections=w["sections"],
        references=refs_list,
        keywords=r["keywords_final"],
        review_score=r["overall_score"],
        models_used=[get_current_model()],
    )
    write_references(output_dir, refs_list)

    # Save copies of results for history
    try:
        import shutil
        history_dir = Path(output_dir) / "runs"
        history_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy(article_path, history_dir / f"draft_article_{state.pipeline_id}.md")
        shutil.copy(Path(output_dir) / "references.md", history_dir / f"references_{state.pipeline_id}.md")
        
        # Export to DOCX and copy
        from utils.docx_exporter import export_markdown_to_docx
        docx_path = Path(output_dir) / "draft_article.docx"
        export_markdown_to_docx(article_path, str(docx_path), template_path=state.template_path)
        shutil.copy(str(docx_path), history_dir / f"draft_article_{state.pipeline_id}.docx")
    except Exception as e:
        console.print(f"[yellow]Warning: Could not save historical file copies or DOCX: {e}[/]")

    state.status = "completed"
    state.final_output_path = article_path
    save_state(state, output_dir)

    console.print(f"\n[bold green]Done![/] Output: {article_path}")
    return article_path
