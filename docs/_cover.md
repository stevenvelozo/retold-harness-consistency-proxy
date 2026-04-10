# Retold Harness Consistency Proxy

> Multi-backend consistency verification proxy

Fan out every HTTP request to multiple retold-harness backends in parallel and compare their responses for data consistency.

- **Parallel Fan-out** -- sends identical requests to all backends simultaneously
- **Smart Field Exclusion** -- ignores IDs, GUIDs, and timestamps during comparison
- **Auto-Discovery** -- finds running backends on default ports
- **Type Normalization** -- handles cross-database type coercions
- **JSON Envelope** -- structured consistency report with per-provider timing
- **CLI and Programmatic** -- standalone server or embedded in Node.js

[Quick Start](quick-start.md)
[API Reference](api/reference.md)
[Architecture](architecture.md)
[GitHub](https://github.com/stevenvelozo/retold-harness)
