import { isMuted } from '../audio/settings';
import { prefersReducedMotion } from './dom';

/**
 * Vibration on phones that support it (Android; iOS Safari ignores it). Follows the sound
 * toggle and reduced motion, so "silent" also means "still".
 */
export function haptic(pattern: number | number[]): void {
  if (isMuted() || prefersReducedMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* some browsers throw outside a user gesture */
  }
}
