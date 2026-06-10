# Auto GDPR Reject

A Safari Web Extension that automatically rejects GDPR cookie-consent pop-ups
by clicking "Reject All" (or the closest equivalent) for you.

## Install

```sh
brew tap chadwishner/tap
brew install --cask auto-gdpr-reject
```

## Enable in Safari

1. Open the **Auto GDPR Reject** app once (it's in `/Applications`).
2. In **Safari → Settings → Extensions**, enable **Auto GDPR Reject**.
3. Grant it access to all websites ("Always Allow on Every Website") so it
   can dismiss banners everywhere.

That's it — visit any EU news site and the cookie banner should vanish on
its own within a second of appearing.

---

Curious how it works, or want to build it from source or cut a release?
See [how-to.md](how-to.md).
