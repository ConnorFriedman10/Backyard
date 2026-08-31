
import { useState, useEffect } from "react";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import Form from "./form";
import ForgotPasswordForm from "./ForgotPasswordForm";
import "./LoginMorph.css";
import { useGlobalStore } from "../lib/store";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import borderImg from '/src/assets/border-green.svg';
import borderHorizontalImg from '/src/assets/border-horizontal-green.svg';

// The compact trigger (avatar/login icon) lives in NavBar as a plain button —
// LoginMorph itself only owns the expanded login/signup/forgot-password card,
// which just fades/scales in on its own rather than morphing from the icon.
function LoginMorph({ open, setOpen }) {
  const setLastPath = useGlobalStore((state) => state.setLastPath);
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState("login");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [typedGreeting, setTypedGreeting] = useState("");

  useEffect(() => {
    if (!open) setView("login");
  }, [open]);

  // Reset the typed greeting whenever we leave the signup view
  useEffect(() => {
    if (view !== "signup") setSignupFirstName("");
  }, [view]);

  // Typewriter: reveal ", {name}!" one character at a time after the
  // first-name field is committed (blurred) on the signup view
  useEffect(() => {
    if (!signupFirstName) { setTypedGreeting(""); return; }
    const full = `, ${signupFirstName}!`.toUpperCase();
    setTypedGreeting("");
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setTypedGreeting(full.slice(0, i));
      if (i >= full.length) clearInterval(timer);
    }, 60);
    return () => clearInterval(timer);
  }, [signupFirstName]);

  const handleAuth = (flow) => {
    setOpen(false);
    if (flow === 'signup') {
      navigate('/profile-setup');
      return;
    }
    navigate('/profile');
  };

  const handleGoogleSignIn = async () => {
    setLastPath(location.pathname + location.search);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) console.error(error);
  };

  const viewHeading = {
    login: "WELCOME BACK",
    signup: "WELCOME",
    forgot: "RESET PASSWORD",
  };

  const needHelpBtn = (
    <button className="need-help-btn" type="button">
      NEED HELP
    </button>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="login-card"
        >
          <img src={borderImg} alt="" className="login-card-border login-card-border-left" />
          <img src={borderImg} alt="" className="login-card-border login-card-border-right" />
          <div
            className="login-card-border-h-wrap login-card-border-top-wrap"
            style={{ backgroundImage: `url(${borderHorizontalImg})` }}
            aria-hidden="true"
          />
          <div
            className="login-card-border-h-wrap login-card-border-bottom-wrap"
            style={{ backgroundImage: `url(${borderHorizontalImg})` }}
            aria-hidden="true"
          />
          <button className="close-btn" onClick={() => setOpen(false)}>
            &times;
          </button>
          <div className="login-card-scroll">
          <img className="raccoon" src="/raccoon_pfp.png" />
          <h2>{viewHeading[view]}{view === "signup" ? typedGreeting : ""}</h2>

          {view !== "forgot" && (
            <>
              <div className="duo-btn-wrap google-btn-wrap">
                <div className="duo-btn-pill" aria-hidden="true" />
                <button
                  className="oauth-btn google-btn duo-btn"
                  style={{ '--duo-shadow': 'rgb(200, 200, 200)' }}
                  onClick={handleGoogleSignIn}
                  type="button"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                 SIGN IN WITH GOOGLE
                </button>
              </div>

              <div className="auth-divider">
                <span>or</span>
              </div>
            </>
          )}

          {view === "forgot" ? (
            <ForgotPasswordForm onBack={() => setView("login")} needHelpButton={needHelpBtn} />
          ) : (
            <Form
              isSignUp={view === "signup"}
              onAuth={handleAuth}
              onFirstNameCommit={setSignupFirstName}
              needHelpButton={needHelpBtn}
              toggleAuthButton={
                <button
                  className="toggle-auth-btn"
                  type="button"
                  onClick={() => setView(view === "login" ? "signup" : "login")}
                >
                  {view === "signup"
                    ? "LOGIN"
                    : "SIGN UP"}
                </button>
              }
            />
          )}

          {view === "login" && (
            <button
              className="forgot-password-btn"
              type="button"
              onClick={() => setView("forgot")}
            >
              FORGOT PASSWORD
            </button>
          )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LoginMorph;
