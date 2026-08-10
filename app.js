import {
  classifyTitleMethod,
  filterProjects,
  getFreshness,
  projectsWithinDays,
  summarizeProjects,
  validatePayload,
} from "./lib.js";

const STATUS_LABELS = Object.freeze({
  new: "新项目",
  change: "项目变更",
  baseline: "历史导入",
});

const elements = {
  healthDot: document.querySelector("#health-dot"),
  healthLabel: document.querySelector("#health-label"),
  healthTime: document.querySelector("#health-time"),
  systemMessage: document.querySelector("#system-message"),
  totalCount: document.querySelector("#total-count"),
  newCount: document.querySelector("#new-count"),
  changeCount: document.querySelector("#change-count"),
  ageValue: document.querySelector("#age-value"),
  ageDetail: document.querySelector("#age-detail"),
  searchInput: document.querySelector("#search-input"),
  prefixFilter: document.querySelector("#prefix-filter"),
  methodFilter: document.querySelector("#method-filter"),
  statusFilter: document.querySelector("#status-filter"),
  dateFrom: document.querySelector("#date-from"),
  dateTo: document.querySelector("#date-to"),
  resetButton: document.querySelector("#reset-button"),
  filterError: document.querySelector("#filter-error"),
  resultsCaption: document.querySelector("#results-caption"),
  loadingState: document.querySelector("#loading-state"),
  emptyState: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyDescription: document.querySelector("#empty-description"),
  projectList: document.querySelector("#project-list"),
  cardTemplate: document.querySelector("#project-card-template"),
};

const state = {
  payload: null,
  recentProjects: [],
};

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatAge(ageMs) {
  if (!Number.isFinite(ageMs)) return "未知";
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function setText(element, value) {
  element.textContent = value;
}

function showSystemMessage(message, tone = "warning") {
  setText(elements.systemMessage, message);
  elements.systemMessage.classList.toggle("is-error", tone === "error");
  elements.systemMessage.hidden = false;
}

function clearSystemMessage() {
  elements.systemMessage.hidden = true;
  elements.systemMessage.classList.remove("is-error");
  setText(elements.systemMessage, "");
}

function setHealth(status, label, lastSuccessAt = null) {
  elements.healthDot.className = `health-dot is-${status}`;
  setText(elements.healthLabel, label);
  setText(
    elements.healthTime,
    lastSuccessAt ? `最后检查：${formatDateTime(lastSuccessAt)}` : "最后检查：--",
  );
}

function updateFreshness(payload) {
  const freshness = getFreshness(payload.lastSuccessAt);
  const messages = [];
  setText(elements.ageValue, formatAge(freshness.ageMs));
  setText(elements.ageDetail, `最后成功 ${formatDateTime(payload.lastSuccessAt)}`);

  if (freshness.status === "stale") {
    setHealth("stale", "数据可能已过期", payload.lastSuccessAt);
    messages.push("距离上次成功检查已超过 2 小时 30 分钟，请等待下一轮任务或联系管理员查看运行日志。");
  } else {
    setHealth("healthy", "监控数据正常", payload.lastSuccessAt);
  }

  if (payload.isSample) {
    messages.push("当前显示的是脱敏示例数据，仅用于检查页面布局和筛选功能。");
  }

  if (messages.length > 0) {
    showSystemMessage(messages.join(" "));
  }
}

function getFilters() {
  return {
    query: elements.searchInput.value,
    prefix: elements.prefixFilter.value,
    method: elements.methodFilter.value,
    status: elements.statusFilter.value,
    dateFrom: elements.dateFrom.value,
    dateTo: elements.dateTo.value,
  };
}

function renderSummary(projects) {
  const summary = summarizeProjects(projects);
  setText(elements.totalCount, String(summary.total));
  setText(elements.newCount, String(summary.new));
  setText(elements.changeCount, String(summary.change));
}

function appendProject(project) {
  const fragment = elements.cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".project-card");
  card.classList.add(`is-${project.noticeKind}`);

  setText(fragment.querySelector(".status-tag"), STATUS_LABELS[project.noticeKind]);
  setText(fragment.querySelector(".method-tag"), classifyTitleMethod(project));
  setText(fragment.querySelector(".publish-date"), project.publishedDate);
  fragment.querySelector(".publish-date").dateTime = project.publishedDate;
  setText(fragment.querySelector(".project-title"), project.title);
  setText(fragment.querySelector(".project-number"), project.projectNumber);
  setText(fragment.querySelector(".matched-prefix"), project.matchedPrefix);
  setText(fragment.querySelector(".purchase-method"), project.purchaseMethod || "未公开");
  setText(fragment.querySelector(".project-region"), project.region || "未公开");
  setText(
    fragment.querySelector(".match-reason"),
    project.matchedKeyword ? `标题命中：${project.matchedKeyword}` : "标题关键词已匹配",
  );

  const sourceLink = fragment.querySelector(".source-link");
  if (project.sourceUrl) {
    sourceLink.href = project.sourceUrl;
  } else {
    sourceLink.removeAttribute("href");
    sourceLink.setAttribute("aria-disabled", "true");
    setText(sourceLink, "官网链接不可用");
  }

  elements.projectList.append(fragment);
}

