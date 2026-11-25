# UI Style Guide

This is the canonical style guide for all pages, modals, and components. Follow these rules exactly.

## Colors

- **Page background**: The golden `bg-background` (gold-300) — this is the app's signature look.
- **Cards / content panels**: `bg-white` — all cards, tables, and content containers use a pure white background.
- **Modals / dialogs**: `bg-white` — never cream, never yellow. The dialog component enforces this.
- **Modal footer**: `bg-neutral-50` with `border-t border-border/30` — a very subtle light gray, not yellow/gold.
- **Hover states on rows/cards**: `hover:bg-yellow-50` — a very light yellow, barely tinted.
- **Selected/active states**: `border-gold-400 bg-gold-400/20` — gold border with light gold fill.

## Layout

- **Max page width**: `max-w-5xl mx-auto` — all page content is capped at 5xl (1024px).
- **Page padding**: `px-4 sm:px-6 lg:px-8` — matches the nav bar.
- **Card spacing**: Use `mb-4` or `style={{ marginBottom: "1.5rem" }}` between cards. Do NOT rely on `space-y` on parent containers for card lists — it doesn't work reliably with all element types.
- **Modal max width**: `max-w-lg` for standard modals, `max-w-[920px]` only for wide/complex modals.

## Modals / Dialogs

### Backdrop / Overlay
- All modals must use `bg-black/40 backdrop-blur-sm` on the overlay. This applies to the `Dialog` component (via `DialogOverlay`) and any custom modals.
- Never use `bg-black/50`, `bg-black/60`, or `bg-black/10`. Always `bg-black/40`.
- Never omit `backdrop-blur-sm`. The blur is required for consistency.
- Prefer using the `Dialog` component which handles this automatically. If you must build a custom overlay, use: `className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"`.

### Background
- Always pure white. The `DialogContent` component uses `bg-white`.

### Close button (X)
- Always present in the top-right corner via `showCloseButton` (default true).

### Footer buttons — which pattern to use:

1. **Read-only / informational modals** (lesson detail view, read-only info):
   - Footer: single "Close" button (outline variant, right-aligned).

2. **Modals with a form / editable content** (add learner, edit client, settings):
   - Footer: "Cancel" button (outline) + "Save" / action button (primary).
   - Cancel = `DialogClose` with `variant="outline"`.
   - Save = primary `Button` with the action.

3. **Destructive confirmation modals** (delete lesson, delete client):
   - Footer: "Cancel" button (outline) + "Delete" button (destructive variant).

4. **Multi-step modals** (booking flow inside a modal):
   - Footer: "Back" (outline) + "Continue" / "Confirm" (primary).

### Footer rules:
- Buttons are always `size="sm"`.
- Footer buttons are right-aligned via `sm:justify-end` (built into `DialogFooter`).
- Never put a "Close" button when there's a Save — use "Cancel" instead.
- Never have only a "Close" button at the bottom-right of a modal that has form inputs.

## Tables

Always use the **`<DataTable>`** component (`src/components/data-table.tsx`) instead of raw `<table>` elements. It provides consistent styling, sortable columns, and empty states.

### DataTable props
- `columns`: `Column<T>[]` — column definitions (see below)
- `data`: `T[]` — the rows to render
- `rowKey`: `(row: T) => string` — unique key per row
- `onRowClick?`: `(row: T) => void` — makes rows clickable with `hover:bg-yellow-50`
- `rowClassName?`: `(row: T) => string` — conditional row classes (e.g., selected state)
- `emptyMessage?`: `string` — shown when data is empty
- `defaultSort?`: `{ key: string; direction: "asc" | "desc" }` — initial sort state
- External sort (server-side): `sortKey`, `sortDirection`, `onSort` — when `onSort` is provided, client-side sorting is disabled

### Column definition
```ts
interface Column<T> {
  key: string;           // unique column identifier
  label: string;         // header text
  sortable?: boolean;    // show sort arrows and enable click-to-sort
  align?: "left" | "right" | "center";
  header?: React.ReactNode;  // custom header (e.g., checkbox) — overrides label
  render: (row: T, index: number) => React.ReactNode;  // cell content
  sortValue?: (row: T) => string | number;  // value used for sorting
  headerClassName?: string;
  cellClassName?: string;
}
```

