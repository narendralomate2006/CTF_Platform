import React, { useState, useEffect } from "react";
import { api } from "../api";
import {
  FaTrophy,
  FaMedal,
  FaAward,
  FaSearch,
  FaUniversity,
  FaCheckCircle
} from "react-icons/fa";

export default function Leaderboard({ onSelectUser }) {
  const [viewMode, setViewMode] = useState("global"); // 'global', 'colleges'
  const [leaderboard, setLeaderboard] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      if (viewMode === "global") {
        const res = await api.get("/leaderboard", {
          params: { search: search.trim() || undefined }
        });
        setLeaderboard(res.data.leaderboard || []);
      } else {
        const res = await api.get("/leaderboard/colleges");
        setColleges(res.data.colleges || []);
      }
    } catch (err) {
      console.error("Error loading leaderboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [viewMode, search]);

  // Top 3 Podium for Global
  const top3 = leaderboard.slice(0, 3);
  const restList = leaderboard.slice(3);

  return (
    <div className="leaderboard-page">
      {/* Header */}
      <div className="section-header">
        <div>
          <h2>Hall of Fame & Leaderboards</h2>
          <p className="subtitle">
            Compete with security researchers across universities and showcase your capture prowess.
          </p>
        </div>

        {/* Search */}
        {viewMode === "global" && (
          <div className="search-bar">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search hackers or colleges..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-buttons">
        <button
          className={`tab-btn ${viewMode === "global" ? "active" : ""}`}
          onClick={() => setViewMode("global")}
        >
          <FaTrophy /> Individual Hackers
        </button>
        <button
          className={`tab-btn ${viewMode === "colleges" ? "active" : ""}`}
          onClick={() => setViewMode("colleges")}
        >
          <FaUniversity /> College Standings
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Calculating live rankings...</p>
        </div>
      ) : viewMode === "global" ? (
        <>
          {/* Top 3 Podium Showcase */}
          {top3.length > 0 && (
            <div className="podium-container">
              {/* 2nd Place */}
              {top3[1] && (
                <div
                  className="podium-card rank-2"
                  onClick={() => onSelectUser(top3[1].id)}
                >
                  <div className="medal-icon silver">
                    <FaMedal />
                  </div>
                  <span className="podium-rank">#2</span>
                  <h4>{top3[1].name}</h4>
                  <small className="college-name">{top3[1].college || "Independent"}</small>
                  <div className="podium-score">
                    <b>{top3[1].points}</b> PTS
                  </div>
                  <span className="solves-count">{top3[1].challenges_solved} Solves</span>
                </div>
              )}

              {/* 1st Place */}
              {top3[0] && (
                <div
                  className="podium-card rank-1"
                  onClick={() => onSelectUser(top3[0].id)}
                >
                  <div className="crown-badge">👑 CHAMPION</div>
                  <div className="medal-icon gold">
                    <FaTrophy />
                  </div>
                  <span className="podium-rank">#1</span>
                  <h4>{top3[0].name}</h4>
                  <small className="college-name">{top3[0].college || "Independent"}</small>
                  <div className="podium-score">
                    <b>{top3[0].points}</b> PTS
                  </div>
                  <span className="solves-count">{top3[0].challenges_solved} Solves</span>
                </div>
              )}

              {/* 3rd Place */}
              {top3[2] && (
                <div
                  className="podium-card rank-3"
                  onClick={() => onSelectUser(top3[2].id)}
                >
                  <div className="medal-icon bronze">
                    <FaAward />
                  </div>
                  <span className="podium-rank">#3</span>
                  <h4>{top3[2].name}</h4>
                  <small className="college-name">{top3[2].college || "Independent"}</small>
                  <div className="podium-score">
                    <b>{top3[2].points}</b> PTS
                  </div>
                  <span className="solves-count">{top3[2].challenges_solved} Solves</span>
                </div>
              )}
            </div>
          )}

          {/* Full Table */}
          <div className="table-card">
            <div className="table-responsive">
              <table className="custom-table clickable-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Hacker</th>
                    <th>College</th>
                    <th>Solves</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map(u => (
                    <tr
                      key={u.id}
                      onClick={() => onSelectUser(u.id)}
                      title="Click to inspect LeetCode profile"
                    >
                      <td className="rank-cell">
                        {u.rank === 1 ? <FaTrophy className="gold" /> :
                         u.rank === 2 ? <FaMedal className="silver" /> :
                         u.rank === 3 ? <FaAward className="bronze" /> :
                         <b>#{u.rank}</b>}
                      </td>
                      <td>
                        <div className="user-table-cell">
                          <div className="avatar-chip small">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <b>{u.name}</b>
                            <small className="view-profile-hint">View Profile</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="college-text">{u.college || "Independent"}</span>
                      </td>
                      <td>
                        <span className="solve-chip">
                          <FaCheckCircle /> {u.challenges_solved}
                        </span>
                      </td>
                      <td>
                        <b className="points-text">{u.points}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* College Standings View */
        <div className="table-card">
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>College / Institution</th>
                  <th>Active Hackers</th>
                  <th>Total Flags Captured</th>
                  <th>Aggregated Score</th>
                </tr>
              </thead>
              <tbody>
                {colleges.map(c => (
                  <tr key={c.college}>
                    <td className="rank-cell">
                      {c.rank === 1 ? <FaTrophy className="gold" /> :
                       c.rank === 2 ? <FaMedal className="silver" /> :
                       c.rank === 3 ? <FaAward className="bronze" /> :
                       <b>#{c.rank}</b>}
                    </td>
                    <td>
                      <div className="college-row-title">
                        <FaUniversity className="uni-icon" />
                        <b>{c.college}</b>
                      </div>
                    </td>
                    <td>{c.members_count} members</td>
                    <td>{c.total_solves} solves</td>
                    <td><b className="points-text">{c.total_points} PTS</b></td>
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
