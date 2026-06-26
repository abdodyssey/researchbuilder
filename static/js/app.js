document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const form = document.getElementById("generator-form");
    const inputTema = document.getElementById("input-tema");
    const selectBahasa = document.getElementById("select-bahasa");
    const btnStart = document.getElementById("btn-start");
    
    const configPanel = document.getElementById("config-panel");
    
    const trackerPanel = document.getElementById("tracker-panel");
    const activePipelineId = document.getElementById("active-pipeline-id");
    const consoleOutput = document.getElementById("console-output");
    
    const resultsPanel = document.getElementById("results-panel");
    const resultTitle = document.getElementById("result-title");
    const resultKeywords = document.getElementById("result-keywords");
    const lblScore = document.getElementById("lbl-score");
    const btnDlMd = document.getElementById("btn-dl-md");
    const btnDlDocx = document.getElementById("btn-dl-docx");
    
    const articleMarkdownBody = document.getElementById("article-markdown-body");
    const referenceMarkdownBody = document.getElementById("reference-markdown-body");
    const reviewSummaryText = document.getElementById("review-summary-text");
    const issuesList = document.getElementById("issues-list");
    
    const historyList = document.getElementById("history-list");
    const btnRefreshHistory = document.getElementById("btn-refresh-history");
    const btnCleanWorkspace = document.getElementById("btn-clean-workspace");
    const btnNewRun = document.getElementById("btn-new-run");
    const resumeContainer = document.getElementById("resume-container");
    const btnResume = document.getElementById("btn-resume");

    let currentPipelineId = null;
    let pollInterval = null;
    let initialLoad = true;

    // Initialize Page
    loadHistory();

    // Event Listeners
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const tema = inputTema.value.trim();
        const bahasa = selectBahasa.value;
        if (!tema) return;
        
        await startPipeline(tema, bahasa);
    });

    btnRefreshHistory.addEventListener("click", loadHistory);
    
    btnNewRun.addEventListener("click", () => {
        stopPolling();
        currentPipelineId = null;
        configPanel.classList.remove("hidden");
        trackerPanel.classList.add("hidden");
        resultsPanel.classList.add("hidden");
        inputTema.value = "";
        document.getElementById("page-title").textContent = "Generate Draf Artikel Ilmiah";
        
        // Reset stepper icons/outputs
        document.querySelectorAll(".step").forEach(step => {
            step.className = "step";
            const outputDiv = step.querySelector(".step-output");
            if (outputDiv) outputDiv.textContent = "";
        });
    });

    btnCleanWorkspace.addEventListener("click", async () => {
        if (confirm("Apakah Anda yakin ingin menghapus semua file draf di root workspace (output/)? Riwayat di subfolder runs tetap aman.")) {
            try {
                const resp = await fetch("/api/clean", { method: "POST" });
                if (resp.ok) {
                    alert("Workspace dibersihkan.");
                    btnNewRun.click();
                    loadHistory();
                }
            } catch (err) {
                console.error("Failed to clean workspace:", err);
            }
        }
    });

    btnResume.addEventListener("click", async () => {
        if (!currentPipelineId) return;
        btnResume.disabled = true;
        btnResume.querySelector(".btn-text").textContent = "Resuming...";
        resumeContainer.classList.add("hidden");
        
        try {
            const resp = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tema: "resume",
                    resume: true,
                    pipeline_id: currentPipelineId
                })
            });
            if (!resp.ok) throw new Error("Failed to resume pipeline");
            appendLog(`[SYSTEM] Pipeline resumed for ID: ${currentPipelineId}`);
            startPolling(currentPipelineId);
            loadHistory();
        } catch (err) {
            alert("Gagal melanjutkan pipeline: " + err.message);
            resumeContainer.classList.remove("hidden");
        } finally {
            btnResume.disabled = false;
            btnResume.querySelector(".btn-text").textContent = "Lanjutkan Run yang Gagal";
        }
    });


    // Tab switcher logic
    const tabButtons = document.querySelectorAll(".tab-btn");
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const targetTab = btn.getAttribute("data-tab");
            document.querySelectorAll(".tab-pane").forEach(pane => {
                pane.classList.remove("active");
            });
            document.getElementById(targetTab).classList.add("active");
        });
    });

    // Core Actions
    async function loadHistory() {
        try {
            const resp = await fetch("/api/runs");
            if (!resp.ok) throw new Error("Failed to fetch runs");
            const runs = await resp.json();
            
            historyList.innerHTML = "";
            if (runs.length === 0) {
                historyList.innerHTML = '<div class="empty-state">Belum ada riwayat run</div>';
                return;
            }
            
            runs.forEach(run => {
                const date = new Date(run.created_at).toLocaleString("id-ID", {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                });
                
                const item = document.createElement("div");
                item.className = `history-item ${run.pipeline_id === currentPipelineId ? 'active' : ''}`;
                item.setAttribute("data-id", run.pipeline_id);
                
                const scoreDisplay = run.review_score ? `<span class="score-badge">${run.review_score}/100</span>` : '';
                
                item.innerHTML = `
                    <div class="history-item-header">
                        <span class="history-item-title" title="${run.tema_umum}">${run.tema_umum}</span>
                        <span class="status-indicator status-${run.status}"></span>
                    </div>
                    <div class="history-item-meta">
                        <span>${date} [${run.bahasa.toUpperCase()}]</span>
                        ${scoreDisplay}
                    </div>
                `;
                
                item.addEventListener("click", () => selectRun(run.pipeline_id, run.status));
                historyList.appendChild(item);
            });

            // Auto-select latest run on initial load
            if (initialLoad && runs.length > 0) {
                initialLoad = false;
                selectRun(runs[0].pipeline_id, runs[0].status);
            }
        } catch (err) {
            console.error("History fetch error:", err);
            historyList.innerHTML = '<div class="empty-state">Gagal memuat riwayat</div>';
        }
    }

    async function startPipeline(tema, bahasa) {
        btnStart.disabled = true;
        btnStart.querySelector(".btn-text").textContent = "Starting...";
        
        try {
            const fileInput = document.getElementById("input-template");
            let template_file_base64 = null;
            let template_file_name = null;
            
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                template_file_name = file.name;
                template_file_base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = error => reject(error);
                });
            }

            const resp = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    tema, 
                    bahasa,
                    template_file_base64,
                    template_file_name
                })
            });
            if (!resp.ok) throw new Error("Failed to start pipeline");
            const data = await resp.json();
            
            currentPipelineId = data.pipeline_id;
            activePipelineId.textContent = `ID: ${currentPipelineId}`;
            
            // Switch panels
            configPanel.classList.add("hidden");
            trackerPanel.classList.remove("hidden");
            resultsPanel.classList.add("hidden");
            
            // Start tracking
            trackerPanel.classList.add("tracker-running");
            appendLog(`[SYSTEM] Pipeline started with ID: ${currentPipelineId}`);
            startPolling(currentPipelineId);
            loadHistory();
        } catch (err) {
            alert("Gagal memulai pipeline: " + err.message);
        } finally {
            btnStart.disabled = false;
            btnStart.querySelector(".btn-text").textContent = "Mulai Pipeline";
            // Clear template file input
            const fileInput = document.getElementById("input-template");
            if (fileInput) fileInput.value = "";
        }
    }

    function startPolling(pipelineId) {
        stopPolling();
        pollStatus(pipelineId); // first instant call
        pollInterval = setInterval(() => pollStatus(pipelineId), 2000);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        trackerPanel.classList.remove("tracker-running");
    }

    async function pollStatus(pipelineId) {
        try {
            const resp = await fetch(`/api/status/${pipelineId}`);
            if (!resp.ok) {
                stopPolling();
                return;
            }
            const data = await resp.json();
            
            // Update Stepper steps
            updateStepUI("topic_narrowing", data.stages.topic_narrowing);
            updateStepUI("literature_search", data.stages.literature_search);
            updateStepUI("synthesis", data.stages.synthesis);
            updateStepUI("outline", data.stages.outline);
            updateStepUI("writing", data.stages.writing);
            updateStepUI("review", data.stages.review);
            
            // Render specific outputs inside steps if they succeeded
            if (data.stages.topic_narrowing.status === "done" && data.stages.topic_narrowing.output) {
                const out = data.stages.topic_narrowing.output;
                setStepOutput("topic_narrowing", `Focused: "${out.focused_topic}"\nTitle: "${out.suggested_title}"`);
            }
            if (data.stages.literature_search.status === "done" && data.stages.literature_search.output) {
                const out = data.stages.literature_search.output;
                setStepOutput("literature_search", `Menemukan ${out.references?.length || 0} referensi valid.`);
            }
            if (data.stages.synthesis.status === "done" && data.stages.synthesis.output) {
                const out = data.stages.synthesis.output;
                setStepOutput("synthesis", `Sintesis selesai: ${out.key_themes?.length || 0} Themes, ${out.research_gaps?.length || 0} Gaps.`);
            }
            if (data.stages.outline.status === "done" && data.stages.outline.output) {
                const out = data.stages.outline.output;
                setStepOutput("outline", `Outline dibuat: ${out.sections?.length || 0} Section (${out.estimated_total_words} Target Kata)`);
            }
            if (data.stages.writing.status === "done" && data.stages.writing.output) {
                const out = data.stages.writing.output;
                setStepOutput("writing", `Selesai menulis ${out.sections?.length || 0} section.`);
            }
            if (data.stages.review.status === "done" && data.stages.review.output) {
                const out = data.stages.review.output;
                setStepOutput("review", `Score Review: ${out.overall_score}/100, Issues: ${out.issues?.length || 0}`);
            }

            // Realtime log summaries
            let activeStage = "N/A";
            for (const [stage, sData] of Object.entries(data.stages)) {
                if (sData.status === "running") {
                    activeStage = stage.toUpperCase();
                }
            }
            appendLog(`[POLL] Status: ${data.status} | Active Stage: ${activeStage} | Bg Status: ${data.background_status}`);

            if (data.status === "completed") {
                stopPolling();
                appendLog("[SYSTEM] Pipeline completed successfully!");
                loadHistory();
                displayResults(pipelineId);
                resumeContainer.classList.add("hidden");
            } else if (data.status === "failed" || data.background_status.startsWith("failed")) {
                stopPolling();
                appendLog(`[ERROR] Pipeline failed! Error: ${data.stages.review.error || data.background_status}`);
                loadHistory();
                resumeContainer.classList.remove("hidden");
            } else {
                resumeContainer.classList.add("hidden");
            }
        } catch (err) {
            console.error("Polling error:", err);
        }
    }

    function updateStepUI(stageName, stageData) {
        const stepEl = document.querySelector(`.step[data-stage="${stageName}"]`);
        if (!stepEl) return;
        
        stepEl.className = "step"; // Reset class
        
        if (stageData.status === "running") {
            stepEl.classList.add("running");
        } else if (stageData.status === "done") {
            stepEl.classList.add("done");
        } else if (stageData.status === "failed") {
            stepEl.classList.add("failed");
            setStepOutput(stageName, `Error: ${stageData.error || "Gagal"}`);
        }
    }

    function setStepOutput(stageName, text) {
        const stepEl = document.querySelector(`.step[data-stage="${stageName}"]`);
        if (!stepEl) return;
        const outputDiv = stepEl.querySelector(".step-output");
        if (outputDiv) {
            outputDiv.textContent = text;
            outputDiv.style.display = "block";
        }
    }

    function appendLog(text) {
        const line = document.createElement("div");
        line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    async function selectRun(pipelineId, status) {
        currentPipelineId = pipelineId;
        
        // Highlight in history
        document.querySelectorAll(".history-item").forEach(item => {
            item.classList.remove("active");
            if (item.getAttribute("data-id") === pipelineId) {
                item.classList.add("active");
            }
        });

        if (status === "completed") {
            stopPolling();
            configPanel.classList.add("hidden");
            trackerPanel.classList.add("hidden");
            displayResults(pipelineId);
            resumeContainer.classList.add("hidden");
        } else {
            // It is running or failed, show tracker
            configPanel.classList.add("hidden");
            resultsPanel.classList.add("hidden");
            trackerPanel.classList.remove("hidden");
            activePipelineId.textContent = `ID: ${pipelineId}`;
            appendLog(`[SYSTEM] Monitoring run: ${pipelineId}`);
            startPolling(pipelineId);
            
            if (status === "failed") {
                resumeContainer.classList.remove("hidden");
            } else {
                resumeContainer.classList.add("hidden");
            }
        }
    }

    async function displayResults(pipelineId) {
        try {
            resultsPanel.classList.remove("hidden");
            document.getElementById("page-title").textContent = "Hasil Draf Artikel";
            
            // Set download urls
            btnDlMd.href = `/api/download/${pipelineId}/draft_article_${pipelineId}.md`;
            btnDlMd.setAttribute("download", `draft_article_${pipelineId}.md`);
            btnDlDocx.href = `/api/download/${pipelineId}/draft_article_${pipelineId}.docx`;
            btnDlDocx.setAttribute("download", `draft_article_${pipelineId}.docx`);
            
            // Get run status details (score, abstract keywords)
            const statusResp = await fetch(`/api/status/${pipelineId}`);
            if (!statusResp.ok) throw new Error("Failed to fetch run details");
            const runData = await statusResp.json();
            
            const reviewOut = runData.stages.review.output || {};
            lblScore.textContent = reviewOut.overall_score || "--";
            resultTitle.textContent = runData.stages.topic_narrowing.output?.suggested_title || "Draf Artikel";
            resultKeywords.textContent = `Keywords: ${(reviewOut.keywords_final || []).join(", ") || "-"}`;
            
            // Load and parse contents (markdown bodies)
            const contentResp = await fetch(`/api/content/${pipelineId}`);
            if (!contentResp.ok) throw new Error("Failed to fetch article contents");
            const content = await contentResp.json();
            
            // Render markdown preview
            if (window.marked) {
                articleMarkdownBody.innerHTML = marked.parse(content.article || "*Belum ada isi artikel*");
                referenceMarkdownBody.innerHTML = marked.parse(content.references || "*Belum ada referensi*");
            } else {
                articleMarkdownBody.innerHTML = `<pre>${content.article}</pre>`;
                referenceMarkdownBody.innerHTML = `<pre>${content.references}</pre>`;
            }
            
            // Render review tab
            reviewSummaryText.textContent = reviewOut.review_summary || "Tidak ada summary.";
            
            issuesList.innerHTML = "";
            const issues = reviewOut.issues || [];
            if (issues.length === 0) {
                issuesList.innerHTML = '<div class="empty-state">Reviewer tidak menemukan issue besar. Kualitas draf dinilai baik.</div>';
            } else {
                issues.forEach(issue => {
                    const el = document.createElement("div");
                    el.className = `issue-item severity-${issue.severity}`;
                    el.innerHTML = `
                        <div class="issue-header">
                            <span class="issue-title">[${issue.location}] ${issue.description}</span>
                            <span class="issue-badge badge-${issue.severity}">${issue.severity}</span>
                        </div>
                        <div class="issue-desc">Tipe: <strong>${issue.type}</strong></div>
                        <div class="issue-suggestion">Saran perbaikan: ${issue.suggestion}</div>
                    `;
                    issuesList.appendChild(el);
                });
            }
            
        } catch (err) {
            console.error("Display result error:", err);
            alert("Gagal memuat hasil draf: " + err.message);
        }
    }
});
