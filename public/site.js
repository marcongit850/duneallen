(function () {
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.classList.add("js");
  }
  var config = window.SITE_CONFIG || {
    DONATE_URL: "",
    HERO_VIDEO: "",
    HERO_VIDEO_WEBM: "",
  };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var shareUrl = "https://friendsofduneallen.com/";
  var shareText =
    "Help preserve the Allen family legacy. Learn about the Dune Allen beach case and how to support the legal effort.";

  initDonate(config.DONATE_URL || "");
  initNav();
  initHero(config);
  initShare();
  initForm();
  initReveal();
  initSectionSpy();

  function initDonate(rawUrl) {
    var donateUrl = String(rawUrl).trim();
    var links = document.querySelectorAll("[data-donate]");
    var notes = document.querySelectorAll("[data-donate-pending]");
    if (!donateUrl) {
      notes.forEach(function (note) {
        note.hidden = false;
      });
      return;
    }
    links.forEach(function (link) {
      link.setAttribute("href", donateUrl);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });
    notes.forEach(function (note) {
      note.hidden = true;
    });
  }

  function initNav() {
    var header = document.querySelector(".site-header");
    var toggle = document.querySelector(".menu-toggle");
    var panel = document.querySelector("#site-nav");
    if (!header || !toggle || !panel) return;

    function closeMenu() {
      panel.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-open");
    }

    function openMenu() {
      panel.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("nav-open");
    }

    toggle.addEventListener("click", function () {
      if (panel.classList.contains("is-open")) closeMenu();
      else openMenu();
    });

    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });

    window.addEventListener(
      "scroll",
      function () {
        header.classList.toggle("is-stuck", window.scrollY > 8);
      },
      { passive: true },
    );
  }

  function initHero(siteConfig) {
    var video = document.querySelector("#hero-video");
    var src = String(siteConfig.HERO_VIDEO || "").trim();
    var webm = String(siteConfig.HERO_VIDEO_WEBM || "").trim();
    if (!video || !src || reduceMotion) return;

    if (webm) {
      var webmSource = document.createElement("source");
      webmSource.src = webm;
      webmSource.type = "video/webm";
      video.appendChild(webmSource);
    }
    var mp4Source = document.createElement("source");
    mp4Source.src = src;
    mp4Source.type = "video/mp4";
    video.appendChild(mp4Source);

    function showStill() {
      video.hidden = true;
    }

    video.addEventListener("error", showStill, true);
    video.hidden = false;
    var playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(showStill);
    }
  }

  function initShare() {
    var copyButton = document.querySelector("[data-copy-link]");
    var status = document.querySelector("#share-status");
    if (!copyButton || !status) return;

    copyButton.addEventListener("click", function () {
      var done = function () {
        status.textContent = "Link copied.";
      };
      var fallback = function () {
        status.textContent = shareUrl;
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(done).catch(fallback);
      } else {
        fallback();
      }
    });
  }

  function initForm() {
    var form = document.querySelector("#contact-form");
    var status = document.querySelector("#form-status");
    if (!form || !status) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var submit = form.querySelector("[type='submit']");
      var payload = {
        name: valueOf("name"),
        email: valueOf("email"),
        phone: valueOf("phone"),
        message: valueOf("message"),
        company_website: valueOf("company_website"),
      };

      status.textContent = "";
      status.className = "form-status";
      if (submit) submit.disabled = true;

      fetch("/api/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          var message =
            (result.data && result.data.message) ||
            (result.ok
              ? "Thank you. Your message is on its way."
              : "We could not send that just now. Please try again in a few minutes.");
          status.textContent = message;
          status.className = result.ok ? "form-status is-success" : "form-status is-error";
          if (result.ok) form.reset();
        })
        .catch(function () {
          status.textContent = "We could not send that just now. Please try again in a few minutes.";
          status.className = "form-status is-error";
        })
        .finally(function () {
          if (submit) submit.disabled = false;
        });
    });

    function valueOf(name) {
      var field = form.elements.namedItem(name);
      return field && "value" in field ? field.value : "";
    }
  }

  function initReveal() {
    if (reduceMotion) return;
    var nodes = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(function (node) {
        node.classList.add("is-in");
      });
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14 },
    );
    nodes.forEach(function (node) {
      observer.observe(node);
    });
  }

  function initSectionSpy() {
    var links = document.querySelectorAll("#site-nav a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var byId = {};
    links.forEach(function (link) {
      byId[link.getAttribute("href").slice(1)] = link;
    });
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = byId[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) observer.observe(section);
    });
  }
})();
