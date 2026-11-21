// Google Analytics (loaded from index.html; missing when blocked, hence optional).
interface Window {
  gtag?: (...args: unknown[]) => void;
}
