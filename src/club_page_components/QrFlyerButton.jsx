import { useState } from 'react';
import QRCode from 'qrcode';
import { slugifyUniversity } from '../../shared/slug';
import flyerBg from '../assets/qr-flyer-bg.svg';
import racImg from '../assets/rac7.0.png';
import headerLogoImg from '../assets/header_logo.png';
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

      // Raccoon mascot (centered, upper area)
      const imgSize = 380;
      const imgX = (W - imgSize) / 2;
      const imgY = 130;
      const racImage = await loadImage(racImg);
      ctx.drawImage(racImage, imgX, imgY, imgSize, imgSize);

      const textX = W / 2;
      const maxTextW = W - 160;

      // Header logo (below the mascot, coupled tightly with it)
      const headerLogo = await loadImage(headerLogoImg);
      const logoW = maxTextW * 0.55;
      const logoH = logoW * (headerLogo.height / headerLogo.width);
      const logoY = imgY + imgSize + 10;
      ctx.drawImage(headerLogo, textX - logoW / 2, logoY, logoW, logoH);

      // QR code
      const qrSize = 520;
      const qrX = (W - qrSize) / 2;
      const qrY = H - qrSize - 200;
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, clubUrl, {
        width: qrSize,
        margin: 2,
        color: { dark: '#3b3c3c', light: '#ECE7E5' },
      });
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

      // Club name
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `400 60px 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif`;
      ctx.fillStyle = '#3b3c3c';
      ctx.fillText(club.club_name.toUpperCase(), textX, qrY + qrSize + 20);

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
