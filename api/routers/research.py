"""
Research Router — Interactive Research Wizard (title → literature → outline → write → review).
"""

import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, check_token_limit
from config.plans import MAX_REFS, TOKEN_COST
from config.runtime import OUTPUT_DIR
from database import get_db, SessionLocal
from models import User
from schemas.agent_schemas import (
    ResearchSession, TitleOption, TitleOptionsOutput,
    LiteratureSearchInput, SynthesisInput, OutlineInput,
    Section, Reference, WritingContext, WritingSectionOutput, ReviewInput,
)
from utils.llm_client import get_usage, set_active_pipeline_id, get_current_model
from utils.research_store import (
    load_state, save_state, save_research_session, load_research_session,
)

router = APIRouter(prefix="/api/research", tags=["research"])


# ── Request Schemas ──────────────────────────────────────────────────────────


class ResearchTitlesRequest(BaseModel):
    tema: str
    bahasa: Optional[str] = "id"
    document_type: Optional[str] = "artikel"
    structure_preset: Optional[str] = "imrad"


class SelectTitleRequest(BaseModel):
    title_index: int


class ConfirmOutlineRequest(BaseModel):
    sections: Optional[list[dict]] = None


# ── Fallback generators (LLM unavailable) ───────────────────────────────────


def _fallback_title_options(tema: str, bahasa: str, document_type: str):
    angles = [
        ("Analisis Sistematis", "systematic review", "Menganalisis secara sistematis literatur terkait"),
        ("Tinjauan Komparatif", "literature_review", "Membandingkan berbagai pendekatan dan temuan"),
        ("Perspektif Konseptual", "conceptual", "Membangun kerangka konseptual baru"),
    ]
    options = []
    for angle, art_type, desc in angles:
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
    refs = []
    for i in range(5):
        refs.append({
            "id": f"ref_{i+1:03d}",
            "title": f"[Fallback] Studi tentang {focused_topic} — Perspektif {i+1}",
            "url": f"https://example.com/paper-{i+1}",
            "snippet": f"Penelitian ini membahas aspek penting dari {focused_topic} dengan pendekatan yang komprehensif.",
            "raw_content": f"Studi ini mengkaji {focused_topic} melalui analisis mendalam.",
            "relevance_score": round(0.9 - i * 0.1, 2),
            "source_type": "journal",
            "author": f"Penulis {chr(65+i)} et al.",
            "year": str(2024 - i),
            "citation_count": (5 - i) * 12,
            "venue": "Jurnal Ilmiah (fallback)",
        })
    return {"references": refs, "search_queries_used": keywords[:3]}


def _fallback_synthesis(focused_topic: str, research_questions: list[str]):
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
        "synthesis_summary": f"[FALLBACK] Sintesis literatur menunjukkan bahwa {focused_topic} merupakan area penelitian yang aktif.",
        "positioning_statement": f"Penelitian ini berkontribusi pada pemahaman yang lebih mendalam tentang {focused_topic}.",
    }


def _fallback_outline(focused_topic: str, title: str, bahasa: str, structure_preset: str):
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
    return {
        "overall_score": 65,
        "issues": [
            {"type": "info", "location": "General", "description": "[FALLBACK] Artikel dibuat dengan data placeholder.", "suggestion": "Ulangi proses saat layanan AI tersedia", "severity": "low"},
        ],
        "abstract": f"[FALLBACK] Artikel ini menyajikan tinjauan tentang {focused_topic}.",
        "keywords_final": [focused_topic.split()[0], "tinjauan", "analisis"],
        "review_summary": "[FALLBACK] Review dilakukan dengan data placeholder.",
    }


# ── Background Tasks ─────────────────────────────────────────────────────────


def _track_research_tokens(pipeline_id: str, user_id: str):
    try:
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

        session = load_research_session(research_id)
        if session:
            session.title_options = result.options
            session.status = "titles_ready"
            save_research_session(session)
    except Exception as e:
        session = load_research_session(research_id)
        if session:
            session.status = "failed"
            session.error = str(e)
            save_research_session(session)


