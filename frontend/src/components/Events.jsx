import React, { useState, useEffect, useRef } from "react";
import { api } from "../api";
import {
  FaShieldAlt,
  FaClock,
  FaCheckCircle,
  FaSnowflake,
  FaCertificate,
  FaCalendarAlt,
  FaTrophy,
  FaUserCheck,
  FaTimes,
  FaPrint,
  FaLock,
  FaFlag,
  FaDownload,
  FaExternalLinkAlt
} from "react-icons/fa";

// Real-time countdown hook
function useCountdown(endDate, startDate, status) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const computeSecs = () => {
      const now = Date.now();
      if (status === "upcoming") {
        return Math.max(0, Math.floor((new Date(startDate) - now) / 1000));
      } else if (status === "active") {
        return Math.max(0, Math.floor((new Date(endDate) - now) / 1000));
      }
      return 0;
    };

    setSecs(computeSecs());
    const timer = setInterval(() => setSecs(computeSecs()), 1000);
    return () => clearInterval(timer);
  }, [endDate, startDate, status]);

  return secs;
}

function formatCountdown(totalSecs) {
  if (totalSecs <= 0) return "00:00:00";
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = n => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Individual event countdown component
function EventCountdown({ event }) {
  const secs = useCountdown(event.end_date, event.start_date, event.status);

  if (event.status === "ended") {
    return <span className="countdown-text ended-text">Event Concluded</span>;
  }

  return (
    <div className="countdown-block">
      <FaClock className="clock-icon" />
      <span className="countdown-label">
        {event.status === "upcoming" ? "Starts in:" : "Ends in:"}
      </span>
      <span className="countdown-digits">{formatCountdown(secs)}</span>
    </div>
  );
}

export default function Events({ currentUser, onEnterArena }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [eventLeaderboard, setEventLeaderboard] = useState(null);
  const [activeCert, setActiveCert] = useState(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState("");
  const [myTeam, setMyTeam] = useState(null);
  const [registrationChoice, setRegistrationChoice] = useState(null);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await api.get("/events");
      const evs = res.data.events || [];
      setEvents(evs);
      if (evs.length > 0 && !selectedEventId) {
        setSelectedEventId(evs[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    api.get("/teams").then(res => {
      const id = res.data.my_team_id;
      setMyTeam((res.data.teams || []).find(t => t.id === id) || null);
    }).catch(() => setMyTeam(null));
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    api.get(`/events/${selectedEventId}/leaderboard`)
      .then(res => setEventLeaderboard(res.data))
      .catch(err => console.error(err));
  }, [selectedEventId]);

  const handleRegister = async (evId, teamId = null) => {
    try {
      const res = await api.post(`/events/${evId}/register`, null, { params: teamId ? { team_id: teamId } : {} });
      alert(res.data.message);
      setRegistrationChoice(null);
      fetchEvents();
    } catch (err) {
      alert(err.response?.data?.detail || "Registration failed");
    }
  };

  const handleViewCertificate = async (ev) => {
    // Only allow after event has ended
    if (ev.status !== "ended") {
      setCertError("Certificates are issued only after the event has concluded.");
      setActiveCert(null);
      return;
    }

    if (!ev.is_registered) {
      setCertError("You must be registered for this event to receive a certificate.");
      return;
    }

    setCertError("");
    setCertLoading(true);
    try {
      const res = await api.get(`/events/${ev.id}/certificate`);
      setActiveCert(res.data.certificate);
    } catch (err) {
      setCertError(err.response?.data?.detail || "Unable to generate certificate");
    } finally {
      setCertLoading(false);
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <div className="events-page">
      <div className="section-header">
        <div>
          <div className="platform-breadcrumb">
            <span>OWASP PCCOE</span>
            <span className="breadcrumb-sep">/</span>
            <span>Competitions & Events</span>
          </div>
          <h2>OWASP PCCOE CTF Events</h2>
          <p className="subtitle">
            Timed jeopardy-style competitions, live scoreboards, and verified credentials for the OWASP PCCOE community.
          </p>
        </div>
      </div>

      {certError && (
        <div className="alert-banner error" style={{ marginBottom: 16 }}>
          <FaLock /> {certError}
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Syncing event countdown timers...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <FaFlag className="empty-icon" />
          <h3>No events yet</h3>
          <p>Check back soon for upcoming competitions!</p>
        </div>
      ) : (
        <div className="events-layout">
          {/* Left: Events List */}
          <div className="events-list-col">
            {events.map(ev => (
              <div
                key={ev.id}
                className={`event-card ${ev.id === selectedEventId ? "selected" : ""} ${ev.status}`}
                onClick={() => {
                  setSelectedEventId(ev.id);
                  setCertError("");
                }}
              >
                <div className="event-card-top">
                  <span className={`status-badge ${ev.status}`}>
                    {ev.status === "active" ? "🔴 LIVE NOW"
                      : ev.status === "upcoming" ? "🔵 UPCOMING"
                      : "⚫ ENDED"}
                  </span>
                  {ev.is_scoreboard_frozen && (
                    <span className="frozen-pill" title="Scoreboard frozen!">
                      <FaSnowflake /> FROZEN
                    </span>
                  )}
                </div>

                <h3>{ev.name}</h3>
                <p className="event-desc">{ev.description}</p>

                <div className="event-meta-row">
                  <span className="meta-time">
                    <FaCalendarAlt /> {new Date(ev.start_date).toLocaleDateString()} → {new Date(ev.end_date).toLocaleDateString()}
                  </span>
                </div>

                {/* Live Real-time Countdown */}
                <EventCountdown event={ev} />

                <div className="event-card-actions" onClick={e => e.stopPropagation()}>
                  {ev.status !== "ended" ? (
                    ev.is_registered ? (
                      <div className="event-registered-actions">
                        <span className="registered-badge" title={ev.registration_type === "team" ? `Registered with squad ${ev.team_name || ""}` : "Registered as Individual"}>
                          <FaUserCheck /> {ev.registration_type === "team" ? `Squad: ${ev.team_name || "Team"}` : "Solo"}
                        </span>
                        {ev.registration_type !== "team" && (ev.participation_mode === "team" || ev.participation_mode === "both") && myTeam && (
                          <button
                            className="secondary-btn sm"
                            onClick={() => setRegistrationChoice(ev)}
                            title={`Switch to participating with ${myTeam.name}`}
                          >
                            Switch to Squad
                          </button>
                        )}
                        {ev.status === "active" && ev.challenge_count > 0 && (
                          <button className="primary-btn sm" onClick={() => onEnterArena?.(ev.id)}><FaFlag/> Enter Arena</button>
                        )}
                      </div>
                    ) : (
                      <button className="primary-btn sm" onClick={() => {
                        if (ev.participation_mode === "team" || ev.participation_mode === "both") setRegistrationChoice(ev);
                        else handleRegister(ev.id);
                      }}>
                        Register {ev.participation_mode === "team" ? "Squad" : ev.participation_mode === "both" ? "Event" : "Free"}
                      </button>
                    )
                  ) : (
                    <span className="registered-badge">Event Concluded</span>
                  )}

                  <button
                    className={`secondary-btn sm ${ev.status !== "ended" ? "disabled-look" : ""}`}
                    onClick={() => handleViewCertificate(ev)}
                    title={ev.status !== "ended" ? "Available after event ends" : "Get your certificate"}
                  >
                    <FaCertificate />
                    {ev.status === "ended" ? " Get Certificate" : " Certificate (After Event)"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Event Arena & Scoreboard */}
          <div className="event-details-col">
            {eventLeaderboard && (
              <div className="event-arena-card">
                <div className="arena-header">
                  <div>
                    <span className="sub-tag">LIVE COMPETITION SCOREBOARD · {eventLeaderboard.participation_mode?.toUpperCase()}</span>
                    <h3>{eventLeaderboard.event_name}</h3>
                  </div>
                  {eventLeaderboard.is_scoreboard_frozen && (
                    <div className="frozen-banner">
                      <FaSnowflake className="frozen-icon" />
                      <div>
                        <b>Scoreboard Frozen!</b>
                        <small>Rankings locked during final hours. Flags can still be submitted!</small>
                      </div>
                    </div>
                  )}
                </div>

                {/* If active event, show countdown in leaderboard panel too */}
                {selectedEvent && selectedEvent.status !== "ended" && (
                  <div className="panel-countdown">
                    <EventCountdown event={selectedEvent} />
                  </div>
                )}

                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Player / Squad</th>
                        <th>Type</th>
                        <th>Solves</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!eventLeaderboard.leaderboard || eventLeaderboard.leaderboard.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="no-data">
                            No submissions yet. Be the first to capture a flag!
                          </td>
                        </tr>
                      ) : (
                        eventLeaderboard.leaderboard.map(row => (
                          <tr key={row.user_id}>
                            <td className="rank-cell">
                              {row.rank === 1 ? <FaTrophy className="gold" />
                               : row.rank === 2 ? <FaTrophy className="silver" />
                               : row.rank === 3 ? <FaTrophy className="bronze" />
                               : `#${row.rank}`}
                            </td>
                            <td><b>{row.name}</b>{row.type === "team" && row.members?.length > 0 && <small style={{display:"block",opacity:.65}}>{row.members.join(" · ")}</small>}</td>
                            <td>{row.type === "team" ? "TEAM" : "INDIVIDUAL"}</td>
                            <td><span className="solve-chip"><FaCheckCircle /> {row.solves}</span></td>
                            <td><b className="points-text">{row.points} PTS</b></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {registrationChoice && (
        <div className="modal-backdrop" onClick={() => setRegistrationChoice(null)}>
          <div className="table-card" style={{ maxWidth: 480, width: "92%" }} onClick={e => e.stopPropagation()}>
            <h3>Tournament Participation</h3>
            <p className="subtitle" style={{ marginBottom: "16px" }}>
              Event: <b>{registrationChoice.name}</b><br />
              Mode: <span style={{ textTransform: "uppercase", color: "#38bdf8", fontWeight: "bold" }}>{registrationChoice.participation_mode}</span>
            </p>
            {registrationChoice.participation_mode === "both" && (
              <button
                className="secondary-btn"
                style={{ marginBottom: "12px", width: "100%", justifyContent: "center" }}
                onClick={() => handleRegister(registrationChoice.id)}
              >
                Compete Solo (Individual)
              </button>
            )}
            {myTeam ? (
              <button
                className="primary-btn"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => handleRegister(registrationChoice.id, myTeam.id)}
              >
                Compete with Squad: <b>{myTeam.name}</b>
              </button>
            ) : (
              <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.04)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", marginBottom: "12px" }}>
                <p style={{ margin: "0 0 4px 0", fontWeight: 600 }}>Not in a squad yet?</p>
                <small style={{ color: "#94a3b8", display: "block" }}>
                  Visit the <b>Squads Hub</b> to create a new squad or send a join request to an existing one.
                </small>
              </div>
            )}
            <button className="back-link" style={{ marginTop: "12px", display: "block", textAlign: "center", width: "100%" }} onClick={() => setRegistrationChoice(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Certificate Modal */}
      {activeCert && (
        <div className="modal-backdrop" onClick={() => setActiveCert(null)}>
          <div className="certificate-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setActiveCert(null)}><FaTimes /></button>

            <div className="cert-frame" id="printable-cert">
              <div className="cert-border">
                <div className="cert-inner">
                  <div className="cert-header">
                    <FaShieldAlt className="cert-logo" />
                    <h2>COLLEGE OWASP CHAPTER</h2>
                    <p className="cert-subtitle">Certificate of CTF Participation & Excellence</p>
                  </div>
                  <div className="cert-body">
                    <p className="cert-awarded-text">This is proudly presented to</p>
                    <h1 className="cert-student-name">{activeCert.student_name}</h1>
                    <p className="cert-college">{activeCert.college}</p>
                    <p className="cert-details-text">
                      For successfully competing in <b>{activeCert.event_name}</b>, scoring{" "}
                      <b>{activeCert.score} points</b> across <b>{activeCert.solves} captured flags</b>.
                    </p>
                  </div>
                  <div className="cert-footer">
                    <div className="cert-sign">
                      <div className="sign-line"></div>
                      <span>{activeCert.signature}</span>
                    </div>
                    <div className="cert-meta">
                      <span>Date: {activeCert.issued_date}</span>
                      <small>ID: {activeCert.certificate_id}</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="cert-modal-actions">
              <button className="primary-btn" onClick={async () => {
                try {
                  const r = await api.get(`/certificates/${activeCert.certificate_id}/download`, { responseType: "blob" });
                  const url = URL.createObjectURL(r.data); const a = document.createElement("a");
                  a.href = url; a.download = `${activeCert.certificate_id}.pdf`; a.click(); URL.revokeObjectURL(url);
                } catch (e) { setCertError(e.response?.data?.detail || "Download failed"); }
              }}>
                <FaDownload /> Download PDF
              </button>
              <button className="secondary-btn" onClick={() => window.print()}>
                <FaPrint /> Print
              </button>
              <a
                className="secondary-btn"
                href={
                  activeCert.verification_url?.startsWith("http")
                    ? activeCert.verification_url
                    : `${api.defaults.baseURL || "http://localhost:8000"}${activeCert.verification_url?.startsWith("/") ? "" : "/"}${activeCert.verification_url || `verify/certificate/${activeCert.certificate_id}/page`}`
                }
                target="_blank"
                rel="noreferrer"
              >
                <FaExternalLinkAlt /> Verify Certificate
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
