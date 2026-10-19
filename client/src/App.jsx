import { useEffect, useMemo, useRef, useState } from "react";

const tabs = ["Overview", "Pull requests", "Issues", "Repositories", "Activity"];
const statusOptions = {
  "Pull requests": ["open", "merged", "closed"],
  Issues: ["open", "closed"],
};

function formatCount(value) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, options).format(new Date(value));
}

function safeWebUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function accountAge(createdAt) {
  if (!createdAt) return "—";
  const years = (Date.now() - new Date(createdAt).getTime()) / 31_557_600_000;
  return years < 1 ? `${Math.max(1, Math.floor(years * 12))} months` : `${Math.floor(years)} years`;
}

function initials(profile) {
  return (profile.name || profile.login || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function LinkIcon() {
  return <span aria-hidden="true" className="external-mark">↗</span>;
}

function RepoAvatar({ repository }) {
  const owner = repository.split("/")[0];
  if (!owner) return <span className="repo-avatar repo-avatar-fallback">◈</span>;

  return (
    <span className="repo-avatar" aria-hidden="true">
      <span>{owner[0].toUpperCase()}</span>
      <img
        src={`https://github.com/${encodeURIComponent(owner)}.png?size=64`}
        alt=""
        loading="lazy"
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
    </span>
  );
}

function StatCard({ label, value, detail, icon }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top"><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span></div>
      <strong className="stat-number">{formatCount(value)}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  );
}

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="section-heading">
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {action}
    </div>
  );
}

function ContributionTable({ repositories }) {
  if (!repositories.length) {
    return <p className="empty-inline">No public pull requests or issues found in the latest results.</p>;
  }

  return (
    <div className="repo-table">
      <div className="repo-table-head"><span>Repository</span><span>Pull requests</span><span>Issues</span><span>Last activity</span></div>
      {repositories.map((repository) => (
        <a className="repo-row" href={repository.url} target="_blank" rel="noreferrer" key={repository.name}>
          <span className="repo-name"><RepoAvatar repository={repository.name} />{repository.name}<LinkIcon /></span>
          <span className="repo-count">{repository.pullRequests}</span>
          <span className="repo-count">{repository.issues}</span>
          <span className="repo-date">{formatDate(repository.latestActivity)}</span>
        </a>
      ))}
    </div>
  );
}

function ActivityList({ items }) {
  if (!items.length) return <p className="empty-inline">No recent public events found.</p>;

  return (
    <div className="activity-list">
      {items.map((item) => (
        <a className="activity-item" href={item.url} target="_blank" rel="noreferrer" key={item.id}>
          <RepoAvatar repository={item.repository} />
          <span className="activity-copy"><strong>{item.title || item.type.replace("Event", "").replace(/([A-Z])/g, " $1").trim()}</strong><span>{item.action ? `${item.action} · ` : ""}{item.repository}</span></span>
          <time>{formatDate(item.createdAt, { month: "short", day: "numeric" })}</time>
        </a>
      ))}
    </div>
  );
}

