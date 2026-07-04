from pydantic import BaseModel, Field
from typing import Literal, Optional


# ── Agent 1: Topic Narrowing ──────────────────────────────────────────────────
class TopicNarrowingInput(BaseModel):
    tema_umum: str
    bahasa: Literal["id", "en"] = "id"
    document_type: str = "artikel"

class TopicNarrowingOutput(BaseModel):
    focused_topic: str
    research_questions: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    article_type: str = "literature_review"
    suggested_title: str


# ── Agent 2: Literature Search ────────────────────────────────────────────────
class Reference(BaseModel):
    id: Optional[str] = "ref_default"
    title: Optional[str] = "Judul tidak ditemukan"
    url: Optional[str] = ""
    snippet: Optional[str] = ""
    raw_content: Optional[str] = ""
    relevance_score: Optional[float] = 0.0
    source_type: Optional[str] = "web"
    author: Optional[str] = "Anonim"
    year: Optional[str] = "2026"

class LiteratureSearchInput(BaseModel):
    focused_topic: str
    keywords: list[str]
    research_questions: list[str]
    max_references: int = 10

class LiteratureSearchOutput(BaseModel):
    references: list[Reference]
    search_queries_used: list[str]


# ── Agent 3: Synthesis ────────────────────────────────────────────────────────
class KeyFinding(BaseModel):
    finding: str
    supported_by: list[str]

class KeyTheme(BaseModel):
    theme_name: str
    synthesis: str
    references_ids: list[str]

class ResearchGap(BaseModel):
    gap_description: str
    how_we_address_it: str

class SynthesisInput(BaseModel):
    focused_topic: str
    research_questions: list[str]
    references: list[Reference]

class SynthesisOutput(BaseModel):
    key_themes: list[KeyTheme]
    research_gaps: list[ResearchGap]
    key_findings: list[KeyFinding]
    synthesis_summary: str
    positioning_statement: str


# ── Agent 4: Outline ──────────────────────────────────────────────────────────
class Section(BaseModel):
    id: str
    title: str
    purpose: str
    key_points: list[str]
    word_target: int
    references_to_cite: list[str] = []

class OutlineInput(BaseModel):
    focused_topic: str
    article_type: str = "literature_review"
    research_questions: list[str]
    synthesis_summary: str
    key_themes: list[str]
    research_gaps: list[str]
    bahasa: Literal["id", "en"] = "id"
    references: list[Reference] = []

class OutlineOutput(BaseModel):
    title: str
    abstract_hint: str
    sections: list[Section]
    estimated_total_words: int


# ── Agent 5: Writing ──────────────────────────────────────────────────────────
class WritingContext(BaseModel):
    focused_topic: str
    article_type: str
    synthesis_summary: str
    positioning_statement: str
    bahasa: Literal["id", "en"] = "id"

class WritingInput(BaseModel):
    section: Section
    context: WritingContext
    references_detail: list[Reference]

class WritingSectionOutput(BaseModel):
    section_id: str
    title: str
    fact_extraction: Optional[str] = None
    content: str
    word_count: int
    citations_used: list[str] = []

class WritingOutput(BaseModel):
    sections: list[WritingSectionOutput]


# ── Agent 6: Review ───────────────────────────────────────────────────────────
class ReviewIssue(BaseModel):
    type: str
    location: str
    description: str
    suggestion: str
    severity: str

class ReviewInput(BaseModel):
    full_draft: str
    focused_topic: str
    research_questions: list[str]
    references: list[Reference]

class ReviewOutput(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    issues: list[ReviewIssue] = []
    abstract: str
    keywords_final: list[str]
    review_summary: str


# ── Journal Constraints ────────────────────────────────────────────────────────
class JournalConstraints(BaseModel):
    abstract_max_words: int = 250
    abstract_format: str = "satu paragraf tanpa sitasi"
    keywords_min: int = 3
    keywords_max: int = 6
    citation_style: str = "APA"
    required_sections: list[str] = []
    needs_tables: bool = False
    needs_figures: bool = False
    figure_as_placeholder: bool = True
    columns: int = 1
    font: str = "Times New Roman"
    font_size: int = 12
    language: str = "id"
    additional_notes: str = ""


# ── Pipeline State ────────────────────────────────────────────────────────────
class StageState(BaseModel):
    status: Literal["pending", "running", "done", "failed"] = "pending"
    output: Optional[dict] = None
    error: Optional[str] = None

class PipelineState(BaseModel):
    pipeline_id: str
    created_at: str
    status: Literal["running", "completed", "failed"] = "running"
    background_status: Optional[str] = None
    input: TopicNarrowingInput
    template_path: Optional[str] = None
    journal_constraints: Optional[JournalConstraints] = None
    stages: dict[str, StageState] = Field(default_factory=lambda: {
        "topic_narrowing": StageState(),
        "literature_search": StageState(),
        "synthesis": StageState(),
        "outline": StageState(),
        "writing": StageState(),
        "draft_adaptation": StageState(),
        "review": StageState(),
    })
    final_output_path: Optional[str] = None
    token_usage: dict = Field(default_factory=dict)
    user_id: Optional[str] = None
    citation_style: str = "default"
    is_draft_review: Optional[bool] = False
    draft_file_path: Optional[str] = None


# ── Interactive Research Session ─────────────────────────────────────────────
class TitleOption(BaseModel):
    title: str
    focused_topic: str
    description: str
    research_questions: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    article_type: str = "literature_review"

class TitleOptionsOutput(BaseModel):
    options: list[TitleOption]

class ResearchSession(BaseModel):
    research_id: str
    created_at: str
    status: str = "generating_titles"
    step: int = 1
    tema: str
    bahasa: Literal["id", "en"] = "id"
    document_type: str = "artikel"
    structure_preset: str = "imrad"
    uploaded_doc_text: Optional[str] = None
    title_options: Optional[list[TitleOption]] = None
    selected_title_index: Optional[int] = None
    pipeline_id: Optional[str] = None
    user_id: Optional[str] = None
    error: Optional[str] = None
