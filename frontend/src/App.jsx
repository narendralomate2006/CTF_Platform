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
import Landing from "./components/Landing";
import Squads from "./components/Squads";
import Notifications from "./components/Notifications";
import TournamentArena from "./components/TournamentArena";
import Footer from "./components/Footer";

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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="card empty-card" style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center", padding: "32px 24px" }}>
          <div style={{ fontSize: "36px", marginBottom: "16px", color: "var(--color-danger, #ef4444)" }}>⚠️</div>
          <h3 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "8px", color: "var(--text-primary)" }}>
            Something went wrong
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "20px" }}>
            An unexpected error occurred while loading this view. You can return to the dashboard or reload the platform.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button className="btn-primary" onClick={this.handleReset}>
              Return to Dashboard
            </button>
            <button className="btn-secondary" onClick={() => window.location.reload()}>
              Reload Platform
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(() => Boolean(getToken()));

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
  const isAuthDirect = () => {
    const hash = window.location.hash;
    return (
      hash.startsWith("#oauth-callback?") ||
      hash.startsWith("#verify-email?") ||
      hash.startsWith("#reset-password?") ||
      hash === "#login" ||
      hash === "#register"
    );
  };

  const [showAuth, setShowAuth] = useState(isAuthDirect);
  const [authMode, setAuthMode] = useState(() => (window.location.hash === "#register" ? "register" : "login"));
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [arenaEventId, setArenaEventId] = useState(() => { const x = localStorage.getItem("ctf_arena_event"); return x ? Number(x) : null; });

  // Fetch current user
  const fetchCurrentUser = async () => {
    const token = getToken();
    if (!token) {
      setLoadingUser(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await api.get("/auth/me", { signal: controller.signal });
      setUser(res.data);
    } catch (err) {
      saveToken(null);
      setUser(null);
    } finally {
      clearTimeout(timeoutId);
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    api.get("/notifications").then(r => setUnreadNotifications(r.data.unread || 0)).catch(() => { });
  }, [user]);

  // Sync URL hash whenever activePage changes
  useEffect(() => {
    // Do not overwrite special authentication hashes.
    // Auth.jsx needs these hashes to complete verification,
    // password reset, and Google OAuth.
    const hash = window.location.hash;

    const isAuthCallback =
      hash.startsWith("#oauth-callback?") ||
      hash.startsWith("#verify-email?") ||
      hash.startsWith("#reset-password?");

    if (isAuthCallback) {
      return;
    }

    window.location.hash = activePage;
    localStorage.setItem("ctf_page", activePage);

    if (viewTargetUserId) {
      localStorage.setItem("ctf_target_user", String(viewTargetUserId));
    } else {
      localStorage.removeItem("ctf_target_user");
    }
  }, [activePage, viewTargetUserId]);

  // Listen for hash changes when logged out
  useEffect(() => {
    const handleHashChange = () => {
      if (!user) {
        const hash = window.location.hash;
        if (
          hash === "#login" ||
          hash === "#register" ||
          hash.startsWith("#oauth-callback?") ||
          hash.startsWith("#verify-email?") ||
          hash.startsWith("#reset-password?")
        ) {
          setAuthMode(hash === "#register" ? "register" : "login");
          setShowAuth(true);
        } else if (!hash || hash === "#") {
          setShowAuth(false);
        }
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [user]);

  const handleLogout = () => {
    saveToken(null);
    setUser(null);
    setShowAuth(false);
    setActivePage("dashboard");
    setViewTargetUserId(null);
    window.location.hash = "";
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
          <img src="/branding/owasp-pccoe-logo.png" alt="OWASP PCCOE Logo" className="pulse-icon loader-logo" />
          <h2>OWASP PCCOE CTF Academy</h2>
          <p className="loader-sub">Loading cybersecurity platform...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`app-root ${theme}`}>
        {showAuth ? (
          <Auth
            initialMode={authMode}
            onLoginSuccess={(u) => {
              setUser(u);
              setShowAuth(false);
            }}
            onBackToLanding={() => {
              setShowAuth(false);
              window.location.hash = "";
            }}
          />
        ) : (
          <Landing
            onOpenAuth={(mode = "login") => {
              setAuthMode(mode);
              setShowAuth(true);
              window.location.hash = mode;
            }}
          />
        )}
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
        onNavigateHome={() => navigateTo("dashboard")}
        unreadNotifications={unreadNotifications}
        onOpenNotifications={() => navigateTo("notifications")}
        activePage={activePage}
        onSearch={(query) => {
          if (activePage !== "challenges") {
            navigateTo("challenges");
          }
        }}
      />

      {/* Main Container with Sidebar + Content */}
      <div className="app-container">
        {/* Sidebar Navigation */}
        <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
          {/* Official OWASP PCCOE Sidebar Brand */}
          <div className="sidebar-brand-card" onClick={() => navigateTo("dashboard")}>
            <img src="/branding/owasp-pccoe-logo.png" alt="OWASP PCCOE Logo" className="sidebar-logo-img" />
            <div className="sidebar-brand-info">
              <span className="sidebar-brand-top">OWASP PCCOE</span>
              <span className="sidebar-brand-sub">CTF Academy</span>
            </div>
          </div>

          <div className="sidebar-section">
            <span className="sidebar-heading">NAVIGATION</span>

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
              <span>Challenges</span>
            </button>

            <button
              className={`nav-link ${activePage === "events" ? "active" : ""}`}
              onClick={() => navigateTo("events")}
            >
              <FaCalendarAlt className="nav-icon" />
              <span>Events & Tournaments</span>
            </button>

            <button
              className={`nav-link ${activePage === "leaderboard" ? "active" : ""}`}
              onClick={() => navigateTo("leaderboard")}
            >
              <FaTrophy className="nav-icon" />
              <span>Leaderboard</span>
            </button>

            <button className={`nav-link ${activePage === "squads" ? "active" : ""}`} onClick={() => navigateTo("squads")}>
              <FaUsers className="nav-icon" /><span>Squad Hub</span>
            </button>
            <button className={`nav-link ${activePage === "notifications" ? "active" : ""}`} onClick={() => navigateTo("notifications")}>
              <span className="nav-icon-wrap"><FaBell className="nav-icon" />{unreadNotifications > 0 && <em className="nav-unread">{unreadNotifications}</em>}</span><span>Notifications</span>
            </button>
          </div>

          <div className="sidebar-section">
            <span className="sidebar-heading">ACCOUNT</span>

            <button
              className={`nav-link ${activePage === "profile" && viewTargetUserId === user.id ? "active" : ""}`}
              onClick={() => navigateTo("profile", user.id)}
            >
              <FaUser className="nav-icon" />
              <span>My Profile</span>
            </button>
          </div>

          {(user.role === "admin" || user.role === "moderator") && (
            <div className="sidebar-section">
              <span className="sidebar-heading">ADMINISTRATION</span>

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
              <img src="/branding/owasp-pccoe-logo.png" alt="OWASP PCCOE Logo" style={{ width: "16px", height: "16px", objectFit: "contain" }} />
              <span>OWASP PCCOE</span>
            </div>
            <div className="user-score-box">
              <span className="score-label">Community Rank</span>
              <b className="score-val">#{user.global_rank || 1}</b>
            </div>
          </div>
        </aside>

        {/* Content View */}
        <main className="main-content">
          <ErrorBoundary onReset={() => navigateTo("dashboard")}>
            {activePage === "dashboard" && (
              <Dashboard user={user} onNavigate={navigateTo} />
            )}

            {activePage === "challenges" && (
              <Challenges currentUser={user} onUserUpdated={fetchCurrentUser} />
            )}

            {activePage === "leaderboard" && (
              <Leaderboard
                currentUser={user}
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
          </ErrorBoundary>

          {/* Dedicated Platform Footer */}
          <Footer onNavigate={navigateTo} />
        </main>
      </div>
    </div>
  );
}
