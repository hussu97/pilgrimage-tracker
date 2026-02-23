// Mock expo modules that use import.meta (not supported in Jest)
jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
  ExecutionEnvironment: { Bare: 'bare', StoreClient: 'storeClient', Standalone: 'standalone' },
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
