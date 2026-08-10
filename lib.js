export const ALLOWED_PREFIXES = Object.freeze(["JQ06-W", "JQ01-W"]);
export const ALLOWED_NOTICE_KINDS = Object.freeze(["new", "change", "baseline"]);
export const TITLE_METHODS = Object.freeze(["谈判", "招标", "询价"]);
export const OFFICIAL_BASE_URL = "https://www.plap.mil.cn/";
export const STALE_AFTER_MS = 150 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`字段 ${fieldName} 必须是非空字符串`);
  }
  return value.trim();
}

function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

export function isAllowedOfficialUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  try {
    const url = new URL(value, OFFICIAL_BASE_URL);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (hostname === "plap.mil.cn" || hostname.endsWith(".plap.mil.cn"))
    );
  } catch {
    return false;
  }
}

export function toAllowedOfficialUrl(value) {
  if (!isAllowedOfficialUrl(value)) {
    return null;
  }
  return new URL(value, OFFICIAL_BASE_URL).href;
}

export function classifyTitleMethod(project) {
  const candidates = [project.matched_keyword, project.title]
    .filter((value) => typeof value === "string")
    .join(" ");

  return TITLE_METHODS.find((method) => candidates.includes(method)) ?? "其他";
}

export function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("数据根节点必须是对象");
  }
  if (payload.schema_version !== 1) {
    throw new TypeError("仅支持 schema_version = 1");
  }

  const generatedAt = requireNonEmptyString(payload.generated_at, "generated_at");
  const lastSuccessAt = requireNonEmptyString(payload.last_success_at, "last_success_at");
  if (!Number.isFinite(Date.parse(generatedAt)) || !Number.isFinite(Date.parse(lastSuccessAt))) {
    throw new TypeError("generated_at 和 last_success_at 必须是有效时间");
  }
  if (!Array.isArray(payload.projects)) {
    throw new TypeError("projects 必须是数组");
  }

  const seenIds = new Set();
  const projects = payload.projects.map((rawProject, index) => {
    if (!rawProject || typeof rawProject !== "object" || Array.isArray(rawProject)) {
      throw new TypeError(`projects[${index}] 必须是对象`);
    }

    const id = requireNonEmptyString(rawProject.id, `projects[${index}].id`);
    if (seenIds.has(id)) {
      throw new TypeError(`存在重复项目 id：${id}`);
    }
    seenIds.add(id);

    const prefix = requireNonEmptyString(
      rawProject.matched_prefix,
      `projects[${index}].matched_prefix`,
    );
    if (!ALLOWED_PREFIXES.includes(prefix)) {
      throw new TypeError(`项目 ${id} 的 matched_prefix 不在允许范围内`);
    }

    const noticeKind = requireNonEmptyString(
      rawProject.notice_kind,
      `projects[${index}].notice_kind`,
    );
    if (!ALLOWED_NOTICE_KINDS.includes(noticeKind)) {
      throw new TypeError(`项目 ${id} 的 notice_kind 无效`);
    }

    const publishedDate = requireNonEmptyString(
      rawProject.published_date,
      `projects[${index}].published_date`,
    );
    if (parseDateOnly(publishedDate) === null) {
      throw new TypeError(`项目 ${id} 的 published_date 无效`);
    }

    const sourceUrl = toAllowedOfficialUrl(rawProject.source_url);

    return Object.freeze({
      id,
      title: requireNonEmptyString(rawProject.title, `projects[${index}].title`),
      projectNumber: requireNonEmptyString(
        rawProject.project_number,
        `projects[${index}].project_number`,
      ),
      matchedPrefix: prefix,
      purchaseMethod: optionalString(rawProject.purchase_method),
      region: optionalString(rawProject.region),
      publishedDate,
      noticeKind,
      matchedKeyword: optionalString(rawProject.matched_keyword),
      sourceUrl,
      firstSeenAt: optionalString(rawProject.first_seen_at),
      lastSeenAt: optionalString(rawProject.last_seen_at),
    });
  });

  return Object.freeze({
    schemaVersion: 1,
    generatedAt,
    lastSuccessAt,
    isSample: payload.is_sample === true,
    projects: Object.freeze(projects),
  });
}

export function projectsWithinDays(projects, now = new Date(), days = 30) {
  if (!Number.isInteger(days) || days < 1) {
    throw new RangeError("days 必须是正整数");
  }

  const reference = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(reference.getTime())) {
    throw new TypeError("now 必须是有效时间");
  }

  const today = Date.UTC(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  );
  const cutoff = today - (days - 1) * DAY_MS;

  return projects
    .filter((project) => {
      const date = parseDateOnly(project.publishedDate);
      return date !== null && date >= cutoff && date <= today;
    })
    .sort((left, right) => {
      const byDate = right.publishedDate.localeCompare(left.publishedDate);
      if (byDate !== 0) return byDate;
      return right.firstSeenAt.localeCompare(left.firstSeenAt);
    });
}

export function filterProjects(projects, filters = {}) {
  const query = optionalString(filters.query).toLocaleLowerCase("zh-CN");
  const prefix = optionalString(filters.prefix) || "all";
  const method = optionalString(filters.method) || "all";
  const status = optionalString(filters.status) || "all";
  const dateFrom = optionalString(filters.dateFrom);
  const dateTo = optionalString(filters.dateTo);

  if (dateFrom && parseDateOnly(dateFrom) === null) {
    throw new TypeError("开始日期无效");
  }
  if (dateTo && parseDateOnly(dateTo) === null) {
    throw new TypeError("结束日期无效");
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new RangeError("开始日期不能晚于结束日期");
  }

  return projects.filter((project) => {
    const searchable = `${project.title} ${project.projectNumber}`.toLocaleLowerCase("zh-CN");
    if (query && !searchable.includes(query)) return false;
    if (prefix !== "all" && project.matchedPrefix !== prefix) return false;
    if (method !== "all" && classifyTitleMethod(project) !== method) return false;
    if (status !== "all" && project.noticeKind !== status) return false;
    if (dateFrom && project.publishedDate < dateFrom) return false;
    if (dateTo && project.publishedDate > dateTo) return false;
    return true;
  });
}

export function summarizeProjects(projects) {
  return projects.reduce(
    (summary, project) => {
      summary.total += 1;
      if (project.noticeKind === "new") summary.new += 1;
      if (project.noticeKind === "change") summary.change += 1;
      return summary;
    },
    { total: 0, new: 0, change: 0 },
  );
}

export function getFreshness(lastSuccessAt, now = new Date()) {
  const successTime = Date.parse(lastSuccessAt);
  const reference = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(successTime) || !Number.isFinite(reference)) {
    return { status: "error", ageMs: null };
  }

  const ageMs = Math.max(0, reference - successTime);
  return {
    status: ageMs > STALE_AFTER_MS ? "stale" : "healthy",
    ageMs,
  };
}
