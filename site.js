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

    const galleryImages = document.querySelectorAll('.car-gallery img');
    if (document.querySelector('.car-gallery') && galleryImages.length !== 15) {
        failLoud('Cars gallery expected 15 photos, found ' + galleryImages.length + '.');
    }

    const flyer = document.querySelector('.event-flyer img');
    if (document.querySelector('.event-flyer') && !flyer) {
        failLoud('Event flyer image is missing.');
    }

    document.querySelectorAll('.car-gallery img, .event-flyer img').forEach((img) => {
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
