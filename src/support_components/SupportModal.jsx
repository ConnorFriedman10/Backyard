import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useGlobalStore } from '../lib/store';
import borderImg from '/src/assets/border.svg';
import borderHorizontalImg from '/src/assets/border-horizontal.svg';
import './SupportModal.css';

// ─── Static FAQ data ──────────────────────────────────────────────────────────
const FAQ = [
  {
    q: 'How do I join a club?',
    a: "Navigate to the club's page and click \"Join.\" You'll need a Backyard account to save memberships.",
  },
  {
    q: 'How do I save a club to my favorites?',
    a: 'Click the heart icon on any club card. Your favorites are saved to your profile and accessible any time.',
  },
  {
    q: "Why can't I log in?",
    a: "Make sure you're using the same method you signed up with (Google or email). If you signed up recently, check your inbox for a confirmation email.",
  },
  {
    q: 'How do I change my profile photo?',
    a: 'Go to your Profile page and click on your avatar. You can upload a new photo directly from your device.',
  },
  {
    q: 'How do I report inappropriate content?',
    a: 'Use the Submit a Ticket tab and select "Bug Report" as the category. Describe what you saw and where, and the team will review it.',
  },
  {
    q: 'Why does my university not appear in search?',
    a: "We're currently in early access at select universities. If yours isn't listed, reach out via a General ticket and we'll look into adding it.",
  },
];

const CATEGORY_LABELS = {
  bug_report: 'Bug Report',
  general: 'General',
  account: 'Account',
};

const STATUS_COLORS = {
  open: '#e07b00',
  in_progress: '#2563eb',
  resolved: '#16a34a',
};

