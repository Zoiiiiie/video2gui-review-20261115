(function () {
  "use strict";
  const data = window.REVIEW_DATA;
  if (!data) return;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const css = getComputedStyle(document.documentElement);
  const color = name => css.getPropertyValue(name).trim();
  const palette = { accent: color("--pass-fill"), passInk: color("--positive-ink"), fail: color("--error-fill"), ink: color("--ink"), muted: color("--muted"), rule: color("--rule"), surface: color("--bg2") };
  const stat = data.statistics;
  const state = { status: "all", dimension: "all", comparison: "all", query: "", selected: 39, severity: "all", gallery: "trajectory", expandedGallery: false };
  let visible = data.cases.slice();
  let mediaList = [];
  const dimName = id => data.dimensions.find(dim => dim.id === id)?.name ?? id;
  const comparisonClass = item => item.comparison.status === "diff" ? "diff" :
    item.comparison.status === "agree" ? "agree" : "pending";
  const resultPill = (status, item) => {
    const style = item ? (item.comparison.status === "diff" ? "diff" :
      item.comparison.status === "agree" || status === "pass" ? "pass" : "neutral") : status === "pass" ? "pass" : "neutral";
    return `<span class="pill ${style}">${status === "pass" ? "通过" : "未通过"}</span>`;
  };
  const humanPill = item => `<span class="judge ${item.comparison.status === "diff" ? "diff" :
    item.comparison.status === "agree" || item.human.status === "passed" ? "agree" : "pending"}">${escape(item.human.label)}</span>`;
  const comparisonPill = item => `<span class="judge ${comparisonClass(item)}">${({agree:"方向一致",diff:"字段 diff",pending:"待比较"})[item.comparison.status]}</span>`;
  const complete = item => item.dimensions.trajectory_alignment.task_completion.result === "pass";
  const hashCase = Number(location.hash.match(/^#case-(\d+)$/)?.[1]);
  const snapshotId = $("#case-inspector")?.querySelector(".case-id")?.textContent.trim();
  const snapshotCase = data.cases.find(item => item.sample_id === snapshotId);
  if (data.cases.some(item => item.sample_no === hashCase)) state.selected = hashCase;
  else if (snapshotCase) state.selected = snapshotCase.sample_no;
  const total = data.cases.length;
  const comparable = data.cases.filter(item => ["passed", "needs_work"].includes(item.human.status) &&
    ["pass", "not_pass"].includes(item.rubric_result));
  const agreementCount = comparable.filter(item =>
    (item.human.status === "passed") === (item.rubric_result === "pass")).length;
  const machinePassCount = data.cases.filter(item => item.rubric_result === "pass").length;
  const completionCount = data.cases.filter(complete).length;
  const percent = (count, denominator) => denominator ?
    (count / denominator * 100).toFixed(2).replace(/\.00$/, "") : "—";
  const setText = (selector, value) => {
    const node = $(selector);
    if (node) node.textContent = value;
  };
  setText("#pass-rate", percent(agreementCount, comparable.length));
  setText("#pass-count", `${agreementCount}/${comparable.length}`);
  setText("#pending-comparison-count", total - comparable.length);
  setText("#machine-pass-rate", percent(machinePassCount, total));
  setText("#machine-pass-count", machinePassCount);
  setText("#machine-not-pass-count", total - machinePassCount);
  setText("#completion-rate", percent(completionCount, total));
  setText("#completion-count", completionCount);
  setText("#completion-not-pass-count", total - completionCount);
  document.querySelectorAll(".metric-total").forEach(node => { node.textContent = total; });
  setText("#completed-not-pass", data.completed_not_pass);
  const reconciliationExamples = $("#reconciliation-examples");
  if (reconciliationExamples) {
    reconciliationExamples.innerHTML = data.human_reconciliation.examples
      .filter(item => [6,10,12,48].includes(item.sample_no))
      .map(item => `<div class="human-detail-field"><a href="#case-${item.sample_no}">${escape(item.software)} · 第${item.sample_no}条 ↗</a>
        <p>overall.status：${escape(item.overall_status)}；training.status：${escape(item.training_status)}</p>
        <p>总体原文：${escape(item.overall_conclusion || "未填写")}</p><p>进训原文：${escape(item.training_conclusion || "未填写")}</p></div>`).join("");
  }

  const chartInstances = [];
  if (window.echarts) {
    const chartHost = $("#dimension-chart");
    if (!echarts.getInstanceByDom(chartHost)) {
      chartHost.replaceChildren();
      chartHost.removeAttribute("_echarts_instance_");
      const clearSnapshotTooltips = () => {
        Array.from(document.body.children).forEach(node => {
          if (node.tagName === "DIV" && node.style.zIndex === "9999999" &&
              node.style.pointerEvents === "none" && node.style.whiteSpace === "nowrap") {
            node.remove();
          }
        });
      };
      clearSnapshotTooltips();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", clearSnapshotTooltips, { once: true });
      }
    }
    const chart = echarts.init(chartHost, null, { renderer: "svg" });
    chart.setOption({
      animation: false, color: [palette.accent, palette.fail],
      grid: { top: 3, left: 3, right: 8, bottom: 3, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, appendToBody: false, confine: true,
        formatter: params => `${escape(params[0].name)}<br>${params.map(p => `${escape(p.seriesName)}：${p.value} 条`).join("<br>")}` },
      xAxis: { type: "value", min: 0, max: 50, interval: 10, axisLabel: { color: palette.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: palette.rule, type: "dashed" } }, axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: "category", inverse: true, data: ["教程步骤提取", "轨迹方法与结果", "视觉与训练质量", "记录连续性"],
        axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: palette.ink, fontSize: 11, margin: 13 } },
      series: [
        { name: "通过", type: "bar", stack: "samples", barWidth: 16,
          data: data.dimensions.map(d => stat.dimension_stats[d.id].pass),
          itemStyle: { color: palette.accent, borderRadius: [5, 0, 0, 5] },
          label: { show: true, position: "inside", color: palette.passInk, fontSize: 11 } },
        { name: "未通过", type: "bar", stack: "samples", barWidth: 16,
          data: data.dimensions.map(d => stat.dimension_stats[d.id].not_pass),
          itemStyle: { color: palette.fail, borderRadius: [0, 5, 5, 0] },
          label: { show: true, position: "inside", color: palette.ink, fontSize: 11 } },
      ],
    });
    chart.on("click", params => {
      if (params.seriesName !== "未通过") return;
      state.status = "all"; state.dimension = data.dimensions[params.dataIndex].id;
      state.comparison = "all"; state.query = ""; $("#case-search").value = "";
      renderTable(true);
      $("#cases").scrollIntoView({ behavior: preferredScroll() });
    });
    chartInstances.push(chart);
    window.addEventListener("resize", () => chartInstances.forEach(instance => instance.resize()));
  }

  function preferredScroll() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }

  function renderTable(selectFirst) {
    visible = data.cases.filter(item => {
      if (state.status === "not_pass" && item.rubric_result !== "not_pass") return false;
      if (state.status === "pass" && item.rubric_result !== "pass") return false;
      if (state.status === "incomplete" && complete(item)) return false;
      if (state.dimension !== "all" && item.dimensions[state.dimension].status !== "fail") return false;
      if (state.comparison === "focus" && !item.external_focus) return false;
      if (state.comparison === "field_difference" && !item.human_field_difference) return false;
      if (!["all","focus","field_difference"].includes(state.comparison) && item.comparison.status !== state.comparison) return false;
      const haystack = [item.sample_no, item.sample_id, item.title, item.software,
        item.human.label, item.human.original_overall?.conclusion, item.human.workflow_data?.training?.conclusion,
        ...item.issues.map(issue => `${issue.code} ${issue.message}`)].join(" ").toLowerCase();
      return !state.query || haystack.includes(state.query.toLowerCase());
    });
    if (selectFirst && visible.length && !visible.some(item => item.sample_no === state.selected)) {
      state.selected = visible[0].sample_no;
      state.severity = "all"; state.gallery = "trajectory"; state.expandedGallery = false;
    }
    $("#case-rows").innerHTML = visible.length ? visible.map(item => {
      const errors = item.issues.filter(i => i.severity === "error").length;
      const warnings = item.issues.filter(i => i.severity === "warning").length;
      const scores = data.dimensions.map(d => `<span class="score ${item.dimensions[d.id].score < 2 ? "bad" : "good"}" title="${escape(d.name)}：${item.dimensions[d.id].score}分">${item.dimensions[d.id].score}</span>`).join("");
      return `<tr class="${item.sample_no === state.selected ? "selected" : ""} ${item.rubric_result === "not_pass" ? "not-pass" : ""}">
        <td class="case-number">${String(item.sample_no).padStart(2, "0")}</td>
        <td><button class="case-button" data-case="${item.sample_no}" aria-label="复核第${item.sample_no}条 ${escape(item.software)}"><b>${escape(item.software || item.title)}</b><span title="${escape(item.title)}">${escape(item.title)}</span></button></td>
        <td>${humanPill(item)}</td><td>${resultPill(item.rubric_result,item)}</td><td>${comparisonPill(item)}</td><td><div class="score-line" aria-label="${data.dimensions.map(d => `${d.short}${item.dimensions[d.id].score}分`).join("，")}">${scores}</div></td>
        <td><span class="pill ${complete(item) ? "neutral" : "fail"}">${complete(item) ? "成立" : "未成立"}</span></td>
        <td><span class="small-count">${errors} 阻断</span>${warnings ? ` <span class="case-number">/ ${warnings} warning</span>` : ""}</td>
        <td><button class="btn" data-case="${item.sample_no}" aria-label="查看第${item.sample_no}条证据">↗</button></td></tr>`;
    }).join("") : '<tr><td colspan="9"><div class="empty">没有匹配的案例。可更换关键词，或重置筛选。</div></td></tr>';
    $("#table-count").textContent = `显示 ${visible.length} / 50 条`;
    document.querySelectorAll("[data-status]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.status === state.status)));
    $("#dimension-filter").value = state.dimension;
    $("#comparison-filter").value = state.comparison;
    if (selectFirst) renderInspector();
  }

  function evidenceFigure(item, isGallery) {
    if (item.unread) return `<div class="gallery-card unread">${escape(item.label)}<br>未完成视觉核实，已按证据不足评判。</div>`;
    const index = mediaList.push(item) - 1;
    return `<figure class="${isGallery ? "gallery-card" : "evidence-card"}"><figcaption>${escape(item.label)}${isGallery ? "" : '<span>原始证据 ↗</span>'}</figcaption>
      <button class="image-open" data-media="${index}" aria-label="放大${escape(item.label)}"><img src="${escape(item.path)}" alt="${escape(item.label)}" loading="lazy" decoding="async"></button>
      ${isGallery ? "" : '<div class="image-hint">点击放大 · 查看来源与 SHA256</div>'}</figure>`;
  }

  function compactActions(actions) {
    const runs = [];
    actions.forEach(action => {
      const encoded = JSON.stringify(action);
      const last = runs[runs.length - 1];
      if (last && last.encoded === encoded) last.count++;
      else runs.push({ encoded, action, count: 1 });
    });
    return runs.map((run, index) => `${index + 1}. ${run.count > 1 ? `连续 ${run.count} 次 · ` : ""}${JSON.stringify(run.action, null, 2)}`).join("\n\n");
  }

  function renderSourceExcerpts(issue) {
    const excerpts = issue.source_excerpts || [];
    if (!excerpts.length) return "";
    return `<section class="source-evidence" aria-label="原记录问题定位"><h5>原始记录 · 问题定位</h5>
      <p class="source-locator-note">${escape(issue.source_locator_note)}</p>
      ${excerpts.map(excerpt => `<div class="source-quote" data-source-path="${escape(excerpt.source_path)}">
        <div class="source-pointer">${escape(excerpt.source_path)}<span class="source-label">${escape(excerpt.label)}</span></div>
        <div class="source-code">${excerpt.text.split("\n").map((line,index) => `<div class="source-row"><span class="source-number" aria-hidden="true">${index+1}</span><span class="source-line ${excerpt.highlight_lines.includes(index+1) ? "located" : ""}" data-original-line="${index+1}">${escape(line)}</span></div>`).join("")}</div>
      </div>`).join("")}
      <a class="source-link" href="assets/data/inputs.json" download="Video2GUI-原始评测记录.json">下载完整原记录 ↗</a>
    </section>`;
  }

  function compareSource(value, pointer, item, machine) {
    const text = JSON.stringify(value,null,2);
    return `<div class="source-quote" data-source-path="${escape(pointer)}"><div class="source-pointer">${escape(pointer)}</div>
      <div class="source-code">${text.split("\n").map((line,index) => {
        let style = "";
        const judgment = machine ? line.includes('"rubric_result":') : line.trim().startsWith('"status":');
        if (judgment) {
          style = item.comparison.status === "diff" ? "located" :
            item.comparison.status === "agree" || (machine ? item.rubric_result==="pass" : item.human.status==="passed") ? "matching" : "";
        } else if (!machine && /"(fluency|redundancy|correctness|completeness)": "pass"/.test(line)) style="matching";
        // Conclusions may refer to post-edit success; do not mark their prose as a
        // judgment disagreement inferred solely from the overall status.
        return `<div class="source-row"><span class="source-number" aria-hidden="true">${index+1}</span><span class="source-line ${style}">${escape(line)}</span></div>`;
      }).join("")}</div></div>`;
  }

  function renderHumanComparison(item) {
    const batch = data.human_sampling_summary;
    const focus = item.external_focus;
    const workflow = item.human.workflow_data || {};
    const training = workflow.training || {};
    const statusLabels = {passed:"通过",needs_work:"需改进",needs_verification:"待核验",pending:"待评"};
    const overall = item.human.original_overall;
    const field = item.human.source_path;
    const trainingText = JSON.stringify(training,null,2);
    const trainingSource = `<div class="source-quote" data-source-path="${escape(field)}.workflow.data.training">
      <div class="source-pointer">${escape(field)}.workflow.data.training</div>
      <div class="source-code">${trainingText.split("\n").map((line,index) => `<div class="source-row"><span class="source-number">${index+1}</span><span class="source-line ${line.trim().startsWith('"status":') && training.status==="passed" ? "matching" : ""}">${escape(line)}</span></div>`).join("")}</div></div>`;
    return `<section aria-label="本案例人评机评对照">
      <div class="subheading"><h4>人评 × 机评</h4></div>
      <p class="comparison-note">人评overall=${escape(item.human.status)}；机评=${escape(item.rubric_result)}。</p>
      <div class="comparison-pair">
        <div class="comparison-side"><h4>人评结果 ${humanPill(item)}</h4>
          <p>来源：cua-annotation-export-online-20261114.json</p>
          <details class="compare-source" open><summary>人评结论原记录</summary>
            ${overall ? compareSource(overall,item.human.overall_source_path,item,false) : `<p>此Case没有 workflow.data.overall，不推断总体判断。</p>`}
          </details>
          <p>进训状态：<span class="judge ${training.status==="passed"?"agree":"pending"}">${escape(statusLabels[training.status] || "未填写")}</span> · 选用范围：${escape(training.selection || "未填写")}</p>
          <p>进训原文：${escape(training.conclusion || "未填写")}</p>
          ${item.human_field_difference ? '<p>总体与进训状态不同。两字段独立保留；需改进不等于修订后最终失败。</p>' : ""}
          <details class="compare-source"><summary>training 原始字段与结论</summary>${trainingSource}</details>
        </div>
        <div class="comparison-side"><h4>机评 Rubric ${resultPill(item.rubric_result,item)}</h4>
          <p>当前对话模型 · 4.2.0 · 仅执行日志豁免。</p>
          <details class="compare-source" open><summary>机评结论原记录</summary>${compareSource({sample_id:item.sample_id,rubric_result:item.rubric_result},`results.json[${item.sample_no-1}].rubric_result`,item,true)}</details>
          <p>四维逐项评分和原始视觉证据见下方。</p>
        </div>
      </div>
      <details class="human-details" ${focus ? "open" : ""}>
        <p class="source-link"><a href="assets/data/human-reconciliation.json" target="_blank" rel="noopener">对账证据与限制 ↗</a></p>
      </details>
    </section>`;
  }

  function renderIssues(item) {
    const filtered = item.issues
      .filter(issue => state.severity === "all" || issue.severity === state.severity)
      .sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error"));
    const first = filtered.find(issue => issue.severity === "error")?.uid ?? filtered[0]?.uid;
    return filtered.length ? filtered.map(issue => {
      const meta = [dimName(issue.dimension), issue.step_id, issue.turn != null ? `T${String(issue.turn).padStart(2, "0")}` : null,
        issue.video_timestamp_sec != null ? `${issue.video_timestamp_sec}s` : null].filter(Boolean);
      return `<details class="issue ${issue.severity === "warning" ? "warning" : ""}" ${issue.uid === first ? "open" : ""}>
        <summary><span class="issue-dot"></span><span class="issue-head"><span class="meta"><span>${issue.severity === "error" ? "问题" : "warning"}</span><span>·</span>${meta.map(m => `<span>${escape(m)}</span>`).join('<span> / </span>')}</span><span class="message">${escape(issue.message)}</span></span>
          <svg class="icon issue-chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="issue-body"><p class="issue-code">${escape(issue.code)}</p>
          ${renderSourceExcerpts(issue)}
          ${issue.evidence.length ? `<div class="evidence-grid">${issue.evidence.map(media => evidenceFigure(media, false)).join("")}</div>` : ""}
          ${issue.evidence_note ? `<p class="evidence-note">${escape(issue.evidence_note)}</p>` : ""}
          ${issue.thought || issue.actions ? `<details class="transcript"><summary>查看本轮完整 Thought 与动作</summary>${issue.thought ? `<h5>原生 Thought</h5><p>${escape(issue.thought)}</p>` : ""}${issue.actions ? `<h5>动作记录（连续相同动作按次数显示）</h5><pre>${escape(compactActions(issue.actions))}</pre>` : ""}</details>` : ""}
        </div></details>`;
    }).join("") : '<div class="empty">此案例在当前问题类型下没有记录。</div>';
  }

  function renderSteps(item) {
    return item.steps.map(step => `<section class="step-block"><h5><span class="case-number">${escape(step.step_id)}</span> · ${escape(step.objective)}</h5><div class="step-findings">${data.dimensions.map(dim => {
      const finding = item.dimensions[dim.id].steps.find(s => s.step_id === step.step_id);
      return `<div class="step-finding ${finding.result === "not_pass" ? "bad" : ""}"><header><span>${escape(dim.name)}</span><span>${finding.result === "pass" ? "通过" : "未通过"}${dim.id === "trajectory_alignment" ? ` · 方法${finding.method_match ? "匹配" : "未匹配"} / 结果${finding.result_match ? "匹配" : "未匹配"}` : ""}</span></header>${escape(finding.reason)}</div>`;
    }).join("")}</div></section>`).join("");
  }

  function galleryContent(item) {
    const relevant = item.gallery.filter(image => image.category === state.gallery);
    const showing = state.expandedGallery ? relevant : relevant.slice(0, 3);
    return `<div class="gallery">${showing.map(image => evidenceFigure(image, true)).join("") || '<div class="empty">此案例没有该类已归档拼图。</div>'}</div>${relevant.length > 3 ? `<button class="btn gallery-more" id="expand-gallery">${state.expandedGallery ? "收起证据集" : `展开全部 ${relevant.length} 张`}</button>` : ""}`;
  }

  function renderInspector() {
    const item = data.cases.find(c => c.sample_no === state.selected);
    if (!item) return;
    mediaList = [];
    const errors = item.issues.filter(i => i.severity === "error").length;
    const warnings = item.issues.filter(i => i.severity === "warning").length;
    const completion = item.dimensions.trajectory_alignment.task_completion;
    $("#case-inspector").innerHTML = `
      <div class="case-top"><div><div class="eyebrow">案例 ${String(item.sample_no).padStart(2, "0")} / 50</div><h3>${escape(item.software)}</h3><div class="case-id">${escape(item.sample_id)}</div></div><div class="case-nav"><button data-case-nav="-1" aria-label="上一个案例" ${item.sample_no === 1 ? "disabled" : ""}><svg class="icon" viewBox="0 0 24 24"><path d="m14 6-6 6 6 6"/></svg></button><button data-case-nav="1" aria-label="下一个案例" ${item.sample_no === 50 ? "disabled" : ""}><svg class="icon" viewBox="0 0 24 24"><path d="m10 6 6 6-6 6"/></svg></button></div></div>
      <p class="case-purpose">${escape(item.title)}</p>
      <div class="case-tagline">${resultPill(item.rubric_result,item)}<span class="pill neutral">${escape(item.platform)}</span><span class="pill fail">${errors} 条阻断</span><span class="pill warning">${warnings} 条 warning</span></div>
      ${renderHumanComparison(item)}
      <div class="subheading"><h4>机评 Rubric 四维结论</h4></div>
      <div class="dimension-cards">${data.dimensions.map(dim => {
        const value = item.dimensions[dim.id];
        return `<section class="dimension-card ${value.status === "fail" ? "failed" : ""}"><header>${escape(dim.name)}<span class="judge ${value.status==="pass"?"agree":"pending"}">${value.status === "pass" ? "通过" : "未通过"}</span></header><div class="dimension-score">${value.score}<small>/ 3</small></div><p>${escape(value.summary)}</p></section>`;
      }).join("")}</div>
      <div class="completion-note"><span class="pill ${completion.result === "pass" ? "neutral" : "fail"}">最终任务结果${completion.result === "pass" ? "成立" : "未成立"}</span><p>${escape(completion.reason)}</p></div>
      <div class="subheading"><h4>问题与相关证据 <span class="case-number">/ ${item.issues.length} 条记录</span></h4><div class="issue-filters" role="group" aria-label="问题类型筛选">${[["all", "全部"], ["error", `阻断 ${errors}`], ["warning", `warning ${warnings}`]].map(([value, label]) => `<button data-severity="${value}" aria-pressed="${state.severity === value}">${label}</button>`).join("")}</div></div>
      <div id="issues-container">${renderIssues(item)}</div>
      <details class="steps-details"><summary>逐步骤判定 · ${item.steps.length} 个步骤 / 四个维度</summary>${renderSteps(item)}</details>
      <details class="task-details"><summary>原任务定义与完成标准</summary><div class="task-text">${escape(item.task_query)}\n\n完成标准：\n${item.completion_criteria.map((criterion, index) => `${index + 1}. ${criterion}`).map(escape).join("\n")}</div></details>
      <div class="subheading"><h4>完整案例证据集</h4><div class="gallery-nav" role="group" aria-label="证据类别">${[["trajectory", "候选轨迹"], ["goal", "目标图"], ["source", "教程 / 补帧"]].map(([value, label]) => `<button data-gallery="${value}" aria-pressed="${state.gallery === value}">${label}</button>`).join("")}</div></div>
      <div id="gallery-container">${galleryContent(item)}</div>
      <div class="source-link"><a href="${escape(item.video_url)}" target="_blank" rel="noopener">原始教程视频 ↗</a><a href="assets/data/review_notes.json" target="_blank" rel="noopener">评审原始记录 ↗</a><span>记录连续性结论仅适用于日志豁免范围。</span></div>`;
    document.querySelectorAll(".image-open img").forEach(image => image.addEventListener("error", () => {
      image.closest("button").innerHTML = '<div class="empty">证据文件未加载，请确认 assets 目录与 HTML 一起保存。</div>';
    }, { once: true }));
  }

  function selectCase(number, scroll) {
    if (!data.cases.some(c => c.sample_no === number)) return;
    state.selected = number; state.severity = "all"; state.gallery = "trajectory"; state.expandedGallery = false;
    renderTable(false); renderInspector();
    history.replaceState(null, "", `#case-${number}`);
    if (scroll) $("#case-inspector").scrollIntoView({ behavior: preferredScroll(), block: "start" });
  }

  function openEvidence(index) {
    const media = mediaList[index];
    if (!media) return;
    $("#modal-title").textContent = media.label;
    $("#modal-image").src = media.path;
    $("#modal-image").alt = media.label;
    $("#modal-canvas").classList.remove("zoomed");
    $("#zoom-evidence").setAttribute("aria-pressed", "false");
    $("#zoom-evidence").textContent = "放大 200%";
    $("#modal-footer").innerHTML = `<a href="${escape(media.path)}" target="_blank" rel="noopener">打开原始尺寸 ↗</a>${media.original_url ? `<a href="${escape(media.original_url)}" target="_blank" rel="noopener">查看原始来源 ↗</a>` : ""}<span>原图未着色、未重绘</span><code>SHA256 · ${escape(media.sha256)}</code>`;
    $("#evidence-modal").showModal();
  }

  document.addEventListener("click", event => {
    const caseButton = event.target.closest("[data-case]");
    if (caseButton) { selectCase(Number(caseButton.dataset.case), true); return; }
    const nav = event.target.closest("[data-case-nav]");
    if (nav) { selectCase(state.selected + Number(nav.dataset.caseNav), false); return; }
    const status = event.target.closest("[data-status]");
    if (status) { state.status = status.dataset.status; renderTable(true); return; }
    const comparison = event.target.closest("[data-comparison-shortcut]");
    if (comparison) {
      state.comparison=comparison.dataset.comparisonShortcut; state.status="all";state.dimension="all";state.query="";$("#case-search").value="";
      renderTable(true);return;
    }
    const severity = event.target.closest("[data-severity]");
    if (severity) { state.severity = severity.dataset.severity; renderInspector(); return; }
    const gallery = event.target.closest("[data-gallery]");
    if (gallery) {
      state.gallery = gallery.dataset.gallery; state.expandedGallery = false;
      $("#gallery-container").innerHTML = galleryContent(data.cases.find(c => c.sample_no === state.selected));
      document.querySelectorAll("[data-gallery]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.gallery === state.gallery)));
      return;
    }
    const media = event.target.closest("[data-media]");
    if (media) { openEvidence(Number(media.dataset.media)); return; }
    if (event.target.closest("#expand-gallery")) {
      state.expandedGallery = !state.expandedGallery;
      $("#gallery-container").innerHTML = galleryContent(data.cases.find(c => c.sample_no === state.selected));
    }
  });
  $("#case-search").addEventListener("input", event => { state.query = event.target.value.trim(); renderTable(true); });
  $("#dimension-filter").addEventListener("change", event => { state.dimension = event.target.value; renderTable(true); });
  $("#comparison-filter").addEventListener("change", event => { state.comparison = event.target.value; renderTable(true); });
  $("#reset-filters").addEventListener("click", () => {
    state.status = "all"; state.dimension = "all"; state.comparison="all"; state.query = ""; $("#case-search").value = ""; renderTable(true);
  });
  $("#show-failed").addEventListener("click", () => {
    state.status = "not_pass"; state.dimension = "all";
    state.comparison = "all"; state.query = ""; $("#case-search").value = "";
    renderTable(true);
  });
  $("#close-evidence").addEventListener("click", () => $("#evidence-modal").close());
  $("#evidence-modal").addEventListener("click", event => {
    if (event.target === $("#evidence-modal")) {
      const box = $("#evidence-modal").getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) $("#evidence-modal").close();
    }
  });
  $("#zoom-evidence").addEventListener("click", () => {
    const zoomed = $("#modal-canvas").classList.toggle("zoomed");
    $("#zoom-evidence").setAttribute("aria-pressed", String(zoomed));
    $("#zoom-evidence").textContent = zoomed ? "适应窗口" : "放大 200%";
  });
  $("#print-button")?.addEventListener("click", () => window.print());
  let printDetails = [];
  window.addEventListener("beforeprint", () => {
    printDetails = Array.from(document.querySelectorAll("#case-inspector details")).map(detail => ({ detail, open: detail.open }));
    printDetails.forEach(({ detail }) => { detail.open = true; });
    chartInstances.forEach(instance => instance.resize());
  });
  window.addEventListener("afterprint", () => { printDetails.forEach(({ detail, open }) => { detail.open = open; }); chartInstances.forEach(instance => instance.resize()); });
  window.addEventListener("hashchange", () => {
    const number = Number(location.hash.match(/^#case-(\d+)$/)?.[1]);
    if (number && number !== state.selected) selectCase(number, true);
  });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      const active = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (active) document.querySelectorAll(".rail nav a").forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${active.target.id}`));
    }, { rootMargin: "-10% 0px -45% 0px" });
    ["overview", "cases", "method"].forEach(id => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }
  const keepSnapshot = snapshotCase?.sample_no === state.selected;
  if (!keepSnapshot || !$("#case-rows").children.length) renderTable(false);
  if (keepSnapshot) {
    const candidates = [...snapshotCase.issues.flatMap(issue => issue.evidence), ...snapshotCase.gallery];
    document.querySelectorAll("#case-inspector [data-media]").forEach(button => {
      const image = button.querySelector("img");
      const path = image?.getAttribute("src");
      const media = candidates.find(candidate => candidate.path === path && candidate.label === image?.alt) ||
        candidates.find(candidate => candidate.path === path);
      if (media) mediaList[Number(button.dataset.media)] = media;
    });
  } else {
    renderInspector();
  }
})();
