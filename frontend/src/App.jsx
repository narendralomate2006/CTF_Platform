import React, { useState, useEffect } from "react";
import { api, saveToken, getToken } from "./api";
import Navbar from "./components/Navbar";
import Challenges from "./components/Challenges";
import Dashboard from "./components/Dashboard";
import Leaderboard from "./components/Leaderboard";
import Events from "./components/Events";
import Profile from "./components/Profile";
import Admin from "./components/Admin";
import Auth from "./components/Auth";
import Squads from "./components/Squads";
import Notifications from "./components/Notifications";
import TournamentArena from "./components/TournamentArena";

import {
  FaFlag,
  FaTrophy,
  FaCalendarAlt,
  FaUser,
  FaUserShield,
  FaShieldAlt,
  FaFire,
  FaUsers,
  FaBell
} from "react-icons/fa";

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Restore page from URL hash or localStorage on refresh
  const getInitialPage = () => {
    const hash = window.location.hash.replace("#", "").trim();
    const valid = ["dashboard", "challenges", "leaderboard", "events", "squads", "notifications", "arena", "profile", "admin"];
    if (hash && valid.includes(hash)) return hash;
    return localStorage.getItem("ctf_page") || "dashboard";
  };

  const [activePage, setActivePage] = useState(getInitialPage);
  const [viewTargetUserId, setViewTargetUserId] = useState(() => {
    const stored = localStorage.getItem("ctf_target_user");
    return stored ? parseInt(stored, 10) : null;
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("ctf_theme") || "dark");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [arenaEventId, setArenaEventId] = useState(() => { const x = localStorage.getItem("ctf_arena_event"); return x ? Number(x) : null; });

  // Fetch current user
  const fetchCurrentUser = async () => {
    const token = getToken();
    if (!token) {
      setLoadingUser(false);
      return;
    }

    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch (err) {
      saveToken(null);
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get("/notifications").then(r => setUnreadNotifications(r.data.unread || 0)).catch(() => {});
  }, [user]);

  // Sync URL hash whenever activePage changes
  useEffect(() => {
    window.location.hash = activePage;
    localStorage.setItem("ctf_page", activePage);
    if (viewTargetUserId) {
      localStorage.setItem("ctf_target_user", String(viewTargetUserId));
    } else {
      localStorage.removeItem("ctf_target_user");
    }
  }, [activePage, viewTargetUserId]);

  const handleLogout = () => {
    saveToken(null);
    setUser(null);
    setActivePage("dashboard");
    setViewTargetUserId(null);
    window.location.hash = "dashboard";
    localStorage.removeItem("ctf_page");
    localStorage.removeItem("ctf_target_user");
  };

  const navigateTo = (page, targetUserId = null) => {
    setActivePage(page);
    setViewTargetUserId(targetUserId);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loadingUser) {
    return (
      <div className={`app-root ${theme}`}>
        <div className="full-screen-loader">
          <FaShieldAlt className="pulse-icon" />
          <h2>Booting College OWASP CTF Arena...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`app-root ${theme}`}>
        <Auth onLoginSuccess={(u) => setUser(u)} />
      </div>
    );
  }

  return (
    <div className={`app-root ${theme}`}>
      {/* Top Navbar */}
      <Navbar
        user={user}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        theme={theme}
        setTheme={setTheme}
        onOpenProfile={(uid) => navigateTo("profile", uid || user.id)}
        unreadNotifications={unreadNotifications}
        onOpenNotifications={() => navigateTo("notifications")}
      />

      {/* Main Container with Sidebar + Content */}
      <div className="app-container">
        {/* Sidebar Navigation */}
        <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
          <div className="sidebar-section">
            <span className="sidebar-heading">COMMAND DECK</span>

            <button
              className={`nav-link ${activePage === "dashboard" ? "active" : ""}`}
              onClick={() => navigateTo("dashboard")}
            >
              <span className="nav-icon">⌂</span>
              <span>Dashboard</span>
            </button>

            <button
              className={`nav-link ${activePage === "challenges" ? "active" : ""}`}
              onClick={() => navigateTo("challenges")}
            >
              <FaFlag className="nav-icon" />
              <span>Practice Arena</span>
            </button>

            <button
              className={`nav-link ${activePage === "leaderboard" ? "active" : ""}`}
              onClick={() => navigateTo("leaderboard")}
            >
              <FaTrophy className="nav-icon" />
              <span>Leaderboards</span>
            </button>

            <button
              className={`nav-link ${activePage === "events" ? "active" : ""}`}
              onClick={() => navigateTo("events")}
            >
              <FaCalendarAlt className="nav-icon" />
              <span>Tournaments & Events</span>
            </button>

            <button className={`nav-link ${activePage === "squads" ? "active" : ""}`} onClick={() => navigateTo("squads")}>
              <FaUsers className="nav-icon" /><span>Squad Hub</span>
            </button>
            <button className={`nav-link ${activePage === "notifications" ? "active" : ""}`} onClick={() => navigateTo("notifications")}>
              <span className="nav-icon-wrap"><FaBell className="nav-icon"/>{unreadNotifications>0 && <em className="nav-unread">{unreadNotifications}</em>}</span><span>Notifications</span>
            </button>
          </div>

          <div className="sidebar-section">
            <span className="sidebar-heading">MY PROFILE</span>

            <button
              className={`nav-link ${activePage === "profile" && viewTargetUserId === user.id ? "active" : ""}`}
              onClick={() => navigateTo("profile", user.id)}
            >
              <FaUser className="nav-icon" />
              <span>LeetCode Profile</span>
            </button>
          </div>

          {(user.role === "admin" || user.role === "moderator") && (
            <div className="sidebar-section">
              <span className="sidebar-heading">OWASP CLUB CONTROLS</span>

              <button
                className={`nav-link admin-link ${activePage === "admin" ? "active" : ""}`}
                onClick={() => navigateTo("admin")}
              >
                <FaUserShield className="nav-icon" />
                <span>Admin Command Center</span>
              </button>
            </div>
          )}

          {/* Quick Stats Footer */}
          <div className="sidebar-footer">
            <div className="club-tag">
              <FaShieldAlt /> OWASP STUDENT CHAPTER
            </div>
            <div className="user-score-box">
              <span className="score-label">My Global Rank</span>
              <b className="score-val">#{user.global_rank || 1}</b>
            </div>
          </div>
        </aside>

        {/* Content View */}
        <main className="main-content">
          {activePage === "dashboard" && (
            <Dashboard user={user} onNavigate={navigateTo} />
          )}

          {activePage === "challenges" && (
            <Challenges currentUser={user} onUserUpdated={fetchCurrentUser} />
          )}

          {activePage === "leaderboard" && (
            <Leaderboard
              onSelectUser={(userId) => navigateTo("profile", userId)}
            />
          )}

          {activePage === "events" && (
            <Events
              currentUser={user}
              onEnterArena={(eventId) => { setArenaEventId(eventId); localStorage.setItem("ctf_arena_event", String(eventId)); navigateTo("arena"); }}
            />
          )}


          {activePage === "squads" && <Squads currentUser={user} />}
          {activePage === "notifications" && <Notifications onCountChange={setUnreadNotifications} />}
          {activePage === "arena" && arenaEventId && <TournamentArena eventId={arenaEventId} onBack={() => navigateTo("events")} />}

          {activePage === "profile" && (
            <Profile
              targetUserId={viewTargetUserId}
              currentUserId={user.id}
              onBackToPractice={() => navigateTo("challenges")}
            />
          )}

          {activePage === "admin" && (user.role === "admin" || user.role === "moderator") && (
            <Admin />
          )}
        </main>
      </div>
    </div>
  );
}