function WorkList({ items, emptyLabel, type }) {
  if (!items.length) return <div className="empty-state"><span className="empty-symbol">⌁</span><strong>{emptyLabel}</strong><p>Try another category or check back later.</p></div>;

  return (
    <div className="work-list">
      {items.map((item) => (
        <a className="work-item" href={item.url} target="_blank" rel="noreferrer" key={item.id}>
          <span className={`work-symbol ${item.state === "open" ? "is-open" : item.merged ? "is-merged" : "is-closed"}`}>{type === "Issues" ? "◇" : item.merged ? "⌁" : "⑂"}</span>
          <span className="work-main"><strong>{item.title}</strong><span><span className="mono">#{item.number}</span> in {item.repository.name} · opened {formatDate(item.createdAt)}</span>
            {item.labels.length > 0 && <span className="label-list">{item.labels.slice(0, 4).map((label) => <span className="label" key={label}>{label}</span>)}</span>}
          </span>
          <span className={`state-pill ${item.merged ? "merged" : item.state}`}>{item.merged ? "Merged" : item.state}</span>
          <LinkIcon />
        </a>
      ))}
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState(() => {
    const savedTheme = window.localStorage.getItem("profileindex-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [username, setUsername] = useState(() =>
    new URLSearchParams(window.location.search).get("username")?.trim().replace(/^@/, "") ?? "",
  );
  const [report, setReport] = useState(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [activeStatus, setActiveStatus] = useState("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUsername, setLastUsername] = useState("");
  const autoSearchStarted = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#111711" : "#f6f7f3",
    );
    window.localStorage.setItem("profileindex-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (username && !autoSearchStarted.current) {
      autoSearchStarted.current = true;
      void loadProfile(username);
    }
  }, []);

  const selectedItems = useMemo(() => {
    if (!report) return [];
    if (activeTab === "Pull requests") return report.pullRequests[activeStatus]?.items ?? [];
    if (activeTab === "Issues") return report.issues[activeStatus]?.items ?? [];
    return [];
  }, [report, activeTab, activeStatus]);

  async function loadProfile(rawUsername) {
    const query = rawUsername.trim().replace(/^@/, "");
    if (!query) {
      setError("Enter a GitHub username to get started.");
      return;
    }

    setLoading(true);
    setError("");
    setLastUsername(query);
    try {
      const response = await fetch(`/api/profile/${encodeURIComponent(query)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load this profile.");
      setReport(result);
      setActiveTab("Overview");
      setActiveStatus("open");
    } catch (requestError) {
      setError(requestError.message || "Could not reach the profile service.");
    } finally {
      setLoading(false);
    }
  }

  function analyze(event) {
    event.preventDefault();
    void loadProfile(username);
  }

  const profile = report?.profile;
  const initialsText = profile ? initials(profile) : "";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand"><span className="brand-glyph">g</span><span>profile<span className="brand-light">index</span></span></a>
        <div className="topbar-right"><span className="live-indicator"><span />Live GitHub data</span><a className="github-link" href="https://github.com" target="_blank" rel="noreferrer">GitHub <LinkIcon /></a><button className="theme-toggle" type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "day" : "night"} mode`} title={`Switch to ${theme === "dark" ? "day" : "night"} mode`}><span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span><span className="theme-toggle-label">{theme === "dark" ? "Day" : "Night"}</span></button></div>
      </header>

      <main>
        <section className={`hero ${report ? "hero-compact" : ""}`}>
          <div className="hero-copy">
            <span className="eyebrow hero-eyebrow"><span className="eyebrow-line" />OPEN SOURCE, IN CONTEXT</span>
            <h1>Every contribution<br />has a <em>story.</em></h1>
            <p>Explore the work behind a GitHub profile: where someone contributes, what they build, and how their activity unfolds.</p>
          </div>
          <form className="search-form" onSubmit={analyze}>
            <label htmlFor="username">GITHUB USERNAME</label>
            <div className="search-controls">
              <span className="search-prefix">@</span>
              <input id="username" autoComplete="off" placeholder="octocat" value={username} onChange={(event) => setUsername(event.target.value)} />
              <button type="submit" disabled={loading}>{loading ? <><span className="spinner" />Looking up</> : <>Explore profile <span aria-hidden="true">→</span></>}</button>
            </div>
            <div className="search-hint"><span className="keycap">↵</span> Enter a username to see their public work <span className="hint-note">No sign-in needed</span></div>
          </form>
        </section>

        {error && <div className="error-banner" role="alert"><span>!</span><div><strong>We couldn't load that profile</strong><p>{error}</p></div><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}

        {!report && !loading && (
          <section className="welcome-panel">
            <div className="welcome-art" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="welcome-center">g</span><span className="orbit-node node-one">⌘</span><span className="orbit-node node-two">↗</span><span className="orbit-node node-three">◈</span></div>
            <div className="welcome-text"><span className="eyebrow">A CLEARER VIEW OF OPEN SOURCE</span><h2>Good work deserves<br />good context.</h2><p>Get a thoughtful snapshot of public contributions, from merged pull requests to the projects someone helps move forward.</p><div className="welcome-points"><span><b>01</b> Follow contributions across repos</span><span><b>02</b> See the full PR and issue lifecycle</span><span><b>03</b> Explore recent public activity</span></div></div>
            <span className="panel-index">01 — 03</span>
          </section>
        )}

        {loading && <div className="loading-panel"><span className="loading-ring" /><strong>Gathering the public record</strong><span>Checking profile, repositories, pull requests, and issues for @{lastUsername}.</span></div>}

        {report && !loading && profile && (
          <section className="report">
            <div className="profile-card">
              <div className="profile-identity">
                {profile.avatarUrl ? <img className="avatar" src={profile.avatarUrl} alt={`${profile.login}'s avatar`} /> : <div className="avatar avatar-fallback">{initialsText}</div>}
                <div className="identity-copy"><div className="identity-name-row"><h2>{profile.name || profile.login}</h2><span className="member-tag">COMMUNITY MEMBER</span></div><a className="handle" href={profile.htmlUrl} target="_blank" rel="noreferrer">@{profile.login} <LinkIcon /></a>
                  {profile.bio && <p className="bio">{profile.bio}</p>}
                  <div className="profile-meta">{profile.location && <span><i>⌖</i>{profile.location}</span>}{profile.company && <span><i>⌂</i>{profile.company}</span>}{safeWebUrl(profile.blog) && <a href={safeWebUrl(profile.blog)} target="_blank" rel="noreferrer"><i>↗</i>{profile.blog.replace(/^https?:\/\//, "")}</a>}{profile.email && <a href={`mailto:${profile.email}`}><i>✉</i>{profile.email}</a>}</div>
                  {(report.organizations.length > 0 || report.socials.length > 0) && <div className="profile-extras">
                    {report.organizations.length > 0 && <div><span>ORGANIZATIONS</span>{report.organizations.slice(0, 5).map((organization) => <a href={safeWebUrl(organization.url)} target="_blank" rel="noreferrer" key={organization.login}>{organization.login}</a>)}</div>}
                    {report.socials.some((social) => safeWebUrl(social.url)) && <div><span>ELSEWHERE</span>{report.socials.filter((social) => safeWebUrl(social.url)).map((social) => <a href={safeWebUrl(social.url)} target="_blank" rel="noreferrer" key={`${social.provider}-${social.url}`}>{social.provider}</a>)}</div>}
                  </div>}
                </div>
              </div>
              <div className="profile-facts"><div><span>MEMBER SINCE</span><strong>{formatDate(profile.createdAt, { month: "short", year: "numeric" })}</strong><small>{accountAge(profile.createdAt)} on GitHub</small></div><div><span>FOLLOWERS</span><strong>{formatCount(profile.followers)}</strong><small>{formatCount(profile.following)} following</small></div><div><span>PUBLIC WORK</span><strong>{formatCount(profile.publicRepos)}</strong><small>repositories owned</small></div></div>
            </div>

            <div className="tabbar" role="tablist" aria-label="Profile sections">
              {tabs.map((tab) => <button role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => { setActiveTab(tab); if (tab === "Issues") setActiveStatus("open"); else if (tab === "Pull requests") setActiveStatus("open"); }} key={tab}>{tab}{tab === "Pull requests" ? <span>{formatCount(report.counts.pullRequests.open + report.counts.pullRequests.merged + report.counts.pullRequests.closed)}</span> : tab === "Issues" ? <span>{formatCount(report.counts.issues.open + report.counts.issues.closed)}</span> : null}</button>)}
              <span className="data-timestamp">UPDATED {formatDate(report.fetchedAt, { hour: "numeric", minute: "2-digit" }).toUpperCase()}</span>
            </div>

            {activeTab === "Overview" && <div className="overview">
              <div className="stats-grid">
                <StatCard icon="⑂" label="Pull requests" value={report.counts.pullRequests.open + report.counts.pullRequests.merged + report.counts.pullRequests.closed} detail={`${formatCount(report.counts.pullRequests.merged)} merged · ${formatCount(report.counts.pullRequests.open)} open`} />
                <StatCard icon="◇" label="Issues" value={report.counts.issues.open + report.counts.issues.closed} detail={`${formatCount(report.counts.issues.open)} open · ${formatCount(report.counts.issues.closed)} closed`} />
                <StatCard icon="◈" label="Repositories" value={report.counts.repositories} detail="with recent public contributions" />
                <StatCard icon="✳" label="Public gists" value={profile.publicGists} detail="shared snippets" />
              </div>
              <div className="overview-columns">
                <section className="content-card contribution-card"><SectionHeading eyebrow="WHERE THE WORK HAPPENS" title="Contribution map" action={<button className="text-action" onClick={() => setActiveTab("Repositories")}>All repositories <span>→</span></button>} /><ContributionTable repositories={report.contributionRepositories.slice(0, 7)} /></section>
                <section className="content-card activity-card"><SectionHeading eyebrow="THE LATEST" title="Recent activity" action={<button className="text-action" onClick={() => setActiveTab("Activity")}>Full activity <span>→</span></button>} /><ActivityList items={report.recentActivity.slice(0, 5)} /></section>
              </div>
              <div className="overview-footnote"><span>ⓘ</span> Activity reflects public GitHub data. Search results include up to {report.resultLimit} recent items per status; totals are from GitHub.</div>
            </div>}

            {(activeTab === "Pull requests" || activeTab === "Issues") && <section className="content-card full-list">
              <SectionHeading eyebrow={activeTab === "Pull requests" ? "WORK IN REVIEW" : "CONVERSATIONS & TRACKING"} title={activeTab} action={<span className="results-count">{formatCount(selectedItems.length)} latest results</span>} />
              <div className="status-switcher">{statusOptions[activeTab].map((status) => <button key={status} className={activeStatus === status ? "selected" : ""} onClick={() => setActiveStatus(status)}>{status === "merged" ? "Merged" : status[0].toUpperCase() + status.slice(1)}<span>{formatCount(report[activeTab === "Pull requests" ? "pullRequests" : "issues"][status].total)}</span></button>)}</div>
              <WorkList items={selectedItems} emptyLabel={`No ${activeStatus} ${activeTab.toLowerCase()} found.`} type={activeTab} />
              {report[activeTab === "Pull requests" ? "pullRequests" : "issues"][activeStatus].total > selectedItems.length && <p className="limit-note">Showing the {selectedItems.length} most recently updated results for this status.</p>}
            </section>}

            {activeTab === "Repositories" && <section className="content-card full-list"><SectionHeading eyebrow="PROJECT FOOTPRINT" title="Repositories" action={<span className="results-count">{report.contributionRepositories.length} with contributions</span>} /><ContributionTable repositories={report.contributionRepositories} />            <div className="owned-repos"><SectionHeading eyebrow="PERSONAL PROJECTS" title="Repositories owned" action={<span className="results-count">{report.ownedRepositories.length} recent</span>} /><div className="owned-grid">{report.ownedRepositories.slice(0, 12).map((repository) => <a className="owned-card" href={repository.url} target="_blank" rel="noreferrer" key={repository.name}><strong><RepoAvatar repository={repository.name} /><span>{repository.name.split("/").pop()}</span><LinkIcon /></strong><span>{repository.description || "No description provided."}</span><small>{repository.language && <i>{repository.language}</i>}<span>★ {formatCount(repository.stars)}</span></small></a>)}</div></div></section>}

            {activeTab === "Activity" && <section className="content-card full-list"><SectionHeading eyebrow="PUBLIC EVENT STREAM" title="Recent activity" action={<span className="results-count">{report.recentActivity.length} recent events</span>} /><ActivityList items={report.recentActivity} /><p className="limit-note">GitHub exposes a limited window of recent public events. This is not a complete contribution calendar.</p></section>}

            <footer className="report-footer"><span>Profile data is public and fetched live from GitHub.</span><span>Last fetched {formatDate(report.fetchedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></footer>
          </section>
        )}
      </main>

      <footer className="site-footer"><a href="/" className="brand brand-small"><span className="brand-glyph">g</span><span>profile<span className="brand-light">index</span></span></a><span className="creator-credit">Made by <a href="https://github.com/DivyaRaval1909" target="_blank" rel="noreferrer">Divya Raval <LinkIcon /></a></span><span>PUBLIC DATA, HUMAN CONTEXT.</span></footer>
    </div>
  );
}

export default App;
