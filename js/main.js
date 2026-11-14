/* ==========================================================================
   WOTBO — wotbo.pro
   Тема, мобильное меню, версия, changelog и beta-сборка.
   ========================================================================== */

(function () {
    "use strict";

    const RAW_BASE = "https://raw.githubusercontent.com/oixro/WOTBO/refs/heads/main";
    const FETCH_TIMEOUT = 8000;

    /* ---------------------------------------------------------------------
       Утилиты
       --------------------------------------------------------------------- */

    async function loadText(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                cache: "no-store",
                headers: { Accept: "text/plain, */*" }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return (await response.text()).trim();
        } finally {
            clearTimeout(timer);
        }
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    /* ---------------------------------------------------------------------
       Тема
       --------------------------------------------------------------------- */

    function initTheme() {
        const button = document.getElementById("theme");
        const root = document.documentElement;
        if (!button) return;

        const apply = (value) => {
            root.setAttribute("data-theme", value);
            button.textContent = value === "dark" ? "☀" : "☾";
            button.setAttribute("aria-label", value === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
            button.title = button.getAttribute("aria-label");

            try {
                localStorage.setItem("wotbo-theme", value);
            } catch (error) {
                /* приватный режим */
            }
        };

        apply(root.getAttribute("data-theme") === "light" ? "light" : "dark");

        button.addEventListener("click", () => {
            apply(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
        });
    }

    /* ---------------------------------------------------------------------
       Мобильное меню
       --------------------------------------------------------------------- */

    function initMenu() {
        const burger = document.getElementById("burger");
        const links = document.getElementById("links");
        if (!burger || !links) return;

        const close = () => {
            burger.setAttribute("aria-expanded", "false");
            burger.setAttribute("aria-label", "Открыть меню");
            links.classList.remove("is-open");
        };

        burger.addEventListener("click", () => {
            const open = burger.getAttribute("aria-expanded") === "true";
            if (open) {
                close();
                return;
            }

            burger.setAttribute("aria-expanded", "true");
            burger.setAttribute("aria-label", "Закрыть меню");
            links.classList.add("is-open");
        });

        links.addEventListener("click", (event) => {
            if (event.target.closest("a")) close();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") close();
        });

        window.matchMedia("(min-width: 761px)").addEventListener("change", (event) => {
            if (event.matches) close();
        });
    }

    /* ---------------------------------------------------------------------
       Версия
       --------------------------------------------------------------------- */

    async function initVersion() {
        const heroVersion = document.getElementById("version");
        const statVersion = document.getElementById("version-stat");

        try {
            const raw = await loadText(`${RAW_BASE}/ver.json`);
            const version = raw.replace(/[^\d.\w-]/g, "").slice(0, 24);
            if (!version) throw new Error("Пустой ответ");

            if (heroVersion) heroVersion.textContent = `v${version}`;
            if (statVersion) statVersion.textContent = version;
        } catch (error) {
            console.warn("WOTBO: не удалось загрузить версию —", error);
            if (heroVersion) heroVersion.textContent = "v2.33";
            if (statVersion) statVersion.textContent = "2.33";
        }
    }

    /* ---------------------------------------------------------------------
       Changelog: три последние версии из README репозитория
       --------------------------------------------------------------------- */

    function parseChangelog(markdown) {
        const versions = [];
        let current = null;

        for (const rawLine of markdown.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line) continue;

            const header = line.match(/^Ver\s+(.+)$/i);
            if (header) {
                current = { version: header[1].trim(), items: [] };
                versions.push(current);
                continue;
            }

            if (!current) continue;
            if (/^#/.test(line)) continue;
            if (/^changelog:?$/i.test(line)) continue;
            if (/^windows optimization tool/i.test(line)) continue;

            const item = line.match(/^\[([+\-=!])\]\s*(.+)$/);
            current.items.push(item ? item[2] : line);
        }

        return versions.filter((version) => version.items.length > 0);
    }

    function renderChangelog(container, versions) {
        container.replaceChildren();

        for (const version of versions) {
            const card = el("div");
            card.appendChild(el("b", null, `Ver ${version.version}`));

            const list = el("ul");
            for (const item of version.items.slice(0, 6)) {
                list.appendChild(el("li", null, item));
            }

            card.appendChild(list);
            container.appendChild(card);
        }

        container.setAttribute("aria-busy", "false");
    }

    async function initChangelog() {
        const container = document.getElementById("changelog");
        if (!container) return;

        try {
            const readme = await loadText(`${RAW_BASE}/README.md`);
            const versions = parseChangelog(readme).slice(0, 3);

            if (!versions.length) throw new Error("В README нет списка версий");
            renderChangelog(container, versions);
        } catch (error) {
            console.warn("WOTBO: README недоступен, пробую lastchange.json —", error);

            try {
                const last = await loadText(`${RAW_BASE}/lastchange.json`);
                const versions = parseChangelog(last).slice(0, 1);

                if (!versions.length) throw new Error("Пустой список изменений");
                renderChangelog(container, versions);
            } catch (fallbackError) {
                container.replaceChildren(
                    el("div", null, "Не удалось загрузить список изменений. Полная история — в репозитории WOTBO.")
                );
                container.setAttribute("aria-busy", "false");
                console.warn("WOTBO: changelog недоступен —", fallbackError);
            }
        }
    }

    /* ---------------------------------------------------------------------
       Beta: последний релиз WOTBO-DARK-Source + предупреждение
       --------------------------------------------------------------------- */

    const BETA_REPO = "oixro/WOTBO-DARK-Source";
    const BETA_RELEASES_PAGE = `https://github.com/${BETA_REPO}/releases`;
    const BETA_CACHE_KEY = "wotbo:beta-release:v1";
    const BETA_CACHE_TTL = 10 * 60 * 1000;
    const BETA_WAIT_SECONDS = 10;

    function formatSize(bytes) {
        if (!bytes) return "";
        return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
    }

    function readBetaCache() {
        try {
            const raw = window.sessionStorage.getItem(BETA_CACHE_KEY);
            if (!raw) return null;

            const data = JSON.parse(raw);
            if (!data || !data.url || Date.now() - data.savedAt > BETA_CACHE_TTL) return null;
            return data;
        } catch (error) {
            return null;
        }
    }

    function writeBetaCache(data) {
        try {
            window.sessionStorage.setItem(BETA_CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
        } catch (error) {
            /* без кеша */
        }
    }

    async function fetchLatestBeta() {
        const cached = readBetaCache();
        if (cached) return cached;

        const fallback = { version: null, url: BETA_RELEASES_PAGE, file: null, size: 0 };

        try {
            const response = await fetch(`https://api.github.com/repos/${BETA_REPO}/releases?per_page=10`, {
                headers: { Accept: "application/vnd.github+json" }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const releases = (await response.json())
                .filter((release) => !release.draft)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            for (const release of releases) {
                const assets = release.assets || [];
                const asset = assets.find((item) => /\.exe$/i.test(item.name)) || assets[0];

                if (!asset) continue;

                const data = {
                    version: release.tag_name,
                    url: asset.browser_download_url,
                    file: asset.name,
                    size: asset.size
                };

                writeBetaCache(data);
                return data;
            }

            if (releases[0]) {
                return { version: releases[0].tag_name, url: releases[0].html_url, file: null, size: 0 };
            }
        } catch (error) {
            console.warn("WOTBO: не удалось получить beta-релиз —", error);
        }

        return fallback;
    }

    function initBeta() {
        const trigger = document.getElementById("beta-link");
        const dialog = document.getElementById("beta-dialog");
        if (!trigger || !dialog) return;

        const download = document.getElementById("beta-download");
        const countdown = document.getElementById("beta-countdown");
        const progress = document.getElementById("beta-progress");
        const meta = document.getElementById("beta-meta");

        let release = null;
        let timer = null;
        let timeIsUp = false;

        const releasePromise = fetchLatestBeta().then((data) => {
            release = data;

            if (meta) {
                const parts = [];
                if (data.version) parts.push(`Версия ${data.version}`);
                if (data.file) parts.push(data.file);
                if (data.size) parts.push(formatSize(data.size));
                meta.textContent = parts.length ? parts.join(" · ") : "Сборка из репозитория";
            }

            return data;
        });

        function enableDownload() {
            if (!timeIsUp || !release) return;

            download.href = release.url;
            download.removeAttribute("aria-disabled");
            download.classList.remove("is-disabled");
            progress.style.width = "100%";
            countdown.textContent = release.file
                ? `Готово: ${release.file}`
                : "Готово: ссылка на страницу релизов";
        }

        function startCountdown() {
            const startedAt = Date.now();
            timeIsUp = false;

            download.classList.add("is-disabled");
            download.setAttribute("aria-disabled", "true");
            download.href = BETA_RELEASES_PAGE;
            progress.style.width = "0%";
            countdown.textContent = `Ссылка станет доступна через ${BETA_WAIT_SECONDS} с — прочитай предупреждения.`;

            timer = window.setInterval(() => {
                const elapsed = (Date.now() - startedAt) / 1000;
                const left = Math.max(0, BETA_WAIT_SECONDS - elapsed);

                progress.style.width = `${Math.min(100, (elapsed / BETA_WAIT_SECONDS) * 100)}%`;

                if (left > 0) {
                    countdown.textContent = `Ссылка станет доступна через ${Math.ceil(left)} с — прочитай предупреждения.`;
                    return;
                }

                window.clearInterval(timer);
                timer = null;
                timeIsUp = true;

                if (release) {
                    enableDownload();
                } else {
                    countdown.textContent = "Готово, получаю ссылку…";
                }
            }, 100);
        }

        releasePromise.then(enableDownload);

        function openDialog() {
            if (timer) window.clearInterval(timer);
            startCountdown();

            if (typeof dialog.showModal === "function") {
                dialog.showModal();
            } else {
                dialog.setAttribute("open", "");
            }
        }

        function closeDialog() {
            if (typeof dialog.close === "function") {
                dialog.close();
            } else {
                dialog.removeAttribute("open");
            }
        }

        trigger.addEventListener("click", (event) => {
            event.preventDefault();
            openDialog();
        });

        dialog.querySelectorAll("[data-beta-close]").forEach((button) => {
            button.addEventListener("click", closeDialog);
        });

        dialog.addEventListener("close", () => {
            if (timer) window.clearInterval(timer);
            timer = null;
        });

        dialog.addEventListener("click", (event) => {
            if (event.target !== dialog) return;

            const rect = dialog.getBoundingClientRect();
            const outside = event.clientX < rect.left || event.clientX > rect.right ||
                event.clientY < rect.top || event.clientY > rect.bottom;

            if (outside) closeDialog();
        });
    }

    /* ---------------------------------------------------------------------
       Запуск
       --------------------------------------------------------------------- */

    function init() {
        const year = document.getElementById("year");
        if (year) year.textContent = String(new Date().getFullYear());

        initTheme();
        initMenu();
        initVersion();
        initChangelog();
        initBeta();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
