(function () {
  var root = document.documentElement;
  root.classList.add("js");

  var config = window.FRIENDS_CONFIG || {};
  var donateUrl = safeHttpUrl(config.DONATE_URL);
  var soon = document.getElementById("donate-soon");
  var donateLinks = document.querySelectorAll("[data-donate]");

  donateLinks.forEach(function (link) {
    if (donateUrl) {
      link.setAttribute("href", donateUrl);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    } else {
      link.setAttribute("href", "#help");
      link.removeAttribute("target");
    }
  });
  if (soon) soon.hidden = Boolean(donateUrl);

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      setNav(!open);
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setNav(false);
      });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setNav(false);
    });
  }

  function setNav(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
  }

  var copyButton = document.querySelector("[data-share='copy']");
  var shareStatus = document.getElementById("share-status");
  if (copyButton) {
    copyButton.addEventListener("click", function () {
      var url = "https://friendsofduneallen.com/";
      copyText(url).then(function (ok) {
        if (!shareStatus) return;
        shareStatus.textContent = ok ? "Link copied." : "Copy the address from the browser bar.";
      });
    });
  }

  var form = document.getElementById("contact-form");
  var formStatus = document.getElementById("form-status");
  var started = document.getElementById("startedAt");
  if (started) started.value = String(Date.now());
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submitForm(form, formStatus);
    });
  }

  var revealNodes = document.querySelectorAll(".reveal");
  if (revealNodes.length && "IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealNodes.forEach(function (node) { observer.observe(node); });
  } else {
    revealNodes.forEach(function (node) { node.classList.add("is-in"); });
  }
})();

function safeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    var url = new URL(value.trim());
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch (error) {
    return "";
  }
  return "";
}

function copyText(value) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(value).then(function () { return true; }).catch(function () {
      return copyFallback(value);
    });
  }
  return Promise.resolve(copyFallback(value));
}

function copyFallback(value) {
  var field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.left = "-999px";
  document.body.appendChild(field);
  field.select();
  var ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (error) {
    ok = false;
  }
  document.body.removeChild(field);
  return ok;
}

function submitForm(form, status) {
  var button = form.querySelector("[type='submit']");
  var data = {
    name: fieldValue(form, "name"),
    email: fieldValue(form, "email"),
    phone: fieldValue(form, "phone"),
    message: fieldValue(form, "message"),
    fax_number: fieldValue(form, "fax_number"),
    startedAt: fieldValue(form, "startedAt")
  };
  clearErrors(form);
  var missing = [];
  if (!data.name) missing.push("name");
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) missing.push("email");
  if (!data.message) missing.push("message");
  if (missing.length) {
    showErrors(form, missing);
    setStatus(status, "Please check the highlighted fields and try again.", true);
    return;
  }

  if (button) button.disabled = true;
  setStatus(status, "Sending your message.", false);

  fetch("/api/contact", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json"
    },
    body: JSON.stringify(data)
  }).then(function (response) {
    return response.json().then(function (body) {
      return { ok: response.ok, body: body };
    }).catch(function () {
      return { ok: false, body: {} };
    });
  }).then(function (result) {
    if (result.ok && result.body && result.body.ok) {
      form.reset();
      var started = document.getElementById("startedAt");
      if (started) started.value = String(Date.now() - 5000);
      setStatus(status, "Thank you. Your message has been sent.", false);
      return;
    }
    var body = result.body || {};
    if (body.fields) showErrors(form, body.fields);
    setStatus(status, body.message || "We could not send your message just now. Please try again in a few minutes.", true);
  }).catch(function () {
    setStatus(status, "We could not send your message just now. Please try again in a few minutes.", true);
  }).then(function () {
    if (button) button.disabled = false;
  });
}

function fieldValue(form, name) {
  var input = form.elements.namedItem(name);
  if (!input || typeof input.value !== "string") return "";
  return input.value;
}

function clearErrors(form) {
  form.querySelectorAll("[aria-invalid='true']").forEach(function (input) {
    input.removeAttribute("aria-invalid");
  });
  form.querySelectorAll(".field-error").forEach(function (node) {
    node.hidden = true;
  });
}

function showErrors(form, fields) {
  fields.forEach(function (name) {
    var input = form.elements.namedItem(name);
    if (!input) return;
    input.setAttribute("aria-invalid", "true");
    var error = document.getElementById(name + "-error");
    if (error) error.hidden = false;
  });
  var first = form.elements.namedItem(fields[0]);
  if (first && typeof first.focus === "function") first.focus();
}

function setStatus(node, message, isError) {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("is-error", Boolean(isError));
}
