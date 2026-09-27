import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  FaArrowRight,
  FaCalendarAlt,
  FaCheckCircle,
  FaFlag,
  FaFire,
  FaTrophy,
  FaUsers,
  FaShieldAlt,
  FaClock,
  FaPlay
} from "react-icons/fa";

const CATEGORIES = [
  "Web Exploitation",
  "Cryptography",
  "Forensics",
  "Reverse Engineering",
  "Pwn/Binary Exploitation",
  "OSINT",
  "Steganography",
  "Misc"
];

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diffSec = Math.max(1, Math.floor((new Date() - new Date(dateStr)) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export default function Dashboard({ user, onNavigate }) {
  const [challenges, setChallenges] = useState([]);
  const [events, setEvents] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/challenges"),
      api.get("/events"),
      api.get("/activity/feed?limit=8").catch(() => ({ data: { feed: [] } }))
    ])
      .then(([c, e, a]) => {
        setChallenges(c.data.challenges || []);
        setEvents(e.data.events || []);
        setActivity(a.data?.feed || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const solved = challenges.filter(c => c.is_solved).length;
  const total = challenges.length;
  const progress = total ? Math.round((solved / total) * 100) : 0;
  const liveEvent = events.find(e => e.status === "active") || events.find(e => e.status === "upcoming");

  // Next unsolved challenge to continue
  const continueChallenge = useMemo(() => {
    return challenges.find(c => !c.is_solved) || challenges[0] || null;
  }, [challenges]);

  // Recommended challenges: 5 unsolved challenges with high acceptance
  const recommendedChallenges = useMemo(() => {
    return challenges
      .filter(c => !c.is_solved)
      .slice(0, 5);
  }, [challenges]);

  const categoryStats = useMemo(() => {
    const skillsMap = {};
    if (user?.skills && Array.isArray(user.skills)) {
      user.skills.forEach(sk => {
        skillsMap[sk.category] = sk;
      });
    }
    return CATEGORIES.map(category => {
      const list = challenges.filter(c => c.category === category);
      const sk = skillsMap[category];
      const solvedCount = sk ? sk.solved_challenges : list.filter(c => c.is_solved).length;
      const totalCount = sk ? sk.total_challenges || list.length : list.length;
      const points = sk ? sk.points_earned : 0;
      const pct = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;
      return { category, total: totalCount, solved: solvedCount, points, pct };
    });
  }, [challenges, user?.skills]);

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Good morning" : currentHour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.name ? user.name.split(" ")[0] : "Student";
  const streakDays = user?.streak_days || 1;

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-skeleton">
          <div className="skeleton-banner" />
          <div className="skeleton-grid-4" />
          <div className="skeleton-content-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* 1. Welcome & Continue Action */}
      <section className="dashboard-header-card">
        <div className="header-card-copy">
          <div className="header-pill">
            <span className="dot-live" /> OWASP PCCOE CTF Academy
          </div>
          <h1>{greeting}, {firstName}</h1>
          <p className="header-subtitle">
            Continue solving challenges and climb the community leaderboard.
          </p>
        </div>
        <div className="header-card-cta">
          {continueChallenge ? (
            <button
              className="btn-primary"
              onClick={() => onNavigate("challenges")}
            >
              <FaPlay className="btn-icon" /> Continue Challenge
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => onNavigate("challenges")}
            >
              <FaFlag className="btn-icon" /> Browse Challenges
            </button>
          )}
        </div>
      </section>

      {/* 2. Progress Overview (5 compact metrics) */}
      <section className="metrics-strip">
        <div className="metric-box">
          <span className="metric-label">Solved</span>
          <div className="metric-value-wrap">
            <span className="metric-value">{user.challenges_solved || solved}</span>
            <span className="metric-sub">/ {total}</span>
          </div>
          <div className="metric-progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="metric-box">
          <span className="metric-label">Points</span>
          <div className="metric-value-wrap">
            <span className="metric-value">{user.points?.toLocaleString() || 0}</span>
            <span className="metric-sub">XP</span>
          </div>
          <span className="metric-hint">Official Academy Score</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Global Rank</span>
          <div className="metric-value-wrap">
            <span className="metric-value rank-val">#{user.global_rank || "—"}</span>
          </div>
          <span className="metric-hint">Overall Standings</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">College Rank</span>
          <div className="metric-value-wrap">
            <span className="metric-value rank-val">#{user.college_rank || "—"}</span>
          </div>
          <span className="metric-hint">{user.college || "Campus Standings"}</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Daily Streak</span>
          <div className="metric-value-wrap">
            <span className="metric-value">{streakDays}</span>
            <span className="metric-sub">days</span>
          </div>
          <span className="metric-hint">Solve daily to maintain</span>
        </div>
      </section>

      {/* 3. Continue Learning & Event Banner */}
      <div className="dashboard-main-columns">
        <div className="dashboard-col-left">
          {continueChallenge && (
            <div className="card continue-card">
              <div className="card-header-clean">
                <span className="section-kicker">CONTINUE LEARNING</span>
                <span className="subtle-badge">{continueChallenge.category}</span>
              </div>
              <div className="continue-body">
                <div>
                  <h3 className="continue-title">{continueChallenge.title}</h3>
                  <div className="continue-meta">
                    <span className={`diff-pill ${(continueChallenge.difficulty || "easy").toLowerCase()}`}>
                      {continueChallenge.difficulty}
                    </span>
                    <span className="meta-sep">·</span>
                    <span className="points-text">{continueChallenge.points} points</span>
                    <span className="meta-sep">·</span>
                    <span className="meta-muted">{continueChallenge.solves_count || 0} solves</span>
                  </div>
                </div>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => onNavigate("challenges")}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Recommended Challenges Table */}
          <div className="card">
            <div className="card-header-clean">
              <div>
                <h3 className="card-title">Recommended Challenges</h3>
                <span className="card-desc">Curated problems to practice next</span>
              </div>
              <button
                className="btn-link"
                onClick={() => onNavigate("challenges")}
              >
                View all <FaArrowRight />
              </button>
            </div>

            <div className="table-responsive">
              <table className="clean-table">
                <thead>
                  <tr>
                    <th style={{ width: "36px" }}>Status</th>
                    <th>Challenge</th>
                    <th>Category</th>
                    <th>Difficulty</th>
                    <th style={{ textAlign: "right" }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendedChallenges.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="table-empty">
                        All recommended challenges solved! Explore other categories.
                      </td>
                    </tr>
                  ) : (
                    recommendedChallenges.map(c => (
                      <tr
                        key={c.id}
                        className="clickable-row"
                        onClick={() => onNavigate("challenges")}
                      >
                        <td className="status-cell">
                          {c.is_solved ? (
                            <span className="status-solved" title="Solved">✓</span>
                          ) : (
                            <span className="status-unsolved" title="Unsolved">○</span>
                          )}
                        </td>
                        <td className="chall-name-cell">
                          <b>{c.title}</b>
                        </td>
                        <td>
                          <span className="category-cell-pill">{c.category}</span>
                        </td>
                        <td>
                          <span className={`diff-pill ${(c.difficulty || "easy").toLowerCase()}`}>
                            {c.difficulty}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }} className="mono-points">
                          {c.points}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Domain Mastery Matrix */}
          <div className="card">
            <div className="card-header-clean">
              <div>
                <h3 className="card-title">Category Progress</h3>
                <span className="card-desc">Domain breakdown across all security tracks (click track to practice)</span>
              </div>
              <span className="card-metric-total">{solved} / {total} Total</span>
            </div>

            <div className="category-matrix">
              {categoryStats.map(cat => (
                <div
                  key={cat.category}
                  className="cat-matrix-item clickable-cat-item"
                  onClick={() => {
                    localStorage.setItem("ctf_filter_category", cat.category);
                    onNavigate("challenges");
                  }}
                  title={`Open practice arena for ${cat.category}`}
                >
                  <div className="cat-matrix-header">
                    <span className="cat-name">{cat.category}</span>
                    <span className="cat-numbers">
                      {cat.solved}/{cat.total} <small>({cat.pct}%)</small>
                    </span>
                  </div>
                  <div className="cat-matrix-bar">
                    <div
                      className="cat-matrix-fill"
                      style={{ width: `${cat.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar Column: Competition & Recent Solves Feed */}
        <div className="dashboard-col-right">
          {/* Competition Panel */}
          <div className="card event-card">
            <div className="card-header-clean">
              <span className="section-kicker">COMPETITION ARENA</span>
              <FaCalendarAlt className="text-muted" />
            </div>

            {liveEvent ? (
              <div className="event-box">
                <div className="event-status-badge-wrap">
                  <span className={`status-pill ${liveEvent.status}`}>
                    {liveEvent.status === "active" ? "LIVE NOW" : "UPCOMING"}
                  </span>
                </div>
                <h4 className="event-name">{liveEvent.name}</h4>
                <p className="event-desc">{liveEvent.description}</p>
                <div className="event-meta-list">
                  <div>
                    <span className="meta-label">Participants:</span>
                    <b>{liveEvent.participants_count || 0}</b>
                  </div>
                  <div>
                    <span className="meta-label">Challenges:</span>
                    <b>{liveEvent.challenge_count || 0}</b>
                  </div>
                </div>
                <button
                  className="btn-primary btn-block"
                  onClick={() => onNavigate("events")}
                >
                  Enter Event Arena
                </button>
              </div>
            ) : (
              <div className="empty-event-box">
                <FaShieldAlt className="empty-shield" />
                <p>No active competitions right now. Practice in the Challenge Arena or prepare with your squad.</p>
              </div>
            )}
          </div>

          {/* Recent Live Solves Activity Feed */}
          <div className="card">
            <div className="card-header-clean">
              <div>
                <h3 className="card-title">Recent Activity</h3>
                <span className="card-desc">Live community solves</span>
              </div>
              <span className="live-indicator">
                <span className="live-dot" /> LIVE
              </span>
            </div>

            <div className="activity-clean-list">
              {activity.length === 0 ? (
                <div className="empty-subtle">No recent solves recorded yet.</div>
              ) : (
                activity.slice(0, 6).map(item => (
                  <div key={item.id} className="activity-row">
                    <div className="activity-icon-wrap">
                      {item.is_first_blood ? (
                        <span className="fb-tag" title="First Blood">🩸</span>
                      ) : (
                        <FaCheckCircle className="solve-check-icon" />
                      )}
                    </div>
                    <div className="activity-info">
                      <div className="activity-title-line">
                        <span className="solver-handle">{item.user_name}</span>
                        <span className="activity-action">solved</span>
                        <b className="activity-chall">{item.challenge_title}</b>
                      </div>
                      <div className="activity-sub-line">
                        <span className="activity-pts">+{item.points} pts</span>
                        <span className="activity-dot">·</span>
                        <span className="activity-time">{timeAgo(item.submitted_at)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Community Squad Hub Quick Link */}
          <div className="card squad-quick-card">
            <div className="squad-quick-body">
              <FaUsers className="squad-icon" />
              <div>
                <h4>Collaborate in Squads</h4>
                <p>Team up with fellow students, share invite codes, and enter tournament arenas together.</p>
              </div>
            </div>
            <button
              className="btn-secondary btn-block btn-sm"
              onClick={() => onNavigate("squads")}
            >
              Open Squad Hub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
