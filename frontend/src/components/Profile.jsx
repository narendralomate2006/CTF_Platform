import React, { useState, useEffect } from "react";
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
  FaTimes
} from "react-icons/fa";

// Map badge icons
const ICON_MAP = {
  FaTrophy: FaTrophy,
  FaAward: FaAward,
  FaFlag: FaFlag,
  FaMedal: FaMedal,
  FaGlobe: FaGlobe,
  FaLock: FaLock,
  FaSearch: FaSearch,
  FaCode: FaCode,
  FaSkullCrossbones: FaSkullCrossbones,
  FaUserSecret: FaUserSecret
};

export default function Profile({ targetUserId, currentUserId, onBackToPractice }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview"); // 'overview', 'solves', 'badges'
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", college: "", github: "", bio: "", profile_photo: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [editError, setEditError] = useState("");

  const effectiveUserId = targetUserId || currentUserId;

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
      setTimeout(() => setEditing(false), 900);
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

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p>Loading LeetCode hacker profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="empty-state">
        <h3>User Profile Not Found</h3>
        <button className="primary-btn" onClick={onBackToPractice}>
          Back to Practice
        </button>
      </div>
    );
  }

  // Categories for Radar Chart
  const categories = Object.keys(profile.category_breakdown || {});
  const numCats = categories.length || 8;
  const centerX = 160;
  const centerY = 160;
  const maxRadius = 110;

  // Compute Radar Polygon Points
  const radarPoints = categories.map((cat, idx) => {
    const angle = (2 * Math.PI * idx) / numCats - Math.PI / 2;
    const catData = profile.category_breakdown[cat] || { total: 1, solved: 0 };
    const ratio = catData.total > 0 ? Math.min(1, catData.solved / catData.total) : 0;
    // minimum visibility of 0.08
    const effectiveRatio = Math.max(0.08, ratio);
    const r = maxRadius * effectiveRatio;
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(" ");

  // Background Web concentric rings
  const webLevels = [0.25, 0.5, 0.75, 1.0];

  // Activity Heatmap generation (last 16 weeks / 112 days)
  const heatmapMap = {};
  (profile.activity_heatmap || []).forEach(item => {
    heatmapMap[item.date] = item.count;
  });

  const today = new Date();
  const daysGrid = [];
  for (let i = 111; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split("T")[0];
    const count = heatmapMap[dateKey] || 0;
    daysGrid.push({ date: dateKey, count });
  }

  const isSelf = currentUserId === profile.id;

  return (
    <div className="profile-page">
      {/* Header Profile Card */}
      <div className="profile-header-card">
        <div className="avatar-section">
          <div className="profile-avatar">
            {profile.profile_photo ? (
              <img src={profile.profile_photo} alt={profile.name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
          </div>
          {isSelf && <span className="self-badge">You</span>}
        </div>

        <div className="profile-main-info">
          <div className="name-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2>{profile.name}</h2>
              <span className="role-tag">{profile.role.toUpperCase()}</span>
            </div>
            {isSelf && (
              <button className="secondary-btn sm" onClick={startEditing}>
                <FaEdit /> Edit Profile
              </button>
            )}
          </div>

          <div className="meta-details">
            {profile.college && (
              <span className="meta-item">
                <FaUniversity className="meta-icon" /> {profile.college}
              </span>
            )}
            {profile.github && (
              <a
                href={`https://github.com/${profile.github}`}
                target="_blank"
                rel="noreferrer"
                className="meta-item link"
              >
                <FaGithub className="meta-icon" /> @{profile.github}
              </a>
            )}
            <span className="meta-item">
              <FaCalendarAlt className="meta-icon" /> Joined {new Date(profile.joined_at).toLocaleDateString()}
            </span>
          </div>

          {profile.bio && <p className="bio-text">{profile.bio}</p>}
        </div>

        {/* Highlight Score & Ranks */}
        <div className="profile-ranks-box">
          <div className="rank-stat">
            <span className="label">GLOBAL RANK</span>
            <span className="value gold">#{profile.global_rank || "—"}</span>
            <small>out of {profile.total_users} hackers</small>
          </div>

          {profile.college_rank && (
            <div className="rank-stat">
              <span className="label">COLLEGE RANK</span>
              <span className="value silver">#{profile.college_rank}</span>
              <small>{profile.college}</small>
            </div>
          )}

          <div className="rank-stat">
            <span className="label">TOTAL SCORE</span>
            <span className="value neon">{profile.points} <small>pts</small></span>
            <small>{profile.challenges_solved} challenges solved</small>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-nav-tabs">
        <button
          className={`prof-tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview & Skills
        </button>
        <button
          className={`prof-tab ${activeTab === "solves" ? "active" : ""}`}
          onClick={() => setActiveTab("solves")}
        >
          Solved Challenges ({profile.solved_challenges?.length || 0})
        </button>
        <button
          className={`prof-tab ${activeTab === "badges" ? "active" : ""}`}
          onClick={() => setActiveTab("badges")}
        >
          Badges & Achievements ({profile.badges?.length || 0})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & SKILL RADAR */}
      {activeTab === "overview" && (
        <div className="profile-overview-layout">
          {/* Radar Chart & Category Mastery */}
          <div className="profile-card radar-card">
            <h3>Category Skill Spider</h3>
            <p className="card-sub">Visual breakdown of mastery across all 8 security domains.</p>

            <div className="radar-container">
              <svg width="320" height="320" viewBox="0 0 320 320" className="radar-svg">
                {/* Concentric webs */}
                {webLevels.map((lvl, lIdx) => {
                  const pts = categories.map((_, idx) => {
                    const angle = (2 * Math.PI * idx) / numCats - Math.PI / 2;
                    const r = maxRadius * lvl;
                    const x = centerX + r * Math.cos(angle);
                    const y = centerY + r * Math.sin(angle);
                    return `${x},${y}`;
                  }).join(" ");
                  return (
                    <polygon
                      key={lIdx}
                      points={pts}
                      fill="none"
                      stroke="#203047"
                      strokeDasharray={lIdx < 3 ? "3,3" : "none"}
                    />
                  );
                })}

                {/* Spokes & Axis labels */}
                {categories.map((cat, idx) => {
                  const angle = (2 * Math.PI * idx) / numCats - Math.PI / 2;
                  const x2 = centerX + maxRadius * Math.cos(angle);
                  const y2 = centerY + maxRadius * Math.sin(angle);
                  const labelX = centerX + (maxRadius + 22) * Math.cos(angle);
                  const labelY = centerY + (maxRadius + 18) * Math.sin(angle);
                  const shortName = cat.split(" ")[0].replace("/Binary", "");
                  return (
                    <g key={cat}>
                      <line
                        x1={centerX}
                        y1={centerY}
                        x2={x2}
                        y2={y2}
                        stroke="#203047"
                        strokeWidth="1"
                      />
                      <text
                        x={labelX}
                        y={labelY}
                        fill="#899cb3"
                        fontSize="10"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontWeight="600"
                      >
                        {shortName}
                      </text>
                    </g>
                  );
                })}

                {/* User Radar Polygon */}
                <polygon
                  points={radarPoints}
                  fill="rgba(85, 214, 190, 0.35)"
                  stroke="#55d6be"
                  strokeWidth="2.5"
                />

                {/* Vertex Dots */}
                {categories.map((cat, idx) => {
                  const angle = (2 * Math.PI * idx) / numCats - Math.PI / 2;
                  const catData = profile.category_breakdown[cat] || { total: 1, solved: 0 };
                  const ratio = catData.total > 0 ? Math.min(1, catData.solved / catData.total) : 0;
                  const effectiveRatio = Math.max(0.08, ratio);
                  const r = maxRadius * effectiveRatio;
                  const x = centerX + r * Math.cos(angle);
                  const y = centerY + r * Math.sin(angle);
                  return (
                    <circle
                      key={`dot-${cat}`}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#55d6be"
                      stroke="#0d1a2a"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </svg>
            </div>

            {/* Category Progress Bars */}
            <div className="cat-bars-list">
              {categories.map(cat => {
                const data = profile.category_breakdown[cat] || { total: 0, solved: 0, points: 0 };
                const pct = data.total > 0 ? Math.round((data.solved / data.total) * 100) : 0;
                return (
                  <div key={cat} className="cat-bar-item">
                    <div className="cat-bar-header">
                      <span className="cat-name">{cat}</span>
                      <span className="cat-counts">
                        <b>{data.solved}</b> / {data.total} ({pct}%) · {data.points} pts
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity Heatmap & Recent Solves */}
          <div className="overview-right-column">
            {/* Activity Heatmap */}
            <div className="profile-card heatmap-card">
              <div className="card-header-row">
                <h3>Hacker Activity Heatmap</h3>
                <span className="streak-badge">
                  <FaFire /> {profile.challenges_solved} Total Solves
                </span>
              </div>
              <p className="card-sub">Daily submission consistency over the last 16 weeks.</p>

              <div className="heatmap-grid-container">
                <div className="heatmap-grid">
                  {daysGrid.map((d, i) => {
                    let level = "l0";
                    if (d.count === 1) level = "l1";
                    else if (d.count === 2) level = "l2";
                    else if (d.count >= 3) level = "l3";
                    return (
                      <div
                        key={i}
                        className={`heat-cell ${level}`}
                        title={`${d.date}: ${d.count} flag capture(s)`}
                      />
                    );
                  })}
                </div>
                <div className="heat-legend">
                  <small>Less</small>
                  <div className="heat-cell l0" />
                  <div className="heat-cell l1" />
                  <div className="heat-cell l2" />
                  <div className="heat-cell l3" />
                  <small>More</small>
                </div>
              </div>
            </div>

            {/* Top Earned Badges Preview */}
            <div className="profile-card">
              <h3>Earned Badges</h3>
              <div className="badges-compact-preview">
                {profile.badges?.length === 0 ? (
                  <p className="no-data">No badges earned yet. Solve challenges to unlock achievements!</p>
                ) : (
                  profile.badges.map(b => {
                    const IconComponent = ICON_MAP[b.icon] || FaTrophy;
                    return (
                      <div key={b.id} className="badge-chip">
                        <IconComponent className="badge-chip-icon" />
                        <div>
                          <b>{b.name}</b>
                          <small>{b.description}</small>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SOLVED CHALLENGES */}
      {activeTab === "solves" && (
        <div className="profile-card">
          <h3>Solved Challenge History</h3>
          <p className="card-sub">Chronological list of all successfully submitted flags.</p>

          {profile.solved_challenges?.length === 0 ? (
            <div className="empty-state">
              <FaFlag className="empty-icon" />
              <p>No challenges captured yet.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Challenge</th>
                    <th>Category</th>
                    <th>Difficulty</th>
                    <th>Points</th>
                    <th>Solved At</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.solved_challenges.map(s => (
                    <tr key={s.id}>
                      <td><b>{s.title}</b></td>
                      <td><span className="category-tag">{s.category}</span></td>
                      <td>
                        <span className={`difficulty-tag ${(s.difficulty || "easy").toLowerCase()}`}>
                          {s.difficulty}
                        </span>
                      </td>
                      <td><b className="points-text">+{s.points}</b></td>
                      <td><small>{new Date(s.solved_at).toLocaleString()}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ALL BADGES GALLERY */}
      {activeTab === "badges" && (
        <div className="profile-card">
          <h3>Achievements & Badges Gallery</h3>
          <p className="card-sub">Unlock unique accolades by conquering challenges and advancing your ranking.</p>

          <div className="badges-gallery-grid">
            {(profile.badges_gallery || []).map(b => {
              const IconComponent = ICON_MAP[b.icon] || FaTrophy;
              return (
                <div key={b.id} className={`badge-card ${b.is_earned ? "earned" : "locked"}`}>
                  <div className="badge-icon-box">
                    <IconComponent />
                  </div>
                  <div className="badge-details">
                    <h4>{b.name}</h4>
                    <p>{b.description}</p>
                    <span className="criteria-tag">Criteria: {b.criteria}</span>
                    <span className={`status-pill ${b.is_earned ? "earned" : "locked"}`}>
                      {b.is_earned ? <><FaCheckCircle /> Unlocked</> : <><FaLock /> Locked</>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(false)}>
          <div className="table-card" style={{ maxWidth: 500, width: "92%", margin: "auto", position: "relative" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3><FaEdit /> Edit Hacker Profile</h3>
              <button className="icon-action-btn" onClick={() => setEditing(false)}><FaTimes /></button>
            </div>
            {editMsg && <div className="alert-banner success" style={{ marginBottom: 12 }}>{editMsg}</div>}
            {editError && <div className="alert-banner error" style={{ marginBottom: 12 }}>{editError}</div>}
            <form onSubmit={handleSaveProfile}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Full Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  required
                  minLength={2}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>College / University</label>
                <input
                  type="text"
                  placeholder="e.g. PCCOE Pune"
                  value={editForm.college}
                  onChange={e => setEditForm({ ...editForm, college: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>GitHub Username</label>
                <input
                  type="text"
                  placeholder="e.g. octocat"
                  value={editForm.github}
                  onChange={e => setEditForm({ ...editForm, github: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Avatar / Profile Photo URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/photo.jpg"
                  value={editForm.profile_photo}
                  onChange={e => setEditForm({ ...editForm, profile_photo: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Bio / Security Focus</label>
                <textarea
                  rows={3}
                  placeholder="Tell others what you're researching..."
                  value={editForm.bio}
                  onChange={e => setEditForm({ ...editForm, bio: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="secondary-btn" onClick={() => setEditing(false)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={editBusy}>
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
