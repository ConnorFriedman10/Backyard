import React, { useState, useEffect } from 'react';
import './ThanksPage.css';

export default function ThanksPage({ username, clubName, clubImage, thanksImage }) {
    const fullText = `Thanks for sharing, ${username}!`;
    const [displayedText, setDisplayedText] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);
    
    useEffect(() => {
        if (currentIndex < fullText.length) {
            const timeout = setTimeout(() => {
                setDisplayedText(fullText.slice(0, currentIndex + 1));
                setCurrentIndex(currentIndex + 1);
            }, 50);
            return () => clearTimeout(timeout);
        }
    }, [currentIndex, fullText]);
    
    return (
        <div className="thanks-page">
            <div className="thanks-card">
                {/* Header with Avatar and Typing Text */}
                <div className="thanks-header">
                    <div className="thanks-avatar-container">
                        <img
                            alt="Avatar"
                            className="thanks-avatar"
                            src={thanksImage}
                        />
                    </div>
                    <h1 className="thanks-title">
                        {displayedText}
                        {currentIndex < fullText.length && <span className="cursor-blink">|</span>}
                    </h1>
                </div>
                
                {/* Divider */}
                <div className="thanks-divider" />
                
                {/* Bottom Section */}
                <div className="thanks-bottom">
                    <div className="thanks-club-info">
                        <div className="thanks-club-image-container">
                            {clubImage && (
                                <img
                                    alt="Club"
                                    className="thanks-club-image"
                                    src={clubImage}
                                />
                            )}
                        </div>
                        <p className="thanks-feedback-text">
                            Feedback on {clubName || 'club'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}