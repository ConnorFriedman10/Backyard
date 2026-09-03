import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ClaimGate from './ClaimGate.jsx';
import AuthCallback from './AuthCallback.jsx';
import ResumeGate from './ResumeGate.jsx';

// Four routes, deliberately. Nothing from the main app is imported here, so nothing
// from the main app ends up in this bundle.
//
// /auth/callback is not optional: form.jsx sets emailRedirectTo to
// `${window.location.origin}/auth/callback`, and on this deployment that origin is the
// onboarding domain. Without the route, every signup confirmation email dead-ends.
export default function OnboardApp() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/claim/:token" element={<ClaimGate />} />
                {/* Token-free way back in, for clubs that already claimed. Their link
                    expires after 30 days and cannot be reminted once the club has an
                    owner, which left an authorized club with no route to their draft. */}
                <Route path="/resume" element={<ResumeGate />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="*" element={<Navigate to="/claim/missing" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
