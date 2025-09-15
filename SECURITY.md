# Security Policy

This document describes how we handle security for the JP-Bilpleie app that collects job details and photos, generates PDFs, and uploads them to Google Drive.

---

## Supported Versions

We ship security fixes for actively maintained releases only.

| Version / Branch | Status              | Notes                                        |
|------------------|---------------------|----------------------------------------------|
| `main` (latest)  | ✅ Supported        | Continuous delivery; all users get fixes     |
| `1.x`            | ✅ Supported        | Critical fixes only                          |
| `< 1.0`          | ❌ Not supported    | Please upgrade to the latest release         |

> If you run a forked/modified build, please re-base onto `main` to receive patches quickly.

---

## Reporting a Vulnerability

**Please do not open public issues.**  
Report privately via one of the following:

- GitHub → timijs7/JP-Bilpleie-APP

When reporting, include (if possible):

- A clear description and **impact** (what data/behavior is affected)
- **Steps to reproduce** or a working PoC
- Affected **URL(s)/endpoint(s)** (e.g., the Apps Script `/exec`)
- **Version/commit**, browser/OS, and any logs/screenshots
- Your suggested **CVSS** score or severity (Low/Med/High/Critical)

We will:
1. **Acknowledge** your report within **3 business days**.
2. Provide a **status update at least every 7 days** while triaging/fixing.
3. Aim to **fix Critical/High issues within 30–60 days** and Medium/Low as scheduled.
4. Coordinate a **responsible disclosure** timeline (default: up to **90 days**), and credit you in release notes unless you prefer to remain anonymous. No bug bounty at this time.

---

## Responsible Disclosure / Safe Harbor

We support good-faith research. Provided you act responsibly and within the guidelines below, we will not pursue legal action:

- Do **not** access or modify data that doesn’t belong to you.
- Avoid actions that degrade service (no DoS/stress tests).
- No social engineering, phishing, or physical attacks.
- Use test data where possible; **never** exfiltrate personal photos/PII.
- Give us **reasonable time** to fix before public disclosure.

If in doubt, ask us first at **timijs7/JP-Bilpleie-APP**.

---

## Data Security & Privacy

- **Transport:** All network traffic must use **HTTPS**.
- **Local (device):** Drafts/PDFs queued offline are saved in **IndexedDB** on the device until sent. This storage is **not additionally encrypted by the app**; rely on device OS encryption/lock screen and advise users not to share devices.
- **Minimization:** We only collect data necessary to create the work report and photos the user attaches.
- **Deletion:** Remove queued items once uploaded; users may clear site data to purge local storage.
- 
---

## Dependencies & Secrets

- Do **not** embed secrets/API keys in client-side code.
- Keep dependencies up-to-date; monitor advisories for:
  - `jspdf`, `html2canvas`, `heic2any`
- The Apps Script endpoint should validate inputs and enforce size/type limits.

---

## Vulnerability Classes We Care About

- XSS (DOM, template, injection into generated PDFs)
- CSRF / request forgery to the Apps Script endpoint
- Authentication/authorization bypass (if you later add auth)
- Sensitive data exposure (public file sharing, mis-scoped Drive folders)
- Logic/validation flaws in upload/queue/flush workflows
- Supply-chain issues in third-party libraries

**Out of scope examples**
- DoS/volumetric attacks, rate-limiting tests
- Reports requiring root/jailbreak or outdated browsers
- Self-XSS requiring user to paste code in the console

---

## Coordinated Disclosure

By reporting responsibly and allowing us time to remediate, you help keep users safe. We will credit researchers in release notes (with consent) once a fix is shipped.

Thank you for helping keep JP-Bilpleie secure.
