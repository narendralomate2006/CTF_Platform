import React, { useState, useEffect, useRef } from "react";
import {
  FaShieldAlt,
  FaTerminal,
  FaFlag,
  FaGlobe,
  FaLock,
  FaSearch,
  FaCode,
  FaSkullCrossbones,
  FaUserSecret,
  FaArrowRight,
  FaInfoCircle,
  FaCheckCircle,
  FaPlay,
  FaAward,
  FaServer,
  FaUsers,
  FaGraduationCap,
  FaBug,
  FaLaptopCode,
  FaKey
} from "react-icons/fa";

export default function Landing({ onOpenAuth }) {
  // Navigation active tab for Explore Chapter
  const [chapterTab, setChapterTab] = useState("mission");
  
  // Terminal state
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalLogs, setTerminalLogs] = useState([
    { type: "sys", text: "OWASP PCCOE CyberOS v4.2.0 [x86_64-pccoe-linux-gnu]" },
    { type: "sys", text: "Type 'help' to see available commands or click quick prompts below." },
    { type: "prompt", cmd: "whoami", out: "guest@pccoe-academy:~$ student_hacker" }
  ]);
  const terminalEndRef = useRef(null);

  // Mini Challenge Playground state
  const [mockFlag, setMockFlag] = useState("");
  const [mockSolved, setMockSolved] = useState(false);
  const [mockError, setMockError] = useState("");

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollTop = terminalEndRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // Handle terminal command execution
  const executeTerminalCmd = (cmdStr) => {
    const cleanCmd = cmdStr.trim().toLowerCase();
    if (!cleanCmd) return;

    let output = "";
    if (cleanCmd === "help") {
      output = "Available commands: 'about', 'domains', 'matrix', 'nmap', 'flag', 'status', 'clear', 'login'";
    } else if (cleanCmd === "about") {
      output = "OWASP PCCOE: Official cybersecurity student chapter of Pimpri Chinchwad College of Engineering, Pune. Dedicated to application security, ethical hacking, and CTFs.";
    } else if (cleanCmd === "domains") {
      output = "[*] Web Exploitation (SQLi, XSS, SSRF)\n[*] Cryptography (RSA, AES, ECC)\n[*] Reverse Engineering (Ghidra, ELF)\n[*] Forensics (Wireshark, Memory)\n[*] Pwn (ROP, Buffer Overflows)\n[*] OSINT (Recon, Geolocation)";
    } else if (cleanCmd === "status") {
      output = "[+] CTF Engine: ONLINE\n[+] Docker Sandbox Daemon: HEALTHY\n[+] Anti-Cheat Verification: ACTIVE\n[+] Active Ports: 8000 (API), 5173 (Vite)";
    } else if (cleanCmd === "nmap") {
      output = "Starting Nmap 7.94 scan on ctf.pccoe.edu (10.0.13.37)...\nPORT   STATE SERVICE\n22/tcp open  ssh\n80/tcp open  http-owasp\n8000/tcp open  fastapi-engine\nNmap done: 1 IP address scanned in 0.42 seconds.";
    } else if (cleanCmd === "matrix") {
      output = "01001111 01010111 01000001 01010011 01010000 { P C C O E _ H A C K E R }";
    } else if (cleanCmd === "flag") {
      output = "Decryption Hint: Base64 string is 'T1dBU1B7cGNjb2VfY3RmX2FjYWRlbXlfaXNfbGl2ZX0='. Solve it in the Flag Playground below!";
    } else if (cleanCmd === "login" || cleanCmd === "auth") {
      onOpenAuth("login");
      return;
    } else if (cleanCmd === "clear") {
      setTerminalLogs([]);
      setTerminalInput("");
      return;
    } else {
      output = `Command not recognized: '${cleanCmd}'. Type 'help' for instructions.`;
    }

    setTerminalLogs(prev => [
      ...prev,
      { type: "prompt", cmd: cleanCmd, out: output }
    ]);
    setTerminalInput("");
  };

  const handleTerminalSubmit = (e) => {
    e.preventDefault();
    executeTerminalCmd(terminalInput);
  };

  // Handle Mock Flag submission
  const handleMockFlagSubmit = (e) => {
    e.preventDefault();
    setMockError("");
    const trimmed = mockFlag.trim();
    if (trimmed === "OWASP{pccoe_ctf_academy_is_live}") {
      setMockSolved(true);
    } else {
      setMockError("Incorrect flag. Hint: Decode the Base64 ciphertext above!");
    }
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="landing-root">
      {/* Background Cyber Grid */}
      <div className="landing-grid-bg" />

      {/* Top Navigation Bar */}
      <header className="landing-navbar">
        <div className="landing-nav-inner">
          <div className="landing-brand-wrap" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <img
              src="/branding/owasp-pccoe-logo.png"
              alt="OWASP PCCOE Logo"
              className="landing-nav-logo"
            />
            <div className="landing-brand-text">
              <span className="brand-owasp">OWASP</span>
              <span className="brand-pccoe">PCCOE</span>
              <span className="brand-live-dot">•</span>
            </div>
          </div>

          <nav className="landing-nav-actions">
            <button
              type="button"
              className="landing-nav-link-item"
              onClick={() => scrollToSection("explore-chapter")}
            >
              Explore Chapter
            </button>
            <button
              type="button"
              className="landing-nav-link-item"
              onClick={() => scrollToSection("interactive-terminal")}
            >
              Terminal
            </button>
            <button
              type="button"
              className="landing-nav-link-item"
              onClick={() => scrollToSection("domains-section")}
            >
              Curriculum
            </button>
            <button
              type="button"
              className="landing-nav-btn landing-nav-btn-ghost"
              onClick={() => onOpenAuth("register")}
            >
              Join Chapter
            </button>
            <button
              type="button"
              className="landing-nav-btn landing-nav-btn-login"
              onClick={() => onOpenAuth("login")}
            >
              Login
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero-section">
        {/* Animated Cyber Ticker Badge */}
        <div className="hero-status-pill">
          <span className="pulse-indicator" />
          <span className="status-mono">OWASP PCCOE // STUDENT CYBER DEFENSE ARENA</span>
          <span className="status-tag">SECURE V4.2</span>
        </div>

        {/* Concentric Radar Scanner Rings */}
        <div className="landing-radar-container">
          <div className="radar-ring radar-ring-1" />
          <div className="radar-ring radar-ring-2" />
          <div className="radar-ring radar-ring-3" />
          <img
            src="/branding/owasp-wasp.png"
            alt="OWASP Wasp Emblem"
            className="landing-watermark-wasp"
          />
        </div>

        {/* Hero Title Typography */}
        <div className="landing-hero-content">
          <div className="landing-title-row">
            <span className="landing-title-owasp">OWASP</span>
            <div className="landing-target-box">
              <span className="hud-corner hud-tl" />
              <span className="hud-corner hud-tr" />
              <span className="hud-corner hud-bl" />
              <span className="hud-corner hud-br" />
              <span className="landing-title-pccoe">PCCOE</span>
            </div>
          </div>

          <p className="landing-subtitle">
            The Official CTF Platform of OWASP PCCOE
          </p>

          <p className="landing-hero-lead">
            Elite hands-on cybersecurity training, on-demand Docker sandboxes, live tournament arenas, and cryptographically verified certifications for collegiate security researchers.
          </p>

          {/* Action CTAs */}
          <div className="landing-cta-group">
            <button
              type="button"
              className="landing-cta-btn landing-cta-primary"
              onClick={() => onOpenAuth("login")}
            >
              <span>Enter Academy</span>
              <FaArrowRight className="cta-icon" />
            </button>

            <button
              type="button"
              className="landing-cta-btn landing-cta-secondary"
              onClick={() => scrollToSection("explore-chapter")}
            >
              <FaGraduationCap />
              <span>Explore Chapter</span>
            </button>

            <button
              type="button"
              className="landing-cta-btn landing-cta-outline"
              onClick={() => scrollToSection("interactive-terminal")}
            >
              <FaTerminal />
              <span>Launch Terminal</span>
            </button>
          </div>
        </div>

        {/* Decorative HUD Reticle */}
        <div className="landing-hud-reticle">
          <div className="reticle-corner reticle-tl" />
          <div className="reticle-corner reticle-tr" />
          <div className="reticle-corner reticle-bl" />
          <div className="reticle-corner reticle-br" />
          <span className="reticle-center">+</span>
          <span className="reticle-label">PCCOE.NODE // ONLINE</span>
        </div>
      </section>

      {/* Quick Cyber Metric Counter Bar */}
      <section className="landing-stats-bar">
        <div className="landing-container">
          <div className="stats-bar-grid">
            <div className="stat-bar-item">
              <div className="stat-bar-val">50+</div>
              <div className="stat-bar-lbl">Production Challenges</div>
            </div>
            <div className="stat-bar-sep" />
            <div className="stat-bar-item">
              <div className="stat-bar-val">6</div>
              <div className="stat-bar-lbl">Specialized Cyber Tracks</div>
            </div>
            <div className="stat-bar-sep" />
            <div className="stat-bar-item">
              <div className="stat-bar-val">100%</div>
              <div className="stat-bar-lbl">Isolated Docker Targets</div>
            </div>
            <div className="stat-bar-sep" />
            <div className="stat-bar-item">
              <div className="stat-bar-val">24/7</div>
              <div className="stat-bar-lbl">Tournament Arena & Squads</div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Hacker Terminal & First Flag Playground */}
      <section id="interactive-terminal" className="landing-terminal-section">
        <div className="landing-container">
          <div className="landing-section-head">
            <div className="section-tag">INTERACTIVE SANDBOX PREVIEW</div>
            <h2>Live Academy Console & Flag Decoder</h2>
            <p>Test the waters right here before logging in. Type terminal commands or capture your first flag!</p>
          </div>

          <div className="interactive-dual-grid">
            {/* Terminal Window */}
            <div className="terminal-window card">
              <div className="terminal-header">
                <div className="terminal-dots">
                  <span className="tdot tdot-red" />
                  <span className="tdot tdot-yellow" />
                  <span className="tdot tdot-green" />
                </div>
                <div className="terminal-title">
                  <FaTerminal className="term-icon" /> bash — guest@owasp-pccoe:~
                </div>
                <div className="terminal-meta">TTY1</div>
              </div>

              <div className="terminal-body" ref={terminalEndRef}>
                {terminalLogs.map((log, idx) => (
                  <div key={idx} className="terminal-line">
                    {log.type === "sys" && <span className="term-sys">{log.text}</span>}
                    {log.type === "prompt" && (
                      <div className="term-block">
                        <div className="term-cmd-row">
                          <span className="term-prompt-str">guest@pccoe:~$</span>
                          <span className="term-cmd-text">{log.cmd}</span>
                        </div>
                        {log.out && <pre className="term-output">{log.out}</pre>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick Command Pills */}
              <div className="terminal-quick-bar">
                <span className="quick-label">PROMPTS:</span>
                <button type="button" onClick={() => executeTerminalCmd("about")}>about</button>
                <button type="button" onClick={() => executeTerminalCmd("domains")}>domains</button>
                <button type="button" onClick={() => executeTerminalCmd("nmap")}>nmap</button>
                <button type="button" onClick={() => executeTerminalCmd("flag")}>flag</button>
                <button type="button" onClick={() => executeTerminalCmd("status")}>status</button>
                <button type="button" onClick={() => executeTerminalCmd("clear")}>clear</button>
              </div>

              {/* Input Form */}
              <form onSubmit={handleTerminalSubmit} className="terminal-input-form">
                <span className="term-prompt-str">guest@pccoe:~$</span>
                <input
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  placeholder="type a command (e.g. 'help', 'status', 'nmap', 'login')..."
                  className="terminal-input"
                />
                <button type="submit" className="term-send-btn">
                  <FaPlay />
                </button>
              </form>
            </div>

            {/* Mini Flag Challenge Box */}
            <div className="mini-challenge-box card">
              <div className="mini-chall-head">
                <span className="mini-badge">TRIAL CHALLENGE #001</span>
                <h3>The Initial Foothold</h3>
                <span className="mini-diff-pill text-neon">EASY • 100 PTS</span>
              </div>

              <p className="mini-chall-desc">
                Welcome initiate! Intercepted cipher broadcast from PCCOE Cyber Lab. Crack the Base64 encoding to reveal your initial clearance flag:
              </p>

              <div className="cipher-box">
                <span className="cipher-label">INTERCEPTED CIPHER:</span>
                <code>T1dBU1B7cGNjb2VfY3RmX2FjYWRlbXlfaXNfbGl2ZX0=</code>
              </div>

              {mockSolved ? (
                <div className="mini-solved-banner">
                  <FaCheckCircle className="solved-icon" />
                  <div>
                    <h4>FLAG CAPTURED! +100 PTS</h4>
                    <p>Awesome work! Sign in to permanently save your score and claim your place on the leaderboard.</p>
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={() => onOpenAuth("register")}
                  >
                    Claim Your Account →
                  </button>
                </div>
              ) : (
                <form onSubmit={handleMockFlagSubmit} className="mini-flag-form">
                  <div className="flag-input-group">
                    <FaKey className="flag-key-icon" />
                    <input
                      type="text"
                      value={mockFlag}
                      onChange={(e) => setMockFlag(e.target.value)}
                      placeholder="OWASP{...}"
                      className="form-input"
                    />
                    <button type="submit" className="btn-primary flag-submit-action">
                      Submit Flag
                    </button>
                  </div>
                  {mockError && <span className="form-error">{mockError}</span>}
                  <span className="mini-hint">Hint: Base64 decode string using CyberChef or terminal: <code>echo '...' | base64 -d</code></span>
                </form>
              )}

              <div className="mini-sandbox-info">
                <FaServer className="text-cyan" />
                <span>On the full platform, every challenge spins up a private Docker sandbox instance.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dedicated "Explore Chapter" Section */}
      <section id="explore-chapter" className="landing-chapter-section">
        <div className="landing-container">
          <div className="landing-section-head">
            <div className="section-tag">ABOUT OWASP PCCOE</div>
            <h2>Pimpri Chinchwad College of Engineering Chapter</h2>
            <p>Cultivating tomorrow's offensive security engineers, bug bounty researchers, and digital defense leaders.</p>
          </div>

          {/* Chapter Navigation Tabs */}
          <div className="chapter-tabs-bar">
            <button
              className={`chapter-tab-btn ${chapterTab === "mission" ? "active" : ""}`}
              onClick={() => setChapterTab("mission")}
            >
              <FaShieldAlt /> Chapter Mission
            </button>
            <button
              className={`chapter-tab-btn ${chapterTab === "activities" ? "active" : ""}`}
              onClick={() => setChapterTab("activities")}
            >
              <FaLaptopCode /> What We Do
            </button>
            <button
              className={`chapter-tab-btn ${chapterTab === "pedagogy" ? "active" : ""}`}
              onClick={() => setChapterTab("pedagogy")}
            >
              <FaBug /> Hands-On CTF Methodology
            </button>
            <button
              className={`chapter-tab-btn ${chapterTab === "leadership" ? "active" : ""}`}
              onClick={() => setChapterTab("leadership")}
            >
              <FaUsers /> Student Community
            </button>
          </div>

          {/* Chapter Tab Contents */}
          <div className="chapter-tab-body card">
            {chapterTab === "mission" && (
              <div className="chapter-content-grid">
                <div>
                  <h3 className="chapter-title">Pioneering Application Security at PCCOE Pune</h3>
                  <p className="chapter-text">
                    The OWASP Student Chapter at Pimpri Chinchwad College of Engineering (PCCOE) is an officially recognized community driven by passionate cybersecurity students and faculty mentors.
                  </p>
                  <p className="chapter-text">
                    Our vision is to democratize cybersecurity education by making offensive and defensive security concepts accessible through hands-on practice rather than passive slides. We train students in real vulnerability assessment, secure coding, web exploitation, and binary engineering.
                  </p>
                  <div className="chapter-points-list">
                    <div className="point-item"><FaCheckCircle className="text-neon" /> 100% Student-led competitive capture-the-flag drills</div>
                    <div className="point-item"><FaCheckCircle className="text-neon" /> Aligned with OWASP Top 10, CWE, and NIST frameworks</div>
                    <div className="point-item"><FaCheckCircle className="text-neon" /> Active preparation for National & International CTF competitions</div>
                  </div>
                </div>
                <div className="chapter-card-highlight">
                  <div className="chapter-stat-bubble">
                    <span className="stat-big">#1</span>
                    <span className="stat-desc">Premier College Cybersecurity Chapter in Pune Region</span>
                  </div>
                  <div className="chapter-quick-actions">
                    <button className="btn-primary" onClick={() => onOpenAuth("register")}>
                      Register as PCCOE Hacker →
                    </button>
                    <button className="btn-secondary" onClick={() => onOpenAuth("login")}>
                      Existing Student Login
                    </button>
                  </div>
                </div>
              </div>
            )}

            {chapterTab === "activities" && (
              <div className="chapter-activities-grid">
                <div className="activity-card">
                  <div className="act-icon text-cyan"><FaFlag /></div>
                  <h4>Internal CTF Tournaments</h4>
                  <p>Bi-weekly 24-hour sprint tournaments hosted on this platform with live dynamic leaderboards and team squad battles.</p>
                </div>
                <div className="activity-card">
                  <div className="act-icon text-neon"><FaLaptopCode /></div>
                  <h4>Hands-On Workshops</h4>
                  <p>Practical bootcamps covering Ghidra binary decompilation, Burp Suite mastery, memory exploitation, and CTF automation.</p>
                </div>
                <div className="activity-card">
                  <div className="act-icon text-purple"><FaBug /></div>
                  <h4>Responsible Disclosure & Bug Bounty</h4>
                  <p>Guiding students through real-world ethical disclosures, vulnerability reporting, and web security research.</p>
                </div>
                <div className="activity-card">
                  <div className="act-icon text-amber"><FaAward /></div>
                  <h4>Certified Credentials</h4>
                  <p>Earn cryptographically verifiable badges and completion certificates endorsed by OWASP PCCOE.</p>
                </div>
              </div>
            )}

            {chapterTab === "pedagogy" && (
              <div className="chapter-pedagogy-block">
                <h3>Our 4-Stage Cybersecurity Training Pipeline</h3>
                <div className="pipeline-steps-grid">
                  <div className="pipeline-step">
                    <div className="step-num">01</div>
                    <h4>Fundamental Recon</h4>
                    <p>Understanding network packets, HTTP/WebSocket architecture, and Linux system internals.</p>
                  </div>
                  <div className="pipeline-step">
                    <div className="step-num">02</div>
                    <h4>Vulnerability Analysis</h4>
                    <p>Detecting OWASP Top 10 flaws, analyzing cryptographic weaknesses, and auditing code.</p>
                  </div>
                  <div className="pipeline-step">
                    <div className="step-num">03</div>
                    <h4>Exploit Crafting</h4>
                    <p>Synthesizing custom Python exploit scripts, crafting ROP chains, and bypassing input sanitizers.</p>
                  </div>
                  <div className="pipeline-step">
                    <div className="step-num">04</div>
                    <h4>Remediation & Defense</h4>
                    <p>Patching vulnerable code, writing defensive rules, and documenting comprehensive CTF writeups.</p>
                  </div>
                </div>
              </div>
            )}

            {chapterTab === "leadership" && (
              <div className="chapter-community-block">
                <div className="community-head">
                  <h3>A Thriving Community of 200+ Student Hackers</h3>
                  <p>Our members come from Computer Engineering, IT, and AI & Data Science disciplines at PCCOE.</p>
                </div>
                <div className="community-banner card">
                  <div className="banner-left">
                    <img src="/branding/owasp-pccoe-logo.png" alt="OWASP Logo" className="comm-logo" />
                    <div>
                      <h4>Join the OWASP PCCOE Discord & Arena</h4>
                      <p>Collaborate in squads, share writeups, discuss challenge solutions, and participate in CTF debriefs.</p>
                    </div>
                  </div>
                  <button className="btn-primary" onClick={() => onOpenAuth("register")}>
                    Join the Chapter Today →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Cyber Domain Pillar Grid */}
      <section id="domains-section" className="landing-domains-section">
        <div className="landing-container">
          <div className="landing-section-head">
            <div className="section-tag">COMPETITIVE CURRICULUM</div>
            <h2>6 Specialized Cyber Warfare Tracks</h2>
            <p>Each track contains progressive challenges spanning Easy, Medium, Hard, and Insane difficulties.</p>
          </div>

          <div className="landing-domain-grid">
            <div className="domain-card" onClick={() => onOpenAuth("login")}>
              <div className="domain-icon-box text-cyan">
                <FaGlobe />
              </div>
              <h3>Web Exploitation</h3>
              <p>SQL Injection, SSRF, XSS, Broken Access Control, JWT forgery, and OWASP Top 10 vulnerabilities.</p>
              <div className="domain-tools-row">
                <span className="tool-pill">Burp Suite</span>
                <span className="tool-pill">SQLMap</span>
                <span className="tool-pill">Docker</span>
              </div>
              <span className="domain-meta">Interactive Sandboxes Available</span>
            </div>

            <div className="domain-card" onClick={() => onOpenAuth("login")}>
              <div className="domain-icon-box text-neon">
                <FaLock />
              </div>
              <h3>Cryptography</h3>
              <p>Modern cryptanalysis, RSA factoring, elliptic curve anomalies, stream ciphers, and key exchange flaws.</p>
              <div className="domain-tools-row">
                <span className="tool-pill">SageMath</span>
                <span className="tool-pill">CyberChef</span>
                <span className="tool-pill">PyCryptodome</span>
              </div>
              <span className="domain-meta">Math & Math-Crypto</span>
            </div>

            <div className="domain-card" onClick={() => onOpenAuth("login")}>
              <div className="domain-icon-box text-purple">
                <FaCode />
              </div>
              <h3>Reverse Engineering</h3>
              <p>Binary decompilation with Ghidra, x86/ARM disassembly, control flow deobfuscation, and license bypasses.</p>
              <div className="domain-tools-row">
                <span className="tool-pill">Ghidra</span>
                <span className="tool-pill">IDA Free</span>
                <span className="tool-pill">GDB-PEDA</span>
              </div>
              <span className="domain-meta">ELF & PE Analysis</span>
            </div>

            <div className="domain-card" onClick={() => onOpenAuth("login")}>
              <div className="domain-icon-box text-amber">
                <FaSearch />
              </div>
              <h3>Forensics</h3>
              <p>Network packet inspection with Wireshark, volatile memory dumps, disk image carving, and steganography.</p>
              <div className="domain-tools-row">
                <span className="tool-pill">Wireshark</span>
                <span className="tool-pill">Volatility</span>
                <span className="tool-pill">Binwalk</span>
              </div>
              <span className="domain-meta">PCAP & Memory Artifacts</span>
            </div>

            <div className="domain-card" onClick={() => onOpenAuth("login")}>
              <div className="domain-icon-box text-danger">
                <FaSkullCrossbones />
              </div>
              <h3>Pwn / Binary Exploitation</h3>
              <p>Stack buffer overflows, ROP chain synthesis, format string injection, heap exploitation, and ASLR bypasses.</p>
              <div className="domain-tools-row">
                <span className="tool-pill">pwntools</span>
                <span className="tool-pill">ROPGadget</span>
                <span className="tool-pill">checksec</span>
              </div>
              <span className="domain-meta">Live Docker Targets</span>
            </div>

            <div className="domain-card" onClick={() => onOpenAuth("login")}>
              <div className="domain-icon-box text-neon">
                <FaUserSecret />
              </div>
              <h3>OSINT & Intelligence</h3>
              <p>Open source digital footprinting, geolocation reconnaissance, social graph tracing, and metadata analysis.</p>
              <div className="domain-tools-row">
                <span className="tool-pill">ExifTool</span>
                <span className="tool-pill">Shodan</span>
                <span className="tool-pill">Maltego</span>
              </div>
              <span className="domain-meta">Reconnaissance Operations</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Capabilities Strip */}
      <section className="landing-features-strip">
        <div className="landing-container">
          <div className="feature-strip-grid">
            <div className="feature-item">
              <FaServer className="feature-item-icon text-cyan" />
              <div>
                <h4>Isolated Docker Sandboxes</h4>
                <p>Spin up dedicated vulnerable containers in seconds with live URL/port generation.</p>
              </div>
            </div>
            <div className="feature-item">
              <FaShieldAlt className="feature-item-icon text-neon" />
              <div>
                <h4>Anti-Cheat & Flag Tokenization</h4>
                <p>Dynamic per-user flags, session validation, and real-time security integrity monitoring.</p>
              </div>
            </div>
            <div className="feature-item">
              <FaAward className="feature-item-icon text-amber" />
              <div>
                <h4>Verifiable Certificates</h4>
                <p>Earn official OWASP PCCOE verifiable completion credentials with custom studio designs.</p>
              </div>
            </div>
            <div className="feature-item">
              <FaUsers className="feature-item-icon text-purple" />
              <div>
                <h4>Squads & Tournament Arenas</h4>
                <p>Team formations, inter-college leaderboards, and live freeze-period tournament modes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ready To Hack Call To Action Banner */}
      <section className="landing-final-cta-section">
        <div className="landing-container">
          <div className="final-cta-card card">
            <div className="final-cta-glow" />
            <img src="/branding/owasp-pccoe-logo.png" alt="OWASP PCCOE" className="final-cta-logo" />
            <h2>Ready to Test Your Skills in the Arena?</h2>
            <p>Join hundreds of PCCOE students capturing flags, solving real-world vulnerabilities, and climbing the community leaderboard.</p>
            <div className="final-cta-btn-group">
              <button className="landing-cta-btn landing-cta-primary" onClick={() => onOpenAuth("login")}>
                <span>Enter Academy Now</span>
                <FaArrowRight />
              </button>
              <button className="landing-cta-btn landing-cta-secondary" onClick={() => onOpenAuth("register")}>
                <span>Create Student Account</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div className="landing-footer-brand">
            <img src="/branding/owasp-pccoe-logo.png" alt="OWASP PCCOE Logo" className="footer-logo" />
            <div>
              <span className="footer-title">OWASP PCCOE CTF Academy</span>
              <p className="footer-copy">Official Cybersecurity Training & Competition Platform • PCCOE Pune</p>
            </div>
          </div>

          <div className="landing-footer-actions">
            <button className="footer-link-btn" onClick={() => scrollToSection("explore-chapter")}>About OWASP PCCOE</button>
            <button className="footer-link-btn" onClick={() => scrollToSection("interactive-terminal")}>Live Terminal</button>
            <button className="footer-link-btn" onClick={() => scrollToSection("domains-section")}>Curriculum</button>
            <button className="footer-link-btn text-neon" onClick={() => onOpenAuth("login")}>Sign In →</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
