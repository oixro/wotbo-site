/* ==========================================================================
   WOTBO — wotbo.pro
   Единственный скрипт сайта: меню, скроллспай, анимации появления
   и подгрузка данных о версии/изменениях из репозитория WOTBO.
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

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

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
       Версия приложения
       --------------------------------------------------------------------- */

    async function initVersion() {
        const target = document.getElementById("version");
        if (!target) return;

        try {
            const version = await loadText(`${RAW_BASE}/ver.json`);
            const clean = version.replace(/[^\d.\w-]/g, "").slice(0, 24);

            if (!clean) throw new Error("Пустой ответ");
            target.textContent = `v${clean}`;
        } catch (error) {
            target.textContent = "недоступна";
            console.warn("WOTBO: не удалось загрузить версию —", error);
        }
    }

    /* ---------------------------------------------------------------------
       Список изменений
       --------------------------------------------------------------------- */

    const TAG_MAP = {
        "+": { label: "+", title: "Добавлено", className: "tag--new" },
        "=": { label: "=", title: "Изменено", className: "tag--changed" },
        "-": { label: "−", title: "Удалено", className: "tag--removed" }
    };

    function parseChangelog(text) {
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        let title = "";
        const items = [];

        for (const line of lines) {
            const match = line.match(/^\[([+\-=!])\]\s*(.+)$/);

            if (match) {
                items.push({ tag: match[1], text: match[2] });
            } else if (!title && items.length === 0) {
                title = line;
            } else {
                items.push({ tag: null, text: line });
            }
        }

        return { title, items };
    }

    function renderChangelog(data) {
        const container = document.getElementById("changelog");
        if (!container) return;

        const list = el("ul", "changelog__list");

        for (const item of data.items) {
            const row = el("li", "changelog__item");

            if (item.tag) {
                const meta = TAG_MAP[item.tag] || {
                    label: item.tag,
                    title: "Изменение",
                    className: "tag--other"
                };

                const tag = el("span", `tag ${meta.className}`, meta.label);
                tag.setAttribute("title", meta.title);
                tag.setAttribute("aria-label", meta.title);
                row.appendChild(tag);
                row.appendChild(el("span", "changelog__text", item.text));
            } else {
                row.classList.add("is-plain");
                row.appendChild(el("span", "changelog__text", item.text));
            }

            list.appendChild(row);
        }

        container.replaceChildren(list);
        container.setAttribute("aria-busy", "false");

        const meta = document.getElementById("changelog-meta");
        if (meta) {
            meta.textContent = data.title
                ? data.title.replace(/\s+/g, " ")
                : "Список изменений";
        }
    }

    async function initChangelog() {
        const container = document.getElementById("changelog");
        if (!container) return;

        try {
            const text = await loadText(`${RAW_BASE}/lastchange.json`);
            const data = parseChangelog(text);

            if (data.items.length === 0) throw new Error("Пустой список изменений");
            renderChangelog(data);
        } catch (error) {
            const meta = document.getElementById("changelog-meta");
            if (meta) meta.textContent = "Список изменений";

            container.replaceChildren(
                el("p", "muted", "Не удалось загрузить список изменений. Актуальную информацию можно посмотреть в репозитории WOTBO.")
            );
            container.setAttribute("aria-busy", "false");
            console.warn("WOTBO: не удалось загрузить изменения —", error);
        }
    }

    /* ---------------------------------------------------------------------
       Мобильное меню
       --------------------------------------------------------------------- */

    function initMenu() {
        const burger = document.querySelector(".burger");
        const nav = document.getElementById("nav");
        if (!burger || !nav) return;

        const close = () => {
            burger.setAttribute("aria-expanded", "false");
            burger.setAttribute("aria-label", "Открыть меню");
            nav.classList.remove("is-open");
            document.body.classList.remove("nav-open");
        };

        const open = () => {
            burger.setAttribute("aria-expanded", "true");
            burger.setAttribute("aria-label", "Закрыть меню");
            nav.classList.add("is-open");
            document.body.classList.add("nav-open");
        };

        burger.addEventListener("click", () => {
            if (burger.getAttribute("aria-expanded") === "true") {
                close();
            } else {
                open();
            }
        });

        nav.addEventListener("click", (event) => {
            if (event.target.closest("a")) close();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") close();
        });

        document.addEventListener("click", (event) => {
            if (!nav.classList.contains("is-open")) return;
            if (event.target.closest(".nav") || event.target.closest(".burger")) return;
            close();
        });

        window.matchMedia("(min-width: 901px)").addEventListener("change", (event) => {
            if (event.matches) close();
        });
    }

    /* ---------------------------------------------------------------------
       Шапка при скролле + активный пункт меню
       --------------------------------------------------------------------- */

    function initHeaderState() {
        const header = document.getElementById("header");
        if (!header) return;

        let ticking = false;

        const update = () => {
            header.classList.toggle("is-scrolled", window.scrollY > 8);
            ticking = false;
        };

        update();
        window.addEventListener("scroll", () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(update);
        }, { passive: true });
    }

    function initScrollSpy() {
        const links = Array.from(document.querySelectorAll(".nav__link"));
        if (!links.length || !("IntersectionObserver" in window)) return;

        const sections = links
            .map((link) => {
                const id = link.getAttribute("href");
                return id && id.startsWith("#") && id.length > 1
                    ? { link, section: document.querySelector(id) }
                    : null;
            })
            .filter((entry) => entry && entry.section);

        if (!sections.length) return;

        const setActive = (activeLink) => {
            for (const { link } of sections) {
                link.classList.toggle("is-active", link === activeLink);
            }
        };

        const observer = new IntersectionObserver((entries) => {
            const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

            if (!visible.length) return;

            const match = sections.find((entry) => entry.section === visible[0].target);
            if (match) setActive(match.link);
        }, {
            rootMargin: "-45% 0px -45% 0px",
            threshold: [0, 0.25, 0.5, 1]
        });

        for (const { section } of sections) observer.observe(section);
    }

    /* ---------------------------------------------------------------------
       Появление блоков
       --------------------------------------------------------------------- */

    function initReveal() {
        const items = document.querySelectorAll(".reveal");
        if (!items.length) return;

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (reduced || !("IntersectionObserver" in window)) {
            items.forEach((item) => item.classList.add("is-visible"));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });

        items.forEach((item) => observer.observe(item));
    }

    /* ---------------------------------------------------------------------
       Год в подвале
       --------------------------------------------------------------------- */

    function initYear() {
        const year = document.getElementById("year");
        if (year) year.textContent = String(new Date().getFullYear());
    }

    /* ---------------------------------------------------------------------
       Запуск
       --------------------------------------------------------------------- */

    function init() {
        initMenu();
        initHeaderState();
        initScrollSpy();
        initReveal();
        initYear();
        initVersion();
        initChangelog();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
