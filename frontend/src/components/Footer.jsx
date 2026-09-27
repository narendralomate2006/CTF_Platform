import React from "react";

export default function Footer({ onNavigate }) {
  return (
    <footer className="platform-footer">
      <div className="footer-inner">
        <div className="footer-brand-block">
          <div className="footer-brand-logo">
            <img
              src="/branding/owasp-pccoe-logo.png"
              alt="OWASP PCCOE Logo"
              className="footer-logo-img"
            />
            <div className="footer-brand-text">
              <span className="footer-org">OWASP PCCOE</span>
              <span className="footer-title">CTF Academy</span>
            </div>
          </div>
          <p className="footer-tagline">
            Cybersecurity Learning &bull; CTF &bull; Community
          </p>
        </div>

        <nav className="footer-nav" aria-label="Footer navigation">
          {onNavigate ? (
            <>
              <button type="button" className="footer-nav-link" onClick={() => onNavigate("challenges")}>
                Challenges
              </button>
              <button type="button" className="footer-nav-link" onClick={() => onNavigate("events")}>
                Events
              </button>
              <button type="button" className="footer-nav-link" onClick={() => onNavigate("leaderboard")}>
                Leaderboard
              </button>
              <button type="button" className="footer-nav-link" onClick={() => onNavigate("squads")}>
                Community
              </button>
            </>
          ) : (
            <>
              <span className="footer-nav-item">Challenges</span>
              <span className="footer-nav-item">Events</span>
              <span className="footer-nav-item">Leaderboard</span>
              <span className="footer-nav-item">Community</span>
            </>
          )}
        </nav>
      </div>

      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} OWASP PCCOE CTF Academy. All rights reserved.</p>
        <span className="footer-badge">Powered by OWASP PCCOE</span>
      </div>
    </footer>
  );
}
