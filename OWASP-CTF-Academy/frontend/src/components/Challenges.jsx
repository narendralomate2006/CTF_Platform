import React, { useState, useEffect } from "react";
import { api } from "../api";
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
  FaExternalLinkAlt
} from "react-icons/fa";

const CATEGORIES = [
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
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All"); // All, Solved, Unsolved
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state
  const [activeModalChall, setActiveModalChall] = useState(null);
  const [modalTab, setModalTab] = useState("details"); // 'details', 'hint', 'writeup', 'comments'
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

  // Load challenges
  const fetchChallenges = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedCategory !== "All") params.category = selectedCategory;
      if (selectedDifficulty !== "All") params.difficulty = selectedDifficulty;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get("/challenges", { params });
      setChallenges(res.data.challenges || []);
    } catch (err) {
      console.error("Error fetching challenges:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChallenges();
  }, [selectedCategory, selectedDifficulty, searchQuery]);

  useEffect(() => {
    if (!activeModalChall || modalTab !== "hint") return;
    api.get(`/challenges/${activeModalChall.id}/hints`).then(res => setAdvancedHints(res.data.hints || [])).catch(() => setAdvancedHints([]));
  }, [activeModalChall, modalTab]);

  // Open Challenge Modal
  const openModal = async (chall) => {
    setActiveModalChall(chall);
    setModalTab("details");
    setFlagInput("");
    setSubmitResult(null);
    setWriteupText("");
    setComments([]);
    setAdvancedHints([]);

    // Fetch full challenge details
    try {
      const res = await api.get(`/challenges/${chall.id}`);
      setActiveModalChall(res.data.challenge);
    } catch (err) {
      console.error(err);
    }
  };

  // Unlock Hint
  const handleUnlockHint = async () => {
    if (!activeModalChall) return;
    const confirmUnlock = window.confirm(
      `Unlocking this hint will deduct ${activeModalChall.hint_cost || 15} points from your score. Do you want to proceed?`
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
          text: res.data.message
        });
        setActiveModalChall(prev => ({
          ...prev,
          is_solved: true,
          solves_count: prev.solves_count + 1
        }));
        // Update challenge list item
        setChallenges(prev =>
          prev.map(c => c.id === activeModalChall.id ? { ...c, is_solved: true, solves_count: c.solves_count + 1 } : c)
        );
        if (onUserUpdated) onUserUpdated();
      } else {
        setSubmitResult({
          type: "error",
          text: res.data.message
        });
      }
    } catch (err) {
      setSubmitResult({
        type: "error",
        text: err.response?.data?.detail || "Submission failed"
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Fetch Writeup
  const loadWriteup = async () => {
    setModalTab("writeup");
    try {
      const res = await api.get(`/challenges/${activeModalChall.id}/writeup`);
      setWriteupText(res.data.writeup);
    } catch (err) {
      setWriteupText(err.response?.data?.detail || "Writeup locked.");
    }
  };

  // Fetch Comments
  const loadComments = async () => {
    setModalTab("comments");
    try {
      const res = await api.get(`/challenges/${activeModalChall.id}/comments`);
      setComments(res.data.comments || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Post Comment
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

  // Filter challenges by status
  const filteredChallenges = challenges.filter(c => {
    if (selectedStatus === "Solved") return c.is_solved;
    if (selectedStatus === "Unsolved") return !c.is_solved;
    return true;
  });

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="challenges-page">
      {/* Header Banner */}
      <div className="section-header">
        <div>
          <h2>Security Challenge Arena</h2>
          <p className="subtitle">
            Practice real-world cybersecurity problems. Exploit vulnerabilities, capture flags, climb rankings.
          </p>
        </div>

        {/* Search */}
        <div className="search-bar">
          <FaSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search challenges by title or keyword..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="category-scroll-bar">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`cat-pill ${selectedCategory === cat ? "active" : ""}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Filters Bar: Difficulty & Status */}
      <div className="filters-bar">
        <div className="filter-group">
          <label>Difficulty:</label>
          <div className="filter-buttons">
            {DIFFICULTIES.map(diff => (
              <button
                key={diff}
                className={`filter-btn ${selectedDifficulty === diff ? "active" : ""}`}
                onClick={() => setSelectedDifficulty(diff)}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label>Status:</label>
          <div className="filter-buttons">
            {["All", "Solved", "Unsolved"].map(status => (
              <button
                key={status}
                className={`filter-btn ${selectedStatus === status ? "active" : ""}`}
                onClick={() => setSelectedStatus(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Challenge Grid */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Scanning vulnerability instances...</p>
        </div>
      ) : filteredChallenges.length === 0 ? (
        <div className="empty-state">
          <FaFlag className="empty-icon" />
          <h3>No challenges match your criteria</h3>
          <p>Try clearing filters or search terms.</p>
        </div>
      ) : (
        <div className="challenge-grid">
          {filteredChallenges.map(chall => {
            const diffClass = (chall.difficulty || "easy").toLowerCase();
            return (
              <div
                key={chall.id}
                className={`challenge-card ${chall.is_solved ? "solved" : ""}`}
                onClick={() => openModal(chall)}
              >
                <div className="card-top">
                  <span className="category-tag">{chall.category}</span>
                  <span className={`difficulty-tag ${diffClass}`}>
                    {chall.difficulty}
                  </span>
                </div>

                <h3 className="chall-title">{chall.title}</h3>
                <p className="chall-desc">{chall.description}</p>

                <div className="card-footer">
                  <div className="points-badge">
                    <b>{chall.points}</b> <small>PTS</small>
                  </div>

                  <div className="solves-info">
                    {chall.solves_count} solves
                  </div>

                  {chall.is_solved ? (
                    <span className="solved-indicator">
                      <FaCheckCircle /> Solved
                    </span>
                  ) : (
                    <button className="solve-btn">
                      Solve <FaFlag />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Challenge Modal */}
      {activeModalChall && (
        <div className="modal-backdrop" onClick={() => setActiveModalChall(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setActiveModalChall(null)}>
              <FaTimes />
            </button>

            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-tags">
                <span className="category-tag">{activeModalChall.category}</span>
                <span className={`difficulty-tag ${(activeModalChall.difficulty || "easy").toLowerCase()}`}>
                  {activeModalChall.difficulty}
                </span>
                <span className="points-badge">
                  <b>{activeModalChall.points}</b> PTS
                </span>
                {activeModalChall.is_solved && (
                  <span className="solved-badge-pill">
                    <FaCheckCircle /> SOLVED
                  </span>
                )}
              </div>
              <h2>{activeModalChall.title}</h2>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="modal-tabs">
              <button
                className={`modal-tab ${modalTab === "details" ? "active" : ""}`}
                onClick={() => setModalTab("details")}
              >
                <FaFlag /> Challenge
              </button>

              <button
                className={`modal-tab ${modalTab === "hint" ? "active" : ""}`}
                onClick={() => setModalTab("hint")}
              >
                <FaLightbulb /> Hint
                {activeModalChall.hint_unlocked ? " (Unlocked)" : ` (-${activeModalChall.hint_cost || 15} pts)`}
              </button>

              <button
                className={`modal-tab ${modalTab === "writeup" ? "active" : ""}`}
                onClick={loadWriteup}
              >
                <FaBookOpen /> Writeup {!activeModalChall.is_solved && <FaLock className="lock-icon" />}
              </button>

              <button
                className={`modal-tab ${modalTab === "comments" ? "active" : ""}`}
                onClick={loadComments}
              >
                <FaComments /> Discussion {!activeModalChall.is_solved && <FaLock className="lock-icon" />}
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* TAB 1: DETAILS */}
              {modalTab === "details" && (
                <div className="tab-pane">
                  <div className="description-box">
                    <p>{activeModalChall.description}</p>
                  </div>

                  {/* Connection command or files */}
                  {(activeModalChall.connection_info || activeModalChall.file_url) && (
                    <div className="resources-box">
                      {activeModalChall.connection_info && (
                        <div className="connection-info">
                          <span className="res-label"><FaTerminal /> Connection Target:</span>
                          <div className="code-snippet">
                            <code>{activeModalChall.connection_info}</code>
                            <button
                              className="copy-btn"
                              onClick={() => copyToClipboard(activeModalChall.connection_info)}
                            >
                              {copied ? <FaCheck /> : <FaCopy />}
                            </button>
                          </div>
                        </div>
                      )}

                      {activeModalChall.file_url && (
                        <div className="file-attachment">
                          <span className="res-label"><FaDownload /> Challenge File:</span>
                          <a
                            href={activeModalChall.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="download-link"
                          >
                            Download Challenge File <FaExternalLinkAlt />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Flag Submission Form */}
                  <form className="flag-submit-form" onSubmit={handleSubmitFlag}>
                    <label>Submit Captured Flag:</label>
                    <div className="flag-input-row">
                      <input
                        type="text"
                        placeholder="OWASP{your_captured_flag_here}"
                        value={flagInput}
                        onChange={e => setFlagInput(e.target.value)}
                        required
                        disabled={submitting}
                      />
                      <button type="submit" className="primary-btn submit-btn" disabled={submitting}>
                        {submitting ? "Checking..." : "Submit Flag"}
                      </button>
                    </div>
                  </form>

                  {/* Submission alerts */}
                  {submitResult && (
                    <div className={`alert-banner ${submitResult.type}`}>
                      {submitResult.type === "success" && <FaCheckCircle />}
                      <span>{submitResult.text}</span>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: HINT */}
              {modalTab === "hint" && (
                <div className="tab-pane">
                  {advancedHints.length > 0 ? advancedHints.map(h => (
                    <div className="hint-admin-row" key={h.id} style={{ marginBottom: 12 }}>
                      <div><div className="hint-title"><FaLightbulb /> {h.order_index}. {h.title}</div>{h.unlocked ? <p>{h.content}</p> : <p>Locked hint — costs <b>{h.cost} points</b>.</p>}</div>
                      {!h.unlocked && currentUser && <button className="primary-btn unlock-btn" disabled={hintBusy === h.id} onClick={async () => { if (!window.confirm(`Unlock this hint for ${h.cost} points?`)) return; setHintBusy(h.id); try { await api.post(`/challenges/${activeModalChall.id}/hints/${h.id}/unlock`); const r = await api.get(`/challenges/${activeModalChall.id}/hints`); setAdvancedHints(r.data.hints || []); if (onUserUpdated) onUserUpdated(); } catch (err) { setSubmitResult({ type: "error", text: err.response?.data?.detail || "Failed to unlock hint" }); } finally { setHintBusy(null); } }}><FaUnlock /> {hintBusy === h.id ? "Unlocking..." : `Unlock (-${h.cost})`}</button>}
                    </div>
                  )) : activeModalChall.hint ? (
                    activeModalChall.hint_unlocked ? (
                      <div className="hint-unlocked-box"><div className="hint-title"><FaLightbulb /> Official Challenge Hint</div><p>{activeModalChall.hint}</p></div>
                    ) : (
                      <div className="hint-locked-box"><FaLock className="huge-lock" /><h3>Need a hint to make progress?</h3><p>Unlocking this hint will deduct <b>{activeModalChall.hint_cost || 15} points</b>.</p><button className="primary-btn unlock-btn" onClick={handleUnlockHint}><FaUnlock /> Unlock Hint (-{activeModalChall.hint_cost || 15} PTS)</button></div>
                    )
                  ) : <div className="empty-state"><FaLightbulb /><p>No hints have been published for this challenge.</p></div>}
                </div>
              )}

              {/* TAB 3: WRITEUP */}
              {modalTab === "writeup" && (
                <div className="tab-pane">
                  {!activeModalChall.is_solved && currentUser?.role !== "admin" ? (
                    <div className="locked-view">
                      <FaLock className="huge-lock" />
                      <h3>Writeup Locked</h3>
                      <p>You must capture the flag first before inspecting the official writeup!</p>
                    </div>
                  ) : (
                    <div className="writeup-content">
                      <h3>Official Solution & Writeup</h3>
                      <div className="markdown-box">
                        <pre>{writeupText}</pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: DISCUSSION */}
              {modalTab === "comments" && (
                <div className="tab-pane">
                  {!activeModalChall.is_solved && currentUser?.role !== "admin" ? (
                    <div className="locked-view">
                      <FaLock className="huge-lock" />
                      <h3>Discussion Locked</h3>
                      <p>To avoid spoilers, comments are only accessible after solving the challenge.</p>
                    </div>
                  ) : (
                    <div className="comments-section">
                      <form className="comment-form" onSubmit={handlePostComment}>
                        <textarea
                          placeholder="Share your solving approach or thoughts (no plaintext flags)..."
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          rows={3}
                          required
                        />
                        <button type="submit" className="primary-btn" disabled={commentLoading}>
                          {commentLoading ? "Posting..." : "Post Comment"}
                        </button>
                      </form>

                      <div className="comments-list">
                        {comments.length === 0 ? (
                          <p className="no-comments">No discussion yet. Be the first to share your thoughts!</p>
                        ) : (
                          comments.map(c => (
                            <div key={c.id} className="comment-item">
                              <div className="comment-header">
                                <span className="comment-user">
                                  {c.user.name} {c.user.college && <small>({c.user.college})</small>}
                                </span>
                                <span className="comment-time">
                                  {new Date(c.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="comment-text">{c.content}</p>
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