def _bg_run_literature_to_outline(
    research_id: str, pipeline_id: str, max_refs: int,
    structure_preset: str, user_id: str,
):
    try:
        import agents.literature_search as a2
        import agents.synthesis as a3
        import agents.outline as a4
        from utils.state_manager import mark_stage

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

        session = load_research_session(research_id)
        if session:
            session.status = "outline_ready"
            session.step = 3
            save_research_session(session)

        _track_research_tokens(pipeline_id, user_id)

    except Exception as e:
        print(f"Error in research pipeline (lit→outline): {e}")
        session = load_research_session(research_id)
        if session:
            session.status = "failed"
            session.error = str(e)
            save_research_session(session)


def _bg_run_writing_to_review(research_id: str, pipeline_id: str, user_id: str):
    try:
        import agents.writing as a5
        import agents.review as a6
        from utils.state_manager import mark_stage

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

        session = load_research_session(research_id)
        if session:
            session.status = "completed"
            session.step = 5
            save_research_session(session)

        _track_research_tokens(pipeline_id, user_id)

    except Exception as e:
        print(f"Error in research pipeline (writing→review): {e}")
        session = load_research_session(research_id)
        if session:
            session.status = "failed"
            session.error = str(e)
            save_research_session(session)


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/titles")
async def api_research_titles(
    req: ResearchTitlesRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_token_limit(current_user, db, required=TOKEN_COST["titles"], operation="titles")

    research_id = str(uuid.uuid4())

    session = ResearchSession(
        research_id=research_id,
        created_at=datetime.now(timezone.utc).isoformat(),
        status="generating_titles",
        step=1,
        tema=req.tema,
        bahasa=req.bahasa,
        document_type=req.document_type,
        structure_preset=req.structure_preset,
        uploaded_doc_text=None,
        user_id=current_user.id,
    )
    save_research_session(session)

    background_tasks.add_task(
        _bg_generate_titles, research_id, req.tema, req.bahasa,
        req.document_type, req.structure_preset, "",
    )
    return {"research_id": research_id, "status": "generating_titles"}


@router.post("/{research_id}/select-title")
async def api_research_select_title(
    research_id: str,
    req: SelectTitleRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = load_research_session(research_id)
    if not session:
        raise HTTPException(status_code=404, detail="Research session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    if not session.title_options or req.title_index >= len(session.title_options):
        raise HTTPException(status_code=400, detail="Invalid title index")

    check_token_limit(current_user, db, required=TOKEN_COST["literature"], operation="literature")

    selected = session.title_options[req.title_index]
    session.selected_title_index = req.title_index
    session.status = "processing_literature"
    session.step = 2

    from utils.state_manager import create_pipeline, mark_stage
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

    session.pipeline_id = pipeline_state.pipeline_id
    save_research_session(session)
    save_state(pipeline_state)

    background_tasks.add_task(
        _bg_run_literature_to_outline,
        research_id, pipeline_state.pipeline_id, MAX_REFS,
        session.structure_preset, current_user.id,
    )
    return {"status": "processing_literature", "pipeline_id": pipeline_state.pipeline_id}


@router.post("/{research_id}/confirm-outline")
async def api_research_confirm_outline(
    research_id: str,
    req: ConfirmOutlineRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = load_research_session(research_id)
    if not session:
        raise HTTPException(status_code=404, detail="Research session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    if not session.pipeline_id:
        raise HTTPException(status_code=400, detail="No pipeline linked")

    check_token_limit(current_user, db, required=TOKEN_COST["writing"], operation="writing")

    if req.sections:
        from utils.state_manager import mark_stage
        state = load_state(OUTPUT_DIR, session.pipeline_id)
        if state:
            state = mark_stage(state, "outline", "done", {
                **state.stages["outline"].output,
                "sections": req.sections,
            })
            save_state(state, OUTPUT_DIR)

    session.status = "writing"
    session.step = 4
    save_research_session(session)

    background_tasks.add_task(
        _bg_run_writing_to_review, research_id, session.pipeline_id, current_user.id,
    )
    return {"status": "writing"}


@router.get("/{research_id}/status")
async def api_research_status(
    research_id: str,
    current_user: User = Depends(get_current_user),
):
    session = load_research_session(research_id)
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
