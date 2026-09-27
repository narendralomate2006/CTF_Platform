import React, { useState, useEffect, useMemo } from "react";
import { api, getToken, API_URL } from "../api";
import {
  FaFlag,
  FaCheckCircle,
  FaLightbulb,
  FaLock,
  FaUnlock,
  FaTerminal,
  FaDownload,
  FaBookOpen,
  FaComments,
  FaTimes,
  FaSearch,
  FaCopy,
  FaCheck,
  FaExternalLinkAlt,
  FaServer,
  FaPlay,
  FaStop,
  FaTint,
  FaFire,
  FaArrowLeft,
  FaSyncAlt
} from "react-icons/fa";

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

export const CATEGORIES = [
  "All",
  "Web Exploitation",
  "Cryptography",
  "Forensics",
  "Reverse Engineering",
  "Pwn/Binary Exploitation",
  "OSINT",
  "Steganography",
  "Misc"
];

const DIFFICULTIES = ["All", "Easy", "Medium", "Hard", "Insane"];

export default function Challenges({ currentUser, onUserUpdated }) {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState(() => {
    const saved = localStorage.getItem("ctf_filter_category");
    if (saved && CATEGORIES.includes(saved)) {
      localStorage.removeItem("ctf_filter_category");
      return saved;
    }
    return "All";
  });
  const [selectedDifficulty, setSelectedDifficulty] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All"); // All, Solved, Unsolved
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("default");

  // Modal / Detail state
  const [activeModalChall, setActiveModalChall] = useState(null);
  const [modalTab, setModalTab] = useState("description"); // description, hints, writeup, discussion
  const [flagInput, setFlagInput] = useState("");
  const [submitResult, setSubmitResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Writeup & comments
  const [writeupText, setWriteupText] = useState("");
  const [comments, setComments] = useState([]);
  const [advancedHints, setAdvancedHints] = useState([]);
  const [hintBusy, setHintBusy] = useState(null);
  const [newComment, setNewComment] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [instance, setInstance] = useState(null);
  const [instanceBusy, setInstanceBusy] = useState(false);

  // Load all challenges
  const fetchChallenges = async () => {
    setLoading(true);
    try {
      const res = await api.get("/challenges");
      setChallenges(res.data.challenges || []);
    } catch (err) {
      console.error("Error fetching challenges:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChallenges();
  }, []);

  useEffect(() => {
    if (!activeModalChall || modalTab !== "hints") return;
    api.get(`/challenges/${activeModalChall.id}/hints`)
      .then(res => setAdvancedHints(res.data.hints || []))
      .catch(() => setAdvancedHints([]));
  }, [activeModalChall, modalTab]);

  const loadInstance = async (challId) => {
    try {
      const res = await api.get(`/challenges/${challId}/instance`);
      setInstance(res.data.instance || null);
    } catch {
      setInstance(null);
    }
  };

  const handleStartInstance = async () => {
    if (!activeModalChall) return;
    setInstanceBusy(true);
    setSubmitResult(null);
    try {
      const res = await api.post(`/challenges/${activeModalChall.id}/instance/start`);
      setInstance(res.data.instance);
      setSubmitResult({ type: "info", text: "Live sandbox instance started." });
    } catch (err) {
      setSubmitResult({ type: "error", text: err.response?.data?.detail || "Could not start live instance" });
    } finally {
      setInstanceBusy(false);
    }
  };

  const handleStopInstance = async () => {
    if (!activeModalChall) return;
    setInstanceBusy(true);
    try {
      await api.post(`/challenges/${activeModalChall.id}/instance/stop`);
      setInstance(null);
      setSubmitResult({ type: "info", text: "Live sandbox instance stopped." });
    } catch (err) {
      setSubmitResult({ type: "error", text: err.response?.data?.detail || "Could not stop instance" });
    } finally {
      setInstanceBusy(false);
    }
  };

  // Always route file downloads through our own backend endpoint
  // so auth (token) works and we aren't relying on external URLs
  const getFileDownloadUrl = (challId) => {
    const token = getToken();
    const base = `${API_URL}/challenges/${challId}/file`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  };

  // Open Challenge Modal
  const openModal = async (chall) => {
    setActiveModalChall(chall);
    setModalTab("description");
    setFlagInput("");
    setSubmitResult(null);
    setWriteupText("");
    setComments([]);
    setAdvancedHints([]);
    setInstance(null);

    if (chall.runtime_enabled) {
      loadInstance(chall.id);
    }

    try {
      const res = await api.get(`/challenges/${chall.id}`);
      setActiveModalChall(res.data.challenge);
      if (res.data.challenge?.runtime_enabled) {
        loadInstance(res.data.challenge.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Unlock Standard Hint
  const handleUnlockHint = async () => {
    if (!activeModalChall) return;
    const confirmUnlock = window.confirm(
      `Unlocking this hint will deduct ${activeModalChall.hint_cost || 15} points. Do you want to proceed?`
    );
    if (!confirmUnlock) return;

    try {
      const res = await api.post(`/challenges/${activeModalChall.id}/unlock-hint`);
      setActiveModalChall(prev => ({
        ...prev,
        hint_unlocked: true,
        hint: res.data.hint
      }));
      setSubmitResult({ type: "info", text: res.data.message });
      if (onUserUpdated) onUserUpdated();
    } catch (err) {
      setSubmitResult({
        type: "error",
        text: err.response?.data?.detail || "Failed to unlock hint"
      });
    }
  };

  // Submit Flag
  const handleSubmitFlag = async (e) => {
    e.preventDefault();
    if (!flagInput.trim() || !activeModalChall) return;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await api.post(`/challenges/${activeModalChall.id}/submit`, {
        flag: flagInput.trim()
      });

      if (res.data.correct) {
        setSubmitResult({
          type: "success",
          text: `✓ Correct flag! +${activeModalChall.points} points awarded`,
          is_first_blood: res.data.is_first_blood
        });
        setActiveModalChall(prev => ({
          ...prev,
          is_solved: true,
          solves_count: (prev?.solves_count || 0) + 1,
          first_blood: prev?.first_blood || (res.data.is_first_blood ? {
            user_name: currentUser?.name || "You",
            college: currentUser?.college || "PCCOE",
            time: new Date().toISOString()
          } : null)
        }));
        setChallenges(prev =>
          prev.map(c => c.id === activeModalChall.id ? {
            ...c,
            is_solved: true,
            solves_count: (c.solves_count || 0) + 1
          } : c)
        );
        if (onUserUpdated) onUserUpdated();
      } else {
        setSubmitResult({
          type: "error",
          text: "✕ Incorrect flag. Please inspect your solution and try again.",
          is_first_blood: false
        });
      }
    } catch (err) {
      setSubmitResult({
        type: "error",
        text: err.response?.data?.detail || "Submission failed. Please wait before retrying."
      });
    } finally {
      setSubmitting(false);
    }
  };

  const loadWriteup = async () => {
    setModalTab("writeup");
    try {
      const res = await api.get(`/challenges/${activeModalChall.id}/writeup`);
      setWriteupText(res.data.writeup);
    } catch (err) {
      setWriteupText(err.response?.data?.detail || "Writeup locked until challenge is solved.");
    }
  };

  const loadComments = async () => {
    setModalTab("discussion");
    try {
      const res = await api.get(`/challenges/${activeModalChall.id}/comments`);
      setComments(res.data.comments || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setCommentLoading(true);
    try {
      const res = await api.post(`/challenges/${activeModalChall.id}/comments`, {
        content: newComment.trim()
      });
      setComments(prev => [...prev, res.data.comment]);
      setNewComment("");
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to post comment");
    } finally {
      setCommentLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter challenges
  const filteredChallenges = useMemo(() => {
    return challenges.filter(c => {
      if (selectedCategory !== "All" && c.category !== selectedCategory) return false;
      if (selectedDifficulty !== "All" && (c.difficulty || "").toLowerCase() !== selectedDifficulty.toLowerCase()) return false;
      if (selectedStatus === "Solved" && !c.is_solved) return false;
      if (selectedStatus === "Unsolved" && c.is_solved) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchTitle = (c.title || "").toLowerCase().includes(query);
        const matchCat = (c.category || "").toLowerCase().includes(query);
        const matchDesc = (c.description || "").toLowerCase().includes(query);
        if (!matchTitle && !matchCat && !matchDesc) return false;
      }
      return true;
    });
  }, [challenges, selectedCategory, selectedDifficulty, selectedStatus, searchQuery]);

  // Sort challenges
  const sortedChallenges = useMemo(() => {
    const list = [...filteredChallenges];
    if (sortBy === "points-asc") {
      return list.sort((a, b) => (a.points || 0) - (b.points || 0));
    }
    if (sortBy === "points-desc") {
      return list.sort((a, b) => (b.points || 0) - (a.points || 0));
    }
    if (sortBy === "solves-desc") {
      return list.sort((a, b) => (b.solves_count || 0) - (a.solves_count || 0));
    }
    if (sortBy === "title-asc") {
      return list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list; // default
  }, [filteredChallenges, sortBy]);

  const solvedCount = challenges.filter(c => c.is_solved).length;

  const resetAllFilters = () => {
    setSelectedCategory("All");
    setSelectedDifficulty("All");
    setSelectedStatus("All");
    setSortBy("default");
    setSearchQuery("");
  };

  return (
    <div className="challenges-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="platform-breadcrumb">
            <span className="breadcrumb-link" onClick={() => setSelectedCategory("All")}>
              OWASP PCCOE CTF Academy
            </span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-active">Challenges</span>
            {selectedCategory !== "All" && (
              <>
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-active">{selectedCategory}</span>
              </>
            )}
          </div>
          <h1 className="page-title">Challenges</h1>
          <p className="page-subtitle">
            Solve cybersecurity challenges, practice offensive & defensive skills, and capture flags.
          </p>
        </div>

        <div className="page-stats-summary">
          <span className="stat-pill-item">
            Solved: <b>{solvedCount}</b> / {challenges.length}
          </span>
        </div>
      </div>

      {/* LeetCode-style Horizontal Filter Bar */}
      <div className="filter-toolbar">
        <div className="filter-search-box">
          <FaSearch className="filter-search-icon" />
          <input
            type="text"
            className="filter-search-input"
            placeholder="Search challenges by title, category, or keyword..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
              <FaTimes />
            </button>
          )}
        </div>

        <div className="filter-controls-row">
          <div className="filter-select-group">
            <label>Category:</label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="clean-select"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="filter-select-group">
            <label>Difficulty:</label>
            <select
              value={selectedDifficulty}
              onChange={e => setSelectedDifficulty(e.target.value)}
              className="clean-select"
            >
              {DIFFICULTIES.map(diff => (
                <option key={diff} value={diff}>{diff}</option>
              ))}
            </select>
          </div>

          <div className="filter-select-group">
            <label>Status:</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="clean-select"
            >
              <option value="All">All</option>
              <option value="Solved">Solved</option>
              <option value="Unsolved">Unsolved</option>
            </select>
          </div>

          <div className="filter-select-group">
            <label>Sort:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="clean-select"
            >
              <option value="default">Default</option>
              <option value="points-asc">Points: Low to High</option>
              <option value="points-desc">Points: High to Low</option>
              <option value="solves-desc">Most Solved</option>
              <option value="title-asc">Title: A-Z</option>
            </select>
          </div>

          {(selectedCategory !== "All" || selectedDifficulty !== "All" || selectedStatus !== "All" || searchQuery || sortBy !== "default") && (
            <button className="btn-secondary btn-sm" onClick={resetAllFilters}>
              <FaTimes /> Reset
            </button>
          )}
        </div>
      </div>

      {/* LeetCode-style Problem Table */}
      {loading ? (
        <div className="table-skeleton-wrap">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : sortedChallenges.length === 0 ? (
        <div className="card empty-card">
          <FaFlag className="empty-icon" />
          <h3>No challenges found</h3>
          <p>Try modifying your search or clearing your active filters.</p>
          <button className="btn-primary btn-sm" onClick={resetAllFilters}>
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="card table-card">
          <div className="table-responsive">
            <table className="clean-table challenge-table">
              <thead>
                <tr>
                  <th style={{ width: "48px", textAlign: "center" }}>Status</th>
                  <th>Title</th>
                  <th style={{ width: "180px" }}>Category</th>
                  <th style={{ width: "120px" }}>Difficulty</th>
                  <th style={{ width: "100px", textAlign: "right" }}>Points</th>
                  <th style={{ width: "130px", textAlign: "right" }}>Solves</th>
                  <th style={{ width: "90px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedChallenges.map(chall => {
                  const diffClass = (chall.difficulty || "easy").toLowerCase();
                  const accRate = chall.acceptance_rate ?? (chall.total_attempts ? Math.round((chall.solves_count / chall.total_attempts) * 100) : (chall.solves_count > 0 ? 100 : 0));

                  return (
                    <tr
                      key={chall.id}
                      className={`chall-row ${chall.is_solved ? "row-solved" : ""}`}
                      onClick={() => openModal(chall)}
                    >
                      <td style={{ textAlign: "center" }}>
                        {chall.is_solved ? (
                          <span className="status-solved" title="Solved">✓</span>
                        ) : (
                          <span className="status-unsolved" title="Unsolved">○</span>
                        )}
                      </td>
                      <td>
                        <div className="chall-title-cell">
                          <span className="chall-title-text">{chall.title}</span>
                          {chall.first_blood && (
                            <span className="fb-tag-mini" title={`First blood captured by ${chall.first_blood.user_name}`}>
                              🩸 FB
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="category-cell-pill">{chall.category}</span>
                      </td>
                      <td>
                        <span className={`diff-pill ${diffClass}`}>
                          {chall.difficulty}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }} className="mono-points">
                        {chall.points}
                      </td>
                      <td style={{ textAlign: "right" }} className="solves-cell">
                        <span>{chall.solves_count || 0}</span>
                        <small className="acc-rate">({accRate}%)</small>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          className={`btn-row-action ${chall.is_solved ? "btn-review" : "btn-solve"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openModal(chall);
                          }}
                        >
                          {chall.is_solved ? "Review" : "Solve"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-footer-info">
            <span>Showing {sortedChallenges.length} of {challenges.length} challenges</span>
          </div>
        </div>
      )}

      {/* LeetCode + Hack The Box Challenge Detail Modal */}
      {activeModalChall && (
        <div className="modal-backdrop" onClick={() => setActiveModalChall(null)}>
          <div className="problem-modal-content" onClick={e => e.stopPropagation()}>
            {/* Modal Topbar */}
            <div className="problem-modal-topbar">
              <div className="modal-top-left">
                <span className="problem-crumb">
                  OWASP PCCOE / Challenges / {activeModalChall.category}
                </span>
                <h2 className="problem-title">{activeModalChall.title}</h2>
                <div className="problem-meta-strip">
                  <span className="category-cell-pill">{activeModalChall.category}</span>
                  <span className={`diff-pill ${(activeModalChall.difficulty || "easy").toLowerCase()}`}>
                    {activeModalChall.difficulty}
                  </span>
                  <span className="meta-points">{activeModalChall.points} pts</span>
                  {activeModalChall.scoring_mode === "decaying" && (
                    <span className="subtle-badge" title="Dynamic points decay as more competitors solve">Decaying</span>
                  )}
                  <span className="meta-solves">· {activeModalChall.solves_count || 0} solves</span>
                  {activeModalChall.is_solved && (
                    <span className="solved-status-badge">
                      <FaCheckCircle /> Solved
                    </span>
                  )}
                </div>
              </div>

              <button
                className="modal-close-icon-btn"
                onClick={() => setActiveModalChall(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            {/* Developer Tabs */}
            <div className="problem-tabs-header">
              <button
                className={`problem-tab-btn ${modalTab === "description" ? "active" : ""}`}
                onClick={() => setModalTab("description")}
              >
                <FaFlag /> Description
              </button>
              <button
                className={`problem-tab-btn ${modalTab === "hints" ? "active" : ""}`}
                onClick={() => setModalTab("hints")}
              >
                <FaLightbulb /> Hints{" "}
                {(advancedHints.length > 0 ? advancedHints.some(h => h.unlocked) : activeModalChall.hint_unlocked) ? (
                  <span className="tab-pill-unlocked">Unlocked</span>
                ) : (
                  <FaLock className="tab-lock-icon" />
                )}
              </button>
              <button
                className={`problem-tab-btn ${modalTab === "writeup" ? "active" : ""}`}
                onClick={loadWriteup}
              >
                <FaBookOpen /> Writeup {!activeModalChall.is_solved && !activeModalChall.event_ended && currentUser?.role !== "admin" && <FaLock className="tab-lock-icon" />}
              </button>
              <button
                className={`problem-tab-btn ${modalTab === "discussion" ? "active" : ""}`}
                onClick={loadComments}
              >
                <FaComments /> Discussion {!activeModalChall.is_solved && currentUser?.role !== "admin" && <FaLock className="tab-lock-icon" />}
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="problem-modal-body">
              {/* TAB 1: DESCRIPTION */}
              {modalTab === "description" && (
                <div className="problem-pane">
                  {/* First Blood notice if present */}
                  {activeModalChall.first_blood && (
                    <div className="fb-compact-callout">
                      <FaTint className="fb-drop-icon" />
                      <span>
                        First blood captured by <b>{activeModalChall.first_blood.user_name}</b>
                        {activeModalChall.first_blood.college && ` (${activeModalChall.first_blood.college})`}
                      </span>
                    </div>
                  )}

                  {/* Problem Description */}
                  <div className="problem-statement">
                    <h4>Challenge Description</h4>
                    <p className="statement-text">{activeModalChall.description}</p>
                  </div>

                  {/* Connection or Files */}
                  {(activeModalChall.connection_info || activeModalChall.file_url || activeModalChall.runtime_enabled) && (
                    <div className="challenge-resources-section">
                      <h4>Resources & Targets</h4>

                      {activeModalChall.connection_info && (
                        <div className="resource-item">
                          <span className="res-title"><FaTerminal /> Connection Target:</span>
                          <div className="code-box">
                            <code>{activeModalChall.connection_info}</code>
                            <button
                              className="btn-copy-code"
                              onClick={() => copyToClipboard(activeModalChall.connection_info)}
                              title="Copy command"
                            >
                              {copied ? <FaCheck /> : <FaCopy />}
                            </button>
                          </div>
                        </div>
                      )}

                      {activeModalChall.file_url && (
                        <div className="resource-item">
                          <span className="res-title"><FaDownload /> Challenge Files:</span>
                          <a
                            href={getFileDownloadUrl(activeModalChall.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary btn-sm"
                          >
                            📦 Download Challenge Files <FaExternalLinkAlt />
                          </a>
                        </div>
                      )}

                      {activeModalChall.runtime_enabled && (
                        <div className="resource-item docker-instance-box">
                          <div className="docker-info-head">
                            <span className="docker-title">
                              <FaServer /> Live Sandbox Environment
                            </span>
                            <small>Isolated temporary instance</small>
                          </div>
                          {instance?.status === "running" ? (
                            <div className="docker-running-row">
                              <code className="docker-url">{instance.connection_url}</code>
                              <a
                                href={instance.connection_url}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-primary btn-sm"
                              >
                                Open Sandbox <FaExternalLinkAlt />
                              </a>
                              <button
                                className="btn-danger btn-sm"
                                onClick={handleStopInstance}
                                disabled={instanceBusy}
                              >
                                <FaStop /> {instanceBusy ? "Stopping..." : "Stop"}
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn-primary btn-sm"
                              onClick={handleStartInstance}
                              disabled={instanceBusy}
                            >
                              <FaPlay /> {instanceBusy ? "Starting..." : "Start Instance"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Flag Submission Area */}
                  <div className="flag-submission-section">
                    <h4>Submit Flag</h4>
                    {activeModalChall.is_solved ? (
                      <div className="solved-success-banner">
                        <FaCheckCircle className="check-icon" />
                        <div>
                          <b>Challenge already solved</b>
                          <p>You have successfully captured this flag.</p>
                        </div>
                      </div>
                    ) : (
                      <form className="clean-flag-form" onSubmit={handleSubmitFlag}>
                        <div className="flag-input-group">
                          <input
                            type="text"
                            className="clean-input font-mono"
                            placeholder="OWASP{your_flag_here}"
                            value={flagInput}
                            onChange={e => setFlagInput(e.target.value)}
                            required
                            disabled={submitting}
                          />
                          <button
                            type="submit"
                            className="btn-primary btn-submit-flag"
                            disabled={submitting || !flagInput.trim()}
                          >
                            {submitting ? "Checking..." : "Submit Flag"}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Result Alerts */}
                    {submitResult && (
                      <div className={`flag-result-alert ${submitResult.type}`}>
                        {submitResult.type === "success" && <FaCheckCircle />}
                        <span>{submitResult.text}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: HINTS */}
              {modalTab === "hints" && (
                <div className="problem-pane">
                  <div className="hints-container">
                    <h4>Hints</h4>
                    {advancedHints.length > 0 ? (
                      advancedHints.map(h => (
                        <div className="hint-card" key={h.id}>
                          <div className="hint-card-head">
                            <span className="hint-num"><FaLightbulb /> Hint #{h.order_index}</span>
                            <span className="hint-cost">{h.cost || activeModalChall.hint_cost || 15} pts</span>
                          </div>
                          {h.unlocked ? (
                            <div className="hint-unlocked-body">
                              <div className="hint-status-tag unlocked">
                                <FaUnlock /> Unlocked
                              </div>
                              <p className="hint-content">{h.content}</p>
                            </div>
                          ) : (
                            <div className="hint-card-locked-inner">
                              <div className="hint-lock-icon-circle">
                                <FaLock />
                              </div>
                              <h5>Hint #{h.order_index} is Locked</h5>
                              <p>
                                Unlocking this hint will deduct <b>{h.cost || activeModalChall.hint_cost || 15} points</b> from your total score.
                              </p>
                              <button
                                className="primary-btn btn-sm"
                                disabled={hintBusy === h.id}
                                onClick={async () => {
                                  const cost = h.cost || activeModalChall.hint_cost || 15;
                                  if (!window.confirm(`Unlock Hint #${h.order_index}?\n\nThis will deduct ${cost} points from your score.`)) return;
                                  setHintBusy(h.id);
                                  try {
                                    const res = await api.post(`/challenges/${activeModalChall.id}/hints/${h.id}/unlock`);
                                    const r = await api.get(`/challenges/${activeModalChall.id}/hints`);
                                    setAdvancedHints(r.data.hints || []);
                                    setActiveModalChall(prev => ({
                                      ...prev,
                                      hint_unlocked: true,
                                      hint: res.data.hint || prev.hint
                                    }));
                                    setSubmitResult({
                                      type: "info",
                                      text: res.data.message || `Hint unlocked! -${cost} points deducted.`
                                    });
                                    if (onUserUpdated) onUserUpdated();
                                  } catch (err) {
                                    setSubmitResult({
                                      type: "error",
                                      text: err.response?.data?.detail || "Failed to unlock hint"
                                    });
                                  } finally {
                                    setHintBusy(null);
                                  }
                                }}
                              >
                                <FaUnlock /> {hintBusy === h.id ? "Unlocking..." : `Unlock Hint (-${h.cost || activeModalChall.hint_cost || 15} pts)`}
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    ) : activeModalChall.hint ? (
                      activeModalChall.hint_unlocked ? (
                        <div className="hint-card">
                          <div className="hint-card-head">
                            <span className="hint-num"><FaLightbulb /> Challenge Hint</span>
                            <span className="hint-status-tag unlocked"><FaUnlock /> Unlocked</span>
                          </div>
                          <p className="hint-content">{activeModalChall.hint}</p>
                        </div>
                      ) : (
                        <div className="hint-card hint-card-locked">
                          <div className="hint-lock-icon-circle">
                            <FaLock />
                          </div>
                          <h5>Challenge Hint is Locked</h5>
                          <p>
                            Unlocking this hint will deduct <b>{activeModalChall.hint_cost || 15} points</b> from your total score.
                          </p>
                          <button className="primary-btn btn-sm" onClick={handleUnlockHint}>
                            <FaUnlock /> Unlock Hint (-{activeModalChall.hint_cost || 15} pts)
                          </button>
                        </div>
                      )
                    ) : (
                      <p className="empty-subtle">No hints available for this challenge.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: WRITEUP */}
              {modalTab === "writeup" && (
                <div className="problem-pane">
                  {!activeModalChall.is_solved && !activeModalChall.event_ended && currentUser?.role !== "admin" ? (
                    <div className="locked-pane-box">
                      <FaLock className="lock-pane-icon" />
                      <h4>Writeup Locked</h4>
                      <p>You must solve this challenge first or wait until the event closes to view the official writeup and solution walkthrough.</p>
                    </div>
                  ) : (
                    <div className="writeup-container">
                      <div className="writeup-header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <h4>Official Solution Writeup</h4>
                        {activeModalChall.event_ended && !activeModalChall.is_solved && (
                          <span className="subtle-badge" style={{ color: "var(--accent-cyan)" }}>Event Concluded • Solution Unlocked</span>
                        )}
                      </div>
                      <div className="writeup-code-block font-mono">
                        <pre>{writeupText}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: DISCUSSION */}
              {modalTab === "discussion" && (
                <div className="problem-pane">
                  {!activeModalChall.is_solved && currentUser?.role !== "admin" ? (
                    <div className="locked-pane-box">
                      <FaLock className="lock-pane-icon" />
                      <h4>Discussion Locked</h4>
                      <p>To prevent flag leaks and spoilers, challenge discussions are available only after solving.</p>
                    </div>
                  ) : (
                    <div className="discussion-container">
                      <h4>Community Discussions</h4>
                      <form className="comment-post-form" onSubmit={handlePostComment}>
                        <textarea
                          className="clean-textarea"
                          placeholder="Share your solving approach or technical thoughts (never post plain flags)..."
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          rows={3}
                          required
                        />
                        <div className="comment-btn-row">
                          <button type="submit" className="btn-primary btn-sm" disabled={commentLoading}>
                            {commentLoading ? "Posting..." : "Post Comment"}
                          </button>
                        </div>
                      </form>

                      <div className="comments-thread">
                        {comments.length === 0 ? (
                          <p className="empty-subtle">No comments yet. Be the first to share your perspective!</p>
                        ) : (
                          comments.map(c => (
                            <div key={c.id} className="comment-card">
                              <div className="comment-meta">
                                <span className="comment-author">
                                  {c.user.name} {c.user.college && <small>({c.user.college})</small>}
                                </span>
                                <span className="comment-date">
                                  {new Date(c.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="comment-body">{c.content}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
