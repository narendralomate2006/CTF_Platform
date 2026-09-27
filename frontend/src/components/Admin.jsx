import React, { useState, useEffect, useRef } from "react";
import { api, API_URL, getToken } from "../api";
import {
  FaChartLine,
  FaFlag,
  FaCalendarAlt,
  FaUsers,
  FaPlus,
  FaEdit,
  FaTrash,
  FaSnowflake,
  FaCheck,
  FaTimes,
  FaUserShield,
  FaBan,
  FaCheckCircle,
  FaCertificate,
  FaShieldAlt,
  FaSyncAlt,
  FaLightbulb,
  FaExternalLinkAlt,
  FaServer,
  FaStop,
  FaHeartbeat,
  FaUpload,
  FaEye,
  FaFont,
  FaAlignLeft,
  FaAlignCenter,
  FaAlignRight,
  FaUndo,
  FaEnvelope,
  FaSlidersH,
  FaMousePointer
} from "react-icons/fa";

const CATEGORIES = [
  "Web Exploitation",
  "Cryptography",
  "Forensics",
  "Reverse Engineering",
  "Pwn/Binary Exploitation",
  "OSINT",
  "Steganography",
  "Misc"
];

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Insane"];

const CERTIFICATE_FONTS = [
  { id: "Helvetica", label: "Helvetica (Clean Sans-Serif)", category: "Sans-Serif", cssFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: "Montserrat", label: "Montserrat (Modern Architectural Sans)", category: "Sans-Serif", cssFamily: "'Montserrat', sans-serif" },
  { id: "Times-Roman", label: "Times-Roman (Classic Academic Serif)", category: "Serif", cssFamily: "'Times New Roman', Times, serif" },
  { id: "Cinzel", label: "Cinzel (Classical Roman / Academy)", category: "Serif", cssFamily: "'Cinzel', serif" },
  { id: "PlayfairDisplay", label: "Playfair Display (Stately Editorial Serif)", category: "Serif", cssFamily: "'Playfair Display', serif" },
  { id: "Oswald", label: "Oswald (Bold Impact Display)", category: "Display", cssFamily: "'Oswald', sans-serif" },
  { id: "GreatVibes", label: "Great Vibes (Luxury Calligraphy Script)", category: "Calligraphy & Script", cssFamily: "'Great Vibes', cursive" },
  { id: "AlexBrush", label: "Alex Brush (Refined Penmanship Script)", category: "Calligraphy & Script", cssFamily: "'Alex Brush', cursive" },
  { id: "DancingScript", label: "Dancing Script (Lively Elegant Script)", category: "Calligraphy & Script", cssFamily: "'Dancing Script', cursive" },
  { id: "Courier", label: "Courier (Standard Monospace)", category: "Cyber & Tech", cssFamily: "'Courier New', Courier, monospace" },
  { id: "ShareTechMono", label: "Share Tech Mono (Hacker Matrix Monospace)", category: "Cyber & Tech", cssFamily: "'Share Tech Mono', monospace" },
  { id: "Orbitron", label: "Orbitron (Futuristic Cyber / Sci-Fi)", category: "Cyber & Tech", cssFamily: "'Orbitron', sans-serif" },
];

const getCssFontFamily = (fontId) => {
  const found = CERTIFICATE_FONTS.find(f => f.id === fontId);
  return found ? found.cssFamily : "sans-serif";
};

const CERT_ELEMENTS = [
  { key: "show_header", label: "Organization Header", desc: "Top organization banner text" },
  { key: "show_title", label: "Certificate Title", desc: "Main title (e.g. Certificate of Excellence)" },
  { key: "show_subtitle", label: "Presentation Subtitle", desc: "Introductory presentation line" },
  { key: "show_recipient", label: "Participant Name", desc: "Student's full name" },
  { key: "show_college", label: "College / Affiliation", desc: "Participant's academic institution" },
  { key: "show_body", label: "Achievement Narrative", desc: "Solves & score narrative description" },
  { key: "show_score", label: "Points & Solves Display", desc: "CTF score and flags captured numbers" },
  { key: "show_rank", label: "Leaderboard Rank Badge", desc: "Placement ribbon badge (e.g. Rank #1)" },
  { key: "show_badge", label: "Certificate Type Badge", desc: "Top Performer or Participation badge" },
  { key: "show_id", label: "Certificate ID Stamp", desc: "Unique verifiable serial number" },
  { key: "show_date", label: "Issue Date Stamp", desc: "Official date of completion" },
  { key: "show_signature", label: "Primary Signature", desc: "Faculty / Lead signature block" },
  { key: "show_second_signature", label: "Second Co-Signer", desc: "Co-signer signature block" },
  { key: "show_qr", label: "QR Authenticity Barcode", desc: "Live verification QR code" },
  { key: "show_border", label: "Dual Border Frame", desc: "Decorative outer & inner frame border" },
  { key: "show_shield", label: "Cyber Shield Logo", desc: "Watermark emblem and logo icon" }
];

const DEFAULT_ELEMENT_POSITIONS = {
  logo: { x: 50, y: 14 },
  header: { x: 50, y: 24 },
  title: { x: 50, y: 29 },
  subtitle: { x: 50, y: 37 },
  recipient: { x: 50, y: 45 },
  college: { x: 50, y: 52 },
  body: { x: 50, y: 59 },
  badges: { x: 50, y: 66 },
  primary_signature: { x: 75, y: 83 },
  second_signature: { x: 25, y: 83 },
  qr: { x: 50, y: 83 },
  footer: { x: 50, y: 91 }
};

const CANVA_ELEMENTS = [
  { key: "logo", label: "Logo / Shield", icon: "🛡️" },
  { key: "header", label: "Organization Header", icon: "🏛️" },
  { key: "title", label: "Certificate Title", icon: "📜" },
  { key: "subtitle", label: "Subtitle Text", icon: "✏️" },
  { key: "recipient", label: "Recipient Name", icon: "👤" },
  { key: "college", label: "College / Affiliation", icon: "🎓" },
  { key: "body", label: "Achievement Narrative", icon: "📝" },
  { key: "badges", label: "Badges / Rank / Score", icon: "⭐" },
  { key: "primary_signature", label: "Primary Signer", icon: "✍️" },
  { key: "second_signature", label: "Co-Signer Signature", icon: "✍️" },
  { key: "qr", label: "QR Code Verification", icon: "📱" },
  { key: "footer", label: "Certificate ID & Date", icon: "🔖" }
];


