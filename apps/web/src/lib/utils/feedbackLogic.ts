/** Pure state logic for FeedbackProvider — no React or DOM imports, safe to unit-test. */

interface FeedbackState {
  visible: boolean;
  type: 'success' | 'error';
  message: string;
}

/** Creates an isolated feedback state controller. Used in tests and internally by FeedbackProvider. */
export function createFeedbackStateLogic() {
  let state: FeedbackState = { visible: false, type: 'success', message: '' };
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show(type: 'success' | 'error', message: string) {
    if (timer) clearTimeout(timer);
    state = { visible: true, type, message };
    timer = setTimeout(() => {
      state = { ...state, visible: false };
    }, 2500);
  }

  return {
    showSuccess: (msg: string) => show('success', msg),
    showError: (msg: string) => show('error', msg),
    getState: () => state,
    clearTimer: () => {
      if (timer) clearTimeout(timer);
    },
  };
}
