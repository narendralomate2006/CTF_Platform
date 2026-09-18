import React, { useEffect, useState } from "react";
import { api } from "../api";
import { FaUsers, FaPlus, FaSignInAlt, FaSignOutAlt, FaCopy, FaSyncAlt } from "react-icons/fa";

export default function Squads({ currentUser }) {
  const [teams, setTeams] = useState([]); const [mine, setMine] = useState(null); const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [leaderboard, setLeaderboard] = useState([]); const [slug, setSlug] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const load = async () => { try { const [r, lb] = await Promise.all([api.get("/teams"), api.get("/teams/leaderboard")]); setTeams(r.data.teams || []); setMine(r.data.my_team_id); setLeaderboard(lb.data.leaderboard || []); } catch(e){setError(e.response?.data?.detail || "Unable to load squads");} };
  useEffect(()=>{load()},[]);
  const act = async (fn) => { setBusy(true); setMessage(""); setError(""); try { const r=await fn(); setMessage(r.data.message); setName(""); setSlug(""); await load(); } catch(e){setError(e.response?.data?.detail || "Action failed");} finally{setBusy(false);} };
  const visible = teams.filter(t => `${t.name} ${t.slug} ${t.owner_name}`.toLowerCase().includes(search.toLowerCase()));
  const current = teams.find(t => t.id === mine);
  return <div className="squads-page">
    <div className="section-header"><div><h2>Squad Hub</h2><p className="subtitle">Build a team of up to 5 hackers for collaborative competitions.</p></div><button className="secondary-btn" onClick={load}><FaSyncAlt/> Refresh</button></div>
    {message && <div className="alert-banner success">{message}</div>}{error && <div className="alert-banner error">{error}</div>}
    {current && <div className="squad-current-card"><div><span className="sub-tag">CURRENT SQUAD</span><h3>{current.name}</h3><p>Join code: <code>{current.slug}</code> <button className="mini-icon" onClick={()=>navigator.clipboard?.writeText(current.slug)}><FaCopy/></button></p></div><button className="danger-btn" disabled={busy} onClick={()=>act(()=>api.post("/teams/leave"))}><FaSignOutAlt/> Leave Squad</button></div>}
    {!mine && <div className="squad-create-grid"><div className="table-card squad-action-card"><h3><FaPlus/> Create Squad</h3><p>Choose a unique squad name. Your generated slug can be shared with teammates.</p><div className="inline-form"><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Null Pointers"/><button className="primary-btn" disabled={busy||!name.trim()} onClick={()=>act(()=>api.post("/teams",{name}))}>Create</button></div></div><div className="table-card squad-action-card"><h3><FaSignInAlt/> Join Squad</h3><p>Ask the squad owner for the exact join slug.</p><div className="inline-form"><input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="e.g. null-pointers"/><button className="primary-btn" disabled={busy||!slug.trim()} onClick={()=>act(()=>api.post("/teams/join",{slug}))}>Join</button></div></div></div>}
    <div className="table-card" style={{marginBottom:16}}>
      <div className="section-header"><div><span className="sub-tag">GLOBAL SQUAD SCOREBOARD</span><h3>Team Rankings</h3></div></div>
      <div className="table-responsive"><table className="custom-table"><thead><tr><th>Rank</th><th>Squad</th><th>Members</th><th>Solves</th><th>Points</th></tr></thead><tbody>{leaderboard.slice(0,10).map(r=><tr key={r.team_id}><td>#{r.rank}</td><td><b>{r.name}</b></td><td>{r.member_count}</td><td>{r.challenges_solved}</td><td><b>{r.points} PTS</b></td></tr>)}</tbody></table></div>
    </div>
    <div className="toolbar-card"><input className="search-bar-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search squads..."/></div>
    <div className="squad-grid">{visible.map(t=><div className="squad-card" key={t.id}><div className="squad-card-head"><div className="squad-avatar"><FaUsers/></div><div><h3>{t.name}</h3><code>{t.slug}</code></div></div><p>Owner: <b>{t.owner_name}</b></p><div className="member-row">{t.members.map(m=><span key={m.id} className="member-chip" title={m.college||""}>{m.name}</span>)}</div><div className="squad-card-foot"><span>{t.member_count}/5 members</span>{!mine && <button className="secondary-btn sm" disabled={busy} onClick={()=>act(()=>api.post("/teams/join",{slug:t.slug}))}><FaSignInAlt/> Join</button>}</div></div>)}</div>
  </div>;
}
