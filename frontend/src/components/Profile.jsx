import React, { useState, useEffect, useMemo } from "react";
import { api } from "../api";
import {
  FaUser,
  FaTrophy,
  FaAward,
  FaMedal,
  FaCheckCircle,
  FaFire,
  FaCalendarAlt,
  FaGithub,
  FaUniversity,
  FaFlag,
  FaLock,
  FaGlobe,
  FaCode,
  FaSearch,
  FaSkullCrossbones,
  FaUserSecret,
  FaEdit,
  FaTimes,
  FaShareAlt,
  FaChartPie,
  FaBars
} from "react-icons/fa";

function RadarChart({ categoryBreakdown }) {
  const categories = [
    "Web Exploitation",
    "Cryptography",
    "Forensics",
    "Reverse Engineering",
    "Pwn/Binary Exploitation",
    "OSINT",
    "Steganography",
    "Misc"
  ];

  const size = 300;
  const center = size / 2;
  const radius = 95;
  const angleStep = (Math.PI * 2) / categories.length;
  const levels = [0.25, 0.5, 0.75, 1.0];

  const points = categories.map((cat, i) => {
    const data = categoryBreakdown[cat] || { total: 0, solved: 0 };
    const pct = data.total > 0 ? data.solved / data.total : 0;
    const r = radius * Math.max(0.12, pct);
    const angle = i * angleStep - Math.PI / 2;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
      pct: Math.round(pct * 100),
      solved: data.solved,
      total: data.total,
      cat
    };
  });

  const polygonPath = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const shortNames = {
    "Web Exploitation": "Web",
    "Cryptography": "Crypto",
    "Forensics": "Forensics",
    "Reverse Engineering": "Rev",
    "Pwn/Binary Exploitation": "Pwn",
    "OSINT": "OSINT",
    "Steganography": "Stego",
    "Misc": "Misc"
  };

  return (
    <div className="radar-chart-container" style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radar-chart-svg">
        {levels.map((lvl, lvlIdx) => {
          const lvlPoints = categories.map((_, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const x = center + (radius * lvl) * Math.cos(angle);
            const y = center + (radius * lvl) * Math.sin(angle);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ");

          return (
            <polygon
              key={lvlIdx}
              points={lvlPoints}
              fill={lvlIdx === levels.length - 1 ? "rgba(18, 20, 31, 0.6)" : "none"}
              stroke="#1e2235"
              strokeWidth="1"
              strokeDasharray={lvlIdx < levels.length - 1 ? "3,3" : "none"}
            />
          );
        })}

        {categories.map((cat, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);
          return (
            <line
              key={cat}
              x1={center}
              y1={center}
              x2={x.toFixed(1)}
              y2={y.toFixed(1)}
              stroke="#2d3450"
              strokeWidth="1"
            />
          );
        })}

        <polygon
          points={polygonPath}
          fill="rgba(0, 255, 102, 0.2)"
          stroke="#00ff66"
          strokeWidth="2"
        />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x.toFixed(1)}
            cy={p.y.toFixed(1)}
            r="3.5"
            fill="#00ff66"
            stroke="#08090d"
            strokeWidth="1.5"
          />
        ))}

        {categories.map((cat, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const labelDist = radius + 22;
          const x = center + labelDist * Math.cos(angle);
          const y = center + labelDist * Math.sin(angle);
          const data = categoryBreakdown[cat] || { total: 0, solved: 0 };
          const cos = Math.cos(angle);

          return (
            <text
              key={cat}
              x={x.toFixed(1)}
              y={(y + 4).toFixed(1)}
              textAnchor={Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end"}
              fill="#94a3b8"
              fontSize="10"
              fontFamily="var(--font-heading)"
              fontWeight="600"
            >
              {shortNames[cat] || cat} ({data.solved})
            </text>
          );
        })}
      </svg>
    </div>
  );
}

const ICON_MAP = {
  FaTrophy,
  FaAward,
  FaFlag,
  FaMedal,
  FaGlobe,
  FaLock,
  FaSearch,
  FaCode,
  FaSkullCrossbones,
  FaUserSecret
};

