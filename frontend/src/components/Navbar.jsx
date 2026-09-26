import React from "react";
import {
  FaShieldAlt,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaSun,
  FaMoon,
  FaFire,
  FaBell
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
  onOpenNotifications
}) {
  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("ctf_theme", nextTheme);
  };

  return (
    <header className="navbar">
      <button
        className="menu-btn"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <FaTimes /> : <FaBars />}
      </button>

      <div className="brand" onClick={() => (onNavigateHome ? onNavigateHome() : onOpenProfile(null))} style={{ cursor: "pointer" }}>
        <FaShieldAlt className="brand-icon" />
        <div className="brand-text">
          <b>OWASP <span>CTF</span></b>
          <span className="brand-badge">ACADEMY</span>
        </div>
      </div>

      <div className="nav-actions">
        <button className="icon-btn notification-btn" onClick={onOpenNotifications} title="Notifications">
          <FaBell />{unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
        </button>

        <button
          className="icon-btn theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <FaSun /> : <FaMoon />}
        </button>

        {user && (
          <div className="user-pill" onClick={() => onOpenProfile(user.id)}>
            <div className="avatar-chip" style={{ overflow: "hidden" }}>
              {user.profile_photo ? (
                <img
                  src={user.profile_photo}
                  alt={user.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                />
              ) : (
                user.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="user-info-text">
              <span className="name">{user.name}</span>
              <span className="score">
                <FaFire className="fire-icon" /> {user.points} pts · {user.challenges_solved} solves
              </span>
            </div>
          </div>
        )}

        <button className="icon-btn logout-btn" onClick={onLogout} title="Sign out">
          <FaSignOutAlt />
        </button>
      </div>
    </header>
  );
}
