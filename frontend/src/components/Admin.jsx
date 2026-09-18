import React, { useState, useEffect } from "react";
import { api } from "../api";
import {
  FaChartLine,
  FaFlag,
  FaCalendarAlt,
  FaUsers,
  FaPlus,
  FaEdit,
  FaTrash,
  FaSnowflake,
  FaCheck,
  FaTimes,
  FaUserShield,
  FaBan,
  FaCheckCircle,
  FaCertificate,
  FaShieldAlt,
  FaSyncAlt,
  FaLightbulb,
  FaExternalLinkAlt,
  FaServer,
  FaStop,
  FaHeartbeat
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

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Insane"];

export default function Admin() {
  const [tab, setTab] = useState("analytics"); // analytics, challenges, events, users, certificates, security

  // Analytics data
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Challenges data
  const [challenges, setChallenges] = useState([]);
  const [editingChall, setEditingChall] = useState(null);
  const [challForm, setChallForm] = useState({
    title: "",
    description: "",
    category: "Web Exploitation",
    difficulty: "Easy",
    points: 100,
    flag: "",
    flag_mode: "static",
    flag_secret: "",
    status: "draft",
    hint: "",
    hint_cost: 15,
    writeup: "",
    file_url: "",
    connection_info: "",
    event_id: "",
    runtime_image: "",
    runtime_port: "",
    runtime_protocol: "http",
    instance_timeout_minutes: 60
  });

  // Events data
  const [events, setEvents] = useState([]);
  const [eventForm, setEventForm] = useState({
    name: "",
    description: "",
    start_date: "",
    end_date: "",
    participation_mode: "individual"
  });

  // Users data
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");

  const [message, setMessage] = useState("");
  const [selectedHintChallenge, setSelectedHintChallenge] = useState(null);
  const [hintForm, setHintForm] = useState({ title: "Hint", content: "", cost: 15, order_index: 1 });
  const [hints, setHints] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [certEventId, setCertEventId] = useState("");
  const [certificates, setCertificates] = useState([]);
  const [certLoading, setCertLoading] = useState(false);
  const [securityOverview, setSecurityOverview] = useState(null);
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [securityFilter, setSecurityFilter] = useState("open");
  const [securityLoading, setSecurityLoading] = useState(false);
  const [liveInstances, setLiveInstances] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [storageStatus, setStorageStatus] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [monitoring, setMonitoring] = useState(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);

  // Load analytics
  const loadAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const res = await api.get("/admin/analytics");
      setAnalytics(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Load challenges
  const loadChallenges = async () => {
    try {
      const res = await api.get("/admin/challenges");
      setChallenges(res.data.challenges || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Load events
  const loadEvents = async () => {
    try {
      const res = await api.get("/events");
      setEvents(res.data.events || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Load users
  const loadUsers = async () => {
    try {
      const res = await api.get("/admin/users", {
        params: { search: userSearch || undefined }
      });
      setUsers(res.data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMonitoring = async () => {
    setMonitoringLoading(true);
    try {
      const res = await api.get("/admin/monitoring");
      setMonitoring(res.data);
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Could not load production monitoring", true);
    } finally { setMonitoringLoading(false); }
  };

  const loadSecurity = async () => {
    setSecurityLoading(true);
    try {
      const [overview, alerts] = await Promise.all([
        api.get("/admin/security/overview"),
        api.get("/admin/security/alerts", { params: { reviewed: securityFilter === "open" ? false : securityFilter === "reviewed" ? true : undefined } })
      ]);
      setSecurityOverview(overview.data.metrics);
      setSecurityAlerts(alerts.data.alerts || []);
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Could not load security monitoring", true);
    } finally { setSecurityLoading(false); }
  };

  const reviewAlert = async (id) => {
    try {
      await api.post(`/admin/security/alerts/${id}/review`, { reviewed: true });
      showFeedback("Security alert marked as reviewed.");
      loadSecurity();
    } catch (err) { showFeedback(err.response?.data?.detail || "Could not review alert", true); }
  };

  useEffect(() => {
    if (tab === "analytics") loadAnalytics();
    if (tab === "security") loadSecurity();
    if (tab === "monitoring") loadMonitoring();
    if (tab === "challenges") {
      loadChallenges();
      loadEvents();
    }
    if (tab === "events") loadEvents();
    if (tab === "certificates") loadEvents();
    if (tab === "users") loadUsers();
    if (tab === "live") loadLiveInstances();
    if (tab === "storage") loadStorageStatus();
  }, [tab, userSearch]);

  const loadLiveInstances = async () => {
    setLiveLoading(true);
    try { const res = await api.get("/admin/live-instances"); setLiveInstances(res.data.instances || []); }
    catch (err) { showFeedback(err.response?.data?.detail || "Could not load live instances", true); }
    finally { setLiveLoading(false); }
  };

  const stopLiveInstance = async (id) => {
    try { await api.post(`/admin/live-instances/${id}/stop`); showFeedback("Live instance stopped."); loadLiveInstances(); }
    catch (err) { showFeedback(err.response?.data?.detail || "Could not stop instance", true); }
  };


  const loadStorageStatus = async () => {
    setStorageLoading(true);
    try { const res = await api.get("/admin/storage/status"); setStorageStatus(res.data.storage); }
    catch (err) { showFeedback(err.response?.data?.detail || "Could not load storage status", true); }
    finally { setStorageLoading(false); }
  };

  const migrateLocalStorage = async () => {
    setStorageLoading(true);
    try { const res = await api.post("/admin/storage/migrate-local"); showFeedback(`Migrated ${res.data.migrated.challenge_files} challenge file(s) and ${res.data.migrated.certificates} certificate(s).`); loadStorageStatus(); }
    catch (err) { showFeedback(err.response?.data?.detail || "Could not migrate local files", true); }
    finally { setStorageLoading(false); }
  };

  const showFeedback = (msg, isErr = false) => {
    if (isErr) {
      setError(msg);
      setMessage("");
    } else {
      setMessage(msg);
      setError("");
    }
    setTimeout(() => {
      setMessage("");
      setError("");
    }, 4000);
  };

  // Create or Update Challenge
  const handleSaveChallenge = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...challForm,
        points: Number(challForm.points),
        flag_mode: challForm.flag_mode,
        flag_secret: challForm.flag_secret || null,
        status: challForm.status,
        hint_cost: Number(challForm.hint_cost || 15),
        event_id: challForm.event_id ? Number(challForm.event_id) : null,
        runtime_image: challForm.runtime_image || null,
        runtime_port: challForm.runtime_port ? Number(challForm.runtime_port) : null,
        runtime_protocol: challForm.runtime_protocol || "http",
        instance_timeout_minutes: Number(challForm.instance_timeout_minutes || 60)
      };

      if (editingChall) {
        await api.put(`/admin/challenges/${editingChall.id}`, payload);
        showFeedback("Challenge updated successfully!");
        setEditingChall(null);
      } else {
        await api.post("/admin/challenges", payload);
        showFeedback("Challenge created successfully!");
      }

      setChallForm({
        title: "",
        description: "",
        category: "Web Exploitation",
        difficulty: "Easy",
        points: 100,
        flag: "",
        flag_mode: "static",
        flag_secret: "",
        status: "draft",
        hint: "",
        hint_cost: 15,
        writeup: "",
        file_url: "",
        connection_info: "",
        event_id: "",
        runtime_image: "",
        runtime_port: "",
        runtime_protocol: "http",
        instance_timeout_minutes: 60
      });
      loadChallenges();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Operation failed", true);
    }
  };

  // Delete challenge
  const handleDeleteChallenge = async (id) => {
    if (!window.confirm("Are you sure you want to delete this challenge?")) return;
    try {
      await api.delete(`/admin/challenges/${id}`);
      showFeedback("Challenge deleted.");
      loadChallenges();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Delete failed", true);
    }
  };

  // Create Event
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/events", {
        name: eventForm.name,
        description: eventForm.description,
        start_date: new Date(eventForm.start_date).toISOString(),
        end_date: new Date(eventForm.end_date).toISOString(),
        participation_mode: eventForm.participation_mode
      });
      showFeedback("Event created successfully!");
      setEventForm({ name: "", description: "", start_date: "", end_date: "", participation_mode: "individual" });
      loadEvents();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Failed to create event", true);
    }
  };

  // Toggle Scoreboard Freeze
  const handleToggleFreeze = async (eventId) => {
    try {
      const res = await api.post(`/admin/events/${eventId}/toggle-freeze`);
      showFeedback(res.data.message);
      loadEvents();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Toggle failed", true);
    }
  };

  // Delete Event
  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm("Delete this event?")) return;
    try {
      await api.delete(`/admin/events/${eventId}`);
      showFeedback("Event deleted.");
      loadEvents();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Delete failed", true);
    }
  };

  // User Role Change
  const handleChangeRole = async (userId, newRole) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      showFeedback("User role updated.");
      loadUsers();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Role update failed", true);
    }
  };

  // Toggle User Active Status
  const handleToggleActive = async (userId) => {
    try {
      const res = await api.put(`/admin/users/${userId}/toggle-active`);
      showFeedback(res.data.message);
      loadUsers();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Action failed", true);
    }
  };

  const loadHints = async (challengeId) => {
    try {
      const res = await api.get(`/admin/challenges/${challengeId}/hints`);
      setHints(res.data.hints || []);
    } catch (err) { showFeedback(err.response?.data?.detail || "Could not load hints", true); }
  };

  const addHint = async (e) => {
    e.preventDefault();
    if (!selectedHintChallenge) return;
    try {
      await api.post(`/admin/challenges/${selectedHintChallenge}/hints`, {
        ...hintForm, cost: Number(hintForm.cost), order_index: Number(hintForm.order_index)
      });
      setHintForm({ title: "Hint", content: "", cost: 15, order_index: hints.length + 2 });
      await loadHints(selectedHintChallenge);
      showFeedback("Hint added successfully.");
    } catch (err) { showFeedback(err.response?.data?.detail || "Failed to add hint", true); }
  };

  const publishChallenge = async (id) => {
    try { await api.post(`/admin/challenges/${id}/publish`); showFeedback("Challenge published."); loadChallenges(); }
    catch (err) { showFeedback(err.response?.data?.detail || "Publish failed", true); }
  };

  const archiveChallenge = async (id) => {
    try { await api.post(`/admin/challenges/${id}/archive`); showFeedback("Challenge archived."); loadChallenges(); }
    catch (err) { showFeedback(err.response?.data?.detail || "Archive failed", true); }
  };

  const loadCertificates = async (eventId) => {
    if (!eventId) return;
    setCertLoading(true);
    try {
      const res = await api.get(`/admin/events/${eventId}/certificates`);
      setCertificates(res.data.certificates || []);
    } catch (err) { showFeedback(err.response?.data?.detail || "Could not load certificates", true); }
    finally { setCertLoading(false); }
  };

  const generateCertificates = async () => {
    if (!certEventId) return;
    try {
      const res = await api.post(`/admin/events/${certEventId}/certificates/generate`);
      showFeedback(res.data.message);
      loadCertificates(certEventId);
    } catch (err) { showFeedback(err.response?.data?.detail || "Certificate generation failed", true); }
  };

  const revokeCertificate = async (id) => {
    if (!window.confirm("Revoke this certificate?")) return;
    try { await api.post(`/admin/certificates/${id}/revoke`); showFeedback("Certificate revoked."); loadCertificates(certEventId); }
    catch (err) { showFeedback(err.response?.data?.detail || "Revoke failed", true); }
  };

  const uploadChallengeFile = async (id, file) => {
    if (!file) return;
    const form = new FormData(); form.append("file", file); setUploading(true);
    try {
      await api.post(`/admin/challenges/${id}/upload`, form, { headers: { "Content-Type": "multipart/form-data" } });
      showFeedback("Challenge file uploaded."); loadChallenges();
    } catch (err) { showFeedback(err.response?.data?.detail || "Upload failed", true); }
    finally { setUploading(false); }
  };

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="section-header">
        <div>
          <h2>Club Admin Command Center</h2>
          <p className="subtitle">
            Manage challenges, live events, participant access, and evaluate competition analytics.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {message && <div className="alert-banner success"><FaCheckCircle /> {message}</div>}
      {error && <div className="alert-banner error"><FaTimes /> {error}</div>}

      {/* Navigation Tabs */}
      <div className="tab-buttons">
        <button
          className={`tab-btn ${tab === "analytics" ? "active" : ""}`}
          onClick={() => setTab("analytics")}
        >
          <FaChartLine /> Analytics Dashboard
        </button>
        <button
          className={`tab-btn ${tab === "challenges" ? "active" : ""}`}
          onClick={() => setTab("challenges")}
        >
          <FaFlag /> Challenge Manager
        </button>
        <button
          className={`tab-btn ${tab === "events" ? "active" : ""}`}
          onClick={() => setTab("events")}
        >
          <FaCalendarAlt /> Event Manager
        </button>
        <button
          className={`tab-btn ${tab === "users" ? "active" : ""}`}
          onClick={() => setTab("users")}
        >
          <FaUsers /> User Controls
        </button>
        <button
          className={`tab-btn ${tab === "certificates" ? "active" : ""}`}
          onClick={() => setTab("certificates")}
        >
          <FaCertificate /> Certificates
        </button>
        <button className={`tab-btn ${tab === "live" ? "active" : ""}`} onClick={() => setTab("live")}><FaServer /> Live Instances</button>
        <button className={`tab-btn ${tab === "storage" ? "active" : ""}`} onClick={() => setTab("storage")}><FaServer /> File Storage</button>
        <button className={`tab-btn ${tab === "monitoring" ? "active" : ""}`} onClick={() => setTab("monitoring")}>
          <FaHeartbeat /> Production Monitor
        </button>
        <button
          className={`tab-btn ${tab === "security" ? "active" : ""}`}
          onClick={() => setTab("security")}
        >
          <FaShieldAlt /> Anti-Cheat Monitor
        </button>
      </div>

      {/* TAB 1: ANALYTICS DASHBOARD */}
      {tab === "analytics" && (
        <div className="admin-analytics-view">
          {loadingAnalytics ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Gathering club engagement metrics...</p>
            </div>
          ) : analytics ? (
            <>
              {/* Metric Cards */}
              <div className="metrics-grid">
                <div className="metric-box">
                  <span className="metric-title">Registered Students</span>
                  <b className="metric-num">{analytics.metrics.total_users}</b>
                </div>
                <div className="metric-box">
                  <span className="metric-title">Active Challenges</span>
                  <b className="metric-num">{analytics.metrics.total_challenges}</b>
                </div>
                <div className="metric-box">
                  <span className="metric-title">Total Submissions</span>
                  <b className="metric-num">{analytics.metrics.total_submissions}</b>
                </div>
                <div className="metric-box">
                  <span className="metric-title">Correct Solves</span>
                  <b className="metric-num neon">{analytics.metrics.correct_submissions}</b>
                </div>
                <div className="metric-box">
                  <span className="metric-title">Accuracy Rate</span>
                  <b className="metric-num">{analytics.metrics.accuracy_rate}%</b>
                </div>
              </div>

              {/* Category Solves Table */}
              <div className="table-card">
                <h3>Category Engagement Breakdown</h3>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Security Domain</th>
                        <th>Challenges</th>
                        <th>Total Solves</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.category_data.map(cd => (
                        <tr key={cd.category}>
                          <td><b>{cd.category}</b></td>
                          <td>{cd.challenges}</td>
                          <td><b className="points-text">{cd.solves} solves</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Challenge Solve Rates */}
              <div className="table-card">
                <h3>Challenge Difficulty Tuning & Solve Rates</h3>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Challenge</th>
                        <th>Category</th>
                        <th>Difficulty</th>
                        <th>Attempts</th>
                        <th>Solves</th>
                        <th>Solve Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.challenge_stats.map(cs => (
                        <tr key={cs.id}>
                          <td><b>{cs.title}</b></td>
                          <td><span className="category-tag">{cs.category}</span></td>
                          <td><span className={`difficulty-tag ${(cs.difficulty || "").toLowerCase()}`}>{cs.difficulty}</span></td>
                          <td>{cs.attempts}</td>
                          <td>{cs.solves}</td>
                          <td>
                            <div className="rate-cell">
                              <span>{cs.solve_rate}%</span>
                              <div className="progress-track sm">
                                <div className="progress-fill" style={{ width: `${cs.solve_rate}%` }}></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Submissions Log */}
              <div className="table-card">
                <h3>Live Submission Activity Logs</h3>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Student</th>
                        <th>Challenge</th>
                        <th>Result</th>
                        <th>Flag Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.submission_logs.map(log => (
                        <tr key={log.id}>
                          <td><small>{new Date(log.submitted_at).toLocaleTimeString()}</small></td>
                          <td><b>{log.user_name}</b></td>
                          <td>{log.challenge_title}</td>
                          <td>
                            <span className={`status-pill ${log.is_correct ? "earned" : "locked"}`}>
                              {log.is_correct ? "CORRECT" : "INCORRECT"}
                            </span>
                          </td>
                          <td><code>{log.submitted_flag}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 2: CHALLENGE MANAGER */}
      {tab === "challenges" && (
        <div className="admin-two-col">
          {/* Create/Edit Form */}
          <div className="table-card form-card">
            <h3>{editingChall ? "Edit Challenge" : "Deploy New Challenge"}</h3>
            <form onSubmit={handleSaveChallenge}>
              <div className="form-group">
                <label>Title:</label>
                <input
                  type="text"
                  placeholder="e.g. SQL Injection Bypass"
                  value={challForm.title}
                  onChange={e => setChallForm({ ...challForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description (Markdown supported):</label>
                <textarea
                  placeholder="Describe the scenario and objective..."
                  value={challForm.description}
                  onChange={e => setChallForm({ ...challForm, description: e.target.value })}
                  rows={3}
                  required={challForm.flag_mode === "static"}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category:</label>
                  <select
                    value={challForm.category}
                    onChange={e => setChallForm({ ...challForm, category: e.target.value })}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Difficulty:</label>
                  <select
                    value={challForm.difficulty}
                    onChange={e => setChallForm({ ...challForm, difficulty: e.target.value })}
                  >
                    {DIFFICULTIES.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Points:</label>
                  <input
                    type="number"
                    min="10"
                    value={challForm.points}
                    onChange={e => setChallForm({ ...challForm, points: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Flag Mode:</label>
                  <select value={challForm.flag_mode} onChange={e => setChallForm({ ...challForm, flag_mode: e.target.value, flag: e.target.value === "static" ? challForm.flag : "" })}>
                    <option value="static">Static Flag</option>
                    <option value="user">Dynamic — Per Student</option>
                    <option value="team">Dynamic — Per Squad</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Lifecycle:</label>
                  <select value={challForm.status} onChange={e => setChallForm({ ...challForm, status: e.target.value })}>
                    <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {challForm.flag_mode !== "static" && (
                <div className="form-group">
                  <label>Dynamic Flag Secret (optional):</label>
                  <input type="text" placeholder="Leave blank to auto-generate" value={challForm.flag_secret} onChange={e => setChallForm({ ...challForm, flag_secret: e.target.value })} />
                  <small>Students never receive this secret. Use a strong external challenge secret in production.</small>
                </div>
              )}

              <div className="form-group">
                <label>Secret Flag {challForm.flag_mode !== "static" ? "(only needed for static mode)" : ""}:</label>
                <input
                  type="text"
                  placeholder="OWASP{exact_flag_here}"
                  value={challForm.flag}
                  onChange={e => setChallForm({ ...challForm, flag: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-2">
                  <label>Hint:</label>
                  <input
                    type="text"
                    placeholder="Helpful nudge for stuck students..."
                    value={challForm.hint}
                    onChange={e => setChallForm({ ...challForm, hint: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Hint Penalty (Pts):</label>
                  <input
                    type="number"
                    min="0"
                    value={challForm.hint_cost}
                    onChange={e => setChallForm({ ...challForm, hint_cost: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Connection Target (optional):</label>
                <input
                  type="text"
                  placeholder="e.g. nc challenges.owasp.club 9001 or URL"
                  value={challForm.connection_info}
                  onChange={e => setChallForm({ ...challForm, connection_info: e.target.value })}
                />
              </div>

              <div className="form-card live-runtime-card">
                <h3><FaServer /> Live Challenge Runtime</h3>
                <p className="subtitle">Configure a Docker image for an isolated per-user challenge instance. Leave blank for static-only challenges.</p>
                <div className="form-row">
                  <div className="form-group flex-2"><label>Docker Image</label><input placeholder="e.g. ghcr.io/your-org/ctf-web-demo:latest" value={challForm.runtime_image} onChange={e=>setChallForm({...challForm,runtime_image:e.target.value})}/></div>
                  <div className="form-group"><label>Container Port</label><input type="number" min="1" max="65535" placeholder="8080" value={challForm.runtime_port} onChange={e=>setChallForm({...challForm,runtime_port:e.target.value})}/></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Protocol</label><select value={challForm.runtime_protocol} onChange={e=>setChallForm({...challForm,runtime_protocol:e.target.value})}><option value="http">HTTP</option><option value="tcp">TCP</option></select></div>
                  <div className="form-group"><label>Max Instance Time (minutes)</label><input type="number" min="5" max="240" value={challForm.instance_timeout_minutes} onChange={e=>setChallForm({...challForm,instance_timeout_minutes:e.target.value})}/></div>
                </div>
              </div>

              <div className="form-group">
                <label>Challenge Downloadable File URL (optional):</label>
                <input
                  type="url"
                  placeholder="https://.../challenge.zip"
                  value={challForm.file_url}
                  onChange={e => setChallForm({ ...challForm, file_url: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Official Writeup (unlocked post-solve):</label>
                <textarea
                  placeholder="Step-by-step solution..."
                  value={challForm.writeup}
                  onChange={e => setChallForm({ ...challForm, writeup: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>Link to Event (optional):</label>
                <select
                  value={challForm.event_id}
                  onChange={e => setChallForm({ ...challForm, event_id: e.target.value })}
                >
                  <option value="">General Practice Arena</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-btn">
                  <FaPlus /> {editingChall ? "Update Challenge" : "Save Challenge"}
                </button>
                {editingChall && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setEditingChall(null);
                      setChallForm({
                        title: "",
                        description: "",
                        category: "Web Exploitation",
                        difficulty: "Easy",
                        points: 100,
                        flag: "",
                        hint: "",
                        hint_cost: 15,
                        writeup: "",
                        file_url: "",
                        connection_info: "",
                        event_id: "",
                        runtime_image: "",
                        runtime_port: "",
                        runtime_protocol: "http",
                        instance_timeout_minutes: 60
                      });
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {selectedHintChallenge && (
            <div className="table-card form-card">
              <h3>Hint Builder — Challenge #{selectedHintChallenge}</h3>
              <form onSubmit={addHint}>
                <div className="form-group"><label>Hint Title</label><input value={hintForm.title} onChange={e => setHintForm({ ...hintForm, title: e.target.value })} /></div>
                <div className="form-group"><label>Hint Content</label><textarea rows={3} required value={hintForm.content} onChange={e => setHintForm({ ...hintForm, content: e.target.value })} /></div>
                <div className="form-row"><div className="form-group"><label>Cost</label><input type="number" min="0" value={hintForm.cost} onChange={e => setHintForm({ ...hintForm, cost: e.target.value })} /></div><div className="form-group"><label>Order</label><input type="number" min="1" value={hintForm.order_index} onChange={e => setHintForm({ ...hintForm, order_index: e.target.value })} /></div></div>
                <button className="primary-btn" type="submit"><FaPlus /> Add Hint</button>
              </form>
              <div className="hint-admin-list">{hints.map(h => <div className="hint-admin-row" key={h.id}><b>{h.order_index}. {h.title}</b><span>{h.cost} pts</span><button className="icon-action-btn delete" onClick={async()=>{await api.delete(`/admin/challenges/${selectedHintChallenge}/hints/${h.id}`);loadHints(selectedHintChallenge)}}><FaTrash/></button></div>)}</div>
            </div>
          )}

          {/* Challenges List Table */}
          <div className="table-card">
            <h3>Existing Challenges ({challenges.length})</h3>
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Pts</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Solves</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map(c => (
                    <tr key={c.id}>
                      <td><b>{c.title}</b></td>
                      <td><span className="category-tag">{c.category}</span></td>
                      <td>{c.points}</td>
                      <td><span className="category-tag">{c.flag_mode || "static"}</span></td>
                      <td><span className={`status-badge ${c.status || "published"}`}>{(c.status || "published").toUpperCase()}</span></td>
                      <td>{c.solves_count}</td>
                      <td>
                        <div className="action-icons">
                          <button className="icon-action-btn" title="Manage hints" onClick={() => { setSelectedHintChallenge(c.id); loadHints(c.id); }}><FaLightbulb /></button>
                          <label className="icon-action-btn" title="Upload challenge file"><FaExternalLinkAlt /><input type="file" hidden onChange={e => uploadChallengeFile(c.id, e.target.files[0])} /></label>
                          {c.status !== "published" && <button className="icon-action-btn" title="Publish" onClick={() => publishChallenge(c.id)}><FaCheck /></button>}
                          {c.status !== "archived" && <button className="icon-action-btn delete" title="Archive" onClick={() => archiveChallenge(c.id)}><FaBan /></button>}
                          <button
                            className="icon-action-btn edit"
                            onClick={() => {
                              setEditingChall(c);
                              setChallForm({
                                title: c.title,
                                description: c.description,
                                category: c.category,
                                difficulty: c.difficulty,
                                points: c.points,
                                flag: "", // keep blank for safety unless edited
                                flag_mode: c.flag_mode || "static",
                                flag_secret: "",
                                status: c.status || "published",
                                hint: c.hint || "",
                                hint_cost: c.hint_cost || 15,
                                writeup: "",
                                file_url: c.file_url || "",
                                connection_info: c.connection_info || "",
                                event_id: c.event_id || "",
                                runtime_image: c.runtime_image || "",
                                runtime_port: c.runtime_port || "",
                                runtime_protocol: c.runtime_protocol || "http",
                                instance_timeout_minutes: c.instance_timeout_minutes || 60
                              });
                            }}
                            title="Edit"
                          >
                            <FaEdit />
                          </button>
                          <button
                            className="icon-action-btn delete"
                            onClick={() => handleDeleteChallenge(c.id)}
                            title="Delete"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EVENT MANAGER */}
      {tab === "events" && (
        <div className="admin-two-col">
          {/* Create Event Form */}
          <div className="table-card form-card">
            <h3>Schedule New Competition</h3>
            <form onSubmit={handleCreateEvent}>
              <div className="form-group">
                <label>Event Name:</label>
                <input
                  type="text"
                  placeholder="e.g. OWASP Annual Cyber Clash 2026"
                  value={eventForm.name}
                  onChange={e => setEventForm({ ...eventForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description:</label>
                <textarea
                  placeholder="Competition rules, team sizes, schedule..."
                  value={eventForm.description}
                  onChange={e => setEventForm({ ...eventForm, description: e.target.value })}
                  rows={3}
                  required
                />
              </div>

              <div className="form-group">
                <label>Participation Mode:</label>
                <select value={eventForm.participation_mode} onChange={e => setEventForm({ ...eventForm, participation_mode: e.target.value })}>
                  <option value="individual">Individual</option>
                  <option value="team">Team / Squad</option>
                  <option value="both">Individual + Team</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date & Time:</label>
                  <input
                    type="datetime-local"
                    value={eventForm.start_date}
                    onChange={e => setEventForm({ ...eventForm, start_date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>End Date & Time:</label>
                  <input
                    type="datetime-local"
                    value={eventForm.end_date}
                    onChange={e => setEventForm({ ...eventForm, end_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="primary-btn">
                <FaCalendarAlt /> Create Event
              </button>
            </form>
          </div>

          {/* Events List & Freeze Control */}
          <div className="table-card">
            <h3>Active & Scheduled Events</h3>
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Freeze Control</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id}>
                      <td>
                        <b>{ev.name}</b>
                        <small className="meta-time-block">
                          {new Date(ev.start_date).toLocaleDateString()} → {new Date(ev.end_date).toLocaleDateString()}
                        </small>
                      </td>
                      <td>
                        <span className={`status-badge ${ev.status}`}>{ev.status.toUpperCase()}</span>
                      </td>
                      <td>
                        <button
                          className={`freeze-toggle-btn ${ev.is_scoreboard_frozen ? "frozen" : "unfrozen"}`}
                          onClick={() => handleToggleFreeze(ev.id)}
                        >
                          <FaSnowflake /> {ev.is_scoreboard_frozen ? "Unfreeze Scoreboard" : "Freeze Scoreboard"}
                        </button>
                      </td>
                      <td>
                        <button
                          className="icon-action-btn delete"
                          onClick={() => handleDeleteEvent(ev.id)}
                        >
                          <FaTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: LIVE INSTANCES */}
      {tab === "live" && (
        <div className="admin-section">
          <div className="section-header"><div><h2>Live Challenge Instances</h2><p className="subtitle">Monitor isolated Docker challenge containers and stop running instances when necessary.</p></div><button className="secondary-btn" onClick={loadLiveInstances}><FaSyncAlt/> Refresh</button></div>
          <div className="table-card"><div className="table-responsive"><table className="custom-table"><thead><tr><th>Challenge</th><th>Student</th><th>Status</th><th>Endpoint</th><th>Expires</th><th>Action</th></tr></thead><tbody>{liveInstances.map(i=><tr key={i.id}><td><b>{i.challenge_title}</b></td><td>{i.user_name}</td><td><span className={`status-badge ${i.status}`}>{i.status.toUpperCase()}</span></td><td><code>{i.connection_url || "—"}</code></td><td>{i.expires_at ? new Date(i.expires_at).toLocaleString() : "—"}</td><td>{["running","starting"].includes(i.status)&&<button className="icon-action-btn delete" title="Stop instance" onClick={()=>stopLiveInstance(i.id)}><FaStop/></button>}</td></tr>)}{!liveInstances.length&&<tr><td colSpan="6">{liveLoading?"Loading instances…":"No live instances."}</td></tr>}</tbody></table></div></div>
        </div>
      )}

      {/* TAB 4: CERTIFICATE CENTER */}
      {tab === "certificates" && (
        <div className="table-card certificate-admin-panel">
          <h3><FaCertificate /> Certificate Center</h3>
          <p className="subtitle">Generate persistent PDF certificates for every registered participant after an event ends.</p>
          <div className="form-row">
            <div className="form-group flex-2">
              <label>Event</label>
              <select value={certEventId} onChange={e => { setCertEventId(e.target.value); loadCertificates(e.target.value); }}>
                <option value="">Select an event...</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{alignSelf:"end"}}>
              <button className="primary-btn" disabled={!certEventId} onClick={generateCertificates}><FaCertificate /> Generate PDFs</button>
            </div>
          </div>
          {certLoading ? <p>Loading certificates...</p> : certEventId ? (
            <div className="table-responsive">
              <table className="custom-table"><thead><tr><th>ID</th><th>Participant</th><th>College</th><th>Score</th><th>Rank</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{certificates.length ? certificates.map(c => <tr key={c.certificate_id}>
                <td><code>{c.certificate_id}</code></td><td><b>{c.name}</b></td><td>{c.college || "-"}</td><td>{c.score}</td><td>{c.rank || "-"}</td>
                <td><span className={`status-pill ${c.is_valid ? "earned" : "locked"}`}>{c.is_valid ? "VALID" : "REVOKED"}</span></td>
                <td>{c.is_valid && <button className="icon-action-btn delete" title="Revoke" onClick={() => revokeCertificate(c.certificate_id)}><FaTimes /></button>}</td>
              </tr>) : <tr><td colSpan="7" className="no-data">No certificates generated yet.</td></tr>}</tbody></table>
            </div>
          ) : <div className="empty-state"><FaCertificate className="empty-icon" /><h3>Select an event</h3><p>Certificates can be generated once the event has ended.</p></div>}
        </div>
      )}

      {/* TAB: PRIVATE FILE STORAGE */}
      {tab === "storage" && (
        <div className="admin-section">
          <div className="section-header"><div><h2>Private File Storage</h2><p className="subtitle">Challenge files and certificate PDFs can use private S3-compatible storage with short-lived signed downloads.</p></div><button className="secondary-btn" onClick={loadStorageStatus}><FaSyncAlt/> Refresh</button></div>
          <div className="stats-grid">
            <div className="stat-card"><span>Provider</span><strong>{storageStatus?.provider || "—"}</strong></div>
            <div className="stat-card"><span>Configured</span><strong>{storageStatus ? (storageStatus.configured ? "YES" : "NO") : "—"}</strong></div>
            <div className="stat-card"><span>Reachable</span><strong>{storageStatus ? (storageStatus.reachable ? "YES" : "NO") : "—"}</strong></div>
            <div className="stat-card"><span>Bucket</span><strong>{storageStatus?.bucket || "Local filesystem"}</strong></div>
          </div>
          <div className="table-card" style={{marginTop:"16px"}}>
            <h3>Storage policy</h3>
            <ul className="feature-list"><li>Students never receive public bucket URLs.</li><li>Authenticated download endpoints issue time-limited signed URLs.</li><li>Local filesystem remains available for development.</li><li>Existing local files can be migrated after object storage is configured.</li></ul>
            <button className="primary-btn" disabled={!storageStatus?.configured || storageLoading} onClick={migrateLocalStorage}>{storageLoading ? "Working…" : "Migrate Local Files"}</button>
          </div>
        </div>
      )}

      {/* TAB: PRODUCTION MONITORING */}
      {tab === "monitoring" && (
        <div className="admin-section">
          <div className="section-header"><div><h2><FaHeartbeat /> Production Monitor</h2><p className="subtitle">Operational health, request traffic, security alerts, and live challenge runtime.</p></div><button className="secondary-btn" onClick={loadMonitoring}><FaSyncAlt /> Refresh</button></div>
          {monitoringLoading ? <p>Loading monitoring data...</p> : monitoring ? <>
            <div className="stats-grid">
              <div className="stat-card"><span>Uptime</span><strong>{Math.floor((monitoring.runtime?.uptime_seconds || 0) / 60)} min</strong></div>
              <div className="stat-card"><span>Total requests</span><strong>{monitoring.runtime?.counters?.requests || 0}</strong></div>
              <div className="stat-card"><span>4xx responses</span><strong>{monitoring.runtime?.counters?.["4xx"] || 0}</strong></div>
              <div className="stat-card"><span>5xx responses</span><strong>{monitoring.runtime?.counters?.["5xx"] || 0}</strong></div>
              <div className="stat-card"><span>Live instances</span><strong>{monitoring.live_instances}</strong></div>
              <div className="stat-card"><span>Open alerts</span><strong>{monitoring.open_security_alerts}</strong></div>
            </div>
            <div className="table-card" style={{marginTop:"16px"}}><h3>Recent API requests</h3><div className="table-responsive"><table className="custom-table"><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Duration</th><th>Request ID</th></tr></thead><tbody>
              {(monitoring.runtime?.recent_requests || []).slice().reverse().map((r, i) => <tr key={i}><td>{new Date(r.timestamp).toLocaleString()}</td><td><b>{r.method}</b></td><td><code>{r.path}</code></td><td><span className="status-pill">{r.status}</span></td><td>{r.duration_ms} ms</td><td><code>{r.request_id}</code></td></tr>)}
              {!monitoring.runtime?.recent_requests?.length && <tr><td colSpan="6" className="no-data">No requests recorded yet.</td></tr>}
            </tbody></table></div></div>
          </> : <div className="empty-state"><h3>Monitoring unavailable</h3><p>Refresh after the backend is running.</p></div>}
        </div>
      )}

      {/* TAB 5: ANTI-CHEAT MONITOR */}
      {tab === "security" && (
        <div className="security-page">
          <div className="security-toolbar">
            <div>
              <h3>Competition Security Monitor</h3>
              <p className="subtitle">Automated detection for rapid submissions and repeated failed-flag patterns. Alerts require human review.</p>
            </div>
            <div className="toolbar-actions">
              <select value={securityFilter} onChange={e => { setSecurityFilter(e.target.value); setTimeout(loadSecurity, 0); }}>
                <option value="open">Open Alerts</option>
                <option value="reviewed">Reviewed</option>
                <option value="all">All Alerts</option>
              </select>
              <button className="secondary-btn" onClick={loadSecurity}><FaSyncAlt /> Refresh</button>
            </div>
          </div>

          {securityLoading ? <div className="loading-state"><div className="spinner"></div><p>Analyzing competition activity...</p></div> : (
            <>
              <div className="metrics-grid security-metrics">
                <div className="metric-box"><span className="metric-title">Open Alerts</span><b className="metric-num">{securityOverview?.open_alerts ?? 0}</b></div>
                <div className="metric-box"><span className="metric-title">High Severity</span><b className="metric-num">{securityOverview?.high_open_alerts ?? 0}</b></div>
                <div className="metric-box"><span className="metric-title">Failed Flags / 24h</span><b className="metric-num">{securityOverview?.failed_submissions_24h ?? 0}</b></div>
                <div className="metric-box"><span className="metric-title">Suspicious / 24h</span><b className="metric-num">{securityOverview?.suspicious_submissions_24h ?? 0}</b></div>
              </div>

              <div className="table-card">
                <div className="card-header-row"><h3>Security Alerts</h3><span className="status-pill">Human review required</span></div>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead><tr><th>Severity</th><th>Time</th><th>Student / Squad</th><th>Challenge</th><th>Detection</th><th>Risk</th><th>Action</th></tr></thead>
                    <tbody>
                      {securityAlerts.length ? securityAlerts.map(a => (
                        <tr key={a.id}>
                          <td><span className={`status-badge ${a.severity === "high" ? "archived" : "draft"}`}>{a.severity.toUpperCase()}</span></td>
                          <td><small>{new Date(a.created_at).toLocaleString()}</small></td>
                          <td><b>{a.user_name}</b>{a.team_name && <small className="meta-time-block">Team: {a.team_name}</small>}</td>
                          <td>{a.challenge_title || "—"}</td>
                          <td>{(a.metadata?.reasons || []).map(x => <span className="category-tag" key={x}>{x}</span>)}</td>
                          <td><b>{a.metadata?.risk_score ?? "—"}</b></td>
                          <td>{a.is_reviewed ? <span className="status-pill earned">REVIEWED</span> : <button className="secondary-btn small" onClick={() => reviewAlert(a.id)}><FaCheck /> Review</button>}</td>
                        </tr>
                      )) : <tr><td colSpan="7" className="no-data">No security alerts match this filter.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="table-card security-note">
                <h3>Detection rules</h3>
                <ul><li>Minimum 2-second gap between submissions.</li><li>Temporary cooldown after 25 failed flags in 5 minutes.</li><li>Rapid bursts, repeated failures, and many challenges in a short window increase a risk score.</li><li>Alerts do not automatically ban students; moderators decide what action is appropriate.</li></ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 6: USER CONTROLS */}
      {tab === "users" && (
        <div className="table-card">
          <div className="card-header-row">
            <h3>Registered Participants & Club Roles</h3>
            <input
              type="text"
              placeholder="Search user name or college..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="inline-search"
            />
          </div>

          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>College</th>
                  <th>Points</th>
                  <th>Current Role</th>
                  <th>Account Status</th>
                  <th>Change Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                      <small className="email-sub">{u.email}</small>
                    </td>
                    <td>{u.college || "—"}</td>
                    <td><b className="points-text">{u.points}</b></td>
                    <td>
                      <span className="role-tag">{u.role.toUpperCase()}</span>
                    </td>
                    <td>
                      <button
                        className={`status-pill clickable ${u.is_active ? "earned" : "locked"}`}
                        onClick={() => handleToggleActive(u.id)}
                        title="Click to toggle active/banned status"
                      >
                        {u.is_active ? <><FaCheck /> Active</> : <><FaBan /> Banned</>}
                      </button>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        onChange={e => handleChangeRole(u.id, e.target.value)}
                        className="role-select"
                      >
                        <option value="user">User</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
