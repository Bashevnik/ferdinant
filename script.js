document.addEventListener('DOMContentLoaded', () => {
    loadComponents().catch((error) => {
        console.error(error);
    }).finally(initPage);
});

async function loadComponents() {
    const targets = Array.from(document.querySelectorAll('[data-include]'));
    await Promise.all(targets.map(async (target) => {
        const source = target.getAttribute('data-include');
        if (!source) return;

        const response = await fetch(source);
        if (!response.ok) throw new Error(`Unable to load ${source}`);
        target.outerHTML = await response.text();
    }));

    setActiveNavigation();
}

function setActiveNavigation() {
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

    document.querySelectorAll('.nav-links a, .mobile-nav-links a').forEach((link) => {
        const linkPage = (link.getAttribute('href') || '').split('/').pop().toLowerCase() || 'index.html';
        link.classList.toggle('active', linkPage === currentPage);
    });
}

function initPage() {
// --- CANVAS LOGIC ---
const canvas = document.getElementById('particle-canvas');
if (canvas) {
    const ctx = canvas.getContext('2d');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w, h, dpr;
    let particles = [];
    let frameId = 0;
    let resizeId = 0;

    function initCanvas() {
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    window.addEventListener('resize', () => {
        cancelAnimationFrame(resizeId);
        resizeId = requestAnimationFrame(initCanvas);
    }, { passive: true });

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
    const particleCount = reducedMotion ? 0 : (window.innerWidth < 768 ? 18 : 36);
    for (let i = 0; i < particleCount; i++) particles.push(new Particle());

    function animate() {
        if (document.hidden || reducedMotion) {
            frameId = requestAnimationFrame(animate);
            return;
        }
        ctx.clearRect(0, 0, w, h);
        particles.forEach(p => { p.update(); p.draw(); });
        frameId = requestAnimationFrame(animate);
    }

    if (!reducedMotion) frameId = requestAnimationFrame(animate);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !frameId && !reducedMotion) frameId = requestAnimationFrame(animate);
    });
}

// --- MOBILE MENU ---
const menuToggle = document.getElementById('menuToggle');
const closeBtn = document.getElementById('closeMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
if (menuToggle && mobileMenu) {
    const setMobileMenu = (isOpen) => {
        mobileMenu.classList.toggle('active', isOpen);
        menuToggle.classList.toggle('active', isOpen);
        document.body.classList.toggle('menu-open', isOpen);
        menuToggle.setAttribute('aria-expanded', String(isOpen));
    };

    menuToggle.setAttribute('aria-label', 'Toggle menu');
    menuToggle.setAttribute('aria-controls', 'mobileMenu');
    menuToggle.setAttribute('aria-expanded', 'false');

    menuToggle.onclick = () => setMobileMenu(!mobileMenu.classList.contains('active'));
    if (closeBtn) closeBtn.onclick = () => setMobileMenu(false);

    mobileMenu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setMobileMenu(false));
    });
}

// --- NEW PRECISION SWIPER ---
const slider = document.getElementById('barberSlider');
const nextBtn = document.getElementById('nextBarber');
const prevBtn = document.getElementById('prevBarber');

