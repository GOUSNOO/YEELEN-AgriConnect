import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check } from 'lucide-react';

let toastListeners = [];
function notify(message, type = 'error') {
  const toast = { id: `${Date.now()}-${Math.random()}`, message, type };
  toastListeners.forEach(fn => fn(toast));
}

export function notifyError(err, fallback = 'Une erreur est survenue.') {
  notify((err && err.message) || fallback, 'error');
}

export function notifySuccess(message) {
  notify(message, 'success');
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 5000);
    };
    toastListeners.push(handler);
    return () => { toastListeners = toastListeners.filter(l => l !== handler); };
  }, []);

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? '#F6E2DE' : '#E6F4EA',
          color: t.type === 'error' ? '#B23B2E' : '#3F6B3B',
          borderRadius: 10, padding: '11px 14px',
          fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'flex-start', gap: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
        }}>
          {t.type === 'error' ? <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <Check size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span style={{ flex: 1 }}>{t.message}</span>
          <button onClick={() => dismiss(t.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.8, padding: 0, lineHeight: 1 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

export function Card({ children, style, ...rest }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #DAD6C4',
      borderRadius: 14, padding: '18px 20px', ...style
    }} {...rest}>
      {children}
    </div>
  );
}

export function Button({ children, onClick, variant = 'default', small, style, type = 'button', disabled, ...rest }) {
  const base = {
    fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: small ? 13 : 14,
    padding: small ? '7px 12px' : '10px 16px', borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid transparent', display: 'inline-flex', alignItems: 'center', gap: 6,
    transition: 'transform 0.1s ease, opacity 0.15s ease', opacity: disabled ? 0.5 : 1,
  };
  const variants = {
    default: { background: '#22271D', color: '#fff' },
    outline: { background: 'transparent', color: '#22271D', borderColor: '#DAD6C4' },
    green: { background: '#3F6B3B', color: '#fff' },
    ochre: { background: '#C1861F', color: '#fff' },
    danger: { background: 'transparent', color: '#B23B2E', borderColor: '#F6E2DE' },
    ghost: { background: 'transparent', color: '#5B6357' },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, ...props }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#5B6357', fontWeight: 500 }}>
      {label}
      <input
        {...props}
        style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, padding: '9px 11px',
          borderRadius: 8, border: '1px solid #DAD6C4', background: '#FBFAF4',
          color: '#22271D', outline: 'none'
        }}
      />
    </label>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#5B6357', fontWeight: 500 }}>
      {label}
      <select
        {...props}
        style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, padding: '9px 11px',
          borderRadius: 8, border: '1px solid #DAD6C4', background: '#FBFAF4',
          color: '#22271D', outline: 'none'
        }}
      >
        {children}
      </select>
    </label>
  );
}

export function Badge({ children, tone = 'green' }) {
  const map = {
    green: { bg: '#E7EFDF', fg: '#3F6B3B' },
    ochre: { bg: '#F7EAD2', fg: '#C1861F' },
    blue: { bg: '#E1EDF2', fg: '#2E6E8E' },
    red: { bg: '#F6E2DE', fg: '#B23B2E' },
  };
  const t = map[tone] || map.green;
  return (
    <span style={{
      background: t.bg, color: t.fg, fontSize: 11.5, fontWeight: 600,
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap'
    }}>
      {children}
    </span>
  );
}

export function GaugeDial({ value, max = 100, label, unit, colorMain, colorTrack, icon }) {
  const size = 108;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const offset = circumference * (1 - pct);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colorTrack} strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={colorMain} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center'
        }}>
          {icon}
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 17, color: '#22271D', marginTop: 2 }}>
            {Math.round(value)}{unit}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 12.5, color: '#5B6357', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

export function MiniChart({ data, color, height = 110 }) {
  if (!data || data.length === 0) {
    return <div style={{ color: '#5B6357', fontSize: 13 }}>Aucune donnée</div>;
  }
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, marginTop: 8 }}>
      {data.map(item => (
        <div key={item.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: '100%', maxWidth: 24, height: `${Math.max(8, (item.value / max) * 100)}%`, minHeight: 8, background: color, borderRadius: '6px 6px 0 0' }} />
          <span style={{ fontSize: 10, color: '#5B6357', textAlign: 'center' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
