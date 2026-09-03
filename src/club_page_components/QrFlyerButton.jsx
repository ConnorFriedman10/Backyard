import { useState } from 'react';
import QRCode from 'qrcode';
import { slugifyUniversity } from '../../shared/slug';
import flyerBg from '../assets/qr-flyer-bg.svg';
import './QrFlyerButton.css';

const W = 1275;
const H = 1650;

function loadImage(src, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
  return currentY;
}

export default function QrFlyerButton({ club }) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const uniSlug = slugifyUniversity(club.school);
      const clubUrl = `${window.location.origin}/university/${uniSlug}?club=${club.id}`;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      // Background
      try {
        const bg = await loadImage(flyerBg);
        ctx.drawImage(bg, 0, 0, W, H);
      } catch {
        ctx.fillStyle = '#ECE7E5';
        ctx.fillRect(0, 0, W, H);
      }

      // Club image (centered, upper area)
      const imgSize = 420;
      const imgX = (W - imgSize) / 2;
      const imgY = 180;
      if (club.image_url) {
        try {
          const clubImg = await loadImage(club.image_url, 'anonymous');
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(imgX, imgY, imgSize, imgSize, 20);
          ctx.clip();
          ctx.drawImage(clubImg, imgX, imgY, imgSize, imgSize);
          ctx.restore();
        } catch {
          // CORS or load failure — skip the image
        }
      }

      const textX = W / 2;
      const maxTextW = W - 160;

      // Club name
      ctx.fillStyle = '#3b3c3c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `bold 80px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif`;
      const nameY = imgY + imgSize + 70;
      const nameEndY = wrapText(ctx, club.club_name.toUpperCase(), textX, nameY, maxTextW, 88);

      // Tagline
      ctx.font = `48px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif`;
      ctx.fillStyle = '#56758b';
      const taglineY = nameEndY + 80;
      ctx.fillText('Come find us on Backyard', textX, taglineY);

      // QR code
      const qrSize = 520;
      const qrX = (W - qrSize) / 2;
      const qrY = H - qrSize - 160;
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, clubUrl, {
        width: qrSize,
        margin: 2,
        color: { dark: '#3b3c3c', light: '#ECE7E5' },
      });
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

      // Scan hint
      ctx.font = `32px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif`;
      ctx.fillStyle = '#6b6b6b';
      ctx.fillText('Scan to visit our page', textX, qrY + qrSize + 44);

      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${club.club_name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase()}-backyard-qr.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="duo-btn-wrap">
      <div className="duo-btn-pill" aria-hidden="true" />
      <button
        className="qr-flyer-btn duo-btn"
        onClick={handleDownload}
        disabled={generating}
        title="Download printable QR flyer"
      >
        {generating ? 'Generating…' : 'QR Flyer ↓'}
      </button>
    </div>
  );
}
