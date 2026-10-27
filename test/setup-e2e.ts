// e2e specs boot the real AppModule and create peers against nock-mocked hosts
// (e.g. https://acme.example) that do not resolve in DNS; run the egress policy
// in permissive mode so those fixtures are reachable. Prod keeps the secure
// defaults (GATEWAY_EGRESS_ALLOW_PRIVATE unset => private destinations blocked).
process.env.GATEWAY_EGRESS_ALLOW_PRIVATE = process.env.GATEWAY_EGRESS_ALLOW_PRIVATE ?? 'true';
process.env.GATEWAY_EGRESS_REQUIRE_HTTPS = process.env.GATEWAY_EGRESS_REQUIRE_HTTPS ?? 'false';
