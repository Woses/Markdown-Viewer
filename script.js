const PAGE_DIR = "pages";
const PAGE_EXTENSIONS = [".md", ".markdown"];

const appEl = document.getElementById("app");
const sidebarEl = document.getElementById("sidebar");
const fileList = document.getElementById("fileList");
const searchInput = document.getElementById("search");
const statusEl = document.getElementById("status");
const contentEl = document.getElementById("content");
const currentFileEl = document.getElementById("currentFile");
const rawLinkEl = document.getElementById("rawLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const printBtn = document.getElementById("printBtn");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebarToggleMain = document.getElementById("sidebarToggleMain");

let FILES = [];
let currentPath = null;

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[§]/g, "")
    .replace(/[^a-z0-9äöüß\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseInline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let inBlockquote = false;
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length) {
      html += `<p>${parseInline(paragraph.join(" "))}</p>`;
      paragraph = [];
    }
  }

  function closeLists() {
    if (inUl) {
      html += "</ul>";
      inUl = false;
    }
    if (inOl) {
      html += "</ol>";
      inOl = false;
    }
  }

  function closeBlockquote() {
    if (inBlockquote) {
      flushParagraph();
      html += "</blockquote>";
      inBlockquote = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      closeLists();
      closeBlockquote();
      flushParagraph();
      if (!inCode) {
        inCode = true;
        html += "<pre><code>";
      } else {
        inCode = false;
        html += "</code></pre>";
      }
      continue;
    }

    if (inCode) {
      html += escapeHtml(line) + "\n";
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeLists();
      closeBlockquote();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeLists();
      closeBlockquote();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      html += `<h${level} id="${id}">${parseInline(text)}</h${level}>`;
      continue;
    }

    if (line.startsWith("> ")) {
      flushParagraph();
      closeLists();
      if (!inBlockquote) {
        html += "<blockquote>";
        inBlockquote = true;
      }
      paragraph.push(line.slice(2).trim());
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      closeBlockquote();
      if (inOl) {
        html += "</ol>";
        inOl = false;
      }
      if (!inUl) {
        html += "<ul>";
        inUl = true;
      }
      html += `<li>${parseInline(ul[1])}</li>`;
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      flushParagraph();
      closeBlockquote();
      if (inUl) {
        html += "</ul>";
        inUl = false;
      }
      if (!inOl) {
        html += "<ol>";
        inOl = true;
      }
      html += `<li>${parseInline(ol[1])}</li>`;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      closeLists();
      closeBlockquote();
      html += "<hr>";
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeLists();
  closeBlockquote();

  return html;
}

function prettifyTitle(path) {
  const filename = path.split("/").pop() || path;
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setActive(path) {
  document.querySelectorAll(".file-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.path === path);
  });
}

function getInitialPath() {
  const hash = window.location.hash || "";
  const match = hash.match(/file=([^&]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return FILES[0]?.path || null;
}

function updateHash(path) {
  const url = new URL(window.location.href);
  url.hash = `file=${encodeURIComponent(path)}`;
  history.replaceState(null, "", url);
}

function renderFileButtons(filter = "") {
  fileList.innerHTML = "";
  const needle = filter.trim().toLowerCase();

  const filtered = FILES.filter(file => {
    return (
      !needle ||
      file.title.toLowerCase().includes(needle) ||
      file.path.toLowerCase().includes(needle)
    );
  });

  if (!filtered.length) {
    fileList.innerHTML = `<div class="empty-state">Keine passenden Dateien gefunden.</div>`;
    return;
  }

  filtered.forEach(file => {
    const btn = document.createElement("button");
    btn.className = "file-btn";
    btn.type = "button";
    btn.dataset.path = file.path;
    btn.innerHTML = `
      <span class="file-title">${escapeHtml(file.title)}</span>
      <span class="file-path">${escapeHtml(file.path)}</span>
    `;
    btn.addEventListener("click", () => openFile(file.path));
    fileList.appendChild(btn);
  });

  if (currentPath) {
    setActive(currentPath);
  }
}

async function openFile(path) {
  try {
    currentPath = path;
    setActive(path);
    setStatus(`Lade ${path} ...`);
    currentFileEl.textContent = path;
    rawLinkEl.href = path;

    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markdown = await response.text();
    contentEl.innerHTML = renderMarkdown(markdown);
    setStatus(`Geladen: ${path}`);
    updateHash(path);
  } catch (error) {
    contentEl.innerHTML = `
      <h1>Datei konnte nicht geladen werden</h1>
      <p class="muted">Pfad: <code>${escapeHtml(path)}</code></p>
      <p class="muted">Fehler: <code>${escapeHtml(String(error.message || error))}</code></p>
      <p>Prüfe, ob die Datei im Repository vorhanden ist und GitHub Pages den Pfad korrekt ausliefert.</p>
    `;
    setStatus("Fehler beim Laden.");
  }
}

function getRepoInfoFromLocation() {
  const { hostname, pathname } = window.location;

  if (!hostname.endsWith("github.io")) {
    return null;
  }

  const owner = hostname.split(".")[0];
  const pathParts = pathname.split("/").filter(Boolean);

  if (pathParts.length === 0) {
    return { owner, repo: `${owner}.github.io` };
  }

  return { owner, repo: pathParts[0] };
}

async function listFilesFromGitHub() {
  const repoInfo = getRepoInfoFromLocation();

  if (!repoInfo) {
    throw new Error("GitHub-Repository konnte aus der URL nicht erkannt werden.");
  }

  const apiUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${PAGE_DIR}`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API Fehler: HTTP ${response.status}`);
  }

  const items = await response.json();

  if (!Array.isArray(items)) {
    throw new Error("Unerwartete Antwort der GitHub API.");
  }

  return items
    .filter(item => item.type === "file")
    .filter(item => PAGE_EXTENSIONS.some(ext => item.name.toLowerCase().endsWith(ext)))
    .map(item => ({
      title: prettifyTitle(`${PAGE_DIR}/${item.name}`),
      path: `${PAGE_DIR}/${item.name}`
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "de"));
}

async function initializeFiles() {
  setStatus("Lese Dateien aus pages/ ...");

  try {
    FILES = await listFilesFromGitHub();

    if (!FILES.length) {
      fileList.innerHTML = `<div class="empty-state">Im Ordner <code>pages/</code> wurden keine Markdown-Dateien gefunden.</div>`;
      setStatus("Keine Markdown-Dateien gefunden.");
      return;
    }

    renderFileButtons();

    const initialPath = getInitialPath();
    if (initialPath) {
      const exists = FILES.some(file => file.path === initialPath);
      await openFile(exists ? initialPath : FILES[0].path);
    }
  } catch (error) {
    fileList.innerHTML = `
      <div class="empty-state">
        Die Dateiliste konnte nicht automatisch geladen werden.<br><br>
        <span class="muted">${escapeHtml(String(error.message || error))}</span>
      </div>
    `;
    contentEl.innerHTML = `
      <h1>Dateiliste konnte nicht geladen werden</h1>
      <p>Für diese automatische Ordnerauflistung wird ein öffentliches GitHub-Repository benötigt.</p>
      <p class="muted">Fehler: <code>${escapeHtml(String(error.message || error))}</code></p>
    `;
    setStatus("Fehler beim Laden der Dateiliste.");
  }
}

function toggleSidebar() {
  appEl.classList.toggle("sidebar-collapsed");
}

copyLinkBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    setStatus("Direktlink kopiert.");
  } catch {
    setStatus("Kopieren nicht möglich.");
  }
});

searchInput.addEventListener("input", event => {
  renderFileButtons(event.target.value);
});

sidebarToggle.addEventListener("click", toggleSidebar);
sidebarToggleMain.addEventListener("click", toggleSidebar);

window.addEventListener("hashchange", () => {
  const path = getInitialPath();
  if (path) {
    openFile(path);
  }
});

initializeFiles();
