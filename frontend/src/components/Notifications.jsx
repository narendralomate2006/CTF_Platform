import React, { useEffect, useState } from "react";
import { api } from "../api";
import { FaBell, FaCheck, FaSyncAlt } from "react-icons/fa";

export default function Notifications({ onCountChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await api.get("/notifications");
      setItems(res.data.notifications || []);
      onCountChange?.(res.data.unread || 0);
    } catch (e) { setError(e.response?.data?.detail || "Unable to load notifications"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    try { await api.post(`/notifications/${id}/read`); setItems(v => v.map(n => n.id === id ? {...n, is_read:true} : n)); onCountChange?.(items.filter(n => !n.is_read && n.id !== id).length); } catch {}
  };
  const markAll = async () => {
    try { await api.post("/notifications/read-all"); setItems(v => v.map(n => ({...n, is_read:true}))); onCountChange?.(0); } catch {}
  };

  return <div className="notifications-page">
    <div className="section-header">
      <div><h2>Notification Center</h2><p className="subtitle">Tournament, solve, squad and platform activity.</p></div>
      <div className="toolbar-actions"><button className="secondary-btn" onClick={load}><FaSyncAlt/> Refresh</button><button className="primary-btn" onClick={markAll}><FaCheck/> Mark all read</button></div>
    </div>
    {error && <div className="alert-banner error">{error} <button className="link-btn" onClick={load}>Retry</button></div>}
    {loading ? <div className="loading-state"><div className="spinner"/><p>Syncing notifications...</p></div> : items.length === 0 ? <div className="empty-state"><FaBell className="empty-icon"/><h3>Inbox clear</h3><p>New solves and tournament updates will appear here.</p></div> : <div className="notification-list">
      {items.map(n => <button key={n.id} className={`notification-item ${n.is_read ? "read" : "unread"}`} onClick={() => !n.is_read && markRead(n.id)}>
        <div className={`notification-icon ${n.kind}`}><FaBell/></div><div className="notification-copy"><b>{n.title}</b><p>{n.message}</p><small>{new Date(n.created_at).toLocaleString()}</small></div>{!n.is_read && <span className="unread-dot"/>}
      </button>)}
    </div>}
  </div>;
}
