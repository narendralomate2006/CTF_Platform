import React, { useEffect, useState } from "react";
import { api, saveToken } from "../api";
import { FaGoogle, FaEnvelope, FaLock, FaUser, FaUniversity, FaGithub, FaCheckCircle, FaArrowLeft } from "react-icons/fa";

export default function Auth({ onLoginSuccess, initialMode = "login", onBackToLanding }) {
  const [mode, setMode] = useState(initialMode || "login");
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
        .then(r => {
          setMessage(r.data.message);
          window.location.hash = "";
          setMode("login");
        })
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
          window.location.hash = "dashboard";
        })
        .catch(e => setError(e.response?.data?.detail || "Google sign-in failed."))
        .finally(() => setLoading(false));
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setDevLink("");
    setLoading(true);

    try {
      if (mode === "register") {
        const res = await api.post("/auth/register", {
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          college: formData.college.trim() || null,
          bio: formData.bio.trim() || null,
          github: formData.github.trim() || null
        });
        if (res.data.access_token) {
          saveToken(res.data.access_token);
          const me = await api.get("/auth/me");
          onLoginSuccess(me.data);
        } else {
          setMessage(res.data.message);
          setDevLink(res.data.development_verification_link || "");
          setMode("verify");
        }
      } else if (mode === "login") {
        const res = await api.post("/auth/login", {
          email: formData.email.trim(),
          password: formData.password
        });
        saveToken(res.data.access_token);
        const me = await api.get("/auth/me");
        onLoginSuccess(me.data);
      } else if (mode === "forgot") {
        const res = await api.post("/auth/request-password-reset", {
          email: formData.email.trim()
        });
        setMessage(res.data.message);
        setDevLink(res.data.development_reset_link || "");
      } else if (mode === "reset-confirm") {
        const res = await api.post("/auth/reset-password", {
          token: formData.resetToken,
          new_password: formData.password
        });
        setMessage(res.data.message);
        setMode("login");
        window.location.hash = "";
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Authentication request failed.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError("");
    setMessage("");
    setDevLink("");
    setLoading(true);
    try {
      const r = await api.post("/auth/resend-verification", { email: formData.email.trim() });
      setMessage(r.data.message);
      setDevLink(r.data.development_verification_link || "");
    } catch (e) {
      setError(e.response?.data?.detail || "Could not resend verification email.");
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = () => {
    window.location.href = `${api.defaults.baseURL}/auth/google`;
  };

  return (
    <div className="auth-minimal-container">
      <div className="auth-box card">
        {onBackToLanding && (
          <button
            type="button"
            className="auth-back-home-btn"
            onClick={onBackToLanding}
          >
            <FaArrowLeft /> Back to Home
          </button>
        )}

        {/* Brand Header */}
        <div className="auth-brand-head">
          <img
            src="/branding/owasp-pccoe-logo.png"
            alt="OWASP PCCOE Logo"
            className="auth-brand-logo"
          />
          <h2 className="auth-brand-title">OWASP PCCOE CTF Academy</h2>
          <span className="auth-brand-subtitle">Official Student Cybersecurity Platform</span>
        </div>

        {/* Tab Switcher for Login / Register */}
        {(mode === "login" || mode === "register") && (
          <div className="auth-tabs">
            <button
              className={`auth-tab-btn ${mode === "login" ? "active" : ""}`}
              onClick={() => { setMode("login"); setError(""); setMessage(""); }}
            >
              Sign In
            </button>
            <button
              className={`auth-tab-btn ${mode === "register" ? "active" : ""}`}
              onClick={() => { setMode("register"); setError(""); setMessage(""); }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Alerts */}
        {error && <div className="alert-banner error">{error}</div>}
        {message && <div className="alert-banner success">{message}</div>}

        {/* Google OAuth Button */}
        {(mode === "login" || mode === "register") && (
          <div className="oauth-section">
            <button
              type="button"
              className="google-btn"
              onClick={googleLogin}
              disabled={loading}
            >
              <FaGoogle className="google-icon" />
              <span>Continue with Google</span>
            </button>

            <div className="auth-divider">
              <span>or</span>
            </div>
          </div>
        )}

        {/* Mode Forms */}
        {mode === "verify" ? (
          <div className="verify-flow-box">
            <h3>Verify Your Email Address</h3>
            <p>
              We've sent a verification link to <b>{formData.email}</b>. Click the link in your email to activate your student account.
            </p>

            {devLink && (
              <div className="dev-helper-box font-mono">
                <small>Local development link:</small>
                <a href={devLink}>{devLink}</a>
              </div>
            )}

            <div className="verify-actions">
              <button className="btn-secondary btn-sm" onClick={resend} disabled={loading}>
                Resend Email
              </button>
              <button className="btn-link" onClick={() => setMode("login")}>
                Back to Sign In
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="clean-form">
            {mode === "register" && (
              <>
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    name="name"
                    className="clean-input"
                    placeholder="Narendra Lomate"
                    value={formData.name}
                    onChange={setField}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>College / Affiliation</label>
                  <input
                    type="text"
                    name="college"
                    className="clean-input"
                    placeholder="Pimpri Chinchwad College of Engineering"
                    value={formData.college}
                    onChange={setField}
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                name="email"
                className="clean-input"
                placeholder="student@pccoepune.org"
                value={formData.email}
                onChange={setField}
                required
              />
            </div>

            {mode !== "forgot" && (
              <div className="form-group">
                <div className="form-label-row">
                  <label>Password</label>
                  {mode === "login" && (
                    <button
                      type="button"
                      className="forgot-link-btn"
                      onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  name="password"
                  className="clean-input"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={setField}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="btn-primary btn-block"
              disabled={loading}
            >
              {loading ? "Processing..." : mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : mode === "forgot" ? "Send Reset Link" : "Set New Password"}
            </button>

            {devLink && (
              <div className="dev-helper-box font-mono" style={{ marginTop: 16 }}>
                <small>Local development reset link:</small>
                <a href={devLink}>{devLink}</a>
              </div>
            )}

            {mode === "forgot" && (
              <button
                type="button"
                className="btn-link btn-block"
                style={{ marginTop: 12 }}
                onClick={() => { setMode("login"); setError(""); setMessage(""); }}
              >
                <FaArrowLeft /> Back to Sign In
              </button>
            )}
          </form>
        )}

        <div className="auth-footer-note">
          <span>By signing in, you agree to the OWASP PCCOE Academy Code of Conduct.</span>
        </div>
      </div>
    </div>
  );
}
