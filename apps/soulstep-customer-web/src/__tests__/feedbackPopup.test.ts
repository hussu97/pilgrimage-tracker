import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFeedbackStateLogic } from '@/lib/utils/feedbackLogic';

describe('createFeedbackStateLogic()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('showSuccess sets visible=true, type=success, correct message', () => {
    const logic = createFeedbackStateLogic();
    logic.showSuccess('Checked in successfully!');
    const state = logic.getState();
    expect(state.visible).toBe(true);
    expect(state.type).toBe('success');
    expect(state.message).toBe('Checked in successfully!');
    logic.clearTimer();
  });

  it('showError sets visible=true, type=error, correct message', () => {
    const logic = createFeedbackStateLogic();
    logic.showError('Something went wrong. Please try again.');
    const state = logic.getState();
    expect(state.visible).toBe(true);
    expect(state.type).toBe('error');
    expect(state.message).toBe('Something went wrong. Please try again.');
    logic.clearTimer();
  });

  it('auto-dismisses after 2500ms', () => {
    const logic = createFeedbackStateLogic();
    logic.showSuccess('Hello');
    expect(logic.getState().visible).toBe(true);

    vi.advanceTimersByTime(2499);
    expect(logic.getState().visible).toBe(true);

    vi.advanceTimersByTime(1);
    expect(logic.getState().visible).toBe(false);
  });

  it('calling showSuccess again before auto-dismiss replaces current popup', () => {
    const logic = createFeedbackStateLogic();
    logic.showSuccess('First');
    expect(logic.getState().message).toBe('First');

    vi.advanceTimersByTime(1000);
    logic.showSuccess('Second');
    expect(logic.getState().message).toBe('Second');
    expect(logic.getState().visible).toBe(true);

    vi.advanceTimersByTime(2499);
    expect(logic.getState().visible).toBe(true);

    vi.advanceTimersByTime(1);
    expect(logic.getState().visible).toBe(false);
  });

  it('calling showError replaces a pending showSuccess', () => {
    const logic = createFeedbackStateLogic();
    logic.showSuccess('Done');
    logic.showError('Oops');
    const state = logic.getState();
    expect(state.type).toBe('error');
    expect(state.message).toBe('Oops');
    logic.clearTimer();
  });

  it('initial state is not visible', () => {
    const logic = createFeedbackStateLogic();
    expect(logic.getState().visible).toBe(false);
  });

  it('clearTimer does not throw when no timer is active', () => {
    const logic = createFeedbackStateLogic();
    // No show() called — timer is null; clearTimer should be a no-op
    expect(() => logic.clearTimer()).not.toThrow();
    expect(logic.getState().visible).toBe(false);
  });
});
