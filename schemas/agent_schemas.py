from pydantic import BaseModel, Field
from typing import Literal, Optional


# ── Agent 1: Topic Narrowing ──────────────────────────────────────────────────
class TopicNarrowingInput(BaseModel):
    tema_umum: str
    bahasa: Literal["id", "en"] = "id"

class TopicNarrowingOutput(BaseModel):
    focused_topic: str
    research_questions: list[str] = Field(min_length=2, max_length=5)
    keywords: list[str]
    article_type: Literal["literature_review", "empirical", "conceptual"]
    suggested_title: str


# ── Agent 2: Literature Search ────────────────────────────────────────────────
class Reference(BaseModel):
    id: str
    title: str
    url: str
    snippet: str
    relevance_score: float = 0.0
    source_type: Literal["journal", "conference", "report", "web"] = "web"

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

class SynthesisInput(BaseModel):
    focused_topic: str
    research_questions: list[str]
    references: list[Reference]

class SynthesisOutput(BaseModel):
    key_themes: list[str]
    research_gaps: list[str]
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
    article_type: Literal["literature_review", "empirical", "conceptual"]
    research_questions: list[str]
    synthesis_summary: str
    key_themes: list[str]
    research_gaps: list[str]
    bahasa: Literal["id", "en"] = "id"

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


# ── Pipeline State ────────────────────────────────────────────────────────────
class StageState(BaseModel):
    status: Literal["pending", "running", "done", "failed"] = "pending"
    output: Optional[dict] = None
    error: Optional[str] = None

class PipelineState(BaseModel):
    pipeline_id: str
    created_at: str
    status: Literal["running", "completed", "failed"] = "running"
    input: TopicNarrowingInput
    template_path: Optional[str] = None
    stages: dict[str, StageState] = Field(default_factory=lambda: {
        "topic_narrowing": StageState(),
        "literature_search": StageState(),
        "synthesis": StageState(),
        "outline": StageState(),
        "writing": StageState(),
        "review": StageState(),
    })
    final_output_path: Optional[str] = None