export default function Admin() {
  const [tab, setTab] = useState("analytics"); // analytics, challenges, events, users, certificates, security

  // Analytics data
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Challenges data
  const [challenges, setChallenges] = useState([]);
  const [editingChall, setEditingChall] = useState(null);
  const [challForm, setChallForm] = useState({
    title: "",
    description: "",
    category: "Web Exploitation",
    difficulty: "Easy",
    points: 100,
    flag: "",
    flag_mode: "static",
    flag_secret: "",
    status: "draft",
    hint: "",
    hint_cost: 15,
    writeup: "",
    file_url: "",
    connection_info: "",
    event_id: "",
    runtime_image: "",
    runtime_port: "",
    runtime_protocol: "http",
    instance_timeout_minutes: 60
  });

  // Events data
  const [events, setEvents] = useState([]);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventForm, setEventForm] = useState({
    name: "",
    description: "",
    start_date: "",
    end_date: "",
    participation_mode: "individual"
  });

  // Users data
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");

  const [message, setMessage] = useState("");
  const [selectedHintChallenge, setSelectedHintChallenge] = useState(null);
  const [hintForm, setHintForm] = useState({ title: "Hint", content: "", cost: 15, order_index: 1 });
  const [hints, setHints] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [certEventId, setCertEventId] = useState("general");
  const [certificates, setCertificates] = useState([]);
  const [certLoading, setCertLoading] = useState(false);
  const [certTemplate, setCertTemplate] = useState({
    has_template: false,
    template_url: null,
    has_logo: false,
    logo_url: null,
    has_signature: false,
    signature_url: null,
    has_second_signature: false,
    second_signature_url: null
  });
  const [applyToAllEvents, setApplyToAllEvents] = useState(false);
  const [certConfig, setCertConfig] = useState({
    orientation: "landscape",
    font_family: "Helvetica",
    recipient_font_family: "Helvetica",
    alignment: "center",
    title_font_size: 20,
    name_font_size: 32,
    body_font_size: 12,
    primary_color: "#1e293b",
    accent_color: "#0284c7",
    header_text: "OWASP PCCOE STUDENT CHAPTER",
    title_text: "Certificate of CTF Participation & Achievement",
    subtitle_text: "This certificate is proudly presented to",
    custom_body_text: "for participating in {event_name} and capturing {solves} flag(s) for {score} points.",
    signature_title: "OWASP Lead & Faculty Coordinator",
    signer_name: "",
    second_signature_title: "",
    second_signer_name: "",
    footer_note: "",
    show_header: true,
    show_title: true,
    show_subtitle: true,
    show_recipient: true,
    show_college: true,
    show_body: true,
    show_badge: true,
    show_rank: true,
    show_score: false,
    show_id: true,
    show_date: true,
    show_signature: true,
    show_second_signature: false,
    show_qr: false,
    show_border: true,
    show_shield: false,
    show_logo: false,
    logo_size: 22,
    top_offset: 0,
    side_padding: 28,
    preview_bg: true,
    theme_mode: "light",
    bg_mode: "default",
    positions: { ...DEFAULT_ELEMENT_POSITIONS }
  });
  const [certSaving, setCertSaving] = useState(false);
  const [certGenerating, setCertGenerating] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const canvasContainerRef = useRef(null);
  const dragInfoRef = useRef({
    isDragging: false,
    elemKey: null,
    startMouseX: 0,
    startMouseY: 0,
    startElemX: 50,
    startElemY: 50,
    canvasRect: null
  });

  const getElementPos = (key) => {
    if (certConfig.positions && certConfig.positions[key]) {
      return certConfig.positions[key];
    }
    return DEFAULT_ELEMENT_POSITIONS[key] || { x: 50, y: 50 };
  };

  const handleElementMouseDown = (e, elemKey) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedElement(elemKey);

    const canvas = canvasContainerRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const curPos = getElementPos(elemKey);

    dragInfoRef.current = {
      isDragging: true,
      elemKey,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startElemX: curPos.x,
      startElemY: curPos.y,
      canvasRect: rect
    };
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragInfoRef.current.isDragging) return;
      const { elemKey, startMouseX, startMouseY, startElemX, startElemY, canvasRect } = dragInfoRef.current;
      if (!canvasRect || canvasRect.width === 0 || canvasRect.height === 0) return;

      const deltaX = ((e.clientX - startMouseX) / canvasRect.width) * 100;
      const deltaY = ((e.clientY - startMouseY) / canvasRect.height) * 100;

      const newX = Math.max(2, Math.min(98, Math.round((startElemX + deltaX) * 10) / 10));
      const newY = Math.max(2, Math.min(98, Math.round((startElemY + deltaY) * 10) / 10));

      setCertConfig(prev => ({
        ...prev,
        positions: {
          ...(prev.positions || DEFAULT_ELEMENT_POSITIONS),
          [elemKey]: { x: newX, y: newY }
        }
      }));
    };

    const onMouseUp = () => {
      if (dragInfoRef.current.isDragging) {
        dragInfoRef.current.isDragging = false;
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const updateElementPos = (elemKey, axis, val) => {
    const num = Math.max(1, Math.min(99, parseFloat(val) || 0));
    setCertConfig(prev => ({
      ...prev,
      positions: {
        ...(prev.positions || DEFAULT_ELEMENT_POSITIONS),
        [elemKey]: {
          ...getElementPos(elemKey),
          [axis]: Math.round(num * 10) / 10
        }
      }
    }));
  };

  const nudgeElement = (elemKey, dx, dy) => {
    const cur = getElementPos(elemKey);
    const newX = Math.max(1, Math.min(99, Math.round((cur.x + dx) * 10) / 10));
    const newY = Math.max(1, Math.min(99, Math.round((cur.y + dy) * 10) / 10));
    setCertConfig(prev => ({
      ...prev,
      positions: {
        ...(prev.positions || DEFAULT_ELEMENT_POSITIONS),
        [elemKey]: { x: newX, y: newY }
      }
    }));
  };

  const resetSingleElementPos = (elemKey) => {
    const def = DEFAULT_ELEMENT_POSITIONS[elemKey] || { x: 50, y: 50 };
    setCertConfig(prev => ({
      ...prev,
      positions: {
        ...(prev.positions || DEFAULT_ELEMENT_POSITIONS),
        [elemKey]: { ...def }
      }
    }));
  };

  const resetAllElementPositions = () => {
    if (window.confirm("Reset all text boxes and elements to default Canva alignment positions?")) {
      setCertConfig(prev => ({
        ...prev,
        positions: { ...DEFAULT_ELEMENT_POSITIONS }
      }));
    }
  };
  const [securityOverview, setSecurityOverview] = useState(null);
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [securityFilter, setSecurityFilter] = useState("open");
  const [securityLoading, setSecurityLoading] = useState(false);
  const [liveInstances, setLiveInstances] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [storageStatus, setStorageStatus] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [monitoring, setMonitoring] = useState(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);

  // Load analytics
  const loadAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const res = await api.get("/admin/analytics");
      setAnalytics(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Load challenges
  const loadChallenges = async () => {
    try {
      const res = await api.get("/admin/challenges");
      setChallenges(res.data.challenges || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Load events
  const loadEvents = async () => {
    try {
      const res = await api.get("/events");
      setEvents(res.data.events || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Load users
  const loadUsers = async () => {
    try {
      const res = await api.get("/admin/users", {
        params: { search: userSearch || undefined }
      });
      setUsers(res.data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMonitoring = async () => {
    setMonitoringLoading(true);
    try {
      const res = await api.get("/admin/monitoring");
      setMonitoring(res.data);
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Could not load production monitoring", true);
    } finally { setMonitoringLoading(false); }
  };

  const loadSecurity = async () => {
    setSecurityLoading(true);
    try {
      const [overview, alerts] = await Promise.all([
        api.get("/admin/security/overview"),
        api.get("/admin/security/alerts", { params: { reviewed: securityFilter === "open" ? false : securityFilter === "reviewed" ? true : undefined } })
      ]);
      setSecurityOverview(overview.data.metrics);
      setSecurityAlerts(alerts.data.alerts || []);
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Could not load security monitoring", true);
    } finally { setSecurityLoading(false); }
  };

  const reviewAlert = async (id) => {
    try {
      await api.post(`/admin/security/alerts/${id}/review`, { reviewed: true });
      showFeedback("Security alert marked as reviewed.");
      loadSecurity();
    } catch (err) { showFeedback(err.response?.data?.detail || "Could not review alert", true); }
  };

  useEffect(() => {
    if (tab === "analytics") loadAnalytics();
    if (tab === "security") loadSecurity();
    if (tab === "monitoring") loadMonitoring();
    if (tab === "challenges") {
      loadChallenges();
      loadEvents();
    }
    if (tab === "events") loadEvents();
    if (tab === "certificates") {
      loadEvents();
      loadCertificateTemplate(certEventId || "general");
    }
    if (tab === "users") loadUsers();
    if (tab === "live") loadLiveInstances();
    if (tab === "storage") loadStorageStatus();
  }, [tab, userSearch]);

  const loadLiveInstances = async () => {
    setLiveLoading(true);
    try { const res = await api.get("/admin/live-instances"); setLiveInstances(res.data.instances || []); }
    catch (err) { showFeedback(err.response?.data?.detail || "Could not load live instances", true); }
    finally { setLiveLoading(false); }
  };

  const stopLiveInstance = async (id) => {
    try { await api.post(`/admin/live-instances/${id}/stop`); showFeedback("Live instance stopped."); loadLiveInstances(); }
    catch (err) { showFeedback(err.response?.data?.detail || "Could not stop instance", true); }
  };


  const loadStorageStatus = async () => {
    setStorageLoading(true);
    try { const res = await api.get("/admin/storage/status"); setStorageStatus(res.data.storage); }
    catch (err) { showFeedback(err.response?.data?.detail || "Could not load storage status", true); }
    finally { setStorageLoading(false); }
  };

  const migrateLocalStorage = async () => {
    setStorageLoading(true);
    try { const res = await api.post("/admin/storage/migrate-local"); showFeedback(`Migrated ${res.data.migrated.challenge_files} challenge file(s) and ${res.data.migrated.certificates} certificate(s).`); loadStorageStatus(); }
    catch (err) { showFeedback(err.response?.data?.detail || "Could not migrate local files", true); }
    finally { setStorageLoading(false); }
  };

  const showFeedback = (msg, isErr = false) => {
    if (isErr) {
      setError(msg);
      setMessage("");
    } else {
      setMessage(msg);
      setError("");
    }
    setTimeout(() => {
      setMessage("");
      setError("");
    }, 4000);
  };

  // Create or Update Challenge
  const handleSaveChallenge = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...challForm,
        points: Number(challForm.points),
        flag_mode: challForm.flag_mode,
        flag_secret: challForm.flag_secret || null,
        status: challForm.status,
        hint_cost: Number(challForm.hint_cost || 15),
        event_id: challForm.event_id ? Number(challForm.event_id) : null,
        runtime_image: challForm.runtime_image || null,
        runtime_port: challForm.runtime_port ? Number(challForm.runtime_port) : null,
        runtime_protocol: challForm.runtime_protocol || "http",
        instance_timeout_minutes: Number(challForm.instance_timeout_minutes || 60)
      };

      if (editingChall) {
        await api.put(`/admin/challenges/${editingChall.id}`, payload);
        showFeedback("Challenge updated successfully!");
        setEditingChall(null);
      } else {
        await api.post("/admin/challenges", payload);
        showFeedback("Challenge created successfully!");
      }

      setChallForm({
        title: "",
        description: "",
        category: "Web Exploitation",
        difficulty: "Easy",
        points: 100,
        flag: "",
        flag_mode: "static",
        flag_secret: "",
        status: "draft",
        hint: "",
        hint_cost: 15,
        writeup: "",
        file_url: "",
        connection_info: "",
        event_id: "",
        runtime_image: "",
        runtime_port: "",
        runtime_protocol: "http",
        instance_timeout_minutes: 60
      });
      loadChallenges();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Operation failed", true);
    }
  };

  // Delete challenge
  const handleDeleteChallenge = async (id) => {
    if (!window.confirm("Are you sure you want to delete this challenge?")) return;
    try {
      await api.delete(`/admin/challenges/${id}`);
      showFeedback("Challenge deleted.");
      loadChallenges();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Delete failed", true);
    }
  };

  // Save Event (Create or Update)
  const handleSaveEvent = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: eventForm.name,
        description: eventForm.description,
        start_date: new Date(eventForm.start_date).toISOString(),
        end_date: new Date(eventForm.end_date).toISOString(),
        participation_mode: eventForm.participation_mode
      };
      if (editingEvent) {
        await api.put(`/admin/events/${editingEvent.id}`, payload);
        showFeedback("Event updated successfully!");
        setEditingEvent(null);
      } else {
        await api.post("/admin/events", payload);
        showFeedback("Event created successfully!");
      }
      setEventForm({ name: "", description: "", start_date: "", end_date: "", participation_mode: "individual" });
      loadEvents();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Failed to save event", true);
    }
  };

  const startEditEvent = (ev) => {
    setEditingEvent(ev);
    setEventForm({
      name: ev.name,
      description: ev.description,
      start_date: ev.start_date ? new Date(ev.start_date).toISOString().slice(0, 16) : "",
      end_date: ev.end_date ? new Date(ev.end_date).toISOString().slice(0, 16) : "",
      participation_mode: ev.participation_mode || "individual"
    });
  };

  const cancelEditEvent = () => {
    setEditingEvent(null);
    setEventForm({ name: "", description: "", start_date: "", end_date: "", participation_mode: "individual" });
  };

  // Toggle Scoreboard Freeze
  const handleToggleFreeze = async (eventId) => {
    try {
      const res = await api.post(`/admin/events/${eventId}/toggle-freeze`);
      showFeedback(res.data.message);
      loadEvents();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Toggle failed", true);
    }
  };

  // Delete Event
  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm("Delete this event?")) return;
    try {
      await api.delete(`/admin/events/${eventId}`);
      showFeedback("Event deleted.");
      loadEvents();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Delete failed", true);
    }
  };

  // User Role Change
  const handleChangeRole = async (userId, newRole) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      showFeedback("User role updated.");
      loadUsers();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Role update failed", true);
    }
  };

  // Toggle User Active Status
  const handleToggleActive = async (userId) => {
    try {
      const res = await api.put(`/admin/users/${userId}/toggle-active`);
      showFeedback(res.data.message);
      loadUsers();
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Action failed", true);
    }
  };

  const loadHints = async (challengeId) => {
    try {
      const res = await api.get(`/admin/challenges/${challengeId}/hints`);
      setHints(res.data.hints || []);
    } catch (err) { showFeedback(err.response?.data?.detail || "Could not load hints", true); }
  };

  const addHint = async (e) => {
    e.preventDefault();
    if (!selectedHintChallenge) return;
    try {
      await api.post(`/admin/challenges/${selectedHintChallenge}/hints`, {
        ...hintForm, cost: Number(hintForm.cost), order_index: Number(hintForm.order_index)
      });
      setHintForm({ title: "Hint", content: "", cost: 15, order_index: hints.length + 2 });
      await loadHints(selectedHintChallenge);
      showFeedback("Hint added successfully.");
    } catch (err) { showFeedback(err.response?.data?.detail || "Failed to add hint", true); }
  };

  const publishChallenge = async (id) => {
    try { await api.post(`/admin/challenges/${id}/publish`); showFeedback("Challenge published."); loadChallenges(); }
    catch (err) { showFeedback(err.response?.data?.detail || "Publish failed", true); }
  };

  const archiveChallenge = async (id) => {
    try { await api.post(`/admin/challenges/${id}/archive`); showFeedback("Challenge archived."); loadChallenges(); }
    catch (err) { showFeedback(err.response?.data?.detail || "Archive failed", true); }
  };

  const loadCertificates = async (eventId) => {
    if (!eventId) return;
    setCertLoading(true);
    try {
      const res = await api.get(`/admin/events/${eventId}/certificates`);
      setCertificates(res.data.certificates || []);
    } catch (err) { showFeedback(err.response?.data?.detail || "Could not load certificates", true); }
    finally { setCertLoading(false); }
  };

  const loadCertificateTemplate = async (eventId) => {
    if (!eventId) return;
    try {
      const url = eventId === "general"
        ? "/admin/global-certificate-template"
        : `/admin/events/${eventId}/certificate-template`;
      const res = await api.get(url);
      if (res.data.success) {
        setCertTemplate({
          has_template: Boolean(res.data.has_template),
          template_url: res.data.template_url,
          has_logo: Boolean(res.data.has_logo),
          logo_url: res.data.logo_url,
          has_signature: Boolean(res.data.has_signature),
          signature_url: res.data.signature_url,
          has_second_signature: Boolean(res.data.has_second_signature),
          second_signature_url: res.data.second_signature_url
        });
        if (res.data.config) {
          setCertConfig(prev => ({ ...prev, ...res.data.config }));
        }
      }
    } catch (err) {
      console.error("Could not load certificate template:", err);
    }
  };

  const handleCertEventSelect = (eventId) => {
    setCertEventId(eventId);
    if (eventId === "general") {
      setCertificates([]);
      loadCertificateTemplate("general");
    } else if (eventId) {
      loadCertificates(eventId);
      loadCertificateTemplate(eventId);
    } else {
      setCertificates([]);
      setCertTemplate({
        has_template: false,
        template_url: null,
        has_logo: false,
        logo_url: null,
        has_signature: false,
        signature_url: null,
        has_second_signature: false,
        second_signature_url: null
      });
    }
  };

  const uploadCertAsset = async (assetType, file) => {
    if (!file || !certEventId) return;
    const formData = new FormData();
    formData.append("scope", certEventId);
    formData.append("asset_type", assetType);
    formData.append("file", file);
    setCertSaving(true);
    try {
      const res = await api.post("/admin/certificate-assets/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      showFeedback(res.data.message || `${assetType} uploaded successfully!`);
      setCertTemplate(prev => ({
        ...prev,
        [`has_${assetType}`]: true,
        [`${assetType}_url`]: res.data.asset_url
      }));
    } catch (err) {
      showFeedback(err.response?.data?.detail || `Failed to upload ${assetType}`, true);
    } finally {
      setCertSaving(false);
    }
  };

  const deleteCertAsset = async (assetType) => {
    if (!certEventId) return;
    const label = assetType.replace(/_/g, " ");
    if (!window.confirm(`Are you sure you want to remove the ${label}?`)) return;
    setCertSaving(true);
    try {
      const res = await api.delete(`/admin/certificate-assets/${certEventId}/${assetType}`);
      showFeedback(res.data.message || `${label} removed`);
      setCertTemplate(prev => ({
        ...prev,
        [`has_${assetType}`]: false,
        [`${assetType}_url`]: null
      }));
    } catch (err) {
      showFeedback(err.response?.data?.detail || `Failed to remove ${label}`, true);
    } finally {
      setCertSaving(false);
    }
  };

  const handleTemplateUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadCertAsset("template", file);
    e.target.value = "";
  };

  const saveCertConfig = async () => {
    if (!certEventId) return;
    setCertSaving(true);
    const formData = new FormData();
    formData.append("config", JSON.stringify(certConfig));
    if (certEventId === "general" && applyToAllEvents) {
      formData.append("apply_to_all_events", "true");
    }
    try {
      const url = certEventId === "general"
        ? "/admin/global-certificate-template"
        : `/admin/events/${certEventId}/certificate-template`;
      const res = await api.post(url, formData);
      showFeedback(res.data.message || "Certificate styling saved successfully!");
      if (res.data.config) setCertConfig(prev => ({ ...prev, ...res.data.config }));
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Failed to save styling", true);
    } finally {
      setCertSaving(false);
    }
  };

  const resetCertTemplate = async () => {
    if (!certEventId) return;
    if (!window.confirm("Reset certificate template to the built-in default? Custom styling will be reset.")) return;
    setCertSaving(true);
    try {
      if (certEventId === "general") {
        setCertTemplate({ has_template: false, template_url: null });
        const res = await api.get("/admin/global-certificate-template");
        if (res.data.config) setCertConfig(res.data.config);
      } else {
        const res = await api.delete(`/admin/events/${certEventId}/certificate-template`);
        showFeedback("Reset to default template.");
        setCertTemplate({ has_template: false, template_url: null });
        if (res.data.config) setCertConfig(res.data.config);
      }
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Reset failed", true);
    } finally {
      setCertSaving(false);
    }
  };

  const previewCertificate = () => {
    if (!certEventId) return;
    const token = getToken() || "";
    if (certEventId === "general") {
      const url = `${API_URL}/admin/global-certificate-preview?token=${token}`;
      window.open(url, "_blank");
    } else {
      const params = new URLSearchParams({
        token,
        orientation: certConfig.orientation || "landscape",
        font_family: certConfig.font_family || "Helvetica",
        recipient_font_family: certConfig.recipient_font_family || "",
        alignment: certConfig.alignment || "center",
        title_font_size: certConfig.title_font_size || 24,
        name_font_size: certConfig.name_font_size || 30,
        body_font_size: certConfig.body_font_size || 13,
        primary_color: certConfig.primary_color || "#111827",
        accent_color: certConfig.accent_color || "#0284c7"
      });
      const url = `${API_URL}/admin/events/${certEventId}/certificate-preview?${params.toString()}`;
      window.open(url, "_blank");
    }
  };

  const insertPlaceholderTag = (tag) => {
    setCertConfig(prev => ({
      ...prev,
      custom_body_text: (prev.custom_body_text ? prev.custom_body_text + " " : "") + tag
    }));
  };

  const setAllElementsVisibility = (val) => {
    setCertConfig(prev => ({
      ...prev,
      show_header: val,
      show_title: val,
      show_subtitle: val,
      show_recipient: val,
      show_college: val,
      show_body: val,
      show_badge: val,
      show_rank: val,
      show_score: val,
      show_id: val,
      show_date: val,
      show_signature: val,
      show_second_signature: val,
      show_qr: val,
      show_border: val,
      show_shield: val
    }));
  };

  const handleRegenerateAll = async () => {
    if (!window.confirm("Regenerate all issued certificates with this updated design?")) return;
    setCertGenerating(true);
    try {
      const res = await api.post("/admin/certificates/regenerate-all");
      showFeedback(res.data.message || "All certificates regenerated!");
      if (certEventId && certEventId !== "general") loadCertificates(certEventId);
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Failed to regenerate certificates", true);
    } finally {
      setCertGenerating(false);
    }
  };

  const generateCertificates = async (regenerate = false) => {
    if (!certEventId) return;
    setCertGenerating(true);
    try {
      const res = await api.post(`/admin/events/${certEventId}/certificates/generate?regenerate=${regenerate}`);
      showFeedback(res.data.message || `Generated ${res.data.created} certificates`);
      loadCertificates(certEventId);
    } catch (err) {
      showFeedback(err.response?.data?.detail || "Certificate generation failed", true);
    } finally {
      setCertGenerating(false);
    }
  };

  const revokeCertificate = async (id) => {
    if (!window.confirm("Revoke this certificate?")) return;
    try { await api.post(`/admin/certificates/${id}/revoke`); showFeedback("Certificate revoked."); loadCertificates(certEventId); }
    catch (err) { showFeedback(err.response?.data?.detail || "Revoke failed", true); }
  };

  const uploadChallengeFile = async (id, file) => {
    if (!file) return;
    const form = new FormData(); form.append("file", file); setUploading(true);
    try {
      await api.post(`/admin/challenges/${id}/upload`, form, { headers: { "Content-Type": "multipart/form-data" } });
      showFeedback("Challenge file uploaded."); loadChallenges();
    } catch (err) { showFeedback(err.response?.data?.detail || "Upload failed", true); }
    finally { setUploading(false); }
  };

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="section-header">
        <div>
          <div className="platform-breadcrumb">
            <span>OWASP PCCOE</span>
            <span className="breadcrumb-sep">/</span>
            <span>Admin</span>
          </div>
          <h2>OWASP PCCOE Command Center</h2>
          <p className="subtitle">
            Manage challenges, live events, participant access, and evaluate competition analytics for OWASP PCCOE CTF Academy.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {message && <div className="alert-banner success"><FaCheckCircle /> {message}</div>}
      {error && <div className="alert-banner error"><FaTimes /> {error}</div>}

      {/* Navigation Tabs */}
      <div className="tab-buttons">
        <button
          className={`tab-btn ${tab === "analytics" ? "active" : ""}`}
          onClick={() => setTab("analytics")}
        >
          <FaChartLine /> Analytics Dashboard
        </button>
        <button
          className={`tab-btn ${tab === "challenges" ? "active" : ""}`}
          onClick={() => setTab("challenges")}
        >
          <FaFlag /> Challenge Manager
        </button>
        <button
          className={`tab-btn ${tab === "events" ? "active" : ""}`}
          onClick={() => setTab("events")}
        >
          <FaCalendarAlt /> Event Manager
        </button>
        <button
          className={`tab-btn ${tab === "users" ? "active" : ""}`}
          onClick={() => setTab("users")}
        >
          <FaUsers /> User Controls
        </button>
        <button
          className={`tab-btn ${tab === "certificates" ? "active" : ""}`}
          onClick={() => setTab("certificates")}
        >
          <FaCertificate /> Certificates
        </button>
        <button className={`tab-btn ${tab === "live" ? "active" : ""}`} onClick={() => setTab("live")}><FaServer /> Live Instances</button>
        <button className={`tab-btn ${tab === "storage" ? "active" : ""}`} onClick={() => setTab("storage")}><FaServer /> File Storage</button>
        <button className={`tab-btn ${tab === "monitoring" ? "active" : ""}`} onClick={() => setTab("monitoring")}>
          <FaHeartbeat /> Production Monitor
        </button>
        <button
          className={`tab-btn ${tab === "security" ? "active" : ""}`}
          onClick={() => setTab("security")}
        >
          <FaShieldAlt /> Anti-Cheat Monitor
        </button>
      </div>

      {/* TAB 1: ANALYTICS DASHBOARD */}
      {tab === "analytics" && (
        <div className="admin-analytics-view">
          {loadingAnalytics ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Gathering club engagement metrics...</p>
            </div>
          ) : analytics ? (
            <>
              {/* Metric Cards */}
              <div className="metrics-grid">
                <div className="metric-box">
                  <span className="metric-title">Registered Students</span>
                  <b className="metric-num">{analytics.metrics.total_users}</b>
                </div>
                <div className="metric-box">
                  <span className="metric-title">Active Challenges</span>
                  <b className="metric-num">{analytics.metrics.total_challenges}</b>
                </div>
                <div className="metric-box">
                  <span className="metric-title">Total Submissions</span>
                  <b className="metric-num">{analytics.metrics.total_submissions}</b>
                </div>
                <div className="metric-box">
                  <span className="metric-title">Correct Solves</span>
                  <b className="metric-num neon">{analytics.metrics.correct_submissions}</b>
                </div>
                <div className="metric-box">
                  <span className="metric-title">Accuracy Rate</span>
                  <b className="metric-num">{analytics.metrics.accuracy_rate}%</b>
                </div>
              </div>

              {/* Category Solves Table */}
              <div className="table-card">
                <h3>Category Engagement Breakdown</h3>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Security Domain</th>
                        <th>Challenges</th>
                        <th>Total Solves</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.category_data.map(cd => (
                        <tr key={cd.category}>
                          <td><b>{cd.category}</b></td>
                          <td>{cd.challenges}</td>
                          <td><b className="points-text">{cd.solves} solves</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Challenge Solve Rates */}
              <div className="table-card">
                <h3>Challenge Difficulty Tuning & Solve Rates</h3>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Challenge</th>
                        <th>Category</th>
                        <th>Difficulty</th>
                        <th>Attempts</th>
                        <th>Solves</th>
                        <th>Solve Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.challenge_stats.map(cs => (
                        <tr key={cs.id}>
                          <td><b>{cs.title}</b></td>
                          <td><span className="category-tag">{cs.category}</span></td>
                          <td><span className={`difficulty-tag ${(cs.difficulty || "").toLowerCase()}`}>{cs.difficulty}</span></td>
                          <td>{cs.attempts}</td>
                          <td>{cs.solves}</td>
                          <td>
                            <div className="rate-cell">
                              <span>{cs.solve_rate}%</span>
                              <div className="progress-track sm">
                                <div className="progress-fill" style={{ width: `${cs.solve_rate}%` }}></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Submissions Log */}
              <div className="table-card">
                <h3>Live Submission Activity Logs</h3>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Student</th>
                        <th>Challenge</th>
                        <th>Result</th>
                        <th>Flag Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.submission_logs.map(log => (
                        <tr key={log.id}>
                          <td><small>{new Date(log.submitted_at).toLocaleTimeString()}</small></td>
                          <td><b>{log.user_name}</b></td>
                          <td>{log.challenge_title}</td>
                          <td>
                            <span className={`status-pill ${log.is_correct ? "earned" : "locked"}`}>
                              {log.is_correct ? "CORRECT" : "INCORRECT"}
                            </span>
                          </td>
                          <td><code>{log.submitted_flag}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* TAB 2: CHALLENGE MANAGER */}
      {tab === "challenges" && (
        <div className="admin-two-col">
          {/* Create/Edit Form */}
          <div className="table-card form-card">
            <h3>{editingChall ? "Edit Challenge" : "Deploy New Challenge"}</h3>
            <form onSubmit={handleSaveChallenge}>
              <div className="form-group">
                <label>Title:</label>
                <input
                  type="text"
                  placeholder="e.g. SQL Injection Bypass"
                  value={challForm.title}
                  onChange={e => setChallForm({ ...challForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description (Markdown supported):</label>
                <textarea
                  placeholder="Describe the scenario and objective..."
                  value={challForm.description}
                  onChange={e => setChallForm({ ...challForm, description: e.target.value })}
                  rows={3}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category:</label>
                  <select
                    value={challForm.category}
                    onChange={e => setChallForm({ ...challForm, category: e.target.value })}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Difficulty:</label>
                  <select
                    value={challForm.difficulty}
                    onChange={e => setChallForm({ ...challForm, difficulty: e.target.value })}
                  >
                    {DIFFICULTIES.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Points:</label>
                  <input
                    type="number"
                    min="10"
                    value={challForm.points}
                    onChange={e => setChallForm({ ...challForm, points: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Flag Mode:</label>
                  <select value={challForm.flag_mode} onChange={e => setChallForm({ ...challForm, flag_mode: e.target.value, flag: e.target.value === "static" ? challForm.flag : "" })}>
                    <option value="static">Static Flag</option>
                    <option value="user">Dynamic — Per Student</option>
                    <option value="team">Dynamic — Per Squad</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Lifecycle:</label>
                  <select value={challForm.status} onChange={e => setChallForm({ ...challForm, status: e.target.value })}>
                    <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {challForm.flag_mode !== "static" && (
                <div className="form-group">
                  <label>Dynamic Flag Secret (optional):</label>
                  <input type="text" placeholder="Leave blank to auto-generate" value={challForm.flag_secret} onChange={e => setChallForm({ ...challForm, flag_secret: e.target.value })} />
                  <small>Students never receive this secret. Use a strong external challenge secret in production.</small>
                </div>
              )}

              <div className="form-group">
                <label>Secret Flag {challForm.flag_mode !== "static" ? "(only needed for static mode)" : ""}:</label>
                <input
                  type="text"
                  placeholder="OWASP{exact_flag_here}"
                  value={challForm.flag}
                  onChange={e => setChallForm({ ...challForm, flag: e.target.value })}
                  required={challForm.flag_mode === "static"}
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-2">
                  <label>Hint:</label>
                  <input
                    type="text"
                    placeholder="Helpful nudge for stuck students..."
                    value={challForm.hint}
                    onChange={e => setChallForm({ ...challForm, hint: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Hint Penalty (Pts):</label>
                  <input
                    type="number"
                    min="0"
                    value={challForm.hint_cost}
                    onChange={e => setChallForm({ ...challForm, hint_cost: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Connection Target (optional):</label>
                <input
                  type="text"
                  placeholder="e.g. nc challenges.owasp.club 9001 or URL"
                  value={challForm.connection_info}
                  onChange={e => setChallForm({ ...challForm, connection_info: e.target.value })}
                />
              </div>

              <div className="form-card live-runtime-card">
                <h3><FaServer /> Live Challenge Runtime</h3>
                <p className="subtitle">Configure a Docker image for an isolated per-user challenge instance. Leave blank for static-only challenges.</p>
                <div className="form-row">
                  <div className="form-group flex-2"><label>Docker Image</label><input placeholder="e.g. ghcr.io/your-org/ctf-web-demo:latest" value={challForm.runtime_image} onChange={e=>setChallForm({...challForm,runtime_image:e.target.value})}/></div>
                  <div className="form-group"><label>Container Port</label><input type="number" min="1" max="65535" placeholder="8080" value={challForm.runtime_port} onChange={e=>setChallForm({...challForm,runtime_port:e.target.value})}/></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Protocol</label><select value={challForm.runtime_protocol} onChange={e=>setChallForm({...challForm,runtime_protocol:e.target.value})}><option value="http">HTTP</option><option value="tcp">TCP</option></select></div>
                  <div className="form-group"><label>Max Instance Time (minutes)</label><input type="number" min="5" max="240" value={challForm.instance_timeout_minutes} onChange={e=>setChallForm({...challForm,instance_timeout_minutes:e.target.value})}/></div>
                </div>
              </div>

              <div className="form-group">
                <label>Challenge Downloadable File URL (optional):</label>
                <input
                  type="url"
                  placeholder="https://.../challenge.zip"
                  value={challForm.file_url}
                  onChange={e => setChallForm({ ...challForm, file_url: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Official Writeup (unlocked post-solve):</label>
                <textarea
                  placeholder="Step-by-step solution..."
                  value={challForm.writeup}
                  onChange={e => setChallForm({ ...challForm, writeup: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>Link to Event (optional):</label>
                <select
                  value={challForm.event_id}
                  onChange={e => setChallForm({ ...challForm, event_id: e.target.value })}
                >
                  <option value="">General Practice Arena</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-btn">
                  <FaPlus /> {editingChall ? "Update Challenge" : "Save Challenge"}
                </button>
                {editingChall && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setEditingChall(null);
                      setChallForm({
                        title: "",
                        description: "",
                        category: "Web Exploitation",
                        difficulty: "Easy",
                        points: 100,
                        flag: "",
                        hint: "",
                        hint_cost: 15,
                        writeup: "",
                        file_url: "",
                        connection_info: "",
                        event_id: "",
                        runtime_image: "",
                        runtime_port: "",
                        runtime_protocol: "http",
                        instance_timeout_minutes: 60
                      });
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {selectedHintChallenge && (
            <div className="table-card form-card">
              <h3>Hint Builder — Challenge #{selectedHintChallenge}</h3>
              <form onSubmit={addHint}>
                <div className="form-group"><label>Hint Title</label><input value={hintForm.title} onChange={e => setHintForm({ ...hintForm, title: e.target.value })} /></div>
                <div className="form-group"><label>Hint Content</label><textarea rows={3} required value={hintForm.content} onChange={e => setHintForm({ ...hintForm, content: e.target.value })} /></div>
                <div className="form-row"><div className="form-group"><label>Cost</label><input type="number" min="0" value={hintForm.cost} onChange={e => setHintForm({ ...hintForm, cost: e.target.value })} /></div><div className="form-group"><label>Order</label><input type="number" min="1" value={hintForm.order_index} onChange={e => setHintForm({ ...hintForm, order_index: e.target.value })} /></div></div>
                <button className="primary-btn" type="submit"><FaPlus /> Add Hint</button>
              </form>
              <div className="hint-admin-list">{hints.map(h => <div className="hint-admin-row" key={h.id}><b>{h.order_index}. {h.title}</b><span>{h.cost} pts</span><button className="icon-action-btn delete" onClick={async()=>{await api.delete(`/admin/challenges/${selectedHintChallenge}/hints/${h.id}`);loadHints(selectedHintChallenge)}}><FaTrash/></button></div>)}</div>
            </div>
          )}

          {/* Challenges List Table */}
          <div className="table-card">
            <h3>Existing Challenges ({challenges.length})</h3>
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Pts</th>
                    <th>Mode</th>
                    <th>Status</th>
                    <th>Solves</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map(c => (
                    <tr key={c.id}>
                      <td><b>{c.title}</b></td>
                      <td><span className="category-tag">{c.category}</span></td>
                      <td>{c.points}</td>
                      <td><span className="category-tag">{c.flag_mode || "static"}</span></td>
                      <td><span className={`status-badge ${c.status || "published"}`}>{(c.status || "published").toUpperCase()}</span></td>
                      <td>{c.solves_count}</td>
                      <td>
                        <div className="action-icons">
                          <button className="icon-action-btn" title="Manage hints" onClick={() => { setSelectedHintChallenge(c.id); loadHints(c.id); }}><FaLightbulb /></button>
                          <label className="icon-action-btn" title="Upload challenge file"><FaExternalLinkAlt /><input type="file" hidden onChange={e => uploadChallengeFile(c.id, e.target.files[0])} /></label>
                          {c.status !== "published" && <button className="icon-action-btn" title="Publish" onClick={() => publishChallenge(c.id)}><FaCheck /></button>}
                          {c.status !== "archived" && <button className="icon-action-btn delete" title="Archive" onClick={() => archiveChallenge(c.id)}><FaBan /></button>}
                          <button
                            className="icon-action-btn edit"
                            onClick={() => {
                              setEditingChall(c);
                              setChallForm({
                                title: c.title,
                                description: c.description,
                                category: c.category,
                                difficulty: c.difficulty,
                                points: c.points,
                                flag: "", // keep blank for safety unless edited
                                flag_mode: c.flag_mode || "static",
                                flag_secret: "",
                                status: c.status || "published",
                                hint: c.hint || "",
                                hint_cost: c.hint_cost || 15,
                                writeup: "",
                                file_url: c.file_url || "",
                                connection_info: c.connection_info || "",
                                event_id: c.event_id || "",
                                runtime_image: c.runtime_image || "",
                                runtime_port: c.runtime_port || "",
                                runtime_protocol: c.runtime_protocol || "http",
                                instance_timeout_minutes: c.instance_timeout_minutes || 60
                              });
                            }}
                            title="Edit"
                          >
                            <FaEdit />
                          </button>
                          <button
                            className="icon-action-btn delete"
                            onClick={() => handleDeleteChallenge(c.id)}
                            title="Delete"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EVENT MANAGER */}
      {tab === "events" && (
        <div className="admin-two-col">
          {/* Create / Edit Event Form */}
          <div className="table-card form-card">
            <h3>{editingEvent ? "Edit Competition" : "Schedule New Competition"}</h3>
            <form onSubmit={handleSaveEvent}>
              <div className="form-group">
                <label>Event Name:</label>
                <input
                  type="text"
                  placeholder="e.g. OWASP Annual Cyber Clash 2026"
                  value={eventForm.name}
                  onChange={e => setEventForm({ ...eventForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description:</label>
                <textarea
                  placeholder="Competition rules, team sizes, schedule..."
                  value={eventForm.description}
                  onChange={e => setEventForm({ ...eventForm, description: e.target.value })}
                  rows={3}
                  required
                />
              </div>

              <div className="form-group">
                <label>Participation Mode:</label>
                <select value={eventForm.participation_mode} onChange={e => setEventForm({ ...eventForm, participation_mode: e.target.value })}>
                  <option value="individual">Individual</option>
                  <option value="team">Team / Squad</option>
                  <option value="both">Individual + Team</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date & Time:</label>
                  <input
                    type="datetime-local"
                    value={eventForm.start_date}
                    onChange={e => setEventForm({ ...eventForm, start_date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>End Date & Time:</label>
                  <input
                    type="datetime-local"
                    value={eventForm.end_date}
                    onChange={e => setEventForm({ ...eventForm, end_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button type="submit" className="primary-btn">
                  <FaCalendarAlt /> {editingEvent ? "Update Event" : "Create Event"}
                </button>
                {editingEvent && (
                  <button type="button" className="secondary-btn" onClick={cancelEditEvent}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Events List & Freeze Control */}
          <div className="table-card">
            <h3>Active & Scheduled Events</h3>
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Freeze Control</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id}>
                      <td>
                        <b>{ev.name}</b>
                        <small className="meta-time-block">
                          {new Date(ev.start_date).toLocaleDateString()} → {new Date(ev.end_date).toLocaleDateString()}
                        </small>
                      </td>
                      <td>
                        <span className={`status-badge ${ev.status}`}>{ev.status.toUpperCase()}</span>
                      </td>
                      <td>
                        <button
                          className={`freeze-toggle-btn ${ev.is_scoreboard_frozen ? "frozen" : "unfrozen"}`}
                          onClick={() => handleToggleFreeze(ev.id)}
                        >
                          <FaSnowflake /> {ev.is_scoreboard_frozen ? "Unfreeze Scoreboard" : "Freeze Scoreboard"}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="icon-action-btn edit"
                            onClick={() => startEditEvent(ev)}
                            title="Edit Event"
                          >
                            <FaEdit />
                          </button>
                          <button
                            className="icon-action-btn delete"
                            onClick={() => handleDeleteEvent(ev.id)}
                            title="Delete Event"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: LIVE INSTANCES */}
      {tab === "live" && (
        <div className="admin-section">
          <div className="section-header"><div><h2>Live Challenge Instances</h2><p className="subtitle">Monitor isolated Docker challenge containers and stop running instances when necessary.</p></div><button className="secondary-btn" onClick={loadLiveInstances}><FaSyncAlt/> Refresh</button></div>
          <div className="table-card"><div className="table-responsive"><table className="custom-table"><thead><tr><th>Challenge</th><th>Student</th><th>Status</th><th>Endpoint</th><th>Expires</th><th>Action</th></tr></thead><tbody>{liveInstances.map(i=><tr key={i.id}><td><b>{i.challenge_title}</b></td><td>{i.user_name}</td><td><span className={`status-badge ${i.status}`}>{i.status.toUpperCase()}</span></td><td><code>{i.connection_url || "—"}</code></td><td>{i.expires_at ? new Date(i.expires_at).toLocaleString() : "—"}</td><td>{["running","starting"].includes(i.status)&&<button className="icon-action-btn delete" title="Stop instance" onClick={()=>stopLiveInstance(i.id)}><FaStop/></button>}</td></tr>)}{!liveInstances.length&&<tr><td colSpan="6">{liveLoading?"Loading instances…":"No live instances."}</td></tr>}</tbody></table></div></div>
        </div>
      )}

      {/* TAB 4: CERTIFICATE CENTER */}
      {tab === "certificates" && (
        <div className="table-card certificate-admin-panel">
          <div className="section-header" style={{ marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3><FaCertificate /> Certificate Center & Designer</h3>
              <p className="subtitle">
                Customize every single element on the certificate: upload background templates, calibrate text alignment over templates, upload custom logo and signatures, and apply globally or per tournament.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={previewCertificate}
                title="Preview live certificate PDF"
              >
                <FaEye /> Live PDF Preview
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={saveCertConfig}
                disabled={certSaving}
              >
                <FaCheck /> {certSaving ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>

          {/* Scope Selector Row */}
          <div style={{
            background: "rgba(15, 23, 42, 0.65)",
            border: "1px solid var(--border-color)",
            borderRadius: "10px",
            padding: "16px 20px",
            marginBottom: "20px"
          }}>
            <div className="form-row" style={{ alignItems: "center", marginBottom: certEventId === "general" ? "12px" : "0" }}>
              <div className="form-group flex-2" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: "13px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>Tournament / Target Scope:</span>
                  {certEventId === "general" ? (
                    <span style={{
                      background: "rgba(56, 189, 248, 0.15)",
                      color: "#38bdf8",
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      border: "1px solid rgba(56, 189, 248, 0.3)"
                    }}>
                      GLOBAL MASTER TEMPLATE
                    </span>
                  ) : (
                    <span style={{
                      background: "rgba(245, 158, 11, 0.15)",
                      color: "#f59e0b",
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      border: "1px solid rgba(245, 158, 11, 0.3)"
                    }}>
                      EVENT OVERRIDE
                    </span>
                  )}
                </label>
                <select
                  value={certEventId}
                  onChange={e => handleCertEventSelect(e.target.value)}
                  style={{ fontSize: "14px", fontWeight: 600 }}
                >
                  <option value="general">★ Global General Certificate (Master Template for All Events)</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>
                      🏆 Tournament: {ev.name} {ev.is_active ? "(Active)" : "(Ended)"}
                    </option>
                  ))}
                </select>
              </div>

              {certEventId !== "general" && (
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "2px" }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ fontSize: "12px", whiteSpace: "nowrap" }}
                    onClick={() => {
                      if (window.confirm("Reset this tournament's certificate design to the Global General Certificate?")) {
                        loadCertificateTemplate("general");
                      }
                    }}
                  >
                    <FaUndo /> Copy from Global Template
                  </button>
                </div>
              )}
            </div>

            {certEventId === "general" && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: "rgba(56, 189, 248, 0.08)",
                border: "1px dashed rgba(56, 189, 248, 0.3)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#e2e8f0"
              }}>
                <input
                  type="checkbox"
                  id="apply-all-checkbox"
                  checked={applyToAllEvents}
                  onChange={e => setApplyToAllEvents(e.target.checked)}
                  style={{ width: "16px", height: "16px", accentColor: "var(--accent-cyan)", cursor: "pointer" }}
                />
                <label htmlFor="apply-all-checkbox" style={{ cursor: "pointer", margin: 0, fontWeight: 500 }}>
                  <strong>Sync across all events:</strong> Overwrite all tournament-specific certificate configurations with this Global General design when saving.
                </label>
              </div>
            )}
          </div>

          {/* Designer Grid */}
          <div className="cert-designer-grid">

            {/* CARD 1: ELEMENT VISIBILITY (ADD / REMOVE ELEMENTS) */}
            <div className="cert-designer-card" style={{ gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <h4 style={{ margin: 0 }}><FaSlidersH /> Add or Remove Certificate Elements</h4>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                    Select which elements should appear on the certificate. Whichever you uncheck is completely removed and the layout automatically reflows.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                    onClick={() => setAllElementsVisibility(true)}
                  >
                    Enable All Elements
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                    onClick={() => {
                      setCertConfig(prev => ({
                        ...prev,
                        show_header: false,
                        show_title: true,
                        show_subtitle: false,
                        show_recipient: true,
                        show_college: false,
                        show_body: true,
                        show_badge: false,
                        show_rank: false,
                        show_score: true,
                        show_id: true,
                        show_date: true,
                        show_signature: true,
                        show_second_signature: false,
                        show_qr: true,
                        show_border: true,
                        show_shield: false,
                        show_logo: false
                      }));
                    }}
                  >
                    Minimal Layout
                  </button>
                </div>
              </div>

              <div className="cert-toggles-grid">
                {CERT_ELEMENTS.map(elem => {
                  const isChecked = certConfig[elem.key] !== false;
                  return (
                    <label
                      key={elem.key}
                      className={`cert-toggle-item ${isChecked ? "checked" : ""}`}
                      onClick={e => {
                        e.preventDefault();
                        setCertConfig(prev => ({ ...prev, [elem.key]: !isChecked }));
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                        <span style={{ fontWeight: 600, fontSize: "12px", color: isChecked ? "var(--text-primary)" : "var(--text-muted)" }}>
                          {elem.label}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.2 }}>
                          {elem.desc}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* CARD 2: BACKGROUND TEMPLATE & LIVE ALIGNMENT CALIBRATION */}
            <div className="cert-designer-card">
              <h4><FaUpload /> Background Template & Alignment</h4>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Upload external certificate design image and adjust text margins to align with the template's blank area.
              </p>

              {/* Upload Zone */}
              <div
                className="template-upload-zone"
                style={{ padding: "16px", cursor: "pointer", border: "2px dashed var(--accent-cyan)", borderRadius: "8px", textAlign: "center" }}
                onClick={() => document.getElementById("cert-template-file-input")?.click()}
              >
                <input
                  id="cert-template-file-input"
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  style={{ display: "none" }}
                  onChange={handleTemplateUpload}
                />
                <FaUpload style={{ fontSize: "22px", color: "var(--accent-cyan)", marginBottom: "6px" }} />
                <p style={{ fontWeight: 600, fontSize: "13px", margin: "0 0 2px 0" }}>Click to Upload Background Template</p>
                <small style={{ color: "var(--text-muted)" }}>PNG or JPG (A4 recommended). Text will overlay on top.</small>
              </div>

              {/* Template Status Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", marginTop: "8px" }}>
                <span style={{ color: certTemplate.has_template ? "var(--accent-cyan)" : "var(--accent-gold)", fontWeight: 600 }}>
                  {certTemplate.has_template ? "● Custom Background Template Active" : "○ Default Built-in Layout"}
                </span>
                {certTemplate.has_template && (
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ padding: "3px 8px", fontSize: "11px" }}
                    onClick={() => deleteCertAsset("template")}
                    disabled={certSaving}
                  >
                    <FaUndo /> Remove Template
                  </button>
                )}
              </div>

              {certTemplate.has_template && certTemplate.template_url && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", background: "rgba(0,0,0,0.2)", padding: "6px 10px", borderRadius: "6px" }}>
                  <img src={certTemplate.template_url} alt="Template" className="cert-asset-thumb" />
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Template loaded & rendered in live preview below.</span>
                </div>
              )}

              {/* Active Background Mode Selector */}
              <div style={{ marginTop: "12px", background: "rgba(15, 23, 42, 0.6)", padding: "10px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                  Active Background Mode:
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`badge ${certConfig.bg_mode !== "default" ? "badge-primary" : "badge-secondary"}`}
                    onClick={() => setCertConfig({ ...certConfig, bg_mode: "auto" })}
                    style={{ cursor: "pointer", padding: "6px 12px", fontSize: "11px" }}
                  >
                    🖼️ Use Uploaded Template
                  </button>
                  <button
                    type="button"
                    className={`badge ${certConfig.bg_mode === "default" ? "badge-primary" : "badge-secondary"}`}
                    onClick={() => setCertConfig({ ...certConfig, bg_mode: "default" })}
                    style={{ cursor: "pointer", padding: "6px 12px", fontSize: "11px" }}
                  >
                    🛡️ Clean Platform Certificate (No Custom BG)
                  </button>
                </div>
              </div>

              {/* Alignment Calibration Sliders */}
              <div style={{ marginTop: "14px", borderTop: "1px solid var(--border-color)", paddingTop: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, display: "block", marginBottom: "8px" }}>
                  Text Placement & Calibration Sliders
                </span>

                <div className="form-group" style={{ marginBottom: "10px" }}>
                  <label style={{ fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                    <span>Vertical Text Offset (Top Margin)</span>
                    <strong style={{ color: "var(--accent-cyan)" }}>{certConfig.top_offset || 0}px</strong>
                  </label>
                  <input
                    type="range"
                    min="-40"
                    max="140"
                    step="2"
                    value={certConfig.top_offset || 0}
                    onChange={e => setCertConfig({ ...certConfig, top_offset: parseInt(e.target.value) })}
                  />
                  <small style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                    Move entire text block down/up to fit perfectly into your template's empty zone.
                  </small>
                </div>

                <div className="form-group" style={{ marginBottom: "10px" }}>
                  <label style={{ fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                    <span>Side Margins (Horizontal Padding)</span>
                    <strong style={{ color: "var(--accent-cyan)" }}>{certConfig.side_padding || 28}px</strong>
                  </label>
                  <input
                    type="range"
                    min="12"
                    max="80"
                    step="2"
                    value={certConfig.side_padding || 28}
                    onChange={e => setCertConfig({ ...certConfig, side_padding: parseInt(e.target.value) })}
                  />
                </div>

                {/* Preview Settings Toggles */}
                <div style={{ display: "flex", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={certConfig.preview_bg !== false}
                      onChange={e => setCertConfig({ ...certConfig, preview_bg: e.target.checked })}
                    />
                    Show Template in Live Preview
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={certConfig.theme_mode === "light"}
                      onChange={e => setCertConfig({ ...certConfig, theme_mode: e.target.checked ? "light" : "dark" })}
                    />
                    Use Dark Text Mode (for Light Templates)
                  </label>
                </div>
              </div>
            </div>

            {/* CARD 3: ORGANIZATION LOGO (UPLOAD / REMOVE / RESIZE) */}
            <div className="cert-designer-card">
              <h4><FaShieldAlt /> Organization Logo & Emblem</h4>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Add your official club, university, or sponsor logo image, or toggle off to remove the emblem completely.
              </p>

              {/* Logo visibility checkbox */}
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={certConfig.show_shield !== false && certConfig.show_logo !== false}
                    onChange={e => setCertConfig({ ...certConfig, show_shield: e.target.checked, show_logo: e.target.checked })}
                    style={{ accentColor: "var(--accent-cyan)", width: "16px", height: "16px" }}
                  />
                  <span>Display Logo / Emblem on Certificate</span>
                </label>
              </div>

              {/* Custom Logo Upload Box */}
              <input
                id="cert-logo-file-input"
                type="file"
                accept=".png,.jpg,.jpeg"
                style={{ display: "none" }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) uploadCertAsset("logo", file);
                  e.target.value = "";
                }}
              />

              <div className="cert-asset-upload-box">
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 600 }}>Custom Logo Image</div>
                  <small style={{ color: "var(--text-muted)" }}>PNG with transparent background recommended</small>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {certTemplate.has_logo && certTemplate.logo_url && (
                    <img src={certTemplate.logo_url} alt="Logo" className="cert-asset-thumb" />
                  )}
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ padding: "4px 10px", fontSize: "11px" }}
                    onClick={() => document.getElementById("cert-logo-file-input")?.click()}
                  >
                    <FaUpload /> {certTemplate.has_logo ? "Change Logo" : "Upload Logo"}
                  </button>
                  {certTemplate.has_logo && (
                    <button
                      type="button"
                      className="icon-action-btn delete"
                      title="Remove custom logo and revert to shield emblem"
                      onClick={() => deleteCertAsset("logo")}
                    >
                      <FaTrash />
                    </button>
                  )}
                </div>
              </div>

              {/* Logo Size Slider */}
              <div className="form-group" style={{ marginTop: "12px" }}>
                <label style={{ fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                  <span>Logo Display Size</span>
                  <strong style={{ color: "var(--accent-cyan)" }}>{certConfig.logo_size || 22}mm ({Math.round((certConfig.logo_size || 22) * 2.2)}px)</strong>
                </label>
                <input
                  type="range"
                  min="16"
                  max="50"
                  step="2"
                  value={certConfig.logo_size || 22}
                  onChange={e => setCertConfig({ ...certConfig, logo_size: parseInt(e.target.value) })}
                />
              </div>
            </div>

            {/* CARD 4: SIGNATURES & CO-SIGNERS */}
            <div className="cert-designer-card">
              <h4><FaEdit /> Signatures & Co-Signer Setup</h4>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Upload digital signature images (transparent PNG) and configure names and official titles.
              </p>

              {/* Primary Signer */}
              <div style={{ padding: "10px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={certConfig.show_signature !== false}
                      onChange={e => setCertConfig({ ...certConfig, show_signature: e.target.checked })}
                    />
                    <span>Primary Signer</span>
                  </label>
                </div>

                <input
                  id="primary-sig-file-input"
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  style={{ display: "none" }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) uploadCertAsset("signature", file);
                    e.target.value = "";
                  }}
                />

                <div className="cert-asset-upload-box" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div>
                    <span style={{ fontSize: "11px", fontWeight: 600 }}>Signature Image</span>
                    <small style={{ display: "block", color: "var(--text-muted)" }}>Transparent PNG</small>
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {certTemplate.has_signature && certTemplate.signature_url && (
                      <img src={certTemplate.signature_url} alt="Signature" className="cert-asset-thumb" />
                    )}
                    <button
                      type="button"
                      className="secondary-btn"
                      style={{ padding: "3px 8px", fontSize: "11px" }}
                      onClick={() => document.getElementById("primary-sig-file-input")?.click()}
                    >
                      <FaUpload /> {certTemplate.has_signature ? "Replace" : "Upload Image"}
                    </button>
                    {certTemplate.has_signature && (
                      <button
                        type="button"
                        className="icon-action-btn delete"
                        title="Remove primary signature image"
                        onClick={() => deleteCertAsset("signature")}
                      >
                        <FaTrash />
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: "6px", marginBottom: "2px" }}>
                  <div className="form-group flex-1">
                    <label style={{ fontSize: "11px" }}>Signer Title</label>
                    <input
                      type="text"
                      value={certConfig.signature_title || ""}
                      onChange={e => setCertConfig({ ...certConfig, signature_title: e.target.value })}
                      placeholder="OWASP Lead & Faculty Coordinator"
                      style={{ fontSize: "11px" }}
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label style={{ fontSize: "11px" }}>Printed Signer Name</label>
                    <input
                      type="text"
                      value={certConfig.signer_name || ""}
                      onChange={e => setCertConfig({ ...certConfig, signer_name: e.target.value })}
                      placeholder="Dr. Jane Smith"
                      style={{ fontSize: "11px" }}
                    />
                  </div>
                </div>
              </div>

              {/* Second Co-Signer */}
              <div style={{ padding: "10px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(certConfig.show_second_signature)}
                      onChange={e => setCertConfig({ ...certConfig, show_second_signature: e.target.checked })}
                    />
                    <span>Second Co-Signer</span>
                  </label>
                </div>

                {certConfig.show_second_signature && (
                  <>
                    <input
                      id="second-sig-file-input"
                      type="file"
                      accept=".png,.jpg,.jpeg"
                      style={{ display: "none" }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) uploadCertAsset("second_signature", file);
                        e.target.value = "";
                      }}
                    />

                    <div className="cert-asset-upload-box" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <div>
                        <span style={{ fontSize: "11px", fontWeight: 600 }}>Co-Signer Signature Image</span>
                        <small style={{ display: "block", color: "var(--text-muted)" }}>Transparent PNG</small>
                      </div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        {certTemplate.has_second_signature && certTemplate.second_signature_url && (
                          <img src={certTemplate.second_signature_url} alt="Co-Signer Sig" className="cert-asset-thumb" />
                        )}
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{ padding: "3px 8px", fontSize: "11px" }}
                          onClick={() => document.getElementById("second-sig-file-input")?.click()}
                        >
                          <FaUpload /> {certTemplate.has_second_signature ? "Replace" : "Upload Image"}
                        </button>
                        {certTemplate.has_second_signature && (
                          <button
                            type="button"
                            className="icon-action-btn delete"
                            title="Remove co-signer signature image"
                            onClick={() => deleteCertAsset("second_signature")}
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="form-row" style={{ marginTop: "6px", marginBottom: "2px" }}>
                      <div className="form-group flex-1">
                        <label style={{ fontSize: "11px" }}>Co-Signer Title</label>
                        <input
                          type="text"
                          value={certConfig.second_signature_title || ""}
                          onChange={e => setCertConfig({ ...certConfig, second_signature_title: e.target.value })}
                          placeholder="Head of Department / Director"
                          style={{ fontSize: "11px" }}
                        />
                      </div>
                      <div className="form-group flex-1">
                        <label style={{ fontSize: "11px" }}>Printed Co-Signer Name</label>
                        <input
                          type="text"
                          value={certConfig.second_signer_name || ""}
                          onChange={e => setCertConfig({ ...certConfig, second_signer_name: e.target.value })}
                          placeholder="Prof. John Doe"
                          style={{ fontSize: "11px" }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* CARD 5: CUSTOM TEXT, NARRATIVE & TYPOGRAPHY */}
            <div className="cert-designer-card">
              <h4><FaFont /> Typography, Narrative & Colors</h4>

              {/* Header & Titles */}
              {certConfig.show_header !== false && (
                <div className="form-group" style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "11px" }}>Organization Header</label>
                  <input
                    type="text"
                    value={certConfig.header_text || ""}
                    onChange={e => setCertConfig({ ...certConfig, header_text: e.target.value })}
                    placeholder="OWASP PCCOE STUDENT CHAPTER"
                    style={{ fontSize: "12px" }}
                  />
                </div>
              )}

              {certConfig.show_title !== false && (
                <div className="form-group" style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "11px" }}>Certificate Title</label>
                  <input
                    type="text"
                    value={certConfig.title_text || ""}
                    onChange={e => setCertConfig({ ...certConfig, title_text: e.target.value })}
                    placeholder="Certificate of CTF Participation & Achievement"
                    style={{ fontSize: "12px" }}
                  />
                </div>
              )}

              {certConfig.show_subtitle !== false && (
                <div className="form-group" style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "11px" }}>Presentation Subtitle</label>
                  <input
                    type="text"
                    value={certConfig.subtitle_text || ""}
                    onChange={e => setCertConfig({ ...certConfig, subtitle_text: e.target.value })}
                    placeholder="This certificate is proudly presented to"
                    style={{ fontSize: "12px" }}
                  />
                </div>
              )}

              {/* Narrative Text */}
              {certConfig.show_body !== false && (
                <div className="form-group" style={{ marginBottom: "8px" }}>
                  <label style={{ fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                    <span>Achievement Narrative Body</span>
                    <span style={{ fontSize: "10px", color: "var(--accent-cyan)" }}>Click token to insert</span>
                  </label>
                  <textarea
                    rows="2"
                    value={certConfig.custom_body_text || ""}
                    onChange={e => setCertConfig({ ...certConfig, custom_body_text: e.target.value })}
                    placeholder="for participating in {event_name} and capturing {solves} flag(s) for {score} points."
                    style={{ fontSize: "11px", resize: "vertical" }}
                  />
                  <div className="tag-pills-row">
                    {[
                      { tag: "{participant_name}", label: "Name" },
                      { tag: "{college}", label: "College" },
                      { tag: "{event_name}", label: "Event" },
                      { tag: "{score}", label: "Points" },
                      { tag: "{solves}", label: "Solves" },
                      { tag: "{rank}", label: "Rank" },
                      { tag: "{date}", label: "Date" }
                    ].map(p => (
                      <button
                        key={p.tag}
                        type="button"
                        className="placeholder-pill"
                        onClick={() => insertPlaceholderTag(p.tag)}
                      >
                        {p.tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Fonts Row */}
              <div className="form-row" style={{ marginBottom: "6px" }}>
                <div className="form-group flex-1">
                  <label style={{ fontSize: "11px" }}>Base Font Family</label>
                  <select
                    value={certConfig.font_family || "Helvetica"}
                    onChange={e => setCertConfig({ ...certConfig, font_family: e.target.value })}
                    style={{ fontFamily: getCssFontFamily(certConfig.font_family || "Helvetica") }}
                  >
                    <optgroup label="Classical & Academic Serif">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Serif").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Modern Sans-Serif">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Sans-Serif").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Luxury Calligraphy & Script">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Calligraphy & Script").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Cyber & Hacker Monospace">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Cyber & Tech").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Bold Display">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Display").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label style={{ fontSize: "11px" }}>Recipient Name Font</label>
                  <select
                    value={certConfig.recipient_font_family || ""}
                    onChange={e => setCertConfig({ ...certConfig, recipient_font_family: e.target.value })}
                    style={{ fontFamily: getCssFontFamily(certConfig.recipient_font_family || certConfig.font_family || "Helvetica") }}
                  >
                    <option value="">(Same as Base Font)</option>
                    <optgroup label="Luxury Calligraphy & Script (Recommended)">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Calligraphy & Script").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Classical & Academic Serif">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Serif").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Modern Sans-Serif">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Sans-Serif").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Cyber & Hacker Monospace">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Cyber & Tech").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Bold Display">
                      {CERTIFICATE_FONTS.filter(f => f.category === "Display").map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Orientation & Alignment */}
              <div className="form-row" style={{ marginBottom: "6px" }}>
                <div className="form-group flex-1">
                  <label style={{ fontSize: "11px" }}>Page Orientation</label>
                  <select
                    value={certConfig.orientation || "landscape"}
                    onChange={e => setCertConfig({ ...certConfig, orientation: e.target.value })}
                  >
                    <option value="landscape">Landscape (Standard A4)</option>
                    <option value="portrait">Portrait (A4)</option>
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label style={{ fontSize: "11px" }}>Text Alignment</label>
                  <div className="align-btn-group">
                    <button
                      type="button"
                      className={certConfig.alignment === "left" ? "active" : ""}
                      onClick={() => setCertConfig({ ...certConfig, alignment: "left" })}
                    >
                      <FaAlignLeft /> Left
                    </button>
                    <button
                      type="button"
                      className={(!certConfig.alignment || certConfig.alignment === "center") ? "active" : ""}
                      onClick={() => setCertConfig({ ...certConfig, alignment: "center" })}
                    >
                      <FaAlignCenter /> Center
                    </button>
                    <button
                      type="button"
                      className={certConfig.alignment === "right" ? "active" : ""}
                      onClick={() => setCertConfig({ ...certConfig, alignment: "right" })}
                    >
                      <FaAlignRight /> Right
                    </button>
                  </div>
                </div>
              </div>

              {/* Font Size Sliders */}
              <div className="form-row" style={{ marginBottom: "6px" }}>
                <div className="form-group flex-1">
                  <label style={{ fontSize: "11px" }}>Title Size: {certConfig.title_font_size || 24}pt</label>
                  <input
                    type="range"
                    min="16"
                    max="36"
                    value={certConfig.title_font_size || 24}
                    onChange={e => setCertConfig({ ...certConfig, title_font_size: parseInt(e.target.value) })}
                  />
                </div>
                <div className="form-group flex-1">
                  <label style={{ fontSize: "11px" }}>Name Size: {certConfig.name_font_size || 30}pt</label>
                  <input
                    type="range"
                    min="20"
                    max="46"
                    value={certConfig.name_font_size || 30}
                    onChange={e => setCertConfig({ ...certConfig, name_font_size: parseInt(e.target.value) })}
                  />
                </div>
                <div className="form-group flex-1">
                  <label style={{ fontSize: "11px" }}>Body Size: {certConfig.body_font_size || 13}pt</label>
                  <input
                    type="range"
                    min="10"
                    max="18"
                    value={certConfig.body_font_size || 13}
                    onChange={e => setCertConfig({ ...certConfig, body_font_size: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              {/* Colors */}
              <div className="form-row" style={{ marginBottom: "4px" }}>
                <div className="form-group flex-1">
                  <label style={{ fontSize: "11px" }}>Primary Font Color</label>
                  <div className="color-picker-row">
                    <input
                      type="color"
                      value={certConfig.primary_color || "#111827"}
                      onChange={e => setCertConfig({ ...certConfig, primary_color: e.target.value })}
                    />
                    <input
                      type="text"
                      value={certConfig.primary_color || "#111827"}
                      onChange={e => setCertConfig({ ...certConfig, primary_color: e.target.value })}
                      style={{ fontSize: "11px" }}
                    />
                  </div>
                </div>

                <div className="form-group flex-1">
                  <label style={{ fontSize: "11px" }}>Accent Highlight Color</label>
                  <div className="color-picker-row">
                    <input
                      type="color"
                      value={certConfig.accent_color || "#0284c7"}
                      onChange={e => setCertConfig({ ...certConfig, accent_color: e.target.value })}
                    />
                    <input
                      type="text"
                      value={certConfig.accent_color || "#0284c7"}
                      onChange={e => setCertConfig({ ...certConfig, accent_color: e.target.value })}
                      style={{ fontSize: "11px" }}
                    />
                  </div>
                </div>
              </div>

              {/* Footer Note */}
              <div className="form-group" style={{ marginTop: "6px", marginBottom: 0 }}>
                <label style={{ fontSize: "11px" }}>Footer Accreditation Note</label>
                <input
                  type="text"
                  value={certConfig.footer_note || ""}
                  onChange={e => setCertConfig({ ...certConfig, footer_note: e.target.value })}
                  placeholder="Verified on OWASP Cyber Platform • Official CTF Certificate"
                  style={{ fontSize: "11px" }}
                />
              </div>
            </div>

            {/* CARD 6: LIVE INTERACTIVE VISUAL PREVIEW & CANVA-STYLE POSITIONING */}
            <div className="cert-designer-card" style={{ gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div>
                  <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    <FaEye /> Live Certificate Interactive Preview (Canva-Style Free Positioning)
                  </h4>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Click and drag any text box or signature directly on the canvas to reposition it freely!
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`badge ${certConfig.bg_mode !== "default" ? "badge-primary" : "badge-secondary"}`}
                    onClick={() => setCertConfig({ ...certConfig, bg_mode: certConfig.bg_mode === "default" ? "auto" : "default" })}
                    style={{ cursor: "pointer", padding: "5px 10px", fontSize: "11px" }}
                    title="Switch between custom uploaded background and official default background"
                  >
                    {certConfig.bg_mode === "default" ? "🛡️ Default Background" : "🖼️ Custom Template BG"}
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                    onClick={() => setCertConfig({ ...certConfig, preview_bg: !certConfig.preview_bg })}
                  >
                    {certConfig.preview_bg ? "Hide Template BG" : "Show Template BG"}
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                    onClick={() => setCertConfig({ ...certConfig, theme_mode: certConfig.theme_mode === "light" ? "dark" : "light" })}
                  >
                    {certConfig.theme_mode === "light" ? "Dark Theme Preview" : "Light Theme Preview"}
                  </button>
                </div>
              </div>

              {/* Canva Inspector Toolbar */}
              <div className="canva-toolbar">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", width: "100%" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <FaMousePointer /> Canva Positioning:
                  </span>
                  <select
                    className="setting-input"
                    style={{ width: "auto", minWidth: "180px", padding: "4px 8px", fontSize: "12px", background: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-color)", borderRadius: "6px" }}
                    value={selectedElement || ""}
                    onChange={(e) => setSelectedElement(e.target.value || null)}
                  >
                    <option value="">-- Click element on canvas or select here --</option>
                    {CANVA_ELEMENTS.map(el => (
                      <option key={el.key} value={el.key}>{el.icon} {el.label}</option>
                    ))}
                  </select>

                  {selectedElement ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginLeft: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>X:</span>
                        <input
                          type="range"
                          min="2"
                          max="98"
                          step="0.5"
                          value={getElementPos(selectedElement).x}
                          onChange={(e) => updateElementPos(selectedElement, 'x', e.target.value)}
                          style={{ width: "70px" }}
                        />
                        <span style={{ fontSize: "11px", minWidth: "36px", fontFamily: "monospace", color: "var(--accent-cyan)" }}>
                          {getElementPos(selectedElement).x}%
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Y:</span>
                        <input
                          type="range"
                          min="2"
                          max="98"
                          step="0.5"
                          value={getElementPos(selectedElement).y}
                          onChange={(e) => updateElementPos(selectedElement, 'y', e.target.value)}
                          style={{ width: "70px" }}
                        />
                        <span style={{ fontSize: "11px", minWidth: "36px", fontFamily: "monospace", color: "var(--accent-cyan)" }}>
                          {getElementPos(selectedElement).y}%
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "3px" }}>
                        <button type="button" className="secondary-btn" style={{ padding: "2px 7px", fontSize: "11px" }} title="Nudge Left" onClick={() => nudgeElement(selectedElement, -1, 0)}>←</button>
                        <button type="button" className="secondary-btn" style={{ padding: "2px 7px", fontSize: "11px" }} title="Nudge Right" onClick={() => nudgeElement(selectedElement, 1, 0)}>→</button>
                        <button type="button" className="secondary-btn" style={{ padding: "2px 7px", fontSize: "11px" }} title="Nudge Up" onClick={() => nudgeElement(selectedElement, 0, -1)}>↑</button>
                        <button type="button" className="secondary-btn" style={{ padding: "2px 7px", fontSize: "11px" }} title="Nudge Down" onClick={() => nudgeElement(selectedElement, 0, 1)}>↓</button>
                        <button type="button" className="secondary-btn" style={{ padding: "2px 8px", fontSize: "11px" }} onClick={() => updateElementPos(selectedElement, 'x', 50)}>Center</button>
                        <button type="button" className="secondary-btn" style={{ padding: "2px 8px", fontSize: "11px" }} onClick={() => resetSingleElementPos(selectedElement)}>Reset Pos</button>
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>
                      💡 Tip: Click any text box, logo, or signature below and drag to move!
                    </span>
                  )}

                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ padding: "4px 10px", fontSize: "11px", marginLeft: "auto" }}
                    onClick={resetAllElementPositions}
                  >
                    <FaUndo /> Reset All Positions
                  </button>
                </div>
              </div>

              {/* A4 Realistic Preview Canvas with Canva Absolute Drag Positioning */}
              {(() => {
                const hasUploadedTemplate = Boolean(certTemplate.has_template && certTemplate.template_url && certConfig.bg_mode !== "default" && certConfig.preview_bg !== false);
                const isLightTextMode = hasUploadedTemplate || certConfig.theme_mode === "light" || certConfig.bg_mode === "default" || true;

                return (
                  <div
                    ref={canvasContainerRef}
                    className="cert-canvas-container"
                    style={{
                      aspectRatio: certConfig.orientation === "portrait" ? "210 / 297" : "297 / 210",
                      minHeight: "520px",
                      position: "relative",
                      overflow: "hidden",
                      backgroundImage: hasUploadedTemplate ? `url(${certTemplate.template_url})` : "none",
                      backgroundSize: "100% 100%",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                      backgroundColor: "#ffffff",
                      border: (certConfig.show_border !== false && !hasUploadedTemplate)
                        ? "4px solid #0284c7"
                        : "1px dashed rgba(255, 255, 255, 0.2)",
                      cursor: "default",
                      boxShadow: "0 10px 25px rgba(0,0,0,0.15)"
                    }}
                    onClick={() => setSelectedElement(null)}
                  >
                    {/* Default certificate inner slate border matching reference design */}
                    {!hasUploadedTemplate && certConfig.show_border !== false && (
                      <div style={{
                        position: "absolute",
                        inset: "10px",
                        border: "1px solid #334155",
                        pointerEvents: "none"
                      }} />
                    )}

                    {/* 0. Logo / Shield */}
                    {certConfig.show_shield !== false && certConfig.show_logo !== false && (
                      <div
                        className={`canva-element ${selectedElement === "logo" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("logo").x}%`,
                          top: `${getElementPos("logo").y}%`,
                          zIndex: selectedElement === "logo" ? 50 : 10
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "logo")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("logo"); }}
                      >
                        {selectedElement === "logo" && (
                          <>
                            <div className="canva-element-badge">
                              <span>🛡️ Logo</span>
                              <span>({getElementPos("logo").x}%, {getElementPos("logo").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        {certTemplate.has_logo && certTemplate.logo_url ? (
                          <img
                            src={certTemplate.logo_url}
                            alt="Custom Logo"
                            style={{
                              height: `${Math.round((certConfig.logo_size || 22) * 2.2)}px`,
                              maxWidth: "180px",
                              objectFit: "contain",
                              pointerEvents: "none",
                              display: "block"
                            }}
                          />
                        ) : (
                          <FaShieldAlt style={{
                            fontSize: `${Math.round((certConfig.logo_size || 22) * 1.5)}px`,
                            color: certConfig.accent_color || "#0284c7",
                            filter: "drop-shadow(0 0 8px rgba(2,132,199,0.4))",
                            pointerEvents: "none"
                          }} />
                        )}
                      </div>
                    )}

                    {/* 1. Organization Header */}
                    {certConfig.show_header !== false && (
                      <div
                        className={`canva-element ${selectedElement === "header" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("header").x}%`,
                          top: `${getElementPos("header").y}%`,
                          zIndex: selectedElement === "header" ? 50 : 10
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "header")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("header"); }}
                      >
                        {selectedElement === "header" && (
                          <>
                            <div className="canva-element-badge">
                              <span>🏛️ Header</span>
                              <span>({getElementPos("header").x}%, {getElementPos("header").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        <span style={{
                          fontFamily: getCssFontFamily(certConfig.font_family || "Helvetica"),
                          color: certConfig.accent_color || "#0284c7",
                          fontSize: "12px",
                          fontWeight: 700,
                          letterSpacing: "2px",
                          textTransform: "uppercase"
                        }}>
                          {certConfig.header_text || "OWASP PCCOE STUDENT CHAPTER"}
                        </span>
                      </div>
                    )}

                    {/* 2. Certificate Title */}
                    {certConfig.show_title !== false && (
                      <div
                        className={`canva-element ${selectedElement === "title" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("title").x}%`,
                          top: `${getElementPos("title").y}%`,
                          zIndex: selectedElement === "title" ? 50 : 10
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "title")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("title"); }}
                      >
                        {selectedElement === "title" && (
                          <>
                            <div className="canva-element-badge">
                              <span>📜 Title</span>
                              <span>({getElementPos("title").x}%, {getElementPos("title").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        <span style={{
                          fontFamily: getCssFontFamily(certConfig.font_family || "Helvetica"),
                          color: isLightTextMode ? (certConfig.primary_color || "#1e293b") : "#f8fafc",
                          fontSize: `${Math.round((certConfig.title_font_size || 20) * 0.75)}px`,
                          fontWeight: 800,
                          letterSpacing: "1px"
                        }}>
                          {certConfig.title_text || "Certificate of CTF Participation & Achievement"}
                        </span>
                      </div>
                    )}

                    {/* 3. Subtitle */}
                    {certConfig.show_subtitle !== false && (
                      <div
                        className={`canva-element ${selectedElement === "subtitle" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("subtitle").x}%`,
                          top: `${getElementPos("subtitle").y}%`,
                          zIndex: selectedElement === "subtitle" ? 50 : 10
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "subtitle")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("subtitle"); }}
                      >
                        {selectedElement === "subtitle" && (
                          <>
                            <div className="canva-element-badge">
                              <span>✏️ Subtitle</span>
                              <span>({getElementPos("subtitle").x}%, {getElementPos("subtitle").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        <span style={{
                          fontFamily: getCssFontFamily(certConfig.font_family || "Helvetica"),
                          fontSize: "11px",
                          color: isLightTextMode ? "#475569" : "#94a3b8",
                          fontStyle: "italic"
                        }}>
                          {certConfig.subtitle_text || "This certificate is proudly presented to"}
                        </span>
                      </div>
                    )}

                    {/* 4. Recipient Name */}
                    {certConfig.show_recipient !== false && (
                      <div
                        className={`canva-element ${selectedElement === "recipient" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("recipient").x}%`,
                          top: `${getElementPos("recipient").y}%`,
                          zIndex: selectedElement === "recipient" ? 50 : 10
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "recipient")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("recipient"); }}
                      >
                        {selectedElement === "recipient" && (
                          <>
                            <div className="canva-element-badge">
                              <span>👤 Recipient Name</span>
                              <span>({getElementPos("recipient").x}%, {getElementPos("recipient").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        <span style={{
                          fontFamily: getCssFontFamily(certConfig.recipient_font_family || certConfig.font_family || "Helvetica"),
                          color: certConfig.accent_color || "#0284c7",
                          fontSize: `${Math.round((certConfig.name_font_size || 32) * 0.9)}px`,
                          fontWeight: (certConfig.recipient_font_family === "GreatVibes" || certConfig.recipient_font_family === "AlexBrush") ? "normal" : "bold",
                          lineHeight: 1.2
                        }}>
                          Alex Mercer
                        </span>
                      </div>
                    )}

                    {/* 5. College */}
                    {certConfig.show_college !== false && (
                      <div
                        className={`canva-element ${selectedElement === "college" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("college").x}%`,
                          top: `${getElementPos("college").y}%`,
                          zIndex: selectedElement === "college" ? 50 : 10
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "college")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("college"); }}
                      >
                        {selectedElement === "college" && (
                          <>
                            <div className="canva-element-badge">
                              <span>🎓 College</span>
                              <span>({getElementPos("college").x}%, {getElementPos("college").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        <span style={{
                          fontFamily: getCssFontFamily(certConfig.font_family || "Helvetica"),
                          fontSize: "11px",
                          color: isLightTextMode ? "#334155" : "#cbd5e1",
                          fontWeight: 500
                        }}>
                          Stanford Cyber Institute
                        </span>
                      </div>
                    )}

                    {/* 6. Body Narrative */}
                    {certConfig.show_body !== false && (
                      <div
                        className={`canva-element ${selectedElement === "body" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("body").x}%`,
                          top: `${getElementPos("body").y}%`,
                          zIndex: selectedElement === "body" ? 50 : 10,
                          maxWidth: "600px"
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "body")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("body"); }}
                      >
                        {selectedElement === "body" && (
                          <>
                            <div className="canva-element-badge">
                              <span>📝 Narrative Text</span>
                              <span>({getElementPos("body").x}%, {getElementPos("body").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        <p style={{
                          margin: 0,
                          fontFamily: getCssFontFamily(certConfig.font_family || "Helvetica"),
                          fontSize: `${Math.max(11, Math.round((certConfig.body_font_size || 13) * 0.85))}px`,
                          color: isLightTextMode ? "#1e293b" : "#94a3b8",
                          lineHeight: 1.45,
                          textAlign: "center"
                        }}>
                          {(certConfig.custom_body_text || "for participating in {event_name} and capturing {solves} flag(s) for {score} points.")
                            .replace(/{participant_name}/g, "Alex Mercer")
                            .replace(/{college}/g, "Stanford Cyber Institute")
                            .replace(/{event_name}/g, certEventId === "general" ? "OWASP Annual Cyber Championship" : (events.find(e => String(e.id) === String(certEventId))?.name || "Cyber Championship"))
                            .replace(/{score}/g, "1250")
                            .replace(/{solves}/g, "8")
                            .replace(/{rank}/g, "#1")
                            .replace(/{date}/g, new Date().toLocaleDateString())}
                        </p>
                      </div>
                    )}

                    {/* 7. Badges Row */}
                    {(certConfig.show_badge !== false || certConfig.show_rank !== false || certConfig.show_score !== false) && (
                      <div
                        className={`canva-element ${selectedElement === "badges" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("badges").x}%`,
                          top: `${getElementPos("badges").y}%`,
                          zIndex: selectedElement === "badges" ? 50 : 10
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "badges")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("badges"); }}
                      >
                        {selectedElement === "badges" && (
                          <>
                            <div className="canva-element-badge">
                              <span>⭐ Badges & Score</span>
                              <span>({getElementPos("badges").x}%, {getElementPos("badges").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        <div style={{
                          fontFamily: getCssFontFamily(certConfig.font_family || "Helvetica"),
                          color: certConfig.accent_color || "#0284c7",
                          fontSize: "13px",
                          fontWeight: 700,
                          letterSpacing: "0.5px",
                          textAlign: "center"
                        }}>
                          {[
                            certConfig.show_badge !== false ? "Participation" : null,
                            certConfig.show_rank !== false ? "Rank #2" : null,
                            certConfig.show_score ? "1,250 PTS" : null
                          ].filter(Boolean).join("  •  ")}
                        </div>
                      </div>
                    )}

                    {/* 8. Primary Signature */}
                    {certConfig.show_signature !== false && (
                      <div
                        className={`canva-element ${selectedElement === "primary_signature" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("primary_signature").x}%`,
                          top: `${getElementPos("primary_signature").y}%`,
                          zIndex: selectedElement === "primary_signature" ? 50 : 10,
                          minWidth: "150px"
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "primary_signature")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("primary_signature"); }}
                      >
                        {selectedElement === "primary_signature" && (
                          <>
                            <div className="canva-element-badge">
                              <span>✍️ Primary Signature</span>
                              <span>({getElementPos("primary_signature").x}%, {getElementPos("primary_signature").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        {certTemplate.has_signature && certTemplate.signature_url ? (
                          <img
                            src={certTemplate.signature_url}
                            alt="Primary Signature"
                            style={{ height: "42px", maxWidth: "160px", objectFit: "contain", display: "block", margin: "0 auto 2px auto", pointerEvents: "none" }}
                          />
                        ) : (
                          <div style={{
                            fontFamily: "'Alex Brush', cursive",
                            fontSize: "20px",
                            color: certConfig.accent_color || "#0284c7",
                            marginBottom: "2px"
                          }}>
                            {certConfig.signer_name || "Authorized Signature"}
                          </div>
                        )}
                        <div style={{ width: "140px", borderBottom: "1px solid rgba(150, 150, 150, 0.6)", margin: "0 auto 4px auto" }} />
                        {certConfig.signer_name && (
                          <div style={{ fontSize: "11px", fontWeight: 700, color: isLightTextMode ? "#1e293b" : "#f1f5f9" }}>
                            {certConfig.signer_name}
                          </div>
                        )}
                        <div style={{ fontSize: "10px", color: isLightTextMode ? "#64748b" : "#94a3b8", fontWeight: 600 }}>
                          {certConfig.signature_title || "OWASP Lead & Faculty Coordinator"}
                        </div>
                      </div>
                    )}

                    {/* 9. Second Co-Signer Signature */}
                    {certConfig.show_second_signature && (
                      <div
                        className={`canva-element ${selectedElement === "second_signature" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("second_signature").x}%`,
                          top: `${getElementPos("second_signature").y}%`,
                          zIndex: selectedElement === "second_signature" ? 50 : 10,
                          minWidth: "150px"
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "second_signature")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("second_signature"); }}
                      >
                        {selectedElement === "second_signature" && (
                          <>
                            <div className="canva-element-badge">
                              <span>✍️ Co-Signer</span>
                              <span>({getElementPos("second_signature").x}%, {getElementPos("second_signature").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        {certTemplate.has_second_signature && certTemplate.second_signature_url ? (
                          <img
                            src={certTemplate.second_signature_url}
                            alt="Co-Signer Signature"
                            style={{ height: "42px", maxWidth: "160px", objectFit: "contain", display: "block", margin: "0 auto 2px auto", pointerEvents: "none" }}
                          />
                        ) : (
                          <div style={{
                            fontFamily: "'Alex Brush', cursive",
                            fontSize: "20px",
                            color: certConfig.accent_color || "#0284c7",
                            marginBottom: "2px"
                          }}>
                            {certConfig.second_signer_name || "Co-Signer"}
                          </div>
                        )}
                        <div style={{ width: "140px", borderBottom: "1px solid rgba(150, 150, 150, 0.6)", margin: "0 auto 4px auto" }} />
                        {certConfig.second_signer_name && (
                          <div style={{ fontSize: "11px", fontWeight: 700, color: isLightTextMode ? "#1e293b" : "#f1f5f9" }}>
                            {certConfig.second_signer_name}
                          </div>
                        )}
                        <div style={{ fontSize: "10px", color: isLightTextMode ? "#64748b" : "#94a3b8", fontWeight: 600 }}>
                          {certConfig.second_signature_title || "Department Head"}
                        </div>
                      </div>
                    )}

                    {/* 10. QR Code */}
                    {certConfig.show_qr !== false && (
                      <div
                        className={`canva-element ${selectedElement === "qr" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("qr").x}%`,
                          top: `${getElementPos("qr").y}%`,
                          zIndex: selectedElement === "qr" ? 50 : 10
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "qr")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("qr"); }}
                      >
                        {selectedElement === "qr" && (
                          <>
                            <div className="canva-element-badge">
                              <span>📱 QR Code</span>
                              <span>({getElementPos("qr").x}%, {getElementPos("qr").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        <div style={{
                          background: "#ffffff",
                          padding: "4px",
                          borderRadius: "4px",
                          display: "inline-flex",
                          flexDirection: "column",
                          alignItems: "center",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
                        }}>
                          <div style={{
                            width: "44px",
                            height: "44px",
                            background: "repeating-conic-gradient(#111827 0% 25%, #ffffff 0% 50%) 50% / 11px 11px",
                            borderRadius: "2px"
                          }} />
                          <span style={{ fontSize: "7px", color: "#64748b", marginTop: "2px", fontWeight: 600 }}>Scan to verify</span>
                        </div>
                      </div>
                    )}

                    {/* 11. Footer Metadata & ID */}
                    {/* 11. Footer Metadata & ID */}
                    {(certConfig.show_id !== false || certConfig.show_date !== false || certConfig.footer_note) && (
                      <div
                        className={`canva-element ${selectedElement === "footer" ? "selected" : ""}`}
                        style={{
                          left: `${getElementPos("footer").x}%`,
                          top: `${getElementPos("footer").y}%`,
                          zIndex: selectedElement === "footer" ? 50 : 10,
                          width: "88%",
                          maxWidth: "88%"
                        }}
                        onMouseDown={(e) => handleElementMouseDown(e, "footer")}
                        onClick={(e) => { e.stopPropagation(); setSelectedElement("footer"); }}
                      >
                        {selectedElement === "footer" && (
                          <>
                            <div className="canva-element-badge">
                              <span>🔖 Footer Metadata</span>
                              <span>({getElementPos("footer").x}%, {getElementPos("footer").y}%)</span>
                            </div>
                            <span className="canva-handle tl" /><span className="canva-handle tr" />
                            <span className="canva-handle bl" /><span className="canva-handle br" />
                          </>
                        )}
                        <div style={{
                          fontSize: "9.5px",
                          color: isLightTextMode ? "#475569" : "#64748b",
                          display: "flex",
                          justifyContent: "space-between",
                          width: "100%",
                          padding: "0 6px"
                        }}>
                          {certConfig.show_id !== false ? <span>Certificate ID: OWASP-CTF-PREVIEW-DEMO</span> : <span />}
                          {certConfig.footer_note && <span style={{ fontStyle: "italic" }}>{certConfig.footer_note}</span>}
                          {certConfig.show_date !== false ? <span>Issued: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span> : <span />}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })()}

              {/* Action Toolbar */}
              <div className="cert-actions-bar" style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={saveCertConfig}
                  disabled={certSaving}
                >
                  <FaCheck /> {certSaving ? "Saving..." : "Save Certificate Configuration"}
                </button>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={previewCertificate}
                >
                  <FaEye /> Live PDF Preview
                </button>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleRegenerateAll}
                  disabled={certGenerating}
                  title="Regenerate all existing certificates in database to match this design"
                >
                  <FaSyncAlt /> Regenerate All Issued Certificates
                </button>

                {certEventId !== "general" && (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => generateCertificates(false)}
                    disabled={certGenerating}
                    style={{ marginLeft: "auto", background: "linear-gradient(135deg, #0284c7, #2563eb)" }}
                  >
                    <FaCertificate /> {certGenerating ? "Generating..." : "Generate & Dispatch Emails"}
                  </button>
                )}
              </div>

              {/* Email dispatch banner notice */}
              <div className="email-dispatch-notice" style={{ marginTop: "12px" }}>
                <FaEnvelope />
                <span>
                  <strong>Automated Participant Delivery:</strong> When certificates are generated, participants automatically receive an in-app notification and an official congratulatory email containing their score, flags captured, rank, certificate ID, direct PDF download link, and online authenticity verification link.
                </span>
              </div>
            </div>

          </div>

          {/* Issued Certificates Table for Specific Tournament */}
          {certEventId && certEventId !== "general" && (
            <div style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4>Issued Certificates for Selected Tournament ({certificates.length})</h4>
              </div>

              {certLoading ? (
                <p>Loading certificates...</p>
              ) : (
                <div className="table-responsive" style={{ marginTop: "10px" }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Participant</th>
                        <th>College</th>
                        <th>Score</th>
                        <th>Rank</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {certificates.length ? (
                        certificates.map(c => (
                          <tr key={c.certificate_id}>
                            <td><code>{c.certificate_id}</code></td>
                            <td><b>{c.name}</b></td>
                            <td>{c.college || "-"}</td>
                            <td>{c.score}</td>
                            <td>{c.rank || "-"}</td>
                            <td>
                              <span className={`status-pill ${c.is_valid ? "earned" : "locked"}`}>
                                {c.is_valid ? "VALID" : "REVOKED"}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <a
                                  href={`${API_URL}/certificates/${c.certificate_id}/download`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="icon-action-btn"
                                  title="Download PDF"
                                >
                                  <FaEye />
                                </a>
                                {c.is_valid && (
                                  <button
                                    className="icon-action-btn delete"
                                    title="Revoke"
                                    onClick={() => revokeCertificate(c.certificate_id)}
                                  >
                                    <FaTimes />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="no-data">
                            No certificates generated yet for this tournament. Click "Generate & Dispatch Emails" above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* If Global General is selected, show general overview notice */}
          {certEventId === "general" && (
            <div style={{
              marginTop: "20px",
              padding: "16px 20px",
              background: "rgba(15, 23, 42, 0.4)",
              borderRadius: "8px",
              border: "1px dashed rgba(255, 255, 255, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px"
            }}>
              <div>
                <strong style={{ color: "#38bdf8" }}>Global Master Template Mode:</strong>
                <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Changes made here serve as the universal blueprint for all tournaments. Check "Sync across all events" to apply immediately, or click "Regenerate All Issued Certificates" to refresh all previously issued certificates.
                </p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={handleRegenerateAll}
                disabled={certGenerating}
              >
                <FaSyncAlt /> Regenerate All Certificates Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB: PRIVATE FILE STORAGE */}
      {tab === "storage" && (
        <div className="admin-section">
          <div className="section-header"><div><h2>Private File Storage</h2><p className="subtitle">Challenge files and certificate PDFs can use private S3-compatible storage with short-lived signed downloads.</p></div><button className="secondary-btn" onClick={loadStorageStatus}><FaSyncAlt/> Refresh</button></div>
          <div className="stats-grid">
            <div className="stat-card"><span>Provider</span><strong>{storageStatus?.provider || "—"}</strong></div>
            <div className="stat-card"><span>Configured</span><strong>{storageStatus ? (storageStatus.configured ? "YES" : "NO") : "—"}</strong></div>
            <div className="stat-card"><span>Reachable</span><strong>{storageStatus ? (storageStatus.reachable ? "YES" : "NO") : "—"}</strong></div>
            <div className="stat-card"><span>Bucket</span><strong>{storageStatus?.bucket || "Local filesystem"}</strong></div>
          </div>
          <div className="table-card" style={{marginTop:"16px"}}>
            <h3>Storage policy</h3>
            <ul className="feature-list"><li>Students never receive public bucket URLs.</li><li>Authenticated download endpoints issue time-limited signed URLs.</li><li>Local filesystem remains available for development.</li><li>Existing local files can be migrated after object storage is configured.</li></ul>
            <button className="primary-btn" disabled={!storageStatus?.configured || storageLoading} onClick={migrateLocalStorage}>{storageLoading ? "Working…" : "Migrate Local Files"}</button>
          </div>
        </div>
      )}

      {/* TAB: PRODUCTION MONITORING */}
      {tab === "monitoring" && (
        <div className="admin-section">
          <div className="section-header"><div><h2><FaHeartbeat /> Production Monitor</h2><p className="subtitle">Operational health, request traffic, security alerts, and live challenge runtime.</p></div><button className="secondary-btn" onClick={loadMonitoring}><FaSyncAlt /> Refresh</button></div>
          {monitoringLoading ? <p>Loading monitoring data...</p> : monitoring ? <>
            <div className="stats-grid">
              <div className="stat-card"><span>Uptime</span><strong>{Math.floor((monitoring.runtime?.uptime_seconds || 0) / 60)} min</strong></div>
              <div className="stat-card"><span>Total requests</span><strong>{monitoring.runtime?.counters?.requests || 0}</strong></div>
              <div className="stat-card"><span>4xx responses</span><strong>{monitoring.runtime?.counters?.["4xx"] || 0}</strong></div>
              <div className="stat-card"><span>5xx responses</span><strong>{monitoring.runtime?.counters?.["5xx"] || 0}</strong></div>
              <div className="stat-card"><span>Live instances</span><strong>{monitoring.live_instances}</strong></div>
              <div className="stat-card"><span>Open alerts</span><strong>{monitoring.open_security_alerts}</strong></div>
            </div>
            <div className="table-card" style={{marginTop:"16px"}}><h3>Recent API requests</h3><div className="table-responsive"><table className="custom-table"><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Duration</th><th>Request ID</th></tr></thead><tbody>
              {(monitoring.runtime?.recent_requests || []).slice().reverse().map((r, i) => <tr key={i}><td>{new Date(r.timestamp).toLocaleString()}</td><td><b>{r.method}</b></td><td><code>{r.path}</code></td><td><span className="status-pill">{r.status}</span></td><td>{r.duration_ms} ms</td><td><code>{r.request_id}</code></td></tr>)}
              {!monitoring.runtime?.recent_requests?.length && <tr><td colSpan="6" className="no-data">No requests recorded yet.</td></tr>}
            </tbody></table></div></div>
          </> : <div className="empty-state"><h3>Monitoring unavailable</h3><p>Refresh after the backend is running.</p></div>}
        </div>
      )}

      {/* TAB 5: ANTI-CHEAT MONITOR */}
      {tab === "security" && (
        <div className="security-page">
          <div className="security-toolbar">
            <div>
              <h3>Competition Security Monitor</h3>
              <p className="subtitle">Automated detection for rapid submissions and repeated failed-flag patterns. Alerts require human review.</p>
            </div>
            <div className="toolbar-actions">
              <select value={securityFilter} onChange={e => { setSecurityFilter(e.target.value); setTimeout(loadSecurity, 0); }}>
                <option value="open">Open Alerts</option>
                <option value="reviewed">Reviewed</option>
                <option value="all">All Alerts</option>
              </select>
              <button className="secondary-btn" onClick={loadSecurity}><FaSyncAlt /> Refresh</button>
            </div>
          </div>

          {securityLoading ? <div className="loading-state"><div className="spinner"></div><p>Analyzing competition activity...</p></div> : (
            <>
              <div className="metrics-grid security-metrics">
                <div className="metric-box"><span className="metric-title">Open Alerts</span><b className="metric-num">{securityOverview?.open_alerts ?? 0}</b></div>
                <div className="metric-box"><span className="metric-title">High Severity</span><b className="metric-num">{securityOverview?.high_open_alerts ?? 0}</b></div>
                <div className="metric-box"><span className="metric-title">Failed Flags / 24h</span><b className="metric-num">{securityOverview?.failed_submissions_24h ?? 0}</b></div>
                <div className="metric-box"><span className="metric-title">Suspicious / 24h</span><b className="metric-num">{securityOverview?.suspicious_submissions_24h ?? 0}</b></div>
              </div>

              <div className="table-card">
                <div className="card-header-row"><h3>Security Alerts</h3><span className="status-pill">Human review required</span></div>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead><tr><th>Severity</th><th>Time</th><th>Student / Squad</th><th>Challenge</th><th>Detection</th><th>Risk</th><th>Action</th></tr></thead>
                    <tbody>
                      {securityAlerts.length ? securityAlerts.map(a => (
                        <tr key={a.id}>
                          <td><span className={`status-badge ${a.severity === "high" ? "archived" : "draft"}`}>{a.severity.toUpperCase()}</span></td>
                          <td><small>{new Date(a.created_at).toLocaleString()}</small></td>
                          <td><b>{a.user_name}</b>{a.team_name && <small className="meta-time-block">Team: {a.team_name}</small>}</td>
                          <td>{a.challenge_title || "—"}</td>
                          <td>{(a.metadata?.reasons || []).map(x => <span className="category-tag" key={x}>{x}</span>)}</td>
                          <td><b>{a.metadata?.risk_score ?? "—"}</b></td>
                          <td>{a.is_reviewed ? <span className="status-pill earned">REVIEWED</span> : <button className="secondary-btn small" onClick={() => reviewAlert(a.id)}><FaCheck /> Review</button>}</td>
                        </tr>
                      )) : <tr><td colSpan="7" className="no-data">No security alerts match this filter.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="table-card security-note">
                <h3>Detection rules</h3>
                <ul><li>Minimum 2-second gap between submissions.</li><li>Temporary cooldown after 25 failed flags in 5 minutes.</li><li>Rapid bursts, repeated failures, and many challenges in a short window increase a risk score.</li><li>Alerts do not automatically ban students; moderators decide what action is appropriate.</li></ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 6: USER CONTROLS */}
      {tab === "users" && (
        <div className="table-card">
          <div className="card-header-row">
            <h3>Registered Participants & Club Roles</h3>
            <input
              type="text"
              placeholder="Search user name or college..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="inline-search"
            />
          </div>

          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>College</th>
                  <th>Points</th>
                  <th>Current Role</th>
                  <th>Account Status</th>
                  <th>Change Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                      <small className="email-sub">{u.email}</small>
                    </td>
                    <td>{u.college || "—"}</td>
                    <td><b className="points-text">{u.points}</b></td>
                    <td>
                      <span className="role-tag">{u.role.toUpperCase()}</span>
                    </td>
                    <td>
                      <button
                        className={`status-pill clickable ${u.is_active ? "earned" : "locked"}`}
                        onClick={() => handleToggleActive(u.id)}
                        title="Click to toggle active/banned status"
                      >
                        {u.is_active ? <><FaCheck /> Active</> : <><FaBan /> Banned</>}
                      </button>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        onChange={e => handleChangeRole(u.id, e.target.value)}
                        className="role-select"
                      >
                        <option value="user">User</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
