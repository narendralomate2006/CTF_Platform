import React, { useState, useEffect, useMemo } from "react";
import { api, getToken } from "../api";
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
  FaSortAmountDown,
  FaTrophy,
  FaGlobe,
  FaKey,
  FaCogs,
  FaSkull,
  FaUserSecret,
  FaFileImage,
  FaCube,
  FaThLarge,
  FaFilter,
  FaBullseye,
  FaBolt
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

export const TRACKS_METADATA = [
  {
    category: "All",
    label: "All Tracks",
    shortCode: "ALL",
    icon: FaThLarge,
    color: "#55d6be",
    description: "Full spectrum arena challenges across all offensive security domains",
    topics: ["Full Spectrum", "Multi-Domain", "CTF All-Stars"]
  },
  {
    category: "Web Exploitation",
    label: "Web Exploitation",
    shortCode: "WEB // 01",
    icon: FaGlobe,
    color: "#38bdf8",
    description: "Client & server vulnerabilities, injections, auth flaws, and API compromises",
    topics: ["XSS", "SQLi", "SSRF", "IDOR", "Auth Bypass"]
  },
  {
    category: "Cryptography",
    label: "Cryptography",
    shortCode: "CRYPTO // 02",
    icon: FaKey,
    color: "#a855f7",
    description: "Classic ciphers, modern asymmetric RSA, elliptic curves, and key recovery",
    topics: ["RSA", "AES", "ECC", "Hash Collisions", "PRNG"]
  },
  {
    category: "Forensics",
    label: "Digital Forensics",
    shortCode: "DFIR // 03",
    icon: FaSearch,
    color: "#10b981",
    description: "Network packet dumps, memory captures, disk images, and incident artifacts",
    topics: ["PCAP", "Volatility", "Disk Carving", "Memory Dumps"]
  },
  {
    category: "Reverse Engineering",
    label: "Reverse Engineering",
    shortCode: "REV // 04",
    icon: FaCogs,
    color: "#f59e0b",
    description: "Decompiling binaries, assembly analysis, anti-debugging, and firmware reversing",
    topics: ["Ghidra", "IDA", "x86_64", "Bytecode", "Anti-Debug"]
  },
  {
    category: "Pwn/Binary Exploitation",
    label: "Binary Exploitation",
    shortCode: "PWN // 05",
    icon: FaSkull,
    color: "#ef4444",
    description: "Memory corruption, buffer overflows, ROP chain construction, and shellcoding",
    topics: ["BoF", "ROP Chains", "Format Strings", "Heap"]
  },
  {
    category: "OSINT",
    label: "Open Source Intel",
    shortCode: "OSINT // 06",
    icon: FaUserSecret,
    color: "#06b6d4",
    description: "Public intelligence gathering, geolocation, digital footprints, and recon",
    topics: ["Geolocation", "Social Recon", "Metadata", "Threat Intel"]
  },
  {
    category: "Steganography",
    label: "Steganography",
    shortCode: "STEGO // 07",
    icon: FaFileImage,
    color: "#ec4899",
    description: "Data concealed in carrier media, audio spectrograms, and polyglot files",
    topics: ["LSB Extraction", "Spectrograms", "Polyglots", "Exif"]
  },
  {
    category: "Misc",
    label: "Miscellaneous",
    shortCode: "MISC // 08",
    icon: FaCube,
    color: "#8b5cf6",
    description: "Esoteric languages, logic challenges, hardware, and emerging cybersecurity vectors",
    topics: ["Scripting", "Logic Puzzles", "AI Jailbreak", "Hardware"]
  }
];

const DIFFICULTIES = ["All", "Easy", "Medium", "Hard", "Insane"];

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

