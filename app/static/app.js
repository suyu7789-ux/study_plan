const state = {
  summary: null,
  tasks: [],
  selectedDate: null,
  selectedSubject: "全部",
  activeTimerTask: null,
  timerFinishing: false,
  expandedTasks: new Set(),
};

const role = window.APP_USER.role;
const canManageUsers = Boolean(window.APP_USER.canManageUsers);
const subjectClass = { 数学: "math", 物理: "physics", 化学: "chemistry", 英语: "english" };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  try { payload = await response.json(); } catch (_error) { payload = {}; }
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("请重新登录");
  }
  if (!response.ok) throw new Error(payload.error || "操作失败");
  return payload;
}

function toast(message, type = "success") {
  const region = document.getElementById("toastRegion");
  const item = document.createElement("div");
  item.className = `toast ${type === "error" ? "error" : ""}`;
  item.textContent = message;
  region.appendChild(item);
  setTimeout(() => item.remove(), 2800);
}

function percent(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

function miniProgressRing(rate) {
  const circumference = 113.097; // 2 * Math.PI * 18
  const offset = circumference - (rate / 100) * circumference;
  return `
    <svg class="progress-ring" width="40" height="40" role="img" aria-label="进度：${rate}%">
      <circle class="progress-ring-bg" stroke="rgba(255, 255, 255, 0.05)" stroke-width="3" fill="transparent" r="18" cx="20" cy="20"/>
      <circle class="progress-ring-bar" data-progress-offset="${offset}" stroke="var(--subject-color)" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" stroke-width="3" stroke-linecap="round" fill="transparent" r="18" cx="20" cy="20">
        <animate attributeName="stroke-dashoffset" from="${circumference}" to="${offset}" dur="850ms" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".22 .75 .24 1"/>
      </circle>
    </svg>
  `;
}

function largeProgressRing(rate, subject) {
  const circumference = 314.159; // 2 * Math.PI * 50
  const offset = circumference - (rate / 100) * circumference;
  return `
    <svg class="progress-ring" width="116" height="116" role="img" aria-label="${subject}进度：${rate}%">
      <circle class="progress-ring-bg" stroke="rgba(255, 255, 255, 0.05)" stroke-width="6" fill="transparent" r="50" cx="58" cy="58"/>
      <circle class="progress-ring-bar" data-progress-offset="${offset}" stroke="var(--subject-color)" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}" stroke-width="6" stroke-linecap="round" fill="transparent" r="50" cx="58" cy="58">
        <animate attributeName="stroke-dashoffset" from="${circumference}" to="${offset}" dur="850ms" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".22 .75 .24 1"/>
      </circle>
    </svg>
  `;
}

function orderedList(items, className = "requirement-list") {
  return `<ol class="${className}">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ol>`;
}

function syncTimerTask(task) {
  task._timerSyncedAt = Date.now();
  return task;
}

function timerElapsed(task) {
  const base = Number(task.timer?.elapsed_seconds || 0);
  if (task.timer?.state !== "running") return base;
  return base + Math.max(0, Math.floor((Date.now() - task._timerSyncedAt) / 1000));
}

function timerRemaining(task) {
  return Math.max(0, Number(task.timer?.target_seconds || 0) - timerElapsed(task));
}

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function loadSummary() {
  state.summary = await api("/api/summary");
  const dates = state.summary.dates;
  const today = state.summary.today;
  if (!state.selectedDate) {
    const firstDate = dates[0]?.date;
    const lastDate = dates.at(-1)?.date;
    if (dates.some((item) => item.date === today)) {
      state.selectedDate = today;
    } else if (today && firstDate && today < firstDate) {
      state.selectedDate = firstDate;
    } else if (today && lastDate && today > lastDate) {
      state.selectedDate = lastDate;
    } else {
      state.selectedDate = dates.find((item) => item.date >= today)?.date || firstDate;
    }
  }
  renderOverview();
}

async function loadTasks() {
  const parameters = new URLSearchParams({ date: state.selectedDate });
  if (state.selectedSubject !== "全部") parameters.set("subject", state.selectedSubject);
  state.tasks = (await api(`/api/tasks?${parameters}`)).map(syncTimerTask);
  renderTasks();
}

function dateMeta() {
  return state.summary?.dates.find((item) => item.date === state.selectedDate);
}

function renderDateControl() {
  const meta = dateMeta();
  document.getElementById("dateInput").value = state.selectedDate || "";
  document.getElementById("dayLabel").textContent = meta ? `Day ${meta.day}` : "日期";
  const index = state.summary.dates.findIndex((item) => item.date === state.selectedDate);
  document.getElementById("previousDay").disabled = index <= 0;
  document.getElementById("nextDay").disabled = index < 0 || index >= state.summary.dates.length - 1;
}

function statusOptions(current) {
  return ["未开始", "进行中", "已完成", "需补做"]
    .map((item) => `<option ${item === current ? "selected" : ""}>${item}</option>`)
    .join("");
}

function reviewOptions(current) {
  return ["待审核", "通过", "需补充", "退回"]
    .map((item) => `<option ${item === current ? "selected" : ""}>${item}</option>`)
    .join("");
}

function imageCell(task) {
  const enough = task.image_count >= task.min_images;
  const thumbnails = task.images.length
    ? task.images.map((image) => `
      <div class="image-thumb">
        <img src="/media/thumb/${encodeURIComponent(image.thumb_filename)}"
             data-full="/media/full/${encodeURIComponent(image.filename)}"
             data-caption="${escapeHtml(image.original_name)}"
             alt="${escapeHtml(image.original_name)}" loading="lazy">
        <button class="image-delete" data-image-id="${image.id}" type="button" title="删除图片" aria-label="删除图片">
          <i data-lucide="x"></i>
        </button>
      </div>
    `).join("")
    : `<div class="image-empty">暂无图片</div>`;

  const guideId = `evidence-guide-${escapeHtml(task.id)}`;
  const guideTooltipHtml = `
    <div class="evidence-guide-tooltip">
      <button class="evidence-guide-trigger" type="button" data-evidence-guide
              aria-label="查看成果图片拍摄要求" aria-expanded="false" aria-controls="${guideId}">
        <i data-lucide="circle-help"></i>
      </button>
      <div class="tooltip-box" id="${guideId}" role="tooltip">
        <h4>成果图片拍摄要求：</h4>
        ${orderedList(task.evidence_guide, "tooltip-list")}
      </div>
    </div>
  `;

  return `
    <div class="evidence-summary">
      <span class="evidence-count ${enough ? "is-enough" : ""}"><i data-lucide="images"></i>${task.image_count} / ${task.min_images} 张</span>
      ${guideTooltipHtml}
      <label class="upload-button" title="上传成果图片">
        <i data-lucide="image-plus"></i><span>上传</span>
        <input type="file" accept="image/*,.heic,.heif" multiple data-upload-task="${task.id}">
      </label>
    </div>
    <div class="image-grid">${thumbnails}</div>
  `;
}

function timerButton(task) {
  const timerState = task.timer?.state || "idle";
  const label = role === "supervisor"
    ? "查看计时"
    : timerState === "running"
    ? formatClock(timerRemaining(task))
    : timerState === "paused"
      ? "继续计时"
      : timerState === "completed"
        ? "计时记录"
        : "开始计时";

  const pulseHtml = (timerState === "running" && role !== "supervisor") ? `<span class="pulse-dot"></span>` : "";

  return `
    <button class="task-timer-button ${timerState === "running" ? "is-running" : ""}"
            type="button" data-timer-task="${task.id}" title="打开任务计时器">
      <i data-lucide="timer"></i>
      <span><strong class="timer-button-label">${label}</strong><small>建议 ${task.planned_minutes} 分钟</small></span>
      ${pulseHtml}
    </button>
  `;
}

function reviewCell(task) {
  if (role === "supervisor") {
    return `
      <div class="review-stack">
        <div><span class="field-label">学生记录</span><div>${escapeHtml(task.student_note || "暂无")}</div></div>
        <label><span class="field-label">监督结果</span>
          <select class="review-select" data-task-id="${task.id}" data-field="supervisor_status" data-state="${escapeHtml(task.supervisor_status)}">
            ${reviewOptions(task.supervisor_status)}
          </select>
        </label>
        <label><span class="field-label">监督评语</span>
          <textarea class="note-input" data-task-id="${task.id}" data-field="supervisor_comment" placeholder="输入审核意见">${escapeHtml(task.supervisor_comment)}</textarea>
        </label>
        <span class="save-indicator" data-save-for="${task.id}"></span>
      </div>
    `;
  }
  return `
    <div class="review-stack">
      <label><span class="field-label">学生记录</span>
        <textarea class="note-input" data-task-id="${task.id}" data-field="student_note" placeholder="记录页码、题号、错因或困难">${escapeHtml(task.student_note)}</textarea>
      </label>
      <div><span class="field-label">监督结果</span><strong>${escapeHtml(task.supervisor_status)}</strong></div>
      ${task.supervisor_comment ? `<div><span class="field-label">监督评语</span>${escapeHtml(task.supervisor_comment)}</div>` : ""}
      <span class="save-indicator" data-save-for="${task.id}"></span>
    </div>
  `;
}

function renderTasks() {
  renderDateControl();
  const body = document.getElementById("taskCardList");
  body.innerHTML = state.tasks.map((task, index) => `
    <article class="task-card subject-${task.subject} ${state.expandedTasks.has(task.id) ? "is-expanded" : ""}" style="--row-index:${index}" data-task-card="${task.id}">
      <div class="task-card-main">
        <div class="mobile-subject-rail" aria-hidden="true"><span>${escapeHtml(task.subject)}</span></div>
        <div class="task-index">${String(index + 1).padStart(2, "0")}</div>
        <div class="task-subject">
          <span class="subject-label">${escapeHtml(task.subject)}</span>
          <span class="category-pill">${escapeHtml(task.category)}</span>
          <small>${escapeHtml(task.id)}</small>
        </div>
        <div class="task-description">
        <div class="source-title">${escapeHtml(task.source)}</div>
        <div class="section-text">${escapeHtml(task.section)}</div>
        </div>
        <div class="mobile-task-requirements">${orderedList(task.detail_items.slice(0, 4), "mobile-requirement-list")}</div>
        <div class="task-duration"><strong>${task.planned_minutes}</strong><span>分钟</span></div>
        <div class="task-evidence">${imageCell(task)}</div>
        <div class="task-status">
        <select class="status-select" data-task-id="${task.id}" data-field="status" data-state="${escapeHtml(task.status)}">
          ${statusOptions(task.status)}
        </select>
        </div>
        <div class="task-actions">
          ${timerButton(task)}
          <button class="detail-toggle" type="button" data-toggle-details="${task.id}" aria-expanded="${state.expandedTasks.has(task.id)}">
            <i data-lucide="chevron-down"></i><span>${state.expandedTasks.has(task.id) ? "收起" : "成果与记录"}</span>
          </button>
        </div>
      </div>
      <div class="task-card-details card-inner-details">
        <section class="detail-section"><div class="detail-heading"><i data-lucide="book-open-check"></i><h3>学习要求</h3></div>${orderedList(task.detail_items)}</section>
        <section class="detail-section"><div class="detail-heading"><i data-lucide="badge-check"></i><h3>成果标准</h3></div>${orderedList(task.output_items, "requirement-list output-list")}</section>
        <section class="detail-section review-detail"><div class="detail-heading"><i data-lucide="message-square-text"></i><h3>记录与审核</h3></div>${reviewCell(task)}</section>
      </div>
    </article>
  `).join("");
  document.getElementById("emptyState").hidden = state.tasks.length > 0;
  renderDailyProgress();
  refreshIcons();
}

function renderDailyProgress() {
  const allDateTasks = state.selectedSubject === "全部" ? state.tasks : [];
  const done = state.tasks.filter((task) => task.status === "已完成").length;
  document.getElementById("dailySummary").textContent = `${done} / ${state.tasks.length} 项完成`;

  if (!allDateTasks.length) {
    document.getElementById("subjectProgress").innerHTML = "";
    return;
  }
  const subjects = ["数学", "物理", "化学", "英语"];
  document.getElementById("subjectProgress").innerHTML = subjects.map((subject) => {
    const items = allDateTasks.filter((task) => task.subject === subject);
    const completed = items.filter((task) => task.status === "已完成").length;
    const rate = percent(completed, items.length);
    return `
      <div class="subject-progress-item ${subjectClass[subject]}">
        <div class="mini-ring">
          ${miniProgressRing(rate)}
          <span>${rate}%</span>
        </div>
        <div><strong>${subject}</strong><span>${completed}/${items.length} 项完成</span></div>
      </div>
    `;
  }).join("");
}

function renderOverview() {
  if (!state.summary) return;
  const summary = state.summary;
  const rate = percent(summary.completed, summary.total);
  document.getElementById("metricTotal").textContent = summary.total;
  document.getElementById("metricCompleted").textContent = summary.completed;
  document.getElementById("metricRate").textContent = `${rate}%`;
  document.getElementById("metricImages").textContent = summary.image_count;
  document.getElementById("metricTime").textContent = `${Math.round(summary.planned_minutes / 60)}h`;
  document.getElementById("overviewDate").textContent = `${summary.dates[0]?.date || ""} 至 ${summary.dates.at(-1)?.date || ""}`;
  document.getElementById("subjectOverview").innerHTML = summary.subjects.map((item) => {
    const itemRate = percent(item.completed, item.total);
    return `
      <div class="subject-gauge ${subjectClass[item.subject]}">
        <div class="gauge-ring">
          ${largeProgressRing(itemRate, item.subject)}
          <div><strong>${itemRate}%</strong><span>${escapeHtml(item.subject)}</span></div>
        </div>
        <small>${item.completed} / ${item.total} 项</small>
      </div>
    `;
  }).join("");
  document.getElementById("weekChart").innerHTML = summary.weeks.map((item) => {
    const itemRate = percent(item.completed, item.total);
    return `
      <div class="week-column">
        <strong>${itemRate}%</strong>
        <div class="week-bar-track"><div class="week-bar" style="height:${Math.max(itemRate, 2)}%"></div></div>
        <span>第${item.week}周</span>
      </div>
    `;
  }).join("");
}

async function updateTask(taskId, field, value, indicator = null) {
  if (indicator) indicator.textContent = "保存中";
  try {
    await api(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (indicator) {
      indicator.textContent = "已保存";
      setTimeout(() => { indicator.textContent = ""; }, 1300);
    }
    if (field === "status") {
      await Promise.all([loadSummary(), loadTasks()]);
    }
  } catch (error) {
    if (indicator) indicator.textContent = "保存失败";
    toast(error.message, "error");
  }
}

async function uploadImages(input) {
  const files = [...input.files];
  if (!files.length) return;
  const taskId = input.dataset.uploadTask;
  const form = new FormData();
  files.forEach((file) => form.append("images", file));
  input.disabled = true;
  toast(`正在上传 ${files.length} 张图片`);
  try {
    await api(`/api/tasks/${encodeURIComponent(taskId)}/images`, { method: "POST", body: form });
    await Promise.all([loadSummary(), loadTasks()]);
    toast("图片已上传");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    input.disabled = false;
    input.value = "";
  }
}

async function deleteImage(imageId) {
  if (!window.confirm("删除这张成果图片？")) return;
  try {
    await api(`/api/images/${imageId}`, { method: "DELETE" });
    await Promise.all([loadSummary(), loadTasks()]);
    toast("图片已删除");
  } catch (error) {
    toast(error.message, "error");
  }
}

function openImage(image) {
  document.getElementById("modalImage").src = image.dataset.full;
  document.getElementById("modalCaption").textContent = image.dataset.caption || "成果图片";
  document.getElementById("imageModal").hidden = false;
}

function closeModal(id) {
  document.getElementById(id).hidden = true;
}

function closeEvidenceGuides(except = null) {
  document.querySelectorAll(".evidence-guide-tooltip.is-open").forEach((tooltip) => {
    if (tooltip === except) return;
    tooltip.classList.remove("is-open");
    tooltip.querySelector("[data-evidence-guide]")?.setAttribute("aria-expanded", "false");
  });
}

function renderUsers(users) {
  document.getElementById("userCount").textContent = `${users.length} 个`;
  document.getElementById("userList").innerHTML = users.map((user) => `
    <div class="user-list-item">
      <span class="user-avatar ${user.role}">${escapeHtml(user.display_name.slice(0, 1).toUpperCase())}</span>
      <span class="user-list-identity">
        <strong>${escapeHtml(user.display_name)}</strong>
        <small>${escapeHtml(user.username)}</small>
      </span>
      <span class="user-role ${user.role}">${user.role === "student" ? "学生" : "监督者"}</span>
      ${user.can_manage_users ? `<span class="user-admin-mark" title="账号管理员"><i data-lucide="shield-check"></i></span>` : ""}
    </div>
  `).join("");
  refreshIcons();
}

async function loadUsers() {
  if (!canManageUsers) return;
  renderUsers(await api("/api/users"));
}

function timerStateText(timerState, remaining) {
  if (timerState === "running") return remaining > 0 ? "专注中" : "时间到";
  if (timerState === "paused") return "已暂停";
  if (timerState === "completed") return "本次已结束";
  return "准备开始";
}

function renderTimerClock() {
  const task = state.activeTimerTask;
  if (!task) return;
  const elapsed = timerElapsed(task);
  const target = Number(task.timer.target_seconds || task.planned_minutes * 60);
  const remaining = Math.max(0, target - elapsed);
  const progress = target ? Math.min(100, (elapsed / target) * 100) : 0;
  document.getElementById("timerClock").textContent = formatClock(remaining);
  document.getElementById("timerProgressBar").style.width = `${progress}%`;
  document.getElementById("timerDial").style.setProperty("--timer-progress", `${progress * 3.6}deg`);
  document.getElementById("timerStatus").textContent = timerStateText(task.timer.state, remaining);
  document.getElementById("timerStatus").dataset.state = task.timer.state;
  document.getElementById("timerElapsedLabel").textContent = `已学习 ${Math.floor(elapsed / 60)} 分钟`;

  const rowLabel = document.querySelector(`[data-timer-task="${task.id}"] .timer-button-label`);
  if (rowLabel && task.timer.state === "running") rowLabel.textContent = formatClock(remaining);

  if (task.timer.state === "running" && remaining <= 0 && !state.timerFinishing) {
    state.timerFinishing = true;
    performTimerAction("finish", true).finally(() => { state.timerFinishing = false; });
  }
}

function renderTimerModal() {
  const task = state.activeTimerTask;
  if (!task) return;
  const timerState = task.timer.state;
  const isStudent = role === "student";
  document.getElementById("timerTitle").textContent = task.section || task.category;
  document.getElementById("timerTaskMeta").textContent = `${task.subject} · ${task.category} · ${task.id}`;
  document.getElementById("timerSuggestion").textContent = `建议 ${task.planned_minutes} 分钟，可按实际情况调整`;
  document.getElementById("timerDuration").value = Math.max(1, Math.round(task.timer.target_seconds / 60));
  document.getElementById("timerSetup").hidden = timerState !== "idle" && timerState !== "completed";

  document.getElementById("timerStart").hidden = !isStudent || (timerState !== "idle" && timerState !== "completed");
  document.getElementById("timerStart").querySelector("span").textContent = timerState === "completed" ? "再次开始" : "开始专注";
  document.getElementById("timerPause").hidden = !isStudent || timerState !== "running";
  document.getElementById("timerResume").hidden = !isStudent || timerState !== "paused";
  document.getElementById("timerFinish").hidden = !isStudent || !["running", "paused"].includes(timerState);
  document.getElementById("timerReset").hidden = !isStudent || timerState === "idle";
  renderTimerClock();
  refreshIcons();
}

function openTimer(task) {
  state.activeTimerTask = syncTimerTask(task);
  document.getElementById("timerModal").hidden = false;
  renderTimerModal();
}

async function performTimerAction(action, automatic = false) {
  const task = state.activeTimerTask;
  if (!task) return;
  const payload = { action };
  if (action === "start") payload.duration_minutes = Number(document.getElementById("timerDuration").value);
  document.querySelectorAll(".timer-actions button").forEach((button) => { button.disabled = true; });
  try {
    const result = await api(`/api/tasks/${encodeURIComponent(task.id)}/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.activeTimerTask = syncTimerTask(result.task);
    const index = state.tasks.findIndex((item) => item.id === result.task.id);
    if (index >= 0) state.tasks[index] = syncTimerTask(result.task);
    renderTasks();
    renderTimerModal();
    if (action === "start" || action === "resume") await loadSummary();
    if (!automatic) {
      const messages = { start: "计时已开始", pause: "计时已暂停", resume: "继续计时", finish: "本次计时已结束", reset: "计时器已重置" };
      toast(messages[action]);
    } else {
      toast("学习时间已到");
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    document.querySelectorAll(".timer-actions button").forEach((button) => { button.disabled = false; });
  }
}

async function restoreActiveTimer() {
  if (role !== "student") return;
  const result = await api("/api/timer/active");
  if (result.task) openTimer(result.task);
}

setInterval(renderTimerClock, 500);

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-upload-task]")) {
    uploadImages(target);
    return;
  }
  if (target.matches(".status-select, .review-select")) {
    target.dataset.state = target.value;
    const indicator = document.querySelector(`[data-save-for="${target.dataset.taskId}"]`);
    updateTask(target.dataset.taskId, target.dataset.field, target.value, indicator);
  }
});

document.addEventListener("focusout", (event) => {
  const target = event.target;
  if (!target.matches(".note-input")) return;
  const indicator = document.querySelector(`[data-save-for="${target.dataset.taskId}"]`);
  updateTask(target.dataset.taskId, target.dataset.field, target.value, indicator);
});

document.addEventListener("click", (event) => {
  const guideButton = event.target.closest("[data-evidence-guide]");
  if (guideButton) {
    const tooltip = guideButton.closest(".evidence-guide-tooltip");
    const willOpen = !tooltip.classList.contains("is-open");
    closeEvidenceGuides(tooltip);
    tooltip.classList.toggle("is-open", willOpen);
    guideButton.setAttribute("aria-expanded", String(willOpen));
    return;
  }
  closeEvidenceGuides();
  const detailButton = event.target.closest("[data-toggle-details]");
  if (detailButton) {
    const taskId = detailButton.dataset.toggleDetails;
    const card = detailButton.closest("[data-task-card]");
    const willExpand = !state.expandedTasks.has(taskId);
    if (willExpand) state.expandedTasks.add(taskId);
    else state.expandedTasks.delete(taskId);
    card.classList.toggle("is-expanded", willExpand);
    detailButton.setAttribute("aria-expanded", String(willExpand));
    detailButton.querySelector("span").textContent = willExpand ? "收起" : "成果与记录";
    return;
  }
  const timerButton = event.target.closest("[data-timer-task]");
  if (timerButton) {
    const task = state.tasks.find((item) => item.id === timerButton.dataset.timerTask);
    if (task) openTimer(task);
    return;
  }
  const deleteButton = event.target.closest("[data-image-id]");
  if (deleteButton) {
    deleteImage(deleteButton.dataset.imageId);
    return;
  }
  const image = event.target.closest(".image-thumb img");
  if (image) {
    openImage(image);
    return;
  }
  const closeButton = event.target.closest("[data-close-modal]");
  if (closeButton) closeModal(closeButton.dataset.closeModal);
});

document.getElementById("timerStart").addEventListener("click", () => performTimerAction("start"));
document.getElementById("timerPause").addEventListener("click", () => performTimerAction("pause"));
document.getElementById("timerResume").addEventListener("click", () => performTimerAction("resume"));
document.getElementById("timerFinish").addEventListener("click", () => performTimerAction("finish"));
document.getElementById("timerReset").addEventListener("click", () => performTimerAction("reset"));

const appSidebar = document.getElementById("appSidebar");
const sidebarScrim = document.getElementById("sidebarScrim");

function closeSidebar() {
  appSidebar.classList.remove("is-open");
  sidebarScrim.classList.remove("is-visible");
}

function openSidebar() {
  appSidebar.classList.add("is-open");
  sidebarScrim.classList.add("is-visible");
}

function switchView(view) {
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === `${view}View`));
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  document.getElementById("pageTitle").textContent = view === "tasks" ? "我的课程 | 任务列表" : "学习总览";
  document.getElementById("pageKicker").textContent = view === "tasks" ? "DAILY PLAN" : "LEARNING OVERVIEW";
  closeSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.getElementById("menuButton").addEventListener("click", openSidebar);
document.querySelector("[data-open-menu]").addEventListener("click", openSidebar);
sidebarScrim.addEventListener("click", closeSidebar);

document.getElementById("subjectFilter").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-subject]");
  if (!button) return;
  state.selectedSubject = button.dataset.subject;
  document.querySelectorAll("#subjectFilter button").forEach((item) => item.classList.toggle("is-active", item === button));
  await loadTasks();
});

document.getElementById("dateInput").addEventListener("change", async (event) => {
  if (!state.summary.dates.some((item) => item.date === event.target.value)) {
    toast("请选择计划内日期", "error");
    renderDateControl();
    return;
  }
  state.selectedDate = event.target.value;
  await loadTasks();
});

document.getElementById("previousDay").addEventListener("click", async () => {
  const index = state.summary.dates.findIndex((item) => item.date === state.selectedDate);
  if (index > 0) state.selectedDate = state.summary.dates[index - 1].date;
  await loadTasks();
});

document.getElementById("nextDay").addEventListener("click", async () => {
  const index = state.summary.dates.findIndex((item) => item.date === state.selectedDate);
  if (index < state.summary.dates.length - 1) state.selectedDate = state.summary.dates[index + 1].date;
  await loadTasks();
});

document.getElementById("accountButton").addEventListener("click", () => {
  document.getElementById("accountModal").hidden = false;
  closeSidebar();
});

document.querySelector("[data-open-account]").addEventListener("click", () => {
  document.getElementById("accountModal").hidden = false;
});

if (canManageUsers) {
  document.getElementById("userManagementButton").addEventListener("click", async () => {
    document.getElementById("userManagementModal").hidden = false;
    closeSidebar();
    refreshIcons();
    try {
      await loadUsers();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  document.getElementById("createUserForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const submitButton = event.target.querySelector("button[type='submit']");
    submitButton.disabled = true;
    try {
      await api("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          display_name: form.get("display_name"),
          role: form.get("role"),
          password: form.get("password"),
        }),
      });
      event.target.reset();
      await loadUsers();
      toast("账号已创建");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

document.getElementById("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  if (form.get("new_password") !== form.get("confirm_password")) {
    toast("两次输入的新密码不一致", "error");
    return;
  }
  try {
    await api("/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_password: form.get("current_password"),
        new_password: form.get("new_password"),
      }),
    });
    event.target.reset();
    closeModal("accountModal");
    toast("密码已修改");
  } catch (error) {
    toast(error.message, "error");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeEvidenceGuides();
    document.querySelectorAll(".modal-backdrop:not([hidden])").forEach((modal) => { modal.hidden = true; });
    closeSidebar();
  }
});

async function start() {
  try {
    await loadSummary();
    await loadTasks();
    await restoreActiveTimer();
    refreshIcons();
  } catch (error) {
    toast(error.message, "error");
  }
}

start();
