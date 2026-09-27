import React, { useEffect, useState } from "react";
import { api } from "../api";
import {
  FaUsers,
  FaPlus,
  FaSignOutAlt,
  FaCopy,
  FaSyncAlt,
  FaCheck,
  FaTimes,
  FaPaperPlane,
  FaEnvelopeOpenText,
  FaCrown,
  FaSearch
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
  const [copied, setCopied] = useState(false);

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

  const copySlug = (code) => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const visible = teams.filter(t =>
    `${t.name} ${t.slug} ${t.owner_name}`.toLowerCase().includes(search.toLowerCase())
  );
  const current = teams.find(t => t.id === mine);
  const isOwner = current && current.owner_id === currentUser?.id;

  return (
    <div className="squads-page">
      <div className="page-header">
        <div>
          <div className="platform-breadcrumb">
            <span>OWASP PCCOE CTF Academy</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-active">Squad Hub</span>
          </div>
          <h1 className="page-title">Squads & Teams</h1>
          <p className="page-subtitle">
            Collaborate in cybersecurity squads, compete in team CTFs, and track squad ranks.
          </p>
        </div>

        <button className="btn-secondary btn-sm" onClick={load}>
          <FaSyncAlt /> Refresh
        </button>
      </div>

      {message && <div className="alert-banner success">{message}</div>}
      {error && <div className="alert-banner error">{error}</div>}

      {/* CURRENT SQUAD CARD */}
      {current && (
        <div className="card current-squad-card">
          <div className="current-squad-head">
            <div>
              <span className="section-kicker">MY SQUAD</span>
              <h2 className="current-squad-title">{current.name}</h2>
              <div className="squad-code-pill">
                <span>Join code:</span>
                <code>{current.slug}</code>
                <button
                  className="btn-copy-mini"
                  onClick={() => copySlug(current.slug)}
                  title="Copy join code"
                >
                  {copied ? <FaCheck /> : <FaCopy />}
                </button>
              </div>
            </div>

            <button
              className="btn-danger btn-sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Are you sure you want to leave this squad?")) {
                  act(() => api.post("/teams/leave"));
                }
              }}
            >
              <FaSignOutAlt /> Leave Squad
            </button>
          </div>

          <div className="squad-members-strip">
            <h4>Team Members ({current.members?.length || 1})</h4>
            <div className="squad-member-chips">
              {current.members?.map(m => (
                <div key={m.id} className="squad-member-chip">
                  {m.id === current.owner_id && <FaCrown className="crown-icon-mini" title="Squad Captain" />}
                  <b>{m.name}</b>
                  {m.college && <small>({m.college})</small>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SQUAD LEADER: INCOMING JOIN REQUESTS PANEL */}
      {isOwner && (
        <div className="card leader-requests-card">
          <div className="card-header-clean">
            <div>
              <span className="section-kicker">SQUAD LEADER INBOX</span>
              <h3 className="card-title">
                <FaEnvelopeOpenText /> Pending Join Requests ({incomingRequests.length})
              </h3>
            </div>
          </div>

          {incomingRequests.length === 0 ? (
            <p className="empty-subtle">
              No pending join requests right now. When players apply to join {current.name}, they will appear here.
            </p>
          ) : (
            <div className="squad-request-list">
              {incomingRequests.map(req => (
                <div key={req.id} className="squad-request-item">
                  <div className="request-user-info">
                    <div className="request-title-line">
                      <b>{req.user_name}</b>
                      {req.user_college && <small>({req.user_college})</small>}
                      <span className="request-points-tag font-mono">{req.user_points} pts</span>
                    </div>
                    {req.note && (
                      <p className="request-note-box">"{req.note}"</p>
                    )}
                    <span className="meta-muted">
                      Requested: {new Date(req.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>

                  <div className="request-actions">
                    <button
                      className="btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => handleRespond(req.id, "accept")}
                    >
                      <FaCheck /> Accept
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      disabled={busy}
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
        <div className="squad-onboarding-grid">
          <div className="card">
            <div className="card-header-clean">
              <h3 className="card-title"><FaPlus /> Create a Squad</h3>
            </div>
            <p className="card-desc">
              Form your own squad and become the squad leader. You can review applications from teammates.
            </p>
            <div className="clean-inline-form">
              <input
                type="text"
                className="clean-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Squad name (e.g. PCCOE Cyber Sec)"
              />
              <button
                className="btn-primary btn-sm"
                disabled={busy || !name.trim()}
                onClick={() => act(() => api.post("/teams", { name }))}
              >
                Create Squad
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header-clean">
              <h3 className="card-title"><FaUsers /> Join via Squad Code</h3>
            </div>
            <p className="card-desc">
              Enter the unique invite code or slug provided by your squad leader.
            </p>
            <div className="clean-inline-form">
              <input
                type="text"
                className="clean-input"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="Squad code (e.g. pccoe-cyber)"
              />
              <button
                className="btn-secondary btn-sm"
                disabled={busy || !slug.trim()}
                onClick={handleJoinBySlug}
              >
                Join Squad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQUAD DIRECTORY & LEADERBOARD */}
      <div className="card table-card">
        <div className="card-header-clean">
          <div>
            <h3 className="card-title">Squad Directory ({visible.length})</h3>
            <span className="card-desc">Active teams across the academy</span>
          </div>

          <div className="filter-search-box">
            <FaSearch className="filter-search-icon" />
            <input
              type="text"
              className="filter-search-input"
              placeholder="Search squads or captains..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="clean-table">
            <thead>
              <tr>
                <th>Squad</th>
                <th>Captain</th>
                <th style={{ width: "110px", textAlign: "right" }}>Members</th>
                <th style={{ width: "110px", textAlign: "right" }}>Solves</th>
                <th style={{ width: "120px", textAlign: "right" }}>Points</th>
                <th style={{ width: "130px", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan="6" className="table-empty">
                    No squads found matching your search.
                  </td>
                </tr>
              ) : (
                visible.map(t => {
                  const isMySquad = t.id === mine;
                  const isPending = !!myPendingRequests[t.id];

                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="squad-title-cell">
                          <b>{t.name}</b>
                          <small className="meta-muted">/{t.slug}</small>
                        </div>
                      </td>
                      <td>{t.owner_name}</td>
                      <td style={{ textAlign: "right" }} className="mono-stat">
                        {t.members_count || 1}
                      </td>
                      <td style={{ textAlign: "right" }} className="mono-solves">
                        {t.total_solves || 0}
                      </td>
                      <td style={{ textAlign: "right" }} className="mono-points">
                        {(t.total_points || 0).toLocaleString()} pts
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {isMySquad ? (
                          <span className="status-solved">Your Squad</span>
                        ) : isPending ? (
                          <button
                            className="btn-secondary btn-sm"
                            disabled={busy}
                            onClick={() => handleCancelRequest(myPendingRequests[t.id])}
                          >
                            Cancel Request
                          </button>
                        ) : !mine ? (
                          <button
                            className="btn-secondary btn-sm"
                            disabled={busy}
                            onClick={() => setTargetTeam(t)}
                          >
                            Request to Join
                          </button>
                        ) : (
                          <span className="meta-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request to Join Modal with Custom Note */}
      {targetTeam && (
        <div className="modal-backdrop" onClick={() => setTargetTeam(null)}>
          <div className="clean-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header-simple">
              <h3>Join Request: {targetTeam.name}</h3>
              <button className="modal-close-icon-btn" onClick={() => setTargetTeam(null)}>
                <FaTimes />
              </button>
            </div>

            <p className="modal-lead-text">
              Send an application to Captain <b>{targetTeam.owner_name}</b> to join this squad.
            </p>

            <div className="form-group">
              <label>Applicant Note (Optional)</label>
              <textarea
                className="clean-textarea"
                rows={3}
                placeholder="Mention your skills, domains of interest (Web, Crypto, etc.), or college year..."
                value={requestNote}
                onChange={e => setRequestNote(e.target.value)}
              />
            </div>

            <div className="modal-actions-row">
              <button className="btn-secondary btn-sm" onClick={() => setTargetTeam(null)}>
                Cancel
              </button>
              <button
                className="btn-primary btn-sm"
                disabled={busy}
                onClick={() => handleSendRequest(targetTeam.id, requestNote.trim())}
              >
                <FaPaperPlane /> Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
