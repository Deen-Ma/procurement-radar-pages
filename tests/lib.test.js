import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyTitleMethod,
  filterProjects,
  getFreshness,
  isAllowedOfficialUrl,
  projectsWithinDays,
  summarizeProjects,
  validatePayload,
} from "../lib.js";

const rawPayload = {
  schema_version: 1,
  generated_at: "2026-08-10T10:00:00+08:00",
  last_success_at: "2026-08-10T10:00:00+08:00",
  projects: [
    {
      id: "one",
      title: "设备询价公告",
      project_number: "2026-JQ06-W1001",
      matched_prefix: "JQ06-W",
      purchase_method: "询价",
      region: "北京",
      published_date: "2026-08-10",
      notice_kind: "new",
      matched_keyword: "询价",
      source_url: "https://www.plap.mil.cn/example/one",
      first_seen_at: "2026-08-10T10:00:00+08:00",
      last_seen_at: "2026-08-10T10:00:00+08:00",
    },
    {
      id: "two",
      title: "设备公开招标更正公告",
      project_number: "2026-JQ01-W1002",
      matched_prefix: "JQ01-W",
      purchase_method: "公开招标",
      region: "河北",
      published_date: "2026-07-12",
      notice_kind: "change",
      matched_keyword: "招标",
      source_url: "/example/two",
      first_seen_at: "2026-07-12T10:00:00+08:00",
      last_seen_at: "2026-08-10T10:00:00+08:00",
    },
    {
      id: "three",
      title: "耗材竞争性谈判公告",
      project_number: "2026-JQ06-W1003",
      matched_prefix: "JQ06-W",
      purchase_method: "竞争性谈判",
      region: "天津",
      published_date: "2026-07-11",
      notice_kind: "baseline",
      matched_keyword: "谈判",
      source_url: "https://plap.mil.cn/example/three",
      first_seen_at: "2026-07-11T10:00:00+08:00",
      last_seen_at: "2026-08-10T10:00:00+08:00",
    },
  ],
};

test("official link allowlist rejects lookalike and insecure URLs", () => {
  assert.equal(isAllowedOfficialUrl("https://www.plap.mil.cn/a"), true);
  assert.equal(isAllowedOfficialUrl("https://plap.mil.cn/a"), true);
  assert.equal(isAllowedOfficialUrl("https://plap.mil.cn.evil.example/a"), false);
  assert.equal(isAllowedOfficialUrl("https://plap.mil.cn@evil.example/a"), false);
  assert.equal(isAllowedOfficialUrl("http://www.plap.mil.cn/a"), false);
});

test("payload validation normalizes fields and rejects duplicate ids", () => {
  const payload = validatePayload(rawPayload);
  assert.equal(payload.projects.length, 3);
  assert.equal(payload.projects[0].projectNumber, "2026-JQ06-W1001");

  const duplicate = structuredClone(rawPayload);
  duplicate.projects[1].id = "one";
  assert.throws(() => validatePayload(duplicate), /重复项目 id/);
});

test("30 day window includes both boundary dates", () => {
  const payload = validatePayload(rawPayload);
  const recent = projectsWithinDays(payload.projects, new Date("2026-08-10T12:00:00+08:00"), 30);
  assert.deepEqual(
    recent.map((project) => project.id),
    ["one", "two"],
  );
});

test("filters combine prefix, title method, status and date", () => {
  const payload = validatePayload(rawPayload);
  const result = filterProjects(payload.projects, {
    query: "更正",
    prefix: "JQ01-W",
    method: "招标",
    status: "change",
    dateFrom: "2026-07-01",
    dateTo: "2026-08-10",
  });
  assert.deepEqual(result.map((project) => project.id), ["two"]);
  assert.throws(
    () => filterProjects(payload.projects, { dateFrom: "2026-08-11", dateTo: "2026-08-10" }),
    /开始日期不能晚于结束日期/,
  );
});

test("title method and summary stay deterministic", () => {
  const payload = validatePayload(rawPayload);
  assert.equal(classifyTitleMethod(payload.projects[2]), "谈判");
  assert.deepEqual(summarizeProjects(payload.projects), { total: 3, new: 1, change: 1 });
});

test("freshness becomes stale after 150 minutes", () => {
  assert.equal(
    getFreshness("2026-08-10T10:00:00+08:00", "2026-08-10T12:29:00+08:00").status,
    "healthy",
  );
  assert.equal(
    getFreshness("2026-08-10T10:00:00+08:00", "2026-08-10T12:31:00+08:00").status,
    "stale",
  );
});