if (slider && nextBtn && prevBtn) {
    let index = 0;
    let isDragging = false;
    let startX = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;
    let animationID = 0;
    let startPos = 0;

    const cards = Array.from(slider.querySelectorAll('.card'));

    if (!cards.length) return;
    
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
    
    window.addEventListener('resize', updateSlider);
    updateSlider();
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

// --- PAGE TRANSITION ---
initPageTransitions();

function initPageTransitions() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isTransitioning = false;
    let loader = null;

    const getLoader = () => {
        if (loader) return loader;

        loader = document.createElement('div');
        loader.className = 'page-transition-loader';
        loader.setAttribute('aria-hidden', 'true');
        loader.innerHTML = `
            <div class="page-transition-content">
                <div class="page-transition-mark">
                    <img src="assets/DEN.png" alt="">
                </div>
                <div class="page-transition-word">FERDINAND</div>
            </div>
        `;
        document.body.appendChild(loader);
        return loader;
    };

    const shouldHandle = (event, anchor) => {
        if (!anchor || isTransitioning) return false;
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return false;
        if (anchor.target && anchor.target !== '_self') return false;
        if (anchor.hasAttribute('download')) return false;

        const href = anchor.getAttribute('href') || '';
        if (!href || href.startsWith('#') || href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('javascript:')) return false;

        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return false;
        if (url.pathname === window.location.pathname && url.hash) return false;
        if (url.href === window.location.href) return false;

        return true;
    };

    document.addEventListener('click', (event) => {
        const anchor = event.target.closest('a[href]');
        if (!shouldHandle(event, anchor)) return;

        event.preventDefault();
        isTransitioning = true;

        const nextUrl = anchor.href;
        const transition = getLoader();
        const content = transition.querySelector('.page-transition-content');
        const mark = transition.querySelector('.page-transition-mark');
        const word = transition.querySelector('.page-transition-word');

        document.body.classList.remove('menu-open');
        document.body.classList.add('page-transitioning');
        transition.classList.add('is-active');

        if (typeof gsap !== 'undefined' && !prefersReducedMotion) {
            gsap.killTweensOf([transition, content, mark, word]);
            gsap.timeline({
                defaults: { ease: 'power2.out' },
                onComplete: () => {
                    window.location.href = nextUrl;
                }
            })
                .set(transition, { autoAlpha: 1 })
                .fromTo(content, { autoAlpha: 0, scale: 0.985, y: 10 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.52 })
                .fromTo(word, { letterSpacing: '0.11em', autoAlpha: 0 }, { letterSpacing: '0.16em', autoAlpha: 1, duration: 0.42 }, '<0.12')
                .to(mark, { scale: 1.018, duration: 0.46, ease: 'sine.inOut' }, '<0.12')
                .to(content, { autoAlpha: 0.96, duration: 0.12 }, '<0.28');
        } else {
            transition.style.opacity = '1';
            window.setTimeout(() => {
                window.location.href = nextUrl;
            }, prefersReducedMotion ? 120 : 650);
        }
    });
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

// --- LIGHTWEIGHT SLIDE LOOPS ---
function createSlideLoop(root, selector, options = {}) {
    if (!root) return;

    const slides = Array.from(root.querySelectorAll(selector));
    const activeClass = options.activeClass || 'is-active';
    const exitClass = options.exitClass || 'is-exiting';
    const interval = options.interval || 4200;
    const exitDelay = options.exitDelay || 1400;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (slides.length < 2 || prefersReducedMotion) return;

    let index = slides.findIndex((slide) => slide.classList.contains(activeClass));
    let timerId = 0;
    if (index < 0) index = 0;

    slides.forEach((slide, slideIndex) => {
        slide.classList.toggle(activeClass, slideIndex === index);
        slide.classList.remove(exitClass);
    });

    const tick = () => {
        const current = slides[index];
        index = (index + 1) % slides.length;
        const next = slides[index];

        current.classList.remove(activeClass);
        current.classList.add(exitClass);
        next.classList.add(activeClass);

        window.setTimeout(() => current.classList.remove(exitClass), exitDelay);
    };

    const start = () => {
        if (!timerId) timerId = window.setInterval(tick, interval);
    };

    const stop = () => {
        window.clearInterval(timerId);
        timerId = 0;
    };

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => entry.isIntersecting ? start() : stop());
        }, { threshold: 0.2 });
        observer.observe(root);
    } else {
        start();
    }
}

createSlideLoop(document.querySelector('[data-about-slider]'), '.about-bg-slide', {
    activeClass: 'active',
    exitClass: 'exiting',
    interval: 3600,
    exitDelay: 1400
});

createSlideLoop(document.querySelector('[data-about-hero]'), '.about-hero-slide', {
    activeClass: 'is-active',
    exitClass: 'is-exiting',
    interval: 4800,
    exitDelay: 1700
});

