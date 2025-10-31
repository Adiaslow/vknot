/**
 * Smooth Momentum Scrolling
 * Adds subtle inertia to scroll behavior for a more natural, weighted feel
 */

class SmoothScroll {
  // Configuration
  private readonly FRICTION = 0.92; // Higher = more momentum (0.9-0.95 range feels good)
  private readonly VELOCITY_THRESHOLD = 0.1; // Stop animating below this velocity
  private readonly TOUCH_MULTIPLIER = 1.2; // Slightly more momentum on touch devices
  private readonly WHEEL_MULTIPLIER = 0.8; // Slightly less momentum on wheel

  // State
  private velocity = 0;
  private targetScrollY = 0;
  private currentScrollY = 0;
  private isAnimating = false;
  private rafId: number | null = null;
  private lastWheelTime = 0;
  private isTouchDevice = false;

  constructor() {
    this.isTouchDevice = 'ontouchstart' in window;
  }

  public init(): void {
    this.currentScrollY = window.scrollY;
    this.targetScrollY = window.scrollY;

    // Listen to wheel events
    window.addEventListener('wheel', this.handleWheel, { passive: false });

    // Listen to touch events for mobile
    if (this.isTouchDevice) {
      let touchStartY = 0;
      let touchLastY = 0;
      let touchLastTime = 0;

      window.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchLastY = touchStartY;
        touchLastTime = Date.now();
        this.velocity = 0; // Stop current momentum
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].clientY;
        const currentTime = Date.now();
        const deltaY = touchLastY - currentY;
        const deltaTime = Math.max(currentTime - touchLastTime, 1);

        // Calculate velocity from touch movement
        const touchVelocity = (deltaY / deltaTime) * 16; // Normalize to ~60fps
        this.velocity = touchVelocity * this.TOUCH_MULTIPLIER;

        touchLastY = currentY;
        touchLastTime = currentTime;

        // Let native scrolling handle the actual scroll
      }, { passive: true });

      window.addEventListener('touchend', () => {
        // Apply momentum on touch release
        if (Math.abs(this.velocity) > this.VELOCITY_THRESHOLD) {
          this.startAnimation();
        }
      }, { passive: true });
    }

    // Stop momentum when user manually scrolls (e.g., dragging scrollbar)
    window.addEventListener('scroll', () => {
      const now = Date.now();
      // If scroll happened without wheel event (manual scrollbar drag)
      if (now - this.lastWheelTime > 100) {
        this.currentScrollY = window.scrollY;
        this.targetScrollY = window.scrollY;
        this.velocity = 0;
      }
    }, { passive: true });
  }

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();

    this.lastWheelTime = Date.now();

    // Add to velocity (accumulate wheel deltas)
    const deltaY = e.deltaY;
    const multiplier = this.isTouchDevice ? this.TOUCH_MULTIPLIER : this.WHEEL_MULTIPLIER;

    // Subtle momentum: directly add wheel delta to velocity
    this.velocity += deltaY * multiplier;

    // Start or continue animation
    this.startAnimation();
  };

  private startAnimation(): void {
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.animate();
    }
  }

  private animate = (): void => {
    // Apply friction to velocity
    this.velocity *= this.FRICTION;

    // Stop if velocity is too small
    if (Math.abs(this.velocity) < this.VELOCITY_THRESHOLD) {
      this.velocity = 0;
      this.isAnimating = false;
      return;
    }

    // Update target scroll position
    this.targetScrollY += this.velocity;

    // Clamp to valid scroll range
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    this.targetScrollY = Math.max(0, Math.min(maxScroll, this.targetScrollY));

    // Smoothly interpolate current position toward target
    this.currentScrollY += (this.targetScrollY - this.currentScrollY) * 0.1;

    // Apply scroll
    window.scrollTo(0, this.currentScrollY);

    // Continue animation
    this.rafId = requestAnimationFrame(this.animate);
  };

  public destroy(): void {
    window.removeEventListener('wheel', this.handleWheel);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }
}

// Initialize smooth scrolling
let smoothScroll: SmoothScroll | null = null;

function init() {
  smoothScroll = new SmoothScroll();
  smoothScroll.init();
  console.log('[Smooth Scroll] Momentum scrolling initialized');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (smoothScroll) {
    smoothScroll.destroy();
  }
});
