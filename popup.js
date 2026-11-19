const MODEL = "claude-sonnet-5-5"; // change if you prefer another model

const FIELDS = [
  ["firstName", "First name"], ["lastName", "Last name"],
  ["email", "Email"], ["phone", "Phone"],
  ["address", "Street address"], ["city", "City"],
  ["state", "State / Province"], ["zip", "Zip / Postal code"],
  ["country", "Country"], ["linkedin", "LinkedIn URL"],
  ["github", "GitHub URL"], ["website", "Portfolio / Website"],
  ["school", "University"], ["degree", "Degree (e.g. Bachelor of Science)"],
  ["major", "Major / Field of study"], ["gpa", "GPA"],
  ["gradYear", "Graduation date / year"], ["skills", "Skills (comma separated)", "area"],
  ["workAuth", "Work authorization (e.g. Yes, authorized)"], ["experience", "Experience summary", "area"],
  ["summary", "Short bio / summary", "area"], ["coverLetter", "Cover letter / 'Why this company' text", "area"]
];

const $ = (id) => document.getElementById(id);
const status = (t) => ($("status").textContent = t);

function buildForm() {
  const box = $("fields");
  let rowDiv = null;
  FIELDS.forEach(([key, label, type]) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<label for="f_${key}">${label}</label>` +
      (type === "area" ? `<textarea id="f_${key}"></textarea>` : `<input type="text" id="f_${key}">`);
    if (type === "area") { rowDiv = null; box.appendChild(wrap); }
    else {
      if (!rowDiv) { rowDiv = document.createElement("div"); rowDiv.className = "row"; box.appendChild(rowDiv); }
      rowDiv.appendChild(wrap);
      if (rowDiv.children.length === 2) rowDiv = null;
    }
  });
}

function readForm() {
  const p = {};
  FIELDS.forEach(([k]) => (p[k] = $("f_" + k).value.trim()));
  return p;
}
function writeForm(p) {
  FIELDS.forEach(([k]) => { if (p[k] != null) $("f_" + k).value = p[k]; });
}

async function load() {
  const { profile = {}, resume, apiKey = "", overwrite = false } = await chrome.storage.local.get(["profile", "resume", "apiKey", "overwrite"]);
  writeForm(profile);
  $("apiKey").value = apiKey;
  $("overwrite").checked = overwrite;
  if (resume) $("resumeInfo").textContent = `Saved resume: ${resume.name}`;
}

async function save(silent) {
  await chrome.storage.local.set({
    profile: readForm(),
    apiKey: $("apiKey").value.trim(),
    overwrite: $("overwrite").checked
  });
  if (!silent) status("Saved.");
}

const toDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(file);
});

function parseTextLocally(text) {
  const p = {};
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const phone = text.match(/(\+?\d[\d\s().-]{8,}\d)/);
  const li = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s,;)]+/i);
  const gh = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s,;)]+/i);
  if (email) p.email = email[0];
  if (phone) p.phone = phone[1].trim();
  if (li) p.linkedin = li[0];
  if (gh) p.github = gh[0];
  const first = text.split("\n").map((l) => l.trim()).find(Boolean) || "";
  if (/^[A-Za-z.'-]+(\s+[A-Za-z.'-]+){1,3}$/.test(first)) {
    const parts = first.split(/\s+/);
    p.firstName = parts[0];
    p.lastName = parts.slice(1).join(" ");
  }
  const sk = text.match(/skills?\s*[:\-]\s*(.+)/i);
  if (sk) p.skills = sk[1].trim();
  return p;
}

async function parseWithClaude(apiKey, base64Pdf) {
  const keys = FIELDS.map(([k]) => k).join(", ");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Pdf } },
          { type: "text", text:
            `Extract this resume into a JSON object with exactly these keys: ${keys}. ` +
            `Use "" for anything not in the resume. gradYear = expected or actual graduation (e.g. "May 2027"). ` +
            `experience = 2-4 sentence summary of work/projects. summary = 2 sentence professional bio. ` +
            `coverLetter = a short, generic, 120-word internship cover letter paragraph written in first person from the resume (no company name). ` +
            `workAuth = "" unless stated. Return ONLY the JSON, no markdown.` }
        ]
      }]
    })
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

async function importResume() {
  const file = $("resumeFile").files[0];
  if (!file) return status("Choose a resume file first (.pdf or .txt).");
  status("Reading resume...");
  try {
    const dataUrl = await toDataUrl(file);
    const base64 = dataUrl.split(",")[1];
    const type = file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "text/plain");
    await chrome.storage.local.set({ resume: { name: file.name, type, data: base64 } });
    $("resumeInfo").textContent = `Saved resume: ${file.name}`;

    let parsed = {};
    const key = $("apiKey").value.trim();
    if (type === "application/pdf") {
      if (!key) { await save(true); return status("Resume saved for attaching. Add an API key to auto-read the PDF, or type your details below."); }
      parsed = await parseWithClaude(key, base64);
    } else {
      parsed = parseTextLocally(await file.text());
    }
    const current = readForm();
    FIELDS.forEach(([k]) => { if (parsed[k] && !current[k]) current[k] = String(parsed[k]); });
    writeForm(current);
    await save(true);
    status("Profile filled from resume. Review it, then click Save.");
  } catch (e) {
    status("Error: " + e.message);
  }
}

async function fillPage() {
  await save(true);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  let total = 0;
  const listener = (msg) => { if (msg && msg.type === "FILLED") { total += msg.count; status(`Filled ${total} field(s). Review before submitting!`); } };
  chrome.runtime.onMessage.addListener(listener);
  status("Filling...");
  try { await chrome.tabs.sendMessage(tab.id, { type: "FILL" }); }
  catch (e) { status("Couldn't reach this page. Reload the tab and try again (extension pages and chrome:// aren't supported)."); return; }
  setTimeout(() => { chrome.runtime.onMessage.removeListener(listener); if (total === 0) status("No matching fields found on this page."); }, 1500);
}

buildForm();
load();
$("saveBtn").onclick = () => save();
$("importBtn").onclick = importResume;
$("fillBtn").onclick = fillPage;