document.querySelectorAll('[data-about-swipe]').forEach((swipe) => {
    createSlideLoop(swipe, '.about-swipe-slide', {
        activeClass: 'is-active',
        exitClass: 'is-exiting',
        interval: 3800,
        exitDelay: 1050
    });
});

initAboutMarquee();

function initAboutMarquee() {
    const tracks = Array.from(document.querySelectorAll('.about-loop-track'));
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!tracks.length || typeof gsap === 'undefined' || prefersReducedMotion) return;

    const setupTrack = (track) => {
        const items = Array.from(track.children);
        const midpoint = Math.floor(items.length / 2);
        if (midpoint < 1) return;

        const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
        const distance = items.slice(0, midpoint).reduce((sum, item) => (
            sum + item.getBoundingClientRect().width + gap
        ), 0);

        if (!distance) return;

        track.style.animation = 'none';
        gsap.killTweensOf(track);
        gsap.set(track, { x: 0, force3D: true });
        gsap.to(track, {
            x: -distance,
            duration: Math.max(26, distance / 58),
            ease: 'none',
            repeat: -1
        });
    };

    tracks.forEach((track) => {
        let resizeId = 0;
        const rebuild = () => {
            cancelAnimationFrame(resizeId);
            resizeId = requestAnimationFrame(() => setupTrack(track));
        };

        rebuild();
        window.addEventListener('resize', rebuild, { passive: true });

        if ('ResizeObserver' in window) {
            const observer = new ResizeObserver(rebuild);
            observer.observe(track);
        }
    });
}

// --- SHOP CART ---
initShopCart();

