import React, { useState, useEffect } from "react";
import { api } from "../api";
import {
  FaClock,
  FaCheckCircle,
  FaCalendarAlt,
  FaTrophy,
  FaUsers,
  FaFlag,
  FaLock,
  FaCertificate,
  FaExternalLinkAlt,
  FaTimes,
  FaPlay,
  FaShieldAlt
} from "react-icons/fa";

// Countdown hook
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

export default function Events({ currentUser, onEnterArena }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [eventLeaderboard, setEventLeaderboard] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [registrationModal, setRegistrationModal] = useState(null);
  const [selectedRegType, setSelectedRegType] = useState("solo"); // solo or team
  const [activeCert, setActiveCert] = useState(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState("");

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
      console.error("Error fetching events:", err);
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

  const selectedEvent = events.find(e => e.id === selectedEventId) || events[0] || null;
  const countdownSecs = useCountdown(selectedEvent?.end_date, selectedEvent?.start_date, selectedEvent?.status);

  const handleRegister = async (evId, teamId = null) => {
    try {
      const res = await api.post(`/events/${evId}/register`, null, {
        params: teamId ? { team_id: teamId } : {}
      });
      alert(res.data.message || "Successfully registered!");
      setRegistrationModal(null);
      fetchEvents();
    } catch (err) {
      alert(err.response?.data?.detail || "Registration failed");
    }
  };

  const handleViewCertificate = async (ev) => {
    if (ev.status !== "ended") {
      setCertError("Certificates are issued only after the competition concludes.");
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
      // Correct backend route: GET /events/{id}/certificate
      const res = await api.get(`/events/${ev.id}/certificate`);
      const raw = res.data.certificate;
      // Normalize field names from backend response to what the modal expects
      setActiveCert({
        ...raw,
        recipient_name: raw.student_name || raw.recipient_name || raw.participant_name,
        issued_at: raw.issued_date || raw.issued_at,
        id: raw.certificate_id || raw.id,
        download_url: raw.download_url,
      });
    } catch (err) {
      setCertError(err.response?.data?.detail || "Certificate not found. It may not have been generated yet by the admin.");
    } finally {
      setCertLoading(false);
    }
  };

  return (
    <div className="events-page">
      <div className="page-header">
        <div>
          <div className="platform-breadcrumb">
            <span>OWASP PCCOE CTF Academy</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-active">Competitions & Events</span>
          </div>
          <h1 className="page-title">Competitions</h1>
          <p className="page-subtitle">
            Timed CTF tournaments, campus hacker battles, and team cyber defense exercises.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="table-skeleton-wrap">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : events.length === 0 ? (
        <div className="card empty-card">
          <FaCalendarAlt className="empty-icon" />
          <h3>No events scheduled</h3>
          <p>Upcoming competitions will appear here once announced by OWASP PCCOE coordinators.</p>
        </div>
      ) : (
        <div className="events-split-layout">
          {/* Left Column: Event List */}
          <div className="events-list-col">
            <h3 className="section-title">All Tournaments ({events.length})</h3>

            <div className="event-cards-stack">
              {events.map(ev => {
                const isSelected = selectedEvent?.id === ev.id;
                const statusClass = ev.status === "active" ? "live" : ev.status === "upcoming" ? "upcoming" : "concluded";
                const statusLabel = ev.status === "active" ? "LIVE NOW" : ev.status === "upcoming" ? "UPCOMING" : "CONCLUDED";

                return (
                  <div
                    key={ev.id}
                    className={`card event-list-item ${isSelected ? "selected-event" : ""}`}
                    onClick={() => setSelectedEventId(ev.id)}
                  >
                    <div className="event-list-top">
                      <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
                      <span className="event-date-sub">
                        {new Date(ev.start_date).toLocaleDateString()}
                      </span>
                    </div>

                    <h4 className="event-card-title">{ev.name}</h4>
                    <p className="event-card-desc">{ev.description}</p>

                    <div className="event-card-meta-row">
                      <span><FaUsers /> {ev.participants_count || 0} enrolled</span>
                      <span><FaFlag /> {ev.challenge_count || 0} challenges</span>
                    </div>

                    {ev.is_registered && (
                      <div className="registered-badge-pill">
                        <FaCheckCircle /> Registered {ev.registration_type ? `(${ev.registration_type})` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Tournament Control Panel (HTB style) */}
          {selectedEvent && (
            <div className="event-control-col">
              <div className="card event-detail-panel">
                <div className="panel-status-bar">
                  <span className={`status-pill ${selectedEvent.status === "active" ? "live" : selectedEvent.status === "upcoming" ? "upcoming" : "concluded"}`}>
                    {selectedEvent.status === "active" ? "● LIVE TOURNAMENT" : selectedEvent.status === "upcoming" ? "SCHEDULED EVENT" : "CONCLUDED"}
                  </span>
                  {selectedEvent.is_frozen && (
                    <span className="freeze-tag">SCOREBOARD FROZEN</span>
                  )}
                </div>

                <h2 className="event-control-title">{selectedEvent.name}</h2>
                <p className="event-control-desc">{selectedEvent.description}</p>

                {/* Competition Timer */}
                {selectedEvent.status !== "ended" && (
                  <div className="countdown-box">
                    <div className="countdown-head">
                      <FaClock />
                      <span>{selectedEvent.status === "upcoming" ? "Starts in:" : "Ends in:"}</span>
                    </div>
                    <span className="countdown-timer font-mono">
                      {formatCountdown(countdownSecs)}
                    </span>
                  </div>
                )}

                {/* Event Key Stats Strip */}
                <div className="event-stat-strip">
                  <div className="event-stat-cell">
                    <small>PARTICIPANTS</small>
                    <b>{selectedEvent.participants_count || 0}</b>
                  </div>
                  <div className="event-stat-cell">
                    <small>CHALLENGES</small>
                    <b>{selectedEvent.challenge_count || 0}</b>
                  </div>
                  <div className="event-stat-cell">
                    <small>FORMAT</small>
                    <b>{selectedEvent.format || "Individual / Squad"}</b>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="event-actions-bar">
                  {selectedEvent.status === "active" && selectedEvent.is_registered ? (
                    <button
                      className="btn-primary btn-block btn-lg"
                      onClick={() => onEnterArena(selectedEvent.id)}
                    >
                      <FaPlay /> Enter Tournament Arena
                    </button>
                  ) : selectedEvent.status !== "ended" && !selectedEvent.is_registered ? (
                    <button
                      className="btn-primary btn-block"
                      onClick={() => setRegistrationModal(selectedEvent)}
                    >
                      Register for Tournament
                    </button>
                  ) : selectedEvent.status === "ended" ? (
                    <button
                      className="btn-secondary btn-block"
                      onClick={() => handleViewCertificate(selectedEvent)}
                    >
                      <FaCertificate /> View Official Certificate
                    </button>
                  ) : null}
                </div>

                {/* Live Tournament Leaderboard Preview */}
                <div className="event-leaderboard-section">
                  <div className="card-header-clean">
                    <h3 className="card-title">Tournament Scoreboard</h3>
                    <span className="card-desc">Live participant rankings</span>
                  </div>

                  <div className="table-responsive">
                    <table className="clean-table">
                      <thead>
                        <tr>
                          <th style={{ width: "60px", textAlign: "center" }}>Rank</th>
                          <th>Participant / Team</th>
                          <th style={{ width: "100px", textAlign: "right" }}>Solves</th>
                          <th style={{ width: "110px", textAlign: "right" }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!eventLeaderboard?.leaderboard || eventLeaderboard.leaderboard.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="table-empty">
                              No solves recorded for this competition yet.
                            </td>
                          </tr>
                        ) : (
                          eventLeaderboard.leaderboard.slice(0, 10).map((row, idx) => (
                            <tr key={row.user_id || row.team_id || idx}>
                              <td style={{ textAlign: "center" }} className="mono-stat">
                                #{idx + 1}
                              </td>
                              <td>
                                <b>{row.name}</b>
                                {row.team_name && <small className="meta-muted"> [{row.team_name}]</small>}
                              </td>
                              <td style={{ textAlign: "right" }} className="mono-solves">
                                {row.solves_count || 0}
                              </td>
                              <td style={{ textAlign: "right" }} className="mono-points">
                                {row.points} pts
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
          )}
        </div>
      )}

      {/* Registration Modal */}
      {registrationModal && (
        <div className="modal-backdrop" onClick={() => setRegistrationModal(null)}>
          <div className="clean-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header-simple">
              <h3>Tournament Registration</h3>
              <button className="modal-close-icon-btn" onClick={() => setRegistrationModal(null)}>
                <FaTimes />
              </button>
            </div>

            <p className="modal-lead-text">
              Choose how you want to compete in <b>{registrationModal.name}</b>:
            </p>

            <div className="reg-choice-options">
              <label className={`reg-option-card ${selectedRegType === "solo" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="regType"
                  value="solo"
                  checked={selectedRegType === "solo"}
                  onChange={() => setSelectedRegType("solo")}
                />
                <div>
                  <b>Individual Participant (Solo)</b>
                  <p>Compete under your own name and earn individual points.</p>
                </div>
              </label>

              {myTeam && (
                <label className={`reg-option-card ${selectedRegType === "team" ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="regType"
                    value="team"
                    checked={selectedRegType === "team"}
                    onChange={() => setSelectedRegType("team")}
                  />
                  <div>
                    <b>Squad: {myTeam.name}</b>
                    <p>Compete together with your squad and contribute to the team scoreboard.</p>
                  </div>
                </label>
              )}
            </div>

            <div className="modal-actions-row">
              <button className="btn-secondary btn-sm" onClick={() => setRegistrationModal(null)}>
                Cancel
              </button>
              <button
                className="btn-primary btn-sm"
                onClick={() => handleRegister(registrationModal.id, selectedRegType === "team" ? myTeam?.id : null)}
              >
                Confirm Registration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Viewer Modal */}
      {(activeCert || certLoading || certError) && (
        <div className="modal-backdrop" onClick={() => { setActiveCert(null); setCertError(""); }}>
          <div className="clean-modal-content cert-view-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header-simple">
              <h3>Official Event Certificate</h3>
              <button className="modal-close-icon-btn" onClick={() => { setActiveCert(null); setCertError(""); }}>
                <FaTimes />
              </button>
            </div>

            {certLoading && <div className="spinner" />}
            {certError && <div className="alert-banner error">{certError}</div>}

            {activeCert && (
              <div className="cert-preview-box">
                <div className="cert-badge-ribbon">
                  <FaCertificate /> VERIFIED ISSUANCE
                </div>
                <h4>{activeCert.event_name || "Certificate of Achievement"}</h4>
                <p>Awarded to <b>{activeCert.recipient_name || activeCert.student_name || activeCert.participant_name}</b></p>
                <div className="cert-meta-info font-mono">
                  <span>Serial: {activeCert.certificate_id || activeCert.id}</span>
                  <span>Issued: {activeCert.issued_date || (activeCert.issued_at ? activeCert.issued_at.split("T")[0] : "—")}</span>
                  {activeCert.score != null && <span>Score: {activeCert.score} pts · {activeCert.solves} solves</span>}
                  {activeCert.rank && <span>Rank: #{activeCert.rank}</span>}
                </div>
                {activeCert.download_url ? (
                  <a
                    href={activeCert.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary btn-block btn-sm"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, textDecoration: "none" }}
                  >
                    <FaCertificate /> Download Certificate (PDF)
                  </a>
                ) : (
                  <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 12 }}>
                    PDF is being generated — check back shortly or contact the admin.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
