import React, { useEffect, useState } from "react";
import { api, getToken, API_URL } from "../api";
import {
  FaFlag,
  FaClock,
  FaLock,
  FaCheckCircle,
  FaArrowLeft,
  FaPlay,
  FaStop,
  FaServer,
  FaDownload,
  FaCopy,
  FaCheck,
  FaExternalLinkAlt
} from "react-icons/fa";

export default function TournamentArena({ eventId, onBack }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [flag, setFlag] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [instance, setInstance] = useState(null);
  const [instanceBusy, setInstanceBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/events/${eventId}/arena`);
      setData(r.data);
      if (r.data?.challenges?.length > 0 && !selected) {
        setSelected(r.data.challenges[0]);
      }
    } catch (e) {
      setResult({
        type: "error",
        text: e.response?.data?.detail || "Unable to enter tournament arena"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [eventId]);

  const loadInstance = async (id) => {
    try {
      const r = await api.get(`/challenges/${id}/instance`);
      setInstance(r.data.instance || null);
    } catch {
      setInstance(null);
    }
  };

  const startInstance = async () => {
    if (!selected) return;
    setInstanceBusy(true);
    setResult(null);
    try {
      const r = await api.post(`/challenges/${selected.id}/instance/start`);
      setInstance(r.data.instance);
      setResult({ type: "info", text: "Live challenge sandbox instance started." });
    } catch (e) {
      setResult({ type: "error", text: e.response?.data?.detail || "Could not start live instance" });
    } finally {
      setInstanceBusy(false);
    }
  };

  const stopInstance = async () => {
    if (!selected) return;
    setInstanceBusy(true);
    try {
      await api.post(`/challenges/${selected.id}/instance/stop`);
      setInstance(null);
      setResult({ type: "info", text: "Live challenge sandbox instance stopped." });
    } catch (e) {
      setResult({ type: "error", text: e.response?.data?.detail || "Could not stop live instance" });
    } finally {
      setInstanceBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!selected || !flag.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const r = await api.post(`/challenges/${selected.id}/submit`, { flag: flag.trim() });
      if (r.data.correct) {
        setResult({ type: "success", text: `✓ Correct flag! +${r.data.points_awarded || selected.points} points awarded` });
        setData(d => ({
          ...d,
          score: d.score + (r.data.points_awarded || selected.points),
          solved: d.solved + 1,
          challenges: d.challenges.map(c => c.id === selected.id ? { ...c, is_solved: true } : c)
        }));
        setSelected({ ...selected, is_solved: true });
        setFlag("");
      } else {
        setResult({ type: "error", text: "✕ Incorrect flag. Please inspect your solution and try again." });
      }
    } catch (e) {
      setResult({ type: "error", text: e.response?.data?.detail || "Submission failed. Please wait before retrying." });
    } finally {
      setSubmitting(false);
    }
  };

  // Route all downloads through our backend endpoint to avoid broken external URLs
  const getDownloadUrl = (challId) => {
    const t = getToken();
    const base = `${API_URL}/challenges/${challId}/file`;
    return t ? `${base}?token=${encodeURIComponent(t)}` : base;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="arena-page">
        <div className="table-skeleton-wrap">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card empty-card">
        <FaLock className="empty-icon" />
        <h3>Unable to enter tournament arena</h3>
        <p>{result?.text || "Please check your tournament registration status."}</p>
        <button className="btn-secondary btn-sm" onClick={onBack}>
          Back to Tournaments
        </button>
      </div>
    );
  }

  const progressPct = Math.round((data.solved / Math.max(1, data.total_challenges)) * 100);

  return (
    <div className="arena-page">
      {/* Top Banner Navigation */}
      <div className="arena-topbar card">
        <div className="arena-top-left">
          <button className="btn-secondary btn-sm" onClick={onBack}>
            <FaArrowLeft /> Back
          </button>
          <div className="arena-brand-info">
            <span className="sub-tag">OWASP PCCOE TOURNAMENT ARENA</span>
            <h2 className="arena-title">{data.event.name}</h2>
          </div>
        </div>

        <div className="arena-top-stats">
          <div className="arena-stat-box">
            <span className="stat-label">YOUR SCORE</span>
            <b className="stat-val font-mono">{data.score} <small>PTS</small></b>
          </div>
          <div className="arena-stat-box">
            <span className="stat-label">FLAGS CAPTURED</span>
            <b className="stat-val">{data.solved} / {data.total_challenges}</b>
          </div>
        </div>
      </div>

      {data.event?.is_scoreboard_frozen && (
        <div className="freeze-alert-banner">
          <span className="freeze-icon">❄️</span>
          <div>
            <strong>Scoreboard Freeze in Effect</strong>
            <p>Live rankings are temporarily locked to build suspense for the final ceremony. Your solves and points will still count toward your final result!</p>
          </div>
        </div>
      )}

      {/* Two-Pane Workspace Layout (HTB style) */}
      <div className="arena-workspace-layout">
        {/* Left Column: Challenge List */}
        <div className="arena-challenges-pane card">
          <div className="arena-pane-header">
            <div>
              <h3 className="card-title">Tournament Challenges</h3>
              <span className="card-desc">{progressPct}% completed</span>
            </div>
            <div className="arena-progress-track">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="arena-challenge-list">
            {data.challenges.map(c => {
              const isSelected = selected?.id === c.id;
              return (
                <div
                  key={c.id}
                  className={`arena-chall-item ${isSelected ? "selected" : ""} ${c.is_solved ? "solved" : ""}`}
                  onClick={() => {
                    setSelected(c);
                    setResult(null);
                    setFlag("");
                    setInstance(null);
                    if (c.runtime_enabled) loadInstance(c.id);
                  }}
                >
                  <div className="chall-item-status">
                    {c.is_solved ? (
                      <span className="status-solved">✓</span>
                    ) : (
                      <span className="status-unsolved">○</span>
                    )}
                  </div>
                  <div className="chall-item-info">
                    <span className="chall-item-title">{c.title}</span>
                    <span className="chall-item-meta">
                      {c.category} · <span className={`diff-pill ${(c.difficulty || "easy").toLowerCase()}`}>{c.difficulty}</span>
                    </span>
                  </div>
                  <div className="chall-item-points mono-points">
                    {c.points}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Challenge Detail & Flag Submit */}
        <div className="arena-detail-pane card">
          {selected ? (
            <div className="arena-detail-content">
              <div className="arena-problem-header">
                <div>
                  <div className="problem-crumb">
                    {selected.category} · <span className={`diff-pill ${(selected.difficulty || "easy").toLowerCase()}`}>{selected.difficulty}</span>
                  </div>
                  <h2 className="arena-problem-title">{selected.title}</h2>
                </div>
                <div className="arena-problem-points">
                  <b className="font-mono">{selected.points}</b>
                  <small>PTS</small>
                </div>
              </div>

              <div className="arena-statement-box">
                <h4>Description</h4>
                <p className="statement-text">{selected.description}</p>
              </div>

              {/* Target / Files / Live Instance */}
              {(selected.connection_info || selected.file_url || selected.runtime_enabled) && (
                <div className="arena-resources-box">
                  <h4>Targets & Resources</h4>

                  {selected.connection_info && (
                    <div className="resource-item">
                      <span className="res-title"><FaClock /> Target Address:</span>
                      <div className="code-box">
                        <code>{selected.connection_info}</code>
                        <button
                          className="btn-copy-code"
                          onClick={() => copyToClipboard(selected.connection_info)}
                        >
                          {copied ? <FaCheck /> : <FaCopy />}
                        </button>
                      </div>
                    </div>
                  )}

                  {selected.file_url && (
                    <div className="resource-item">
                      <a
                        className="btn-secondary btn-sm"
                        href={getDownloadUrl(selected.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FaDownload /> Download Challenge Files <FaExternalLinkAlt />
                      </a>
                    </div>
                  )}

                  {selected.runtime_enabled && (
                    <div className="docker-instance-box">
                      <div className="docker-info-head">
                        <span className="docker-title">
                          <FaServer /> Live Sandbox Environment
                        </span>
                        <small>Isolated temporary instance</small>
                      </div>
                      {instance?.status === "running" ? (
                        <div className="docker-running-row">
                          <code className="docker-url">{instance.connection_url}</code>
                          <button
                            className="btn-danger btn-sm"
                            onClick={stopInstance}
                            disabled={instanceBusy}
                          >
                            <FaStop /> {instanceBusy ? "Stopping..." : "Stop"}
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn-primary btn-sm"
                          onClick={startInstance}
                          disabled={instanceBusy}
                        >
                          <FaPlay /> {instanceBusy ? "Starting..." : "Start Sandbox"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Flag Submit */}
              <div className="flag-submission-section">
                <h4>Flag Submission</h4>
                {selected.is_solved ? (
                  <div className="solved-success-banner">
                    <FaCheckCircle className="check-icon" />
                    <div>
                      <b>Flag captured</b>
                      <p>You have already submitted the valid flag for this challenge.</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={submit} className="clean-flag-form">
                    <div className="flag-input-group">
                      <input
                        type="text"
                        className="clean-input font-mono"
                        placeholder="OWASP{your_captured_flag_here}"
                        value={flag}
                        onChange={e => setFlag(e.target.value)}
                        required
                        disabled={submitting}
                      />
                      <button
                        type="submit"
                        className="btn-primary btn-submit-flag"
                        disabled={submitting || !flag.trim()}
                      >
                        {submitting ? "Checking..." : "Submit Flag"}
                      </button>
                    </div>
                  </form>
                )}

                {result && (
                  <div className={`flag-result-alert ${result.type}`}>
                    {result.type === "success" && <FaCheckCircle />}
                    <span>{result.text}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card empty-card">
              <FaFlag className="empty-icon" />
              <h3>Select a challenge</h3>
              <p>Pick a challenge from the tournament list on the left to begin.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
