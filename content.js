(() => {
  // Ordered: more specific rules first. First match wins.
  const RULES = [
    ["firstName", /first.?name|given.?name|fname|forename/],
    ["lastName", /last.?name|family.?name|surname|lname/],
    ["fullName", /full.?name|your name|legal name|candidate name|applicant name|^name\b|\bname$/],
    ["email", /e.?mail/],
    ["phone", /phone|mobile|cell|telephone|\btel\b/],
    ["linkedin", /linkedin/],
    ["github", /github/],
    ["website", /website|portfolio|personal.?(site|page|url)|homepage/],
    ["zip", /zip|postal|post.?code/],
    ["city", /\bcity\b|town/],
    ["state", /\bstate\b|province|region/],
    ["country", /country|nationality/],
    ["address", /address|street/],
    ["gpa", /\bgpa\b|grade point/],
    ["gradYear", /graduat|grad.?(year|date)|expected/],
    ["school", /school|university|college|institution/],
    ["degree", /degree|qualification|education level/],
    ["major", /major|field of study|discipline|course of study/],
    ["skills", /skills|technologies|technical/],
    ["workAuth", /authori[sz]ed|authori[sz]ation|work eligib|legally (able|eligible)|sponsorship|right to work/],
    ["coverLetter", /cover.?letter|why (do you|are you|us|this)|motivation|interest in/],
    ["experience", /experience|projects|work history/],
    ["summary", /summary|about (you|yourself)|bio\b|tell us|additional information|anything else/]
  ];

  const norm = (s) => (s || "").toLowerCase().replace(/[_\-*:]+/g, " ").replace(/\s+/g, " ").trim();

  function labelText(el) {
    const parts = [];
    if (el.labels) [...el.labels].forEach((l) => parts.push(l.textContent));
    const lb = el.getAttribute("aria-labelledby");
    if (lb) lb.split(/\s+/).forEach((id) => { const n = document.getElementById(id); if (n) parts.push(n.textContent); });
    if (!parts.length) {
      const wrap = el.closest("label, .field, .form-group, [class*='field'], [class*='question'], fieldset, li, div");
      if (wrap) {
        const l = wrap.querySelector("label, legend, [class*='label']");
        if (l) parts.push(l.textContent);
      }
    }
    return parts.join(" ");
  }

  function signature(el) {
    return norm([
      el.name, el.id, el.placeholder, el.getAttribute("aria-label"),
      el.getAttribute("autocomplete"), el.getAttribute("data-qa"), labelText(el)
    ].join(" "));
  }

  function classify(el) {
    if (el.type === "email") return "email";
    if (el.type === "tel") return "phone";
    const sig = signature(el);
    if (!sig) return null;
    for (const [key, re] of RULES) if (re.test(sig)) return key;
    return null;
  }

  function valueFor(key, p) {
    if (key === "fullName") return [p.firstName, p.lastName].filter(Boolean).join(" ");
    if (key === "coverLetter") return p.coverLetter || p.summary || "";
    if (key === "summary") return p.summary || p.coverLetter || "";
    return p[key] || "";
  }

  function setNative(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function fillSelect(el, value) {
    const v = norm(value);
    if (!v) return false;
    const opts = [...el.options];
    const hit = opts.find((o) => norm(o.text) === v || norm(o.value) === v)
      || opts.find((o) => norm(o.text).includes(v) || (norm(o.text).length > 1 && v.includes(norm(o.text))));
    if (!hit) return false;
    setNative(el, hit.value);
    return true;
  }

  function b64ToFile(r) {
    const bin = atob(r.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], r.name, { type: r.type });
  }

  function attachResume(el, resume) {
    const sig = signature(el);
    if (/cover/.test(sig)) return false;
    if (el.files && el.files.length) return false;
    const dt = new DataTransfer();
    dt.items.add(b64ToFile(resume));
    el.files = dt.files;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function fill() {
    const { profile = {}, resume, overwrite = false } = await chrome.storage.local.get(["profile", "resume", "overwrite"]);
    let count = 0;
    const els = document.querySelectorAll("input, textarea, select");
    for (const el of els) {
      if (el.disabled || el.readOnly || el.type === "hidden" || el.offsetParent === null && el.type !== "file") continue;
      const type = (el.type || "").toLowerCase();
      if (["checkbox", "radio", "submit", "button", "password", "image", "reset"].includes(type)) continue;

      if (type === "file") {
        if (resume && /resume|cv|curriculum|upload|attach|file/.test(signature(el)) && attachResume(el, resume)) count++;
        continue;
      }

      const key = classify(el);
      if (!key) continue;
      const val = valueFor(key, profile);
      if (!val) continue;
      if (!overwrite && el.value && el.tagName !== "SELECT") continue;

      if (el.tagName === "SELECT") { if (fillSelect(el, val)) count++; }
      else { setNative(el, val); count++; }
    }
    if (count) chrome.runtime.sendMessage({ type: "FILLED", count });
    return count;
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg && msg.type === "FILL") { fill().then(() => sendResponse({ ok: true })); return true; }
  });
})();
