import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import {
  FaArrowRight,
  FaBolt,
  FaCalendarAlt,
  FaCheckCircle,
  FaFlag,
  FaFire,
  FaLayerGroup,
  FaTrophy,
  FaUsers,
  FaShieldAlt,
  FaTint
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
      api.get("/activity/feed?limit=6").catch(() => ({ data: { feed: [] } }))
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
  const progress = challenges.length ? Math.round((solved / challenges.length) * 100) : 0;
  const liveEvent = events.find(e => e.status === "active") || events.find(e => e.status === "upcoming");

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

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="hero-grid-bg" />
        <div className="dashboard-hero-copy">
          <span className="eyebrow"><FaBolt /> OPERATOR COMMAND CENTER</span>
          <h1>Welcome back, <span>{user.name.split(" ")[0]}</span>.</h1>
          <p>Train your offensive security skills, capture flags, achieve first bloods, and compete with the campus.</p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={() => onNavigate("challenges")}><FaFlag /> Enter Practice Arena</button>
            <button className="secondary-btn" onClick={() => onNavigate("events")}><FaCalendarAlt /> View Events</button>
          </div>
        </div>
        <div className="dashboard-terminal">
          <div className="terminal-bar"><span /><span /><span /><b>owasp@arena:~</b></div>
          <div className="terminal-body">
            <div><i>$ whoami</i></div><strong>{user.name.toLowerCase().replace(/\s+/g, ".")}</strong>
            <div><i>$ status --brief</i></div>
            <div className="terminal-ok">ONLINE · {user.points} PTS · {user.challenges_solved} FLAGS</div>
            <div><i>$ mission</i></div><div>Conquer vulnerabilities. Hunt first blood. Defend campus.</div>
            <span className="terminal-cursor">▌</span>
          </div>
        </div>
      </section>

      <section className="stat-strip">
        <div className="dashboard-stat"><span><FaTrophy /></span><div><small>GLOBAL RANK</small><b>#{user.global_rank || "—"}</b></div></div>
        <div className="dashboard-stat"><span><FaFlag /></span><div><small>FLAGS CAPTURED</small><b>{user.challenges_solved}</b></div></div>
        <div className="dashboard-stat"><span><FaFire /></span><div><small>SCORE</small><b>{user.points} XP</b></div></div>
        <div className="dashboard-stat"><span><FaLayerGroup /></span><div><small>ARENA PROGRESS</small><b>{progress}%</b></div></div>
      </section>

      <section className="dashboard-grid">
        <div className="panel-card progress-panel">
          <div className="panel-heading">
            <div>
              <span className="sub-tag">CYBER DOMAIN MASTERY</span>
              <h3>Skill & Category Matrix</h3>
            </div>
            <button className="text-btn" onClick={() => onNavigate("challenges")}>
              Open arena <FaArrowRight />
            </button>
          </div>
          <div className="overall-progress">
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <b>{solved}/{challenges.length} ({progress}%)</b>
          </div>
          <div className="category-grid">
            {categoryStats.map(s => (
              <div className="category-mini" key={s.category}>
                <div>
                  <span>{s.category}</span>
                  <b>{s.solved}/{s.total} {s.points > 0 ? `· ${s.points} pts` : ""}</b>
                </div>
                <div className="mini-track">
                  <span style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card event-preview">
          <div className="panel-heading">
            <div>
              <span className="sub-tag">COMPETITION FEED</span>
              <h3>{liveEvent ? liveEvent.name : "No scheduled event"}</h3>
            </div>
            <FaCalendarAlt className="panel-icon" />
          </div>
          {liveEvent ? (
            <>
              <p>{liveEvent.description}</p>
              <div className="event-preview-meta">
                <span className={`status-badge ${liveEvent.status}`}>
                  {liveEvent.status === "active" ? "LIVE NOW" : "UPCOMING"}
                </span>
                <span><FaUsers /> {liveEvent.participants_count} participants</span>
                <span><FaFlag /> {liveEvent.challenge_count} challenges</span>
              </div>
              <button className="primary-btn full" onClick={() => onNavigate("events")}>
                Open competition center
              </button>
            </>
          ) : (
            <div className="empty-inline">
              <FaShieldAlt />
              <p>Admins can schedule the next campus competition from the command center.</p>
            </div>
          )}
        </div>
      </section>

      {/* Live Solves Activity Feed Section */}
      {activity.length > 0 && (
        <section className="dashboard-activity-feed">
          <div className="dash-activity-header">
            <div className="feed-title">
              <span className="live-dot-pulse" />
              <FaFire style={{ color: "#f59e0b" }} />
              <h3>Live CTF Solves Feed</h3>
            </div>
            <button className="text-btn" onClick={() => onNavigate("challenges")}>
              View challenge arena <FaArrowRight />
            </button>
          </div>
          <div className="dash-activity-grid">
            {activity.map(item => (
              <div key={item.id} className={`dash-activity-card ${item.is_first_blood ? "first-blood-card" : ""}`}>
                <div className="dash-act-top">
                  {item.is_first_blood ? (
                    <span className="dash-act-fb"><FaTint /> FIRST BLOOD</span>
                  ) : (
                    <span className="dash-act-category">{item.category || "General"}</span>
                  )}
                  <span className="dash-act-time">{timeAgo(item.submitted_at)}</span>
                </div>
                <div className="dash-act-chall">{item.challenge_title}</div>
                <div className="dash-act-footer">
                  <span className="dash-act-solver">
                    <b>{item.user_name}</b>
                    {item.team_name ? (
                      <small> [{item.team_name}]</small>
                    ) : item.college ? (
                      <small> ({item.college})</small>
                    ) : null}
                  </span>
                  <span className="dash-act-pts">+{item.points} pts</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-callout">
        <div>
          <span className="sub-tag">COMMUNITY</span>
          <h3>Build with your club, not just your score.</h3>
          <p>Create or join a squad, request team invites with notes, discuss solved challenges, and prepare for live events.</p>
        </div>
        <div className="callout-actions">
          <button className="secondary-btn" onClick={() => onNavigate("squads")}><FaUsers /> Teams & Squads</button>
          <button className="secondary-btn" onClick={() => onNavigate("notifications")}><FaCheckCircle /> Notifications</button>
        </div>
      </section>
    </div>
  );
}
