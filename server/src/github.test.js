import assert from "node:assert/strict";
import { test } from "node:test";
import { getProfileReport } from "./github.js";

function item(id, { mergedAt = null, state = "closed", repository = "acme/widgets" } = {}) {
  return {
    id,
    number: id,
    title: `Activity ${id}`,
    html_url: `https://github.com/${repository}/issues/${id}`,
    state,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    closed_at: state === "closed" ? "2026-01-03T00:00:00Z" : null,
    comments: 0,
    labels: [],
    repository_url: `https://api.github.com/repos/${repository}`,
    pull_request: mergedAt ? { merged_at: mergedAt } : undefined,
  };
}

test("builds a live profile report with distinct PR states and repository totals", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname === "/users/octocat") {
      return Response.json({
        login: "octocat",
        name: "Octocat",
        avatar_url: "https://github.com/octocat.png",
        html_url: "https://github.com/octocat",
        created_at: "2011-01-25T18:44:36Z",
        followers: 10,
        following: 5,
        public_repos: 3,
        public_gists: 2,
      });
    }
    if (url.pathname.endsWith("/repos") || url.pathname.endsWith("/orgs") ||
      url.pathname.endsWith("/social_accounts") || url.pathname.endsWith("/events/public")) {
      return Response.json([]);
    }
    if (url.pathname === "/search/issues") {
      const query = url.searchParams.get("q");
      if (query.includes("type:pr is:open")) {
        return Response.json({ total_count: 2, items: [item(1, { state: "open" })] });
      }
      if (query.includes("type:pr is:merged")) {
        return Response.json({ total_count: 1, items: [item(2, { mergedAt: "2026-01-03T00:00:00Z" })] });
      }
      if (query.includes("type:pr is:closed")) {
        return Response.json({
          total_count: 3,
          items: [
            item(2, { mergedAt: "2026-01-03T00:00:00Z" }),
            item(3),
          ],
        });
      }
      if (query.includes("type:issue is:open")) {
        return Response.json({ total_count: 4, items: [item(4, { state: "open" })] });
      }
      if (query.includes("type:issue is:closed")) {
        return Response.json({ total_count: 6, items: [item(5)] });
      }
    }
    throw new Error(`Unexpected GitHub API request: ${url}`);
  };

  const report = await getProfileReport("octocat");

  assert.equal(report.profile.login, "octocat");
  assert.deepEqual(report.counts.pullRequests, { open: 2, merged: 1, closed: 2 });
  assert.deepEqual(report.counts.issues, { open: 4, closed: 6 });
  assert.equal(report.pullRequests.closed.items.length, 1);
  assert.equal(report.pullRequests.closed.items[0].number, 3);
  assert.equal(report.counts.repositories, 1);
  assert.deepEqual(report.contributionRepositories[0], {
    name: "acme/widgets",
    url: "https://github.com/acme/widgets",
    pullRequests: 3,
    issues: 2,
    latestActivity: "2026-01-02T00:00:00Z",
  });
});

test("rejects invalid usernames before making GitHub requests", async () => {
  await assert.rejects(getProfileReport("invalid username"), {
    message: "Enter a valid GitHub username.",
    status: 400,
  });
});
