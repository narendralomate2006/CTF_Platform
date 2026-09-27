import React, { useState } from "react";
import {
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaSun,
  FaMoon,
  FaBell,
  FaSearch,
  FaFire
} from "react-icons/fa";

export default function Navbar({
  user,
  onLogout,
  mobileOpen,
  setMobileOpen,
  theme,
  setTheme,
  onOpenProfile,
  onNavigateHome,
  unreadNotifications = 0,
  onOpenNotifications,
  activePage = "dashboard",
  onSearch
}) {
  const [navSearch, setNavSearch] = useState("");

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("ctf_theme", nextTheme);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(navSearch);
    }
  };

  const pageTitles = {
    dashboard: "Dashboard",
    challenges: "Challenges",
    events: "Events & Tournaments",
    leaderboard: "Leaderboard",
    squads: "Squad Hub",
    notifications: "Notifications",
    profile: "Profile",
    admin: "Command Center",
    arena: "Tournament Arena"
  };

  return (
    <header className="navbar">
      <div className="navbar-left">
        <button
          className="menu-btn"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <FaTimes /> : <FaBars />}
        </button>

        <div className="brand" onClick={() => (onNavigateHome ? onNavigateHome() : onOpenProfile(null))}>
          <img
            src="/branding/owasp-pccoe-logo.png"
            alt="OWASP PCCOE Logo"
            className="brand-logo-img"
          />
          <div className="brand-text">
            <span className="brand-pccoe">OWASP PCCOE</span>
            <span className="brand-academy">CTF ACADEMY</span>
          </div>
        </div>

        <div className="navbar-divider" />

        <div className="navbar-crumb">
          <span className="crumb-page">{pageTitles[activePage] || "Platform"}</span>
        </div>
      </div>

      <div className="nav-actions">
        <div className="nav-search-wrap">
          <FaSearch className="nav-search-icon" />
          <input
            type="text"
            className="nav-search-input"
            placeholder="Search / (Cmd+K)"
            value={navSearch}
            onChange={(e) => {
              setNavSearch(e.target.value);
              if (onSearch) onSearch(e.target.value);
            }}
          />
        </div>

        <button
          className="icon-btn notification-btn"
          onClick={onOpenNotifications}
          title="Notifications"
          aria-label="Notifications"
        >
          <FaBell />
          {unreadNotifications > 0 && (
            <span className="notification-count">
              {unreadNotifications > 99 ? "99+" : unreadNotifications}
            </span>
          )}
        </button>

        <button
          className="icon-btn theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <FaSun /> : <FaMoon />}
        </button>

        {user && (
          <div className="user-pill" onClick={() => onOpenProfile(user.id)} title="View Profile">
            <div className="avatar-chip">
              {user.profile_photo ? (
                <img
                  src={user.profile_photo}
                  alt={user.name}
                  className="avatar-img"
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="user-info-text">
              <span className="name">{user.name}</span>
              <span className="score">
                <span className="pts-val">{user.points} pts</span>
                <span className="solves-val">· {user.challenges_solved} solved</span>
              </span>
            </div>
          </div>
        )}

        <button
          className="icon-btn logout-btn"
          onClick={onLogout}
          title="Sign out"
          aria-label="Sign out"
        >
          <FaSignOutAlt />
        </button>
      </div>
    </header>
  );
}
