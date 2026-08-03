# @aegisdrive/ui

The AEGISDRIVE design system: theme tokens plus the primitives that encode
product decisions.

## What lives here, and what does not

`@aegisdrive/ui` owns **tokens and domain-aware primitives** — the pieces where
getting it wrong means two screens disagree about what "CRITICAL" looks like.

`shadcn/ui` components (Dialog, Select, Command, Popover, …) are **not** here.
shadcn's model is to copy source into the consuming app so the app owns it; that
is incompatible with vendoring them in a shared package. They are generated into
`apps/web/src/components/ui` via `components.json` and styled by the tokens this
package publishes.

The rule of thumb: if it renders a domain enum, it belongs here. If it is a
generic interaction pattern, it belongs in the app.

## Consuming the theme

```css
/* apps/web/src/index.css */
@import 'tailwindcss';
@import '@aegisdrive/ui/styles.css';

/* Tailwind only scans the importing project by default; this makes it see the
   class names used inside the design system's own components. */
@source '../../../packages/ui/src';
```

## Tokens

`src/styles/theme.css` is the single palette. Everything inside `@theme` becomes
a Tailwind utility, so there is no `tailwind.config.js` and no second copy of
the colour values in JavaScript.

`src/tokens.ts` maps domain enums (`IncidentSeverity`, `ThreatLevel`,
`VehicleStatus`, …) onto those utilities. The maps are exhaustive `Record`s, so
adding an enum member fails the build until it has been assigned a colour.

**Class names in `tokens.ts` must stay whole literal strings.** Tailwind's
scanner is static: `` `bg-severity-${value}` `` compiles locally and produces
unstyled markup in production.

## Accessibility baseline

- Every interactive primitive keeps a visible `:focus-visible` ring.
- `prefers-reduced-motion` disables the pulse, sweep and rise animations.
- Status is never communicated by colour alone — `StatusPill` always renders a
  text label beside the dot.
