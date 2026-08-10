import { BadRequestException } from '@nestjs/common';
import { assertMatchesFieldType } from './config-value.util';

describe('assertMatchesFieldType', () => {
  it.each([
    ['string', 'hello'],
    ['number', 42],
    ['boolean', true],
    ['json', { a: 1 }],
  ] as const)('accepts a valid %s value', (type, value) => {
    expect(() => assertMatchesFieldType('some.key', value, type)).not.toThrow();
  });

  it.each([
    ['string', 42],
    ['number', 'not-a-number'],
    ['number', Number.NaN],
    ['boolean', 'true'],
    ['json', 'not-an-object'],
    ['json', null],
  ] as const)('rejects a %s field given %p', (type, value) => {
    expect(() => assertMatchesFieldType('some.key', value, type)).toThrow(BadRequestException);
  });
});
