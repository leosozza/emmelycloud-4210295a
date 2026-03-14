

## Plan: Replace Dock Component with New Motion-based Version

### Analysis

The current dock (`dock.tsx`) uses `framer-motion` and exports `Dock, DockIcon, DockItem, DockLabel`. It's used only in `AppLayout.tsx` for navigation.

The new component uses `motion/react` (the `motion` npm package) and has a different API: `Dock, DockCard, DockCardInner, DockDivider`. It's designed for image-based app launcher cards with bounce animations.

**Key issue**: The provided JSX in the new component is malformed/stripped — several JSX blocks are empty (`<div>` without structure). I'll reconstruct the missing JSX based on the component's logic and class references.

### Implementation

**1. Install `motion` package** (replaces `framer-motion` import path)

**2. Replace `src/components/ui/dock.tsx`** with the new component, reconstructing the missing JSX:
- `Component` (Dock): fixed bottom container with context provider
- `DockCard`: magnifying card with bounce-on-click animation and active dot indicator
- `DockCardInner`: icon container (adapted from image-based to icon-based for our nav use case)
- `DockDivider`: vertical separator

**3. Update `src/components/AppLayout.tsx`** to use the new API:
- Replace `DockItem/DockIcon/DockLabel` with `DockCard`
- Each nav item becomes a `DockCard` with the lucide icon inside
- Keep active state indicator (dot) and navigation onClick
- Keep tooltip label on hover

### Files to modify

| File | Action |
|------|--------|
| `src/components/ui/dock.tsx` | Replace with new motion-based component |
| `src/components/AppLayout.tsx` | Update imports and dock usage to new API |
| `package.json` | Add `motion` dependency |

