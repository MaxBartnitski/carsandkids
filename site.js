(function () {
    function failLoud(message) {
        const existing = document.querySelector('.site-error');
        if (!existing) {
            const banner = document.createElement('div');
            banner.className = 'site-error';
            banner.setAttribute('role', 'alert');
            banner.textContent = message;
            document.body.prepend(banner);
        }
        throw new Error(message);
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        })[char]);
    }

    const TZ = 'America/Denver';

    function parseInstant(value, label) {
        const ms = Date.parse(value);
        if (Number.isNaN(ms)) {
            failLoud(label + ' is not a valid time: ' + value);
        }
        return ms;
    }

    function formatLongDate(iso) {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: TZ,
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        }).format(new Date(iso));
    }

    function formatShortDate(iso) {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: TZ,
            weekday: 'long',
            month: 'short',
            day: 'numeric',
        }).format(new Date(iso));
    }

    function formatTime(iso) {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: TZ,
            hour: 'numeric',
            minute: '2-digit',
        }).format(new Date(iso));
    }

    function formatTimeRange(event) {
        const start = formatTime(event.start);
        if (!event.end) {
            return start;
        }
        return start + '\u2013' + formatTime(event.end);
    }

    function loadEvents() {
        const events = window.CARS_AND_KIDS_EVENTS;
        if (!Array.isArray(events) || events.length === 0) {
            failLoud('Event list is missing or empty.');
        }
        const ids = new Set();
        events.forEach((event) => {
            ['id', 'title', 'start', 'pastAt', 'location', 'blurb', 'flyer', 'flyerAlt'].forEach((key) => {
                if (typeof event[key] !== 'string' || event[key].trim() === '') {
                    failLoud('Event is missing ' + key + '.');
                }
            });
            if (ids.has(event.id)) {
                failLoud('Duplicate event id: ' + event.id);
            }
            ids.add(event.id);
            parseInstant(event.start, event.id + ' start');
            parseInstant(event.pastAt, event.id + ' pastAt');
            if (event.end) {
                parseInstant(event.end, event.id + ' end');
            }
        });
        return events;
    }

    function splitEvents(events) {
        const now = Date.now();
        const upcoming = events
            .filter((event) => now < parseInstant(event.pastAt, event.id + ' pastAt'))
            .sort((a, b) => parseInstant(a.start, a.id) - parseInstant(b.start, b.id));
        const past = events
            .filter((event) => now >= parseInstant(event.pastAt, event.id + ' pastAt'))
            .sort((a, b) => parseInstant(b.start, b.id) - parseInstant(a.start, a.id));
        return { upcoming, past };
    }

    function loadMedia(events) {
        const media = window.CARS_AND_KIDS_MEDIA;
        if (!media || typeof media !== 'object') {
            failLoud('Media list is missing.');
        }
        const eventIds = new Set(events.map((event) => event.id));
        Object.keys(media).forEach((id) => {
            if (!eventIds.has(id)) {
                failLoud('Media is filed under an unknown event id: ' + id);
            }
            const entry = media[id];
            if (!Array.isArray(entry.photos) || !Array.isArray(entry.videos)) {
                failLoud('Media for ' + id + ' needs photos and videos lists.');
            }
            entry.photos.forEach((photo) => {
                ['src', 'alt'].forEach((key) => {
                    if (typeof photo[key] !== 'string' || photo[key].trim() === '') {
                        failLoud('A photo for ' + id + ' is missing ' + key + '.');
                    }
                });
                if (!Number.isInteger(photo.width) || !Number.isInteger(photo.height)) {
                    failLoud('Photo ' + photo.src + ' is missing its width and height.');
                }
            });
            entry.videos.forEach((video) => {
                ['src', 'poster', 'alt'].forEach((key) => {
                    if (typeof video[key] !== 'string' || video[key].trim() === '') {
                        failLoud('A video for ' + id + ' is missing ' + key + '.');
                    }
                });
                if (typeof video.seconds !== 'number' || !(video.seconds > 0)) {
                    failLoud('Video ' + video.src + ' is missing its length in seconds.');
                }
                if (video.livePhoto === true && video.seconds > 3.5) {
                    failLoud('Video ' + video.src + ' is marked as a Live Photo clip but runs ' + video.seconds + 's.');
                }
            });
        });
        return media;
    }

    function shownVideos(entry) {
        return entry.videos.filter((video) => video.livePhoto !== true);
    }

    function assetUrl(path) {
        const prefix = document.body.dataset.assetPrefix;
        if (prefix === undefined) {
            failLoud('Page is missing data-asset-prefix.');
        }
        if (prefix === '') {
            return path;
        }
        return prefix + '/' + path;
    }

    function renderEventCard(event, isUpcoming, media) {
        const gallery = media[event.id];
        let cta = '';
        if (gallery && gallery.photos.length > 0) {
            const count = gallery.photos.length + shownVideos(gallery).length;
            cta = '<a href="/media/#' + escapeHtml(event.id) + '" class="btn-primary event-card-cta">See photos (' + count + ')</a>';
        } else if (isUpcoming) {
            cta = '<a href="/#get-involved" class="btn-primary event-card-cta">Bring your car</a>';
        }
        return [
            '<article class="event-card">',
            '<div class="event-card-copy">',
            '<dl class="event-meta">',
            '<dt>Date</dt><dd>' + escapeHtml(formatLongDate(event.start)) + '</dd>',
            '<dt>Time</dt><dd>' + escapeHtml(formatTimeRange(event)) + '</dd>',
            '<dt>Benefiting</dt><dd>' + escapeHtml(event.location) + '</dd>',
            '</dl>',
            '<p class="event-blurb">' + escapeHtml(event.blurb) + '</p>',
            cta,
            '</div>',
            '<figure class="event-flyer">',
            '<button type="button" class="lightbox-trigger" aria-label="View larger event flyer">',
            '<img src="' + escapeHtml(assetUrl(event.flyer)) + '" alt="' + escapeHtml(event.flyerAlt) + '">',
            '</button>',
            '</figure>',
            '</article>',
        ].join('');
    }

    function renderEvents(page) {
        const events = loadEvents();
        const media = page === 'events' ? loadMedia(events) : null;
        const { upcoming, past } = splitEvents(events);
        if (page === 'home') {
            const section = document.getElementById('next-event');
            const label = document.getElementById('next-event-label');
            const details = document.getElementById('next-event-details');
            const link = document.getElementById('next-event-link');
            if (!section || !label || !details || !link) {
                failLoud('Home page is missing the next-event block.');
            }
            const next = upcoming[0];
            if (!next) {
                label.textContent = 'Events';
                details.textContent = 'Nothing scheduled right now.';
                link.textContent = 'See events';
            } else {
                label.textContent = 'Next event';
                details.textContent = formatShortDate(next.start) + ' · ' + formatTimeRange(next) + ' · Benefiting ' + next.location;
                link.textContent = 'Event details';
            }
            link.href = '/events/';
            section.hidden = false;
        }
        if (page === 'events') {
            const upcomingSection = document.getElementById('event-upcoming');
            const pastSection = document.getElementById('event-past');
            const upcomingCards = document.getElementById('event-upcoming-cards');
            const pastCards = document.getElementById('event-past-cards');
            if (!upcomingSection || !pastSection || !upcomingCards || !pastCards) {
                failLoud('Events page is missing its event lists.');
            }
            if (upcoming.length === 0) {
                upcomingCards.innerHTML = '<p class="event-empty">Nothing scheduled right now.</p>';
            } else {
                upcomingCards.innerHTML = upcoming.map((event) => renderEventCard(event, true, media)).join('');
            }
            upcomingSection.hidden = false;
            if (past.length === 0) {
                pastSection.hidden = true;
                pastCards.innerHTML = '';
            } else {
                pastCards.innerHTML = past.map((event) => renderEventCard(event, false, media)).join('');
                pastSection.hidden = false;
            }
        }
    }

    function renderMediaPage() {
        const events = loadEvents();
        const media = loadMedia(events);
        const container = document.getElementById('media-events');
        if (!container) {
            failLoud('Media page is missing its event galleries block.');
        }
        const withMedia = events
            .filter((event) => media[event.id] && (media[event.id].photos.length > 0 || shownVideos(media[event.id]).length > 0))
            .sort((a, b) => parseInstant(b.start, b.id) - parseInstant(a.start, a.id));
        if (withMedia.length === 0) {
            failLoud('Media page has no event galleries to show.');
        }
        container.innerHTML = withMedia.map((event) => {
            const entry = media[event.id];
            const videos = shownVideos(entry);
            const headingId = event.id + '-heading';
            const photos = entry.photos.map((photo) => [
                '<figure class="media-card">',
                '<button type="button" class="lightbox-trigger">',
                '<img src="' + escapeHtml(assetUrl(photo.src)) + '" width="' + photo.width + '" height="' + photo.height + '" alt="' + escapeHtml(photo.alt) + '" loading="lazy">',
                '</button>',
                '</figure>',
            ].join('')).join('');
            const videoBlock = videos.length === 0 ? '' : [
                '<h3>Videos</h3>',
                '<div class="media-videos">',
                videos.map((video) => [
                    '<video class="media-video" controls playsinline preload="none" poster="' + escapeHtml(assetUrl(video.poster)) + '" aria-label="' + escapeHtml(video.alt) + '">',
                    '<source src="' + escapeHtml(assetUrl(video.src)) + '" type="video/mp4">',
                    '</video>',
                ].join('')).join(''),
                '</div>',
            ].join('');
            return [
                '<section class="media-event" id="' + escapeHtml(event.id) + '" aria-labelledby="' + escapeHtml(headingId) + '">',
                '<h2 id="' + escapeHtml(headingId) + '">' + escapeHtml(event.title) + '</h2>',
                '<p class="media-event-meta">' + escapeHtml(formatLongDate(event.start)) + ' · Benefiting ' + escapeHtml(event.location) + '</p>',
                entry.photos.length === 0 ? '' : '<div class="media-gallery">' + photos + '</div>',
                videoBlock,
                '</section>',
            ].join('');
        }).join('');

        if (window.location.hash) {
            const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
            if (!target) {
                failLoud('No media gallery for ' + window.location.hash + '.');
            }
            target.scrollIntoView();
        }
    }

    const page = document.body.dataset.page;
    if (!page) {
        failLoud('Page is missing data-page.');
    }
    if (page === 'home' || page === 'events') {
        renderEvents(page);
    }
    if (page === 'media') {
        renderMediaPage();
    }

    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (!navToggle || !navLinks) {
        failLoud('Navigation is missing required elements.');
    }

    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navLinks.classList.toggle('active');
    });

    document.querySelectorAll('.nav-links a').forEach((anchor) => {
        anchor.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navLinks.classList.remove('active');
        });
    });

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            const target = document.querySelector(href);
            if (!target) {
                failLoud('In-page link target not found: ' + href);
            }
            e.preventDefault();
            const offset = 80;
            const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top, behavior: 'smooth' });
            navToggle.classList.remove('active');
            navLinks.classList.remove('active');
        });
    });

    if (page === 'media') {
        const videos = document.querySelectorAll('video.media-video');
        if (document.querySelectorAll('.media-gallery img').length === 0) {
            failLoud('Media page rendered no photos.');
        }
        videos.forEach((video) => {
            const source = video.querySelector('source');
            if (!source || !source.getAttribute('src')) {
                failLoud('A media video is missing its source.');
            }
            if (!video.getAttribute('poster')) {
                failLoud('A media video is missing its poster.');
            }
            video.addEventListener('error', () => {
                failLoud('Failed to load video: ' + source.getAttribute('src'));
            });
        });
    }

    const galleryImages = document.querySelectorAll('.car-gallery img');
    if (document.querySelector('.car-gallery') && galleryImages.length !== 16) {
        failLoud('Cars gallery expected 16 photos, found ' + galleryImages.length + '.');
    }

    const flyers = document.querySelectorAll('.event-flyer img');
    if (page === 'events' && flyers.length === 0) {
        failLoud('Events page rendered no flyers.');
    }

    document.querySelectorAll('.car-gallery img, .event-flyer img, .media-gallery img').forEach((img) => {
        if (!img.getAttribute('src')) {
            failLoud('An image is missing its src.');
        }
        img.addEventListener('error', () => {
            failLoud('Failed to load image: ' + img.getAttribute('src'));
        });
    });

    const triggers = document.querySelectorAll('.lightbox-trigger');
    if (triggers.length === 0) {
        return;
    }

    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Image preview');
    lightbox.innerHTML = [
        '<button type="button" class="lightbox-close" aria-label="Close image preview">&times;</button>',
        '<img alt="">',
    ].join('');
    document.body.appendChild(lightbox);

    const lightboxImg = lightbox.querySelector('img');
    const closeBtn = lightbox.querySelector('.lightbox-close');
    if (!lightboxImg || !closeBtn) {
        failLoud('Lightbox failed to initialize.');
    }

    function openLightbox(src, alt) {
        if (!src) {
            failLoud('Lightbox opened without an image source.');
        }
        lightboxImg.src = src;
        lightboxImg.alt = alt || '';
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
        closeBtn.focus();
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        lightboxImg.removeAttribute('src');
        lightboxImg.alt = '';
        document.body.style.overflow = '';
    }

    triggers.forEach((trigger) => {
        const img = trigger.querySelector('img');
        if (img && !trigger.getAttribute('aria-label')) {
            trigger.setAttribute('aria-label', 'View larger photo: ' + (img.getAttribute('alt') || 'image'));
        }
        trigger.addEventListener('click', () => {
            const img = trigger.querySelector('img');
            if (!img || !img.getAttribute('src')) {
                failLoud('Lightbox trigger has no image.');
            }
            openLightbox(img.getAttribute('src'), img.getAttribute('alt') || '');
        });
    });

    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('active')) {
            closeLightbox();
        }
    });
})();
