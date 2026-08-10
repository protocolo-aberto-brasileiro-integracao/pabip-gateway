const registeredSecrets = new Set<string>();

const SECRET_ENV_KEY_PATTERN = /(API[_-]?KEY|SECRET|TOKEN|PASSWORD|PWD)/i;

export function registerSecret(value: string | undefined | null): void {
  if (!value) {
    return;
  }

  registeredSecrets.add(value);

  const credentialMatch = /:\/\/[^:/@]+:([^@]+)@/.exec(value);
  if (credentialMatch?.[1]) {
    registeredSecrets.add(credentialMatch[1]);
  }
}

export function resetRegisteredSecrets(): void {
  registeredSecrets.clear();
}

export function redactSecrets(input: string): string {
  let output = input;
  for (const secret of registeredSecrets) {
    output = output.split(secret).join('[REDACTED]');
  }
  return output;
}

function seedFromEnvironment(): void {
  for (const [key, value] of Object.entries(process.env)) {
    if (key === 'DATABASE_URL' || SECRET_ENV_KEY_PATTERN.test(key)) {
      registerSecret(value);
    }
  }
}

seedFromEnvironment();
