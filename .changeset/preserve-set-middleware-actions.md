---
"@ilokesto/store": patch
---

Pass non-callable set replacements unchanged through middleware, matching
setState replacement actions so transformation and discard policies apply.
Continue protecting callable literal values from updater invocation.
