// e2e specs boot the real AppModule and create peers against nock-mocked hosts
// (e.g. https://acme.example) that do not resolve in DNS; run the egress policy
// in permissive mode so those fixtures are reachable. Prod keeps the secure
// defaults (GATEWAY_EGRESS_ALLOW_PRIVATE unset => private destinations blocked).
process.env.GATEWAY_EGRESS_ALLOW_PRIVATE = process.env.GATEWAY_EGRESS_ALLOW_PRIVATE ?? 'true';
process.env.GATEWAY_EGRESS_REQUIRE_HTTPS = process.env.GATEWAY_EGRESS_REQUIRE_HTTPS ?? 'false';

// Exercises the encrypted-at-rest path for peer.theirApiKey end to end. Not a
// real secret — a fixed 32-byte test key so e2e runs are reproducible.
process.env.GATEWAY_SECRET_ENCRYPTION_KEY =
  process.env.GATEWAY_SECRET_ENCRYPTION_KEY ?? 'vsqAg3iCUDByhxJRB8Z9KMrFiHjw/3+5Jezcio7Y+aY=';
