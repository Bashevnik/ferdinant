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

            if (bmName) bmName.textContent = this.dataset.name;
            if (bmTitle) bmTitle.textContent = this.dataset.title;
            if (bmDesc) bmDesc.textContent = this.dataset.desc;

            const src = this.querySelector('.card-photo-src').src;
            if (bmImg) bmImg.style.backgroundImage = `url(${src})`;

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
