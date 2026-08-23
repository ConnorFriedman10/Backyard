import { apiFetch } from '../lib/api';
import { uploadImage } from '../lib/uploadImage';
import { useState, useEffect } from 'react';
import { useGlobalStore } from "../lib/store";
import { useClubData } from '../context/useClubData';
import { CommentCard } from './ReviewList';
import ImageScaleCropModal from './ImageScaleCropModal';
import textModerator from '../lib/textModerator';
import thanksImage from "../assets/thanks.png"
import ThanksPage from './ThanksPage';

import "./ReviewPage.css"
import { useDocumentTitle } from '../lib/useDocumentTitle';

export default function ReviewPage({clubId, onClose}) {

    const GlobalValue = useGlobalStore((state) => state.GlobalValue);
    const { allData, profile } = useClubData();
    const id = clubId;
    const [warning, setWarning] = useState("")
    const [user_review, set_user_review] = useState('');
    const [user_title, set_user_title] = useState('');
    const [club, setClub] = useState(null);
    useDocumentTitle(club?.club_name ? `Backyard | Review ${club.club_name}` : null);
    // First name only, never last name — falls back to username when there's no name
    // on file at all (never the account email, which isn't fit to show on-screen).
    const displayName = profile?.first_name || profile?.username || 'User';
    const [reviewPosted, setReviewPosted] = useState(false);
    const [sectionVisible, setSectionVisible] = useState(false);

    // Staged photos, kept as {id, file} so @dnd-kit (in the compose carousel)
    // has stable ids that survive reordering/cropping.
    const [stagedImages, setStagedImages] = useState([]);
    const [previewImages, setPreviewImages] = useState([]);
    const [cropId, setCropId] = useState(null);
    const [posting, setPosting] = useState(false);

    const handleClose = () => {
        if (onClose) {
            onClose();
        } else {
            window.history.back();
        }
    };

    // Simple fade-in on open (was previously scroll-triggered across 3 sections;
    // now there's just the one, so a mount-triggered fade is enough).
    useEffect(() => {
        const t = setTimeout(() => setSectionVisible(true), 50);
        return () => clearTimeout(t);
    }, []);

    // Regenerate preview blob URLs whenever the staged set changes (add/remove/
    // reorder/crop-replace), revoking the previous batch on the way out.
    useEffect(() => {
        const next = stagedImages.map(({ id: imgId, file }) => ({ id: imgId, url: URL.createObjectURL(file) }));
        setPreviewImages(next);
        return () => { next.forEach((p) => URL.revokeObjectURL(p.url)); };
    }, [stagedImages]);

    const checkImageProportions = (file) => new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const ratio = img.naturalWidth / img.naturalHeight;
            resolve(ratio >= 0.25 && ratio <= 4.0 ? 'ok' : 'proportions');
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve('load'); };
        img.src = url;
    });

    const addFiles = async (fileList) => {
        const files = Array.from(fileList);
        const remainingSlots = 10 - stagedImages.length;
        const filesToAdd = files.slice(0, remainingSlots);

        if (files.length > remainingSlots) {
            setWarning(`Maximum 10 images allowed. Only adding ${remainingSlots} images.`);
        }

        const validFiles = [];
        for (const file of filesToAdd) {
            const validity = await checkImageProportions(file);
            if (validity === 'load') {
                setWarning('Image upload unsuccessful. Please try a different file.');
            } else if (validity === 'proportions') {
                setWarning('Image proportions are too extreme. Use an aspect ratio between 1:4 and 4:1.');
            } else {
                validFiles.push(file);
            }
        }

        setStagedImages((prev) => [
            ...prev,
            ...validFiles.map((file) => ({ id: crypto.randomUUID(), file })),
        ]);
    };

    const removeImage = (imgId) => {
        setStagedImages((prev) => prev.filter((img) => img.id !== imgId));
    };

    const replaceImage = (imgId, newFile) => {
        setStagedImages((prev) => prev.map((img) => (img.id === imgId ? { ...img, file: newFile } : img)));
    };

    const reorderImages = (reorderedPreview) => {
        setStagedImages((prev) => reorderedPreview.map((p) => prev.find((img) => img.id === p.id)));
    };

    useEffect(() => {
        function fetchClub() {
            // No GET /api/clubs/:id endpoint — pull from the already-loaded ClubDataProvider
            // cache instead of round-tripping. If allData is empty (provider still loading),
            // the second effect run will pick it up.
            const found = allData.find((c) => c.id === id);
            if (found) {
                setClub(found);
            } else {
                console.log('No club found with id:', id);
            }
        }

        fetchClub();
    }, [id, allData]);

    async function post_review() {
        if (!GlobalValue) {
            console.log("please log in before you post a review")
            return;
        }
        if (!((user_review && user_title) || stagedImages.length > 0)) return;

        const textCheck = textModerator.checkFields({
            review_title: user_title,
            review_text: user_review,
        });
        if (!textCheck.clean) {
            setWarning(textCheck.message);
            return;
        }

        setWarning("");
        setPosting(true);
        try {
            const urls = [];
            for (const { file } of stagedImages) {
                const publicUrl = await uploadImage(file);
                const verification = await apiFetch('/storage/verify-image', {
                    method: 'POST',
                    body: { publicUrl },
                });
                if (!verification.ok) {
                    throw new Error(verification.error || 'Image rejected by content policy');
                }
                urls.push(publicUrl);
            }

            // Backend forces user_id from the verified JWT, so we don't pass it.
            await apiFetch('/reviews', {
                method: 'POST',
                body: {
                    club_id: id,
                    review_text: user_review,
                    review_title: user_title,
                    review_images: urls,
                },
            });
            setReviewPosted(true);
        } catch (err) {
            console.error('Error posting review:', err);
            if (err.status === 409) {
                setWarning('Sorry, only one review per user');
            } else {
                setWarning(err.message || 'Failed to post review');
            }
        } finally {
            setPosting(false);
        }
    }

    const cropFile = stagedImages.find((img) => img.id === cropId)?.file;

    return (
    <div className='review-page'>
        <button className="review-close-btn" onClick={handleClose}>×</button>

        {/* Scroll happens in here, not on .review-page itself — keeps the close
            button (a sibling, outside this box) pinned to the corner instead of
            scrolling away with tall content. */}
        <div className="review-page-scroll">
            {!reviewPosted ? (
                <div className="review-content">
                    <section className={`review-section animate-on-scroll ${sectionVisible ? 'visible' : ''}`}>
                        <h1 className="instruction-txt">Write a comment</h1>

                        {warning && <p className="module-warning">{warning}</p>}

                        <CommentCard
                            composeProps={{
                                title: user_title,
                                onTitleChange: set_user_title,
                                text: user_review,
                                onTextChange: set_user_review,
                                bodyPlaceholder: `Tell others about your experience in ${club?.club_name}...`,
                                images: previewImages,
                                onAddFiles: addFiles,
                                onRemove: removeImage,
                                onReorder: reorderImages,
                                onScale: setCropId,
                            }}
                        />

                        <div className="duo-btn-wrap post-review-wrap">
                            <div className="duo-btn-pill" aria-hidden="true" />
                            <button
                                onClick={post_review}
                                disabled={posting}
                                className="post duo-btn"
                                style={{ '--duo-shadow': 'rgb(30, 80, 95)' }}
                            >
                                {posting ? 'Posting...' : 'Post Review'}
                            </button>
                        </div>
                    </section>
                </div>
            ) : (
                /* Thanks Section - Takes full page */
                <ThanksPage
                    username={displayName}
                    clubName={club?.club_name}
                    clubImage={club?.image_url}
                    thanksImage={thanksImage}
                />
            )}
        </div>

        {cropFile && (
            <ImageScaleCropModal
                file={cropFile}
                onCancel={() => setCropId(null)}
                onConfirm={(newFile) => { replaceImage(cropId, newFile); setCropId(null); }}
            />
        )}
    </div>
)}
