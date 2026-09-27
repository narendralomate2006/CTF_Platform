import React, { useEffect, useState } from "react";
import { api } from "../api";
import { FaBell, FaCheck, FaSyncAlt, FaCheckCircle, FaAward, FaCalendarAlt, FaUsers } from "react-icons/fa";

export default function Notifications({ onCountChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/notifications");
      setItems(res.data.notifications || []);
      onCountChange?.(res.data.unread || 0);
    } catch (e) {
      setError(e.response?.data?.detail || "Unable to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setItems(v => v.map(n => n.id === id ? { ...n, is_read: true } : n));
      onCountChange?.(items.filter(n => !n.is_read && n.id !== id).length);
    } catch {}
  };

  const markAll = async () => {
    try {
      await api.post("/notifications/read-all");
      setItems(v => v.map(n => ({ ...n, is_read: true })));
      onCountChange?.(0);
    } catch {}
  };

  const getNotificationIcon = (title, message) => {
    const text = `${title} ${message}`.toLowerCase();
    if (text.includes("badge") || text.includes("trophy")) return <FaAward className="notif-type-icon badge-icon" />;
    if (text.includes("event") || text.includes("tournament")) return <FaCalendarAlt className="notif-type-icon event-icon" />;
    if (text.includes("squad") || text.includes("team")) return <FaUsers className="notif-type-icon squad-icon" />;
    return <FaCheckCircle className="notif-type-icon solve-icon" />;
  };

  return (
    <div className="notifications-page">
      <div className="page-header">
        <div>
          <div className="platform-breadcrumb">
            <span>OWASP PCCOE CTF Academy</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-active">Notifications</span>
          </div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">
            System updates, captured flags, tournament announcements, and squad activity.
          </p>
        </div>

        <div className="page-actions-group">
          <button className="btn-secondary btn-sm" onClick={load}>
            <FaSyncAlt /> Refresh
          </button>
          <button className="btn-primary btn-sm" onClick={markAll}>
            <FaCheck /> Mark All Read
          </button>
        </div>
      </div>

      {error && <div className="alert-banner error">{error}</div>}

      {loading ? (
        <div className="table-skeleton-wrap">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : items.length === 0 ? (
        <div className="card empty-card">
          <FaBell className="empty-icon" />
          <h3>No notifications</h3>
          <p>You are all caught up! New solves, squad invites, and event alerts will show up here.</p>
        </div>
      ) : (
        <div className="card notifications-card">
          <div className="notification-clean-list">
            {items.map(n => (
              <div
                key={n.id}
                className={`notif-row-item ${n.is_read ? "read" : "unread"}`}
                onClick={() => !n.is_read && markRead(n.id)}
              >
                <div className="notif-row-icon">
                  {getNotificationIcon(n.title, n.message)}
                </div>

                <div className="notif-row-content">
                  <div className="notif-row-title-line">
                    <b className="notif-title-text">{n.title}</b>
                    <span className="notif-timestamp-mono">
                      {new Date(n.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  <p className="notif-body-text">{n.message}</p>
                </div>

                {!n.is_read && <span className="notif-unread-dot" title="Unread" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