export default function Profile({ targetUserId, currentUserId, onBackToPractice }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", college: "", github: "", bio: "", profile_photo: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [editError, setEditError] = useState("");
  const [hoveredCell, setHoveredCell] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [breakdownView, setBreakdownView] = useState("both");

  const effectiveUserId = targetUserId || currentUserId;
  const isOwner = effectiveUserId === currentUserId;

  const handleShareProfile = () => {
    const url = `${window.location.origin}/?user=${effectiveUserId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const startEditing = () => {
    setEditForm({
      name: profile?.name || "",
      college: profile?.college || "",
      github: profile?.github || "",
      bio: profile?.bio || "",
      profile_photo: profile?.profile_photo || ""
    });
    setEditMsg("");
    setEditError("");
    setEditing(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setEditBusy(true);
    setEditMsg("");
    setEditError("");
    try {
      const res = await api.put("/auth/profile", editForm);
      setProfile(prev => ({
        ...prev,
        name: res.data.user.name,
        college: res.data.user.college,
        github: res.data.user.github,
        bio: res.data.user.bio,
        profile_photo: res.data.user.profile_photo
      }));
      setEditMsg("Profile updated successfully!");
      setTimeout(() => setEditing(false), 800);
    } catch (err) {
      setEditError(err.response?.data?.detail || "Failed to update profile");
    } finally {
      setEditBusy(false);
    }
  };

  useEffect(() => {
    if (!effectiveUserId) return;
    setLoading(true);
    api.get(`/users/${effectiveUserId}/profile`)
      .then(res => setProfile(res.data.profile))
      .catch(err => console.error("Error loading profile:", err))
      .finally(() => setLoading(false));
  }, [effectiveUserId]);

  // Compute 16-week contribution heatmap
  const heatmapGrid = useMemo(() => {
    const days = [];
    const countMap = {};

    if (profile?.recent_solves) {
      profile.recent_solves.forEach(s => {
        if (!s.solved_at) return;
        const dStr = s.solved_at.split("T")[0];
        countMap[dStr] = (countMap[dStr] || 0) + 1;
      });
    }

    // 16 weeks = 112 days
    const totalDays = 112;
    const today = new Date();
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      const count = countMap[iso] || 0;
      days.push({
        date: iso,
        count,
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      });
    }
    return days;
  }, [profile]);

  const difficultyStats = useMemo(() => {
    const counts = { Easy: 0, Medium: 0, Hard: 0, Insane: 0 };
    if (profile?.recent_solves) {
      profile.recent_solves.forEach(s => {
        const d = s.difficulty || "Easy";
        if (counts[d] !== undefined) counts[d]++;
        else counts.Easy++;
      });
    }
    return counts;
  }, [profile]);

  if (loading) {
    return (
      <div className="profile-page">
        <div className="table-skeleton-wrap">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="card empty-card">
        <h3>User Profile Not Found</h3>
        <p>The requested cybersecurity profile could not be loaded.</p>
        <button className="btn-primary btn-sm" onClick={onBackToPractice}>
          Back to Challenges
        </button>
      </div>
    );
  }

  const categoryBreakdown = profile.category_breakdown || {};
  const categoriesList = Object.keys(categoryBreakdown);
  const totalSolved = profile.challenges_solved || 0;

  return (
    <div className="profile-page">
      <div className="platform-breadcrumb">
        <span className="breadcrumb-link" onClick={onBackToPractice}>
          OWASP PCCOE CTF Academy
        </span>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-active">Student Profile</span>
      </div>

      <div className="profile-layout-grid">
        {/* Left Column: User Card & Stats */}
        <div className="profile-left-col">
          <div className="card user-identity-card">
            <div className="user-avatar-wrap">
              {profile.profile_photo ? (
                <img
                  src={profile.profile_photo}
                  alt={profile.name}
                  className="profile-avatar-large"
                />
              ) : (
                <div className="profile-avatar-placeholder">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="user-info-block">
              <h2 className="user-display-name">{profile.name}</h2>
              <div className="profile-community-affiliation">
                <img
                  src="/branding/owasp-pccoe-logo.png"
                  alt="OWASP PCCOE"
                  className="affiliation-logo"
                />
                <div className="affiliation-text">
                  <span className="affiliation-title">OWASP PCCOE CTF Academy</span>
                  <span className="affiliation-sub">Student Chapter Member</span>
                </div>
              </div>

              {profile.bio && <p className="user-bio-text">{profile.bio}</p>}

              <div className="user-meta-lines">
                <div className="meta-line">
                  <FaUniversity className="meta-icon" />
                  <span>{profile.college || "PCCOE / Independent"}</span>
                </div>
                {profile.github && (
                  <div className="meta-line">
                    <FaGithub className="meta-icon" />
                    <a
                      href={`https://github.com/${profile.github.replace("@", "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="github-link"
                    >
                      {profile.github}
                    </a>
                  </div>
                )}
              </div>

              {isOwner && (
                <button className="btn-secondary btn-block btn-sm edit-profile-btn" onClick={startEditing}>
                  <FaEdit /> Edit Profile
                </button>
              )}

              <button
                className="btn-secondary btn-block btn-sm share-profile-btn"
                onClick={handleShareProfile}
                style={{ marginTop: isOwner ? "8px" : "12px" }}
              >
                <FaShareAlt /> {copiedLink ? "Profile Link Copied! ✓" : "Share Public Profile"}
              </button>
            </div>

            <div className="profile-stat-numbers profile-stat-numbers-5">
              <div className="p-stat-box">
                <div className="p-stat-header">
                  <FaGlobe className="p-stat-icon" />
                  <span className="p-stat-label">Global Rank</span>
                </div>
                <b className="p-stat-val">#{profile.global_rank || "—"}</b>
              </div>
              <div className="p-stat-box">
                <div className="p-stat-header">
                  <FaUniversity className="p-stat-icon" />
                  <span className="p-stat-label">College Rank</span>
                </div>
                <b className="p-stat-val">#{profile.college_rank || "—"}</b>
              </div>
              <div className="p-stat-box">
                <div className="p-stat-header">
                  <FaTrophy className="p-stat-icon pts-icon" />
                  <span className="p-stat-label">Points</span>
                </div>
                <b className="p-stat-val">{profile.points?.toLocaleString() || 0}</b>
              </div>
              <div className="p-stat-box">
                <div className="p-stat-header">
                  <FaFlag className="p-stat-icon flag-icon" />
                  <span className="p-stat-label">Solved</span>
                </div>
                <b className="p-stat-val">{totalSolved}</b>
              </div>
              <div className="p-stat-box p-stat-box-full">
                <div className="p-stat-header">
                  <FaFire className="p-stat-icon fire-icon" />
                  <span className="p-stat-label">Current Streak</span>
                </div>
                <b className="p-stat-val">{profile.streak_days || 1} day{(profile.streak_days || 1) === 1 ? "" : "s"}</b>
              </div>
            </div>
          </div>

          {/* Difficulty Solved Breakdown (LeetCode style) */}
          <div className="card profile-difficulty-card">
            <div className="card-header-clean">
              <div>
                <h3 className="card-title">Solved by Difficulty</h3>
                <span className="card-desc">LeetCode-style breakdown</span>
              </div>
              <span className="card-metric-total">{totalSolved} Total</span>
            </div>

            <div className="difficulty-breakdown-grid">
              <div className="diff-stat-item easy">
                <div className="diff-stat-top">
                  <span className="diff-name">Easy</span>
                  <b className="diff-count">{difficultyStats.Easy}</b>
                </div>
                <div className="diff-stat-bar">
                  <div className="diff-stat-fill easy" style={{ width: `${Math.min(100, (difficultyStats.Easy / Math.max(1, totalSolved)) * 100)}%` }} />
                </div>
              </div>

              <div className="diff-stat-item medium">
                <div className="diff-stat-top">
                  <span className="diff-name">Medium</span>
                  <b className="diff-count">{difficultyStats.Medium}</b>
                </div>
                <div className="diff-stat-bar">
                  <div className="diff-stat-fill medium" style={{ width: `${Math.min(100, (difficultyStats.Medium / Math.max(1, totalSolved)) * 100)}%` }} />
                </div>
              </div>

              <div className="diff-stat-item hard">
                <div className="diff-stat-top">
                  <span className="diff-name">Hard</span>
                  <b className="diff-count">{difficultyStats.Hard}</b>
                </div>
                <div className="diff-stat-bar">
                  <div className="diff-stat-fill hard" style={{ width: `${Math.min(100, (difficultyStats.Hard / Math.max(1, totalSolved)) * 100)}%` }} />
                </div>
              </div>

              <div className="diff-stat-item insane">
                <div className="diff-stat-top">
                  <span className="diff-name">Insane</span>
                  <b className="diff-count">{difficultyStats.Insane}</b>
                </div>
                <div className="diff-stat-bar">
                  <div className="diff-stat-fill insane" style={{ width: `${Math.min(100, (difficultyStats.Insane / Math.max(1, totalSolved)) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Breakdown, Heatmap, Badges, Recent Solves */}
        <div className="profile-right-col">
          {/* Domain Solved Breakdown (LeetCode style) */}
          <div className="card">
            <div className="card-header-clean">
              <div>
                <h3 className="card-title">Category Strength & Proficiency</h3>
                <span className="card-desc">Domain mastery spider chart and solve progress</span>
              </div>
              <div className="tab-pill-group" style={{ gap: "4px" }}>
                <button
                  className={`tab-pill ${breakdownView === "radar" || breakdownView === "both" ? "active" : ""}`}
                  onClick={() => setBreakdownView(v => v === "radar" ? "both" : "radar")}
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  <FaChartPie /> Radar
                </button>
                <button
                  className={`tab-pill ${breakdownView === "bars" || breakdownView === "both" ? "active" : ""}`}
                  onClick={() => setBreakdownView(v => v === "bars" ? "both" : "bars")}
                  style={{ padding: "3px 8px", fontSize: "11px" }}
                >
                  <FaBars /> Bars
                </button>
              </div>
            </div>

            {(breakdownView === "radar" || breakdownView === "both") && (
              <RadarChart categoryBreakdown={categoryBreakdown} />
            )}

            {(breakdownView === "bars" || breakdownView === "both") && (
              <div className="profile-category-bars" style={{ marginTop: breakdownView === "both" ? "14px" : "0" }}>
                {categoriesList.length === 0 ? (
                  <p className="empty-subtle">No challenge progress recorded yet.</p>
                ) : (
                  categoriesList.map(cat => {
                    const data = categoryBreakdown[cat] || { total: 0, solved: 0 };
                    const pct = data.total > 0 ? Math.round((data.solved / data.total) * 100) : 0;
                    return (
                      <div key={cat} className="category-bar-row">
                        <div className="cat-bar-header">
                          <span className="cat-bar-name">{cat}</span>
                          <span className="cat-bar-count">
                            <b>{data.solved}</b> / {data.total}
                          </span>
                        </div>
                        <div className="cat-bar-track">
                          <div
                            className="cat-bar-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Activity Heatmap (GitHub / LeetCode style) */}
          <div className="card">
            <div className="card-header-clean">
              <div>
                <h3 className="card-title">Activity Heatmap</h3>
                <span className="card-desc">Daily challenge submissions & solves</span>
              </div>
              <span className="heatmap-streak-tag">
                <FaFire className="fire-icon-subtle" /> {profile.streak_days || 1} day streak
              </span>
            </div>

            <div className="heatmap-container">
              <div className="heatmap-grid">
                {heatmapGrid.map(cell => {
                  let levelClass = "level-0";
                  if (cell.count === 1) levelClass = "level-1";
                  else if (cell.count === 2) levelClass = "level-2";
                  else if (cell.count >= 3) levelClass = "level-3";

                  return (
                    <div
                      key={cell.date}
                      className={`heatmap-cell ${levelClass}`}
                      onMouseEnter={() => setHoveredCell(cell)}
                      onMouseLeave={() => setHoveredCell(null)}
                      title={`${cell.label}: ${cell.count} solve${cell.count === 1 ? "" : "s"}`}
                    />
                  );
                })}
              </div>

              <div className="heatmap-footer">
                <span className="heatmap-tooltip-display">
                  {hoveredCell
                    ? `${hoveredCell.label}: ${hoveredCell.count} challenges solved`
                    : "Hover over a day to view activity"}
                </span>

                <div className="heatmap-legend">
                  <small>Less</small>
                  <span className="heatmap-cell level-0" />
                  <span className="heatmap-cell level-1" />
                  <span className="heatmap-cell level-2" />
                  <span className="heatmap-cell level-3" />
                  <small>More</small>
                </div>
              </div>
            </div>
          </div>

          {/* Badges Showcase */}
          <div className="card">
            <div className="card-header-clean">
              <h3 className="card-title">Earned Badges</h3>
              <span className="card-desc">Recognitions & achievements</span>
            </div>

            <div className="badges-compact-grid">
              {profile.badges && profile.badges.length > 0 ? (
                profile.badges.map(b => {
                  const IconComp = ICON_MAP[b.icon] || FaAward;
                  return (
                    <div
                      key={b.id}
                      className={`badge-pill-item ${b.unlocked ? "unlocked" : "locked"}`}
                      title={b.description}
                    >
                      <IconComp className="badge-pill-icon" />
                      <div className="badge-pill-copy">
                        <span className="badge-name">{b.name}</span>
                        <span className="badge-status">
                          {b.unlocked ? "Unlocked" : "Locked"}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="empty-subtle">No badges unlocked yet. Solve challenges to earn badges.</p>
              )}
            </div>
          </div>

          {/* Recent Solves Table */}
          <div className="card">
            <div className="card-header-clean">
              <h3 className="card-title">Recent Solves</h3>
              <span className="card-desc">Latest captured flags</span>
            </div>

            <div className="table-responsive">
              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Challenge</th>
                    <th>Category</th>
                    <th>Difficulty</th>
                    <th style={{ textAlign: "right" }}>Points</th>
                    <th style={{ textAlign: "right" }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {!profile.recent_solves || profile.recent_solves.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="table-empty">
                        No challenges solved yet. Visit the Challenges page to start!
                      </td>
                    </tr>
                  ) : (
                    profile.recent_solves.map((s, idx) => (
                      <tr key={s.id || idx}>
                        <td>
                          <b>{s.title}</b>
                        </td>
                        <td>
                          <span className="category-cell-pill">{s.category}</span>
                        </td>
                        <td>
                          <span className={`difficulty-tag ${(s.difficulty || "easy").toLowerCase()}`}>
                            {s.difficulty || "Easy"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }} className="mono-points">
                          +{s.points} pts
                        </td>
                        <td style={{ textAlign: "right" }} className="mono-date">
                          {s.solved_at ? s.solved_at.split("T")[0] : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(false)}>
          <div className="clean-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header-simple">
              <h3>Edit Profile</h3>
              <button className="modal-close-icon-btn" onClick={() => setEditing(false)}>
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="clean-form">
              {editMsg && <div className="alert-banner success">{editMsg}</div>}
              {editError && <div className="alert-banner error">{editError}</div>}

              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  className="clean-input"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>College / Affiliation</label>
                <input
                  type="text"
                  className="clean-input"
                  value={editForm.college}
                  onChange={e => setEditForm({ ...editForm, college: e.target.value })}
                  placeholder="Pimpri Chinchwad College of Engineering"
                />
              </div>

              <div className="form-group">
                <label>GitHub Username</label>
                <input
                  type="text"
                  className="clean-input"
                  value={editForm.github}
                  onChange={e => setEditForm({ ...editForm, github: e.target.value })}
                  placeholder="octocat"
                />
              </div>

              <div className="form-group">
                <label>Bio</label>
                <textarea
                  className="clean-textarea"
                  rows={3}
                  value={editForm.bio}
                  onChange={e => setEditForm({ ...editForm, bio: e.target.value })}
                  placeholder="Cybersecurity enthusiast, reverse engineer, CTF player..."
                />
              </div>

              <div className="form-group">
                <label>Profile Photo URL</label>
                <input
                  type="url"
                  className="clean-input"
                  value={editForm.profile_photo}
                  onChange={e => setEditForm({ ...editForm, profile_photo: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary btn-sm"
                  disabled={editBusy}
                >
                  {editBusy ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