export default function Challenges({ currentUser, onUserUpdated }) {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activityFeed, setActivityFeed] = useState([]);

  // Filtering states
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All"); // All, Solved, Unsolved
  const [selectedAcceptance, setSelectedAcceptance] = useState("All"); // All, high, medium, low
  const [selectedBlood, setSelectedBlood] = useState("All"); // All, unclaimed, claimed
  const [sortBy, setSortBy] = useState("default");
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
  const [instance, setInstance] = useState(null);
  const [instanceBusy, setInstanceBusy] = useState(false);

  // Load all challenges for the arena
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

  const fetchActivityFeed = async () => {
    try {
      const res = await api.get("/activity/feed?limit=15");
      setActivityFeed(res.data.feed || []);
    } catch (err) {
      // quiet fail
    }
  };

  useEffect(() => {
    fetchChallenges();
    fetchActivityFeed();
    const interval = setInterval(fetchActivityFeed, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeModalChall || modalTab !== "hint") return;
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
      setSubmitResult({ type: "info", text: "Live challenge sandbox instance started." });
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
      setSubmitResult({ type: "info", text: "Live challenge sandbox instance stopped." });
    } catch (err) {
      setSubmitResult({ type: "error", text: err.response?.data?.detail || "Could not stop instance" });
    } finally {
      setInstanceBusy(false);
    }
  };

  const getFileDownloadUrl = (rawUrl) => {
    if (!rawUrl) return "#";
    const token = getToken();
    if (!token) return rawUrl;
    return rawUrl.includes("?") ? `${rawUrl}&token=${encodeURIComponent(token)}` : `${rawUrl}?token=${encodeURIComponent(token)}`;
  };

  // Open Challenge Modal
  const openModal = async (chall) => {
    setActiveModalChall(chall);
    setModalTab("details");
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
          text: res.data.message,
          is_first_blood: res.data.is_first_blood
        });
        setActiveModalChall(prev => ({
          ...prev,
          is_solved: true,
          solves_count: (prev?.solves_count || 0) + 1,
          first_blood: prev?.first_blood || (res.data.is_first_blood ? {
            user_name: currentUser?.name || "You",
            college: currentUser?.college || "Operator",
            team_name: currentUser?.team_name || null,
            time: new Date().toISOString()
          } : null)
        }));
        setChallenges(prev =>
          prev.map(c => c.id === activeModalChall.id ? {
            ...c,
            is_solved: true,
            solves_count: (c.solves_count || 0) + 1,
            first_blood: c.first_blood || (res.data.is_first_blood ? {
              user_name: currentUser?.name || "You",
              college: currentUser?.college || "Operator",
              team_name: currentUser?.team_name || null,
              time: new Date().toISOString()
            } : null)
          } : c)
        );
        fetchActivityFeed();
        if (onUserUpdated) onUserUpdated();
      } else {
        setSubmitResult({
          type: "error",
          text: res.data.message,
          is_first_blood: false
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

  const loadWriteup = async () => {
    setModalTab("writeup");
    try {
      const res = await api.get(`/challenges/${activeModalChall.id}/writeup`);
      setWriteupText(res.data.writeup);
    } catch (err) {
      setWriteupText(err.response?.data?.detail || "Writeup locked.");
    }
  };

  const loadComments = async () => {
    setModalTab("comments");
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

  // Compute stats per track dynamically for the Category Boxes
  const trackStats = useMemo(() => {
    const stats = {};
    TRACKS_METADATA.forEach(tr => {
      const list = tr.category === "All" ? challenges : challenges.filter(c => c.category === tr.category);
      const total = list.length;
      const solved = list.filter(c => c.is_solved).length;
      const points = list.reduce((sum, c) => sum + (c.points || 0), 0);
      const solvesSum = list.reduce((sum, c) => sum + (c.solves_count || 0), 0);
      const attemptsSum = list.reduce((sum, c) => sum + (c.total_attempts || c.solves_count || 0), 0);
      const avgAcceptance = attemptsSum > 0 ? Math.round((solvesSum / attemptsSum) * 100) : (total > 0 ? 100 : 0);
      stats[tr.category] = {
        total,
        solved,
        points,
        pct: total > 0 ? Math.round((solved / total) * 100) : 0,
        avgAcceptance
      };
    });
    return stats;
  }, [challenges]);

  // Multi-option filtering logic
  const filteredChallenges = useMemo(() => {
    return challenges.filter(c => {
      // 1. Category Filter
      if (selectedCategory !== "All" && c.category !== selectedCategory) return false;

      // 2. Difficulty Filter
      if (selectedDifficulty !== "All" && (c.difficulty || "").toLowerCase() !== selectedDifficulty.toLowerCase()) return false;

      // 3. Status Filter (Solved / Unsolved)
      if (selectedStatus === "Solved" && !c.is_solved) return false;
      if (selectedStatus === "Unsolved" && c.is_solved) return false;

      // 4. Acceptance Rate Filter
      const acc = c.acceptance_rate ?? (c.total_attempts ? Math.round((c.solves_count / c.total_attempts) * 100) : (c.solves_count > 0 ? 100 : 0));
      if (selectedAcceptance === "high" && acc < 60) return false;
      if (selectedAcceptance === "medium" && (acc < 30 || acc >= 60)) return false;
      if (selectedAcceptance === "low" && acc >= 30) return false;

      // 5. First Blood Filter
      if (selectedBlood === "unclaimed" && c.first_blood) return false;
      if (selectedBlood === "claimed" && !c.first_blood) return false;

      // 6. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = c.title?.toLowerCase().includes(q);
        const matchCategory = c.category?.toLowerCase().includes(q);
        const matchDesc = c.description?.toLowerCase().includes(q);
        if (!matchTitle && !matchCategory && !matchDesc) return false;
      }

      return true;
    });
  }, [challenges, selectedCategory, selectedDifficulty, selectedStatus, selectedAcceptance, selectedBlood, searchQuery]);

  // Multi-option sorting logic
  const sortedChallenges = useMemo(() => {
    const diffOrder = { "easy": 1, "medium": 2, "hard": 3, "insane": 4 };

    return [...filteredChallenges].sort((a, b) => {
      const accA = a.acceptance_rate ?? (a.total_attempts ? (a.solves_count / a.total_attempts) * 100 : (a.solves_count > 0 ? 100 : 0));
      const accB = b.acceptance_rate ?? (b.total_attempts ? (b.solves_count / b.total_attempts) * 100 : (b.solves_count > 0 ? 100 : 0));

      if (sortBy === "acceptance-desc") return accB - accA;
      if (sortBy === "acceptance-asc") return accA - accB;
      if (sortBy === "points-desc") return (b.points || 0) - (a.points || 0);
      if (sortBy === "points-asc") return (a.points || 0) - (b.points || 0);
      if (sortBy === "diff-asc") return (diffOrder[a.difficulty?.toLowerCase()] || 0) - (diffOrder[b.difficulty?.toLowerCase()] || 0);
      if (sortBy === "diff-desc") return (diffOrder[b.difficulty?.toLowerCase()] || 0) - (diffOrder[a.difficulty?.toLowerCase()] || 0);
      if (sortBy === "solves-desc") return (b.solves_count || 0) - (a.solves_count || 0);
      if (sortBy === "solves-asc") return (a.solves_count || 0) - (b.solves_count || 0);
      if (sortBy === "title-asc") return a.title.localeCompare(b.title);
      return 0; // default
    });
  }, [filteredChallenges, sortBy]);

  const activeCategoryMeta = TRACKS_METADATA.find(t => t.category === selectedCategory);

  const totalPoints = useMemo(() => challenges.reduce((s, c) => s + (c.points || 0), 0), [challenges]);
  const solvedCount = useMemo(() => challenges.filter(c => c.is_solved).length, [challenges]);
  const progressPct = challenges.length ? Math.round((solvedCount / challenges.length) * 100) : 0;
  const unclaimedBlood = useMemo(() => challenges.filter(c => !c.first_blood).length, [challenges]);
  const avgPlatformAcceptance = useMemo(() => {
    if (!challenges.length) return 0;
    const totalSolves = challenges.reduce((s, c) => s + (c.solves_count || 0), 0);
    const totalAttempts = challenges.reduce((s, c) => s + (c.total_attempts || c.solves_count || 0), 0);
    return totalAttempts > 0 ? Math.round((totalSolves / totalAttempts) * 100) : 100;
  }, [challenges]);

  const resetAllFilters = () => {
    setSelectedCategory("All");
    setSelectedDifficulty("All");
    setSelectedStatus("All");
    setSelectedAcceptance("All");
    setSelectedBlood("All");
    setSortBy("default");
    setSearchQuery("");
  };

  return (
    <div className="challenges-page">
      {/* Header Banner */}
      <div className="section-header">
        <div>
          <div className="platform-breadcrumb">
            <span>OWASP PCCOE CTF Academy</span>
            <span className="breadcrumb-sep">/</span>
            <span>Challenges</span>
            {selectedCategory !== "All" && (
              <>
                <span className="breadcrumb-sep">/</span>
                <span>{selectedCategory}</span>
              </>
            )}
          </div>
          <h2>OWASP PCCOE Challenges</h2>
          <p className="subtitle">
            Practice real-world cybersecurity problems curated for the OWASP PCCOE community.
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

      {/* Live Activity Stream Ticker */}
      <div className="live-ticker-panel">
        <div className="live-ticker-label">
          <span className="live-beacon-dot" />
          <FaFire className="live-flame-icon" />
          <span>LIVE SOLVES</span>
        </div>
        <div className="live-ticker-viewport">
          {activityFeed.length === 0 ? (
            <div className="live-ticker-empty">
              <span>Ready for first bloods. Capture flags to broadcast your handle platform-wide!</span>
            </div>
          ) : (
            <div className="live-ticker-stream">
              {activityFeed.map((item) => (
                <div key={item.id} className={`ticker-pill ${item.is_first_blood ? "first-blood" : ""}`}>
                  {item.is_first_blood && (
                    <span className="ticker-fb-tag">
                      <FaTint /> FIRST BLOOD
                    </span>
                  )}
                  <span className="ticker-user">
                    <b>{item.user_name}</b>
                    {item.team_name ? (
                      <small className="ticker-tag-team">[{item.team_name}]</small>
                    ) : item.college ? (
                      <small className="ticker-tag-college">({item.college})</small>
                    ) : null}
                  </span>
                  <span className="ticker-action">captured</span>
                  <span className="ticker-chall-name">{item.challenge_title}</span>
                  <span className="ticker-pts">+{item.points} pts</span>
                  <span className="ticker-timestamp">{timeAgo(item.submitted_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Compact Single-Line Category Boxes */}
      <div className="compact-tracks-strip">
        <div className="compact-tracks-header">
          <div className="compact-tracks-title-group">
            <span className="compact-tracks-kicker">// OFFENSIVE DOMAIN TRACKS</span>
            <span className="compact-tracks-subtitle">Select a category to isolate challenges:</span>
          </div>
          {selectedCategory !== "All" && (
            <button className="compact-tracks-clear-btn" onClick={() => setSelectedCategory("All")}>
              Reset to All ({challenges.length})
            </button>
          )}
        </div>
        <div className="compact-tracks-row">
          {TRACKS_METADATA.map((track) => {
            const Icon = track.icon;
            const st = trackStats[track.category] || { total: 0, solved: 0, points: 0, pct: 0, avgAcceptance: 0 };
            const isActive = selectedCategory === track.category;
            return (
              <div
                key={track.category}
                className={`compact-track-card ${isActive ? "active" : ""}`}
                style={{ "--track-color": track.color }}
                onClick={() => setSelectedCategory(track.category)}
                role="button"
                tabIndex={0}
                title={`${track.label}: ${st.solved}/${st.total} solved (${st.pct}%)`}
              >
                <div className="compact-track-top">
                  <div className="compact-track-icon">
                    <Icon />
                  </div>
                  <div className="compact-track-badges">
                    <span className="compact-track-count">{st.total} Qs</span>
                    {isActive && <span className="compact-track-dot" />}
                  </div>
                </div>
                <div className="compact-track-name">{track.label}</div>
                <div className="compact-track-footer">
                  <span className="compact-track-stat">{st.solved}/{st.total} Solved</span>
                  <span className="compact-track-acc">{st.avgAcceptance}% acc</span>
                </div>
                <div className="compact-track-prog-bar">
                  <div
                    className="compact-track-prog-fill"
                    style={{
                      width: `${st.pct}%`,
                      backgroundColor: track.color
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters Bar: Difficulty & Status & Sorting */}
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

        <div className="filter-group">
          <label>Acceptance:</label>
          <select
            value={selectedAcceptance}
            onChange={e => setSelectedAcceptance(e.target.value)}
            className="filter-select"
          >
            <option value="All">All</option>
            <option value="high">High (≥60%)</option>
            <option value="medium">Medium (30-59%)</option>
            <option value="low">Low (&lt;30%)</option>
          </select>
        </div>

        <div className="filter-group">
          <label>First Blood:</label>
          <select
            value={selectedBlood}
            onChange={e => setSelectedBlood(e.target.value)}
            className="filter-select"
          >
            <option value="All">All</option>
            <option value="unclaimed">🩸 Unclaimed</option>
            <option value="claimed">Claimed</option>
          </select>
        </div>

        <div className="filter-group sort-group">
          <label><FaSortAmountDown /> Sort:</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="filter-select sort-select"
          >
            <option value="default">Default</option>
            <option value="acceptance-desc">Acceptance: High → Low</option>
            <option value="acceptance-asc">Acceptance: Low → High</option>
            <option value="diff-asc">Difficulty: Easy → Hard</option>
            <option value="diff-desc">Difficulty: Hard → Easy</option>
            <option value="points-desc">Points: High → Low</option>
            <option value="points-asc">Points: Low → High</option>
            <option value="solves-desc">Most Solved</option>
            <option value="solves-asc">Least Solved</option>
            <option value="title-asc">Title: A → Z</option>
          </select>
        </div>

        {(selectedCategory !== "All" || selectedDifficulty !== "All" || selectedStatus !== "All" || selectedAcceptance !== "All" || selectedBlood !== "All" || searchQuery) && (
          <button className="reset-filters-link" onClick={resetAllFilters}>
            <FaTimes /> Reset Filters
          </button>
        )}
      </div>

      {/* Challenge Grid */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading challenges...</p>
        </div>
      ) : sortedChallenges.length === 0 ? (
        <div className="empty-state">
          <FaFlag className="empty-icon" />
          <h3>No challenges match your criteria</h3>
          <p>Try clearing filters or search terms.</p>
          <button className="primary-btn" onClick={resetAllFilters}>
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="challenge-grid">
          {sortedChallenges.map(chall => {
            const diffClass = (chall.difficulty || "easy").toLowerCase();
            const accRate = chall.acceptance_rate ?? (chall.total_attempts ? Math.round((chall.solves_count / chall.total_attempts) * 100) : (chall.solves_count > 0 ? 100 : 0));

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

                {chall.first_blood ? (
                  <div className="chall-fb-badge" title={`First blood captured by ${chall.first_blood.user_name}`}>
                    <FaTint className="fb-drop-icon pulse" />
                    <span>First Blood: <b>{chall.first_blood.user_name}</b></span>
                  </div>
                ) : (
                  <div className="chall-fb-badge unclaimed" title="First blood is still up for grabs!">
                    <FaTint className="fb-drop-icon" />
                    <span>🩸 Unclaimed Blood</span>
                  </div>
                )}

                <div className="card-footer">
                  <div className="points-badge">
                    <b>{chall.points}</b> <small>PTS</small>
                  </div>

                  <div className="solves-info">
                    👥 {chall.solves_count || 0} solves · 🎯 {accRate}%
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

      {/* Modal */}
      {activeModalChall && (
        <div className="modal-backdrop" onClick={() => setActiveModalChall(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setActiveModalChall(null)}>
              <FaTimes />
            </button>

            {/* Modal Header */}
            <div className="modal-header">
              <div className="challenge-breadcrumb">
                <span>OWASP PCCOE CTF Academy</span>
                <span className="breadcrumb-sep">/</span>
                <span>Challenges</span>
                <span className="breadcrumb-sep">/</span>
                <span>{activeModalChall.category}</span>
                <span className="breadcrumb-sep">/</span>
                <span className="breadcrumb-active">{activeModalChall.title}</span>
              </div>
              <div className="modal-tags">
                <span className="category-tag">{activeModalChall.category}</span>
                <span className={`difficulty-tag ${(activeModalChall.difficulty || "easy").toLowerCase()}`}>
                  {activeModalChall.difficulty}
                </span>
                <span className="points-badge">
                  <b>{activeModalChall.points}</b> PTS
                </span>
                <span className="acceptance-pill">
                  🎯 {activeModalChall.acceptance_rate ?? (activeModalChall.total_attempts ? Math.round((activeModalChall.solves_count / activeModalChall.total_attempts) * 100) : 100)}% Acceptance
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
                  {/* First Blood Showcase */}
                  {activeModalChall.first_blood ? (
                    <div className="modal-first-blood-showcase">
                      <div className="modal-fb-header">
                        <FaTint className="fb-drop-icon pulse" />
                        <span className="modal-fb-title">FIRST BLOOD CAPTOR</span>
                      </div>
                      <div className="modal-fb-content">
                        <span className="modal-fb-solver">
                          <b>{activeModalChall.first_blood.user_name}</b>
                          {activeModalChall.first_blood.college && (
                            <small className="modal-fb-college"> · {activeModalChall.first_blood.college}</small>
                          )}
                          {activeModalChall.first_blood.team_name && (
                            <span className="modal-fb-squad">🛡️ Squad {activeModalChall.first_blood.team_name}</span>
                          )}
                        </span>
                        {activeModalChall.first_blood.time && (
                          <span className="modal-fb-date">
                            Captured on {new Date(activeModalChall.first_blood.time).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="modal-first-blood-unclaimed">
                      <FaTint className="fb-drop-icon" />
                      <div>
                        <b>🩸 First Blood Unclaimed!</b>
                        <p>No operator has solved this challenge yet. Solve it first to claim legendary first blood!</p>
                      </div>
                    </div>
                  )}

                  <div className="description-box">
                    <p>{activeModalChall.description}</p>
                  </div>

                  {/* Connection command, files, or live instance */}
                  {(activeModalChall.connection_info || activeModalChall.file_url || activeModalChall.runtime_enabled) && (
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
                            href={getFileDownloadUrl(activeModalChall.file_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="download-link"
                          >
                            Download Challenge File <FaExternalLinkAlt />
                          </a>
                        </div>
                      )}

                      {activeModalChall.runtime_enabled && (
                        <div className="live-instance-panel">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                              <FaServer style={{ color: "#55d6be" }} /> Live Sandbox Instance
                            </span>
                            <small style={{ opacity: 0.75 }}>Isolated Docker environment</small>
                          </div>
                          {instance?.status === "running" ? (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <code style={{ background: "#0b1220", padding: "4px 8px", borderRadius: 4, color: "#55d6be" }}>
                                {instance.connection_url}
                              </code>
                              <a href={instance.connection_url} target="_blank" rel="noreferrer" className="primary-btn sm" style={{ textDecoration: "none" }}>
                                Open Instance <FaExternalLinkAlt />
                              </a>
                              <button className="danger-btn sm" onClick={handleStopInstance} disabled={instanceBusy}>
                                <FaStop /> {instanceBusy ? "Stopping..." : "Stop Instance"}
                              </button>
                            </div>
                          ) : (
                            <button className="primary-btn sm" onClick={handleStartInstance} disabled={instanceBusy}>
                              <FaPlay /> {instanceBusy ? "Starting..." : "Start Live Instance"}
                            </button>
                          )}
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
                    <div className={`alert-banner ${submitResult.type} ${submitResult.is_first_blood ? "first-blood-banner" : ""}`}>
                      {submitResult.is_first_blood ? (
                        <div className="fb-alert-inner">
                          <span className="fb-alert-trophy">🩸 🏆</span>
                          <div className="fb-alert-text">
                            <strong>FIRST BLOOD CAPTURED!</strong>
                            <p>{submitResult.text}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {submitResult.type === "success" && <FaCheckCircle />}
                          <span>{submitResult.text}</span>
                        </>
                      )}
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
