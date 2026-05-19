// --- CANVAS LOGIC ---
const canvas = document.getElementById('particle-canvas');
if (canvas) {
    const ctx = canvas.getContext('2d');
    let w, h;
    let particles = [];
    function initCanvas() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', initCanvas);
    initCanvas();
    class Particle {
        constructor() {
            this.x = Math.random() * w;
            this.y = Math.random() * h;
            this.size = Math.random() * 2;
            this.speedX = Math.random() * 0.5 - 0.25;
            this.speedY = Math.random() * 0.5 - 0.25;
            this.opacity = Math.random() * 0.5;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x > w) this.x = 0; if (this.x < 0) this.x = w;
            if (this.y > h) this.y = 0; if (this.y < 0) this.y = h;
        }
        draw() {
            ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    for (let i = 0; i < 50; i++) particles.push(new Particle());
    function animate() {
        ctx.clearRect(0, 0, w, h);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    animate();
}

// --- MOBILE MENU ---
const menuToggle = document.getElementById('menuToggle');
const closeBtn = document.getElementById('closeMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
if (menuToggle && mobileMenu) {
    menuToggle.onclick = () => mobileMenu.classList.add('active');
    closeBtn.onclick = () => mobileMenu.classList.remove('active');
}

// --- NEW PRECISION SWIPER ---
const slider = document.getElementById('barberSlider');
const nextBtn = document.getElementById('nextBarber');
const prevBtn = document.getElementById('prevBarber');

if (slider && nextBtn) {
    let index = 0;
    let isDragging = false;
    let startX = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;
    let animationID = 0;
    let startPos = 0;

    const cards = Array.from(slider.querySelectorAll('.card'));
    
    function updateSlider() {
        const cardWidth = cards[0].offsetWidth + 1; // 1px for border-gap
        currentTranslate = -index * cardWidth;
        prevTranslate = currentTranslate;
        slider.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
        setSliderPosition();
    }

    function setSliderPosition() {
        slider.style.transform = `translateX(${currentTranslate}px)`;
    }

    function getVisibleCount() {
        if (window.innerWidth > 1024) return 3;
        if (window.innerWidth > 768) return 2;
        return 1;
    }

    nextBtn.onclick = () => {
        if (index < cards.length - getVisibleCount()) index++;
        updateSlider();
    };

    prevBtn.onclick = () => {
        if (index > 0) index--;
        updateSlider();
    };

    // Swipe logic
    slider.onmousedown = (e) => {
        isDragging = true;
        startX = e.pageX;
        startPos = startX;
        slider.style.transition = 'none';
        animationID = requestAnimationFrame(animateDrag);
        slider.style.cursor = 'grabbing';
    };

    window.onmousemove = (e) => {
        if (!isDragging) return;
        const currentX = e.pageX;
        currentTranslate = prevTranslate + (currentX - startX);
    };

    window.onmouseup = (e) => {
        if (!isDragging) return;
        isDragging = false;
        cancelAnimationFrame(animationID);
        slider.style.cursor = 'grab';
        
        const movedBy = currentTranslate - prevTranslate;
        
        // Block clicks if moved
        if (Math.abs(startPos - e.pageX) > 10) {
            slider.classList.add('is-dragging');
        } else {
            slider.classList.remove('is-dragging');
        }

        // --- STRICT 1 SLIDE LOGIC ---
        if (movedBy < -50) { // Swiped left -> Next 1 card
            if (index < cards.length - getVisibleCount()) index++;
        } else if (movedBy > 50) { // Swiped right -> Prev 1 card
            if (index > 0) index--;
        }
        updateSlider();
    };

    // Touch
    slider.ontouchstart = (e) => {
        isDragging = true;
        startX = e.touches[0].clientX;
        startPos = startX;
        slider.style.transition = 'none';
        animationID = requestAnimationFrame(animateDrag);
    };

    slider.ontouchmove = (e) => {
        if (!isDragging) return;
        const currentX = e.touches[0].clientX;
        currentTranslate = prevTranslate + (currentX - startX);
    };

    slider.ontouchend = (e) => {
        if (!isDragging) return;
        isDragging = false;
        cancelAnimationFrame(animationID);
        
        const movedBy = currentTranslate - prevTranslate;
        const finalX = e.changedTouches[0].clientX;

        if (Math.abs(startPos - finalX) > 10) {
            slider.classList.add('is-dragging');
        } else {
            slider.classList.remove('is-dragging');
        }

        if (movedBy < -50) {
            if (index < cards.length - getVisibleCount()) index++;
        } else if (movedBy > 50) {
            if (index > 0) index--;
        }
        updateSlider();
    };

    function animateDrag() {
        setSliderPosition();
        if (isDragging) requestAnimationFrame(animateDrag);
    }
    
    window.onresize = updateSlider;
    window.onload = updateSlider;
}

// --- MODAL BARBER ---
const barberCards = document.querySelectorAll('.barber-card');
const barberModal = document.getElementById('barberModal');
const closeBarber = document.querySelector('.close-barber');

if (barberModal) {
    barberCards.forEach(card => {
        card.onclick = function(e) {
            if (slider && slider.classList.contains('is-dragging')) {
                slider.classList.remove('is-dragging');
                return;
            }
            if (e.target.classList.contains('open-contact-modal')) return;

            const bmName = document.getElementById('bm-name');
            const bmTitle = document.getElementById('bm-title');
            const bmDesc = document.getElementById('bm-desc');
            const bmImg = document.getElementById('bm-img');
            const bmGallery = document.getElementById('bm-gallery');

            if (bmName) bmName.textContent = this.dataset.name;
            if (bmTitle) bmTitle.textContent = this.dataset.title;
            if (bmDesc) bmDesc.textContent = this.dataset.desc;

            const src = this.querySelector('.card-photo-src').src;
            if (bmImg) bmImg.style.backgroundImage = `url(${src})`;
            if (bmGallery) {
                const photos = (this.dataset.photos || '')
                    .split(',')
                    .map(photo => photo.trim())
                    .filter(Boolean)
                    .slice(0, 1);

                bmGallery.innerHTML = photos.map(photo => `<img src="${photo}" alt="${this.dataset.name}">`).join('');
            }

            barberModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        };
    });
    if (closeBarber) {
        closeBarber.onclick = () => {
            barberModal.classList.remove('active');
            document.body.style.overflow = '';
        };
    }
}

// --- CONTACT FORM / BOOKING LINK ---
const contactModal = document.getElementById('contactModal');
document.querySelectorAll('.open-contact-modal').forEach(btn => {
    btn.onclick = (e) => {
        e.preventDefault();
        window.location.href = 'https://n765746.alteg.io/company/719724/personal/select-master?utm_source=ig&utm_medium=social&utm_content=link_in_bio&o=';
    };
});
const closeContact = document.querySelector('.close-contact');
if (closeContact && contactModal) {
    closeContact.onclick = () => {
        contactModal.classList.remove('active');
        if (typeof barberModal !== 'undefined' && barberModal && !barberModal.classList.contains('active')) document.body.style.overflow = '';
    };
}

// --- ZOOM IMG ---
const imgOverlay = document.getElementById('imgModalOverlay');
document.querySelectorAll('.img-zoom').forEach(item => {
    item.onclick = () => {
        const src = item.querySelector('img').src;
        const full = document.getElementById('fullScreenImg');
        if (full) full.src = src;
        imgOverlay.classList.add('active');
    };
});
const closeZoom = document.querySelector('.close-img-modal');
if (closeZoom) closeZoom.onclick = () => imgOverlay.classList.remove('active');

// --- ABOUT BACKGROUND SLIDER ---
const aboutSlider = document.querySelector('[data-about-slider]');
if (aboutSlider) {
    const slides = Array.from(aboutSlider.querySelectorAll('.about-bg-slide'));
    let aboutIndex = 0;

    if (slides.length) {
        slides.forEach((slide, slideIndex) => slide.classList.toggle('active', slideIndex === 0));

        setInterval(() => {
            const current = slides[aboutIndex];
            aboutIndex = (aboutIndex + 1) % slides.length;
            const next = slides[aboutIndex];

            current.classList.remove('active');
            current.classList.add('exiting');
            next.classList.add('active');

            setTimeout(() => {
                current.classList.remove('exiting');
            }, 1400);
        }, 3000);
    }
}

// About: right-swipe between portrait slides (keeps global background static)
const aboutSwipe = document.querySelector('[data-about-swipe]');
if (aboutSwipe) {
    const swipeSlides = Array.from(aboutSwipe.querySelectorAll('.about-swipe-slide'));
    let swipeIndex = swipeSlides.findIndex((s) => s.classList.contains('is-active'));
    if (swipeIndex < 0) swipeIndex = 0;

    swipeSlides.forEach((s, i) => {
        s.classList.toggle('is-active', i === swipeIndex);
        s.classList.remove('is-exiting');
    });

    if (swipeSlides.length > 1) {
        setInterval(() => {
            const current = swipeSlides[swipeIndex];
            swipeIndex = (swipeIndex + 1) % swipeSlides.length;
            const next = swipeSlides[swipeIndex];

            current.classList.remove('is-active');
            current.classList.add('is-exiting');

            next.classList.add('is-active');

            window.setTimeout(() => {
                current.classList.remove('is-exiting');
            }, 1100);
        }, 3000);
    }
}

// --- PREMIUM MOTION SYSTEM ---
if (typeof gsap !== 'undefined') {
    if (typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion) {
        gsap.from('.hero-text-block > *, .section-head > *, .reveal-up', {
            autoAlpha: 0.01,
            y: 34,
            duration: 1.15,
            stagger: 0.12,
            ease: 'power3.out',
            delay: 0.08
        });

        if (typeof ScrollTrigger !== 'undefined') {
            document.querySelectorAll('.service-row, .product-tile, .barber-card').forEach((el) => {
                const textTarget = el.querySelector('.card-title, .product-info, .service-name');
                if (!textTarget) return;
                gsap.from(textTarget, {
                    autoAlpha: 0.01,
                    y: 22,
                    duration: 0.75,
                    ease: 'power3.out',
                    scrollTrigger: {
                        trigger: el,
                        start: 'top 88%',
                        once: true
                    }
                });
            });
        }
    }
}
