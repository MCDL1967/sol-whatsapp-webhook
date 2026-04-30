# SOL v14 Property Fast Path

## Purpose

This folder documents the v14 parallel architecture work for SOL.

The goal is to add a property-configured FAST PATH layer without disrupting the current v13 production baseline.

## Core Idea

Incoming guest messages should be classified before they are sent to the conversation runtime.

If the message is deterministic, such as a menu choice, list request, numbered selection, or known trigger, middleware can respond directly from the property package.

If the message is ambiguous, conversational, or advisory, the message continues to the existing Voiceflow / Agent path.

## Safety Rule

`main` remains the current working baseline.

All v14 work happens in:

```text
feature/v14-property-fast-path
```

No existing runtime behavior should change until the feature flag is explicitly enabled.

## First Scaffold Scope

This first pass only creates:

- architecture documentation
- property package folder structure
- fast path module placeholders
- demo property data placeholders

It does not modify `webhook.js` yet.