function renderProjects() {
  let filtered;
  elements.filterError.hidden = true;
  setText(elements.filterError, "");

  try {
    filtered = filterProjects(state.recentProjects, getFilters());
  } catch (error) {
    elements.filterError.hidden = false;
    setText(elements.filterError, error.message);
    filtered = [];
  }

  renderSummary(filtered);
  elements.projectList.replaceChildren();
  elements.loadingState.hidden = true;

  const hasAnyRecentProjects = state.recentProjects.length > 0;
  if (filtered.length === 0) {
    elements.emptyState.hidden = false;
    setText(
      elements.emptyTitle,
      hasAnyRecentProjects ? "当前筛选没有结果" : "近30天暂无匹配项目",
    );
    setText(
      elements.emptyDescription,
      hasAnyRecentProjects
        ? "可以调整关键词、编号、状态或日期范围后再查看。"
        : "数据已正常读取，近30天内暂时没有符合条件的公开公告。",
    );
  } else {
    elements.emptyState.hidden = true;
    filtered.forEach(appendProject);
  }

  setText(elements.resultsCaption, `显示 ${filtered.length} / ${state.recentProjects.length} 个项目`);
}

function resetFilters() {
  elements.searchInput.value = "";
  elements.prefixFilter.value = "all";
  elements.methodFilter.value = "all";
  elements.statusFilter.value = "all";
  elements.dateFrom.value = "";
  elements.dateTo.value = "";
  renderProjects();
}

function renderLoadFailure(error) {
  setHealth("error", "数据加载失败");
  setText(elements.ageValue, "读取失败");
  setText(elements.ageDetail, "请稍后刷新页面");
  setText(elements.totalCount, "--");
  setText(elements.newCount, "--");
  setText(elements.changeCount, "--");
  elements.loadingState.hidden = true;
  elements.projectList.replaceChildren();
  elements.emptyState.hidden = false;
  setText(elements.emptyTitle, "暂时无法读取项目数据");
  setText(elements.emptyDescription, "数据文件不存在、格式异常或网络访问失败，请稍后重试。");
  setText(elements.resultsCaption, "读取失败");
  showSystemMessage(`项目数据加载失败：${error.message}`, "error");
}

async function loadProjects() {
  try {
    const response = await fetch("./data/projects.json", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`服务器返回 HTTP ${response.status}`);
    }

    const rawPayload = await response.json();
    const payload = validatePayload(rawPayload);
    state.payload = payload;
    state.recentProjects = projectsWithinDays(payload.projects, new Date(), 30);
    clearSystemMessage();
    updateFreshness(payload);
    renderProjects();
  } catch (error) {
    renderLoadFailure(error instanceof Error ? error : new Error("未知错误"));
  }
}

[
  elements.searchInput,
  elements.prefixFilter,
  elements.methodFilter,
  elements.statusFilter,
  elements.dateFrom,
  elements.dateTo,
].forEach((control) => control.addEventListener("input", renderProjects));

elements.resetButton.addEventListener("click", resetFilters);

loadProjects();
