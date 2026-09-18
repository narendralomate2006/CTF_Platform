import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { FaArrowRight, FaBolt, FaCalendarAlt, FaCheckCircle, FaFlag, FaFire, FaLayerGroup, FaTrophy, FaUsers, FaShieldAlt } from "react-icons/fa";

const CATEGORIES = ["Web Exploitation", "Cryptography", "Forensics", "Reverse Engineering", "Pwn/Binary Exploitation", "OSINT", "Steganography", "Misc"];

export default function Dashboard({ user, onNavigate }) {
  const [challenges, setChallenges] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/challenges"), api.get("/events")])
      .then(([c, e]) => { setChallenges(c.data.challenges || []); setEvents(e.data.events || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const solved = challenges.filter(c => c.is_solved).length;
  const progress = challenges.length ? Math.round((solved / challenges.length) * 100) : 0;
  const liveEvent = events.find(e => e.status === "active") || events.find(e => e.status === "upcoming");
  const categoryStats = useMemo(() => CATEGORIES.map(category => {
    const list = challenges.filter(c => c.category === category);
    return { category, total: list.length, solved: list.filter(c => c.is_solved).length };
  }), [challenges]);

  return <div className="dashboard-page">
    <section className="dashboard-hero">
      <div className="hero-grid-bg" />
      <div className="dashboard-hero-copy">
        <span className="eyebrow"><FaBolt /> OPERATOR DASHBOARD</span>
        <h1>Welcome back, <span>{user.name.split(" ")[0]}</span>.</h1>
        <p>Train your offensive security skills, capture flags, build your profile, and compete with the campus.</p>
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
          <div><i>$ mission</i></div><div>Keep learning. Keep testing. Stay curious.</div>
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
        <div className="panel-heading"><div><span className="sub-tag">SKILL MATRIX</span><h3>Practice progress</h3></div><button className="text-btn" onClick={() => onNavigate("challenges")}>Open arena <FaArrowRight /></button></div>
        <div className="overall-progress"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><b>{solved}/{challenges.length}</b></div>
        <div className="category-grid">{categoryStats.map(s => <div className="category-mini" key={s.category}><div><span>{s.category}</span><b>{s.solved}/{s.total}</b></div><div className="mini-track"><span style={{ width: `${s.total ? (s.solved / s.total) * 100 : 0}%` }} /></div></div>)}</div>
      </div>

      <div className="panel-card event-preview">
        <div className="panel-heading"><div><span className="sub-tag">COMPETITION FEED</span><h3>{liveEvent ? liveEvent.name : "No scheduled event"}</h3></div><FaCalendarAlt className="panel-icon" /></div>
        {liveEvent ? <><p>{liveEvent.description}</p><div className="event-preview-meta"><span className={`status-badge ${liveEvent.status}`}>{liveEvent.status === "active" ? "LIVE NOW" : "UPCOMING"}</span><span><FaUsers /> {liveEvent.participants_count} participants</span><span><FaFlag /> {liveEvent.challenge_count} challenges</span></div><button className="primary-btn full" onClick={() => onNavigate("events")}>Open competition center</button></> : <div className="empty-inline"><FaShieldAlt /><p>Admins can schedule the next campus competition from the command center.</p></div>}
      </div>
    </section>

    <section className="dashboard-callout"><div><span className="sub-tag">COMMUNITY</span><h3>Build with your club, not just your score.</h3><p>Create or join a team, discuss solved challenges, and prepare for live events.</p></div><div className="callout-actions"><button className="secondary-btn" onClick={() => onNavigate("squads")}><FaUsers /> Teams</button><button className="secondary-btn" onClick={() => onNavigate("notifications")}><FaCheckCircle /> Notifications</button></div></section>
  </div>;
}
