import 'reflect-metadata';
import { Scopes, SCOPES_KEY } from './scopes.decorator';

describe('Scopes', () => {
  it('attaches the given scopes as reflectable metadata', () => {
    class Controller {
      @Scopes('plate:write', 'face:write')
      handler(): void {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(Controller.prototype, 'handler');
    const metadata: unknown = Reflect.getMetadata(SCOPES_KEY, descriptor?.value as object);
    expect(metadata).toEqual(['plate:write', 'face:write']);
  });
});
