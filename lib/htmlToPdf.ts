// Web only: turn an HTML string into a real PDF and download it straight away
// (no print dialog). Uses the same CDN-loaded jsPDF + html2canvas approach as
// lib/calendarPdf.ts, so no npm install is needed.

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

// A4 portrait, in points (jsPDF) and CSS pixels (iframe render width).
const A4_W_PT = 595.28;
const A4_H_PT = 841.89;
const RENDER_W_PX = 794;

function loadScript(src: string, globalName: string): Promise<any> {
  const w = window as any;
  if (w[globalName]) return Promise.resolve(w[globalName]);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () =>
      w[globalName] ? resolve(w[globalName]) : reject(new Error('PDF library failed to initialise.'));
    s.onerror = () =>
      reject(new Error('Could not load the PDF library. Check your internet connection and try again.'));
    document.head.appendChild(s);
  });
}

export async function downloadHtmlAsPdf(html: string, fileName: string): Promise<void> {
  const html2canvas = await loadScript(HTML2CANVAS_URL, 'html2canvas');
  const jsPDF = (await loadScript(JSPDF_URL, 'jspdf')).jsPDF;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${RENDER_W_PX}px;height:1200px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('Could not prepare the PDF.'));
      iframe.srcdoc = html;
    });

    const doc = iframe.contentDocument;
    if (!doc || !doc.body) throw new Error('Could not prepare the PDF.');

    // Wait for fonts and images (logo, signatures) so they appear in the PDF.
    try { await (doc as any).fonts?.ready; } catch { /* fine */ }
    await Promise.all(
      Array.from(doc.images)
        .filter((img) => !img.complete)
        .map((img) => new Promise((r) => { img.onload = img.onerror = () => r(null); }))
    );

    const target = doc.body as HTMLElement;
    const canvas: HTMLCanvasElement = await html2canvas(target, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: RENDER_W_PX,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    // Scale the canvas to the page width, then slice it into page-height strips.
    const ratio = A4_W_PT / canvas.width;
    const pageHeightPx = Math.floor(A4_H_PT / ratio);
    let offset = 0;
    let first = true;

    while (offset < canvas.height) {
      const sliceH = Math.min(pageHeightPx, canvas.height - offset);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext('2d');
      if (!ctx) throw new Error('Could not prepare the PDF.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      if (!first) pdf.addPage('a4', 'portrait');
      pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4_W_PT, sliceH * ratio);

      first = false;
      offset += sliceH;
    }

    pdf.save(fileName);
  } finally {
    document.body.removeChild(iframe);
  }
}
