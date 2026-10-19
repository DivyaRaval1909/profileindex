const API_ROOT = "https://api.github.com";
const MAX_RESULTS_PER_STATUS = 100;

async function githubRequest(path, { search = false } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gh-profiler-web",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const error = new Error(
      details.message || `GitHub API request failed (${response.status}).`,
    );
    error.status =
      response.status === 404
        ? 404
        : response.status === 403 || response.status === 429
          ? 429
          : 502;

    if (search && response.status === 403) {
      error.message =
        "GitHub search rate limit reached. Please wait a minute and try again.";
    } else if (response.status === 403 || response.status === 429) {
      error.message =
        "GitHub API rate limit reached. Set GITHUB_TOKEN in the server environment or try again later.";
    }

    throw error;
  }

  return response.json();
}

function userRepos(username) {
  const params = new URLSearchParams({
    per_page: "100",
    sort: "updated",
    direction: "desc",
  });
  return githubRequest(`/users/${encodeURIComponent(username)}/repos?${params}`);
}

function userOrganizations(username) {
  return githubRequest(`/users/${encodeURIComponent(username)}/orgs?per_page=100`);
}

function userSocials(username) {
  return githubRequest(
    `/users/${encodeURIComponent(username)}/social_accounts?per_page=100`,
  );
}

function userEvents(username) {
  return githubRequest(`/users/${encodeURIComponent(username)}/events/public?per_page=30`);
}

async function searchActivity(username, type, state) {
  const query = `author:${username} type:${type} is:${state}`;
  const params = new URLSearchParams({
    q: query,
    per_page: String(MAX_RESULTS_PER_STATUS),
    sort: "updated",
    order: "desc",
  });
  const result = await githubRequest(`/search/issues?${params}`, { search: true });

  return {
    total: result.total_count,
    items: result.items.map((item) => ({
      id: item.id,
      number: item.number,
      title: item.title,
      url: item.html_url,
      state: item.state,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      closedAt: item.closed_at,
      comments: item.comments,
      labels: item.labels.map((label) => label.name),
      repository: {
        name: item.repository_url.split("/").slice(-2).join("/"),
        url: `https://github.com/${item.repository_url.split("/").slice(-2).join("/")}`,
      },
      merged: Boolean(item.pull_request?.merged_at),
    })),
  };
}

function contributionRepositories(pullRequests, issues) {
  const repositories = new Map();

  for (const [kind, collection] of [
    ["pullRequests", pullRequests],
    ["issues", issues],
  ]) {
    for (const item of collection.items) {
      const current = repositories.get(item.repository.name) ?? {
        ...item.repository,
        pullRequests: 0,
        issues: 0,
        latestActivity: item.updatedAt,
      };
      current[kind] += 1;
      if (new Date(item.updatedAt) > new Date(current.latestActivity)) {
        current.latestActivity = item.updatedAt;
      }
      repositories.set(item.repository.name, current);
    }
  }

  return [...repositories.values()].sort(
    (left, right) => new Date(right.latestActivity) - new Date(left.latestActivity),
  );
}

function simplifyEvents(events) {
  return events.map((event) => {
    const payload = event.payload ?? {};
    const activity = {
      id: event.id,
      type: event.type,
      action: payload.action ?? "",
      repository: event.repo.name,
      createdAt: event.created_at,
      url: `https://github.com/${event.repo.name}`,
      title: "",
    };

    if (payload.issue?.html_url) {
      activity.url = payload.issue.html_url;
      activity.title = payload.issue.title;
    } else if (payload.pull_request?.html_url) {
      activity.url = payload.pull_request.html_url;
      activity.title = payload.pull_request.title;
    } else if (payload.commits?.length) {
      activity.title = payload.commits[0].message.split("\n")[0];
    }

    return activity;
  });
}

export async function getProfileReport(rawUsername) {
  const username = rawUsername.trim();
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)) {
    const error = new Error("Enter a valid GitHub username.");
    error.status = 400;
    throw error;
  }

  const [
    profile,
    repositories,
    organizations,
    socials,
    events,
    openPrs,
    mergedPrs,
    closedPrs,
    openIssues,
    closedIssues,
  ] = await Promise.all([
    githubRequest(`/users/${encodeURIComponent(username)}`),
    userRepos(username),
    userOrganizations(username),
    userSocials(username),
    userEvents(username),
    searchActivity(username, "pr", "open"),
    searchActivity(username, "pr", "merged"),
    searchActivity(username, "pr", "closed"),
    searchActivity(username, "issue", "open"),
    searchActivity(username, "issue", "closed"),
  ]);

  const pullRequests = {
    open: openPrs,
    merged: mergedPrs,
    closed: {
      total: closedPrs.total - mergedPrs.total,
      items: closedPrs.items.filter((item) => !item.merged),
    },
  };
  const issues = { open: openIssues, closed: closedIssues };
  const contributionItems = [
    ...pullRequests.open.items,
    ...pullRequests.merged.items,
    ...pullRequests.closed.items,
    ...issues.open.items,
    ...issues.closed.items,
  ];

  return {
    fetchedAt: new Date().toISOString(),
    profile: {
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatar_url,
      htmlUrl: profile.html_url,
      bio: profile.bio,
      company: profile.company,
      location: profile.location,
      blog: profile.blog,
      email: profile.email,
      createdAt: profile.created_at,
      followers: profile.followers,
      following: profile.following,
      publicRepos: profile.public_repos,
      publicGists: profile.public_gists,
    },
    organizations: organizations.map((organization) => ({
      login: organization.login,
      url: organization.html_url,
      description: organization.description,
    })),
    socials: socials.map(({ provider, url }) => ({ provider, url })),
    counts: {
      pullRequests: {
        open: openPrs.total,
        merged: mergedPrs.total,
        closed: pullRequests.closed.total,
      },
      issues: { open: openIssues.total, closed: closedIssues.total },
      repositories: new Set(contributionItems.map((item) => item.repository.name)).size,
    },
    pullRequests,
    issues,
    contributionRepositories: contributionRepositories(
      {
        items: [
          ...pullRequests.open.items,
          ...pullRequests.merged.items,
          ...pullRequests.closed.items,
        ],
      },
      { items: [...issues.open.items, ...issues.closed.items] },
    ),
    ownedRepositories: repositories.map((repository) => ({
      name: repository.full_name,
      url: repository.html_url,
      description: repository.description,
      language: repository.language,
      stars: repository.stargazers_count,
      updatedAt: repository.updated_at,
    })),
    recentActivity: simplifyEvents(events),
    resultLimit: MAX_RESULTS_PER_STATUS,
  };
}
