import React, { useState, useEffect } from "react";
import { api } from "../api";
import {
  FaTrophy,
  FaSearch,
  FaUniversity,
  FaUsers,
  FaMedal
} from "react-icons/fa";

export default function Leaderboard({ onSelectUser, currentUser }) {
  const [viewMode, setViewMode] = useState("global"); // 'global', 'colleges', 'squads'
  const [leaderboard, setLeaderboard] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [timeRangeFilter, setTimeRangeFilter] = useState("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      if (viewMode === "global") {
        const res = await api.get("/leaderboard", {
          params: {
            search: search.trim() || undefined,
            category: categoryFilter !== "all" ? categoryFilter : undefined,
            time_range: timeRangeFilter !== "all" ? timeRangeFilter : undefined
          }
        });
        setLeaderboard(res.data.leaderboard || []);
      } else if (viewMode === "colleges") {
        const res = await api.get("/leaderboard/colleges");
        setColleges(res.data.colleges || []);
      } else if (viewMode === "squads") {
        const res = await api.get("/teams/leaderboard");
        setTeams(res.data.leaderboard || []);
      }
    } catch (err) {
      console.error("Error loading leaderboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [viewMode, search, categoryFilter, timeRangeFilter]);

  const getRankBadge = (rank) => {
    if (rank === 1) return <span className="rank-badge rank-1">#1</span>;
    if (rank === 2) return <span className="rank-badge rank-2">#2</span>;
    if (rank === 3) return <span className="rank-badge rank-3">#3</span>;
    return <span className="rank-badge rank-other">#{rank}</span>;
  };

  return (
    <div className="leaderboard-page">
      <div className="page-header">
        <div>
          <div className="platform-breadcrumb">
            <span>OWASP PCCOE CTF Academy</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-active">Leaderboard</span>
          </div>
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-subtitle">
            Community rankings across individual hackers, college campuses, and squads.
          </p>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div className="leaderboard-toolbar">
        <div className="tab-pill-group">
          <button
            className={`tab-pill ${viewMode === "global" ? "active" : ""}`}
            onClick={() => setViewMode("global")}
          >
            <FaTrophy /> Individual Hackers
          </button>
          <button
            className={`tab-pill ${viewMode === "colleges" ? "active" : ""}`}
            onClick={() => setViewMode("colleges")}
          >
            <FaUniversity /> College Standings
          </button>
          <button
            className={`tab-pill ${viewMode === "squads" ? "active" : ""}`}
            onClick={() => setViewMode("squads")}
          >
            <FaUsers /> Squad Standings
          </button>
        </div>

        {viewMode === "global" && (
          <div className="leaderboard-filters-row" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <select
              className="clean-select"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              title="Filter by domain"
            >
              <option value="all">All Domains</option>
              <option value="Web Exploitation">Web Exploitation</option>
              <option value="Cryptography">Cryptography</option>
              <option value="Forensics">Forensics</option>
              <option value="Reverse Engineering">Reverse Engineering</option>
              <option value="Pwn/Binary Exploitation">Pwn / Binary</option>
              <option value="OSINT">OSINT</option>
              <option value="Steganography">Steganography</option>
              <option value="Misc">Misc</option>
            </select>

            <select
              className="clean-select"
              value={timeRangeFilter}
              onChange={e => setTimeRangeFilter(e.target.value)}
              title="Filter by time range"
            >
              <option value="all">All Time</option>
              <option value="month">This Month</option>
              <option value="week">This Week</option>
            </select>

            <div className="leaderboard-search-box">
              <FaSearch className="filter-search-icon" />
              <input
                type="text"
                className="filter-search-input"
                placeholder="Search hackers or colleges..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Table Content */}
      {loading ? (
        <div className="table-skeleton-wrap">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : viewMode === "global" ? (
        <div className="card table-card">
          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th style={{ width: "70px", textAlign: "center" }}>Rank</th>
                  <th>Hacker</th>
                  <th>Affiliation / College</th>
                  <th style={{ width: "130px", textAlign: "right" }}>Solves</th>
                  <th style={{ width: "130px", textAlign: "right" }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="table-empty">
                      No hackers found matching your search.
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((user, idx) => {
                    const isSelf = currentUser && currentUser.id === user.id;
                    return (
                      <tr
                        key={user.id}
                        className={`clickable-row ${isSelf ? "highlight-self-row" : ""}`}
                        onClick={() => onSelectUser(user.id)}
                      >
                        <td style={{ textAlign: "center" }}>
                          {getRankBadge(idx + 1)}
                        </td>
                        <td>
                          <div className="user-name-cell">
                            <div className="avatar-chip small">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="user-name-info">
                              <b>{user.name}</b>
                              {isSelf && <span className="self-tag">You</span>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="college-cell">{user.college || "Independent / PCCOE"}</span>
                        </td>
                        <td style={{ textAlign: "right" }} className="mono-solves">
                          {user.challenges_solved}
                        </td>
                        <td style={{ textAlign: "right" }} className="mono-points">
                          {user.points?.toLocaleString()} pts
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === "colleges" ? (
        <div className="card table-card">
          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th style={{ width: "70px", textAlign: "center" }}>Rank</th>
                  <th>College Institution</th>
                  <th style={{ width: "150px", textAlign: "right" }}>Students</th>
                  <th style={{ width: "150px", textAlign: "right" }}>Total Solves</th>
                  <th style={{ width: "150px", textAlign: "right" }}>Total Points</th>
                </tr>
              </thead>
              <tbody>
                {colleges.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="table-empty">
                      No college records available yet.
                    </td>
                  </tr>
                ) : (
                  colleges.map((col, idx) => (
                    <tr key={col.college || idx}>
                      <td style={{ textAlign: "center" }}>
                        {getRankBadge(idx + 1)}
                      </td>
                      <td>
                        <div className="college-name-cell">
                          <FaUniversity className="college-icon-subtle" />
                          <b>{col.college || "Independent"}</b>
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }} className="mono-stat">
                        {col.members_count}
                      </td>
                      <td style={{ textAlign: "right" }} className="mono-solves">
                        {col.total_solves}
                      </td>
                      <td style={{ textAlign: "right" }} className="mono-points">
                        {col.total_points?.toLocaleString()} pts
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card table-card">
          <div className="table-responsive">
            <table className="clean-table">
              <thead>
                <tr>
                  <th style={{ width: "70px", textAlign: "center" }}>Rank</th>
                  <th>Squad Name</th>
                  <th>Captain</th>
                  <th style={{ width: "120px", textAlign: "right" }}>Members</th>
                  <th style={{ width: "120px", textAlign: "right" }}>Solves</th>
                  <th style={{ width: "130px", textAlign: "right" }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {teams.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="table-empty">
                      No squads registered yet.
                    </td>
                  </tr>
                ) : (
                  teams.map((tm, idx) => (
                    <tr key={tm.id || idx}>
                      <td style={{ textAlign: "center" }}>
                        {getRankBadge(idx + 1)}
                      </td>
                      <td>
                        <div className="squad-name-cell">
                          <FaUsers className="squad-icon-subtle" />
                          <div>
                            <b>{tm.name}</b>
                            <span className="squad-slug-sub">/{tm.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="owner-cell">{tm.owner_name}</span>
                      </td>
                      <td style={{ textAlign: "right" }} className="mono-stat">
                        {tm.members_count || 1}
                      </td>
                      <td style={{ textAlign: "right" }} className="mono-solves">
                        {tm.total_solves || 0}
                      </td>
                      <td style={{ textAlign: "right" }} className="mono-points">
                        {(tm.total_points || 0).toLocaleString()} pts
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
