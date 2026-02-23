/**
 * Utility for conditionally joining classNames together.
 * A lightweight alternative to clsx/classnames library.
 *
 * Usage:
 *   cn('base-class', condition && 'conditional-class', 'another-class')
 *   cn('px-4 py-2', isActive ? 'bg-blue-500' : 'bg-gray-200')
 *
 */

type ClassDictionary = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ClassArray extends Array<ClassValue> {}
type ClassValue = string | number | boolean | undefined | null | ClassArray | ClassDictionary;
type ClassProp = ClassValue;

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
