import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  FaUsers,
  FaPlus,
  FaSignInAlt,
  FaSignOutAlt,
  FaCopy,
  FaSyncAlt,
  FaCheck,
  FaTimes,
  FaPaperPlane,
  FaClock,
  FaEnvelopeOpenText,
  FaShieldAlt,
  FaUserGraduate
} from "react-icons/fa";

export default function Squads({ currentUser }) {
  const [teams, setTeams] = useState([]);
  const [mine, setMine] = useState(null);
  const [myPendingRequests, setMyPendingRequests] = useState({});
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [slug, setSlug] = useState("");
  const [slugNote, setSlugNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Join Modal State
  const [targetTeam, setTargetTeam] = useState(null);
  const [requestNote, setRequestNote] = useState("");

  const load = async () => {
    try {
      const [r, lb] = await Promise.all([api.get("/teams"), api.get("/teams/leaderboard")]);
      setTeams(r.data.teams || []);
      setMine(r.data.my_team_id);
      setMyPendingRequests(r.data.my_pending_requests || {});
      setIncomingRequests(r.data.incoming_requests || []);
      setLeaderboard(lb.data.leaderboard || []);
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to load squads");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (fn) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const r = await fn();
      setMessage(r.data.message);
      setName("");
      setSlug("");
      setSlugNote("");
      setTargetTeam(null);
      setRequestNote("");
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSendRequest = (teamId, noteText) => {
    act(() => api.post(`/teams/${teamId}/request-join`, { note: noteText }));
  };

  const handleJoinBySlug = () => {
    if (!slug.trim()) return;
    act(() => api.post("/teams/join", { slug: slug.trim(), note: slugNote.trim() }));
  };

  const handleRespond = (requestId, action) => {
    act(() => api.post(`/teams/requests/${requestId}/respond`, { action }));
  };

  const handleCancelRequest = (requestId) => {
    act(() => api.delete(`/teams/requests/${requestId}/cancel`));
  };

  const visible = teams.filter(t =>
    `${t.name} ${t.slug} ${t.owner_name}`.toLowerCase().includes(search.toLowerCase())
  );
  const current = teams.find(t => t.id === mine);
  const isOwner = current && current.owner_id === currentUser?.id;

  return (
    <div className="squads-page">
      <div className="section-header">
        <div>
          <h2>Squad Hub</h2>
          <p className="subtitle">Build and manage a collaborative squad of up to 5 cybersecurity operatives.</p>
        </div>
        <button className="secondary-btn" onClick={load}><FaSyncAlt /> Refresh</button>
      </div>

      {message && <div className="alert-banner success">{message}</div>}
      {error && <div className="alert-banner error">{error}</div>}

      {/* CURRENT SQUAD CARD */}
      {current && (
        <div className="squad-current-card">
          <div>
            <span className="sub-tag">CURRENT SQUAD</span>
            <h3>{current.name}</h3>
            <p>
              Join code: <code>{current.slug}</code>{" "}
              <button
                className="mini-icon"
                title="Copy join code"
                onClick={() => navigator.clipboard?.writeText(current.slug)}
              >
                <FaCopy />
              </button>
            </p>
            <div className="member-row">
              {current.members.map(m => (
                <span key={m.id} className="member-chip" title={m.college || ""}>
                  {m.id === current.owner_id ? "👑 " : ""}{m.name} ({m.college || "Independent"})
                </span>
              ))}
            </div>
          </div>
          <button
            className="danger-btn"
            disabled={busy}
            onClick={() => act(() => api.post("/teams/leave"))}
          >
            <FaSignOutAlt /> Leave Squad
          </button>
        </div>
      )}

      {/* SQUAD LEADER: INCOMING JOIN REQUESTS PANEL */}
      {isOwner && (
        <div className="table-card squad-requests-panel" style={{ marginBottom: 18, border: "1px solid var(--accent-cyan)" }}>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <div>
              <span className="sub-tag" style={{ color: "var(--accent-cyan)" }}>SQUAD LEADER INBOX</span>
              <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FaEnvelopeOpenText /> Pending Join Requests ({incomingRequests.length})
              </h3>
            </div>
          </div>
          {incomingRequests.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
              No pending join requests right now. When players request to join {current.name} with a note, they will appear here for your review.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {incomingRequests.map(req => (
                <div
                  key={req.id}
                  className="squad-request-item"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 10,
                    padding: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <b style={{ fontSize: 15 }}>{req.user_name}</b>
                      <span className="member-chip"><FaUserGraduate style={{ marginRight: 4 }} />{req.user_college}</span>
                      <span style={{ fontSize: 12, color: "var(--accent-gold)", fontWeight: "bold" }}>{req.user_points} PTS</span>
                    </div>
                    <div style={{
                      background: "rgba(85,214,190,0.06)",
                      borderLeft: "3px solid var(--accent-cyan)",
                      padding: "8px 12px",
                      borderRadius: "0 6px 6px 0",
                      marginTop: 6,
                      fontSize: 13,
                      color: "var(--text-primary)"
                    }}>
                      <b>Note from applicant:</b>{" "}
                      {req.note ? <span>"{req.note}"</span> : <i style={{ color: "var(--text-muted)" }}>No note provided</i>}
                    </div>
                    <small style={{ color: "var(--text-muted)", display: "block", marginTop: 6 }}>
                      Requested: {new Date(req.created_at).toLocaleString()}
                    </small>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      className="primary-btn sm"
                      style={{ background: "#10b981", borderColor: "#10b981", display: "flex", alignItems: "center", gap: 6 }}
                      disabled={busy}
                      onClick={() => handleRespond(req.id, "accept")}
                    >
                      <FaCheck /> Accept & Add
                    </button>
                    <button
                      className="danger-btn sm"
                      disabled={busy}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                      onClick={() => handleRespond(req.id, "reject")}
                    >
                      <FaTimes /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CREATE / JOIN SQUAD (WHEN NOT IN SQUAD) */}
      {!mine && (
        <div className="squad-create-grid">
          <div className="table-card squad-action-card">
            <h3><FaPlus /> Create Squad</h3>
            <p>Form your own squad and become the squad leader. You can review and approve incoming teammate applications.</p>
            <div className="inline-form">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Null Pointers"
              />
              <button
                className="primary-btn"
                disabled={busy || !name.trim()}
                onClick={() => act(() => api.post("/teams", { name }))}
              >
                Create
              </button>
            </div>
          </div>

          <div className="table-card squad-action-card">
            <h3><FaSignInAlt /> Request Join by Code</h3>
            <p>Have a squad join code? Send a request with a note to the squad leader.</p>
            <div style={{ display: "grid", gap: 8 }}>
              <input
                className="search-bar-input"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="Squad slug (e.g. null-pointers)"
              />
              <input
                className="search-bar-input"
                value={slugNote}
                onChange={e => setSlugNote(e.target.value)}
                placeholder="Note to leader (e.g. Web/Crypto specialist)"
              />
              <button
                className="primary-btn"
                disabled={busy || !slug.trim()}
                onClick={handleJoinBySlug}
                style={{ width: "fit-content" }}
              >
                <FaPaperPlane /> Send Join Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQUAD SCOREBOARD */}
      <div className="table-card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <span className="sub-tag">GLOBAL SQUAD SCOREBOARD</span>
            <h3>Team Rankings</h3>
          </div>
        </div>
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Squad</th>
                <th>Members</th>
                <th>Solves</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    No squads registered yet.
                  </td>
                </tr>
              ) : (
                leaderboard.slice(0, 10).map(r => (
                  <tr key={r.team_id}>
                    <td>#{r.rank}</td>
                    <td><b>{r.name}</b></td>
                    <td>{r.member_count}/5</td>
                    <td>{r.challenges_solved}</td>
                    <td><b>{r.points} PTS</b></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SQUADS DIRECTORY */}
      <div className="toolbar-card">
        <input
          className="search-bar-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search squads by name, join code, or owner..."
        />
      </div>

      <div className="squad-grid">
        {visible.map(t => {
          const pending = myPendingRequests[t.id];
          const isFull = t.member_count >= 5;
          const isMyTeam = t.id === mine;

          return (
            <div className="squad-card" key={t.id}>
              <div className="squad-card-head">
                <div className="squad-avatar"><FaUsers /></div>
                <div>
                  <h3>{t.name}</h3>
                  <code>{t.slug}</code>
                </div>
              </div>

              <p style={{ margin: "6px 0", fontSize: 13 }}>
                Leader: <b>{t.owner_name}</b>
              </p>

              <div className="member-row">
                {t.members.map(m => (
                  <span key={m.id} className="member-chip" title={m.college || ""}>
                    {m.id === t.owner_id ? "👑 " : ""}{m.name}
                  </span>
                ))}
              </div>

              {pending && (
                <div style={{
                  background: "rgba(234,179,8,0.1)",
                  border: "1px solid rgba(234,179,8,0.3)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  marginBottom: 10,
                  color: "#eab308"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span><FaClock /> <b>Request Pending</b></span>
                    <button
                      className="link-btn"
                      style={{ color: "#ef4444", fontSize: 11, padding: 0 }}
                      disabled={busy}
                      onClick={() => handleCancelRequest(pending.request_id)}
                    >
                      Cancel
                    </button>
                  </div>
                  {pending.note && (
                    <small style={{ display: "block", marginTop: 4, color: "var(--text-secondary)" }}>
                      "{pending.note}"
                    </small>
                  )}
                </div>
              )}

              <div className="squad-card-foot">
                <span>{t.member_count}/5 members {isFull && "(Full)"}</span>
                {!mine && !isMyTeam && (
                  pending ? (
                    <button
                      className="secondary-btn sm"
                      style={{ borderColor: "#eab308", color: "#eab308" }}
                      disabled={busy}
                      onClick={() => { setTargetTeam(t); setRequestNote(pending.note || ""); }}
                    >
                      Edit Note
                    </button>
                  ) : (
                    <button
                      className="primary-btn sm"
                      disabled={busy || isFull}
                      onClick={() => { setTargetTeam(t); setRequestNote(""); }}
                    >
                      <FaPaperPlane /> Request to Join
                    </button>
                  )
                )}
                {isMyTeam && <span style={{ color: "var(--accent-cyan)", fontWeight: "bold" }}>Your Squad</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* REQUEST TO JOIN MODAL */}
      {targetTeam && (
        <div className="modal-backdrop" onClick={() => setTargetTeam(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <button className="close-btn" onClick={() => setTargetTeam(null)}>×</button>
            <div className="modal-header" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                <FaShieldAlt style={{ color: "var(--accent-cyan)" }} /> Join {targetTeam.name}
              </h2>
            </div>
            <div>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 14 }}>
                Send a join request to squad leader <b>{targetTeam.owner_name}</b>. Write a note introducing yourself, your cybersecurity interests, or previous CTF experience.
              </p>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 6, fontWeight: "bold", fontSize: 13 }}>
                  Note to Squad Leader
                </label>
                <textarea
                  className="search-bar-input"
                  style={{ minHeight: 90, resize: "vertical", width: "100%", fontFamily: "inherit" }}
                  placeholder="e.g. Hi, I focus on Reverse Engineering and Cryptography. Would love to join your squad for the upcoming CTF!"
                  value={requestNote}
                  onChange={e => setRequestNote(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="secondary-btn" onClick={() => setTargetTeam(null)}>
                  Cancel
                </button>
                <button
                  className="primary-btn"
                  disabled={busy}
                  onClick={() => handleSendRequest(targetTeam.id, requestNote)}
                >
                  <FaPaperPlane /> Send Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