### Rules
- **ALL table columns should be sortable** unless they contain only actions/buttons.
- Sortable headers show a muted up-down arrow icon; active sort shows an up or down arrow.
- Always provide `sortValue` for sortable columns — it determines the sort comparison.
- For cells that need `e.stopPropagation()` (checkboxes, links inside clickable rows), wrap in `<span onClick={(e) => e.stopPropagation()}>`.
- Use `useMemo` for column arrays to avoid unnecessary re-renders.
- Do NOT build inline `<table>` elements — always use `<DataTable>`.

### Row actions
- **Row click**: Use `onRowClick` to navigate to a detail page. Do NOT add a "View Detail" button — clicking the row is the standard navigation pattern.
- **Edit button**: `<Button variant="ghost" size="sm" className="h-8 w-8 p-0">` with `<Pencil className="size-4" />`. Always `e.stopPropagation()` on click to prevent row navigation.
- **Delete button**: `<Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive">` with `<Trash2 className="size-4" />`. Always `e.stopPropagation()` on click.
- Action buttons are right-aligned in a `<div className="flex justify-end gap-1">`.
- Do NOT use text labels ("Edit", "Delete", "View Detail") for inline row actions — use icon-only ghost buttons.

### Built-in styling (do not override)
- White background: `bg-white` on the outer container.
- Rounded corners: `rounded-lg border`.
- Header row: `bg-muted/50 border-b` — subtle header tint.
- Row hover: `hover:bg-yellow-50` (clickable rows) or `hover:bg-muted/30` (non-clickable).
- Cell padding: `px-4 py-3`.

## Cards (list items)

- Background: `bg-white shadow-sm`.
- Hover: `hover:bg-yellow-50 transition-colors`.
- Spacing: `mb-4` between cards (not `space-y` on parent).
- Clickable: `cursor-pointer`.
- Border radius: default from `Card` component.

## Buttons

All buttons use the `<Button>` component (`src/components/ui/button.tsx`). Two main variants, two main sizes:

### Variants
- **Primary** (`variant="default"`, the default): Solid black background, white text. Use for the main action — "Save", "Confirm", "Continue", "Pay".
- **Secondary / Outline** (`variant="outline"`): Dark border, transparent background. Use for secondary actions — "Cancel", "Back", "History".
- Other variants exist for special cases: `ghost` (icon-only actions like edit/delete), `destructive` (delete confirmations), `link` (inline text links).

### Sizes
- **Small** (`size="sm"`): `h-8`. Use inside modals, inline forms, table rows, card footers. Example: Save/Cancel in Manage Learners edit mode, dialog footer buttons.
- **Medium** (`size="md"`): `h-11`, semibold. Use for primary page actions — booking flow steps, full-width form submissions. Example: "Continue", "Reserve & Review", "Pay & Confirm".
- **Default** (`size="default"`): `h-9`. General-purpose for nav buttons, toolbar actions. Example: "Learners (3)", "History".
- **Large** (`size="lg"`): `h-12`, semibold, larger text. Use for hero CTAs and landing page buttons.

### Rules
- Do NOT add `h-11`, `h-12`, or manual height classes to buttons — use the `size` prop instead.
- Do NOT add `border-black`, `bg-transparent`, or `hover:bg-black/5` overrides to outline buttons — the variant handles this.
- Pair primary + outline: the main action is `default` variant, the secondary action is `outline` variant.
- Full-width buttons: add `className="w-full"` alongside the size prop, not instead of it.
- Flex-grow buttons (side by side): add `className="flex-1"` alongside the size prop.

## Typography

- Page titles: `text-2xl font-bold`.
- Section titles within cards: `text-lg font-medium` or `font-semibold`.
- Body text: `text-sm`.
- Muted/secondary text: `text-muted-foreground`.
- Labels: `text-xs` or `text-sm font-medium`.

## Status Badges

Import from `@/lib/status-colors` — NEVER define inline:
- `lessonStatusColors` — confirmed, held, completed, canceled, late_cancel, no_show
- `paymentStatusColors` — succeeded, pending, failed, refunded, partially_refunded
- `goalStatusColors` — not_started, in_progress, met
- `roleColors` — superadmin, tutor, parent, student

## Date/Time Formatting

Import from `@/lib/format` — NEVER use inline `toLocaleDateString` / `toLocaleTimeString`:
- `formatLongDate(date)` → "Tuesday, November 24, 2026"
- `formatShortDate(date)` → "Tue, Nov 24"
- `formatTime(date)` → "10:45 AM"
- `formatTimeWithZone(date)` → "10:45 AM MST"
- `formatTimeRange(start, end)` → "10:45 AM – 11:45 AM MST"
- `formatCurrency(cents)` → "$100.00"

