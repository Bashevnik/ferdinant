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
const closeMenu = document.getElementById('closeMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => mobileMenu.classList.add('active'));
    closeMenu.addEventListener('click', () => mobileMenu.classList.remove('active'));
}

// --- SLIDER WITH DRAG/SWIPE ---
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

    const getVisibleCards = () => {
        if (window.innerWidth > 1024) return 3;
        if (window.innerWidth > 768) return 2;
        return 1;
    };

    const updateSlider = () => {
        const cardWidth = slider.querySelector('.card').offsetWidth;
        currentTranslate = -index * cardWidth;
        prevTranslate = currentTranslate;
        slider.style.transition = 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
        setSliderPosition();
    };

    const setSliderPosition = () => {
        slider.style.transform = `translateX(${currentTranslate}px)`;
    };

    const nextFunc = () => {
        const total = slider.querySelectorAll('.card').length;
        const visible = getVisibleCards();
        if (index < total - visible) index++;
        updateSlider();
    };

    const prevFunc = () => {
        if (index > 0) index--;
        updateSlider();
    };

    nextBtn.addEventListener('click', nextFunc);
    prevBtn.addEventListener('click', prevFunc);

    // Mouse and Touch Events
    const touchStart = (e) => {
        isDragging = true;
        startX = getPositionX(e);
        startPos = startX;
        slider.style.transition = 'none';
        animationID = requestAnimationFrame(animation);
        slider.style.cursor = 'grabbing';
    };

    const touchMove = (e) => {
        if (!isDragging) return;
        const currentX = getPositionX(e);
        const diff = currentX - startX;
        currentTranslate = prevTranslate + diff;
    };

    const touchEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        cancelAnimationFrame(animationID);
        slider.style.cursor = 'grab';
        
        const cardWidth = slider.querySelector('.card').offsetWidth;
        const movedBy = currentTranslate - prevTranslate;
        
        // Prevent click if we moved significantly
        if (Math.abs(startPos - getPositionX(e)) > 10) {
           slider.classList.add('is-dragging');
        } else {
           slider.classList.remove('is-dragging');
        }

        if (movedBy < -cardWidth / 4) nextFunc();
        else if (movedBy > cardWidth / 4) prevFunc();
        else updateSlider();
    };

    const getPositionX = (e) => {
        return e.type.includes('mouse') ? e.pageX : e.nativeEvent ? e.nativeEvent.touches[0].clientX : e.touches[0].clientX;
    };

    const animation = () => {
        setSliderPosition();
        if (isDragging) requestAnimationFrame(animation);
    };

    slider.addEventListener('mousedown', touchStart);
    slider.addEventListener('mousemove', touchMove);
    window.addEventListener('mouseup', touchEnd);
    
    slider.addEventListener('touchstart', touchStart, { passive: true });
    slider.addEventListener('touchmove', touchMove, { passive: true });
    slider.addEventListener('touchend', touchEnd);

    // Initial positioning
    window.addEventListener('resize', updateSlider);
}

// --- BARBER MODAL ---
const barberCards = document.querySelectorAll('.barber-card');
const barberModal = document.getElementById('barberModal');
const closeBarber = document.querySelector('.close-barber');
const bmImg = document.getElementById('bm-img');
const bmName = document.getElementById('bm-name');
const bmTitle = document.getElementById('bm-title');
const bmDesc = document.getElementById('bm-desc');

if (barberModal) {
    barberCards.forEach(card => {
        card.addEventListener('click', function(e) {
            // Respect the was-dragging state
            if (slider && slider.classList.contains('is-dragging')) {
                slider.classList.remove('is-dragging');
                return;
            }
            if (e.target.classList.contains('open-contact-modal')) return;

            if (bmName) bmName.textContent = this.dataset.name;
            if (bmTitle) bmTitle.textContent = this.dataset.title;
            if (bmDesc) bmDesc.textContent = this.dataset.desc;

            const photoEl = this.querySelector('.card-photo-src');
            if (bmImg && photoEl) {
                bmImg.style.backgroundImage = 'url("' + photoEl.src + '")';
            }

            barberModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });

    if (closeBarber) {
        closeBarber.addEventListener('click', () => {
            barberModal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }
}

// --- CONTACT MODAL ---
const openContacts = document.querySelectorAll('.open-contact-modal');
const contactModal = document.getElementById('contactModal');
const closeContact = document.querySelector('.close-contact');
if (contactModal) {
    openContacts.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            contactModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });
    if (closeContact) {
        closeContact.addEventListener('click', () => {
            contactModal.classList.remove('active');
            if (barberModal && !barberModal.classList.contains('active')) document.body.style.overflow = '';
        });
    }
    contactModal.addEventListener('click', (e) => {
        if (e.target === contactModal) {
            contactModal.classList.remove('active');
            if (barberModal && !barberModal.classList.contains('active')) document.body.style.overflow = '';
        }
    });
}

// --- IMG ZOOM (PORTFOLIO) ---
const zoomables = document.querySelectorAll('.img-zoom');
const imgOverlay = document.getElementById('imgModalOverlay');
if (imgOverlay) {
    zoomables.forEach(item => {
        item.addEventListener('click', () => {
            const imgSrc = item.querySelector('img').src;
            const fullImg = document.getElementById('fullScreenImg');
            if (fullImg) fullImg.src = imgSrc;
            imgOverlay.classList.add('active');
        });
    });
    const closeImg = document.querySelector('.close-img-modal');
    if (closeImg) {
        closeImg.addEventListener('click', () => imgOverlay.classList.remove('active'));
    }
}