function initShopCart() {
    const panel = document.getElementById('cartPanel');
    if (!panel) return;

    const backdrop = document.getElementById('cartBackdrop');
    const openCart = document.getElementById('openCart');
    const closeCart = document.getElementById('closeCart');
    const itemsNode = document.getElementById('cartItems');
    const emptyNode = document.getElementById('cartEmpty');
    const countNode = document.getElementById('cartCount');
    const totalNode = document.getElementById('cartTotal');
    const form = document.getElementById('cartForm');
    const resultNode = document.getElementById('cartResult');
    const storageKey = 'ferdinandCart';

    let cart = [];

    try {
        cart = JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
        cart = [];
    }

    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));

    const save = () => {
        localStorage.setItem(storageKey, JSON.stringify(cart));
    };

    const open = () => {
        panel.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
        document.body.classList.add('cart-open');
    };

    const close = () => {
        panel.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
        document.body.classList.remove('cart-open');
    };

    const getProductFromCard = (button) => {
        const card = button.closest('.product-card-premium');
        const select = card.querySelector('.volume-selector-premium');
        const selected = select ? select.options[select.selectedIndex] : null;
        const code = card.querySelector('.product-art')?.textContent.trim() || 'DEPOT';
        const name = card.querySelector('.product-name')?.textContent.trim() || 'Product';
        const volume = selected
            ? selected.textContent.split('—')[0].trim()
            : (card.querySelector('.single-volume-badge')?.textContent.trim() || '');
        const price = Number(selected?.dataset.price || card.querySelector('.price-val')?.textContent.replace(/\D/g, '') || 0);

        return {
            id: `${code}|${name}|${volume}`,
            code,
            name,
            volume,
            price,
            qty: 1
        };
    };

    const render = () => {
        const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
        const totalPrice = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

        if (countNode) countNode.textContent = totalQty;
        if (totalNode) totalNode.textContent = totalPrice;
        if (emptyNode) emptyNode.hidden = cart.length > 0;

        if (!itemsNode) return;

        itemsNode.innerHTML = cart.map((item) => `
            <article class="cart-line">
                <div>
                    <span>${escapeHtml(item.code)}</span>
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>${escapeHtml(item.volume)} · ${item.price} ₴</small>
                </div>
                <div class="cart-line-controls">
                    <button type="button" data-cart-action="dec" data-id="${escapeHtml(item.id)}">−</button>
                    <b>${item.qty}</b>
                    <button type="button" data-cart-action="inc" data-id="${escapeHtml(item.id)}">+</button>
                    <button type="button" data-cart-action="remove" data-id="${escapeHtml(item.id)}">×</button>
                </div>
            </article>
        `).join('');
    };

    document.querySelectorAll('.add-to-cart').forEach((button) => {
        button.addEventListener('click', () => {
            const item = getProductFromCard(button);
            const existing = cart.find((cartItem) => cartItem.id === item.id);

            if (existing) {
                existing.qty += 1;
            } else {
                cart.push(item);
            }

            save();
            render();
            open();
        });
    });

    itemsNode?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-cart-action]');
        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.cartAction;
        const item = cart.find((cartItem) => cartItem.id === id);

        if (!item) return;

        if (action === 'inc') item.qty += 1;
        if (action === 'dec') item.qty -= 1;
        if (action === 'remove' || item.qty <= 0) {
            cart = cart.filter((cartItem) => cartItem.id !== id);
        }

        save();
        render();
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!cart.length) {
            if (resultNode) resultNode.textContent = 'Додайте хоча б один товар у кошик.';
            return;
        }

        const data = new FormData(form);
        const orderLines = cart.map((item) => `- ${item.code} ${item.name}, ${item.volume}, ${item.qty} шт. x ${item.price} ₴`);
        const totalPrice = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
        const orderText = [
            'Нове замовлення FERDINAND',
            '',
            `Ім'я: ${data.get('name')}`,
            `Телефон: ${data.get('phone')}`,
            `Адреса: ${data.get('address')}`,
            `Коментар: ${data.get('comment') || '-'}`,
            '',
            'Товари:',
            ...orderLines,
            '',
            `Разом: ${totalPrice} ₴`
        ].join('\n');

        try {
            if (resultNode) resultNode.innerHTML = '<p>Відправляємо замовлення...</p>';

            // Вкажіть тут URL вашого Railway бекенду після деплою
            const backendUrl = 'https://ferdinand-backend.up.railway.app/order';
            
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: orderText })
            });

            if (response.ok) {
                cart = [];
                save();
                render();
                form.reset();
                if (resultNode) resultNode.innerHTML = '<p style="color: #2ecc71; margin-top: 15px;">Замовлення успішно відправлено! Ми зв\'яжемося з вами найближчим часом.</p>';
            } else {
                throw new Error('Помилка сервера');
            }
        } catch (err) {
            console.error('Помилка відправки:', err);
            try {
                await navigator.clipboard.writeText(orderText);
            } catch {}
            
            if (resultNode) {
                resultNode.innerHTML = `
                    <p style="color: #e74c3c; margin-top: 15px;">Сталася помилка при відправці. Текст замовлення скопійовано.</p>
                    <a href="https://t.me/AlexBashevnik" target="_blank" rel="noopener" style="color: var(--text-main); text-decoration: underline;">Відправити вручну в Telegram</a>
                `;
            }
        }
    });

    openCart?.addEventListener('click', open);
    closeCart?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);
    render();
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
            document.querySelectorAll('[data-reveal]').forEach((el) => {
                gsap.from(el, {
                    autoAlpha: 0.01,
                    y: 42,
                    duration: 0.95,
                    ease: 'power3.out',
                    scrollTrigger: {
                        trigger: el,
                        start: 'top 86%',
                        once: true
                    }
                });
            });

            document.querySelectorAll('.service-row, .product-tile, .barber-card').forEach((el) => {
                const textTarget = el.querySelector('.card-title, .product-info, .service-name');
                if (!textTarget) return;

                const rect = el.getBoundingClientRect();
                const isInitiallyVisible = rect.top < window.innerHeight * 0.94 && rect.bottom > 0;
                const revealOptions = {
                    autoAlpha: 0.01,
                    y: 22,
                    duration: 0.75,
                    ease: 'power3.out'
                };

                if (isInitiallyVisible) {
                    gsap.from(textTarget, {
                        ...revealOptions,
                        delay: 0.18
                    });
                    return;
                }

                gsap.from(textTarget, {
                    ...revealOptions,
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
}