// ─── FAQ Tab ──────────────────────────────────────────────────────────────────
function FAQTab() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="support-faq">
      {FAQ.map((item, i) => (
        <div key={i} className="support-faq-item">
          <button
            className="support-faq-question"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            aria-expanded={openIndex === i}
          >
            <span>{item.q}</span>
            <span className="support-faq-chevron">{openIndex === i ? '▾' : '▸'}</span>
          </button>
          <AnimatePresence initial={false}>
            {openIndex === i && (
              <motion.div
                className="support-faq-answer"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                <p>{item.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ─── Submit Tab ───────────────────────────────────────────────────────────────
function SubmitTab({ user, onSubmitted }) {
  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  if (!user) {
    return (
      <div className="support-auth-gate">
        <p>You need to be logged in to submit a ticket.</p>
        <p className="support-auth-hint">Log in using the button in the top-right corner.</p>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      const ticket = await apiFetch('/support/tickets', {
        method: 'POST',
        body: { category, subject, description },
      });
      setStatus('success');
      onSubmitted(ticket);
      setSubject('');
      setDescription('');
      setCategory('general');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div className="support-success">
        <p className="support-success-heading">Ticket submitted.</p>
        <p className="support-success-sub">Check the My Tickets tab to track its status.</p>
        <button className="support-success-btn" onClick={() => setStatus('idle')}>
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form className="support-form" onSubmit={handleSubmit} noValidate>
      <div className="support-field">
        <label className="support-label" htmlFor="support-category">Category</label>
        <select
          id="support-category"
          className="support-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="general">General Question</option>
          <option value="bug_report">Bug Report</option>
          <option value="account">Account Issue</option>
        </select>
      </div>

      <div className="support-field">
        <label className="support-label" htmlFor="support-subject">
          Subject
          <span className="support-char-count">{subject.length}/120</span>
        </label>
        <input
          id="support-subject"
          className="support-input"
          type="text"
          maxLength={120}
          placeholder="Brief summary of your issue"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
      </div>

      <div className="support-field">
        <label className="support-label" htmlFor="support-description">
          Description
          <span className="support-char-count">{description.length}/2000</span>
        </label>
        <textarea
          id="support-description"
          className="support-textarea"
          maxLength={2000}
          placeholder="Describe the issue in detail"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={5}
        />
      </div>

      {status === 'error' && <p className="support-error">{errorMsg}</p>}

      <div className="support-form-footer">
        <div className="duo-btn-wrap">
          <div className="duo-btn-pill" aria-hidden="true" />
          <button
            className="support-submit-btn duo-btn"
            style={{ '--duo-shadow': 'rgb(49, 90, 116)' }}
            type="submit"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Submitting…' : 'Submit Ticket'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── My Tickets Tab ───────────────────────────────────────────────────────────
function MyTicketsTab({ user, newTicket }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    apiFetch('/support/tickets')
      .then(setTickets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // Prepend freshly submitted ticket without re-fetching
  useEffect(() => {
    if (!newTicket) return;
    setTickets((prev) => {
      if (prev.find((t) => t.ticket_id === newTicket.ticket_id)) return prev;
      return [newTicket, ...prev];
    });
  }, [newTicket]);

  if (!user) {
    return (
      <div className="support-auth-gate">
        <p>You need to be logged in to view your tickets.</p>
        <p className="support-auth-hint">Log in using the button in the top-right corner.</p>
      </div>
    );
  }

  if (loading) return <div className="support-loading">Loading…</div>;

  if (tickets.length === 0) {
    return (
      <div className="support-empty">
        <p>No tickets yet.</p>
        <p className="support-auth-hint">Submit one using the Submit a Ticket tab.</p>
      </div>
    );
  }

  return (
    <ul className="support-ticket-list">
      {tickets.map((t) => (
        <li key={t.ticket_id} className="support-ticket-row">
          <div className="support-ticket-meta">
            <span className="support-ticket-id">{t.ticket_id}</span>
            <span className="support-ticket-category">{CATEGORY_LABELS[t.category] ?? t.category}</span>
            <span
              className="support-ticket-status"
              style={{ color: STATUS_COLORS[t.status] ?? '#888' }}
            >
              ● {t.status.replace('_', ' ')}
            </span>
            <span className="support-ticket-date">
              {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <p className="support-ticket-subject">{t.subject}</p>
        </li>
      ))}
    </ul>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
const TABS = ['FAQ', 'Submit a Ticket', 'My Tickets'];

export function SupportModal({ open, setOpen }) {
  const [activeTab, setActiveTab] = useState(0);
  const [user, setUser] = useState(null);
  const [lastSubmitted, setLastSubmitted] = useState(null);
  // Signed-in users get the "?" trigger inline in ProfilePage's button row instead of
  // this floating corner button — the modal itself is shared either way.
  const signedIn = useGlobalStore((state) => state.GlobalValue);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
  }, [open]);

  function handleSubmitted(ticket) {
    setLastSubmitted(ticket);
  }

  return (
    <AnimatePresence>
      {!open && !signedIn && (
        <motion.button
          key="support-trigger"
          className="support-trigger"
          onClick={() => setOpen(true)}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          aria-label="Open support"
        >
          ?
        </motion.button>
      )}

      {open && (
        <motion.div
          key="support-modal"
          className="support-modal"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <img src={borderImg} alt="" className="support-modal-border support-modal-border-left" />
          <img src={borderImg} alt="" className="support-modal-border support-modal-border-right" />
          <div
            className="support-modal-border-h-wrap support-modal-border-top-wrap"
            style={{ backgroundImage: `url(${borderHorizontalImg})` }}
            aria-hidden="true"
          />
          <div
            className="support-modal-border-h-wrap support-modal-border-bottom-wrap"
            style={{ backgroundImage: `url(${borderHorizontalImg})` }}
            aria-hidden="true"
          />

          <button
            className="support-close"
            onClick={() => setOpen(false)}
            aria-label="Close support"
          >
            ×
          </button>

          <h1 className="support-heading">Support</h1>
          <div className="support-divider" />

          <div className="support-tabs" role="tablist">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === i}
                className={`support-tab${activeTab === i ? ' support-tab--active' : ''}`}
                onClick={() => setActiveTab(i)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="support-content">
            {activeTab === 0 && <FAQTab />}
            {activeTab === 1 && <SubmitTab user={user} onSubmitted={(t) => { handleSubmitted(t); setActiveTab(2); }} />}
            {activeTab === 2 && <MyTicketsTab user={user} newTicket={lastSubmitted} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SupportModal;
