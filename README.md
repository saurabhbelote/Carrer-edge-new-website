# EdgeCareer Website

Welcome to the **EdgeCareer** landing page repository! This is a modern, responsive, and professionally designed static website built to help professionals transition their careers through expert coaching, proven strategies, and guaranteed results.

## 🚀 Live Demo
*(You can add your live deployment URL here once hosted on Vercel, Netlify, or GitHub Pages)*

## 🛠️ Technology Stack
This project is built using a lightweight and fast tech stack with no heavy dependencies:
- **HTML5:** Semantic and accessible page structure.
- **Tailwind CSS:** Utility-first CSS framework (imported via CDN) for rapid UI development and responsive design.
- **Vanilla JavaScript:** Minimal footprint script for scroll animations and intersection observers.
- **Custom CSS Animations:** Custom `@keyframes` used for floating UI elements, glassmorphism effects, and smooth transitions.

## 📂 Project Structure
The website consists of 5 main pages, all interlinked with a unified header and footer layout:
- \`index.html\` - The main landing page / Home.
- \`about.html\` - Information about EdgeCareer's mission and team.
- \`career-paths.html\` - Details on specific career transition strategies.
- \`testimonials.html\` - Success stories from past professionals.
- \`contact.html\` - Contact information and links to official social media (LinkedIn, Instagram).
- \`assets/\` - Directory containing all images, icons, and logos.
- \`assets/js/\` - Payments and newsletter scripts (see below).

## 💳 Payments & Newsletter
"Buy Now" / "Book Now" buttons, "Connect with an Expert" buttons and the footer newsletter forms talk to the **edgecareerApi** backend (separate repo: \`edgecareer-api\`).

- \`assets/js/config.js\` - Where the API lives (production Cloud Function, or \`http://localhost:8080\` when the site is opened from localhost).
- \`assets/js/payments.js\` - \`openRazorpay('plan-id')\`: collects name/email/phone, asks the server to create the Razorpay order, opens Razorpay Checkout, and has the server verify the payment.
  - On the resume plans ("Buy Now") the form also has an optional resume upload (PDF, DOC, DOCX, ODT, RTF or TXT, max 5 MB).
  - If a file is chosen, it is uploaded for the new order before Checkout opens. Checkout and verification are unchanged.
  - Career-path plans ("Book Now") have no resume field.
- \`assets/js/newsletter.js\` - Saves emails from every \`<form data-newsletter>\`.
- \`assets/js/expert-request.js\` - \`openExpertRequest('plan-id')\`: the "Connect with an Expert" form on the resume plan cards.
  - It collects name, email, phone and one resume file (PDF, DOC, DOCX, ODT, RTF or TXT, max 5 MB) and uploads them to the server.
  - The server checks everything again, stores the resume privately, and the request appears in the admin dashboard's Expert Requests tab.
  - It is independent of \`payments.js\`; no payment is involved.
- \`assets/js/analytics.js\` - Anonymous page-view and Book Now counters for the private admin dashboard.
  - No cookies and no personal data: it sends only the page name, the plan ID and "first visit today" (it remembers only the date).
  - It respects Do Not Track.
  - It must be loaded after \`config.js\`.

**Prices are decided by the server, not by this website.** The buttons only send a plan ID (for example \`openRazorpay('pro-upgrade')\`). To change a price, update both the price shown in the HTML and \`src/plans.js\` in the backend.

The four resume plans ("Premium Resume & Career Upgrade Plans", with the "Compare Our Plans" table) use the same markup on \`index.html\` and \`career-paths.html\`: change both. Each card carries \`data-plan-id\` and \`data-price\`; a backend unit test fails if a shown price differs from \`src/plans.js\`.

| Plan ID | Plan | Price |
|---|---|---|
| \`basic-resume\` | Basic Resume Plan | ₹899 |
| \`pro-resume\` | Pro Resume Plan | ₹1,299 |
| \`ultimate-career\` | Ultimate Career Plan | ₹1,999 |
| \`linkedin-optimization\` | LinkedIn Optimization | ₹1,499 |
| \`launch\` | LAUNCH | ₹5,999 |
| \`pro-upgrade\` | Pro Upgrade | ₹11,999 |
| \`ultimate-upgrade\` | Ultimate Upgrade | ₹18,999 |

## 💻 How to Run Locally
Because this is a pure static website, it requires zero setup or build processes to view.

1. **Clone or Download** this repository to your local machine.
2. **Open** any of the \`.html\` files (like \`index.html\`) directly in your favorite web browser (Chrome, Safari, Edge, etc.).
3. *Alternatively*, if you are using VS Code, you can use the **Live Server** extension to launch the site with hot-reloading.

## ☁️ Deployment
This project is completely production-ready and safe to deploy as-is. 

To deploy:
1. Upload this entire folder (including the \`assets\` directory) to any static hosting provider.
2. Recommended free hosting platforms:
   - **Vercel**
   - **Netlify**
   - **GitHub Pages**
3. No build commands (like \`npm run build\`) are required. Simply set the root directory as the deployment target.

## 🔒 Security Note
This frontend codebase contains only public-facing information and standard HTML/CSS/JS. It does not contain any secret API keys or backend credentials, making it safe to deploy to public hosting environments. Never add Razorpay key secrets or any \`.env\` file here: GitHub Pages publishes every file in this repository.

---
*&copy; 2024 EdgeCareer. All rights reserved.*
