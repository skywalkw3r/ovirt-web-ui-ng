# PatternFly 6 Component Map

Which PF6 component backs each feature of the rebuild, plus the design-system
rules we follow. Sources: patternfly.org component overview + design pages,
PF6 token docs. Companion to `PLAN.md`.

## Ground rules (from PF6 design guidance)

1. **Design tokens only.** PF6 is token-based (`--pf-t-*`). Any custom CSS
   uses PF tokens, never hardcoded colors/spacing. All brand overrides live in
   `app/src/styles/brand-tokens.css` — one file, reviewable at a glance.
2. **Dark theme** = `pf-v6-theme-dark` class on `<html>`; default on, light
   toggle persisted per user.
3. **Deprecated components are banned:** `Chip` → use `Label`; `Tile` → use
   `Card`. Lint-guard via ESLint `no-restricted-imports`.
4. **Every data view has all four states designed:** loading (`Skeleton`),
   empty (`EmptyState` with a call-to-action), error (`EmptyState` variant +
   retry), populated. No blank screens, no raw spinners in content areas.
5. **Filters follow the Toolbar pattern** (filter controls + active-filter
   Label group + clear-all) — consistent across every list view.
6. **Red Hat fonts** ship with base.css; don't substitute.
7. Beta-status PF components require explicit sign-off before use.

## Feature → component map

### App shell & navigation (Phase 1)
| Feature | PF6 component(s) |
|---|---|
| Frame | `Page` + `Masthead` (brand, user menu) + `PageSidebar` |
| Inventory tree (folders ⇄ clusters toggle) | `TreeView` in sidebar + `ToggleGroup` for view switch |
| Section nav | `Nav` (vertical) |
| Location context | `Breadcrumb` |
| Quick-jump / actions | **custom island:** `cmdk` styled with PF tokens (PF has no palette) |
| Login (dev) | `LoginPage` + `LoginForm` |
| Errors | `EmptyState` (error variant) inside error boundary |

### VM inventory (Phase 2)
| Feature | PF6 component(s) |
|---|---|
| VM list | `Table` (composable) + `Pagination`; virtualization extension when >500 rows |
| List filtering | `Toolbar` + `SearchInput` (oVirt search DSL passthrough) + `Select` facets |
| Status | `Icon` + status colors via tokens; `Label` (status variant) in details |
| Bulk actions | `Table` row selection + `Toolbar` action group + `OverflowMenu` |
| Card/grid alt view | `Card` + `Gallery` layout |
| Quick look | `Drawer` (right panel) with `DescriptionList` |
| VM details tabs | `Tabs` + `DescriptionList`; sparklines via `@patternfly/react-charts` Sparkline |
| Create/edit VM | `Wizard`; forms via `Form` + `FormSelect`/`NumberInput`/`Switch` + `HelperText`; review step via `DescriptionList` |
| Async op feedback | `AlertGroup` (toast) + `Progress` for tracked jobs |
| Destructive confirm | `Modal` (danger variant, typed-name confirm for delete) |

### Folders & tagging (Phase 2.5 + the 2026-07 parity pass)
| Feature | PF6 component(s) |
|---|---|
| Folder tree | `TreeView` (selectable, `hasBadges` subtree VM counts, collapsed-set memory — PF expansion is uncontrolled, `defaultExpanded` can only force OPEN) |
| Drag VM/template/folder → folder | native HTML5 DnD on custom MIME channels (`useVmDragDrop`) — payloads are JSON id arrays; folder drops re-parent |
| Labels on VMs | `Label` / `LabelGroup` (color from tag description metadata) |
| Tag manager | `Modal` + nested small `Modal`s for rename/re-parent (PF6 ships no `InlineEdit`, and TreeView node names render inside its own `<button>`); the re-parent `TreeView` picker excludes the moved folder's subtree |
| Move to folder (single/bulk) | `Modal` + selectable `TreeView` ('No folder' sentinel; batches never preselect) |
| Folder deep links | loose `folder` search param + `Breadcrumb` of the ancestor chain |
| VMs & Templates view | shared `FolderTreePanel` + typed mixed `Table` (`VirtualMachineIcon`/`BlueprintIcon`) |
| Hosts & Clusters view | structural `TreeView` (kind icons, VM-count badges) + scoped VM `Table` |
| Filter by tag | `Toolbar` filter group + `LabelGroup` of active filters *(filter-bar `tag:` tokens still future work)* |
| Right-click context menus | cursor-anchored `Dropdown` (`components/context-menu/ContextMenu.tsx`: invisible fixed 1×1 toggle span; PF Popper only positions on a false→true open transition, so the primitive mount-gates `isOpen`) — folder tree, VM/template rows and infra tree nodes; row menus are the *same* `VmActionsMenu`/`TemplateActionsMenu`/`HostActionsMenu` components in `contextMenu` prop mode, so right-click and kebab can't drift |

### Hard 20% (Phase 3)
| Feature | PF6 component(s) |
|---|---|
| Console | `@patternfly/react-console` PF6-era equivalent — **verify PF6 compatibility in the Phase 1 spike**; fallback: own wrapper on `@novnc/novnc` styled with tokens |
| Snapshots | `Table` (expandable rows) or tree-ish `DataList`; preview/commit flow via `Wizard` |
| Disks / NICs tabs | `Table` + inline `ActionList`; create via `Modal` forms |
| Migration | `Modal` + `Select` (target host) + `Progress` |
| Permission-gated UI | no dedicated component — capability hook + conditional rendering; disabled-with-`Tooltip` when explain-why helps |

### Dashboard & polish (Phase 5)
| Feature | PF6 component(s) |
|---|---|
| Dashboard tiles | `Card` + `Gallery`; Donut Utilization, Sparkline charts |
| Events view | `Table` + severity `Label`; `Timestamp` for times |
| Notifications | `NotificationBadge` + `NotificationDrawer` |
| Settings | `Form` + `Switch`/`Slider`; persisted to engine user options |
| About | `AboutModal` (version, API version, links) |

## Known gaps / custom islands

| Gap | Approach |
|---|---|
| Command palette | `cmdk`, styled with PF tokens |
| react-console PF6 status | spike early (Phase 1 stretch); budget 1 wk fallback wrapper |
| Tag colors | oVirt tags have no color field — encode in description (`{"color":"#3E8635"}`), render via `Label` color prop |
