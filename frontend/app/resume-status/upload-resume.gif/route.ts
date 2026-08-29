const uploadResumeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 620" role="img" aria-label="Upload resume">
  <rect width="900" height="620" fill="transparent"/>
  <g transform="translate(450 315)">
    <circle cx="0" cy="-205" r="55" fill="none" stroke="#16131a" stroke-width="14"/>
    <path d="M0 -235v60M-30 -205h60" stroke="#16131a" stroke-width="14" stroke-linecap="round"/>
    <rect x="-250" y="-130" width="500" height="80" rx="14" fill="#ff7f93" stroke="#16131a" stroke-width="8"/>
    <text x="0" y="-78" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="#16131a">Upload Resume</text>
    <path d="M-240 -95h-40a18 18 0 0 0-18 18v35h58v-53ZM240 -95h40a18 18 0 0 1 18 18v35h-58v-53Z" fill="#fff" stroke="#16131a" stroke-width="9"/>
    <path d="M-220 -52c0 230 50 330 220 330s220-100 220-330" fill="#fff" stroke="#16131a" stroke-width="13" stroke-linejoin="round"/>
    <rect x="-98" y="35" width="196" height="150" rx="22" fill="#fff" stroke="none"/>
    <path d="M-16 137l-24 24a57 57 0 0 1-81-81l50-50a57 57 0 0 1 81 0 42 42 0 0 1 8 10" fill="none" stroke="#ff7f93" stroke-width="18" stroke-linecap="round"/>
    <path d="M16 63l24-24a57 57 0 0 1 81 81l-50 50a57 57 0 0 1-81 0 42 42 0 0 1-8-10" fill="none" stroke="#ff7f93" stroke-width="18" stroke-linecap="round"/>
  </g>
</svg>`;

export function GET() {
  return new Response(uploadResumeSvg.trim(), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
