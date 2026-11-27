# In-app help

The staff app and the mobile app have built-in help in English, Sinhala and
Tamil. Each topic explains one business task in numbered steps, with a drawn
picture of the screen.

- **Context:** a **?** beside a page's heading (staff) or in a screen's header
  (mobile) opens the help on that page's topic. **Help** in the staff top bar,
  and **All help topics** in the mobile app's My account, list every topic the
  reader may see, with a search box.
- **Language:** the help opens in the app's language. Readers can switch the
  help to another language inside the help; the app's own language doesn't
  change.
- **Who sees what:** each topic names its audience (`ADMIN`, `STAFF`,
  `VERIFIER`, `CAREGIVER`, `CLIENT`, `GUEST`). Readers only see their own
  topics, and a **?** is left out where there is nothing for that reader.

## Where it lives

| | Staff app (`apps/web`) | Mobile app (`apps/mobile`) |
|---|---|---|
| Topics (screens, audience, steps, picture) | `src/help/topics.ts` | `src/help/topics.ts` |
| Words | `src/help/{en,si,ta}.json` | `src/help/{en,si,ta}.json` |
| Panel / screen | `src/components/help/help-panel.tsx` | `app/help.tsx` |
| Picture renderer | `src/components/help/help-diagram.tsx` | `src/help/HelpDiagram.tsx` |
| **?** buttons | `<HelpHint topic="…" />`, `HelpTopbarButton` | `PageHeader` (automatic), `<HelpHint topic="…" />`, `HelpLink`, `HelpMenuRow` |
| Tests | `src/__tests__/help-*.test.ts(x)` | `__tests__/help.test.tsx` |

The engine that both apps share - text lookup, matching topics to the current
path, search, and the checks - is `packages/shared/src/types/help.ts`.

## Adding or changing a topic

1. In the app's `src/help/topics.ts`, add an entry:
   - `id`: lowercase words joined by hyphens.
   - `area`: the group it is listed under.
   - `audiences`: who it is for.
   - `contexts`: the page paths it explains, such as `/bookings/[id]`.
   - `steps` and `tips`: how many of each.
   - `diagram`: optional; a description of the screen.
2. Add the words to **all three** `src/help/*.json` files, under
   `topics.<id>`: `title`, `summary`, `steps.1…n`, `tips.1…n`, and any `labels`
   the picture uses.
3. To name a button or a heading, write `[[ui:<key>]]` with the key from the
   app's own dictionary (`src/lib/i18n/en.json` or `src/i18n/en.json`). The help
   shows that key's text, in the reader's language, styled like a label. This
   keeps step text in line with the screen when a label is renamed.
4. Add `<HelpHint topic="<id>" />` beside the heading the topic explains, if the
   page doesn't already have one.
5. Run the app's tests. They fail on any of these:
   - a missing word in any language
   - an app label key that doesn't exist
   - a picture number with no matching step
   - a page path that isn't a real route
   - a **?** that points at an unknown topic
   - Sinhala or Tamil text left as an English copy

When a screen changes, update the topic's steps and picture in the same pull
request.

## Pictures

A picture is a list of simple blocks, not a screenshot. The renderer draws it
in the deployment's brand colours, with labels in the help's language:

- **Content blocks:** title, text, button, buttons, field, search, tabs, list,
  card, row, checklist, stars, badge, map.
- **Frames:** `frame: 'staff'` adds the staff menu with `nav` highlighted;
  `frame: 'phone'` adds the coloured header band and bottom tabs.
- **Numbered markers:** `callout: n` on a block puts the number `n` on it,
  matching step `n`.
- **Block text** is either:
  - `{ ui: '<key>' }`: an app label,
  - `{ label: '<name>' }`: the topic's own `labels.<name>`, for sample values,
  - `{ placeholder: 'short' | 'medium' | 'long' }`: a grey bar.

## Translations

The Sinhala and Tamil help text was drafted without a native speaker. Like the
rest of the app's strings, it needs review before release; `i18n-review/` does
not cover these files yet.
