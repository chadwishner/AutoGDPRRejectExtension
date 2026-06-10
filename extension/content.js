// Auto GDPR Reject — content script.
//
// Strategy, in order of preference:
//   1. Click a known reject button of a recognized consent-management
//      platform (CMP) via a specific CSS selector.
//   2. Generic fallback: find a visible button/link whose label exactly
//      matches a known "reject" phrase (many languages), but only when it
//      sits inside something that looks like a consent banner, so we never
//      press "Decline" in an unrelated web app dialog.
//   3. Two-step banners: when no direct reject exists at all, click a
//      "Manage cookies"-style button to open the preferences layer, then
//      reject there — or, since GDPR requires optional categories to
//      default to OFF, save the untouched defaults ("Confirm my choices",
//      "Save preferences", ...) if no reject button shows up either.
//
// The script runs in every frame (some CMPs render inside an iframe),
// watches the DOM for late-loading banners, and retires itself after a
// while to stay cheap.

(() => {
    "use strict";

    if (window.__autoGdprRejectActive) {
        return;
    }
    window.__autoGdprRejectActive = true;

    const MAX_LIFETIME_MS = 30000;
    const MANAGED_LIFETIME_MS = 15000; // extension of life after opening settings
    const DEBOUNCE_MS = 400;
    const MAX_CLICKS = 4; // manage -> reject -> confirmation layers
    const MANAGE_AFTER_SCANS = 2; // give direct reject buttons a chance first
    const CONFIRM_GRACE_MS = 2000; // prefer "reject all" in the settings layer

    // --- 1. Known CMP reject buttons -----------------------------------

    const CMP_SELECTORS = [
        // OneTrust
        "#onetrust-reject-all-handler",
        ".ot-pc-refuse-all-handler",
        // Cookiebot
        "#CybotCookiebotDialogBodyButtonDecline",
        "#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll",
        // Didomi
        "#didomi-notice-disagree-button",
        ".didomi-continue-without-agreeing",
        // Usercentrics (lives in an open shadow root)
        "[data-testid='uc-deny-all-button']",
        // Complianz
        ".cmplz-deny",
        // Borlabs Cookie
        "[data-cookie-refuse]",
        // Osano
        ".osano-cm-denyAll",
        ".osano-cm-button--type_denyAll",
        // CookieYes / Cookie-Law-Info
        ".cky-btn-reject",
        "[data-cky-tag='reject-button']",
        // tarteaucitron.js
        "#tarteaucitronAllDenied2",
        // Klaro
        ".klaro .cm-btn-decline",
        ".klaro .cn-decline",
        // iubenda
        ".iubenda-cs-reject-btn",
        // HubSpot
        "#hs-eu-decline-button",
        // Civic UK Cookie Control
        "#ccc-notify-reject",
        "#ccc-reject-settings",
        // consentmanager.net
        ".cmpboxbtnno",
        // Termly
        "[data-tid='banner-decline']",
        // TrustArc (in-page banner variant)
        "#truste-consent-required",
        // Sourcepoint (ft.com et al.) — choice type 13 is "Reject All"
        ".sp_choice_type_13"
    ];

    // CMP buttons that open the preferences/settings layer. Only used when
    // no direct reject button exists anywhere (stage 3).
    const CMP_MANAGE_SELECTORS = [
        // OneTrust "Cookies Settings"
        "#onetrust-pc-btn-handler",
        // Didomi "Learn more"
        "#didomi-notice-learn-more-button",
        // consentmanager.net "Customize"
        ".cmpboxbtncustom",
        // Sourcepoint "Manage Cookies" / show privacy manager
        ".sp_choice_type_12"
    ];

    // CMP buttons that save the (default-off) selection in the settings
    // layer.
    const CMP_CONFIRM_SELECTORS = [
        // OneTrust preference center "Confirm My Choices"
        ".save-preference-btn-handler",
        // Sourcepoint privacy manager "Save & Exit"
        ".sp_choice_type_SE"
    ];

    // --- 2. Generic text matching ---------------------------------------

    // Labels are compared after lowercasing and collapsing whitespace and
    // trailing punctuation, and must match EXACTLY (not substring), which
    // keeps false positives out.
    const REJECT_PHRASES = new Set([
        // English
        "reject all", "reject all cookies", "reject cookies", "reject",
        "reject additional cookies", "reject optional cookies",
        "decline", "decline all", "decline cookies", "decline optional cookies",
        "deny", "deny all", "refuse", "refuse all", "refuse all cookies",
        "i do not accept", "do not accept", "disagree", "i disagree",
        "continue without accepting", "continue without agreeing",
        "use necessary cookies only", "necessary cookies only",
        "only necessary", "only necessary cookies",
        "only essential", "essential cookies only", "only essential cookies",
        "use essential cookies only", "accept necessary",
        "accept only necessary", "accept only essential cookies",
        "strictly necessary only", "strictly necessary cookies only",
        "allow necessary cookies", "disable all", "object to all",
        "block all", "disallow all", "turn off all",
        // German
        "alle ablehnen", "ablehnen", "alles ablehnen", "cookies ablehnen",
        "alle cookies ablehnen", "nur notwendige", "nur notwendige cookies",
        "nur erforderliche cookies", "nur notwendige cookies akzeptieren",
        "weiter ohne zustimmung", "ohne zustimmung fortfahren",
        "nicht zustimmen", "nicht akzeptieren", "alle deaktivieren",
        // French
        "tout refuser", "refuser", "refuser tout", "tout rejeter",
        "refuser les cookies", "refuser tous les cookies",
        "continuer sans accepter", "je refuse",
        // Spanish
        "rechazar todo", "rechazar", "rechazar todas", "rechazarlas todas",
        "rechazar cookies", "continuar sin aceptar",
        "solo cookies necesarias", "usar solo las cookies necesarias",
        // Italian
        "rifiuta tutto", "rifiuta", "rifiuta tutti", "rifiuta tutti i cookie",
        "continua senza accettare", "solo cookie necessari",
        // Dutch
        "alles weigeren", "weigeren", "alle cookies weigeren",
        "alleen noodzakelijke cookies", "doorgaan zonder te accepteren",
        "niet akkoord",
        // Portuguese
        "rejeitar tudo", "rejeitar", "rejeitar todos", "recusar",
        "recusar tudo", "continuar sem aceitar",
        // Polish
        "odrzuć wszystkie", "odrzuć", "odrzuć wszystko", "nie zgadzam się",
        // Scandinavian
        "avvisa alla", "neka alla", "avböj alla", "endast nödvändiga",
        "afvis alle", "kun nødvendige", "avvis alle",
        // Finnish
        "hylkää kaikki", "vain välttämättömät",
        // Czech / Slovak
        "odmítnout vše", "odmítnout", "odmietnuť všetko",
        // Hungarian
        "összes elutasítása", "elutasítás", "elutasítom", "mindet elutasítom",
        // Romanian
        "respinge tot", "refuz",
        // Greek
        "απόρριψη όλων",
        // Turkish
        "tümünü reddet", "reddet",
        // Russian / Ukrainian
        "отклонить все", "отклонить", "відхилити всі",
        // Croatian / Serbian / Bulgarian
        "odbij sve", "отхвърляне на всички",
        // Catalan
        "rebutjar-ho tot", "rebutja-ho tot",
        // CJK
        "すべて拒否", "拒否する", "모두 거부", "全部拒绝", "拒绝全部", "拒绝所有"
    ]);

    // "Open the cookie settings" buttons (stage 3). Only clicked when no
    // reject button exists anywhere on the page.
    const MANAGE_PHRASES = new Set([
        // English
        "manage cookies", "manage cookie settings", "manage preferences",
        "manage my preferences", "manage options", "manage settings",
        "manage choices", "manage my choices", "manage consent",
        "cookie settings", "cookies settings", "cookie preferences",
        "cookie options", "more options", "more choices",
        "customize", "customise", "customize settings", "customise settings",
        "customize cookies", "customise cookies", "let me choose",
        "privacy options", "privacy settings", "manage privacy settings",
        "options", "settings", "preferences", "personalize my choices",
        // German
        "cookies verwalten", "einstellungen verwalten", "cookie-einstellungen",
        "einstellungen", "optionen verwalten", "optionen", "anpassen",
        "auswahl treffen", "einstellungen ändern", "mehr optionen",
        "präferenzen verwalten", "zwecke anzeigen",
        // French
        "gérer les cookies", "gérer les préférences", "gérer mes choix",
        "paramétrer les cookies", "paramètres des cookies", "personnaliser",
        "plus d'options", "paramètres",
        // Spanish
        "gestionar cookies", "configurar cookies", "administrar cookies",
        "personalizar", "configuración de cookies", "más opciones",
        "opciones", "configurar",
        // Italian
        "gestisci le preferenze", "gestisci i cookie", "personalizza",
        "impostazioni dei cookie", "più opzioni", "impostazioni",
        // Dutch
        "cookies beheren", "instellingen beheren", "voorkeuren beheren",
        "aanpassen", "cookie-instellingen", "meer opties", "instellingen",
        // Portuguese
        "gerir cookies", "gerenciar cookies", "definições de cookies",
        "configurações de cookies", "mais opções",
        // Polish
        "zarządzaj plikami cookie", "ustawienia plików cookie", "dostosuj",
        "więcej opcji", "ustawienia",
        // Scandinavian
        "hantera cookies", "inställningar", "administrer cookies",
        "indstillinger", "tilpass", "innstillinger"
    ]);

    // "Save the (default-off) selection" buttons. Only clicked in the
    // settings layer (after a manage click), and only after giving a
    // "reject all" button CONFIRM_GRACE_MS to appear.
    const CONFIRM_PHRASES = new Set([
        // English
        "confirm my choices", "confirm choices", "confirm your choices",
        "save preferences", "save my preferences", "save settings",
        "save and exit", "save & exit", "save choices", "save my choices",
        "save current settings", "submit preferences", "save and close",
        "confirm", "save",
        // German
        "auswahl bestätigen", "einstellungen speichern", "auswahl speichern",
        "speichern", "bestätigen", "speichern und schließen",
        "speichern & schließen",
        // French
        "enregistrer", "enregistrer les préférences", "confirmer mes choix",
        "valider mes choix", "enregistrer et fermer", "valider",
        // Spanish
        "guardar configuración", "guardar preferencias",
        "confirmar mis opciones", "confirmar selección", "guardar",
        "confirmar",
        // Italian
        "salva impostazioni", "salva preferenze", "conferma le mie scelte",
        "salva", "conferma",
        // Dutch
        "voorkeuren opslaan", "instellingen opslaan", "opslaan",
        "bevestigen", "opslaan en sluiten",
        // Portuguese
        "guardar preferências", "salvar preferências", "guardar", "salvar",
        // Polish
        "zapisz ustawienia", "zapisz i zamknij", "potwierdź", "zapisz",
        // Scandinavian
        "spara inställningar", "gem indstillinger", "lagre innstillinger",
        "spara", "bekräfta"
    ]);

    // A generic match only counts when the button lives inside an element
    // (or frame) that smells like a consent banner.
    const BANNER_HINT = /(cookie|consent|gdpr|privacy|cmp|qc-cmp|didomi|onetrust|usercentrics|sourcepoint|sp_message|trustarc|cookiebot|quantcast|notice|banner)/i;

    const state = {
        stage: "direct", // "direct" -> "managed" after opening settings
        managedAt: 0,
        scansWithoutReject: 0,
        clicks: 0,
        done: false,
        observer: null,
        timer: null,
        deadline: null,
        clicked: new WeakSet()
    };

    function normalize(text) {
        return (text || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase()
            .replace(/[\s!.…✕×→›>«»]+$/g, "")
            .trim();
    }

    function isVisible(el) {
        if (!el || !el.isConnected) {
            return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
            return false;
        }
        const style = el.ownerDocument.defaultView.getComputedStyle(el);
        return style.display !== "none" &&
            style.visibility !== "hidden" &&
            parseFloat(style.opacity || "1") > 0.05;
    }

    function frameLooksLikeConsent() {
        if (window === window.top) {
            return false;
        }
        try {
            return BANNER_HINT.test(window.location.href) ||
                BANNER_HINT.test(window.name || "");
        } catch {
            return false;
        }
    }

    function elementHint(el) {
        let hint = (el.id || "") + " " + (typeof el.className === "string" ? el.className : "");
        for (const attr of ["data-testid", "aria-label", "data-tid"]) {
            hint += " " + (el.getAttribute(attr) || "");
        }
        return hint;
    }

    function inBannerContext(el) {
        if (frameLooksLikeConsent()) {
            return true;
        }
        let node = el;
        for (let depth = 0; node && depth < 12; depth++) {
            if (node.nodeType === Node.ELEMENT_NODE && BANNER_HINT.test(elementHint(node))) {
                return true;
            }
            // Hop out of shadow roots too.
            node = node.parentNode || node.host || null;
            if (node && node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                node = node.host;
            }
        }
        return false;
    }

    // Collects document plus every open shadow root (Usercentrics et al.).
    function collectRoots(root, out, depth) {
        if (depth > 6) {
            return;
        }
        out.push(root);
        let elements;
        try {
            elements = root.querySelectorAll("*");
        } catch {
            return;
        }
        for (const el of elements) {
            if (el.shadowRoot) {
                collectRoots(el.shadowRoot, out, depth + 1);
            }
        }
    }

    function buttonLabel(el) {
        const parts = [
            el.textContent,
            el.value,
            el.getAttribute("aria-label"),
            el.getAttribute("title")
        ];
        for (const part of parts) {
            const label = normalize(part);
            if (label) {
                return label;
            }
        }
        return "";
    }

    function findBySelectors(roots, selectors) {
        for (const root of roots) {
            for (const selector of selectors) {
                let el;
                try {
                    el = root.querySelector(selector);
                } catch {
                    continue;
                }
                if (el && !state.clicked.has(el) && isVisible(el)) {
                    return el;
                }
            }
        }
        return null;
    }

    // Preference toggles are the signature of a settings layer; first-layer
    // banners never have them.
    function hasConsentToggles(roots) {
        for (const root of roots) {
            try {
                if (root.querySelector(
                    "input[type='checkbox'], [role='switch'], [aria-checked]"
                )) {
                    return true;
                }
            } catch {
                continue;
            }
        }
        return false;
    }

    function findByPhrases(roots, phrases) {
        for (const root of roots) {
            let candidates;
            try {
                candidates = root.querySelectorAll(
                    "button, a, [role='button'], input[type='button'], input[type='submit']"
                );
            } catch {
                continue;
            }
            for (const el of candidates) {
                if (state.clicked.has(el) || !phrases.has(buttonLabel(el))) {
                    continue;
                }
                if (isVisible(el) && inBannerContext(el)) {
                    return el;
                }
            }
        }
        return null;
    }

    function click(el) {
        state.clicks++;
        state.clicked.add(el);
        try {
            el.click();
        } catch {
            return;
        }
        if (state.clicks >= MAX_CLICKS) {
            shutdown();
        }
    }

    function findAndReject() {
        if (state.done) {
            return;
        }
        const roots = [];
        collectRoots(document, roots, 0);

        // Direct reject — also covers the settings layer, which usually has
        // its own "Reject all".
        const reject = findBySelectors(roots, CMP_SELECTORS) ||
            findByPhrases(roots, REJECT_PHRASES);
        if (reject) {
            click(reject);
            return;
        }

        // Some CMPs (e.g. Sourcepoint on ft.com) open the settings layer in
        // a NEW iframe, where this script starts over with no memory of the
        // manage click. A consent frame full of preference toggles can only
        // be a settings layer, so treat it as one.
        const inSettingsLayer = state.stage === "managed" ||
            (frameLooksLikeConsent() && hasConsentToggles(roots));

        if (inSettingsLayer) {
            if (!state.managedAt) {
                state.managedAt = Date.now();
                extendLifetime(MANAGED_LIFETIME_MS);
            }
            // Settings layer is open but has no reject button (yet). After a
            // grace period, save the defaults: GDPR requires optional
            // categories to start out OFF, so saving equals rejecting.
            if (Date.now() - state.managedAt >= CONFIRM_GRACE_MS) {
                const confirm = findBySelectors(roots, CMP_CONFIRM_SELECTORS) ||
                    findByPhrases(roots, CONFIRM_PHRASES);
                if (confirm) {
                    click(confirm);
                    return;
                }
            }
            // The layer may render or settle without further mutations, so
            // keep polling until the deadline.
            scheduleCheck();
            return;
        }

        // No reject button anywhere. Give late-loading direct buttons a few
        // scans, then open the "Manage cookies" layer.
        state.scansWithoutReject++;
        if (state.scansWithoutReject < MANAGE_AFTER_SCANS) {
            return;
        }
        const manage = findBySelectors(roots, CMP_MANAGE_SELECTORS) ||
            findByPhrases(roots, MANAGE_PHRASES);
        if (manage) {
            state.stage = "managed";
            state.managedAt = Date.now();
            extendLifetime(MANAGED_LIFETIME_MS);
            click(manage);
            scheduleCheck();
        }
    }

    function shutdown() {
        state.done = true;
        if (state.observer) {
            state.observer.disconnect();
            state.observer = null;
        }
    }

    function extendLifetime(ms) {
        clearTimeout(state.deadline);
        state.deadline = setTimeout(shutdown, ms);
    }

    function scheduleCheck() {
        if (state.done || state.timer) {
            return;
        }
        state.timer = setTimeout(() => {
            state.timer = null;
            findAndReject();
        }, DEBOUNCE_MS);
    }

    findAndReject();

    state.observer = new MutationObserver(scheduleCheck);
    state.observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // Static pages produce no mutations; make sure the manage fallback still
    // gets its second scan.
    setTimeout(findAndReject, 1500);
    setTimeout(findAndReject, 3500);

    state.deadline = setTimeout(shutdown, MAX_LIFETIME_MS);
})();
