# Internship AutoFill (Chrome extension)

## Install
1. Unzip this folder.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `internship-autofill` folder.
4. Pin the extension from the puzzle-piece menu.

## Use
1. Open the extension popup, choose your resume (.pdf or .txt).
2. (Optional) paste an Anthropic API key so Claude can read your PDF and fill your profile. Without it, type your details manually.
3. Review the profile fields, click **Save**.
4. Open an internship application page and click **Fill this page**.
5. ALWAYS review every field before you submit. The extension never submits for you.

## Notes
- Text fields, textareas and dropdowns are filled. Radio buttons/checkboxes (e.g. EEO, "are you 18+") are intentionally left for you.
- Your resume attaches to file inputs that look like resume/CV uploads. Some sites block programmatic uploads — then attach manually.
- Everything is stored locally in your browser (chrome.storage.local). The only network call is to api.anthropic.com, and only when you click "Read resume" with a PDF and a key.
- Model name is set at the top of popup.js (MODEL).
