import React, { useEffect, useState } from "react";
import { api, saveToken } from "../api";
import { FaShieldAlt, FaEnvelope, FaLock, FaUser, FaUniversity, FaGithub, FaInfoCircle, FaGoogle } from "react-icons/fa";

export default function Auth({ onLoginSuccess }) {
  const [mode, setMode] = useState("login");
  const [formData, setFormData] = useState({ name: "", email: "", password: "", college: "", bio: "", github: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [devLink, setDevLink] = useState("");
  const [loading, setLoading] = useState(false);

  const setField = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/^#verify-email\?token=(.+)$/);
    const reset = hash.match(/^#reset-password\?token=(.+)$/);
    const oauth = hash.match(/^#oauth-callback\?code=(.+)$/);
    if (match) {
      setLoading(true);
      api.post("/auth/verify-email", { token: decodeURIComponent(match[1]) })
        .then(r => { setMessage(r.data.message); window.location.hash = ""; setMode("login"); })
        .catch(e => setError(e.response?.data?.detail || "Verification link is invalid or expired."))
        .finally(() => setLoading(false));
    } else if (reset) {
      setMode("reset-confirm");
      setFormData(prev => ({ ...prev, password: "", resetToken: decodeURIComponent(reset[1]) }));
    } else if (oauth) {
      setLoading(true);
      api.post("/auth/oauth/exchange", { code: decodeURIComponent(oauth[1]) })
        .then(async r => {
          saveToken(r.data.access_token);

          const me = await api.get("/auth/me");

          onLoginSuccess(me.data);

          // Google login should land on the main dashboard.
          window.location.hash = "dashboard";
        })
        .catch(e => setError(e.response?.data?.detail || "Google sign-in failed."))
        .finally(() => setLoading(false));
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(""); setMessage(""); setDevLink(""); setLoading(true);
    try {
      if (mode === "register") {
        const res = await api.post("/auth/register", {
          name: formData.name.trim(), email: formData.email.trim(), password: formData.password,
          college: formData.college.trim() || null, bio: formData.bio.trim() || null, github: formData.github.trim() || null
        });
        if (res.data.access_token) {
          saveToken(res.data.access_token); const me = await api.get("/auth/me"); onLoginSuccess(me.data);
        } else {
          setMessage(res.data.message); setDevLink(res.data.development_verification_link || ""); setMode("verify");
        }
      } else if (mode === "login") {
        const res = await api.post("/auth/login", { email: formData.email.trim(), password: formData.password });
        saveToken(res.data.access_token); const me = await api.get("/auth/me"); onLoginSuccess(me.data);
      } else if (mode === "forgot") {
        const res = await api.post("/auth/request-password-reset", { email: formData.email.trim() });
        setMessage(res.data.message); setDevLink(res.data.development_reset_link || "");
      } else if (mode === "reset-confirm") {
        const res = await api.post("/auth/reset-password", { token: formData.resetToken, new_password: formData.password });
        setMessage(res.data.message); setMode("login"); window.location.hash = "";
      }
    } catch (err) { setError(err.response?.data?.detail || "Authentication request failed."); }
    finally { setLoading(false); }
  };

  const resend = async () => {
    setError(""); setMessage(""); setDevLink(""); setLoading(true);
    try { const r = await api.post("/auth/resend-verification", { email: formData.email.trim() }); setMessage(r.data.message); setDevLink(r.data.development_verification_link || ""); }
    catch (e) { setError(e.response?.data?.detail || "Could not resend verification email."); }
    finally { setLoading(false); }
  };

  const googleLogin = () => { window.location.href = `${api.defaults.baseURL}/auth/google`; };
  const title = mode === "login" ? "Welcome Back, Hacker" : mode === "register" ? "Create Student Account" : mode === "forgot" ? "Reset Your Password" : mode === "reset-confirm" ? "Set New Password" : "Verify Your Email";

  return (
    <div className="auth-wrapper">
      <div className="auth-hero">
        <div className="hero-content">
          <div className="hero-logo-box">
            <img src="/branding/owasp-pccoe-logo.png" alt="OWASP PCCOE Logo" className="hero-logo-img" />
          </div>
          <span className="hero-org-badge">OWASP PCCOE</span>
          <h1 className="hero-title">CTF ACADEMY</h1>
          <p className="hero-pillars">
            Learn Cybersecurity &bull; Solve Challenges &bull; Compete &bull; Grow
          </p>
          <p className="hero-tagline">
            An official cybersecurity learning and CTF platform for the OWASP PCCOE community.
          </p>

          <div className="hero-features">
            <div className="feat-item">
              <span className="feat-check">&#10003;</span>
              <div>
                <b>Curated Cybersecurity Challenges</b>
                <p>Web Exploitation, Cryptography, Forensics, Reverse Engineering, Pwn, OSINT, and Steganography.</p>
              </div>
            </div>
            <div className="feat-item">
              <span className="feat-check">&#10003;</span>
              <div>
                <b>Verified Student Profiles</b>
                <p>Track skill matrices, LeetCode-style activity heatmaps, solve streaks, and achievement badges.</p>
              </div>
            </div>
            <div className="feat-item">
              <span className="feat-check">&#10003;</span>
              <div>
                <b>OWASP PCCOE Tournaments & Events</b>
                <p>Participate in timed competitions, collaborate in squads, and earn cryptographically verified certificates.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">
          <div className="auth-card-top-brand">
            <img src="/branding/owasp-pccoe-logo.png" alt="OWASP PCCOE Logo" className="auth-card-logo" />
            <div className="auth-card-titles">
              <span className="auth-brand-name">OWASP PCCOE</span>
              <span className="auth-brand-product">CTF Academy</span>
            </div>
          </div>

          <div className="auth-header">
            <h2>{mode === "login" ? "Sign in to continue" : mode === "register" ? "Join OWASP PCCOE CTF Academy" : mode === "forgot" ? "Reset Your Password" : mode === "reset-confirm" ? "Set New Password" : "Verify Your Email"}</h2>
            <p className="auth-sub">
              {mode === "login"
                ? "Sign in to your OWASP PCCOE account to continue."
                : mode === "register"
                ? "Create your account and start solving cybersecurity challenges."
                : mode === "verify"
                ? "Check your inbox, then verify your account."
                : "Enter your registered email address to receive reset instructions."}
            </p>
          </div>

          {error && <div className="alert-banner error"><FaInfoCircle /><span>{error}</span></div>}
          {message && <div className="alert-banner success"><FaInfoCircle /><span>{message}</span></div>}
          {devLink && <div className="demo-credentials-box"><b>Development link</b><p><a href={devLink}>{devLink}</a></p></div>}

          {(mode === "login" || mode === "register" || mode === "forgot" || mode === "reset-confirm") && (
            <form onSubmit={handleSubmit} className="form-content">
              {mode === "register" && (
                <>
                  <div className="form-group">
                    <label><FaUser /> Full Name</label>
                    <input name="name" placeholder="Narendra Lomate" value={formData.name} onChange={setField} required />
                  </div>
                  <div className="form-group">
                    <label><FaUniversity /> College / Department</label>
                    <input name="college" placeholder="PCCOE Pune" value={formData.college} onChange={setField} />
                  </div>
                  <div className="form-group">
                    <label><FaGithub /> GitHub Username</label>
                    <input name="github" placeholder="username" value={formData.github} onChange={setField} />
                  </div>
                </>
              )}

              {mode !== "reset-confirm" && (
                <div className="form-group">
                  <label><FaEnvelope /> Email Address</label>
                  <input type="email" name="email" placeholder="student@pccoe.edu" value={formData.email} onChange={setField} required />
                </div>
              )}

              {mode === "register" && (
                <div className="form-group">
                  <label>Bio / Security Interests</label>
                  <textarea name="bio" placeholder="e.g. Web Exploitation enthusiast, PCCOE OWASP member" value={formData.bio} onChange={setField} rows={2} />
                </div>
              )}

              {(mode === "login" || mode === "register" || mode === "reset-confirm") && (
                <div className="form-group">
                  <label><FaLock /> Password</label>
                  <input type="password" name="password" placeholder="••••••••" value={formData.password} onChange={setField} minLength={8} required />
                </div>
              )}

              <button type="submit" className="primary-btn submit-auth-btn" disabled={loading}>
                {loading ? "Processing..." : mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : mode === "forgot" ? "Send Reset Email" : "Update Password"}
              </button>
            </form>
          )}

          {mode === "verify" && (
            <button className="primary-btn submit-auth-btn" onClick={resend} disabled={loading}>
              {loading ? "Sending..." : "Resend Verification Email"}
            </button>
          )}

          {mode === "login" && (
            <>
              <div className="auth-divider"><span>OR</span></div>
              <button type="button" className="secondary-btn submit-auth-btn google-btn" onClick={googleLogin}>
                <FaGoogle /> Continue with Google
              </button>
              <div className="auth-footer-toggle">
                <button className="link-btn" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>
                  Forgot password?
                </button>
              </div>
            </>
          )}

          {(mode === "login" || mode === "register") && (
            <div className="auth-footer-toggle">
              <button className="link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }}>
                {mode === "login" ? "Don't have an account? Create account" : "Already have an account? Sign in"}
              </button>
            </div>
          )}

          {mode !== "login" && mode !== "register" && (
            <div className="auth-footer-toggle">
              <button className="link-btn" onClick={() => { setMode("login"); setError(""); setMessage(""); window.location.hash = ""; }}>
                Back to Sign In
              </button>
            </div>
          )}

          {mode === "login" && (
            <div className="demo-credentials-box">
              <div className="demo-box-header">
                <FaInfoCircle /> <b>Quick Test Credentials</b>
              </div>
              <div className="demo-chips">
                <button type="button" className="demo-chip-btn" onClick={() => setFormData(p => ({ ...p, email: "admin@ctf.com", password: "admin123" }))}>
                  <span className="demo-role admin-role">ADMIN</span>
                  <code>admin@ctf.com</code>
                  <span>/</span>
                  <code>admin123</code>
                </button>
                <button type="button" className="demo-chip-btn" onClick={() => setFormData(p => ({ ...p, email: "user@ctf.com", password: "user123" }))}>
                  <span className="demo-role student-role">STUDENT</span>
                  <code>user@ctf.com</code>
                  <span>/</span>
                  <code>user123</code>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