All functions accept `Date | string`. Always include timezone on the last/only time shown.

## Dropdowns / Popover Menus

All expanded dropdown menus (selects, comboboxes, pickers) must follow the same style:
- **Container**: `bg-white rounded-lg shadow-xl ring-1 ring-black/10` — white background, subtle ring, strong shadow.
- **Category/group headers**: `bg-gray-50 text-xs font-semibold uppercase tracking-wider text-navy-400 px-4 py-2 sticky top-0` — light gray background, uppercase, sticky.
- **Items**: `px-4 py-2.5 text-sm hover:bg-gold-50 transition-colors cursor-pointer` — very light gold hover.
- **Selected item**: `bg-gold-50 font-medium` — same light gold, bolded. Do NOT use `bg-primary` or dark backgrounds for selected items.
- **Empty state**: `px-4 py-6 text-center text-sm text-muted-foreground`.
- Do NOT use `bg-popover` (cream), `bg-accent` (sage), or `bg-primary` (dark navy) for dropdown backgrounds or hover states.
- The `SelectContent` component (`src/components/ui/select.tsx`) already enforces `bg-white` and `ring-1 ring-black/10`.

## Interactive Elements (Selection Chips)

For selectable options (durations, time slots, meeting links, any tappable choice):
- Use the **gold chip style**: `rounded-lg border-2 border-gold-400 bg-gold-400/20 px-3 py-1.5 text-sm font-medium`
- Hover: `hover:bg-gold-400/30`
- Unselected: `border-muted hover:bg-gold-400/10 hover:border-gold-400/30`
- Do NOT use `bg-primary` button style for these — they are selection chips, not action buttons.

## Add / Expand Buttons (Dashed Trigger)

For "Add another…" or "Add a…" actions that reveal a hidden form section:
- Use a **full-width dashed border button**: `w-full rounded-lg border-2 border-dashed border-muted p-4 text-sm text-muted-foreground hover:border-gold-400/30 hover:text-foreground transition-colors`
- Include a `<Plus>` icon inline before the label.
- Clicking it reveals the form fields inside a **bordered container** (`rounded-md border p-3 space-y-3`) with Save/Cancel buttons.
- The form should NOT be visible by default — always start collapsed behind the dashed button.
- Do NOT use `<Button variant="outline">` or a `border-t` separator for these — the dashed style is the standard pattern.

## Links (Navigation)

- **Inline text links**: `text-primary underline-offset-4 hover:underline`
- **Navigation links** (e.g., "Back to lessons"): Use `<Link>` with `text-base font-medium text-primary underline-offset-4 hover:underline`. Use an arrow prefix (← or →) for directionality. Center with `text-center`. Do NOT use `<Button>` for simple page navigation — buttons are for actions.
- **External links**: Append ↗ character to indicate new tab. Add `target="_blank" rel="noopener noreferrer"`.

## Reusable Components

Always use shared components instead of duplicating UI:

- **`<DataTable>`** (`src/components/data-table.tsx`): Sortable data table with standard styling. Use for ALL tabular data — never build inline `<table>` elements. See the **Tables** section above for full props and rules.

- **`<LessonDetailsContent>`** (`src/components/lesson-details-content.tsx`): Renders lesson detail rows (learner, tutor, date, time, format, meeting link, amount, credit, focus notes, lesson notes, price). Used in:
  - `LessonDetailModal` (details tab)
  - Booking confirmation page
  - Standalone lesson detail page (`/lessons/[id]`)
  - Props: `subjectName`, `learnerName`, `tutorName`, `startsAt`, `endsAt`, `format`, `meetingLink`, `focusNotes`, `status`, `payment`, `lessonNotes`, `priceDollars`, `showMeetingHelp`

- **`<LessonDetailModal>`** (`src/components/lesson-detail-modal.tsx`): Full lesson modal with Details + Chat tabs. Use this whenever a lesson row is clicked in a list.

- **`<GradeLevelSelect>`** (`src/components/grade-level-select.tsx`): Grade level dropdown with "Other" option. Use for ALL grade level inputs.

- **`<LoadingPlaceholder>`** (`src/components/loading-placeholder.tsx`): Standard loading state. Use instead of inline `<p>Loading...</p>`. Accepts optional `className`.

