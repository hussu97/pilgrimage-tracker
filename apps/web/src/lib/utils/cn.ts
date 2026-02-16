/**
 * Utility for conditionally joining classNames together.
 * A lightweight alternative to clsx/classnames library.
 *
 * Usage:
 *   cn('base-class', condition && 'conditional-class', 'another-class')
 *   cn('px-4 py-2', isActive ? 'bg-blue-500' : 'bg-gray-200')
 *
 * TODO: Gradually migrate all template literal className patterns to use this utility.
 * Current patterns to replace:
 *   - className={`base ${condition ? 'active' : 'inactive'}`}
 *   - className={`base ${isActive && 'active'}`}
 * Should become:
 *   - className={cn('base', condition ? 'active' : 'inactive')}
 *   - className={cn('base', isActive && 'active')}
 *
 * Target files: ~40 components with template literal classNames (see grep results)
 */

type ClassValue = string | number | boolean | undefined | null;
type ClassArray = ClassValue[];
type ClassDictionary = Record<string, unknown>;
type ClassProp = ClassValue | ClassArray | ClassDictionary;

export function cn(...inputs: ClassProp[]): string {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) continue;

    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(String(input));
    } else if (Array.isArray(input)) {
      const result = cn(...input);
      if (result) classes.push(result);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }

  return classes.join(' ');
}
