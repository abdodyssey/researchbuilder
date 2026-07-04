"""
ResearchBuilder — Pipeline Orchestrator
=========================================
Menjalankan pipeline generasi artikel akademik secara berurutan (7 stage):

  1. topic_narrowing     → Persempit tema umum jadi fokus riset spesifik
  2. literature_search   → Cari literatur akademis via Tavily search
  3. synthesis           → Sintesis temuan pustaka, identifikasi tema & gap
  4. outline             → Susun kerangka artikel (sections, word targets)
  5. writing             → Tulis tiap section berdasarkan outline + referensi
  6. draft_adaptation    → Sesuaikan draf ke format template jurnal (opsional)
  7. review              → Peer-review kualitas + auto-revision jika ada issue kritis

Fitur penting:
- RESUMABLE: Jika pipeline gagal di tengah, bisa di-resume dari stage terakhir yg sukses
- DRAFT REVIEW MODE: Jika user upload draf, skip stage 1-5 dan langsung review+adaptasi
- AUTO-REVISION: Jika reviewer menemukan issue severity=critical, jalankan revision agent
- TOKEN TRACKING: Setiap panggilan LLM dicatat penggunaan tokennya per pipeline

File ini dipanggil oleh:
- api/index.py (via BackgroundTasks untuk web API)
- api/main.py (langsung untuk CLI mode)
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console

import agents.literature_search as a2
import agents.outline as a4
import agents.review as a6
import agents.revision as a7
import agents.synthesis as a3
import agents.topic_narrowing as a1
import agents.writing as a5
import agents.draft_adapter as a8
from schemas.agent_schemas import (
    LiteratureSearchInput,
    OutlineInput,
    PipelineState,
    ReviewInput,
    SynthesisInput,
    TopicNarrowingInput,
    WritingContext,
)
from tools.file_writer import write_article, write_references
from utils.llm_client import set_active_pipeline_id
from utils.state_manager import create_pipeline, load_state, mark_stage, save_state

load_dotenv()
console = Console()


def _add_token_usage(state, agent_name: str, resp):
    """
    Catat penggunaan token dari response LLM ke dalam pipeline state.
    Otomatis menghitung total kumulatif dari semua agent.
    Dipanggil setelah setiap panggilan LLM berhasil.
    """
    try:
        usage = {
            "prompt_tokens": resp.usage.prompt_tokens,
            "completion_tokens": resp.usage.completion_tokens,
            "total_tokens": resp.usage.total_tokens,
        }
        if not hasattr(state, "token_usage") or state.token_usage is None:
            state.token_usage = {}
        state.token_usage[agent_name] = usage
        # hitung total
        state.token_usage["total"] = {
            "prompt_tokens": sum(
                [
                    v["prompt_tokens"]
                    for k, v in state.token_usage.items()
                    if k != "total"
                ]
            ),
            "completion_tokens": sum(
                [
                    v["completion_tokens"]
                    for k, v in state.token_usage.items()
                    if k != "total"
                ]
            ),
            "total_tokens": sum(
                [
                    v["total_tokens"]
                    for k, v in state.token_usage.items()
                    if k != "total"
                ]
            ),
        }
    except Exception:
        pass




def run_pipeline(
    tema: str,
    bahasa: str = "id",
    output_dir: str = "./output",
    resume: bool = False,
    pipeline_id: str = None,
    template_path: str = None,
    max_references: int | None = None,
) -> str:
    """
    Fungsi utama: jalankan seluruh pipeline generasi artikel.

    Args:
        tema:           Tema/topik umum yang akan diteliti
        bahasa:         Bahasa output artikel ("id" atau "en")
        output_dir:     Direktori untuk menyimpan output (JSON state, md, docx)
        resume:         Jika True, lanjutkan pipeline yang sebelumnya gagal/interrupted
        pipeline_id:    ID pipeline spesifik (untuk resume)
        template_path:  Path ke template .docx jurnal (opsional)
        max_references: Jumlah maksimum referensi yang dicari (override dari plan)

    Returns:
        Path ke file artikel markdown yang dihasilkan

    Flow:
        1. Load/create state → 2. Parse template (jika ada) → 3. Jalankan 7 agent
        berurutan → 4. Export ke markdown + DOCX → 5. Simpan ke history
    """
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

    set_active_pipeline_id(state.pipeline_id)

    template_text = ""
    if state.template_path:
        from utils.docx_exporter import extract_template_text

        template_text = extract_template_text(state.template_path)

    if template_text and state.journal_constraints is None:
        console.print("\n[cyan][0/6] Parsing journal template constraints...[/]")
        try:
            from agents.template_parser import run as parse_template
            constraints = parse_template(template_text)
            state.journal_constraints = constraints
            save_state(state, output_dir)
            console.print(f"  v Constraints: abstrak max {constraints.abstract_max_words} kata, sitasi {constraints.citation_style}")
        except Exception as e:
            console.print(f"  [yellow]Warning: Template parsing failed ({e}), using defaults[/]")
            from schemas.agent_schemas import JournalConstraints
            state.journal_constraints = JournalConstraints()
            save_state(state, output_dir)
    elif not template_text and state.journal_constraints is None:
        from schemas.agent_schemas import JournalConstraints
        state.journal_constraints = JournalConstraints()
        save_state(state, output_dir)

    if state.is_draft_review:
        if state.stages["topic_narrowing"].status != "done":
            state = mark_stage(state, "topic_narrowing", "done", {
                "focused_topic": state.input.tema_umum,
                "research_questions": ["Analisis dan review draf artikel akademik"],
                "keywords": ["review draf"],
                "article_type": "literature_review",
                "suggested_title": state.input.tema_umum
            })
            save_state(state, output_dir)
            
        if state.stages["literature_search"].status != "done":
            state = mark_stage(state, "literature_search", "done", {
                "references": [],
                "search_queries_used": []
            })
            save_state(state, output_dir)
            
        if state.stages["synthesis"].status != "done":
            state = mark_stage(state, "synthesis", "done", {
                "key_themes": [],
                "research_gaps": [],
                "key_findings": [],
                "synthesis_summary": "Draf diunggah langsung oleh pengguna.",
                "positioning_statement": "N/A"
            })
            save_state(state, output_dir)
            
        if state.stages["outline"].status != "done":
            state = mark_stage(state, "outline", "done", {
                "title": state.input.tema_umum,
                "abstract_hint": "",
                "sections": [],
                "estimated_total_words": 0
            })
            save_state(state, output_dir)
            
        if state.stages["writing"].status != "done":
            from utils.docx_exporter import extract_draft_full_text, parse_markdown_sections
            draft_text = extract_draft_full_text(state.draft_file_path)
            if not draft_text:
                draft_text = "Draf kosong atau gagal dibaca dari berkas."
            draft_sections = parse_markdown_sections(draft_text)
            if not draft_sections:
                draft_sections = {"Draf Artikel Utama": draft_text}
                
            sections_list = []
            for idx, (title, content) in enumerate(draft_sections.items()):
                sections_list.append({
                    "section_id": f"sec_{idx}",
                    "title": title,
                    "content": content,
                    "word_count": len(content.split()),
                    "citations_used": []
                })
            
            state = mark_stage(state, "writing", "done", {"sections": sections_list})
            save_state(state, output_dir)

        w_output = state.stages["writing"].output

        # Determine if we need to do anything
        if state.stages["review"].status != "done":
            # If draft_adaptation status is not done, we check initial compatibility first
            if state.stages["draft_adaptation"].status != "done":
                console.print("\n[cyan][Draft Review] Menganalisis kesesuaian draf dengan template...[/]")
                try:
                    state.background_status = "Menganalisis kesesuaian draf dengan template..."
                    save_state(state, output_dir)
                    full_draft = "\n\n".join(
                        f"## {sec['title']}\n{sec['content']}" for sec in w_output["sections"]
                    )
                    initial_review = a6.run(
                        ReviewInput(
                            full_draft=full_draft,
                            focused_topic=state.input.tema_umum,
                            research_questions=["Analisis dan review draf artikel akademik"],
                            references=[],
                        ),
                        article_type="literature_review",
                        template_text=template_text,
                        constraints=state.journal_constraints,
                    )
                    console.print(f"  v Skor Kesesuaian Awal: {initial_review.overall_score}/100")
                except Exception as e:
                    console.print(f"  [red]Error during initial review: {e}[/]")
                    raise

                # Convert reviewer issues to simple dicts
                issues_list = []
                if initial_review.issues:
                    for iss in initial_review.issues:
                        issues_list.append({
                            "type": iss.type,
                            "location": iss.location,
                            "description": iss.description,
                            "suggestion": iss.suggestion,
                            "severity": iss.severity
                        })

                console.print(f"  v Skor Kesesuaian Awal: {initial_review.overall_score}/100. Menjalankan adaptasi format dan penyuntingan...")
                
                # Adapt
                console.print("\n[cyan][Draft Review] Menyesuaikan draf ke template jurnal...[/]")
                try:
                    state.background_status = "Menyunting dan memformat naskah sesuai template target..."
                    save_state(state, output_dir)
                    adapted = a8.run(
                        draft_sections=w_output["sections"],
                        constraints=state.journal_constraints,
                        bahasa=bahasa,
                        tema=tema,
                        issues=issues_list,
                    )
                    w_output["sections"] = adapted
                    state.stages["writing"].output["sections"] = adapted
                    state = mark_stage(state, "draft_adaptation", "done", {"sections": adapted})
                    save_state(state, output_dir)
                    console.print(f"  v Berhasil menyesuaikan {len(adapted)} section")
                except Exception as e:
                    state = mark_stage(state, "draft_adaptation", "failed", error=str(e))
                    save_state(state, output_dir)
                    raise

                # Final review on adapted sections
                console.print("\n[cyan][Draft Review] Melakukan review akhir pada draf yang sudah disesuaikan...[/]")
                try:
                    state.background_status = "Melakukan review kualitas akhir hasil suntingan..."
                    save_state(state, output_dir)
                    full_draft_adapted = "\n\n".join(
                        f"## {sec['title']}\n{sec['content']}" for sec in adapted
                    )
                    final_review = a6.run(
                        ReviewInput(
                            full_draft=full_draft_adapted,
                            focused_topic=state.input.tema_umum,
                            research_questions=["Analisis dan review draf artikel akademik"],
                            references=[],
                        ),
                        article_type="literature_review",
                        template_text=template_text,
                        constraints=state.journal_constraints,
                    )
                    state = mark_stage(state, "review", "done", final_review.model_dump())
                    save_state(state, output_dir)
                    console.print(f"  v Skor Akhir: {final_review.overall_score}/100")
                except Exception as e:
                    state = mark_stage(state, "review", "failed", error=str(e))
                    save_state(state, output_dir)
                    raise
            else:
                # draft_adaptation is already done (from a previous session/run) but review is not done.
                # Just run the final review on the current writing stage sections.
                console.print("\n[cyan][Draft Review] Melakukan review pada draf (resumed)...[/]")
                try:
                    full_draft_resumed = "\n\n".join(
                        f"## {sec['title']}\n{sec['content']}" for sec in w_output["sections"]
                    )
                    resumed_review = a6.run(
                        ReviewInput(
                            full_draft=full_draft_resumed,
                            focused_topic=state.input.tema_umum,
                            research_questions=["Analisis dan review draf artikel akademik"],
                            references=[],
                        ),
                        article_type="literature_review",
                        template_text=template_text,
                        constraints=state.journal_constraints,
                    )
                    state = mark_stage(state, "review", "done", resumed_review.model_dump())
                    save_state(state, output_dir)
                    console.print(f"  v Skor: {resumed_review.overall_score}/100")
                except Exception as e:
                    state = mark_stage(state, "review", "failed", error=str(e))
                    save_state(state, output_dir)
                    raise

    # Agent 1
    if state.stages["topic_narrowing"].status != "done":
        console.print("\n[cyan][1/6] Topic Narrowing...[/]")
        try:
            state.background_status = "Memformulasikan topik riset & pertanyaan penelitian..."
            save_state(state, output_dir)
            out = a1.run(
                TopicNarrowingInput(tema_umum=tema, bahasa=bahasa),
                template_text=template_text,
            )
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
            state.background_status = "Melakukan pencarian literatur akademis di Tavily..."
            save_state(state, output_dir)
            out = a2.run(
                LiteratureSearchInput(
                    focused_topic=t["focused_topic"],
                    keywords=t["keywords"],
                    research_questions=t["research_questions"],
                    max_references=max_references if max_references is not None else int(os.getenv("MAX_REFERENCES", 10)),
                )
            )
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

            state.background_status = "Melakukan sintesis pustaka & pemetaan novelty..."
            save_state(state, output_dir)
            refs = [Reference(**r) for r in l["references"]]
            out = a3.run(
                SynthesisInput(
                    focused_topic=t["focused_topic"],
                    research_questions=t["research_questions"],
                    references=refs,
                )
            )
            state = mark_stage(state, "synthesis", "done", out.model_dump())
            save_state(state, output_dir)
            console.print(
                f"  v Themes: {len(out.key_themes)}, Gaps: {len(out.research_gaps)}"
            )
        except Exception as e:
            state = mark_stage(state, "synthesis", "failed", error=str(e))
            save_state(state, output_dir)
            raise

    s = state.stages["synthesis"].output

    # Agent 4
    if state.stages["outline"].status != "done":
        console.print("\n[cyan][4/6] Outline...[/]")
        try:
            from schemas.agent_schemas import Reference
            refs = [Reference(**r) for r in l["references"]]
            state.background_status = "Menyusun kerangka naskah dokumen..."
            save_state(state, output_dir)
            # Map key_themes and research_gaps to list of strings for OutlineInput
            key_themes_str = []
            for theme in s.get("key_themes", []):
                if isinstance(theme, dict):
                    key_themes_str.append(f"{theme.get('theme_name', '')}: {theme.get('synthesis', '')}")
                elif hasattr(theme, "theme_name"):
                    key_themes_str.append(f"{theme.theme_name}: {theme.synthesis}")
                else:
                    key_themes_str.append(str(theme))
            
            research_gaps_str = []
            for gap in s.get("research_gaps", []):
                if isinstance(gap, dict):
                    research_gaps_str.append(f"Gap: {gap.get('gap_description', '')} | Solusi: {gap.get('how_we_address_it', '')}")
                elif hasattr(gap, "gap_description"):
                    research_gaps_str.append(f"Gap: {gap.gap_description} | Solusi: {gap.how_we_address_it}")
                else:
                    research_gaps_str.append(str(gap))

            out = a4.run(
                OutlineInput(
                    focused_topic=t["focused_topic"],
                    article_type=t["article_type"],
                    research_questions=t["research_questions"],
                    synthesis_summary=s["synthesis_summary"],
                    key_themes=key_themes_str,
                    research_gaps=research_gaps_str,
                    bahasa=bahasa,
                    references=refs,
                ),
                template_text=template_text,
                constraints=state.journal_constraints,
            )
            state = mark_stage(state, "outline", "done", out.model_dump())
            save_state(state, output_dir)
            console.print(
                f"  v {len(out.sections)} sections, ~{out.estimated_total_words} words"
            )
        except Exception as e:
            state = mark_stage(state, "outline", "failed", error=str(e))
            save_state(state, output_dir)
            raise

    o = state.stages["outline"].output

    # Agent 5
    if state.stages["writing"].status != "done":
        console.print("\n[cyan][5/6] Writing sections...[/]")
        try:
            from schemas.agent_schemas import Reference, Section, WritingContext, WritingSectionOutput

            sections = [Section(**sec) for sec in o["sections"]]
            refs = [Reference(**r) for r in l["references"]]
            context = WritingContext(
                focused_topic=t["focused_topic"],
                article_type=t["article_type"],
                synthesis_summary=s["synthesis_summary"],
                positioning_statement=s["positioning_statement"],
                bahasa=bahasa,
            )
            
            w_output = state.stages["writing"].output or {}
            written_sections = w_output.get("sections", [])
            written_ids = {s["section_id"] for s in written_sections}
            
            state.stages["writing"].status = "running"
            save_state(state, output_dir)

            for idx, section in enumerate(sections):
                if section.id in written_ids:
                    continue

                state.background_status = f"Menulis bab {idx+1}/{len(sections)}: {section.title}"
                save_state(state, output_dir)

                inp_sec = a5.WritingInput(
                    section=section,
                    context=context,
                    references_detail=refs,
                )
                result = a5.write_section(inp_sec, template_text, constraints=state.journal_constraints)
                written_sections.append(result.model_dump())
                
                # Save progress incrementally
                state.stages["writing"].output = {"sections": written_sections}
                save_state(state, output_dir)

            state = mark_stage(state, "writing", "done", {"sections": written_sections})
            save_state(state, output_dir)
            total_words = sum(sec["word_count"] for sec in written_sections)
            console.print(
                f"  v Written {len(written_sections)} sections, ~{total_words} words"
            )
        except Exception as e:
            state = mark_stage(state, "writing", "failed", error=str(e))
            save_state(state, output_dir)
            raise

    w = state.stages["writing"].output

    # Use adapted sections if available from draft_adaptation
    if state.is_draft_review and state.stages["draft_adaptation"].status == "done":
        adapted_output = state.stages["draft_adaptation"].output
        if adapted_output and "sections" in adapted_output and not adapted_output.get("skipped"):
            w["sections"] = adapted_output["sections"]

    # Skip draft_adaptation for non-draft-review flows
    if not state.is_draft_review and state.stages["draft_adaptation"].status != "done":
        state = mark_stage(state, "draft_adaptation", "done", {"skipped": True})
        save_state(state, output_dir)

    # Agent 6
    if state.stages["review"].status != "done":
        console.print("\n[cyan][6/6] Review & Auto-Revision...[/]")
        try:
            from schemas.agent_schemas import Reference

            state.background_status = "Melakukan peer-review kualitas draf naskah..."
            save_state(state, output_dir)
            refs = [Reference(**r) for r in l["references"]]

            # Initial full draft
            full_draft = "\n\n".join(
                f"## {sec['title']}\n{sec['content']}" for sec in w["sections"]
            )

            # Run initial review
            out = a6.run(
                ReviewInput(
                    full_draft=full_draft,
                    focused_topic=t["focused_topic"],
                    research_questions=t["research_questions"],
                    references=refs,
                ),
                article_type=t["article_type"],
                template_text=template_text,
                constraints=state.journal_constraints,
            )

            # Auto-revision loop if critical issues exist
            critical_issues = []
            if not state.is_draft_review:
                critical_issues = [
                    issue for issue in out.issues if issue.severity.lower() == "critical"
                ]

            if critical_issues:
                console.print(
                    f"  [yellow]Found {len(critical_issues)} critical issues. Running Auto-Revision pass...[/]"
                )

                # Run revision agent
                revised_sections = a7.run(
                    sections=w["sections"],
                    critical_issues=[issue.model_dump() for issue in critical_issues],
                    references=[r.model_dump() for r in refs],
                    bahasa=bahasa,
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
                out = a6.run(
                    ReviewInput(
                        full_draft=revised_draft,
                        focused_topic=t["focused_topic"],
                        research_questions=t["research_questions"],
                        references=refs,
                    ),
                    article_type=t["article_type"],
                    template_text=template_text,
                    constraints=state.journal_constraints,
                )

            state = mark_stage(state, "review", "done", out.model_dump())
            save_state(state, output_dir)
            console.print(
                f"  v Score: {out.overall_score}/100, Issues: {len(out.issues)}"
            )
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
        citation_style=state.citation_style,
    )
    write_references(output_dir, refs_list, citation_style=state.citation_style)

    # Save copies of results for history
    try:
        import shutil

        history_dir = Path(output_dir) / "runs"
        history_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy(article_path, history_dir / f"draft_article_{state.pipeline_id}.md")
        shutil.copy(
            Path(output_dir) / "references.md",
            history_dir / f"references_{state.pipeline_id}.md",
        )

        # Export to DOCX using deterministic template injector
        from utils.docx_injector import inject_into_template, structured_doc_from_pipeline
        from utils.citation_formatter import format_citations_in_text, format_bibliography

        # Format bibliography for references
        formatted_refs = format_bibliography(refs_list, state.citation_style)

        structured_doc = structured_doc_from_pipeline(
            title=o.get("title", ""),
            abstract=r.get("abstract", ""),
            keywords=r.get("keywords_final", []),
            sections=[
                {
                    "heading": sec.get("title", ""),
                    "paragraphs": [
                        format_citations_in_text(
                            sec.get("content", ""), refs_list, state.citation_style
                        )
                    ],
                }
                for sec in w["sections"]
            ],
            references_formatted=[{"teks_sitasi": line.lstrip("- ")} for line in formatted_refs],
        )

        docx_path = Path(output_dir) / "draft_article.docx"
        result_path, export_warnings = inject_into_template(
            structured_doc=structured_doc,
            template_path=state.template_path,
            output_path=str(docx_path),
        )
        if export_warnings:
            for w_msg in export_warnings:
                console.print(f"  [yellow]Warning (export): {w_msg}[/]")
        state = mark_stage(state, "docx_export", "completed")

        shutil.copy(
            str(docx_path), history_dir / f"draft_article_{state.pipeline_id}.docx"
        )
    except Exception as e:
        console.print(
            f"[yellow]Warning: Could not save historical file copies or DOCX: {e}[/]"
        )

    state.status = "completed"
    state.final_output_path = article_path
    save_state(state, output_dir)

    console.print(f"\n[bold green]Done![/] Output: {article_path}")
    return article_path
