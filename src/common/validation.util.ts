import type { ValidationError } from 'class-validator';

export function flattenValidationErrors(errors: ValidationError[], path = ''): string[] {
  return errors.flatMap((error) => {
    const propertyPath = path ? `${path}.${error.property}` : error.property;
    const ownMessages = Object.values(error.constraints ?? {}).map(
      (message) => `${propertyPath}: ${message}`,
    );
    const nestedMessages = error.children?.length
      ? flattenValidationErrors(error.children, propertyPath)
      : [];
    return [...ownMessages, ...nestedMessages];
  });
}
