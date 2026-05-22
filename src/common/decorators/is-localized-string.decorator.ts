import { registerDecorator, ValidationOptions } from 'class-validator';
import {
  LocalizedStringSchema,
  PartialLocalizedStringSchema,
} from '../utils/localized-string';

export function IsLocalizedString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLocalizedString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return LocalizedStringSchema.safeParse(value).success;
        },
        defaultMessage() {
          return `${propertyName} must be an object of shape { en: string, am: string }`;
        },
      },
    });
  };
}

export function IsPartialLocalizedString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPartialLocalizedString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          const parsed = PartialLocalizedStringSchema.safeParse(value);
          if (!parsed.success) return false;
          return Boolean(parsed.data.en ?? parsed.data.am);
        },
        defaultMessage() {
          return `${propertyName} must be an object of shape { en?: string, am?: string } with at least one key`;
        },
      },
    });
  };
}