- **`<EmptyState>`** (`src/components/empty-state.tsx`): Standard empty state message. Props: `message` (string), optional `className`, optional `children` for action buttons.

- **`<ProfileForm>`** (`src/components/profile-form.tsx`): Reusable profile editing form (name, phone, timezone) wrapped in a CollapsibleCard. Props: `profileId` (string), optional `onSaved` callback. Used in:
  - Client settings page
  - Admin user detail page (Settings tab)

- **`<ChangePasswordForm>`** (`src/components/change-password-form.tsx`): Password change form with validation. Supports self-service (via Supabase auth) and admin mode (via admin API). Props: optional `profileId` (string) — when provided, uses admin API. Used in:
  - Client settings page (self mode)
  - Admin user detail page (admin mode)

- **`<ManageLearners>`** (`src/components/manage-learners.tsx`): Full learner management UI — list, edit (inline), delete, and add learners. Uses dashed "Add a Learner" trigger button. Props: `profileId` (string). Used in:
  - Settings page (inside a collapsible card)
  - Admin user detail page (Settings tab, for client users)

- **`<TutorProfileContent>`** (`src/app/(tutor)/profile/page.tsx`): Full tutor profile editing — personal info, public profile, pricing, subjects, calendar, availability, time off. Props: optional `targetProfileId` (string) — when provided, edits that user's profile instead of the logged-in user. Used in:
  - Tutor profile page (standalone)
  - Admin user detail page (Tutor Profile tab, for tutor users)

- **`<TabBar>`** (`src/components/tab-bar.tsx`): Reusable tab navigation with optional count badges. Props:
  - `tabs`: `{ key: string; label: string; count?: number }[]`
  - `activeTab`: `string` — the currently selected tab key
  - `onChange`: `(key: string) => void`
  - Active tab: `border-b-2 border-primary text-foreground` with a filled count badge (`bg-primary text-primary-foreground`)
  - Inactive tab: `text-muted-foreground` with a muted count badge (`bg-muted`)
  - Use this for any page with multiple filtered views of the same data (e.g., Lessons: Upcoming / History / All Lessons)

When adding lesson detail views, always use `<LessonDetailsContent>` — never hand-code detail rows.
When showing loading states, always use `<LoadingPlaceholder />` — never write inline loading text.
When showing empty states, always use `<EmptyState message="..." />` — never write inline empty messages.

## Forms

### Component rules — NEVER use raw HTML form elements
- **Text inputs**: Always use `<Input>` from `@/components/ui/input`. NEVER use raw `<input>`.
- **Dropdowns**: Always use `<Select>` + `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>` from `@/components/ui/select`. NEVER use raw `<select>`.
- **Text areas**: Always use `<Textarea>` from `@/components/ui/textarea`. NEVER use raw `<textarea>`.
- **Grade level**: Always use `<GradeLevelSelect>` component (dropdown with "Other" option).

### Consistent styling (built into the components)
- **Background**: All form fields use `bg-white` — inputs, selects, and textareas.
- **Border**: `border border-input` — the gold-400 border from the theme.
- **Height**: `h-8` for default inputs and selects. Do NOT override with `h-6`, `h-10`, etc.
- **Width**: Inputs and selects default to `w-full`. Only add width classes when you need a specific size.
- **Text size**: `text-sm` on md+ screens, `text-base` on mobile (built into Input).
- **Rounded corners**: `rounded-lg` on all form fields.
- **Placeholder text**: Light gray via `placeholder:text-muted-foreground` (inputs/textareas) or `data-placeholder:text-muted-foreground` (selects). NEVER override placeholder color.
- **Focus ring**: `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` — sage-colored focus ring.

### Do NOT add these className overrides to form components
- `bg-white` — already the default.
- `h-8`, `h-6`, `h-10` — use the built-in height.
- `border-input`, `border-gray-*` — use the built-in border.
- `text-sm`, `text-base`, `text-xs` on inputs — use the built-in responsive text sizing.
- `rounded-md`, `rounded-lg` — use the built-in border radius.
- `px-2.5`, `py-2` — use the built-in padding.

### Labels
- Use `<Label>` component from `@/components/ui/label`.
- `text-xs` for compact forms (modals, inline edit rows, card forms).
- `text-sm` (or no override — it's the default) for full-page forms (settings, onboarding).
- Required fields: No asterisk — just make them required in validation.
- Optional fields: Label with "(optional)" suffix.
