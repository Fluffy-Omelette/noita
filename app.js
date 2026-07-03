(function () {
  const STORAGE_KEY = "noita-personal-wiki-v1";
  const RECENT_KEY = "noita-personal-wiki-recents-v1";
  const apiBaseUrl = (window.NOITA_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");

  const seedArticles = [
    {
      id: crypto.randomUUID(),
      slug: "baguettes-et-capacite",
      title: "Baguettes et capacite de lancement",
      category: "Baguettes",
      createdAt: "2026-07-01T08:00:00.000Z",
      updatedAt: "2026-07-01T08:30:00.000Z",
      versions: [
        {
          timestamp: "2026-07-01T08:00:00.000Z",
          note: "Premiere hypothese",
          html: "<h2>Observation initiale</h2><p>Une baguette semble surtout definie par son delai de lancement, son temps de recharge et sa reserve de mana. Les sorts a faible cout peuvent masquer une mauvaise cadence.</p><p>Hypothese a verifier : la capacite de mana influence autant la stabilite du build que les degats bruts.</p>"
        },
        {
          timestamp: "2026-07-01T08:30:00.000Z",
          note: "Lien avec les modificateurs",
          html: "<h2>Compréhension actuelle</h2><p>La baguette doit etre lue comme une machine a sequence. Les modificateurs changent le comportement des projectiles, mais le vrai verrou reste souvent le cycle <strong>delai de lancement + recharge + mana</strong>.</p><p>Voir aussi <a href=\"#article/alchimie-des-liquides\" data-internal-link=\"alchimie-des-liquides\">Alchimie des liquides</a> pour les interactions environnementales.</p>"
        }
      ]
    },
    {
      id: crypto.randomUUID(),
      slug: "alchimie-des-liquides",
      title: "Alchimie des liquides",
      category: "Alchimie",
      createdAt: "2026-07-01T08:10:00.000Z",
      updatedAt: "2026-07-01T08:10:00.000Z",
      versions: [
        {
          timestamp: "2026-07-01T08:10:00.000Z",
          note: "Base de suivi",
          html: "<h2>Journal de tests</h2><p>Les liquides ne sont pas seulement des dangers : ils servent de protection, de catalyseur et parfois d'indice. Noter systematiquement les reactions observees apres chaque run.</p><ul><li>Eau : protection contre le feu.</li><li>Sang : comportement a surveiller avec certains perks.</li><li>Acide : destruction rapide du terrain.</li></ul>"
        }
      ]
    }
  ];

  let state = loadState();
  let recents = loadRecents();
  let currentSlug = null;
  let selectedVersionIndex = 0;
  let editingSlug = null;
  let quill = null;

  const els = {
    searchInput: document.getElementById("searchInput"),
    searchResults: document.getElementById("searchResults"),
    articleNav: document.getElementById("articleNav"),
    recentViews: document.getElementById("recentViews"),
    updatedFeed: document.getElementById("updatedFeed"),
    globalUpdated: document.getElementById("globalUpdated"),
    homeView: document.getElementById("homeView"),
    articleView: document.getElementById("articleView"),
    editorView: document.getElementById("editorView"),
    newArticleHome: document.getElementById("newArticleHome"),
    backHome: document.getElementById("backHome"),
    editArticle: document.getElementById("editArticle"),
    articleCategory: document.getElementById("articleCategory"),
    articleTitle: document.getElementById("articleTitle"),
    versionTimestamp: document.getElementById("versionTimestamp"),
    articleUpdated: document.getElementById("articleUpdated"),
    versionSlider: document.getElementById("versionSlider"),
    versionSelect: document.getElementById("versionSelect"),
    articleBody: document.getElementById("articleBody"),
    editorForm: document.getElementById("editorForm"),
    cancelEdit: document.getElementById("cancelEdit"),
    titleField: document.getElementById("titleField"),
    categoryField: document.getElementById("categoryField"),
    slugField: document.getElementById("slugField"),
    revisionNoteField: document.getElementById("revisionNoteField"),
    insertInternalLink: document.getElementById("insertInternalLink"),
    imageUpload: document.getElementById("imageUpload")
  };

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = { articles: seedArticles };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return { articles: seedArticles };
    }
  }

  function loadRecents() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveRecents() {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
  }

  async function syncFromRemote() {
    if (!apiBaseUrl) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/articles`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remoteState = await response.json();
      if (Array.isArray(remoteState.articles)) {
        state = remoteState;
        saveState();
        renderShell();
        if (currentSlug) renderArticle();
      }
    } catch (error) {
      console.warn("API Render indisponible, utilisation du stockage local.", error);
    }
  }

  async function persistNewArticle(article) {
    if (!apiBaseUrl) return;
    const response = await fetch(`${apiBaseUrl}/api/articles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(article)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  async function persistRevision(article, version) {
    if (!apiBaseUrl) return;
    const response = await fetch(`${apiBaseUrl}/api/articles/${encodeURIComponent(article.slug)}/revisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: article.title,
        category: article.category,
        updatedAt: article.updatedAt,
        version
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  function formatDate(iso) {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(iso));
  }

  function sortByUpdated(articles) {
    return [...articles].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function articleBySlug(slug) {
    return state.articles.find((article) => article.slug === slug);
  }

  function textFromHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
  }

  function showView(name) {
    els.homeView.hidden = name !== "home";
    els.articleView.hidden = name !== "article";
    els.editorView.hidden = name !== "editor";
  }

  function renderShell() {
    renderArticleNav();
    renderRecents();
    renderUpdatedFeed();
    const latest = sortByUpdated(state.articles)[0]?.updatedAt;
    els.globalUpdated.textContent = `Derniere mise a jour globale : ${latest ? formatDate(latest) : "-"}`;
  }

  function renderArticleNav() {
    els.articleNav.innerHTML = "";
    sortByUpdated(state.articles).forEach((article) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `nav-link${article.slug === currentSlug ? " active" : ""}`;
      button.textContent = article.title;
      button.addEventListener("click", () => navigateToArticle(article.slug));
      els.articleNav.appendChild(button);
    });
  }

  function renderRecents() {
    els.recentViews.innerHTML = "";
    const visible = recents.map(articleBySlug).filter(Boolean).slice(0, 6);
    if (!visible.length) {
      els.recentViews.innerHTML = '<div class="empty-state">Aucun article consulte.</div>';
      return;
    }
    visible.forEach((article) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recent-link";
      button.textContent = article.title;
      button.addEventListener("click", () => navigateToArticle(article.slug));
      els.recentViews.appendChild(button);
    });
  }

  function renderUpdatedFeed() {
    els.updatedFeed.innerHTML = "";
    sortByUpdated(state.articles).forEach((article) => {
      const latest = article.versions.at(-1);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "feed-item";
      button.innerHTML = `
        <strong>${escapeHtml(article.title)}</strong>
        <span>${escapeHtml(article.category || "Sans categorie")} - ${formatDate(article.updatedAt)} - ${escapeHtml(latest.note || "Nouvelle version")}</span>
      `;
      button.addEventListener("click", () => navigateToArticle(article.slug));
      els.updatedFeed.appendChild(button);
    });
  }

  function renderArticle() {
    const article = articleBySlug(currentSlug);
    if (!article) {
      navigateHome();
      return;
    }

    selectedVersionIndex = Math.min(selectedVersionIndex, article.versions.length - 1);
    const version = article.versions[selectedVersionIndex];
    els.articleCategory.textContent = article.category || "Article";
    els.articleTitle.textContent = article.title;
    els.versionTimestamp.textContent = `Version : ${formatDate(version.timestamp)}`;
    els.articleUpdated.textContent = `Article mis a jour : ${formatDate(article.updatedAt)}`;
    els.articleBody.innerHTML = version.html;

    els.versionSlider.min = 0;
    els.versionSlider.max = article.versions.length - 1;
    els.versionSlider.value = selectedVersionIndex;
    els.versionSelect.innerHTML = "";
    article.versions.forEach((entry, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${index + 1}. ${formatDate(entry.timestamp)} - ${entry.note || "Version"}`;
      option.selected = index === selectedVersionIndex;
      els.versionSelect.appendChild(option);
    });

    els.articleBody.querySelectorAll("[data-internal-link]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        navigateToArticle(link.dataset.internalLink);
      });
    });

    renderShell();
  }

  function navigateHome() {
    currentSlug = null;
    location.hash = "home";
    showView("home");
    renderShell();
  }

  function navigateToArticle(slug, versionIndex) {
    const article = articleBySlug(slug);
    if (!article) return;
    currentSlug = slug;
    selectedVersionIndex = typeof versionIndex === "number" ? versionIndex : article.versions.length - 1;
    recents = [slug, ...recents.filter((item) => item !== slug)].slice(0, 8);
    saveRecents();
    location.hash = `article/${slug}`;
    showView("article");
    renderArticle();
  }

  function openEditor(slug) {
    editingSlug = slug || null;
    const article = slug ? articleBySlug(slug) : null;
    const latest = article?.versions.at(-1);

    els.titleField.value = article?.title || "";
    els.categoryField.value = article?.category || "";
    els.slugField.value = article?.slug || "";
    els.slugField.disabled = Boolean(article);
    els.revisionNoteField.value = "";

    ensureEditor();
    quill.root.innerHTML = latest?.html || "<h2>Nouvelle note</h2><p></p>";

    showView("editor");
  }

  function ensureEditor() {
    if (quill) return;
    if (!window.Quill) {
      const editor = document.getElementById("editor");
      editor.contentEditable = "true";
      editor.setAttribute("role", "textbox");
      editor.setAttribute("aria-multiline", "true");
      bindFallbackToolbar(editor);
      quill = {
        root: editor,
        getSelection: () => null,
        insertText: (index, text) => {
          document.execCommand("insertText", false, text);
        },
        insertEmbed: (_index, _type, value) => {
          document.execCommand("insertImage", false, value);
        },
        setSelection: () => {}
      };
      return;
    }
    quill = new Quill("#editor", {
      theme: "snow",
      modules: { toolbar: "#quillToolbar" },
      placeholder: "Redige ton article, colle tes observations, insere des captures..."
    });
  }

  function bindFallbackToolbar(editor) {
    const toolbar = document.getElementById("quillToolbar");
    toolbar.querySelector(".ql-bold").addEventListener("click", () => document.execCommand("bold"));
    toolbar.querySelector(".ql-italic").addEventListener("click", () => document.execCommand("italic"));
    toolbar.querySelector('.ql-list[value="ordered"]').addEventListener("click", () => document.execCommand("insertOrderedList"));
    toolbar.querySelector('.ql-list[value="bullet"]').addEventListener("click", () => document.execCommand("insertUnorderedList"));
    toolbar.querySelector(".ql-code-block").addEventListener("click", () => document.execCommand("formatBlock", false, "pre"));
    toolbar.querySelector(".ql-blockquote").addEventListener("click", () => document.execCommand("formatBlock", false, "blockquote"));
    toolbar.querySelector(".ql-link").addEventListener("click", () => {
      const url = prompt("URL du lien :");
      if (url) document.execCommand("createLink", false, url);
    });
    toolbar.querySelector(".ql-header").addEventListener("change", (event) => {
      const value = event.target.value;
      document.execCommand("formatBlock", false, value ? `h${value}` : "p");
      event.target.value = "";
      editor.focus();
    });
  }

  async function saveEditor(event) {
    event.preventDefault();
    const now = new Date().toISOString();
    const title = els.titleField.value.trim();
    const category = els.categoryField.value.trim();
    const slug = slugify(els.slugField.value.trim() || title);
    const note = els.revisionNoteField.value.trim();
    const html = quill.root.innerHTML;

    if (!title || !slug) return;

    if (editingSlug) {
      const article = articleBySlug(editingSlug);
      const version = { timestamp: now, note, html };
      article.title = title;
      article.category = category;
      article.updatedAt = now;
      article.versions.push(version);
      saveState();
      try {
        await persistRevision(article, version);
      } catch (error) {
        console.warn("Revision conservee localement, synchronisation Render echouee.", error);
      }
      navigateToArticle(article.slug, article.versions.length - 1);
      return;
    }

    if (articleBySlug(slug)) {
      alert("Ce slug existe deja. Choisis un identifiant interne different.");
      return;
    }

    const article = {
      id: crypto.randomUUID(),
      slug,
      title,
      category,
      createdAt: now,
      updatedAt: now,
      versions: [{ timestamp: now, note, html }]
    };
    state.articles.push(article);
    saveState();
    try {
      await persistNewArticle(article);
    } catch (error) {
      console.warn("Article conserve localement, synchronisation Render echouee.", error);
    }
    navigateToArticle(article.slug, 0);
  }

  function insertInternalLink() {
    ensureEditor();
    const slug = prompt("Slug de l'article cible :");
    if (!slug) return;
    const label = prompt("Texte du lien :", articleBySlug(slug)?.title || slug);
    if (!label) return;

    const linkHtml = `<a href="#article/${escapeAttribute(slug)}" data-internal-link="${escapeAttribute(slug)}">${escapeHtml(label)}</a>`;
    if (window.Quill && quill.clipboard) {
      const range = quill.getSelection(true);
      quill.clipboard.dangerouslyPasteHTML(range.index, linkHtml);
      quill.setSelection(range.index + label.length, 0);
    } else {
      document.execCommand("insertHTML", false, linkHtml);
    }
  }

  function insertImage(file) {
    ensureEditor();
    const reader = new FileReader();
    reader.onload = () => {
      const range = quill.getSelection?.(true);
      if (window.Quill && range) {
        quill.insertEmbed(range.index, "image", reader.result);
        quill.setSelection(range.index + 1, 0);
      } else {
        quill.insertEmbed(0, "image", reader.result);
      }
      els.imageUpload.value = "";
    };
    reader.readAsDataURL(file);
  }

  function runSearch(query) {
    const normalized = query.trim().toLowerCase();
    els.searchResults.innerHTML = "";
    if (!normalized) {
      els.searchResults.hidden = true;
      return;
    }

    const results = state.articles
      .map((article) => {
        const latest = article.versions.at(-1);
        const haystack = `${article.title} ${article.category} ${textFromHtml(latest.html)}`.toLowerCase();
        return haystack.includes(normalized) ? { article, latest } : null;
      })
      .filter(Boolean)
      .slice(0, 8);

    if (!results.length) {
      els.searchResults.innerHTML = '<div class="result-item"><span>Aucun resultat.</span></div>';
      els.searchResults.hidden = false;
      return;
    }

    results.forEach(({ article, latest }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-item";
      button.innerHTML = `
        <strong>${escapeHtml(article.title)}</strong>
        <span>${escapeHtml(article.category || "Sans categorie")} - ${escapeHtml(textFromHtml(latest.html).slice(0, 120))}</span>
      `;
      button.addEventListener("click", () => {
        els.searchInput.value = "";
        els.searchResults.hidden = true;
        navigateToArticle(article.slug);
      });
      els.searchResults.appendChild(button);
    });
    els.searchResults.hidden = false;
  }

  function slugify(value) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function bindEvents() {
    document.querySelector(".brand").addEventListener("click", (event) => {
      event.preventDefault();
      navigateHome();
    });
    els.newArticleHome.addEventListener("click", () => openEditor());
    els.backHome.addEventListener("click", navigateHome);
    els.editArticle.addEventListener("click", () => openEditor(currentSlug));
    els.cancelEdit.addEventListener("click", () => (currentSlug ? navigateToArticle(currentSlug) : navigateHome()));
    els.editorForm.addEventListener("submit", saveEditor);
    els.titleField.addEventListener("input", () => {
      if (!editingSlug) els.slugField.value = slugify(els.titleField.value);
    });
    els.versionSlider.addEventListener("input", () => navigateToArticle(currentSlug, Number(els.versionSlider.value)));
    els.versionSelect.addEventListener("change", () => navigateToArticle(currentSlug, Number(els.versionSelect.value)));
    els.insertInternalLink.addEventListener("click", insertInternalLink);
    els.imageUpload.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) insertImage(file);
    });
    els.searchInput.addEventListener("input", (event) => runSearch(event.target.value));
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".search-box")) els.searchResults.hidden = true;
    });
  }

  function routeFromHash() {
    const hash = location.hash.replace(/^#/, "");
    if (hash.startsWith("article/")) {
      navigateToArticle(hash.split("/")[1]);
      return;
    }
    navigateHome();
  }

  bindEvents();
  renderShell();
  routeFromHash();
  syncFromRemote();
})();
